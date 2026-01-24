import { execSync, ExecSyncOptions } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  AndroidDevice,
  ADBCommandError,
  ADBNotFoundError,
  APKNotFoundError,
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
  options: { maxChars?: number } = {}
): { deviceId: string; xml: string; length: number; truncated?: boolean; filePath: string } {
  const filePath = '/sdcard/mcp_ui.xml';
  const { deviceId: targetDeviceId } = executeADBCommandOnDevice(
    `shell uiautomator dump ${escapeShellArg(filePath)}`,
    deviceId,
    { timeout: 10000 }
  );

  const output = executeADBCommand(
    `-s ${targetDeviceId} exec-out cat ${escapeShellArg(filePath)}`,
    { timeout: 10000 }
  );

  executeADBCommand(`-s ${targetDeviceId} shell rm ${escapeShellArg(filePath)}`);

  const xml = output.trim();
  if (!xml) {
    throw new ADBCommandError(
      'UI_DUMP_FAILED',
      `Failed to dump UI hierarchy from device '${targetDeviceId}'`,
      { deviceId: targetDeviceId }
    );
  }

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
  deviceId?: string
): { deviceId: string; packageName: string; activity?: string; output: string } {
  const target = activity
    ? activity.includes('/')
      ? activity
      : `${packageName}/${activity}`
    : packageName;
  const args = activity
    ? `shell am start -n ${escapeShellArg(target)}`
    : `shell monkey -p ${escapeShellArg(packageName)} -c android.intent.category.LAUNCHER 1`;
  const { deviceId: targetDeviceId, output } = executeADBCommandOnDevice(args, deviceId);

  return {
    deviceId: targetDeviceId,
    packageName,
    activity,
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
}): {
  deviceId: string;
  reversedPorts: Array<{ devicePort: number; hostPort: number; output: string }>;
  install?: { deviceId: string; apkPath: string; output: string; success: boolean };
  stop?: { deviceId: string; packageName: string; output: string };
  start?: { deviceId: string; packageName: string; activity?: string; output: string };
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

  return {
    deviceId: targetDeviceId,
    reversedPorts,
    install: installResult,
    stop: stopResult,
    start: startResult,
  };
}
