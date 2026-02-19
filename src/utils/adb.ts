import { execSync, ExecSyncOptions } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  AndroidDevice,
  ADBCommandError,
  ADBNotFoundError,
  APKNotFoundError,
  BatchAction,
  DeviceNotFoundError,
  NoDevicesFoundError,
  PackageNotRunningError,
  ScreenshotCaptureError,
} from '../types';

// Default timeout for ADB commands (5 seconds)
const DEFAULT_TIMEOUT = 5000;
const DEFAULT_BINARY_MAX_BUFFER = 50 * 1024 * 1024;
const INSTALL_TIMEOUT_MS = 60000;
const APK_SEARCH_DIRS = [
  'app/build/outputs/apk',
  'android/app/build/outputs/apk',
  'build/outputs/apk',
  'android/build/outputs/apk',
  'android/app/build/outputs/flutter-apk',
  'build/outputs/flutter-apk',
];
const SETTINGS_PACKAGE = 'com.android.settings';
const SETTINGS_SCREEN_ACTIONS = {
  settings: 'android.settings.SETTINGS',
  'developer-options': 'android.settings.APPLICATION_DEVELOPMENT_SETTINGS',
} as const;

const SETTINGS_SCREEN_COMPONENTS = {
  settings: [
    'com.android.settings/.Settings',
    'com.android.settings/.MainSettings',
    'com.android.settings/.Settings$SettingsDashboardActivity',
  ],
  'developer-options': [
    'com.android.settings/.DevelopmentSettings',
    'com.android.settings/.Settings$DevelopmentSettingsActivity',
    'com.android.settings/.development.DevelopmentSettingsActivity',
  ],
};

const USB_DEBUGGING_TOGGLE_LABELS = [
  'USB debugging',
  'USB-Debugging',
  'USB DEBUGGING',
  'USB Debugging',
  'USB-Debuggen',
  'USB Fehleranalyse',
  'Entwicklungsmodus',
  'Entwickleroptionen',
  'Entwickleroption',
];
const USB_DEBUGGING_DEFAULT_WAIT_MS = 500;
const USB_DEBUGGING_SCROLL_MAX = 8;
const USB_DEBUGGING_SCROLL_PERCENT = 55;
type SettingsScreen = keyof typeof SETTINGS_SCREEN_ACTIONS;

const UI_DUMP_CACHE: Record<
  string,
  { xml: string; timestamp: number; filePath: string; activity?: string; hash?: string }
> = {};

function escapeShellArg(value: string): string {
  if (process.platform === 'win32') {
    const escaped = value.replace(/"/g, '\\"');
    return /[\s"]/g.test(value) ? `"${escaped}"` : escaped;
  }

  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function encodeAdbInputText(value: string): string {
  return value.replace(/\s/g, '%s');
}

function formatSleepSeconds(durationMs: number): string {
  if (durationMs <= 0) {
    return '0';
  }

  const seconds = durationMs / 1000;
  const rounded = Math.round(seconds * 1000) / 1000;
  return rounded.toString().replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function collectApkFiles(
  dir: string,
  maxDepth: number,
  results: string[]
): void {
  if (maxDepth < 0 || !fs.existsSync(dir)) {
    return;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectApkFiles(fullPath, maxDepth - 1, results);
    } else if (entry.isFile() && entry.name.endsWith('.apk')) {
      results.push(fullPath);
    }
  }
}

function resolveProjectRoot(projectRoot?: string): string {
  return projectRoot ? path.resolve(process.cwd(), projectRoot) : process.cwd();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeActivityName(activity: string, packageName: string): string {
  if (activity.startsWith('.')) {
    return `${packageName}${activity}`;
  }

  return activity;
}

// Check if ADB is available
export function checkADBInstalled(): boolean {
  try {
    execSync('adb version', { stdio: 'pipe', timeout: DEFAULT_TIMEOUT });
    return true;
  } catch (error) {
    return false;
  }
}

// Execute ADB command with error handling
export function executeADBCommand(command: string, options: ExecSyncOptions = {}): string {
  if (!checkADBInstalled()) {
    throw new ADBNotFoundError();
  }

  const execOptions: ExecSyncOptions = {
    stdio: 'pipe',
    timeout: DEFAULT_TIMEOUT,
    maxBuffer: DEFAULT_BINARY_MAX_BUFFER,
    ...options,
  };

  try {
    const result = execSync(`adb ${command}`, execOptions);
    return result.toString('utf-8');
  } catch (error: any) {
    if (error.status === 1 && error.stdout) {
      // Some ADB commands return output on stderr even when successful
      return error.stdout.toString('utf-8');
    }
    throw new ADBCommandError('ADB_COMMAND_FAILED', `ADB command failed: ${error.message}`, {
      command,
      error: error.message,
    });
  }
}

// Execute ADB command that returns binary data
export function executeADBCommandBinary(command: string, options: ExecSyncOptions = {}): Buffer {
  if (!checkADBInstalled()) {
    throw new ADBNotFoundError();
  }

  const execOptions: ExecSyncOptions = {
    stdio: 'pipe',
    timeout: DEFAULT_TIMEOUT,
    maxBuffer: DEFAULT_BINARY_MAX_BUFFER,
    ...options,
  };

  try {
    const result = execSync(`adb ${command}`, execOptions);
    return Buffer.isBuffer(result) ? result : Buffer.from(result);
  } catch (error: any) {
    if (error.status === 1 && error.stdout) {
      // Some ADB commands return output on stderr even when successful
      const output = error.stdout;
      return Buffer.isBuffer(output) ? output : Buffer.from(output);
    }
    throw new ADBCommandError('ADB_COMMAND_FAILED', `ADB command failed: ${error.message}`, {
      command,
      error: error.message,
    });
  }
}

// Parse device list from ADB output
export function parseDeviceList(output: string): AndroidDevice[] {
  const lines = output.trim().split('\n');
  const devices: AndroidDevice[] = [];

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;

    const device: AndroidDevice = {
      id: parts[0],
      status: parts[1] as AndroidDevice['status'],
    };

    // Parse additional device information
    for (let j = 2; j < parts.length; j++) {
      const part = parts[j];
      if (part.startsWith('model:')) {
        device.model = part.substring(6);
      } else if (part.startsWith('product:')) {
        device.product = part.substring(8);
      } else if (part.startsWith('transport_id:')) {
        device.transportId = part.substring(13);
      } else if (part.startsWith('usb:')) {
        device.usb = part.substring(4);
      } else if (part.startsWith('product_string:')) {
        device.productString = part.substring(15);
      }
    }

    devices.push(device);
  }

  return devices;
}

// Get list of connected devices
export function getConnectedDevices(): AndroidDevice[] {
  try {
    const output = executeADBCommand('devices -l');
    const devices = parseDeviceList(output);

    if (devices.length === 0) {
      throw new NoDevicesFoundError();
    }

    return devices;
  } catch (error) {
    if (error instanceof NoDevicesFoundError) {
      throw error;
    }
    throw new ADBCommandError('FAILED_TO_LIST_DEVICES', 'Failed to list connected devices', {
      originalError: error instanceof Error ? error.message : String(error),
    });
  }
}

// Get the first available device
export function getFirstAvailableDevice(): AndroidDevice {
  const devices = getConnectedDevices();
  const availableDevice = devices.find(device => device.status === 'device');

  if (!availableDevice) {
    throw new ADBCommandError('NO_AVAILABLE_DEVICES', 'No available devices found', { devices });
  }

  return availableDevice;
}

export function resolveDeviceId(deviceId?: string): string {
  if (deviceId) {
    const devices = getConnectedDevices();
    const device = devices.find(d => d.id === deviceId);

    if (!device) {
      throw new DeviceNotFoundError(deviceId);
    }

    if (device.status !== 'device') {
      throw new ADBCommandError(
        'DEVICE_NOT_AVAILABLE',
        `Device '${deviceId}' is not available (status: ${device.status})`,
        { device }
      );
    }

    return deviceId;
  }

  return getFirstAvailableDevice().id;
}

export function executeADBCommandOnDevice(
  command: string,
  deviceId?: string,
  options: ExecSyncOptions = {}
): { deviceId: string; output: string } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const output = executeADBCommand(`-s ${targetDeviceId} ${command}`, options);
  return { deviceId: targetDeviceId, output };
}

export function listImes(deviceId?: string): { deviceId: string; imes: string[]; current?: string; output: string } {
  const { deviceId: targetDeviceId, output } = executeADBCommandOnDevice('shell ime list -s', deviceId);
  const imes = output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const current = getCurrentIme(targetDeviceId);
  return { deviceId: targetDeviceId, imes, current, output: output.trim() };
}

export function getCurrentIme(deviceId?: string): string | undefined {
  try {
    const { output } = executeADBCommandOnDevice(
      'shell settings get secure default_input_method',
      deviceId
    );
    const trimmed = output.trim();
    return trimmed || undefined;
  } catch {
    return undefined;
  }
}

export function enableIme(imeId: string, deviceId?: string): { deviceId: string; imeId: string; output: string } {
  const { deviceId: targetDeviceId, output } = executeADBCommandOnDevice(
    `shell ime enable ${escapeShellArg(imeId)}`,
    deviceId
  );
  return { deviceId: targetDeviceId, imeId, output: output.trim() };
}

export function setIme(imeId: string, deviceId?: string): { deviceId: string; imeId: string; output: string } {
  const { deviceId: targetDeviceId, output } = executeADBCommandOnDevice(
    `shell ime set ${escapeShellArg(imeId)}`,
    deviceId
  );
  return { deviceId: targetDeviceId, imeId, output: output.trim() };
}

export function adbKeyboardInput(
  text: string,
  deviceId?: string,
  options: { imeId?: string; setIme?: boolean; useBase64?: boolean } = {}
): { deviceId: string; imeId: string; textLength: number; output: string } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const imeId = options.imeId ?? 'com.android.adbkeyboard/.AdbIME';
  if (options.setIme !== false) {
    try {
      enableIme(imeId, targetDeviceId);
    } catch {
      // ignore enable failures; setIme may still work if already enabled
    }
    setIme(imeId, targetDeviceId);
  }

  const useBase64 = options.useBase64 !== false;
  const payload = useBase64 ? Buffer.from(text, 'utf8').toString('base64') : text;
  const action = useBase64 ? 'ADB_INPUT_B64' : 'ADB_INPUT_TEXT';
  const messageKey = useBase64 ? 'msg' : 'msg';
  const cmd = `shell am broadcast -a ${action} --es ${messageKey} ${escapeShellArg(payload)}`;
  const { output } = executeADBCommandOnDevice(cmd, targetDeviceId);

  return { deviceId: targetDeviceId, imeId, textLength: text.length, output: output.trim() };
}

export function adbKeyboardClearText(
  deviceId?: string,
  options: { imeId?: string; setIme?: boolean } = {}
): { deviceId: string; imeId: string; output: string } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const imeId = options.imeId ?? 'com.android.adbkeyboard/.AdbIME';
  if (options.setIme !== false) {
    try {
      enableIme(imeId, targetDeviceId);
    } catch {
      // ignore enable failures; setIme may still work if already enabled
    }
    setIme(imeId, targetDeviceId);
  }

  const { output } = executeADBCommandOnDevice('shell am broadcast -a ADB_CLEAR_TEXT', targetDeviceId);
  return { deviceId: targetDeviceId, imeId, output: output.trim() };
}

export function adbKeyboardInputCode(
  code: number,
  deviceId?: string,
  options: { imeId?: string; setIme?: boolean } = {}
): { deviceId: string; imeId: string; code: number; output: string } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const imeId = options.imeId ?? 'com.android.adbkeyboard/.AdbIME';
  if (options.setIme !== false) {
    try {
      enableIme(imeId, targetDeviceId);
    } catch {
      // ignore enable failures; setIme may still work if already enabled
    }
    setIme(imeId, targetDeviceId);
  }

  const { output } = executeADBCommandOnDevice(
    `shell am broadcast -a ADB_INPUT_CODE --ei code ${code}`,
    targetDeviceId
  );
  return { deviceId: targetDeviceId, imeId, code, output: output.trim() };
}

export function adbKeyboardEditorAction(
  code: number,
  deviceId?: string,
  options: { imeId?: string; setIme?: boolean } = {}
): { deviceId: string; imeId: string; code: number; output: string } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const imeId = options.imeId ?? 'com.android.adbkeyboard/.AdbIME';
  if (options.setIme !== false) {
    try {
      enableIme(imeId, targetDeviceId);
    } catch {
      // ignore enable failures; setIme may still work if already enabled
    }
    setIme(imeId, targetDeviceId);
  }

  const { output } = executeADBCommandOnDevice(
    `shell am broadcast -a ADB_EDITOR_CODE --ei code ${code}`,
    targetDeviceId
  );
  return { deviceId: targetDeviceId, imeId, code, output: output.trim() };
}

export function adbKeyboardInputChars(
  text: string,
  deviceId?: string,
  options: { imeId?: string; setIme?: boolean } = {}
): { deviceId: string; imeId: string; codepoints: number[]; output: string } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const imeId = options.imeId ?? 'com.android.adbkeyboard/.AdbIME';
  if (options.setIme !== false) {
    try {
      enableIme(imeId, targetDeviceId);
    } catch {
      // ignore enable failures; setIme may still work if already enabled
    }
    setIme(imeId, targetDeviceId);
  }

  const codepoints: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0);
    if (typeof code === 'number') {
      codepoints.push(code);
    }
  }
  const payload = codepoints.join(',');
  const { output } = executeADBCommandOnDevice(
    `shell am broadcast -a ADB_INPUT_CHARS --eia chars ${escapeShellArg(payload)}`,
    targetDeviceId
  );
  return { deviceId: targetDeviceId, imeId, codepoints, output: output.trim() };
}

type SmartLoginResult = {
  deviceId: string;
  emailFieldFound: boolean;
  passwordFieldFound: boolean;
  submitFound: boolean;
  usedIme: boolean;
  output: string[];
};

function isPasswordCandidate(node: UiNode): boolean {
  if (node.password) {
    return true;
  }
  const haystack = `${node.text} ${node.resourceId} ${node.contentDesc} ${node.className}`
    .toLowerCase()
    .trim();
  return /pass|kennwort|pwd/.test(haystack);
}

function isEmailCandidate(node: UiNode): boolean {
  const haystack = `${node.text} ${node.resourceId} ${node.contentDesc} ${node.className}`
    .toLowerCase()
    .trim();
  return /mail|e-mail|email|user|benutzer|login/.test(haystack);
}

function isTextInput(node: UiNode): boolean {
  const className = node.className.toLowerCase();
  return className.includes('edittext') || className.includes('autocompletetextview');
}

function isSubmitCandidate(node: UiNode, labels: string[]): boolean {
  const haystack = `${node.text} ${node.resourceId} ${node.contentDesc}`.toLowerCase();
  return labels.some(label => haystack.includes(label));
}

function pickBest(nodes: UiNode[], predicate: (node: UiNode) => boolean): UiNode | undefined {
  const candidates = nodes.filter(node => node.bounds && predicate(node));
  if (candidates.length === 0) {
    return undefined;
  }

  return candidates.sort((a, b) => {
    const ay = a.bounds ? a.bounds.y1 : 0;
    const by = b.bounds ? b.bounds.y1 : 0;
    return ay - by;
  })[0];
}

function pickLargest(nodes: UiNode[], predicate: (node: UiNode) => boolean): UiNode | undefined {
  const candidates = nodes.filter(node => node.bounds && predicate(node));
  if (candidates.length === 0) {
    return undefined;
  }

  return candidates.sort((a, b) => {
    const areaA =
      a.bounds ? Math.abs(a.bounds.x2 - a.bounds.x1) * Math.abs(a.bounds.y2 - a.bounds.y1) : 0;
    const areaB =
      b.bounds ? Math.abs(b.bounds.x2 - b.bounds.x1) * Math.abs(b.bounds.y2 - b.bounds.y1) : 0;
    return areaB - areaA;
  })[0];
}

function boundsArea(bounds?: { x1: number; y1: number; x2: number; y2: number }): number {
  if (!bounds) return 0;
  return Math.abs(bounds.x2 - bounds.x1) * Math.abs(bounds.y2 - bounds.y1);
}

function containsBounds(
  outer?: { x1: number; y1: number; x2: number; y2: number },
  inner?: { x1: number; y1: number; x2: number; y2: number }
): boolean {
  if (!outer || !inner) return false;
  return (
    inner.x1 >= outer.x1 &&
    inner.y1 >= outer.y1 &&
    inner.x2 <= outer.x2 &&
    inner.y2 <= outer.y2
  );
}

function boundsEqual(
  left?: { x1: number; y1: number; x2: number; y2: number },
  right?: { x1: number; y1: number; x2: number; y2: number }
): boolean {
  if (!left || !right) return false;
  return (
    left.x1 === right.x1 &&
    left.y1 === right.y1 &&
    left.x2 === right.x2 &&
    left.y2 === right.y2
  );
}

function findClickableContainer(nodes: UiNode[], target: UiNode): UiNode | undefined {
  if (target.clickable) return target;
  if (!target.bounds) return undefined;
  const candidates = nodes.filter(
    node =>
      node !== target &&
      node.bounds &&
      node.clickable &&
      containsBounds(node.bounds, target.bounds)
  );
  if (candidates.length === 0) return undefined;
  return candidates.sort((a, b) => {
    const areaA =
      a.bounds ? Math.abs(a.bounds.x2 - a.bounds.x1) * Math.abs(a.bounds.y2 - a.bounds.y1) : 0;
    const areaB =
      b.bounds ? Math.abs(b.bounds.x2 - b.bounds.x1) * Math.abs(b.bounds.y2 - b.bounds.y1) : 0;
    return areaA - areaB;
  })[0];
}

type TapTargetSelection = {
  node: UiNode;
  usedFallback: boolean;
  fallbackReason?: 'direct' | 'clickable_container' | 'nearest_clickable' | 'no_bounds';
};

function resolveTapTarget(nodes: UiNode[], target: UiNode): TapTargetSelection {
  if (target.clickable) {
    return { node: target, usedFallback: false, fallbackReason: 'direct' };
  }

  const container = findClickableContainer(nodes, target);
  if (container) {
    return { node: container, usedFallback: true, fallbackReason: 'clickable_container' };
  }

  if (!target.bounds) {
    return { node: target, usedFallback: true, fallbackReason: 'no_bounds' };
  }

  const targetCenter = centerOfBounds(target.bounds);
  const clickableCandidates = nodes.filter(node => node.clickable && node.bounds);
  if (clickableCandidates.length === 0) {
    return { node: target, usedFallback: true, fallbackReason: 'no_bounds' };
  }

  let nearest = clickableCandidates[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of clickableCandidates) {
    if (!candidate.bounds) {
      continue;
    }
    const candidateCenter = centerOfBounds(candidate.bounds);
    const distance = Math.hypot(candidateCenter.x - targetCenter.x, candidateCenter.y - targetCenter.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = candidate;
    }
  }

  return { node: nearest, usedFallback: true, fallbackReason: 'nearest_clickable' };
}

function pickTextInputs(nodes: UiNode[]): UiNode[] {
  return nodes
    .filter(node => node.bounds && isTextInput(node))
    .sort((a, b) => {
      const ay = a.bounds ? a.bounds.y1 : 0;
      const by = b.bounds ? b.bounds.y1 : 0;
      return ay - by;
    });
}

export function detectLoginFields(options: {
  deviceId?: string;
  submitLabels?: string[];
}): {
  deviceId: string;
  emailField?: UiNode;
  passwordField?: UiNode;
  submitButton?: UiNode;
} {
  const targetDeviceId = resolveDeviceId(options.deviceId);
  const { xml } = dumpUiHierarchy(targetDeviceId);
  const nodes = extractUiNodes(xml);
  const submitLabels =
    options.submitLabels ?? ['anmelden', 'login', 'sign in', 'weiter', 'continue'];

  const textInputs = pickTextInputs(nodes);
  let passwordField = pickBest(textInputs, isPasswordCandidate) ?? pickBest(nodes, isPasswordCandidate);
  let emailField = pickBest(textInputs, isEmailCandidate) ?? pickBest(nodes, isEmailCandidate);

  if (!passwordField && textInputs.length >= 2) {
    passwordField = textInputs[textInputs.length - 1];
  }

  if (!emailField && textInputs.length >= 1) {
    emailField = textInputs.find(node => node !== passwordField) ?? textInputs[0];
  }

  if (emailField && passwordField) {
    const sameTarget =
      emailField === passwordField || boundsEqual(emailField.bounds, passwordField.bounds);
    if (sameTarget && textInputs.length >= 2) {
      emailField = textInputs[0];
      passwordField = textInputs[textInputs.length - 1];
    }
  }

  const passwordBounds = passwordField?.bounds;
  if (passwordBounds && textInputs.length > 0) {
    const abovePassword = textInputs.filter(
      node =>
        node !== passwordField &&
        node.bounds &&
        node.bounds.y1 <= passwordBounds.y1
    );
    if (abovePassword.length > 0) {
      emailField = abovePassword[abovePassword.length - 1];
    }
  }

  if (emailField && passwordField && emailField.bounds && passwordField.bounds) {
    if (emailField.bounds.y1 > passwordField.bounds.y1) {
      const swap = emailField;
      emailField = passwordField;
      passwordField = swap;
    }
  }

  const submitMinY = passwordBounds ? passwordBounds.y2 - 4 : 0;
  const submitTextNode = pickBest(
    nodes,
    node =>
      !isTextInput(node) &&
      node.bounds !== undefined &&
      node.bounds.y1 >= submitMinY &&
      isSubmitCandidate(node, submitLabels)
  );

  const submitFromContainer = submitTextNode
    ? findClickableContainer(nodes, submitTextNode)
    : undefined;

  const submitButton =
    submitFromContainer ??
    pickLargest(
      nodes,
      node =>
        !isTextInput(node) &&
        node.bounds !== undefined &&
        node.bounds.y1 >= submitMinY &&
        isSubmitCandidate(node, submitLabels) &&
        (node.clickable || node.className.toLowerCase().includes('button'))
    ) ??
    pickLargest(nodes, node =>
      !isTextInput(node) &&
      node.bounds !== undefined &&
      node.bounds.y1 >= submitMinY &&
      node.clickable &&
      node.className.toLowerCase().includes('button')
    ) ??
    pickLargest(nodes, node =>
      !isTextInput(node) &&
      node.bounds !== undefined &&
      node.bounds.y1 >= submitMinY &&
      node.clickable &&
      isSubmitCandidate(node, submitLabels)
    );

  if (!submitButton && passwordBounds) {
    const fallbackCandidates = nodes.filter(
      node =>
        node.bounds &&
        node.clickable &&
        node.bounds.y1 >= submitMinY &&
        !isTextInput(node)
    );
    if (fallbackCandidates.length === 1) {
      return { deviceId: targetDeviceId, emailField, passwordField, submitButton: fallbackCandidates[0] };
    }
    if (fallbackCandidates.length > 1) {
      const sorted = [...fallbackCandidates].sort(
        (a, b) => boundsArea(b.bounds) - boundsArea(a.bounds)
      );
      const top = sorted[0];
      const second = sorted[1];
      if (top && (!second || boundsArea(top.bounds) >= boundsArea(second.bounds) * 1.4)) {
        return { deviceId: targetDeviceId, emailField, passwordField, submitButton: top };
      }
    }
  }

  return { deviceId: targetDeviceId, emailField, passwordField, submitButton };
}

export function smartLogin(options: {
  deviceId?: string;
  email: string;
  password: string;
  submitLabels?: string[];
  imeId?: string;
  hideKeyboard?: boolean;
  submitFallback?: boolean;
}): SmartLoginResult {
  const targetDeviceId = resolveDeviceId(options.deviceId);
  const output: string[] = [];
  const { emailField, passwordField, submitButton } = detectLoginFields({
    deviceId: targetDeviceId,
    submitLabels: options.submitLabels,
  });

  let usedIme = false;

  if (emailField) {
    tapUiNode(targetDeviceId, emailField);
    try {
      const imeResult = adbKeyboardInput(options.email, targetDeviceId, {
        imeId: options.imeId,
        setIme: true,
        useBase64: true,
      });
      usedIme = true;
      output.push(imeResult.output);
    } catch (error: any) {
      const res = inputText(options.email, targetDeviceId);
      output.push(res.output);
    }
  }

  if (passwordField) {
    tapUiNode(targetDeviceId, passwordField);
    try {
      const imeResult = adbKeyboardInput(options.password, targetDeviceId, {
        imeId: options.imeId,
        setIme: true,
        useBase64: true,
      });
      usedIme = true;
      output.push(imeResult.output);
    } catch (error: any) {
      const res = inputText(options.password, targetDeviceId);
      output.push(res.output);
    }
  }

  if (options.hideKeyboard !== false) {
    sendKeyevent('4', targetDeviceId);
  }

  if (submitButton) {
    tapUiNode(targetDeviceId, submitButton);
  } else if (options.submitFallback !== false) {
    if (usedIme) {
      const actionResult = adbKeyboardEditorAction(6, targetDeviceId, {
        imeId: options.imeId,
        setIme: true,
      });
      output.push(actionResult.output);
    }
    const enter = sendKeyevent('66', targetDeviceId);
    output.push(enter.output);
  }

  return {
    deviceId: targetDeviceId,
    emailFieldFound: Boolean(emailField),
    passwordFieldFound: Boolean(passwordField),
    submitFound: Boolean(submitButton),
    usedIme,
    output,
  };
}

export function smartLoginFast(options: {
  deviceId?: string;
  email: string;
  password: string;
  submitLabels?: string[];
  hideKeyboard?: boolean;
  useAdbKeyboard?: boolean;
  submitFallback?: boolean;
}): SmartLoginResult {
  const targetDeviceId = resolveDeviceId(options.deviceId);
  const { emailField, passwordField, submitButton } = detectLoginFields({
    deviceId: targetDeviceId,
    submitLabels: options.submitLabels,
  });

  const output: string[] = [];
  let usedIme = false;

  if (options.useAdbKeyboard) {
    if (emailField) {
      tapUiNode(targetDeviceId, emailField);
      adbKeyboardClearText(targetDeviceId, { setIme: true });
      const imeResult = adbKeyboardInput(options.email, targetDeviceId, {
        setIme: true,
        useBase64: true,
      });
      usedIme = true;
      output.push(imeResult.output);
    }
    if (passwordField) {
      tapUiNode(targetDeviceId, passwordField);
      adbKeyboardClearText(targetDeviceId, { setIme: true });
      const imeResult = adbKeyboardInput(options.password, targetDeviceId, {
        setIme: true,
        useBase64: true,
      });
      usedIme = true;
      output.push(imeResult.output);
    }
  } else {
    const actions: BatchAction[] = [];
    if (emailField?.bounds) {
      const { x, y } = centerOfBounds(emailField.bounds);
      actions.push({ type: 'tap', x, y });
      actions.push({ type: 'text', text: options.email });
    }
    if (passwordField?.bounds) {
      const { x, y } = centerOfBounds(passwordField.bounds);
      actions.push({ type: 'tap', x, y });
      actions.push({ type: 'text', text: options.password });
    }
    if (options.hideKeyboard !== false) {
      actions.push({ type: 'keyevent', keyCode: '4' });
    }

    if (actions.length > 0) {
      const result = batchInputActions(actions, targetDeviceId);
      output.push(result.output);
    }

    if (submitButton?.bounds) {
      if (options.hideKeyboard !== false) {
        executeADBCommand(`-s ${targetDeviceId} shell sleep 0.2`);
      }
      tapUiNode(targetDeviceId, submitButton);
    }
  }

  if (!options.useAdbKeyboard && options.hideKeyboard !== false && !submitButton?.bounds) {
    sendKeyevent('4', targetDeviceId);
  }

  if (submitButton && options.useAdbKeyboard) {
    tapUiNode(targetDeviceId, submitButton);
  } else if (!submitButton && options.submitFallback !== false) {
    if (options.useAdbKeyboard) {
      const actionResult = adbKeyboardEditorAction(6, targetDeviceId, { setIme: true });
      output.push(actionResult.output);
    }
    const enter = sendKeyevent('66', targetDeviceId);
    output.push(enter.output);
  }

  return {
    deviceId: targetDeviceId,
    emailFieldFound: Boolean(emailField),
    passwordFieldFound: Boolean(passwordField),
    submitFound: Boolean(submitButton),
    usedIme,
    output,
  };
}

// Capture screenshot from a device
export function captureScreenshot(deviceId?: string): Buffer {
  try {
    const targetDeviceId = resolveDeviceId(deviceId);

    // Capture screenshot using binary command execution
    const command = `-s ${targetDeviceId} exec-out screencap -p`;
    const screenshotData = executeADBCommandBinary(command);

    if (!screenshotData || screenshotData.length === 0) {
      throw new ScreenshotCaptureError(targetDeviceId);
    }

    return screenshotData;
  } catch (error) {
    if (error instanceof ADBCommandError) {
      throw error;
    }
    throw new ScreenshotCaptureError(
      deviceId || 'unknown',
      error instanceof Error ? error : undefined
    );
  }
}

export function dumpUiHierarchy(
  deviceId?: string,
  options: {
    maxChars?: number;
    cache?: boolean;
    maxAgeMs?: number;
    invalidateOnActivityChange?: boolean;
  } = {}
): { deviceId: string; xml: string; length: number; truncated?: boolean; filePath: string } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const maxAgeMs = options.maxAgeMs ?? 750;
  const invalidateOnActivityChange = options.invalidateOnActivityChange !== false;
  const cached = options.cache ? UI_DUMP_CACHE[targetDeviceId] : undefined;

  if (cached) {
    const ageMs = Date.now() - cached.timestamp;
    if (ageMs <= maxAgeMs) {
      if (invalidateOnActivityChange && cached.activity) {
        const current = getCurrentActivity(targetDeviceId);
        const currentActivity = current.component ?? current.activity ?? '';
        if (currentActivity && currentActivity !== cached.activity) {
          // ignore cache; activity changed
        } else {
          const xml = cached.xml;
          if (options.maxChars && xml.length > options.maxChars) {
            return {
              deviceId: targetDeviceId,
              xml: xml.slice(0, options.maxChars),
              length: options.maxChars,
              truncated: true,
              filePath: cached.filePath,
            };
          }
          return {
            deviceId: targetDeviceId,
            xml,
            length: xml.length,
            filePath: cached.filePath,
          };
        }
      } else {
        const xml = cached.xml;
        if (options.maxChars && xml.length > options.maxChars) {
          return {
            deviceId: targetDeviceId,
            xml: xml.slice(0, options.maxChars),
            length: options.maxChars,
            truncated: true,
            filePath: cached.filePath,
          };
        }
        return {
          deviceId: targetDeviceId,
          xml,
          length: xml.length,
          filePath: cached.filePath,
        };
      }
    }
  }

  const filePath = '/sdcard/mcp_ui.xml';
  executeADBCommand(`-s ${targetDeviceId} shell uiautomator dump ${escapeShellArg(filePath)}`, {
    timeout: 10000,
  });

  const output = executeADBCommand(`-s ${targetDeviceId} exec-out cat ${escapeShellArg(filePath)}`, {
    timeout: 10000,
  });

  executeADBCommand(`-s ${targetDeviceId} shell rm ${escapeShellArg(filePath)}`);

  const xml = output.trim();
  if (!xml) {
    throw new ADBCommandError(
      'UI_DUMP_FAILED',
      `Failed to dump UI hierarchy from device '${targetDeviceId}'`,
      { deviceId: targetDeviceId }
    );
  }

  const recordActivity = options.cache === true || options.invalidateOnActivityChange === true;
  const currentActivity = recordActivity
    ? (() => {
        try {
          const current = getCurrentActivity(targetDeviceId);
          return current.component ?? current.activity ?? '';
        } catch {
          return '';
        }
      })()
    : '';

  UI_DUMP_CACHE[targetDeviceId] = {
    xml,
    timestamp: Date.now(),
    filePath,
    activity: currentActivity || undefined,
    hash: hashString(xml),
  };

  if (options.maxChars && xml.length > options.maxChars) {
    return {
      deviceId: targetDeviceId,
      xml: xml.slice(0, options.maxChars),
      length: options.maxChars,
      truncated: true,
      filePath,
    };
  }

  return {
    deviceId: targetDeviceId,
    xml,
    length: xml.length,
    filePath,
  };
}

// Get device information
export function getDeviceInfo(deviceId: string): Partial<AndroidDevice> {
  try {
    const devices = getConnectedDevices();
    const device = devices.find(d => d.id === deviceId);

    if (!device) {
      throw new DeviceNotFoundError(deviceId);
    }

    return device;
  } catch (error) {
    if (error instanceof DeviceNotFoundError) {
      throw error;
    }
    throw new ADBCommandError(
      'FAILED_TO_GET_DEVICE_INFO',
      `Failed to get device info for '${deviceId}'`,
      { originalError: error instanceof Error ? error.message : String(error) }
    );
  }
}

export function listInstalledPackages(
  deviceId?: string,
  options: {
    filter?: string;
    thirdPartyOnly?: boolean;
    systemOnly?: boolean;
    disabledOnly?: boolean;
    enabledOnly?: boolean;
    includeUninstalled?: boolean;
    user?: string | number;
  } = {}
): { deviceId: string; packages: string[]; output: string } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const flags: string[] = [];
  if (options.thirdPartyOnly) flags.push('-3');
  if (options.systemOnly) flags.push('-s');
  if (options.disabledOnly) flags.push('-d');
  if (options.enabledOnly) flags.push('-e');
  if (options.includeUninstalled) flags.push('-u');
  if (options.user !== undefined) flags.push(`--user ${options.user}`);
  const filterArg = options.filter ? ` ${escapeShellArg(options.filter)}` : '';
  const { output } = executeADBCommandOnDevice(
    `shell pm list packages ${flags.join(' ')}${filterArg}`.trim(),
    targetDeviceId,
    { timeout: 10000 }
  );
  const packages = output
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('package:'))
    .map(line => line.replace(/^package:/, '').trim());
  return { deviceId: targetDeviceId, packages, output: output.trim() };
}

export function isAppInstalled(
  packageName: string,
  deviceId?: string
): { deviceId: string; packageName: string; installed: boolean; path?: string } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const { output } = executeADBCommandOnDevice(
    `shell pm path ${escapeShellArg(packageName)}`,
    targetDeviceId,
    { timeout: 8000 }
  );
  const lines = output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const pathLine = lines.find(line => line.startsWith('package:'));
  return {
    deviceId: targetDeviceId,
    packageName,
    installed: Boolean(pathLine),
    path: pathLine ? pathLine.replace(/^package:/, '').trim() : undefined,
  };
}

export function getAppVersion(
  packageName: string,
  deviceId?: string
): { deviceId: string; packageName: string; versionName?: string; versionCode?: string; output: string } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const { output } = executeADBCommandOnDevice(
    `shell dumpsys package ${escapeShellArg(packageName)}`,
    targetDeviceId,
    { timeout: 10000 }
  );
  const versionNameMatch = output.match(/versionName=([^\s]+)/);
  const versionCodeMatch = output.match(/versionCode=(\\d+)(?:\\s|minSdk|targetSdk)/);
  return {
    deviceId: targetDeviceId,
    packageName,
    versionName: versionNameMatch ? versionNameMatch[1] : undefined,
    versionCode: versionCodeMatch ? versionCodeMatch[1] : undefined,
    output: output.trim(),
  };
}

export function getAndroidProperty(
  property: string,
  deviceId?: string
): { deviceId: string; property: string; value: string } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const { output } = executeADBCommandOnDevice(
    `shell getprop ${escapeShellArg(property)}`,
    targetDeviceId
  );
  return { deviceId: targetDeviceId, property, value: output.trim() };
}

export function getAndroidProperties(
  deviceId?: string,
  options: { prefix?: string } = {}
): { deviceId: string; properties: Record<string, string>; output: string } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const { output } = executeADBCommandOnDevice('shell getprop', targetDeviceId);
  const properties: Record<string, string> = {};
  output
    .split('\n')
    .map(line => line.trim())
    .forEach(line => {
      const match = line.match(/^\[([^\]]+)\]: \[(.*)\]$/);
      if (!match) return;
      const key = match[1];
      const value = match[2];
      if (!options.prefix || key.startsWith(options.prefix)) {
        properties[key] = value;
      }
    });
  return { deviceId: targetDeviceId, properties, output: output.trim() };
}

function normalizeSettingsComponent(activity: string, packageName = SETTINGS_PACKAGE): string {
  const trimmed = activity.trim();
  if (trimmed.includes('/')) {
    return trimmed;
  }

  if (trimmed.startsWith('.')) {
    return `${packageName}/${trimmed}`;
  }

  if (trimmed.includes('.')) {
    return `${packageName}/${trimmed}`;
  }

  return `${packageName}/${packageName}.${trimmed}`;
}

function normalizeChromeActivity(activity: string, packageName = 'com.android.chrome'): string {
  const trimmed = activity.trim();
  if (trimmed.includes('/')) {
    return trimmed;
  }

  if (trimmed.startsWith('.')) {
    return `${packageName}${trimmed}`;
  }

  if (trimmed.includes('.')) {
    return `${packageName}/${trimmed}`;
  }

  return `${packageName}/${packageName}.${trimmed}`;
}

function getSettingValueRaw(targetDeviceId: string, namespace: 'global' | 'secure', key: string): string {
  try {
    const { output } = executeADBCommandOnDevice(
      `shell settings get ${namespace} ${escapeShellArg(key)}`,
      targetDeviceId,
      { timeout: 8000 }
    );
    const raw = output.trim();
    if (!raw) {
      return 'unknown';
    }

    return raw;
  } catch (error: any) {
    return `error: ${error?.message ?? String(error)}`;
  }
}

function parseSettingBoolean(raw: string): boolean | undefined {
  const normalized = raw.trim().toLowerCase();
  if (!normalized || normalized.startsWith('error:') || normalized === 'unknown' || normalized === 'null') {
    return undefined;
  }

  if (['1', 'true', 'on', 'yes', 'enabled', 'enable'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'off', 'no', 'disabled', 'disable'].includes(normalized)) {
    return false;
  }

  return undefined;
}

export function getUsbDebuggingState(
  deviceId?: string
): {
  deviceId: string;
  adbEnabled: boolean | undefined;
  developmentSettingsEnabled: boolean | undefined;
  adbEnabledRaw: string;
  developmentSettingsEnabledRaw: string;
} {
  const targetDeviceId = resolveDeviceId(deviceId);
  const adbEnabledRaw = getSettingValueRaw(targetDeviceId, 'global', 'adb_enabled');
  const developmentSettingsEnabledRaw = getSettingValueRaw(
    targetDeviceId,
    'secure',
    'development_settings_enabled'
  );
  return {
    deviceId: targetDeviceId,
    adbEnabled: parseSettingBoolean(adbEnabledRaw),
    developmentSettingsEnabled: parseSettingBoolean(developmentSettingsEnabledRaw),
    adbEnabledRaw,
    developmentSettingsEnabledRaw,
  };
}

export function openAndroidSettings(
  screen: SettingsScreen = 'settings',
  deviceId?: string,
  activity?: string,
  waitForReadyMs?: number
): { deviceId: string; screen: string; activity: string; output: string } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const outputParts: string[] = [];
  const waitMs = typeof waitForReadyMs === 'number' && waitForReadyMs > 0 ? waitForReadyMs : USB_DEBUGGING_DEFAULT_WAIT_MS;
  const components = SETTINGS_SCREEN_COMPONENTS[screen];
  const action = SETTINGS_SCREEN_ACTIONS[screen];
  let launchedActivity = activity ? normalizeSettingsComponent(activity, SETTINGS_PACKAGE) : undefined;
  let launchOutput = '';

  if (activity) {
    const normalizedActivity = normalizeSettingsComponent(activity, SETTINGS_PACKAGE);
    const result = executeADBCommandOnDevice(
      `shell am start -n ${escapeShellArg(normalizedActivity)}`,
      targetDeviceId
    );
    launchOutput = result.output.trim();
    launchedActivity = normalizedActivity;
    outputParts.push(`launched activity: ${normalizedActivity}`);
  } else {
    try {
      const result = executeADBCommandOnDevice(`shell am start -a ${action}`, targetDeviceId);
      launchOutput = result.output.trim();
      outputParts.push(`launched action: ${action}`);
    } catch (error: any) {
      outputParts.push(`action launch failed: ${action}: ${error?.message ?? String(error)}`);
      const attemptErrors: string[] = [];

      for (const candidate of components) {
        try {
          const result = executeADBCommandOnDevice(
            `shell am start -n ${escapeShellArg(candidate)}`,
            targetDeviceId
          );
          launchedActivity = candidate;
          launchOutput = result.output.trim();
          outputParts.push(`opened component fallback: ${candidate}`);
          break;
        } catch (candidateError: any) {
          attemptErrors.push(`${candidate}: ${candidateError?.message ?? String(candidateError)}`);
        }
      }

      if (!launchedActivity) {
        throw new ADBCommandError(
          'SETTINGS_OPEN_FAILED',
          `Failed to open settings screen '${screen}'`,
          {
            screen,
            action,
            componentAttempts: attemptErrors,
          }
        );
      }

      if (attemptErrors.length > 0) {
        outputParts.push(`component attempts: ${attemptErrors.join('; ')}`);
      }
    }
  }

  if (waitMs > 0) {
    executeADBCommandOnDevice(`shell sleep ${formatSleepSeconds(waitMs)}`, targetDeviceId);
    outputParts.push(`waited ${waitMs}ms for ready state`);
  }

  const current = getCurrentActivity(targetDeviceId);
  const resolvedActivity =
    current.activity ??
    current.component ??
    current.packageName ??
    launchedActivity ??
    action ??
    screen;

  const output = [launchOutput, ...outputParts].filter(Boolean).join('\n');
  return {
    deviceId: targetDeviceId,
    screen,
    activity: resolvedActivity,
    output,
  };
}

function isUsbStateAligned(state: ReturnType<typeof getUsbDebuggingState>, requested: boolean): boolean {
  if (state.adbEnabled === undefined || state.adbEnabled !== requested) {
    return false;
  }

  if (state.developmentSettingsEnabled === undefined) {
    return true;
  }

  return state.developmentSettingsEnabled === requested;
}

function findUsbDebuggingNode(
  nodes: UiNode[],
  requestedEnabled: boolean
): UiNode | undefined {
  const normalizedLabels = USB_DEBUGGING_TOGGLE_LABELS.map(label => label.toLowerCase());
  const labelCandidates = nodes.filter(node => {
    const haystack = `${node.text} ${node.contentDesc} ${node.resourceId}`.toLowerCase();
    return normalizedLabels.some(label => haystack.includes(label));
  });

  if (labelCandidates.length > 0) {
    const preferred = labelCandidates.find(
      node => typeof node.checked === 'boolean' && node.checked !== requestedEnabled
    );
    return preferred ?? labelCandidates[0];
  }

  const controlCandidates = nodes.filter(node => {
    const className = node.className.toLowerCase();
    const hasSwitchControl =
      className.includes('switch') ||
      className.includes('checkbox') ||
      node.resourceId.includes('switch_widget') ||
      node.resourceId.includes('checkbox');
    return hasSwitchControl && (node.text || node.contentDesc || node.resourceId);
  });

  if (controlCandidates.length === 0) {
    return undefined;
  }

  const preferred = controlCandidates.find(
    node => typeof node.checked === 'boolean' && node.checked !== requestedEnabled
  );
  return preferred ?? controlCandidates[0];
}

function findUsbDebuggingNodeWithScroll(
  targetDeviceId: string,
  requestedEnabled: boolean
): { node?: UiNode; scrolls: number } {
  let scrolls = 0;

  for (let attempt = 0; attempt <= USB_DEBUGGING_SCROLL_MAX; attempt += 1) {
    const { xml } = dumpUiHierarchy(targetDeviceId, { maxChars: 500000 });
    const nodes = extractUiNodes(xml);
    const target = findUsbDebuggingNode(nodes, requestedEnabled);
    if (target) {
      return { node: target, scrolls: attempt };
    }

    if (attempt < USB_DEBUGGING_SCROLL_MAX) {
      const previousHash = dumpUiHierarchy(targetDeviceId, { maxChars: 500000 }).xml;
      scrollVertical('down', targetDeviceId, { distancePercent: USB_DEBUGGING_SCROLL_PERCENT });
      executeADBCommandOnDevice(`shell sleep ${formatSleepSeconds(200)}`, targetDeviceId);
      scrolls = attempt + 1;
      const currentXml = dumpUiHierarchy(targetDeviceId, { maxChars: 500000 }).xml;
      if (currentXml === previousHash) {
        // avoid endless retries when list cannot scroll anymore
        break;
      }
    }
  }

  return { node: undefined, scrolls };
}

function toggleUsbDebuggingViaUi(targetDeviceId: string, requestedEnabled: boolean): string {
  const found = findUsbDebuggingNodeWithScroll(targetDeviceId, requestedEnabled);
  if (!found.node) {
    throw new ADBCommandError(
      'USB_DEBUGGING_TOGGLE_NOT_FOUND',
      'USB debugging toggle not found in developer options',
      {
        targetDeviceId,
        requestedEnabled,
        scrolls: found.scrolls,
      }
    );
  }

  const target = found.node;
  const selection = resolveTapTarget(extractUiNodes(dumpUiHierarchy(targetDeviceId).xml), target);
  if (!selection.node.bounds) {
    throw new ADBCommandError('USB_DEBUGGING_TOGGLE_NO_BOUNDS', 'USB debugging toggle has no bounds', {
      targetDeviceId,
      node: target,
      scrolls: found.scrolls,
    });
  }

  const { x, y, output } = tapUiNode(targetDeviceId, selection.node);
  return `tapped usb debugging toggle at (${x}, ${y}); node="${target.text || target.contentDesc || target.resourceId}"; output="${output}"; scrolls=${found.scrolls}`;
}

export function openUrlInChrome(
  url: string,
  deviceId?: string,
  options: {
    browserPackage?: string;
    browserActivity?: string;
    fallbackToDefault?: boolean;
    waitForReadyMs?: number;
  } = {}
): {
  deviceId: string;
  url: string;
  browserPackage: string;
  browserActivity: string;
  browserInstalled: boolean;
  strategy: string;
  output: string;
} {
  const targetDeviceId = resolveDeviceId(deviceId);
  const browserPackage = options.browserPackage ?? 'com.android.chrome';
  const browserActivity = options.browserActivity ?? 'com.google.android.apps.chrome.Main';
  const waitMs = typeof options.waitForReadyMs === 'number' && options.waitForReadyMs > 0 ? options.waitForReadyMs : 0;
  const fallbackToDefault = options.fallbackToDefault !== false;
  const packageInfo = isAppInstalled(browserPackage, targetDeviceId);
  const component = normalizeChromeActivity(browserActivity, browserPackage);
  const steps: string[] = [];

  let output = '';
  let strategy = 'chrome-explicit';

  if (packageInfo.installed) {
    try {
      const result = executeADBCommandOnDevice(
        `shell am start -n ${escapeShellArg(component)} -a android.intent.action.VIEW -d ${escapeShellArg(url)}`,
        targetDeviceId,
        { timeout: 10000 }
      );
      output = result.output.trim();
      steps.push(`launched ${component}`);
    } catch (error: any) {
      steps.push(`chrome explicit launch failed: ${error?.message ?? String(error)}`);
      if (!fallbackToDefault) {
        throw error;
      }
      const fallback = openUrl(url, targetDeviceId);
      return {
        deviceId: targetDeviceId,
        url,
        browserPackage,
        browserActivity: 'default-intent',
        browserInstalled: true,
        strategy: 'chrome-explicit-fallback',
        output: [...steps, fallback.output].filter(Boolean).join('\n'),
      };
    }
  } else if (fallbackToDefault) {
    const fallback = openUrl(url, targetDeviceId);
    return {
      deviceId: targetDeviceId,
      url,
      browserPackage,
      browserActivity: 'default-intent',
      browserInstalled: false,
      strategy: 'default-intent',
      output: [fallback.output, 'chrome package not installed, used default intent'].join('\n'),
    };
  } else {
    throw new ADBCommandError(
      'BROWSER_APP_NOT_FOUND',
      `Browser package '${browserPackage}' not installed`,
      { packageName: browserPackage, deviceId: targetDeviceId }
    );
  }

  if (waitMs > 0) {
    executeADBCommandOnDevice(`shell sleep ${formatSleepSeconds(waitMs)}`, targetDeviceId);
    steps.push(`waited ${waitMs}ms`);
  }

  const outputText = [...steps, output].filter(Boolean).join('\n');
  return {
    deviceId: targetDeviceId,
    url,
    browserPackage,
    browserActivity: component,
    browserInstalled: true,
    strategy,
    output: outputText,
  };
}

export function openChromeUrlAndLogin(input: {
  url: string;
  email: string;
  password: string;
  deviceId?: string;
  browserPackage?: string;
  browserActivity?: string;
  fallbackToDefault?: boolean;
  waitForReadyMs?: number;
  submitLabels?: string[];
  imeId?: string;
  hideKeyboard?: boolean;
  useAdbKeyboard?: boolean;
  submitFallback?: boolean;
}): {
  deviceId: string;
  url: string;
  openResult: ReturnType<typeof openUrlInChrome>;
  loginResult: {
    deviceId: string;
    emailFieldFound: boolean;
    passwordFieldFound: boolean;
    submitFound: boolean;
    usedIme: boolean;
    output: string[];
  };
  steps: string[];
} {
  const openResult = openUrlInChrome(input.url, input.deviceId, {
    browserPackage: input.browserPackage,
    browserActivity: input.browserActivity,
    fallbackToDefault: input.fallbackToDefault,
    waitForReadyMs: input.waitForReadyMs,
  });

  const commonLoginInput = {
    deviceId: openResult.deviceId,
    email: input.email,
    password: input.password,
    submitLabels: input.submitLabels,
    hideKeyboard: input.hideKeyboard,
    submitFallback: input.submitFallback,
  } as const;

  const loginResult = input.useAdbKeyboard
    ? smartLoginFast({
        ...commonLoginInput,
        useAdbKeyboard: true,
      })
    : smartLogin({
        ...commonLoginInput,
        imeId: input.imeId,
      });

  return {
    deviceId: openResult.deviceId,
    url: input.url,
    openResult,
    loginResult: {
      deviceId: loginResult.deviceId,
      emailFieldFound: loginResult.emailFieldFound,
      passwordFieldFound: loginResult.passwordFieldFound,
      submitFound: loginResult.submitFound,
      usedIme: loginResult.usedIme,
      output: loginResult.output,
    },
    steps: [openResult.output, ...loginResult.output],
  };
}

export function configureUsbDebugging(input: {
  action: 'query' | 'enable' | 'disable';
  deviceId?: string;
  useSettingsApi?: boolean;
  fallbackToUi?: boolean;
  waitForReadyMs?: number;
}): {
  deviceId: string;
  action: string;
  requestedEnabled?: boolean;
  adbEnabledBefore: boolean | undefined;
  developmentSettingsEnabledBefore: boolean | undefined;
  adbEnabledAfter?: boolean | undefined;
  developmentSettingsEnabledAfter?: boolean | undefined;
  adbEnabledRawBefore: string;
  developmentSettingsEnabledRawBefore: string;
  adbEnabledRawAfter?: string | undefined;
  developmentSettingsEnabledRawAfter?: string | undefined;
  success: boolean;
  strategy: string;
  openedActivity?: string;
  steps: string[];
  output: string;
} {
  const targetDeviceId = resolveDeviceId(input.deviceId);
  const action = input.action ?? 'query';
  const requestedEnabled = action === 'enable' ? true : action === 'disable' ? false : undefined;
  const useSettingsApi = input.useSettingsApi !== false;
  const fallbackToUi = input.fallbackToUi !== false;
  const waitMs = typeof input.waitForReadyMs === 'number' && input.waitForReadyMs > 0
    ? input.waitForReadyMs
    : USB_DEBUGGING_DEFAULT_WAIT_MS;

  const before = getUsbDebuggingState(targetDeviceId);
  const steps: string[] = [
    `state before: adb_enabled=${before.adbEnabledRaw}, development_settings_enabled=${before.developmentSettingsEnabledRaw}`,
  ];

  const result: {
    adbEnabledAfter?: boolean | undefined;
    developmentSettingsEnabledAfter?: boolean | undefined;
    adbEnabledRawAfter?: string | undefined;
    developmentSettingsEnabledRawAfter?: string | undefined;
    openedActivity?: string;
    strategy: string;
    success: boolean;
  } = {
    strategy: action === 'query' ? 'query' : 'settings-api',
    success: false,
  };

  let after = before;

  if (action === 'query' || requestedEnabled === undefined) {
    result.success = true;
    result.strategy = 'query';
  } else {
    if (useSettingsApi) {
      try {
        const requestedValue = requestedEnabled ? '1' : '0';
        const globalOutput = executeADBCommandOnDevice(
          `shell settings put global adb_enabled ${requestedValue}`,
          targetDeviceId,
          { timeout: 8000 }
        );
        const secureOutput = executeADBCommandOnDevice(
          `shell settings put secure development_settings_enabled ${requestedValue}`,
          targetDeviceId,
          { timeout: 8000 }
        );
        steps.push(`settings api: adb_enabled=${requestedValue}`);
        steps.push(`settings api: development_settings_enabled=${requestedValue}`);
        steps.push(`settings output: global=${globalOutput.output.trim()} secure=${secureOutput.output.trim()}`);
        if (waitMs > 0) {
          executeADBCommandOnDevice(`shell sleep ${formatSleepSeconds(waitMs)}`, targetDeviceId);
        }
        after = getUsbDebuggingState(targetDeviceId);
        result.strategy = 'settings-api';
      } catch (error: any) {
        steps.push(`settings api failed: ${error.message ?? String(error)}`);
        result.strategy = 'settings-api-failed';
      }
    } else {
      steps.push('settings api disabled by option useSettingsApi=false');
      result.strategy = 'ui-open-only';
    }

    result.success = isUsbStateAligned(after, requestedEnabled);

    if (!result.success && fallbackToUi) {
      try {
        const opened = openAndroidSettings('developer-options', targetDeviceId, undefined, waitMs);
        result.openedActivity = opened.activity;
        steps.push(`open settings: ${opened.activity}`);
        steps.push(toggleUsbDebuggingViaUi(targetDeviceId, requestedEnabled));
        if (waitMs > 0) {
          executeADBCommandOnDevice(`shell sleep ${formatSleepSeconds(waitMs)}`, targetDeviceId);
        }
        after = getUsbDebuggingState(targetDeviceId);
        result.success = isUsbStateAligned(after, requestedEnabled);
        result.strategy = result.strategy === 'settings-api' ? 'settings-api+ui-fallback' : 'ui-open-only';
      } catch (error: any) {
        steps.push(`ui fallback failed: ${error?.message ?? String(error)}`);
        if (result.strategy === 'settings-api' || result.strategy === 'settings-api-failed') {
          result.strategy = 'settings-api-failed';
        } else {
          result.strategy = 'ui-open-only';
        }
      }
    }
  }

  result.adbEnabledAfter = after.adbEnabled;
  result.developmentSettingsEnabledAfter = after.developmentSettingsEnabled;
  result.adbEnabledRawAfter = after.adbEnabledRaw;
  result.developmentSettingsEnabledRawAfter = after.developmentSettingsEnabledRaw;
  const output = steps.join('\n');

  return {
    deviceId: targetDeviceId,
    action,
    requestedEnabled,
    adbEnabledBefore: before.adbEnabled,
    developmentSettingsEnabledBefore: before.developmentSettingsEnabled,
    adbEnabledRawBefore: before.adbEnabledRaw,
    developmentSettingsEnabledRawBefore: before.developmentSettingsEnabledRaw,
    adbEnabledAfter: after.adbEnabled,
    developmentSettingsEnabledAfter: after.developmentSettingsEnabled,
    adbEnabledRawAfter: after.adbEnabledRaw,
    developmentSettingsEnabledRawAfter: after.developmentSettingsEnabledRaw,
    openedActivity: result.openedActivity,
    success: result.success,
    strategy: result.strategy,
    steps,
    output,
  };
}

export function openUrl(
  url: string,
  deviceId?: string
): { deviceId: string; url: string; output: string } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const { output } = executeADBCommandOnDevice(
    `shell am start -a android.intent.action.VIEW -d ${escapeShellArg(url)}`,
    targetDeviceId,
    { timeout: 8000 }
  );
  return { deviceId: targetDeviceId, url, output: output.trim() };
}

export function pasteClipboard(
  deviceId?: string
): { deviceId: string; output: string } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const output = executeADBCommand(`-s ${targetDeviceId} shell input keyevent 279`);
  return { deviceId: targetDeviceId, output: output.trim() };
}

export function getCurrentActivity(deviceId?: string): {
  deviceId: string;
  packageName?: string;
  activity?: string;
  component?: string;
  raw: string;
} {
  const { deviceId: targetDeviceId, output: activityOutput } = executeADBCommandOnDevice(
    'shell dumpsys activity activities',
    deviceId,
    { timeout: 8000 }
  );

  let rawLine =
    activityOutput
      .split('\n')
      .map(line => line.trim())
      .find(
        line =>
          line.includes('topResumedActivity') ||
          line.includes('mTopResumedActivity') ||
          line.includes('ResumedActivity') ||
          line.includes('mResumedActivity') ||
          line.includes('mFocusedApp') ||
          line.includes('mFocusedActivity') ||
          line.includes('mTopActivity')
      ) ?? '';

  if (!rawLine) {
    const { output: windowOutput } = executeADBCommandOnDevice(
      'shell dumpsys window windows',
      targetDeviceId,
      { timeout: 8000 }
    );

    rawLine =
      windowOutput
        .split('\n')
        .map(line => line.trim())
        .find(
          line =>
            line.includes('mCurrentFocus') ||
            line.includes('mFocusedApp') ||
            line.includes('mFocusedWindow')
        ) ?? '';
  }

  const match = rawLine.match(/([A-Za-z0-9._]+)\/([A-Za-z0-9._$]+)/);
  if (!match) {
    return {
      deviceId: targetDeviceId,
      raw: rawLine,
    };
  }

  const packageName = match[1];
  const activity = normalizeActivityName(match[2], packageName);

  return {
    deviceId: targetDeviceId,
    packageName,
    activity,
    component: `${packageName}/${activity}`,
    raw: rawLine,
  };
}

export function getWindowSize(deviceId?: string): {
  deviceId: string;
  width: number;
  height: number;
  physicalWidth?: number;
  physicalHeight?: number;
  overrideWidth?: number;
  overrideHeight?: number;
  raw: string;
} {
  const { deviceId: targetDeviceId, output } = executeADBCommandOnDevice(
    'shell wm size',
    deviceId
  );
  const raw = output.trim();

  const physicalMatch = raw.match(/Physical size:\s*(\d+)x(\d+)/i);
  const overrideMatch = raw.match(/Override size:\s*(\d+)x(\d+)/i);

  const physicalWidth = physicalMatch ? parseInt(physicalMatch[1], 10) : undefined;
  const physicalHeight = physicalMatch ? parseInt(physicalMatch[2], 10) : undefined;
  const overrideWidth = overrideMatch ? parseInt(overrideMatch[1], 10) : undefined;
  const overrideHeight = overrideMatch ? parseInt(overrideMatch[2], 10) : undefined;

  const width = overrideWidth ?? physicalWidth;
  const height = overrideHeight ?? physicalHeight;

  if (!width || !height) {
    throw new ADBCommandError(
      'WINDOW_SIZE_NOT_FOUND',
      'Failed to parse window size from device output',
      { output: raw }
    );
  }

  return {
    deviceId: targetDeviceId,
    width,
    height,
    physicalWidth,
    physicalHeight,
    overrideWidth,
    overrideHeight,
    raw,
  };
}

export function findApkInProject(projectRoot?: string): {
  projectRoot: string;
  apkPath: string;
  candidates: string[];
} {
  const resolvedRoot = resolveProjectRoot(projectRoot);
  const searchDirs = APK_SEARCH_DIRS.map(searchDir => path.join(resolvedRoot, searchDir));
  const apkFiles: string[] = [];

  for (const dir of searchDirs) {
    collectApkFiles(dir, 6, apkFiles);
  }

  const uniqueApks = Array.from(new Set(apkFiles));
  const sorted = uniqueApks
    .map(filePath => ({ filePath, mtime: fs.statSync(filePath).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .map(item => item.filePath);

  if (sorted.length === 0) {
    throw new APKNotFoundError(resolvedRoot, searchDirs);
  }

  return {
    projectRoot: resolvedRoot,
    apkPath: sorted[0],
    candidates: sorted,
  };
}

export function installApk(
  apkPath: string | undefined,
  deviceId?: string,
  options: {
    projectRoot?: string;
    reinstall?: boolean;
    grantPermissions?: boolean;
    allowTestPackages?: boolean;
    allowDowngrade?: boolean;
    timeoutMs?: number;
  } = {}
): { deviceId: string; apkPath: string; output: string; success: boolean } {
  const root = resolveProjectRoot(options.projectRoot);
  const resolvedApkPath = apkPath
    ? path.resolve(root, apkPath)
    : findApkInProject(options.projectRoot).apkPath;

  if (!fs.existsSync(resolvedApkPath)) {
    throw new APKNotFoundError(root, [resolvedApkPath]);
  }

  const flags = [
    options.reinstall !== false ? '-r' : '',
    options.grantPermissions !== false ? '-g' : '',
    options.allowTestPackages ? '-t' : '',
    options.allowDowngrade ? '-d' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const installArgs = ['install', flags, escapeShellArg(resolvedApkPath)]
    .filter(Boolean)
    .join(' ');
  const timeout = options.timeoutMs ?? INSTALL_TIMEOUT_MS;
  const targetDeviceId = resolveDeviceId(deviceId);
  const execOptions: ExecSyncOptions = {
    stdio: 'pipe',
    timeout,
    maxBuffer: DEFAULT_BINARY_MAX_BUFFER,
  };

  let trimmed = '';
  try {
    const result = execSync(`adb -s ${targetDeviceId} ${installArgs}`, execOptions);
    trimmed = result.toString('utf-8').trim();
  } catch (error: any) {
    const stdout = error?.stdout ? error.stdout.toString('utf-8') : '';
    const stderr = error?.stderr ? error.stderr.toString('utf-8') : '';
    const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n').trim();
    const suggestion = /INSTALL_FAILED_NO_MATCHING_ABIS/i.test(combined)
      ? 'The APK ABI does not match the device. Build a compatible APK (e.g., arm64 for device or x86_64 for emulator).'
      : undefined;
    throw new ADBCommandError(
      'APK_INSTALL_FAILED',
      `APK install failed: ${combined || error.message}`,
      {
        output: combined,
        apkPath: resolvedApkPath,
        deviceId: targetDeviceId,
      },
      suggestion
    );
  }

  const success = /success/i.test(trimmed);

  if (!success) {
    throw new ADBCommandError('APK_INSTALL_FAILED', `APK install failed: ${trimmed}`, {
      output: trimmed,
      apkPath: resolvedApkPath,
      deviceId: targetDeviceId,
    });
  }

  return {
    deviceId: targetDeviceId,
    apkPath: resolvedApkPath,
    output: trimmed,
    success,
  };
}

export function uninstallApp(
  packageName: string,
  deviceId?: string,
  options: { keepData?: boolean } = {}
): { deviceId: string; packageName: string; output: string; success: boolean } {
  const args = ['uninstall', options.keepData ? '-k' : '', escapeShellArg(packageName)]
    .filter(Boolean)
    .join(' ');
  const { deviceId: targetDeviceId, output } = executeADBCommandOnDevice(args, deviceId);
  const trimmed = output.trim();
  const success = /success/i.test(trimmed);

  if (!success) {
    throw new ADBCommandError('APK_UNINSTALL_FAILED', `APK uninstall failed: ${trimmed}`, {
      output: trimmed,
      packageName,
      deviceId: targetDeviceId,
    });
  }

  return { deviceId: targetDeviceId, packageName, output: trimmed, success };
}

export function startApp(
  packageName: string,
  activity?: string,
  deviceId?: string,
  options: { waitForLaunch?: boolean; timeoutMs?: number } = {}
): {
  deviceId: string;
  packageName: string;
  activity?: string;
  launchedActivity?: string;
  fallbackUsed?: 'explicit' | 'resolved-main' | 'monkey';
  waitForLaunch?: boolean;
  foregroundPackage?: string;
  output: string;
} {
  const targetDeviceId = resolveDeviceId(deviceId);
  const waitForLaunch = options.waitForLaunch === true;
  const waitTimeoutMs = options.timeoutMs ?? 8000;
  const candidates: Array<{ type: 'explicit' | 'main' | 'monkey'; value: string }> = [];

  if (activity) {
    const isIntentAction =
      activity.startsWith('android.intent.') ||
      /ACTION[_A-Z]/.test(activity) ||
      /^[-\w.]+ACTION[-\w.]*/.test(activity);
    if (isIntentAction) {
      candidates.push({ type: 'explicit', value: `ACTION:${activity}` });
    } else if (activity.includes('/') || activity.startsWith('.')) {
      candidates.push({
        type: 'explicit',
        value: normalizeActivityName(activity, packageName).includes('/')
          ? normalizeActivityName(activity, packageName)
          : `${packageName}/${normalizeActivityName(activity, packageName)}`,
      });
    } else {
      candidates.push({
        type: 'explicit',
        value: `${packageName}/${activity}`,
      });
    }
  }

  const resolvedMainActivity = resolveMainActivity(packageName, targetDeviceId);
  if (resolvedMainActivity) {
    candidates.push({ type: 'main', value: resolvedMainActivity });
  }
  candidates.push({ type: 'monkey', value: packageName });

  let output = '';
  let launchedActivity = activity;
  let fallbackUsed: 'explicit' | 'resolved-main' | 'monkey' | undefined;
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      if (candidate.type === 'monkey') {
        output = executeADBCommandOnDevice(
          `shell monkey -p ${escapeShellArg(candidate.value)} -c android.intent.category.LAUNCHER 1`,
          targetDeviceId
        ).output.trim();
        launchedActivity = undefined;
        fallbackUsed = 'monkey';
      } else if (candidate.type === 'main') {
        const component = candidate.value.includes('/')
          ? candidate.value
          : `${packageName}/${candidate.value}`;
        output = executeADBCommandOnDevice(
          `shell am start -n ${escapeShellArg(component)}`,
          targetDeviceId
        ).output.trim();
        launchedActivity = candidate.value;
        fallbackUsed = 'resolved-main';
      } else if (candidate.value.startsWith('ACTION:')) {
        output = executeADBCommandOnDevice(
          `shell am start -a ${escapeShellArg(candidate.value.substring(7))} -p ${escapeShellArg(
            packageName
          )}`,
          targetDeviceId
        ).output.trim();
        launchedActivity = undefined;
        fallbackUsed = 'explicit';
      } else {
        output = executeADBCommandOnDevice(
          `shell am start -n ${escapeShellArg(candidate.value)}`,
          targetDeviceId
        ).output.trim();
        launchedActivity = candidate.value;
        fallbackUsed = 'explicit';
      }

      if (output) {
        break;
      }
    } catch (error: unknown) {
      lastError = error;
      output = '';
      launchedActivity = activity;
      fallbackUsed = undefined;
      continue;
    }
  }

  if (!output) {
    if (lastError instanceof Error) {
      throw new ADBCommandError('APP_START_FAILED', 'Failed to start app', {
        packageName,
        error: lastError.message,
      });
    }
    throw new ADBCommandError('APP_START_FAILED', 'Failed to start app', { packageName });
  }

  let foregroundPackage: string | undefined;
  if (waitForLaunch) {
    const waitResult = waitForPackage(packageName, targetDeviceId, { timeoutMs: waitTimeoutMs });
    foregroundPackage = waitResult.current;
  }

  return {
    deviceId: targetDeviceId,
    packageName,
    activity,
    launchedActivity,
    fallbackUsed,
    waitForLaunch,
    foregroundPackage,
    output: output.trim(),
  };
}

export function stopApp(
  packageName: string,
  deviceId?: string
): { deviceId: string; packageName: string; output: string } {
  const { deviceId: targetDeviceId, output } = executeADBCommandOnDevice(
    `shell am force-stop ${escapeShellArg(packageName)}`,
    deviceId
  );

  return { deviceId: targetDeviceId, packageName, output: output.trim() };
}

export function clearAppData(
  packageName: string,
  deviceId?: string
): { deviceId: string; packageName: string; output: string; success: boolean } {
  const { deviceId: targetDeviceId, output } = executeADBCommandOnDevice(
    `shell pm clear ${escapeShellArg(packageName)}`,
    deviceId
  );
  const trimmed = output.trim();
  const success = /success/i.test(trimmed);

  if (!success) {
    throw new ADBCommandError('CLEAR_APP_DATA_FAILED', `Failed to clear app data: ${trimmed}`, {
      output: trimmed,
      packageName,
      deviceId: targetDeviceId,
    });
  }

  return { deviceId: targetDeviceId, packageName, output: trimmed, success };
}

export function tapScreen(
  x: number,
  y: number,
  deviceId?: string
): { deviceId: string; x: number; y: number; output: string } {
  const { deviceId: targetDeviceId, output } = executeADBCommandOnDevice(
    `shell input tap ${x} ${y}`,
    deviceId
  );

  return { deviceId: targetDeviceId, x, y, output: output.trim() };
}

export function swipeScreen(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  durationMs?: number,
  deviceId?: string
): {
  deviceId: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  durationMs?: number;
  output: string;
} {
  const durationArg = typeof durationMs === 'number' ? ` ${durationMs}` : '';
  const { deviceId: targetDeviceId, output } = executeADBCommandOnDevice(
    `shell input swipe ${startX} ${startY} ${endX} ${endY}${durationArg}`,
    deviceId
  );

  return { deviceId: targetDeviceId, startX, startY, endX, endY, durationMs, output: output.trim() };
}

export function inputText(
  text: string,
  deviceId?: string
): { deviceId: string; text: string; output: string } {
  const encoded = encodeAdbInputText(text);
  const { deviceId: targetDeviceId, output } = executeADBCommandOnDevice(
    `shell input text ${escapeShellArg(encoded)}`,
    deviceId
  );

  return { deviceId: targetDeviceId, text, output: output.trim() };
}

export function batchInputActions(
  actions: BatchAction[],
  deviceId?: string,
  options: { timeoutMs?: number; resolvedDeviceId?: string } = {}
): { deviceId: string; actions: BatchAction[]; output: string } {
  const targetDeviceId = options.resolvedDeviceId ?? resolveDeviceId(deviceId);
  const commands = actions
    .map(action => {
      switch (action.type) {
        case 'tap':
          return `input tap ${action.x} ${action.y}`;
        case 'swipe': {
          const durationArg =
            typeof action.durationMs === 'number' ? ` ${action.durationMs}` : '';
          return `input swipe ${action.startX} ${action.startY} ${action.endX} ${action.endY}${durationArg}`;
        }
        case 'text': {
          const encoded = encodeAdbInputText(action.text);
          return `input text ${escapeShellArg(encoded)}`;
        }
        case 'keyevent':
          return `input keyevent ${escapeShellArg(String(action.keyCode))}`;
        case 'sleep': {
          const seconds = formatSleepSeconds(action.durationMs);
          return seconds === '0' ? '' : `sleep ${seconds}`;
        }
        default:
          return '';
      }
    })
    .filter(Boolean);

  if (commands.length === 0) {
    commands.push(':');
  }

  const script = commands.join('; ');
  const output = executeADBCommand(`-s ${targetDeviceId} shell ${escapeShellArg(script)}`, {
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT,
  });

  return {
    deviceId: targetDeviceId,
    actions,
    output: output.trim(),
  };
}

export function sendKeyevent(
  keyCode: string | number,
  deviceId?: string
): { deviceId: string; keyCode: string | number; output: string } {
  const { deviceId: targetDeviceId, output } = executeADBCommandOnDevice(
    `shell input keyevent ${escapeShellArg(String(keyCode))}`,
    deviceId
  );

  return { deviceId: targetDeviceId, keyCode, output: output.trim() };
}

export function reversePort(
  devicePort: number,
  hostPort?: number,
  deviceId?: string
): { deviceId: string; devicePort: number; hostPort: number; output: string } {
  const resolvedHostPort = hostPort ?? devicePort;
  const { deviceId: targetDeviceId, output } = executeADBCommandOnDevice(
    `reverse tcp:${devicePort} tcp:${resolvedHostPort}`,
    deviceId
  );

  return {
    deviceId: targetDeviceId,
    devicePort,
    hostPort: resolvedHostPort,
    output: output.trim(),
  };
}

export function forwardPort(
  devicePort: number,
  hostPort: number,
  deviceId?: string
): { deviceId: string; devicePort: number; hostPort: number; output: string } {
  const { deviceId: targetDeviceId, output } = executeADBCommandOnDevice(
    `forward tcp:${hostPort} tcp:${devicePort}`,
    deviceId
  );

  return { deviceId: targetDeviceId, devicePort, hostPort, output: output.trim() };
}

export function resolvePackagePid(packageName: string, deviceId?: string): number {
  const { output } = executeADBCommandOnDevice(
    `shell pidof -s ${escapeShellArg(packageName)}`,
    deviceId
  );
  const pid = parseInt(output.trim(), 10);

  if (!pid || Number.isNaN(pid)) {
    throw new PackageNotRunningError(packageName);
  }

  return pid;
}

export function getLogcat(options: {
  deviceId?: string;
  lines?: number;
  since?: string;
  tag?: string;
  priority?: 'V' | 'D' | 'I' | 'W' | 'E' | 'F' | 'S';
  pid?: number;
  packageName?: string;
  format?: 'time' | 'threadtime' | 'brief' | 'raw';
}): { deviceId: string; output: string; lines: number; pid?: number; packageName?: string } {
  const lines = options.lines ?? 200;
  const format = options.format ?? 'time';
  let pid = options.pid;

  if (!pid && options.packageName) {
    pid = resolvePackagePid(options.packageName, options.deviceId);
  }

  const args: string[] = ['logcat', '-d', '-v', format, '-t', String(lines)];

  if (options.since) {
    args.push('-T', escapeShellArg(options.since));
  }

  if (pid) {
    args.push(`--pid=${pid}`);
  }

  if (options.tag) {
    const filter = `${options.tag}:${options.priority ?? 'V'}`;
    args.push('-s', escapeShellArg(filter));
  }

  const { deviceId: targetDeviceId, output } = executeADBCommandOnDevice(
    args.join(' '),
    options.deviceId
  );

  return {
    deviceId: targetDeviceId,
    output: output.trim(),
    lines,
    pid,
    packageName: options.packageName,
  };
}

function parseActivitiesFromDumpsys(output: string, packageName: string): string[] {
  const activities = new Set<string>();
  const packagePattern = escapeRegex(packageName);

  const componentRegex = new RegExp(`${packagePattern}/([\\w\\.$]+)`, 'g');
  let match = componentRegex.exec(output);
  while (match) {
    activities.add(normalizeActivityName(match[1], packageName));
    match = componentRegex.exec(output);
  }

  const fqRegex = new RegExp(`${packagePattern}\\.[\\w\\.$]+`, 'g');
  const fqMatches = output.match(fqRegex) ?? [];
  for (const entry of fqMatches) {
    activities.add(entry);
  }

  return Array.from(activities).sort();
}

export function resolveMainActivity(
  packageName: string,
  deviceId?: string
): string | undefined {
  try {
    const { output } = executeADBCommandOnDevice(
      `shell cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER ${escapeShellArg(
        packageName
      )}`,
      deviceId
    );

    const line = output
      .split('\n')
      .map(item => item.trim())
      .find(item => item.includes('/') && item.startsWith(packageName));

    if (!line) {
      return undefined;
    }

    const component = line.split(/\s+/)[0];
    const activityPart = component.split('/')[1];
    if (!activityPart) {
      return undefined;
    }

    return normalizeActivityName(activityPart, packageName);
  } catch (error) {
    return undefined;
  }
}

export function listPackageActivities(
  packageName: string,
  deviceId?: string
): { deviceId: string; packageName: string; activities: string[]; mainActivity?: string } {
  const { deviceId: targetDeviceId, output } = executeADBCommandOnDevice(
    `shell dumpsys package ${escapeShellArg(packageName)}`,
    deviceId,
    { timeout: 10000 }
  );

  const activities = parseActivitiesFromDumpsys(output, packageName);
  const mainActivity = resolveMainActivity(packageName, targetDeviceId);

  return {
    deviceId: targetDeviceId,
    packageName,
    activities,
    mainActivity,
  };
}

export function hotReloadSetup(options: {
  deviceId?: string;
  packageName: string;
  activity?: string;
  apkPath?: string;
  projectRoot?: string;
  reversePorts?: Array<{ devicePort: number; hostPort?: number }>;
  install?: boolean;
  start?: boolean;
  stopBeforeStart?: boolean;
  reinstall?: boolean;
  grantPermissions?: boolean;
  allowTestPackages?: boolean;
  allowDowngrade?: boolean;
  timeoutMs?: number;
  playProtectAction?: 'send_once' | 'always' | 'never';
  playProtectMaxWaitMs?: number;
}): {
  deviceId: string;
  reversedPorts: Array<{ devicePort: number; hostPort: number; output: string }>;
  install?: { deviceId: string; apkPath: string; output: string; success: boolean };
  stop?: { deviceId: string; packageName: string; output: string };
  start?: { deviceId: string; packageName: string; activity?: string; output: string };
  playProtect?: { handled: boolean; action?: string };
} {
  const targetDeviceId = resolveDeviceId(options.deviceId);
  const reversePorts = options.reversePorts ?? [{ devicePort: 8081 }];
  const reversedPorts = reversePorts.map(mapping =>
    reversePort(mapping.devicePort, mapping.hostPort, targetDeviceId)
  );

  let stopResult:
    | { deviceId: string; packageName: string; output: string }
    | undefined;
  let installResult:
    | { deviceId: string; apkPath: string; output: string; success: boolean }
    | undefined;
  let startResult:
    | { deviceId: string; packageName: string; activity?: string; output: string }
    | undefined;

  if (options.stopBeforeStart) {
    stopResult = stopApp(options.packageName, targetDeviceId);
  }

  if (options.install !== false) {
    installResult = installApk(options.apkPath, targetDeviceId, {
      projectRoot: options.projectRoot,
      reinstall: options.reinstall,
      grantPermissions: options.grantPermissions,
      allowTestPackages: options.allowTestPackages,
      allowDowngrade: options.allowDowngrade,
      timeoutMs: options.timeoutMs,
    });
  }

  if (options.start !== false) {
    startResult = startApp(options.packageName, options.activity, targetDeviceId);
  }

  const playProtectAction = options.playProtectAction ?? 'send_once';
  let playProtectResult: { handled: boolean; action?: string } | undefined;

  if (playProtectAction !== 'never') {
    playProtectResult = handlePlayProtectPrompt(targetDeviceId, playProtectAction, {
      maxWaitMs: options.playProtectMaxWaitMs,
    });
  }

  return {
    deviceId: targetDeviceId,
    reversedPorts,
    install: installResult,
    stop: stopResult,
    start: startResult,
    playProtect: playProtectResult,
  };
}

function handlePlayProtectPrompt(
  deviceId: string,
  action: 'send_once' | 'always' | 'never',
  options: { maxWaitMs?: number } = {}
): { handled: boolean; action?: string } {
  const maxWaitMs = options.maxWaitMs ?? 2500;
  const deadline = Date.now() + maxWaitMs;
  const targets = getPlayProtectTargets(action);

  while (Date.now() <= deadline) {
    const { xml } = dumpUiHierarchy(deviceId, { maxChars: 500000 });
    if (xml.includes('Google Play Protect')) {
      const tapResult = tapPlayProtectButton(xml, deviceId, targets);
      if (tapResult) {
        return { handled: true, action };
      }
    }

    executeADBCommand(`-s ${deviceId} shell sleep 0.5`);
  }

  return { handled: false };
}

function getPlayProtectTargets(action: 'send_once' | 'always' | 'never'): string[] {
  switch (action) {
    case 'always':
      return [
        'Unbekannte Apps immer zum Sicherheitsscan senden',
        'Always send',
        'Always send apps to Google',
      ];
    case 'never':
      return ['Nicht senden', "Don't send", 'Do not send'];
    case 'send_once':
    default:
      return ['Dieses Mal senden', 'Send this time', 'Send once'];
  }
}

function tapPlayProtectButton(xml: string, deviceId: string, targets: string[]): boolean {
  const nodes = extractUiNodes(xml);

  for (const target of targets) {
    const node = nodes.find(candidate => candidate.text.includes(target));
    if (node && node.bounds) {
      const { x, y } = centerOfBounds(node.bounds);
      executeADBCommand(`-s ${deviceId} shell input tap ${x} ${y}`);
      return true;
    }
  }

  return false;
}

type UiNode = {
  text: string;
  resourceId: string;
  contentDesc: string;
  className: string;
  clickable: boolean;
  password: boolean;
  checked?: boolean;
  bounds?: { x1: number; y1: number; x2: number; y2: number };
};

function extractUiNodes(xml: string): UiNode[] {
  const nodes: UiNode[] = [];
  const nodeRegex = /<node\b[^>]*>/g;
  let match: RegExpExecArray | null;

  while ((match = nodeRegex.exec(xml))) {
    const node = match[0];
    const textMatch = node.match(/text="([^"]*)"/);
    const idMatch = node.match(/resource-id="([^"]*)"/);
    const descMatch = node.match(/content-desc="([^"]*)"/);
    const classMatch = node.match(/class="([^"]*)"/);
    const clickableMatch = node.match(/clickable="([^"]*)"/);
    const passwordMatch = node.match(/password="([^"]*)"/);
    const checkedMatch = node.match(/checked="([^"]*)"/);
    const boundsMatch = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    const text = textMatch ? textMatch[1] : '';
    const resourceId = idMatch ? idMatch[1] : '';
    const contentDesc = descMatch ? descMatch[1] : '';
    const className = classMatch ? classMatch[1] : '';
    const clickable = clickableMatch ? clickableMatch[1] === 'true' : false;
    const password = passwordMatch ? passwordMatch[1] === 'true' : false;
    const checked = checkedMatch ? checkedMatch[1] === 'true' : undefined;
    let bounds;

    if (boundsMatch) {
      bounds = {
        x1: parseInt(boundsMatch[1], 10),
        y1: parseInt(boundsMatch[2], 10),
        x2: parseInt(boundsMatch[3], 10),
        y2: parseInt(boundsMatch[4], 10),
      };
    }

    nodes.push({ text, resourceId, contentDesc, className, clickable, password, checked, bounds });
  }

  return nodes;
}

function centerOfBounds(bounds: { x1: number; y1: number; x2: number; y2: number }): {
  x: number;
  y: number;
} {
  return {
    x: Math.round((bounds.x1 + bounds.x2) / 2),
    y: Math.round((bounds.y1 + bounds.y2) / 2),
  };
}

type MatchMode = 'exact' | 'contains' | 'regex';
type SelectorField = 'text' | 'resourceId' | 'contentDesc';

type UiSelector = {
  field: SelectorField;
  value: string;
  matchMode: MatchMode;
};

function matchesValue(value: string, target: string, mode: MatchMode): boolean {
  switch (mode) {
    case 'contains':
      return value.includes(target);
    case 'regex':
      try {
        return new RegExp(target).test(value);
      } catch {
        return false;
      }
    case 'exact':
    default:
      return value === target;
  }
}

function findNodesBy(
  nodes: UiNode[],
  field: 'text' | 'resourceId' | 'contentDesc',
  target: string,
  mode: MatchMode
): UiNode[] {
  return nodes.filter(node => matchesValue(node[field], target, mode));
}

function queryNodes(nodes: UiNode[], selector: UiSelector): UiNode[] {
  return findNodesBy(nodes, selector.field, selector.value, selector.matchMode);
}

function tapUiNode(deviceId: string, node: UiNode): { x: number; y: number; output: string } {
  if (!node.bounds) {
    throw new ADBCommandError('UI_NODE_NO_BOUNDS', 'UI node has no bounds', { node });
  }
  const { x, y } = centerOfBounds(node.bounds);
  const output = executeADBCommand(`-s ${deviceId} shell input tap ${x} ${y}`);
  return { x, y, output: output.trim() };
}

export function tapByText(
  text: string,
  deviceId?: string,
  options: { matchMode?: MatchMode; index?: number; useFallback?: boolean } = {}
): {
  deviceId: string;
  text: string;
  matchMode: MatchMode;
  index: number;
  found: boolean;
  x?: number;
  y?: number;
  output?: string;
  clickableFallbackUsed?: boolean;
  fallbackReason?: 'direct' | 'clickable_container' | 'nearest_clickable' | 'no_bounds';
} {
  const targetDeviceId = resolveDeviceId(deviceId);
  const { xml } = dumpUiHierarchy(targetDeviceId);
  const nodes = extractUiNodes(xml);
  const matchMode = options.matchMode ?? 'exact';
  const index = options.index ?? 0;
  const matches = findNodesBy(nodes, 'text', text, matchMode);

  if (!matches[index]) {
    return { deviceId: targetDeviceId, text, matchMode, index, found: false };
  }

  const selection = options.useFallback === false ? { node: matches[index], usedFallback: false } : resolveTapTarget(nodes, matches[index]);
  if (!selection.node.bounds) {
    const usedFallback = options.useFallback === false ? false : true;
    return {
      deviceId: targetDeviceId,
      text,
      matchMode,
      index,
      found: false,
      clickableFallbackUsed: usedFallback,
      fallbackReason: 'no_bounds',
    };
  }

  const { x, y, output } = tapUiNode(targetDeviceId, selection.node);
  return {
    deviceId: targetDeviceId,
    text,
    matchMode,
    index,
    found: true,
    x,
    y,
    output,
    clickableFallbackUsed: selection.usedFallback,
    fallbackReason: selection.fallbackReason,
  };
}

export function tapById(
  resourceId: string,
  deviceId?: string,
  options: { index?: number; useFallback?: boolean } = {}
): {
  deviceId: string;
  resourceId: string;
  index: number;
  found: boolean;
  x?: number;
  y?: number;
  output?: string;
  clickableFallbackUsed?: boolean;
  fallbackReason?: 'direct' | 'clickable_container' | 'nearest_clickable' | 'no_bounds';
} {
  const targetDeviceId = resolveDeviceId(deviceId);
  const { xml } = dumpUiHierarchy(targetDeviceId);
  const nodes = extractUiNodes(xml);
  const index = options.index ?? 0;
  const matches = findNodesBy(nodes, 'resourceId', resourceId, 'exact');

  if (!matches[index]) {
    return { deviceId: targetDeviceId, resourceId, index, found: false };
  }

  const selection = options.useFallback === false
    ? { node: matches[index], usedFallback: false }
    : resolveTapTarget(nodes, matches[index]);
  if (!selection.node.bounds) {
    const usedFallback = options.useFallback === false ? false : true;
    return {
      deviceId: targetDeviceId,
      resourceId,
      index,
      found: false,
      clickableFallbackUsed: usedFallback,
      fallbackReason: 'no_bounds',
    };
  }

  const { x, y, output } = tapUiNode(targetDeviceId, selection.node);
  return {
    deviceId: targetDeviceId,
    resourceId,
    index,
    found: true,
    x,
    y,
    output,
    clickableFallbackUsed: selection.usedFallback,
    fallbackReason: selection.fallbackReason,
  };
}

export function tapByDesc(
  contentDesc: string,
  deviceId?: string,
  options: { matchMode?: MatchMode; index?: number; useFallback?: boolean } = {}
): {
  deviceId: string;
  contentDesc: string;
  matchMode: MatchMode;
  index: number;
  found: boolean;
  x?: number;
  y?: number;
  output?: string;
  clickableFallbackUsed?: boolean;
  fallbackReason?: 'direct' | 'clickable_container' | 'nearest_clickable' | 'no_bounds';
} {
  const targetDeviceId = resolveDeviceId(deviceId);
  const { xml } = dumpUiHierarchy(targetDeviceId);
  const nodes = extractUiNodes(xml);
  const matchMode = options.matchMode ?? 'exact';
  const index = options.index ?? 0;
  const matches = findNodesBy(nodes, 'contentDesc', contentDesc, matchMode);

  if (!matches[index]) {
    return { deviceId: targetDeviceId, contentDesc, matchMode, index, found: false };
  }

  const selection = options.useFallback === false
    ? { node: matches[index], usedFallback: false }
    : resolveTapTarget(nodes, matches[index]);
  if (!selection.node.bounds) {
    const usedFallback = options.useFallback === false ? false : true;
    return {
      deviceId: targetDeviceId,
      contentDesc,
      matchMode,
      index,
      found: false,
      clickableFallbackUsed: usedFallback,
      fallbackReason: 'no_bounds',
    };
  }

  const { x, y, output } = tapUiNode(targetDeviceId, selection.node);
  return {
    deviceId: targetDeviceId,
    contentDesc,
    matchMode,
    index,
    found: true,
    x,
    y,
    output,
    clickableFallbackUsed: selection.usedFallback,
    fallbackReason: selection.fallbackReason,
  };
}

export function waitForText(
  text: string,
  deviceId?: string,
  options: { matchMode?: MatchMode; timeoutMs?: number; intervalMs?: number } = {}
): { deviceId: string; text: string; matchMode: MatchMode; found: boolean; elapsedMs: number; matchCount: number } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const matchMode = options.matchMode ?? 'exact';
  const timeoutMs = options.timeoutMs ?? 5000;
  const intervalMs = options.intervalMs ?? 300;
  const start = Date.now();

  while (Date.now() - start <= timeoutMs) {
    const { xml } = dumpUiHierarchy(targetDeviceId);
    const nodes = extractUiNodes(xml);
    const matches = findNodesBy(nodes, 'text', text, matchMode);
    if (matches.length > 0) {
      return {
        deviceId: targetDeviceId,
        text,
        matchMode,
        found: true,
        elapsedMs: Date.now() - start,
        matchCount: matches.length,
      };
    }
    executeADBCommand(`-s ${targetDeviceId} shell sleep ${intervalMs / 1000}`);
  }

  return {
    deviceId: targetDeviceId,
    text,
    matchMode,
    found: false,
    elapsedMs: Date.now() - start,
    matchCount: 0,
  };
}

export function waitForTextDisappear(
  text: string,
  deviceId?: string,
  options: { matchMode?: MatchMode; timeoutMs?: number; intervalMs?: number } = {}
): { deviceId: string; text: string; matchMode: MatchMode; disappeared: boolean; elapsedMs: number; matchCount: number } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const matchMode = options.matchMode ?? 'exact';
  const timeoutMs = options.timeoutMs ?? 5000;
  const intervalMs = options.intervalMs ?? 300;
  const start = Date.now();

  while (Date.now() - start <= timeoutMs) {
    const { xml } = dumpUiHierarchy(targetDeviceId);
    const nodes = extractUiNodes(xml);
    const matches = findNodesBy(nodes, 'text', text, matchMode);
    if (matches.length === 0) {
      return {
        deviceId: targetDeviceId,
        text,
        matchMode,
        disappeared: true,
        elapsedMs: Date.now() - start,
        matchCount: 0,
      };
    }
    executeADBCommand(`-s ${targetDeviceId} shell sleep ${intervalMs / 1000}`);
  }

  const { xml } = dumpUiHierarchy(targetDeviceId);
  const nodes = extractUiNodes(xml);
  const matches = findNodesBy(nodes, 'text', text, matchMode);
  return {
    deviceId: targetDeviceId,
    text,
    matchMode,
    disappeared: false,
    elapsedMs: Date.now() - start,
    matchCount: matches.length,
  };
}

export function waitForId(
  resourceId: string,
  deviceId?: string,
  options: { matchMode?: MatchMode; timeoutMs?: number; intervalMs?: number } = {}
): {
  deviceId: string;
  resourceId: string;
  matchMode: MatchMode;
  found: boolean;
  elapsedMs: number;
  matchCount: number;
} {
  const targetDeviceId = resolveDeviceId(deviceId);
  const matchMode = options.matchMode ?? 'exact';
  const timeoutMs = options.timeoutMs ?? 5000;
  const intervalMs = options.intervalMs ?? 300;
  const start = Date.now();

  while (Date.now() - start <= timeoutMs) {
    const { xml } = dumpUiHierarchy(targetDeviceId);
    const nodes = extractUiNodes(xml);
    const matches = findNodesBy(nodes, 'resourceId', resourceId, matchMode);
    if (matches.length > 0) {
      return {
        deviceId: targetDeviceId,
        resourceId,
        matchMode,
        found: true,
        elapsedMs: Date.now() - start,
        matchCount: matches.length,
      };
    }
    executeADBCommand(`-s ${targetDeviceId} shell sleep ${intervalMs / 1000}`);
  }

  return {
    deviceId: targetDeviceId,
    resourceId,
    matchMode,
    found: false,
    elapsedMs: Date.now() - start,
    matchCount: 0,
  };
}

export function waitForIdDisappear(
  resourceId: string,
  deviceId?: string,
  options: { matchMode?: MatchMode; timeoutMs?: number; intervalMs?: number } = {}
): {
  deviceId: string;
  resourceId: string;
  matchMode: MatchMode;
  disappeared: boolean;
  elapsedMs: number;
  matchCount: number;
} {
  const targetDeviceId = resolveDeviceId(deviceId);
  const matchMode = options.matchMode ?? 'exact';
  const timeoutMs = options.timeoutMs ?? 5000;
  const intervalMs = options.intervalMs ?? 300;
  const start = Date.now();

  while (Date.now() - start <= timeoutMs) {
    const { xml } = dumpUiHierarchy(targetDeviceId);
    const nodes = extractUiNodes(xml);
    const matches = findNodesBy(nodes, 'resourceId', resourceId, matchMode);
    if (matches.length === 0) {
      return {
        deviceId: targetDeviceId,
        resourceId,
        matchMode,
        disappeared: true,
        elapsedMs: Date.now() - start,
        matchCount: 0,
      };
    }
    executeADBCommand(`-s ${targetDeviceId} shell sleep ${intervalMs / 1000}`);
  }

  const { xml } = dumpUiHierarchy(targetDeviceId);
  const nodes = extractUiNodes(xml);
  const matches = findNodesBy(nodes, 'resourceId', resourceId, matchMode);
  return {
    deviceId: targetDeviceId,
    resourceId,
    matchMode,
    disappeared: false,
    elapsedMs: Date.now() - start,
    matchCount: matches.length,
  };
}

export function waitForDesc(
  contentDesc: string,
  deviceId?: string,
  options: { matchMode?: MatchMode; timeoutMs?: number; intervalMs?: number } = {}
): {
  deviceId: string;
  contentDesc: string;
  matchMode: MatchMode;
  found: boolean;
  elapsedMs: number;
  matchCount: number;
} {
  const targetDeviceId = resolveDeviceId(deviceId);
  const matchMode = options.matchMode ?? 'exact';
  const timeoutMs = options.timeoutMs ?? 5000;
  const intervalMs = options.intervalMs ?? 300;
  const start = Date.now();

  while (Date.now() - start <= timeoutMs) {
    const { xml } = dumpUiHierarchy(targetDeviceId);
    const nodes = extractUiNodes(xml);
    const matches = findNodesBy(nodes, 'contentDesc', contentDesc, matchMode);
    if (matches.length > 0) {
      return {
        deviceId: targetDeviceId,
        contentDesc,
        matchMode,
        found: true,
        elapsedMs: Date.now() - start,
        matchCount: matches.length,
      };
    }
    executeADBCommand(`-s ${targetDeviceId} shell sleep ${intervalMs / 1000}`);
  }

  return {
    deviceId: targetDeviceId,
    contentDesc,
    matchMode,
    found: false,
    elapsedMs: Date.now() - start,
    matchCount: 0,
  };
}

export function waitForDescDisappear(
  contentDesc: string,
  deviceId?: string,
  options: { matchMode?: MatchMode; timeoutMs?: number; intervalMs?: number } = {}
): {
  deviceId: string;
  contentDesc: string;
  matchMode: MatchMode;
  disappeared: boolean;
  elapsedMs: number;
  matchCount: number;
} {
  const targetDeviceId = resolveDeviceId(deviceId);
  const matchMode = options.matchMode ?? 'exact';
  const timeoutMs = options.timeoutMs ?? 5000;
  const intervalMs = options.intervalMs ?? 300;
  const start = Date.now();

  while (Date.now() - start <= timeoutMs) {
    const { xml } = dumpUiHierarchy(targetDeviceId);
    const nodes = extractUiNodes(xml);
    const matches = findNodesBy(nodes, 'contentDesc', contentDesc, matchMode);
    if (matches.length === 0) {
      return {
        deviceId: targetDeviceId,
        contentDesc,
        matchMode,
        disappeared: true,
        elapsedMs: Date.now() - start,
        matchCount: 0,
      };
    }
    executeADBCommand(`-s ${targetDeviceId} shell sleep ${intervalMs / 1000}`);
  }

  const { xml } = dumpUiHierarchy(targetDeviceId);
  const nodes = extractUiNodes(xml);
  const matches = findNodesBy(nodes, 'contentDesc', contentDesc, matchMode);
  return {
    deviceId: targetDeviceId,
    contentDesc,
    matchMode,
    disappeared: false,
    elapsedMs: Date.now() - start,
    matchCount: matches.length,
  };
}

export function waitForActivity(
  activity: string,
  deviceId?: string,
  options: { matchMode?: MatchMode; timeoutMs?: number; intervalMs?: number } = {}
): {
  deviceId: string;
  activity: string;
  matchMode: MatchMode;
  found: boolean;
  elapsedMs: number;
  current?: string;
} {
  const targetDeviceId = resolveDeviceId(deviceId);
  const matchMode = options.matchMode ?? 'exact';
  const timeoutMs = options.timeoutMs ?? 8000;
  const intervalMs = options.intervalMs ?? 300;
  const start = Date.now();

  while (Date.now() - start <= timeoutMs) {
    const current = getCurrentActivity(targetDeviceId);
    const candidate =
      current.component ?? current.activity ?? current.packageName ?? current.raw ?? '';
    if (matchesValue(candidate, activity, matchMode)) {
      return {
        deviceId: targetDeviceId,
        activity,
        matchMode,
        found: true,
        elapsedMs: Date.now() - start,
        current: candidate,
      };
    }
    executeADBCommand(`-s ${targetDeviceId} shell sleep ${intervalMs / 1000}`);
  }

  const fallback = getCurrentActivity(targetDeviceId);
  return {
    deviceId: targetDeviceId,
    activity,
    matchMode,
    found: false,
    elapsedMs: Date.now() - start,
    current: fallback.component ?? fallback.activity ?? fallback.packageName ?? fallback.raw ?? '',
  };
}

export function waitForActivityChange(
  deviceId?: string,
  options: {
    previousActivity?: string;
    targetActivity?: string;
    matchMode?: MatchMode;
    timeoutMs?: number;
    intervalMs?: number;
  } = {}
): { deviceId: string; previous: string; current: string; changed: boolean; elapsedMs: number } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const matchMode = options.matchMode ?? 'exact';
  const timeoutMs = options.timeoutMs ?? 8000;
  const intervalMs = options.intervalMs ?? 300;
  const start = Date.now();

  const initial = options.previousActivity ?? (() => {
    const current = getCurrentActivity(targetDeviceId);
    return current.component ?? current.activity ?? current.packageName ?? current.raw ?? '';
  })();

  while (Date.now() - start <= timeoutMs) {
    const current = getCurrentActivity(targetDeviceId);
    const candidate =
      current.component ?? current.activity ?? current.packageName ?? current.raw ?? '';
    if (options.targetActivity) {
      if (matchesValue(candidate, options.targetActivity, matchMode)) {
        return {
          deviceId: targetDeviceId,
          previous: initial,
          current: candidate,
          changed: true,
          elapsedMs: Date.now() - start,
        };
      }
    } else if (candidate && candidate !== initial) {
      return {
        deviceId: targetDeviceId,
        previous: initial,
        current: candidate,
        changed: true,
        elapsedMs: Date.now() - start,
      };
    }
    executeADBCommand(`-s ${targetDeviceId} shell sleep ${intervalMs / 1000}`);
  }

  const fallback = getCurrentActivity(targetDeviceId);
  const current =
    fallback.component ?? fallback.activity ?? fallback.packageName ?? fallback.raw ?? '';
  return {
    deviceId: targetDeviceId,
    previous: initial,
    current,
    changed: current !== initial,
    elapsedMs: Date.now() - start,
  };
}
export function pressKeySequence(
  keyCodes: Array<string | number>,
  deviceId?: string,
  options: { intervalMs?: number; timeoutMs?: number } = {}
): { deviceId: string; keyCodes: Array<string | number>; output: string } {
  const actions: BatchAction[] = [];
  const intervalMs = options.intervalMs ?? 0;

  keyCodes.forEach((keyCode, index) => {
    actions.push({ type: 'keyevent', keyCode });
    if (intervalMs > 0 && index < keyCodes.length - 1) {
      actions.push({ type: 'sleep', durationMs: intervalMs });
    }
  });

  const result = batchInputActions(actions, deviceId, { timeoutMs: options.timeoutMs });
  return { deviceId: result.deviceId, keyCodes, output: result.output };
}

function resolveRelativePoint(
  deviceId: string,
  xPercent: number,
  yPercent: number
): { x: number; y: number } {
  const { width, height } = getWindowSize(deviceId);
  const x = Math.round((xPercent / 100) * width);
  const y = Math.round((yPercent / 100) * height);
  return { x, y };
}

export function tapRelative(
  xPercent: number,
  yPercent: number,
  deviceId?: string
): { deviceId: string; xPercent: number; yPercent: number; x: number; y: number; output: string } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const { x, y } = resolveRelativePoint(targetDeviceId, xPercent, yPercent);
  const output = executeADBCommand(`-s ${targetDeviceId} shell input tap ${x} ${y}`);

  return { deviceId: targetDeviceId, xPercent, yPercent, x, y, output: output.trim() };
}

export function swipeRelative(
  startXPercent: number,
  startYPercent: number,
  endXPercent: number,
  endYPercent: number,
  deviceId?: string,
  durationMs?: number
): {
  deviceId: string;
  startXPercent: number;
  startYPercent: number;
  endXPercent: number;
  endYPercent: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  durationMs?: number;
  output: string;
} {
  const targetDeviceId = resolveDeviceId(deviceId);
  const { x: startX, y: startY } = resolveRelativePoint(
    targetDeviceId,
    startXPercent,
    startYPercent
  );
  const { x: endX, y: endY } = resolveRelativePoint(
    targetDeviceId,
    endXPercent,
    endYPercent
  );
  const durationArg = typeof durationMs === 'number' ? ` ${durationMs}` : '';
  const output = executeADBCommand(
    `-s ${targetDeviceId} shell input swipe ${startX} ${startY} ${endX} ${endY}${durationArg}`
  );

  return {
    deviceId: targetDeviceId,
    startXPercent,
    startYPercent,
    endXPercent,
    endYPercent,
    startX,
    startY,
    endX,
    endY,
    durationMs,
    output: output.trim(),
  };
}

export function scrollVertical(
  direction: 'up' | 'down',
  deviceId?: string,
  options: { distancePercent?: number; durationMs?: number; startXPercent?: number } = {}
): { deviceId: string; direction: 'up' | 'down'; output: string } {
  const distance = Math.max(10, Math.min(90, options.distancePercent ?? 45));
  const half = distance / 2;
  const startY = 50 + (direction === 'up' ? half : -half);
  const endY = 50 - (direction === 'up' ? half : -half);
  const startX = options.startXPercent ?? 50;
  const result = swipeRelative(startX, startY, startX, endY, deviceId, options.durationMs);
  return { deviceId: result.deviceId, direction, output: result.output };
}

export function scrollHorizontal(
  direction: 'left' | 'right',
  deviceId?: string,
  options: { distancePercent?: number; durationMs?: number; startYPercent?: number } = {}
): { deviceId: string; direction: 'left' | 'right'; output: string } {
  const distance = Math.max(10, Math.min(90, options.distancePercent ?? 45));
  const half = distance / 2;
  const startX = 50 + (direction === 'left' ? half : -half);
  const endX = 50 - (direction === 'left' ? half : -half);
  const startY = options.startYPercent ?? 50;
  const result = swipeRelative(startX, startY, endX, startY, deviceId, options.durationMs);
  return { deviceId: result.deviceId, direction, output: result.output };
}

export function tapCenter(
  deviceId?: string
): { deviceId: string; x: number; y: number; output: string } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const { width, height } = getWindowSize(targetDeviceId);
  const x = Math.round(width / 2);
  const y = Math.round(height / 2);
  const output = executeADBCommand(`-s ${targetDeviceId} shell input tap ${x} ${y}`);

  return { deviceId: targetDeviceId, x, y, output: output.trim() };
}

export function longPress(
  x: number,
  y: number,
  deviceId?: string,
  options: { durationMs?: number } = {}
): { deviceId: string; x: number; y: number; durationMs: number; output: string } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const durationMs = options.durationMs ?? 700;
  const output = executeADBCommand(
    `-s ${targetDeviceId} shell input swipe ${x} ${y} ${x} ${y} ${durationMs}`
  );
  return { deviceId: targetDeviceId, x, y, durationMs, output: output.trim() };
}

export function doubleTap(
  x: number,
  y: number,
  deviceId?: string,
  options: { intervalMs?: number } = {}
): { deviceId: string; x: number; y: number; output: string } {
  const actions: BatchAction[] = [
    { type: 'tap', x, y },
    { type: 'sleep', durationMs: options.intervalMs ?? 80 },
    { type: 'tap', x, y },
  ];
  const result = batchInputActions(actions, deviceId);
  return { deviceId: result.deviceId, x, y, output: result.output };
}

export function waitForUiStable(
  deviceId?: string,
  options: { stableIterations?: number; intervalMs?: number; timeoutMs?: number } = {}
): { deviceId: string; stable: boolean; elapsedMs: number; hash?: string } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const stableIterations = options.stableIterations ?? 3;
  const intervalMs = options.intervalMs ?? 300;
  const timeoutMs = options.timeoutMs ?? 5000;
  const start = Date.now();
  let lastHash = '';
  let stableCount = 0;

  while (Date.now() - start <= timeoutMs) {
    const { xml } = dumpUiHierarchy(targetDeviceId);
    const hash = hashString(xml);
    if (hash === lastHash) {
      stableCount += 1;
      if (stableCount >= stableIterations) {
        return { deviceId: targetDeviceId, stable: true, elapsedMs: Date.now() - start, hash };
      }
    } else {
      stableCount = 0;
      lastHash = hash;
    }

    executeADBCommand(`-s ${targetDeviceId} shell sleep ${intervalMs / 1000}`);
  }

  return { deviceId: targetDeviceId, stable: false, elapsedMs: Date.now() - start, hash: lastHash };
}

export function getScreenHash(
  deviceId?: string
): { deviceId: string; hash: string; length: number } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const { xml } = dumpUiHierarchy(targetDeviceId);
  const hash = hashString(xml);
  return { deviceId: targetDeviceId, hash, length: xml.length };
}

export function waitForPackage(
  packageName: string,
  deviceId?: string,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): { deviceId: string; packageName: string; found: boolean; elapsedMs: number; current?: string } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const timeoutMs = options.timeoutMs ?? 8000;
  const intervalMs = options.intervalMs ?? 300;
  const start = Date.now();

  while (Date.now() - start <= timeoutMs) {
    const current = getCurrentActivity(targetDeviceId);
    const currentPackage = current.packageName ?? '';
    if (currentPackage === packageName) {
      return {
        deviceId: targetDeviceId,
        packageName,
        found: true,
        elapsedMs: Date.now() - start,
        current: currentPackage,
      };
    }
    executeADBCommand(`-s ${targetDeviceId} shell sleep ${intervalMs / 1000}`);
  }

  const fallback = getCurrentActivity(targetDeviceId);
  return {
    deviceId: targetDeviceId,
    packageName,
    found: false,
    elapsedMs: Date.now() - start,
    current: fallback.packageName ?? fallback.raw,
  };
}

export function scrollUntilText(
  text: string,
  deviceId?: string,
  options: {
    matchMode?: MatchMode;
    direction?: 'up' | 'down';
    distancePercent?: number;
    maxScrolls?: number;
    intervalMs?: number;
  } = {}
): { deviceId: string; text: string; found: boolean; scrolls: number; matchCount: number } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const matchMode = options.matchMode ?? 'exact';
  const maxScrolls = options.maxScrolls ?? 6;
  const intervalMs = options.intervalMs ?? 250;
  const direction = options.direction ?? 'down';

  for (let i = 0; i <= maxScrolls; i += 1) {
    const { xml } = dumpUiHierarchy(targetDeviceId);
    const nodes = extractUiNodes(xml);
    const matches = findNodesBy(nodes, 'text', text, matchMode);
    if (matches.length > 0) {
      return {
        deviceId: targetDeviceId,
        text,
        found: true,
        scrolls: i,
        matchCount: matches.length,
      };
    }
    if (i < maxScrolls) {
      scrollVertical(direction, targetDeviceId, { distancePercent: options.distancePercent });
      executeADBCommand(`-s ${targetDeviceId} shell sleep ${intervalMs / 1000}`);
    }
  }

  return { deviceId: targetDeviceId, text, found: false, scrolls: maxScrolls, matchCount: 0 };
}

export function scrollUntilId(
  resourceId: string,
  deviceId?: string,
  options: {
    matchMode?: MatchMode;
    direction?: 'up' | 'down';
    distancePercent?: number;
    maxScrolls?: number;
    intervalMs?: number;
  } = {}
): { deviceId: string; resourceId: string; found: boolean; scrolls: number; matchCount: number } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const matchMode = options.matchMode ?? 'exact';
  const maxScrolls = options.maxScrolls ?? 6;
  const intervalMs = options.intervalMs ?? 250;
  const direction = options.direction ?? 'down';

  for (let i = 0; i <= maxScrolls; i += 1) {
    const { xml } = dumpUiHierarchy(targetDeviceId);
    const nodes = extractUiNodes(xml);
    const matches = findNodesBy(nodes, 'resourceId', resourceId, matchMode);
    if (matches.length > 0) {
      return {
        deviceId: targetDeviceId,
        resourceId,
        found: true,
        scrolls: i,
        matchCount: matches.length,
      };
    }
    if (i < maxScrolls) {
      scrollVertical(direction, targetDeviceId, { distancePercent: options.distancePercent });
      executeADBCommand(`-s ${targetDeviceId} shell sleep ${intervalMs / 1000}`);
    }
  }

  return { deviceId: targetDeviceId, resourceId, found: false, scrolls: maxScrolls, matchCount: 0 };
}

export function scrollUntilDesc(
  contentDesc: string,
  deviceId?: string,
  options: {
    matchMode?: MatchMode;
    direction?: 'up' | 'down';
    distancePercent?: number;
    maxScrolls?: number;
    intervalMs?: number;
  } = {}
): { deviceId: string; contentDesc: string; found: boolean; scrolls: number; matchCount: number } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const matchMode = options.matchMode ?? 'exact';
  const maxScrolls = options.maxScrolls ?? 6;
  const intervalMs = options.intervalMs ?? 250;
  const direction = options.direction ?? 'down';

  for (let i = 0; i <= maxScrolls; i += 1) {
    const { xml } = dumpUiHierarchy(targetDeviceId);
    const nodes = extractUiNodes(xml);
    const matches = findNodesBy(nodes, 'contentDesc', contentDesc, matchMode);
    if (matches.length > 0) {
      return {
        deviceId: targetDeviceId,
        contentDesc,
        found: true,
        scrolls: i,
        matchCount: matches.length,
      };
    }
    if (i < maxScrolls) {
      scrollVertical(direction, targetDeviceId, { distancePercent: options.distancePercent });
      executeADBCommand(`-s ${targetDeviceId} shell sleep ${intervalMs / 1000}`);
    }
  }

  return { deviceId: targetDeviceId, contentDesc, found: false, scrolls: maxScrolls, matchCount: 0 };
}

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

export function runFlowPlan(
  steps: Array<{ type: string; [key: string]: any }>,
  deviceId?: string,
  options: {
    stopOnFailure?: boolean;
    stepRetries?: number;
    retryDelayMs?: number;
    onFailSteps?: Array<{ type: string; [key: string]: any }>;
  } = {}
): { deviceId: string; steps: Array<{ id?: string; type: string; ok: boolean; message?: string; elapsedMs?: number }> } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const stopOnFailure = options.stopOnFailure !== false;
  const defaultRetries = options.stepRetries ?? 0;
  const retryDelayMs = options.retryDelayMs ?? 0;
  const results: Array<{ id?: string; type: string; ok: boolean; message?: string; elapsedMs?: number }> = [];
  const batchActions: BatchAction[] = [];
  const batchMeta: Array<{ id?: string; type: string }> = [];

  const flushBatch = () => {
    if (batchActions.length === 0) return;
    batchInputActions(batchActions, targetDeviceId);
    for (const meta of batchMeta) {
      results.push({ id: meta.id, type: meta.type, ok: true });
    }
    batchActions.length = 0;
    batchMeta.length = 0;
  };

  const pushBatchable = (step: any) => {
    switch (step.type) {
      case 'tap':
        batchActions.push({ type: 'tap', x: step.x, y: step.y });
        batchMeta.push({ id: step.id, type: step.type });
        return true;
      case 'swipe':
        batchActions.push({
          type: 'swipe',
          startX: step.startX,
          startY: step.startY,
          endX: step.endX,
          endY: step.endY,
          durationMs: step.durationMs,
        });
        batchMeta.push({ id: step.id, type: step.type });
        return true;
      case 'swipe_relative': {
        const { x: startX, y: startY } = resolveRelativePoint(
          targetDeviceId,
          step.startXPercent,
          step.startYPercent
        );
        const { x: endX, y: endY } = resolveRelativePoint(
          targetDeviceId,
          step.endXPercent,
          step.endYPercent
        );
        batchActions.push({
          type: 'swipe',
          startX,
          startY,
          endX,
          endY,
          durationMs: step.durationMs,
        });
        batchMeta.push({ id: step.id, type: step.type });
        return true;
      }
      case 'text':
        batchActions.push({ type: 'text', text: step.text });
        batchMeta.push({ id: step.id, type: step.type });
        return true;
      case 'keyevent':
        batchActions.push({ type: 'keyevent', keyCode: step.keyCode });
        batchMeta.push({ id: step.id, type: step.type });
        return true;
      case 'sleep':
        batchActions.push({ type: 'sleep', durationMs: step.durationMs });
        batchMeta.push({ id: step.id, type: step.type });
        return true;
      default:
        return false;
    }
  };

  const executeStepOnce = (step: any): { ok: boolean; message?: string; elapsedMs?: number } => {
    const start = Date.now();
    switch (step.type) {
      case 'tap_relative':
        tapRelative(step.xPercent, step.yPercent, targetDeviceId);
        return { ok: true, elapsedMs: Date.now() - start };
      case 'tap_center':
        tapCenter(targetDeviceId);
        return { ok: true, elapsedMs: Date.now() - start };
      case 'tap_by_text': {
        const res = tapByText(step.text, targetDeviceId, {
          matchMode: step.matchMode,
          index: step.index,
        });
        return {
          ok: res.found,
          message: res.found ? undefined : 'No matching text',
          elapsedMs: Date.now() - start,
        };
      }
      case 'tap_by_id': {
        const res = tapById(step.resourceId, targetDeviceId, { index: step.index });
        return {
          ok: res.found,
          message: res.found ? undefined : 'No matching resource-id',
          elapsedMs: Date.now() - start,
        };
      }
      case 'tap_by_desc': {
        const res = tapByDesc(step.contentDesc, targetDeviceId, {
          matchMode: step.matchMode,
          index: step.index,
        });
        return {
          ok: res.found,
          message: res.found ? undefined : 'No matching content-desc',
          elapsedMs: Date.now() - start,
        };
      }
      case 'type_by_id': {
        const res = typeById(step.resourceId, step.text, targetDeviceId, {
          matchMode: step.matchMode,
          index: step.index,
        });
        return {
          ok: res.found,
          message: res.found ? undefined : 'No matching resource-id',
          elapsedMs: Date.now() - start,
        };
      }
      case 'wait_for_text': {
        const res = waitForText(step.text, targetDeviceId, {
          matchMode: step.matchMode,
          timeoutMs: step.timeoutMs,
          intervalMs: step.intervalMs,
        });
        return {
          ok: res.found,
          message: res.found ? undefined : 'Text not found',
          elapsedMs: Date.now() - start,
        };
      }
      case 'wait_for_id': {
        const res = waitForId(step.resourceId, targetDeviceId, {
          matchMode: step.matchMode,
          timeoutMs: step.timeoutMs,
          intervalMs: step.intervalMs,
        });
        return {
          ok: res.found,
          message: res.found ? undefined : 'Resource-id not found',
          elapsedMs: Date.now() - start,
        };
      }
      case 'wait_for_desc': {
        const res = waitForDesc(step.contentDesc, targetDeviceId, {
          matchMode: step.matchMode,
          timeoutMs: step.timeoutMs,
          intervalMs: step.intervalMs,
        });
        return {
          ok: res.found,
          message: res.found ? undefined : 'Content-desc not found',
          elapsedMs: Date.now() - start,
        };
      }
      case 'wait_for_activity': {
        const res = waitForActivity(step.activity, targetDeviceId, {
          matchMode: step.matchMode,
          timeoutMs: step.timeoutMs,
          intervalMs: step.intervalMs,
        });
        return {
          ok: res.found,
          message: res.found ? undefined : 'Activity not reached',
          elapsedMs: Date.now() - start,
        };
      }
      case 'wait_for_package': {
        const res = waitForPackage(step.packageName, targetDeviceId, {
          timeoutMs: step.timeoutMs,
          intervalMs: step.intervalMs,
        });
        return {
          ok: res.found,
          message: res.found ? undefined : 'Package not in foreground',
          elapsedMs: Date.now() - start,
        };
      }
      case 'press_key_sequence':
        pressKeySequence(step.keyCodes, targetDeviceId, { intervalMs: step.intervalMs });
        return { ok: true, elapsedMs: Date.now() - start };
      case 'assert_text': {
        if (step.timeoutMs || step.intervalMs) {
          const res = waitForText(step.text, targetDeviceId, {
            matchMode: step.matchMode,
            timeoutMs: step.timeoutMs,
            intervalMs: step.intervalMs,
          });
          return {
            ok: res.found,
            message: res.found ? undefined : 'Text not found',
            elapsedMs: Date.now() - start,
          };
        }
        const { xml } = dumpUiHierarchy(targetDeviceId);
        const nodes = extractUiNodes(xml);
        const matches = findNodesBy(nodes, 'text', step.text, step.matchMode ?? 'exact');
        return {
          ok: matches.length > 0,
          message: matches.length > 0 ? undefined : 'Text not found',
          elapsedMs: Date.now() - start,
        };
      }
      case 'assert_id': {
        if (step.timeoutMs || step.intervalMs) {
          const res = waitForId(step.resourceId, targetDeviceId, {
            matchMode: step.matchMode,
            timeoutMs: step.timeoutMs,
            intervalMs: step.intervalMs,
          });
          return {
            ok: res.found,
            message: res.found ? undefined : 'Resource-id not found',
            elapsedMs: Date.now() - start,
          };
        }
        const { xml } = dumpUiHierarchy(targetDeviceId);
        const nodes = extractUiNodes(xml);
        const matches = findNodesBy(nodes, 'resourceId', step.resourceId, step.matchMode ?? 'exact');
        return {
          ok: matches.length > 0,
          message: matches.length > 0 ? undefined : 'Resource-id not found',
          elapsedMs: Date.now() - start,
        };
      }
      case 'assert_desc': {
        if (step.timeoutMs || step.intervalMs) {
          const res = waitForDesc(step.contentDesc, targetDeviceId, {
            matchMode: step.matchMode,
            timeoutMs: step.timeoutMs,
            intervalMs: step.intervalMs,
          });
          return {
            ok: res.found,
            message: res.found ? undefined : 'Content-desc not found',
            elapsedMs: Date.now() - start,
          };
        }
        const { xml } = dumpUiHierarchy(targetDeviceId);
        const nodes = extractUiNodes(xml);
        const matches = findNodesBy(nodes, 'contentDesc', step.contentDesc, step.matchMode ?? 'exact');
        return {
          ok: matches.length > 0,
          message: matches.length > 0 ? undefined : 'Content-desc not found',
          elapsedMs: Date.now() - start,
        };
      }
      case 'assert_activity': {
        if (step.timeoutMs || step.intervalMs) {
          const res = waitForActivity(step.activity, targetDeviceId, {
            matchMode: step.matchMode,
            timeoutMs: step.timeoutMs,
            intervalMs: step.intervalMs,
          });
          return {
            ok: res.found,
            message: res.found ? undefined : 'Activity not reached',
            elapsedMs: Date.now() - start,
          };
        }
        const current = getCurrentActivity(targetDeviceId);
        const value = current.component ?? current.activity ?? '';
        const ok = matchesValue(value, step.activity, step.matchMode ?? 'exact');
        return { ok, message: ok ? undefined : 'Activity not reached', elapsedMs: Date.now() - start };
      }
      case 'assert_package': {
        if (step.timeoutMs || step.intervalMs) {
          const res = waitForPackage(step.packageName, targetDeviceId, {
            timeoutMs: step.timeoutMs,
            intervalMs: step.intervalMs,
          });
          return {
            ok: res.found,
            message: res.found ? undefined : 'Package not in foreground',
            elapsedMs: Date.now() - start,
          };
        }
        const current = getCurrentActivity(targetDeviceId);
        const ok = current.packageName === step.packageName;
        return {
          ok,
          message: ok ? undefined : 'Package not in foreground',
          elapsedMs: Date.now() - start,
        };
      }
      default:
        return { ok: false, message: 'Unknown step type' };
    }
  };

  const runOnFailSteps = () => {
    if (!options.onFailSteps || options.onFailSteps.length === 0) return;
    const fallback = runFlowPlan(options.onFailSteps, targetDeviceId, { stopOnFailure: false });
    results.push(...fallback.steps);
  };

  for (const step of steps) {
    if (pushBatchable(step)) {
      continue;
    }

    flushBatch();

    const retries = typeof step.retries === 'number' ? step.retries : defaultRetries;
    let attempt = 0;
    let lastResult: { ok: boolean; message?: string; elapsedMs?: number } = { ok: false };

    while (attempt <= retries) {
      try {
        lastResult = executeStepOnce(step);
      } catch (error: any) {
        lastResult = { ok: false, message: error?.message ?? String(error) };
      }

      if (lastResult.ok) break;

      attempt += 1;
      if (attempt <= retries && retryDelayMs > 0) {
        executeADBCommand(`-s ${targetDeviceId} shell sleep ${retryDelayMs / 1000}`);
      }
    }

    results.push({
      id: step.id,
      type: step.type,
      ok: lastResult.ok,
      message: lastResult.message,
      elapsedMs: lastResult.elapsedMs,
    });

    if (!lastResult.ok) {
      runOnFailSteps();
      if (stopOnFailure) {
        break;
      }
    }
  }

  flushBatch();

  return { deviceId: targetDeviceId, steps: results };
}

export function getCachedUiDump(
  deviceId?: string,
  options: {
    maxChars?: number;
    maxAgeMs?: number;
    invalidateOnActivityChange?: boolean;
    refresh?: boolean;
  } = {}
): {
  deviceId: string;
  xml: string;
  length: number;
  truncated?: boolean;
  filePath: string;
  ageMs: number;
  hash?: string;
} {
  const targetDeviceId = resolveDeviceId(deviceId);
  const cached = UI_DUMP_CACHE[targetDeviceId];
  const maxAgeMs = options.maxAgeMs ?? 0;
  const invalidateOnActivityChange = options.invalidateOnActivityChange !== false;

  if (cached) {
    const ageMs = Date.now() - cached.timestamp;
    const isFresh = maxAgeMs <= 0 ? true : ageMs <= maxAgeMs;
    let activityMatches = true;

    if (invalidateOnActivityChange && cached.activity) {
      const current = getCurrentActivity(targetDeviceId);
      const currentActivity = current.component ?? current.activity ?? '';
      activityMatches = !currentActivity || currentActivity === cached.activity;
    }

    if (isFresh && activityMatches) {
      const xml = cached.xml;
      if (options.maxChars && xml.length > options.maxChars) {
        return {
          deviceId: targetDeviceId,
          xml: xml.slice(0, options.maxChars),
          length: options.maxChars,
          truncated: true,
          filePath: cached.filePath,
          ageMs,
          hash: cached.hash,
        };
      }

      return {
        deviceId: targetDeviceId,
        xml,
        length: xml.length,
        filePath: cached.filePath,
        ageMs,
        hash: cached.hash,
      };
    }
  }

  if (!options.refresh) {
    throw new ADBCommandError('UI_DUMP_CACHE_MISS', 'No cached UI dump for device', {
      deviceId: targetDeviceId,
    });
  }

  const fresh = dumpUiHierarchy(targetDeviceId, {
    maxChars: options.maxChars,
    cache: false,
  });

  return {
    deviceId: targetDeviceId,
    xml: fresh.xml,
    length: fresh.length,
    truncated: fresh.truncated,
    filePath: fresh.filePath,
    ageMs: 0,
    hash: UI_DUMP_CACHE[targetDeviceId]?.hash,
  };
}

export function queryUi(
  selector: UiSelector,
  deviceId?: string,
  options: {
    maxResults?: number;
    useCache?: boolean;
    maxAgeMs?: number;
    invalidateOnActivityChange?: boolean;
  } = {}
): { deviceId: string; selector: UiSelector; count: number; nodes: UiNode[] } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const { xml } = dumpUiHierarchy(targetDeviceId, {
    cache: options.useCache,
    maxAgeMs: options.maxAgeMs,
    invalidateOnActivityChange: options.invalidateOnActivityChange,
  });
  const nodes = extractUiNodes(xml);
  const matches = queryNodes(nodes, selector);
  const maxResults = options.maxResults ?? matches.length;
  return {
    deviceId: targetDeviceId,
    selector,
    count: matches.length,
    nodes: matches.slice(0, maxResults),
  };
}

export function waitForNodeCount(
  selector: UiSelector,
  count: number,
  comparator: 'eq' | 'gte' | 'lte',
  deviceId?: string,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): { deviceId: string; selector: UiSelector; count: number; comparator: string; found: boolean; elapsedMs: number; matchCount: number } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const timeoutMs = options.timeoutMs ?? 5000;
  const intervalMs = options.intervalMs ?? 300;
  const start = Date.now();

  while (Date.now() - start <= timeoutMs) {
    const { xml } = dumpUiHierarchy(targetDeviceId);
    const nodes = extractUiNodes(xml);
    const matches = queryNodes(nodes, selector);
    const matchCount = matches.length;
    const ok =
      comparator === 'eq'
        ? matchCount === count
        : comparator === 'gte'
          ? matchCount >= count
          : matchCount <= count;

    if (ok) {
      return {
        deviceId: targetDeviceId,
        selector,
        count,
        comparator,
        found: true,
        elapsedMs: Date.now() - start,
        matchCount,
      };
    }
    executeADBCommand(`-s ${targetDeviceId} shell sleep ${intervalMs / 1000}`);
  }

  const { xml } = dumpUiHierarchy(targetDeviceId);
  const nodes = extractUiNodes(xml);
  const matches = queryNodes(nodes, selector);
  return {
    deviceId: targetDeviceId,
    selector,
    count,
    comparator,
    found: false,
    elapsedMs: Date.now() - start,
    matchCount: matches.length,
  };
}

export function tapBySelectorIndex(
  selector: UiSelector,
  index: number,
  deviceId?: string,
  useFallback = true
): {
  deviceId: string;
  selector: UiSelector;
  index: number;
  found: boolean;
  x?: number;
  y?: number;
  output?: string;
  clickableFallbackUsed?: boolean;
  fallbackReason?: 'direct' | 'clickable_container' | 'nearest_clickable' | 'no_bounds';
} {
  const targetDeviceId = resolveDeviceId(deviceId);
  const { xml } = dumpUiHierarchy(targetDeviceId);
  const nodes = extractUiNodes(xml);
  const matches = queryNodes(nodes, selector);
  const match = matches[index];

  if (!match) {
    return { deviceId: targetDeviceId, selector, index, found: false };
  }

  const selection = useFallback === false
    ? { node: match, usedFallback: false }
    : resolveTapTarget(nodes, match);
  if (!selection.node.bounds) {
    return {
      deviceId: targetDeviceId,
      selector,
      index,
      found: false,
      clickableFallbackUsed: useFallback,
      fallbackReason: 'no_bounds',
    };
  }

  const { x, y, output } = tapUiNode(targetDeviceId, selection.node);
  return {
    deviceId: targetDeviceId,
    selector,
    index,
    found: true,
    x,
    y,
    output,
    clickableFallbackUsed: selection.usedFallback,
    fallbackReason: selection.fallbackReason,
  };
}

export function typeById(
  resourceId: string,
  text: string,
  deviceId?: string,
  options: { index?: number; matchMode?: MatchMode } = {}
): { deviceId: string; resourceId: string; text: string; index: number; found: boolean; output?: string } {
  const targetDeviceId = resolveDeviceId(deviceId);
  const { xml } = dumpUiHierarchy(targetDeviceId);
  const nodes = extractUiNodes(xml);
  const index = options.index ?? 0;
  const matchMode = options.matchMode ?? 'exact';
  const matches = findNodesBy(nodes, 'resourceId', resourceId, matchMode);

  if (!matches[index]) {
    return { deviceId: targetDeviceId, resourceId, text, index, found: false };
  }

  tapUiNode(targetDeviceId, matches[index]);
  const input = inputText(text, targetDeviceId);
  return { deviceId: targetDeviceId, resourceId, text, index, found: true, output: input.output };
}

export function runAndroidShellCommand(options: {
  command: string;
  deviceId?: string;
  timeoutMs?: number;
}): { deviceId: string; command: string; output: string } {
  const result = executeADBCommandOnDevice(`shell ${options.command}`, options.deviceId, {
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT,
    maxBuffer: DEFAULT_BINARY_MAX_BUFFER,
  });

  return {
    deviceId: result.deviceId,
    command: options.command,
    output: result.output.trim(),
  };
}

export function runAndroidMonkey(options: {
  deviceId?: string;
  packageName?: string;
  eventCount?: number;
  throttleMs?: number;
  seed?: number;
  ignoreCrashes?: boolean;
  ignoreTimeouts?: boolean;
  ignoreSecurityExceptions?: boolean;
  monitorNativeCrashes?: boolean;
  timeoutMs?: number;
}): {
  deviceId: string;
  packageName?: string;
  eventCount: number;
  throttleMs: number;
  seed?: number;
  output: string;
} {
  const targetDeviceId = resolveDeviceId(options.deviceId);
  const eventCount = options.eventCount ?? 1000;
  const throttleMs = options.throttleMs ?? 0;
  const commandParts: string[] = ['shell monkey'];

  if (options.packageName) {
    commandParts.push(`-p ${escapeShellArg(options.packageName)}`);
  }
  if (throttleMs > 0) {
    commandParts.push(`--throttle ${throttleMs}`);
  }
  if (typeof options.seed === 'number') {
    commandParts.push(`-s ${Math.trunc(options.seed)}`);
  }
  if (options.ignoreCrashes !== false) {
    commandParts.push('--ignore-crashes');
  }
  if (options.ignoreTimeouts !== false) {
    commandParts.push('--ignore-timeouts');
  }
  if (options.ignoreSecurityExceptions !== false) {
    commandParts.push('--ignore-security-exceptions');
  }
  if (options.monitorNativeCrashes !== false) {
    commandParts.push('--monitor-native-crashes');
  }

  commandParts.push(String(eventCount));

  const defaultTimeoutMs = Math.max(DEFAULT_TIMEOUT, eventCount * throttleMs + 30000);
  const { output } = executeADBCommandOnDevice(commandParts.join(' '), targetDeviceId, {
    timeout: options.timeoutMs ?? defaultTimeoutMs,
    maxBuffer: DEFAULT_BINARY_MAX_BUFFER,
  });

  return {
    deviceId: targetDeviceId,
    packageName: options.packageName,
    eventCount,
    throttleMs,
    seed: options.seed,
    output: output.trim(),
  };
}

export function recordAndroidScreen(options: {
  deviceId?: string;
  durationSec?: number;
  bitRateMbps?: number;
  size?: string;
  rotate?: boolean;
  bugreport?: boolean;
  remotePath?: string;
  localPath?: string;
  deleteRemote?: boolean;
}): {
  deviceId: string;
  durationSec: number;
  remotePath: string;
  localPath: string;
  recordOutput: string;
  pullOutput: string;
  deleteOutput?: string;
} {
  const targetDeviceId = resolveDeviceId(options.deviceId);
  const durationSec = Math.max(1, Math.min(180, Math.trunc(options.durationSec ?? 15)));
  const remotePath = options.remotePath ?? `/sdcard/mcp-screenrecord-${Date.now()}.mp4`;
  const defaultLocalPath = path.resolve(
    process.cwd(),
    'artifacts',
    path.basename(remotePath.endsWith('.mp4') ? remotePath : `${remotePath}.mp4`)
  );
  const localPath = options.localPath
    ? path.resolve(process.cwd(), options.localPath)
    : defaultLocalPath;
  fs.mkdirSync(path.dirname(localPath), { recursive: true });

  const recordParts = ['shell screenrecord', `--time-limit ${durationSec}`];
  if (typeof options.bitRateMbps === 'number' && options.bitRateMbps > 0) {
    recordParts.push(`--bit-rate ${Math.trunc(options.bitRateMbps * 1_000_000)}`);
  }
  if (options.size) {
    recordParts.push(`--size ${escapeShellArg(options.size)}`);
  }
  if (options.rotate) {
    recordParts.push('--rotate');
  }
  if (options.bugreport) {
    recordParts.push('--bugreport');
  }
  recordParts.push(escapeShellArg(remotePath));

  const { output: recordOutput } = executeADBCommandOnDevice(recordParts.join(' '), targetDeviceId, {
    timeout: (durationSec + 20) * 1000,
    maxBuffer: DEFAULT_BINARY_MAX_BUFFER,
  });

  const pullOutput = executeADBCommand(
    `-s ${targetDeviceId} pull ${escapeShellArg(remotePath)} ${escapeShellArg(localPath)}`,
    { timeout: 120000, maxBuffer: DEFAULT_BINARY_MAX_BUFFER }
  );

  let deleteOutput: string | undefined;
  if (options.deleteRemote !== false) {
    try {
      const remove = executeADBCommandOnDevice(
        `shell rm ${escapeShellArg(remotePath)}`,
        targetDeviceId
      );
      deleteOutput = remove.output.trim();
    } catch {
      deleteOutput = undefined;
    }
  }

  return {
    deviceId: targetDeviceId,
    durationSec,
    remotePath,
    localPath,
    recordOutput: recordOutput.trim(),
    pullOutput: pullOutput.trim(),
    deleteOutput,
  };
}

export function captureAndroidBugreport(options: {
  deviceId?: string;
  outputDir?: string;
  filePrefix?: string;
  timeoutMs?: number;
}): {
  deviceId: string;
  outputDir: string;
  outputBasePath: string;
  generatedFiles: string[];
  output: string;
} {
  const targetDeviceId = resolveDeviceId(options.deviceId);
  const outputDir = path.resolve(process.cwd(), options.outputDir ?? 'artifacts/bugreports');
  fs.mkdirSync(outputDir, { recursive: true });

  const rawPrefix = options.filePrefix ?? `bugreport-${targetDeviceId}-${Date.now()}`;
  const safePrefix = rawPrefix.replace(/[^a-zA-Z0-9._-]+/g, '-');
  const outputBasePath = path.join(outputDir, safePrefix);
  const beforeFiles = new Set(fs.readdirSync(outputDir));

  const output = executeADBCommand(
    `-s ${targetDeviceId} bugreport ${escapeShellArg(outputBasePath)}`,
    {
      timeout: options.timeoutMs ?? 10 * 60 * 1000,
      maxBuffer: DEFAULT_BINARY_MAX_BUFFER,
    }
  );

  const generatedFiles = fs
    .readdirSync(outputDir)
    .filter(name => !beforeFiles.has(name))
    .filter(name => name.startsWith(safePrefix))
    .map(name => path.join(outputDir, name));

  return {
    deviceId: targetDeviceId,
    outputDir,
    outputBasePath,
    generatedFiles,
    output: output.trim(),
  };
}

export function collectAndroidDiagnostics(options: {
  deviceId?: string;
  packageName?: string;
  propertyPrefix?: string;
  logcatLines?: number;
  logcatSince?: string;
  logcatPriority?: 'V' | 'D' | 'I' | 'W' | 'E' | 'F' | 'S';
  includeUiDump?: boolean;
  uiMaxChars?: number;
  uiUseCache?: boolean;
  uiMaxAgeMs?: number;
}): {
  deviceId: string;
  capturedAt: string;
  activity: ReturnType<typeof getCurrentActivity>;
  windowSize: ReturnType<typeof getWindowSize>;
  screenHash: ReturnType<typeof getScreenHash>;
  properties: ReturnType<typeof getAndroidProperties>;
  logcat: ReturnType<typeof getLogcat>;
  uiDump?: ReturnType<typeof dumpUiHierarchy>;
  packageInstalled?: ReturnType<typeof isAppInstalled>;
  packageVersion?: ReturnType<typeof getAppVersion>;
} {
  const targetDeviceId = resolveDeviceId(options.deviceId);
  const activity = getCurrentActivity(targetDeviceId);
  const windowSize = getWindowSize(targetDeviceId);
  const screenHash = getScreenHash(targetDeviceId);
  const properties = getAndroidProperties(targetDeviceId, {
    prefix: options.propertyPrefix,
  });
  const logcat = getLogcat({
    deviceId: targetDeviceId,
    lines: options.logcatLines ?? 200,
    since: options.logcatSince,
    priority: options.logcatPriority,
    packageName: options.packageName,
  });

  const includeUiDump = options.includeUiDump !== false;
  const uiDump = includeUiDump
    ? dumpUiHierarchy(targetDeviceId, {
        maxChars: options.uiMaxChars,
        cache: options.uiUseCache,
        maxAgeMs: options.uiMaxAgeMs,
      })
    : undefined;

  let packageInstalled: ReturnType<typeof isAppInstalled> | undefined;
  let packageVersion: ReturnType<typeof getAppVersion> | undefined;
  if (options.packageName) {
    packageInstalled = isAppInstalled(options.packageName, targetDeviceId);
    if (packageInstalled.installed) {
      packageVersion = getAppVersion(options.packageName, targetDeviceId);
    }
  }

  return {
    deviceId: targetDeviceId,
    capturedAt: new Date().toISOString(),
    activity,
    windowSize,
    screenHash,
    properties,
    logcat,
    uiDump,
    packageInstalled,
    packageVersion,
  };
}

function safeDeviceCommand(
  targetDeviceId: string,
  command: string,
  timeout = DEFAULT_TIMEOUT
): string {
  try {
    const { output } = executeADBCommandOnDevice(command, targetDeviceId, {
      timeout,
      maxBuffer: DEFAULT_BINARY_MAX_BUFFER,
    });
    return output.trim();
  } catch (error) {
    return `ERROR: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export function captureAndroidPerformanceSnapshot(options: {
  deviceId?: string;
  packageName?: string;
  topLines?: number;
  includeMeminfo?: boolean;
  includeGfxInfo?: boolean;
  includeCpuInfo?: boolean;
  includeCpuFreq?: boolean;
}): {
  deviceId: string;
  capturedAt: string;
  packageName?: string;
  top: string;
  loadAverage: string;
  meminfo?: string;
  gfxinfo?: string;
  cpuinfo?: string;
  cpuFrequency?: string;
} {
  const targetDeviceId = resolveDeviceId(options.deviceId);
  const topLines = Math.max(10, Math.min(200, Math.trunc(options.topLines ?? 60)));
  const packageName = options.packageName?.trim() || undefined;
  const packageArg = packageName ? ` ${escapeShellArg(packageName)}` : '';

  const top = safeDeviceCommand(targetDeviceId, `shell top -b -n 1 | head -n ${topLines}`, 45000);
  const loadAverage = safeDeviceCommand(targetDeviceId, 'shell cat /proc/loadavg');
  const meminfo =
    options.includeMeminfo === false
      ? undefined
      : safeDeviceCommand(targetDeviceId, `shell dumpsys meminfo${packageArg}`, 90000);
  const gfxinfo =
    options.includeGfxInfo === false || !packageName
      ? undefined
      : safeDeviceCommand(
          targetDeviceId,
          `shell dumpsys gfxinfo ${escapeShellArg(packageName)} framestats`,
          90000
        );
  const cpuinfo =
    options.includeCpuInfo === true
      ? safeDeviceCommand(targetDeviceId, 'shell cat /proc/cpuinfo', 30000)
      : undefined;
  const cpuFrequency =
    options.includeCpuFreq === false
      ? undefined
      : safeDeviceCommand(
          targetDeviceId,
          "shell for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_cur_freq; do [ -f \"$f\" ] && echo \"$f:$(cat $f)\"; done",
          20000
        );

  return {
    deviceId: targetDeviceId,
    capturedAt: new Date().toISOString(),
    packageName,
    top,
    loadAverage,
    meminfo,
    gfxinfo,
    cpuinfo,
    cpuFrequency,
  };
}

export function captureAndroidBatterySnapshot(options: {
  deviceId?: string;
  includeHistory?: boolean;
  historyLines?: number;
  resetStats?: boolean;
}): {
  deviceId: string;
  capturedAt: string;
  battery: string;
  batteryStats: string;
  batteryProperties: string;
  history?: string;
  resetOutput?: string;
} {
  const targetDeviceId = resolveDeviceId(options.deviceId);
  const includeHistory = options.includeHistory === true;
  const historyLines = Math.max(50, Math.min(2000, Math.trunc(options.historyLines ?? 300)));

  const battery = safeDeviceCommand(targetDeviceId, 'shell dumpsys battery', 30000);
  const batteryStats = safeDeviceCommand(targetDeviceId, 'shell dumpsys batterystats', 120000);
  const batteryProperties = safeDeviceCommand(
    targetDeviceId,
    'shell getprop | grep -E "battery|power_supply"'
  );
  const history = includeHistory
    ? safeDeviceCommand(
        targetDeviceId,
        `shell dumpsys batterystats --history | tail -n ${historyLines}`,
        120000
      )
    : undefined;
  const resetOutput =
    options.resetStats === true
      ? safeDeviceCommand(targetDeviceId, 'shell dumpsys batterystats --reset', 30000)
      : undefined;

  return {
    deviceId: targetDeviceId,
    capturedAt: new Date().toISOString(),
    battery,
    batteryStats,
    batteryProperties,
    history,
    resetOutput,
  };
}

export function captureAndroidNetworkSnapshot(options: {
  deviceId?: string;
  includeWifi?: boolean;
  includeConnectivity?: boolean;
  includeNetstats?: boolean;
}): {
  deviceId: string;
  capturedAt: string;
  ipAddress: string;
  ipRoute: string;
  dnsProperties: string;
  wifi?: string;
  connectivity?: string;
  netstats?: string;
} {
  const targetDeviceId = resolveDeviceId(options.deviceId);
  const ipAddress = safeDeviceCommand(targetDeviceId, 'shell ip addr show', 30000);
  const ipRoute = safeDeviceCommand(targetDeviceId, 'shell ip route show', 30000);
  const dnsProperties = safeDeviceCommand(
    targetDeviceId,
    'shell getprop | grep -E "\\[net\\.dns|\\[dhcp\\."'
  );
  const wifi =
    options.includeWifi === false
      ? undefined
      : safeDeviceCommand(targetDeviceId, 'shell dumpsys wifi | head -n 400', 120000);
  const connectivity =
    options.includeConnectivity === false
      ? undefined
      : safeDeviceCommand(
          targetDeviceId,
          'shell dumpsys connectivity | head -n 300',
          120000
        );
  const netstats =
    options.includeNetstats === false
      ? undefined
      : safeDeviceCommand(targetDeviceId, 'shell dumpsys netstats --summary', 120000);

  return {
    deviceId: targetDeviceId,
    capturedAt: new Date().toISOString(),
    ipAddress,
    ipRoute,
    dnsProperties,
    wifi,
    connectivity,
    netstats,
  };
}

export function captureAndroidStorageSnapshot(options: {
  deviceId?: string;
  packageName?: string;
  includePackageUsage?: boolean;
}): {
  deviceId: string;
  capturedAt: string;
  packageName?: string;
  df: string;
  diskstats: string;
  packagePaths?: string;
  packageDataUsage?: string;
  packageMediaUsage?: string;
} {
  const targetDeviceId = resolveDeviceId(options.deviceId);
  const packageName = options.packageName?.trim() || undefined;
  const df = safeDeviceCommand(targetDeviceId, 'shell df -h', 45000);
  const diskstats = safeDeviceCommand(targetDeviceId, 'shell dumpsys diskstats', 120000);
  const packagePaths = packageName
    ? safeDeviceCommand(targetDeviceId, `shell pm path ${escapeShellArg(packageName)}`)
    : undefined;
  const packageUsageEnabled = options.includePackageUsage !== false && !!packageName;
  const packageDataUsage = packageUsageEnabled
    ? safeDeviceCommand(targetDeviceId, `shell du -sh /data/data/${packageName}`)
    : undefined;
  const packageMediaUsage = packageUsageEnabled
    ? safeDeviceCommand(targetDeviceId, `shell du -sh /sdcard/Android/data/${packageName}`)
    : undefined;

  return {
    deviceId: targetDeviceId,
    capturedAt: new Date().toISOString(),
    packageName,
    df,
    diskstats,
    packagePaths,
    packageDataUsage,
    packageMediaUsage,
  };
}

export function captureAndroidCrashSnapshot(options: {
  deviceId?: string;
  packageName?: string;
  logcatLines?: number;
  includeAnrTraces?: boolean;
  includeTombstones?: boolean;
  includeDropBox?: boolean;
}): {
  deviceId: string;
  capturedAt: string;
  packageName?: string;
  crashBuffer: string;
  activityCrashes: string;
  packageCrashLog?: ReturnType<typeof getLogcat>;
  anrTraces?: string;
  tombstones?: string;
  dropboxCrashes?: string;
} {
  const targetDeviceId = resolveDeviceId(options.deviceId);
  const packageName = options.packageName?.trim() || undefined;
  const logcatLines = Math.max(50, Math.min(5000, Math.trunc(options.logcatLines ?? 500)));

  const crashBuffer = safeDeviceCommand(
    targetDeviceId,
    `shell logcat -d -b crash -t ${logcatLines}`,
    90000
  );
  const activityCrashes = safeDeviceCommand(
    targetDeviceId,
    'shell dumpsys activity crashes',
    45000
  );
  const packageCrashLog = packageName
    ? getLogcat({
        deviceId: targetDeviceId,
        lines: logcatLines,
        packageName,
        format: 'threadtime',
      })
    : undefined;
  const anrTraces =
    options.includeAnrTraces === false
      ? undefined
      : safeDeviceCommand(
          targetDeviceId,
          `shell cat /data/anr/traces.txt | tail -n ${logcatLines}`,
          90000
        );
  const tombstones =
    options.includeTombstones === false
      ? undefined
      : safeDeviceCommand(targetDeviceId, 'shell ls -lt /data/tombstones', 30000);
  const dropboxCrashes =
    options.includeDropBox === true
      ? safeDeviceCommand(
          targetDeviceId,
          'shell dumpsys dropbox --print system_app_crash data_app_crash',
          120000
        )
      : undefined;

  return {
    deviceId: targetDeviceId,
    capturedAt: new Date().toISOString(),
    packageName,
    crashBuffer,
    activityCrashes,
    packageCrashLog,
    anrTraces,
    tombstones,
    dropboxCrashes,
  };
}
