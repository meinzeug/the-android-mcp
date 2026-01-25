import { z } from 'zod';

// Device information interfaces
export interface AndroidDevice {
  id: string;
  status: 'device' | 'offline' | 'unauthorized' | 'unknown';
  model?: string;
  product?: string;
  transportId?: string;
  usb?: string;
  productString?: string;
}

// Screenshot response interfaces
export interface ScreenshotResponse {
  data: string; // Base64 encoded image data
  format: 'png';
  width: number;
  height: number;
  deviceId: string;
  timestamp: number;
}

// Error handling interfaces
export interface ADBError {
  code: string;
  message: string;
  details?: any;
  suggestion?: string;
}

export class ADBCommandError extends Error implements ADBError {
  code: string;
  details?: any;
  suggestion?: string;

  constructor(code: string, message: string, details?: any, suggestion?: string) {
    super(message);
    this.name = 'ADBCommandError';
    this.code = code;
    this.details = details;
    this.suggestion = suggestion;
  }
}

export class ADBNotFoundError extends ADBCommandError {
  constructor() {
    super(
      'ADB_NOT_FOUND',
      'Android Debug Bridge (ADB) not found',
      null,
      'Please install Android SDK Platform Tools and ensure ADB is in your PATH'
    );
    this.name = 'ADBNotFoundError';
  }
}

export class DeviceNotFoundError extends ADBCommandError {
  constructor(deviceId: string) {
    super(
      'DEVICE_NOT_FOUND',
      `Device with ID '${deviceId}' not found`,
      { deviceId },
      'Please check if the device is connected and authorized'
    );
    this.name = 'DeviceNotFoundError';
  }
}

export class NoDevicesFoundError extends ADBCommandError {
  constructor() {
    super(
      'NO_DEVICES_FOUND',
      'No Android devices found',
      null,
      'Please connect an Android device or start an emulator and ensure USB debugging is enabled'
    );
    this.name = 'NoDevicesFoundError';
  }
}

export class ScreenshotCaptureError extends ADBCommandError {
  constructor(deviceId: string, originalError?: Error) {
    super(
      'SCREENSHOT_CAPTURE_FAILED',
      `Failed to capture screenshot from device '${deviceId}'`,
      { deviceId, originalError: originalError?.message },
      'Please ensure the device is connected and screen is unlocked'
    );
    this.name = 'ScreenshotCaptureError';
  }
}

export class APKNotFoundError extends ADBCommandError {
  constructor(projectRoot?: string, searchedPaths?: string[]) {
    super(
      'APK_NOT_FOUND',
      'No APK files found to install',
      { projectRoot, searchedPaths },
      'Build a debug APK (e.g., ./gradlew assembleDebug) or provide an apkPath explicitly'
    );
    this.name = 'APKNotFoundError';
  }
}

export class APKDownloadError extends ADBCommandError {
  constructor(url: string, details?: any) {
    super(
      'APK_DOWNLOAD_FAILED',
      `Failed to download APK from '${url}'`,
      { url, ...details },
      'Check the URL or your network connection, and try again'
    );
    this.name = 'APKDownloadError';
  }
}

export class PackageNotRunningError extends ADBCommandError {
  constructor(packageName: string) {
    super(
      'PACKAGE_NOT_RUNNING',
      `Package '${packageName}' is not running`,
      { packageName },
      'Start the app before requesting logcat filtered by package'
    );
    this.name = 'PackageNotRunningError';
  }
}

// Tool input schemas
export const TakeScreenshotInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe(
      'The ID of the Android device to capture a screenshot from. If not provided, uses the first available device.'
    ),
  format: z
    .enum(['png'])
    .default('png')
    .describe('The image format for the screenshot. Currently only PNG is supported.'),
});

export const ListDevicesInputSchema = z.object({});

export const FindApkInputSchema = z.object({
  projectRoot: z
    .string()
    .optional()
    .describe('Optional project root to search for APKs. Defaults to current working directory.'),
});

export const InstallApkInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  apkPath: z
    .string()
    .optional()
    .describe(
      'Path to APK to install. If omitted, the server searches common build output folders.'
    ),
  apkUrl: z
    .string()
    .url()
    .optional()
    .describe('Optional URL to download an APK before installing.'),
  projectRoot: z
    .string()
    .optional()
    .describe('Optional project root to search for APKs when apkPath is omitted.'),
  reinstall: z
    .boolean()
    .default(true)
    .describe('Whether to reinstall the APK if it is already installed (-r).'),
  grantPermissions: z
    .boolean()
    .default(true)
    .describe('Whether to grant all runtime permissions at install time (-g).'),
  allowTestPackages: z
    .boolean()
    .default(false)
    .describe('Whether to allow installing test-only APKs (-t).'),
  allowDowngrade: z
    .boolean()
    .default(false)
    .describe('Whether to allow version downgrade (-d).'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional timeout in milliseconds for the install command.'),
});

export const UninstallAppInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  packageName: z.string().min(1).describe('Android application package name (e.g., com.example.app)'),
  keepData: z
    .boolean()
    .default(false)
    .describe('Whether to keep app data and cache directories (-k).'),
});

export const StartAppInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  packageName: z.string().min(1).describe('Android application package name (e.g., com.example.app)'),
  activity: z
    .string()
    .optional()
    .describe('Optional fully qualified activity name to launch (e.g., .MainActivity).'),
});

export const StopAppInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  packageName: z.string().min(1).describe('Android application package name (e.g., com.example.app)'),
});

export const ClearAppDataInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  packageName: z.string().min(1).describe('Android application package name (e.g., com.example.app)'),
});

export const TapInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  x: z.number().int().min(0).describe('Tap X coordinate in pixels.'),
  y: z.number().int().min(0).describe('Tap Y coordinate in pixels.'),
});

export const SwipeInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  startX: z.number().int().min(0).describe('Start X coordinate in pixels.'),
  startY: z.number().int().min(0).describe('Start Y coordinate in pixels.'),
  endX: z.number().int().min(0).describe('End X coordinate in pixels.'),
  endY: z.number().int().min(0).describe('End Y coordinate in pixels.'),
  durationMs: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Optional swipe duration in milliseconds.'),
});

export const InputTextInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  text: z.string().min(1).describe('Text to input into the focused field.'),
});

export const KeyeventInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  keyCode: z
    .union([z.string(), z.number().int()])
    .describe('Android keycode (e.g., 3 for HOME, 4 for BACK, KEYCODE_ENTER).'),
});

const BatchActionTapSchema = z.object({
  type: z.literal('tap'),
  x: z.number().int().min(0).describe('Tap X coordinate in pixels.'),
  y: z.number().int().min(0).describe('Tap Y coordinate in pixels.'),
});

const BatchActionSwipeSchema = z.object({
  type: z.literal('swipe'),
  startX: z.number().int().min(0).describe('Start X coordinate in pixels.'),
  startY: z.number().int().min(0).describe('Start Y coordinate in pixels.'),
  endX: z.number().int().min(0).describe('End X coordinate in pixels.'),
  endY: z.number().int().min(0).describe('End Y coordinate in pixels.'),
  durationMs: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Optional swipe duration in milliseconds.'),
});

const BatchActionTextSchema = z.object({
  type: z.literal('text'),
  text: z.string().min(1).describe('Text to input into the focused field.'),
});

const BatchActionKeyeventSchema = z.object({
  type: z.literal('keyevent'),
  keyCode: z
    .union([z.string(), z.number().int()])
    .describe('Android keycode (e.g., 3 for HOME, 4 for BACK, KEYCODE_ENTER).'),
});

const BatchActionSleepSchema = z.object({
  type: z.literal('sleep'),
  durationMs: z.number().int().min(0).describe('Sleep duration in milliseconds.'),
});

export const BatchActionSchema = z.discriminatedUnion('type', [
  BatchActionTapSchema,
  BatchActionSwipeSchema,
  BatchActionTextSchema,
  BatchActionKeyeventSchema,
  BatchActionSleepSchema,
]);

export const BatchActionsInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  actions: z.array(BatchActionSchema).min(1).describe('Ordered list of actions to run.'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional timeout in milliseconds for the batch command.'),
  captureBefore: z
    .boolean()
    .default(false)
    .describe('Capture a screenshot before running the batch actions.'),
  captureAfter: z
    .boolean()
    .default(false)
    .describe('Capture a screenshot after running the batch actions.'),
});

export const ReversePortInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  devicePort: z.number().int().positive().describe('Device port to reverse (tcp).'),
  hostPort: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Host port to map to. Defaults to the same as devicePort.'),
});

export const ForwardPortInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  devicePort: z.number().int().positive().describe('Device port to forward to (tcp).'),
  hostPort: z.number().int().positive().describe('Host port to forward from (tcp).'),
});

export const GetLogcatInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  lines: z
    .number()
    .int()
    .positive()
    .default(200)
    .describe('Number of log lines to return.'),
  since: z
    .string()
    .optional()
    .describe('Optional time filter (e.g., "1m", "2024-01-01 00:00:00.000").'),
  tag: z.string().optional().describe('Optional log tag filter.'),
  priority: z
    .enum(['V', 'D', 'I', 'W', 'E', 'F', 'S'])
    .optional()
    .describe('Optional minimum priority for the tag filter.'),
  pid: z.number().int().positive().optional().describe('Optional PID to filter logs by.'),
  packageName: z
    .string()
    .optional()
    .describe('Optional package name to filter logs by running PID.'),
  format: z
    .enum(['time', 'threadtime', 'brief', 'raw'])
    .default('time')
    .describe('Logcat output format.'),
});

export const ListActivitiesInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  packageName: z.string().min(1).describe('Android application package name.'),
});

export const HotReloadSetupInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  packageName: z.string().min(1).describe('Android application package name.'),
  activity: z
    .string()
    .optional()
    .describe('Optional activity to launch (e.g., .MainActivity).'),
  apkPath: z
    .string()
    .optional()
    .describe('Optional APK path to install before starting.'),
  projectRoot: z
    .string()
    .optional()
    .describe('Optional project root used to auto-detect APKs.'),
  reversePorts: z
    .array(
      z.object({
        devicePort: z.number().int().positive().describe('Device port to reverse (tcp).'),
        hostPort: z.number().int().positive().optional().describe('Host port to map to.'),
      })
    )
    .optional()
    .default([{ devicePort: 8081 }])
    .describe('TCP ports to reverse for hot reload (defaults to 8081).'),
  install: z.boolean().default(true).describe('Whether to install an APK before starting.'),
  start: z.boolean().default(true).describe('Whether to start the app after setup.'),
  stopBeforeStart: z
    .boolean()
    .default(false)
    .describe('Whether to force-stop the app before starting it.'),
  reinstall: z.boolean().default(true).describe('Reinstall if already installed (-r).'),
  grantPermissions: z.boolean().default(true).describe('Grant runtime permissions at install (-g).'),
  allowTestPackages: z
    .boolean()
    .default(false)
    .describe('Allow installing test-only APKs (-t).'),
  allowDowngrade: z.boolean().default(false).describe('Allow version downgrade (-d).'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional timeout in milliseconds for install.'),
  playProtectAction: z
    .enum(['send_once', 'always', 'never'])
    .default('send_once')
    .describe(
      'How to handle Google Play Protect prompts after install/start (send_once, always, never).'
    ),
  playProtectMaxWaitMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Max time to wait for Play Protect prompt handling (milliseconds).'),
});

// Tool output schemas
export const TakeScreenshotOutputSchema = z.object({
  data: z.string().describe('Base64 encoded image data'),
  format: z.string().describe('Image format (png)'),
  width: z.number().describe('Image width in pixels'),
  height: z.number().describe('Image height in pixels'),
  deviceId: z.string().describe('ID of the device the screenshot was taken from'),
  timestamp: z.number().describe('Unix timestamp when the screenshot was captured'),
});

export const ListDevicesOutputSchema = z.object({
  devices: z
    .array(
      z.object({
        id: z.string().describe('Device ID'),
        status: z.string().describe('Device status'),
        model: z.string().optional().describe('Device model'),
        product: z.string().optional().describe('Product name'),
        transportId: z.string().optional().describe('Transport ID'),
        usb: z.string().optional().describe('USB information'),
        productString: z.string().optional().describe('Product string'),
      })
    )
    .describe('List of connected Android devices'),
});

export const FindApkOutputSchema = z.object({
  projectRoot: z.string().describe('Resolved project root used for the search'),
  apkPath: z.string().describe('Selected APK path (most recent match)'),
  candidates: z.array(z.string()).describe('All APK candidates found (sorted by newest first)'),
});

export const InstallApkOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  apkPath: z.string().describe('Installed APK path'),
  output: z.string().describe('Raw ADB output'),
  success: z.boolean().describe('Whether the install reported success'),
  downloadedFrom: z.string().optional().describe('Source URL if the APK was downloaded'),
});

export const UninstallAppOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  packageName: z.string().describe('Android package name'),
  output: z.string().describe('Raw ADB output'),
  success: z.boolean().describe('Whether the uninstall reported success'),
});

export const StartAppOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  packageName: z.string().describe('Android package name'),
  activity: z.string().optional().describe('Launched activity (if provided)'),
  output: z.string().describe('Raw ADB output'),
});

export const GetCurrentActivityInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
});

export const GetCurrentActivityOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  packageName: z.string().optional().describe('Package name if resolved'),
  activity: z.string().optional().describe('Fully qualified activity name if resolved'),
  component: z.string().optional().describe('Resolved component string (package/activity)'),
  raw: z.string().describe('Raw dumpsys line used for parsing (if available)'),
});

export const GetWindowSizeInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
});

export const GetWindowSizeOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  width: z.number().describe('Effective window width in pixels'),
  height: z.number().describe('Effective window height in pixels'),
  physicalWidth: z.number().optional().describe('Physical width in pixels'),
  physicalHeight: z.number().optional().describe('Physical height in pixels'),
  overrideWidth: z.number().optional().describe('Override width in pixels (if set)'),
  overrideHeight: z.number().optional().describe('Override height in pixels (if set)'),
  raw: z.string().describe('Raw wm size output'),
});

export const DumpUiInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  maxChars: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional maximum number of characters to return from the UI dump.'),
});

export const DumpUiOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  xml: z.string().describe('UI hierarchy XML'),
  length: z.number().describe('Length of the XML returned'),
  truncated: z.boolean().optional().describe('Whether the XML was truncated'),
  filePath: z.string().describe('Remote dump file path'),
});

export const StopAppOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  packageName: z.string().describe('Android package name'),
  output: z.string().describe('Raw ADB output'),
});

export const ClearAppDataOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  packageName: z.string().describe('Android package name'),
  output: z.string().describe('Raw ADB output'),
  success: z.boolean().describe('Whether the clear data command reported success'),
});

export const TapOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  x: z.number().describe('Tap X coordinate'),
  y: z.number().describe('Tap Y coordinate'),
  output: z.string().describe('Raw ADB output'),
});

export const SwipeOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  startX: z.number().describe('Start X coordinate'),
  startY: z.number().describe('Start Y coordinate'),
  endX: z.number().describe('End X coordinate'),
  endY: z.number().describe('End Y coordinate'),
  durationMs: z.number().optional().describe('Swipe duration in milliseconds'),
  output: z.string().describe('Raw ADB output'),
});

export const InputTextOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  text: z.string().describe('Input text'),
  output: z.string().describe('Raw ADB output'),
});

export const KeyeventOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  keyCode: z.union([z.string(), z.number()]).describe('Android keycode'),
  output: z.string().describe('Raw ADB output'),
});

export const BatchActionsOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  actions: z.array(BatchActionSchema).describe('Actions that were executed'),
  output: z.string().describe('Raw ADB output'),
  screenshotBefore: TakeScreenshotOutputSchema.optional().describe('Screenshot before actions'),
  screenshotAfter: TakeScreenshotOutputSchema.optional().describe('Screenshot after actions'),
});

export const Pm2StartHotModeInputSchema = z.object({
  projectRoot: z
    .string()
    .optional()
    .describe('Optional project root to resolve config paths.'),
  configPath: z
    .string()
    .optional()
    .describe('Optional PM2 config path (defaults to android_hot_mode.config.json).'),
  appName: z.string().optional().describe('Optional PM2 app name to start (filters config).'),
});

export const Pm2StartHotModeOutputSchema = z.object({
  configPath: z.string().describe('Resolved config path used for PM2 start'),
  appName: z.string().optional().describe('App name if filtered'),
  output: z.string().describe('Raw PM2 output'),
});

export const Pm2StopInputSchema = z.object({
  appName: z.string().min(1).describe('PM2 app name to stop.'),
});

export const Pm2StopOutputSchema = z.object({
  appName: z.string().describe('PM2 app name'),
  output: z.string().describe('Raw PM2 output'),
});

export const Pm2ListInputSchema = z.object({});

export const Pm2ListOutputSchema = z.object({
  processes: z.array(z.any()).describe('PM2 process list'),
  output: z.string().describe('Raw PM2 output'),
});

export const FastFlowInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  actions: z.array(BatchActionSchema).min(1).describe('Ordered list of actions to run.'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional timeout in milliseconds for the batch command.'),
  captureBefore: z
    .boolean()
    .default(false)
    .describe('Capture a screenshot before running the actions.'),
  captureAfter: z
    .boolean()
    .default(false)
    .describe('Capture a screenshot after running the actions.'),
  postActionWaitMs: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Optional wait after actions before capture/dump (milliseconds).'),
  includeUiDump: z
    .boolean()
    .default(false)
    .describe('Include a UI hierarchy dump after the actions.'),
  uiDumpMaxChars: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional maximum number of characters to return from the UI dump.'),
});

export const FastFlowOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  actions: z.array(BatchActionSchema).describe('Actions that were executed'),
  output: z.string().describe('Raw ADB output'),
  screenshotBefore: TakeScreenshotOutputSchema.optional().describe('Screenshot before actions'),
  screenshotAfter: TakeScreenshotOutputSchema.optional().describe('Screenshot after actions'),
  uiDump: DumpUiOutputSchema.optional().describe('UI hierarchy dump after actions'),
});

export const TapByTextInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  text: z.string().min(1).describe('Text to match.'),
  matchMode: z.enum(['exact', 'contains', 'regex']).default('exact').describe('Match mode.'),
  index: z.number().int().min(0).default(0).describe('Match index (0-based).'),
});

export const TapByTextOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  text: z.string().describe('Matched text'),
  matchMode: z.string().describe('Match mode used'),
  index: z.number().describe('Match index used'),
  found: z.boolean().describe('Whether a match was found'),
  x: z.number().optional().describe('Tap X coordinate'),
  y: z.number().optional().describe('Tap Y coordinate'),
  output: z.string().optional().describe('Raw ADB output'),
});

export const TapByIdInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  resourceId: z.string().min(1).describe('Resource-id to match.'),
  index: z.number().int().min(0).default(0).describe('Match index (0-based).'),
});

export const TapByIdOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  resourceId: z.string().describe('Matched resource-id'),
  index: z.number().describe('Match index used'),
  found: z.boolean().describe('Whether a match was found'),
  x: z.number().optional().describe('Tap X coordinate'),
  y: z.number().optional().describe('Tap Y coordinate'),
  output: z.string().optional().describe('Raw ADB output'),
});

export const TapByDescInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  contentDesc: z.string().min(1).describe('Content-desc to match.'),
  matchMode: z.enum(['exact', 'contains', 'regex']).default('exact').describe('Match mode.'),
  index: z.number().int().min(0).default(0).describe('Match index (0-based).'),
});

export const TapByDescOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  contentDesc: z.string().describe('Matched content-desc'),
  matchMode: z.string().describe('Match mode used'),
  index: z.number().describe('Match index used'),
  found: z.boolean().describe('Whether a match was found'),
  x: z.number().optional().describe('Tap X coordinate'),
  y: z.number().optional().describe('Tap Y coordinate'),
  output: z.string().optional().describe('Raw ADB output'),
});

export const WaitForTextInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  text: z.string().min(1).describe('Text to wait for.'),
  matchMode: z.enum(['exact', 'contains', 'regex']).default('exact').describe('Match mode.'),
  timeoutMs: z.number().int().positive().optional().describe('Max wait time in milliseconds.'),
  intervalMs: z.number().int().positive().optional().describe('Polling interval in milliseconds.'),
});

export const WaitForTextOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  text: z.string().describe('Target text'),
  matchMode: z.string().describe('Match mode used'),
  found: z.boolean().describe('Whether the text was found'),
  elapsedMs: z.number().describe('Elapsed time in milliseconds'),
  matchCount: z.number().describe('Number of matches found'),
});

export const TypeByIdInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  resourceId: z.string().min(1).describe('Resource-id to match.'),
  text: z.string().min(1).describe('Text to input into the matched field.'),
  matchMode: z.enum(['exact', 'contains', 'regex']).default('exact').describe('Match mode.'),
  index: z.number().int().min(0).default(0).describe('Match index (0-based).'),
});

export const TypeByIdOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  resourceId: z.string().describe('Matched resource-id'),
  text: z.string().describe('Text input'),
  matchMode: z.string().describe('Match mode used'),
  index: z.number().describe('Match index used'),
  found: z.boolean().describe('Whether a match was found'),
  output: z.string().optional().describe('Raw ADB output'),
});

export const WaitForIdInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  resourceId: z.string().min(1).describe('Resource-id to wait for.'),
  matchMode: z.enum(['exact', 'contains', 'regex']).default('exact').describe('Match mode.'),
  timeoutMs: z.number().int().positive().optional().describe('Max wait time in milliseconds.'),
  intervalMs: z.number().int().positive().optional().describe('Polling interval in milliseconds.'),
});

export const WaitForIdOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  resourceId: z.string().describe('Target resource-id'),
  matchMode: z.string().describe('Match mode used'),
  found: z.boolean().describe('Whether the id was found'),
  elapsedMs: z.number().describe('Elapsed time in milliseconds'),
  matchCount: z.number().describe('Number of matches found'),
});

export const WaitForDescInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  contentDesc: z.string().min(1).describe('Content-desc to wait for.'),
  matchMode: z.enum(['exact', 'contains', 'regex']).default('exact').describe('Match mode.'),
  timeoutMs: z.number().int().positive().optional().describe('Max wait time in milliseconds.'),
  intervalMs: z.number().int().positive().optional().describe('Polling interval in milliseconds.'),
});

export const WaitForDescOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  contentDesc: z.string().describe('Target content-desc'),
  matchMode: z.string().describe('Match mode used'),
  found: z.boolean().describe('Whether the desc was found'),
  elapsedMs: z.number().describe('Elapsed time in milliseconds'),
  matchCount: z.number().describe('Number of matches found'),
});

export const WaitForActivityInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  activity: z.string().min(1).describe('Activity/component to wait for.'),
  matchMode: z.enum(['exact', 'contains', 'regex']).default('contains').describe('Match mode.'),
  timeoutMs: z.number().int().positive().optional().describe('Max wait time in milliseconds.'),
  intervalMs: z.number().int().positive().optional().describe('Polling interval in milliseconds.'),
});

export const WaitForActivityOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  activity: z.string().describe('Target activity/component'),
  matchMode: z.string().describe('Match mode used'),
  found: z.boolean().describe('Whether the activity was found'),
  elapsedMs: z.number().describe('Elapsed time in milliseconds'),
  current: z.string().optional().describe('Last observed activity/component'),
});

export const PressKeySequenceInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  keyCodes: z.array(z.union([z.string(), z.number()])).min(1).describe('Keycodes to press.'),
  intervalMs: z.number().int().min(0).optional().describe('Delay between key presses.'),
  timeoutMs: z.number().int().positive().optional().describe('Optional timeout in milliseconds.'),
});

export const PressKeySequenceOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  keyCodes: z.array(z.union([z.string(), z.number()])).describe('Keycodes pressed'),
  output: z.string().describe('Raw ADB output'),
});

export const TapRelativeInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  xPercent: z.number().min(0).max(100).describe('X coordinate percentage (0-100).'),
  yPercent: z.number().min(0).max(100).describe('Y coordinate percentage (0-100).'),
});

export const TapRelativeOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  xPercent: z.number().describe('X percentage'),
  yPercent: z.number().describe('Y percentage'),
  x: z.number().describe('Resolved X coordinate'),
  y: z.number().describe('Resolved Y coordinate'),
  output: z.string().describe('Raw ADB output'),
});

export const SwipeRelativeInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  startXPercent: z.number().min(0).max(100).describe('Start X percentage (0-100).'),
  startYPercent: z.number().min(0).max(100).describe('Start Y percentage (0-100).'),
  endXPercent: z.number().min(0).max(100).describe('End X percentage (0-100).'),
  endYPercent: z.number().min(0).max(100).describe('End Y percentage (0-100).'),
  durationMs: z.number().int().min(0).optional().describe('Optional swipe duration in ms.'),
});

export const SwipeRelativeOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  startXPercent: z.number().describe('Start X percentage'),
  startYPercent: z.number().describe('Start Y percentage'),
  endXPercent: z.number().describe('End X percentage'),
  endYPercent: z.number().describe('End Y percentage'),
  startX: z.number().describe('Resolved start X coordinate'),
  startY: z.number().describe('Resolved start Y coordinate'),
  endX: z.number().describe('Resolved end X coordinate'),
  endY: z.number().describe('Resolved end Y coordinate'),
  durationMs: z.number().optional().describe('Swipe duration in ms'),
  output: z.string().describe('Raw ADB output'),
});

export const TapCenterInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
});

export const TapCenterOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  x: z.number().describe('Resolved X coordinate'),
  y: z.number().describe('Resolved Y coordinate'),
  output: z.string().describe('Raw ADB output'),
});

export const WaitForUiStableInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  stableIterations: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Number of consecutive stable dumps required.'),
  intervalMs: z.number().int().min(0).optional().describe('Polling interval in ms.'),
  timeoutMs: z.number().int().positive().optional().describe('Max wait time in ms.'),
});

export const WaitForUiStableOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  stable: z.boolean().describe('Whether UI became stable'),
  elapsedMs: z.number().describe('Elapsed time in ms'),
  hash: z.string().optional().describe('Last observed UI hash'),
});

export const GetScreenHashInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
});

export const GetScreenHashOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  hash: z.string().describe('UI hash'),
  length: z.number().describe('UI dump length'),
});

export const WaitForPackageInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  packageName: z.string().min(1).describe('Package name to wait for.'),
  timeoutMs: z.number().int().positive().optional().describe('Max wait time in ms.'),
  intervalMs: z.number().int().positive().optional().describe('Polling interval in ms.'),
});

export const WaitForPackageOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  packageName: z.string().describe('Package name'),
  found: z.boolean().describe('Whether package is in foreground'),
  elapsedMs: z.number().describe('Elapsed time in ms'),
  current: z.string().optional().describe('Last observed package/activity'),
});

const FlowStepBaseSchema = z.object({
  id: z.string().optional().describe('Optional step id.'),
});

const FlowTapStepSchema = FlowStepBaseSchema.extend({
  type: z.literal('tap'),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
});

const FlowTapRelativeStepSchema = FlowStepBaseSchema.extend({
  type: z.literal('tap_relative'),
  xPercent: z.number().min(0).max(100),
  yPercent: z.number().min(0).max(100),
});

const FlowTapCenterStepSchema = FlowStepBaseSchema.extend({
  type: z.literal('tap_center'),
});

const FlowSwipeStepSchema = FlowStepBaseSchema.extend({
  type: z.literal('swipe'),
  startX: z.number().int().min(0),
  startY: z.number().int().min(0),
  endX: z.number().int().min(0),
  endY: z.number().int().min(0),
  durationMs: z.number().int().min(0).optional(),
});

const FlowSwipeRelativeStepSchema = FlowStepBaseSchema.extend({
  type: z.literal('swipe_relative'),
  startXPercent: z.number().min(0).max(100),
  startYPercent: z.number().min(0).max(100),
  endXPercent: z.number().min(0).max(100),
  endYPercent: z.number().min(0).max(100),
  durationMs: z.number().int().min(0).optional(),
});

const FlowTextStepSchema = FlowStepBaseSchema.extend({
  type: z.literal('text'),
  text: z.string().min(1),
});

const FlowKeyeventStepSchema = FlowStepBaseSchema.extend({
  type: z.literal('keyevent'),
  keyCode: z.union([z.string(), z.number().int()]),
});

const FlowSleepStepSchema = FlowStepBaseSchema.extend({
  type: z.literal('sleep'),
  durationMs: z.number().int().min(0),
});

const FlowTapByTextStepSchema = FlowStepBaseSchema.extend({
  type: z.literal('tap_by_text'),
  text: z.string().min(1),
  matchMode: z.enum(['exact', 'contains', 'regex']).optional(),
  index: z.number().int().min(0).optional(),
});

const FlowTapByIdStepSchema = FlowStepBaseSchema.extend({
  type: z.literal('tap_by_id'),
  resourceId: z.string().min(1),
  index: z.number().int().min(0).optional(),
});

const FlowTapByDescStepSchema = FlowStepBaseSchema.extend({
  type: z.literal('tap_by_desc'),
  contentDesc: z.string().min(1),
  matchMode: z.enum(['exact', 'contains', 'regex']).optional(),
  index: z.number().int().min(0).optional(),
});

const FlowTypeByIdStepSchema = FlowStepBaseSchema.extend({
  type: z.literal('type_by_id'),
  resourceId: z.string().min(1),
  text: z.string().min(1),
  matchMode: z.enum(['exact', 'contains', 'regex']).optional(),
  index: z.number().int().min(0).optional(),
});

const FlowWaitTextStepSchema = FlowStepBaseSchema.extend({
  type: z.literal('wait_for_text'),
  text: z.string().min(1),
  matchMode: z.enum(['exact', 'contains', 'regex']).optional(),
  timeoutMs: z.number().int().positive().optional(),
  intervalMs: z.number().int().positive().optional(),
});

const FlowWaitIdStepSchema = FlowStepBaseSchema.extend({
  type: z.literal('wait_for_id'),
  resourceId: z.string().min(1),
  matchMode: z.enum(['exact', 'contains', 'regex']).optional(),
  timeoutMs: z.number().int().positive().optional(),
  intervalMs: z.number().int().positive().optional(),
});

const FlowWaitDescStepSchema = FlowStepBaseSchema.extend({
  type: z.literal('wait_for_desc'),
  contentDesc: z.string().min(1),
  matchMode: z.enum(['exact', 'contains', 'regex']).optional(),
  timeoutMs: z.number().int().positive().optional(),
  intervalMs: z.number().int().positive().optional(),
});

const FlowWaitActivityStepSchema = FlowStepBaseSchema.extend({
  type: z.literal('wait_for_activity'),
  activity: z.string().min(1),
  matchMode: z.enum(['exact', 'contains', 'regex']).optional(),
  timeoutMs: z.number().int().positive().optional(),
  intervalMs: z.number().int().positive().optional(),
});

const FlowWaitPackageStepSchema = FlowStepBaseSchema.extend({
  type: z.literal('wait_for_package'),
  packageName: z.string().min(1),
  timeoutMs: z.number().int().positive().optional(),
  intervalMs: z.number().int().positive().optional(),
});

const FlowPressKeySequenceStepSchema = FlowStepBaseSchema.extend({
  type: z.literal('press_key_sequence'),
  keyCodes: z.array(z.union([z.string(), z.number().int()])).min(1),
  intervalMs: z.number().int().min(0).optional(),
});

export const FlowStepSchema = z.discriminatedUnion('type', [
  FlowTapStepSchema,
  FlowTapRelativeStepSchema,
  FlowTapCenterStepSchema,
  FlowSwipeStepSchema,
  FlowSwipeRelativeStepSchema,
  FlowTextStepSchema,
  FlowKeyeventStepSchema,
  FlowSleepStepSchema,
  FlowTapByTextStepSchema,
  FlowTapByIdStepSchema,
  FlowTapByDescStepSchema,
  FlowTypeByIdStepSchema,
  FlowWaitTextStepSchema,
  FlowWaitIdStepSchema,
  FlowWaitDescStepSchema,
  FlowWaitActivityStepSchema,
  FlowWaitPackageStepSchema,
  FlowPressKeySequenceStepSchema,
]);

export const RunFlowPlanInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  steps: z.array(FlowStepSchema).min(1).describe('Ordered list of steps to execute.'),
  stopOnFailure: z.boolean().default(true).describe('Stop when a step fails.'),
});

export const RunFlowPlanOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  steps: z.array(
    z.object({
      id: z.string().optional(),
      type: z.string(),
      ok: z.boolean(),
      message: z.string().optional(),
      elapsedMs: z.number().optional(),
    })
  ),
});

export const UiSelectorSchema = z.object({
  field: z.enum(['text', 'resourceId', 'contentDesc']).describe('Selector field.'),
  value: z.string().min(1).describe('Selector value.'),
  matchMode: z.enum(['exact', 'contains', 'regex']).default('exact').describe('Match mode.'),
});

export const QueryUiInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  selector: UiSelectorSchema,
  maxResults: z.number().int().positive().optional().describe('Max results to return.'),
});

export const QueryUiOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  selector: UiSelectorSchema,
  count: z.number().describe('Match count'),
  nodes: z.array(
    z.object({
      text: z.string().optional(),
      resourceId: z.string().optional(),
      contentDesc: z.string().optional(),
      bounds: z
        .object({
          x1: z.number(),
          y1: z.number(),
          x2: z.number(),
          y2: z.number(),
        })
        .optional(),
    })
  ),
});

export const WaitForNodeCountInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  selector: UiSelectorSchema,
  count: z.number().int().min(0).describe('Target count.'),
  comparator: z.enum(['eq', 'gte', 'lte']).default('eq').describe('Comparison operator.'),
  timeoutMs: z.number().int().positive().optional().describe('Max wait time in ms.'),
  intervalMs: z.number().int().positive().optional().describe('Polling interval in ms.'),
});

export const WaitForNodeCountOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  selector: UiSelectorSchema,
  count: z.number().describe('Target count'),
  comparator: z.string().describe('Comparator used'),
  found: z.boolean().describe('Whether condition was met'),
  elapsedMs: z.number().describe('Elapsed time in ms'),
  matchCount: z.number().describe('Current match count'),
});

export const TapBySelectorIndexInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  selector: UiSelectorSchema,
  index: z.number().int().min(0).default(0).describe('Match index (0-based).'),
});

export const TapBySelectorIndexOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  selector: UiSelectorSchema,
  index: z.number().describe('Match index'),
  found: z.boolean().describe('Whether a match was found'),
  x: z.number().optional().describe('Tap X coordinate'),
  y: z.number().optional().describe('Tap Y coordinate'),
  output: z.string().optional().describe('Raw ADB output'),
});

export const UiDumpCachedInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  maxChars: z.number().int().positive().optional().describe('Optional maximum number of characters.'),
});

export const UiDumpCachedOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  xml: z.string().describe('UI hierarchy XML'),
  length: z.number().describe('Length of XML returned'),
  truncated: z.boolean().optional().describe('Whether XML was truncated'),
  filePath: z.string().describe('Remote dump file path'),
  ageMs: z.number().describe('Age of cached dump in ms'),
});

export const ReversePortOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  devicePort: z.number().describe('Device port (tcp)'),
  hostPort: z.number().describe('Host port (tcp)'),
  output: z.string().describe('Raw ADB output'),
});

export const ForwardPortOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  devicePort: z.number().describe('Device port (tcp)'),
  hostPort: z.number().describe('Host port (tcp)'),
  output: z.string().describe('Raw ADB output'),
});

export const GetLogcatOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  output: z.string().describe('Logcat output'),
  lines: z.number().describe('Number of lines requested'),
  pid: z.number().optional().describe('PID used for filtering'),
  packageName: z.string().optional().describe('Package name used for filtering'),
});

export const ListActivitiesOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  packageName: z.string().describe('Android package name'),
  activities: z.array(z.string()).describe('Discovered activity class names'),
  mainActivity: z.string().optional().describe('Resolved main/launcher activity (if found)'),
});

export const HotReloadSetupOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  reversedPorts: z
    .array(
      z.object({
        devicePort: z.number().describe('Device port (tcp)'),
        hostPort: z.number().describe('Host port (tcp)'),
        output: z.string().describe('Raw ADB output'),
      })
    )
    .describe('Port reverse results'),
  install: InstallApkOutputSchema.optional().describe('APK install result (if performed)'),
  stop: StopAppOutputSchema.optional().describe('Stop result (if performed)'),
  start: StartAppOutputSchema.optional().describe('Start result (if performed)'),
  playProtect: z
    .object({
      handled: z.boolean().describe('Whether a Play Protect prompt was handled'),
      action: z.string().optional().describe('Action that was taken (if handled)'),
    })
    .optional()
    .describe('Play Protect prompt handling result (if attempted)'),
});

// MCP Tool schemas
export const TakeScreenshotToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description:
        'The ID of the Android device to capture a screenshot from. If not provided, uses the first available device.',
    },
    format: {
      type: 'string' as const,
      enum: ['png'],
      default: 'png',
      description: 'The image format for the screenshot. Currently only PNG is supported.',
    },
  },
  required: [] as string[],
};

export const ListDevicesToolSchema = {
  type: 'object' as const,
  properties: {},
  required: [] as string[],
};

export const FindApkToolSchema = {
  type: 'object' as const,
  properties: {
    projectRoot: {
      type: 'string' as const,
      description:
        'Optional project root to search for APKs. Defaults to current working directory.',
    },
  },
  required: [] as string[],
};

export const InstallApkToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    apkPath: {
      type: 'string' as const,
      description:
        'Path to APK to install. If omitted, the server searches common build output folders.',
    },
    apkUrl: {
      type: 'string' as const,
      description: 'Optional URL to download an APK before installing.',
    },
    projectRoot: {
      type: 'string' as const,
      description: 'Optional project root to search for APKs when apkPath is omitted.',
    },
    reinstall: {
      type: 'boolean' as const,
      description: 'Whether to reinstall the APK if it is already installed (-r).',
      default: true,
    },
    grantPermissions: {
      type: 'boolean' as const,
      description: 'Whether to grant all runtime permissions at install time (-g).',
      default: true,
    },
    allowTestPackages: {
      type: 'boolean' as const,
      description: 'Whether to allow installing test-only APKs (-t).',
      default: false,
    },
    allowDowngrade: {
      type: 'boolean' as const,
      description: 'Whether to allow version downgrade (-d).',
      default: false,
    },
    timeoutMs: {
      type: 'number' as const,
      description: 'Optional timeout in milliseconds for the install command.',
    },
  },
  required: [] as string[],
};

export const UninstallAppToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    packageName: {
      type: 'string' as const,
      description: 'Android application package name (e.g., com.example.app).',
    },
    keepData: {
      type: 'boolean' as const,
      description: 'Whether to keep app data and cache directories (-k).',
      default: false,
    },
  },
  required: ['packageName'] as string[],
};

export const StartAppToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    packageName: {
      type: 'string' as const,
      description: 'Android application package name (e.g., com.example.app).',
    },
    activity: {
      type: 'string' as const,
      description: 'Optional fully qualified activity name to launch (e.g., .MainActivity).',
    },
  },
  required: ['packageName'] as string[],
};

export const GetCurrentActivityToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
  },
  required: [] as string[],
};

export const GetWindowSizeToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
  },
  required: [] as string[],
};

export const DumpUiToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    maxChars: {
      type: 'number' as const,
      description: 'Optional maximum number of characters to return from the UI dump.',
    },
  },
  required: [] as string[],
};

export const StopAppToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    packageName: {
      type: 'string' as const,
      description: 'Android application package name (e.g., com.example.app).',
    },
  },
  required: ['packageName'] as string[],
};

export const ClearAppDataToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    packageName: {
      type: 'string' as const,
      description: 'Android application package name (e.g., com.example.app).',
    },
  },
  required: ['packageName'] as string[],
};

export const TapToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    x: {
      type: 'number' as const,
      description: 'Tap X coordinate in pixels.',
    },
    y: {
      type: 'number' as const,
      description: 'Tap Y coordinate in pixels.',
    },
  },
  required: ['x', 'y'] as string[],
};

export const SwipeToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    startX: {
      type: 'number' as const,
      description: 'Start X coordinate in pixels.',
    },
    startY: {
      type: 'number' as const,
      description: 'Start Y coordinate in pixels.',
    },
    endX: {
      type: 'number' as const,
      description: 'End X coordinate in pixels.',
    },
    endY: {
      type: 'number' as const,
      description: 'End Y coordinate in pixels.',
    },
    durationMs: {
      type: 'number' as const,
      description: 'Optional swipe duration in milliseconds.',
    },
  },
  required: ['startX', 'startY', 'endX', 'endY'] as string[],
};

export const InputTextToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    text: {
      type: 'string' as const,
      description: 'Text to input into the focused field.',
    },
  },
  required: ['text'] as string[],
};

export const KeyeventToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    keyCode: {
      type: 'string' as const,
      description: 'Android keycode (e.g., 3 for HOME, 4 for BACK, KEYCODE_ENTER).',
    },
  },
  required: ['keyCode'] as string[],
};

export const BatchActionsToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    actions: {
      type: 'array' as const,
      description: 'Ordered list of actions to run.',
      items: {
        oneOf: [
          {
            type: 'object' as const,
            properties: {
              type: { type: 'string' as const, enum: ['tap'] },
              x: { type: 'number' as const },
              y: { type: 'number' as const },
            },
            required: ['type', 'x', 'y'] as string[],
          },
          {
            type: 'object' as const,
            properties: {
              type: { type: 'string' as const, enum: ['swipe'] },
              startX: { type: 'number' as const },
              startY: { type: 'number' as const },
              endX: { type: 'number' as const },
              endY: { type: 'number' as const },
              durationMs: { type: 'number' as const },
            },
            required: ['type', 'startX', 'startY', 'endX', 'endY'] as string[],
          },
          {
            type: 'object' as const,
            properties: {
              type: { type: 'string' as const, enum: ['text'] },
              text: { type: 'string' as const },
            },
            required: ['type', 'text'] as string[],
          },
          {
            type: 'object' as const,
            properties: {
              type: { type: 'string' as const, enum: ['keyevent'] },
              keyCode: { type: 'string' as const },
            },
            required: ['type', 'keyCode'] as string[],
          },
          {
            type: 'object' as const,
            properties: {
              type: { type: 'string' as const, enum: ['sleep'] },
              durationMs: { type: 'number' as const },
            },
            required: ['type', 'durationMs'] as string[],
          },
        ],
      },
    },
    timeoutMs: {
      type: 'number' as const,
      description: 'Optional timeout in milliseconds for the batch command.',
    },
    captureBefore: {
      type: 'boolean' as const,
      description: 'Capture a screenshot before running the batch actions.',
      default: false,
    },
    captureAfter: {
      type: 'boolean' as const,
      description: 'Capture a screenshot after running the batch actions.',
      default: false,
    },
  },
  required: ['actions'] as string[],
};

export const Pm2StartHotModeToolSchema = {
  type: 'object' as const,
  properties: {
    projectRoot: {
      type: 'string' as const,
      description: 'Optional project root to resolve config paths.',
    },
    configPath: {
      type: 'string' as const,
      description: 'Optional PM2 config path (defaults to android_hot_mode.config.json).',
    },
    appName: {
      type: 'string' as const,
      description: 'Optional PM2 app name to start (filters config).',
    },
  },
  required: [] as string[],
};

export const Pm2StopToolSchema = {
  type: 'object' as const,
  properties: {
    appName: {
      type: 'string' as const,
      description: 'PM2 app name to stop.',
    },
  },
  required: ['appName'] as string[],
};

export const Pm2ListToolSchema = {
  type: 'object' as const,
  properties: {},
  required: [] as string[],
};

export const FastFlowToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    actions: {
      type: 'array' as const,
      description: 'Ordered list of actions to run.',
      items: {
        oneOf: [
          {
            type: 'object' as const,
            properties: {
              type: { type: 'string' as const, enum: ['tap'] },
              x: { type: 'number' as const },
              y: { type: 'number' as const },
            },
            required: ['type', 'x', 'y'] as string[],
          },
          {
            type: 'object' as const,
            properties: {
              type: { type: 'string' as const, enum: ['swipe'] },
              startX: { type: 'number' as const },
              startY: { type: 'number' as const },
              endX: { type: 'number' as const },
              endY: { type: 'number' as const },
              durationMs: { type: 'number' as const },
            },
            required: ['type', 'startX', 'startY', 'endX', 'endY'] as string[],
          },
          {
            type: 'object' as const,
            properties: {
              type: { type: 'string' as const, enum: ['text'] },
              text: { type: 'string' as const },
            },
            required: ['type', 'text'] as string[],
          },
          {
            type: 'object' as const,
            properties: {
              type: { type: 'string' as const, enum: ['keyevent'] },
              keyCode: { type: 'string' as const },
            },
            required: ['type', 'keyCode'] as string[],
          },
          {
            type: 'object' as const,
            properties: {
              type: { type: 'string' as const, enum: ['sleep'] },
              durationMs: { type: 'number' as const },
            },
            required: ['type', 'durationMs'] as string[],
          },
        ],
      },
    },
    timeoutMs: {
      type: 'number' as const,
      description: 'Optional timeout in milliseconds for the batch command.',
    },
    captureBefore: {
      type: 'boolean' as const,
      description: 'Capture a screenshot before running the actions.',
      default: false,
    },
    captureAfter: {
      type: 'boolean' as const,
      description: 'Capture a screenshot after running the actions.',
      default: false,
    },
    postActionWaitMs: {
      type: 'number' as const,
      description: 'Optional wait after actions before capture/dump (milliseconds).',
    },
    includeUiDump: {
      type: 'boolean' as const,
      description: 'Include a UI hierarchy dump after the actions.',
      default: false,
    },
    uiDumpMaxChars: {
      type: 'number' as const,
      description: 'Optional maximum number of characters to return from the UI dump.',
    },
  },
  required: ['actions'] as string[],
};

export const TapByTextToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    text: { type: 'string' as const, description: 'Text to match.' },
    matchMode: {
      type: 'string' as const,
      enum: ['exact', 'contains', 'regex'],
      default: 'exact',
      description: 'Match mode.',
    },
    index: {
      type: 'number' as const,
      description: 'Match index (0-based).',
      default: 0,
    },
  },
  required: ['text'] as string[],
};

export const TapByIdToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    resourceId: { type: 'string' as const, description: 'Resource-id to match.' },
    index: {
      type: 'number' as const,
      description: 'Match index (0-based).',
      default: 0,
    },
  },
  required: ['resourceId'] as string[],
};

export const TapByDescToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    contentDesc: { type: 'string' as const, description: 'Content-desc to match.' },
    matchMode: {
      type: 'string' as const,
      enum: ['exact', 'contains', 'regex'],
      default: 'exact',
      description: 'Match mode.',
    },
    index: {
      type: 'number' as const,
      description: 'Match index (0-based).',
      default: 0,
    },
  },
  required: ['contentDesc'] as string[],
};

export const WaitForTextToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    text: { type: 'string' as const, description: 'Text to wait for.' },
    matchMode: {
      type: 'string' as const,
      enum: ['exact', 'contains', 'regex'],
      default: 'exact',
      description: 'Match mode.',
    },
    timeoutMs: { type: 'number' as const, description: 'Max wait time in milliseconds.' },
    intervalMs: { type: 'number' as const, description: 'Polling interval in milliseconds.' },
  },
  required: ['text'] as string[],
};

export const TypeByIdToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    resourceId: { type: 'string' as const, description: 'Resource-id to match.' },
    text: { type: 'string' as const, description: 'Text to input.' },
    matchMode: {
      type: 'string' as const,
      enum: ['exact', 'contains', 'regex'],
      default: 'exact',
      description: 'Match mode.',
    },
    index: {
      type: 'number' as const,
      description: 'Match index (0-based).',
      default: 0,
    },
  },
  required: ['resourceId', 'text'] as string[],
};

export const WaitForIdToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    resourceId: { type: 'string' as const, description: 'Resource-id to wait for.' },
    matchMode: {
      type: 'string' as const,
      enum: ['exact', 'contains', 'regex'],
      default: 'exact',
      description: 'Match mode.',
    },
    timeoutMs: { type: 'number' as const, description: 'Max wait time in milliseconds.' },
    intervalMs: { type: 'number' as const, description: 'Polling interval in milliseconds.' },
  },
  required: ['resourceId'] as string[],
};

export const WaitForDescToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    contentDesc: { type: 'string' as const, description: 'Content-desc to wait for.' },
    matchMode: {
      type: 'string' as const,
      enum: ['exact', 'contains', 'regex'],
      default: 'exact',
      description: 'Match mode.',
    },
    timeoutMs: { type: 'number' as const, description: 'Max wait time in milliseconds.' },
    intervalMs: { type: 'number' as const, description: 'Polling interval in milliseconds.' },
  },
  required: ['contentDesc'] as string[],
};

export const WaitForActivityToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    activity: { type: 'string' as const, description: 'Activity/component to wait for.' },
    matchMode: {
      type: 'string' as const,
      enum: ['exact', 'contains', 'regex'],
      default: 'contains',
      description: 'Match mode.',
    },
    timeoutMs: { type: 'number' as const, description: 'Max wait time in milliseconds.' },
    intervalMs: { type: 'number' as const, description: 'Polling interval in milliseconds.' },
  },
  required: ['activity'] as string[],
};

export const PressKeySequenceToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    keyCodes: { type: 'array' as const, description: 'Keycodes to press.' },
    intervalMs: { type: 'number' as const, description: 'Delay between key presses.' },
    timeoutMs: { type: 'number' as const, description: 'Optional timeout in milliseconds.' },
  },
  required: ['keyCodes'] as string[],
};

export const TapRelativeToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    xPercent: { type: 'number' as const, description: 'X percentage (0-100).' },
    yPercent: { type: 'number' as const, description: 'Y percentage (0-100).' },
  },
  required: ['xPercent', 'yPercent'] as string[],
};

export const SwipeRelativeToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    startXPercent: { type: 'number' as const, description: 'Start X percentage (0-100).' },
    startYPercent: { type: 'number' as const, description: 'Start Y percentage (0-100).' },
    endXPercent: { type: 'number' as const, description: 'End X percentage (0-100).' },
    endYPercent: { type: 'number' as const, description: 'End Y percentage (0-100).' },
    durationMs: { type: 'number' as const, description: 'Optional swipe duration in ms.' },
  },
  required: ['startXPercent', 'startYPercent', 'endXPercent', 'endYPercent'] as string[],
};

export const TapCenterToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
  },
  required: [] as string[],
};

export const WaitForUiStableToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    stableIterations: { type: 'number' as const, description: 'Stable dump count.' },
    intervalMs: { type: 'number' as const, description: 'Polling interval in ms.' },
    timeoutMs: { type: 'number' as const, description: 'Max wait time in ms.' },
  },
  required: [] as string[],
};

export const GetScreenHashToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
  },
  required: [] as string[],
};

export const WaitForPackageToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    packageName: { type: 'string' as const, description: 'Package name to wait for.' },
    timeoutMs: { type: 'number' as const, description: 'Max wait time in ms.' },
    intervalMs: { type: 'number' as const, description: 'Polling interval in ms.' },
  },
  required: ['packageName'] as string[],
};

export const RunFlowPlanToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    steps: {
      type: 'array' as const,
      description: 'Ordered list of steps to execute.',
    },
    stopOnFailure: {
      type: 'boolean' as const,
      description: 'Stop when a step fails.',
      default: true,
    },
  },
  required: ['steps'] as string[],
};

export const QueryUiToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    selector: {
      type: 'object' as const,
      description: 'Selector {field,value,matchMode}.',
    },
    maxResults: { type: 'number' as const, description: 'Max results to return.' },
  },
  required: ['selector'] as string[],
};

export const WaitForNodeCountToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    selector: { type: 'object' as const, description: 'Selector {field,value,matchMode}.' },
    count: { type: 'number' as const, description: 'Target count.' },
    comparator: { type: 'string' as const, description: 'Comparison operator (eq/gte/lte).' },
    timeoutMs: { type: 'number' as const, description: 'Max wait time in ms.' },
    intervalMs: { type: 'number' as const, description: 'Polling interval in ms.' },
  },
  required: ['selector', 'count'] as string[],
};

export const TapBySelectorIndexToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    selector: { type: 'object' as const, description: 'Selector {field,value,matchMode}.' },
    index: { type: 'number' as const, description: 'Match index (0-based).' },
  },
  required: ['selector'] as string[],
};

export const UiDumpCachedToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    maxChars: { type: 'number' as const, description: 'Optional maximum number of characters.' },
  },
  required: [] as string[],
};

export const ReversePortToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    devicePort: {
      type: 'number' as const,
      description: 'Device port to reverse (tcp).',
    },
    hostPort: {
      type: 'number' as const,
      description: 'Host port to map to. Defaults to the same as devicePort.',
    },
  },
  required: ['devicePort'] as string[],
};

export const ForwardPortToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    devicePort: {
      type: 'number' as const,
      description: 'Device port to forward to (tcp).',
    },
    hostPort: {
      type: 'number' as const,
      description: 'Host port to forward from (tcp).',
    },
  },
  required: ['devicePort', 'hostPort'] as string[],
};

export const GetLogcatToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    lines: {
      type: 'number' as const,
      description: 'Number of log lines to return.',
      default: 200,
    },
    since: {
      type: 'string' as const,
      description: 'Optional time filter (e.g., "1m", "2024-01-01 00:00:00.000").',
    },
    tag: {
      type: 'string' as const,
      description: 'Optional log tag filter.',
    },
    priority: {
      type: 'string' as const,
      description: 'Optional minimum priority (V/D/I/W/E/F/S).',
    },
    pid: {
      type: 'number' as const,
      description: 'Optional PID to filter logs by.',
    },
    packageName: {
      type: 'string' as const,
      description: 'Optional package name to filter logs by running PID.',
    },
    format: {
      type: 'string' as const,
      description: 'Logcat output format (time/threadtime/brief/raw).',
      default: 'time',
    },
  },
  required: [] as string[],
};

export const ListActivitiesToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    packageName: {
      type: 'string' as const,
      description: 'Android application package name.',
    },
  },
  required: ['packageName'] as string[],
};

export const HotReloadSetupToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    packageName: {
      type: 'string' as const,
      description: 'Android application package name.',
    },
    activity: {
      type: 'string' as const,
      description: 'Optional activity to launch (e.g., .MainActivity).',
    },
    apkPath: {
      type: 'string' as const,
      description: 'Optional APK path to install before starting.',
    },
    projectRoot: {
      type: 'string' as const,
      description: 'Optional project root used to auto-detect APKs.',
    },
    reversePorts: {
      type: 'array' as const,
      description: 'TCP ports to reverse for hot reload (defaults to 8081).',
      items: {
        type: 'object' as const,
        properties: {
          devicePort: { type: 'number' as const },
          hostPort: { type: 'number' as const },
        },
        required: ['devicePort'] as string[],
      },
      default: [{ devicePort: 8081 }],
    },
    install: {
      type: 'boolean' as const,
      description: 'Whether to install an APK before starting.',
      default: true,
    },
    start: {
      type: 'boolean' as const,
      description: 'Whether to start the app after setup.',
      default: true,
    },
    stopBeforeStart: {
      type: 'boolean' as const,
      description: 'Whether to force-stop the app before starting it.',
      default: false,
    },
    reinstall: {
      type: 'boolean' as const,
      description: 'Reinstall if already installed (-r).',
      default: true,
    },
    grantPermissions: {
      type: 'boolean' as const,
      description: 'Grant runtime permissions at install (-g).',
      default: true,
    },
    allowTestPackages: {
      type: 'boolean' as const,
      description: 'Allow installing test-only APKs (-t).',
      default: false,
    },
    allowDowngrade: {
      type: 'boolean' as const,
      description: 'Allow version downgrade (-d).',
      default: false,
    },
    timeoutMs: {
      type: 'number' as const,
      description: 'Optional timeout in milliseconds for install.',
    },
    playProtectAction: {
      type: 'string' as const,
      description:
        'How to handle Google Play Protect prompts after install/start (send_once, always, never).',
      enum: ['send_once', 'always', 'never'],
      default: 'send_once',
    },
    playProtectMaxWaitMs: {
      type: 'number' as const,
      description: 'Max time to wait for Play Protect prompt handling (milliseconds).',
    },
  },
  required: ['packageName'] as string[],
};

// Type exports
export type TakeScreenshotInput = z.infer<typeof TakeScreenshotInputSchema>;
export type ListDevicesInput = z.infer<typeof ListDevicesInputSchema>;
export type TakeScreenshotOutput = z.infer<typeof TakeScreenshotOutputSchema>;
export type ListDevicesOutput = z.infer<typeof ListDevicesOutputSchema>;
export type FindApkInput = z.infer<typeof FindApkInputSchema>;
export type FindApkOutput = z.infer<typeof FindApkOutputSchema>;
export type InstallApkInput = z.infer<typeof InstallApkInputSchema>;
export type InstallApkOutput = z.infer<typeof InstallApkOutputSchema>;
export type UninstallAppInput = z.infer<typeof UninstallAppInputSchema>;
export type UninstallAppOutput = z.infer<typeof UninstallAppOutputSchema>;
export type StartAppInput = z.infer<typeof StartAppInputSchema>;
export type StartAppOutput = z.infer<typeof StartAppOutputSchema>;
export type GetCurrentActivityInput = z.infer<typeof GetCurrentActivityInputSchema>;
export type GetCurrentActivityOutput = z.infer<typeof GetCurrentActivityOutputSchema>;
export type GetWindowSizeInput = z.infer<typeof GetWindowSizeInputSchema>;
export type GetWindowSizeOutput = z.infer<typeof GetWindowSizeOutputSchema>;
export type DumpUiInput = z.infer<typeof DumpUiInputSchema>;
export type DumpUiOutput = z.infer<typeof DumpUiOutputSchema>;
export type StopAppInput = z.infer<typeof StopAppInputSchema>;
export type StopAppOutput = z.infer<typeof StopAppOutputSchema>;
export type ClearAppDataInput = z.infer<typeof ClearAppDataInputSchema>;
export type ClearAppDataOutput = z.infer<typeof ClearAppDataOutputSchema>;
export type TapInput = z.infer<typeof TapInputSchema>;
export type TapOutput = z.infer<typeof TapOutputSchema>;
export type SwipeInput = z.infer<typeof SwipeInputSchema>;
export type SwipeOutput = z.infer<typeof SwipeOutputSchema>;
export type InputTextInput = z.infer<typeof InputTextInputSchema>;
export type InputTextOutput = z.infer<typeof InputTextOutputSchema>;
export type KeyeventInput = z.infer<typeof KeyeventInputSchema>;
export type KeyeventOutput = z.infer<typeof KeyeventOutputSchema>;
export type BatchAction = z.infer<typeof BatchActionSchema>;
export type BatchActionsInput = z.infer<typeof BatchActionsInputSchema>;
export type BatchActionsOutput = z.infer<typeof BatchActionsOutputSchema>;
export type Pm2StartHotModeInput = z.infer<typeof Pm2StartHotModeInputSchema>;
export type Pm2StartHotModeOutput = z.infer<typeof Pm2StartHotModeOutputSchema>;
export type Pm2StopInput = z.infer<typeof Pm2StopInputSchema>;
export type Pm2StopOutput = z.infer<typeof Pm2StopOutputSchema>;
export type Pm2ListInput = z.infer<typeof Pm2ListInputSchema>;
export type Pm2ListOutput = z.infer<typeof Pm2ListOutputSchema>;
export type FastFlowInput = z.infer<typeof FastFlowInputSchema>;
export type FastFlowOutput = z.infer<typeof FastFlowOutputSchema>;
export type TapByTextInput = z.infer<typeof TapByTextInputSchema>;
export type TapByTextOutput = z.infer<typeof TapByTextOutputSchema>;
export type TapByIdInput = z.infer<typeof TapByIdInputSchema>;
export type TapByIdOutput = z.infer<typeof TapByIdOutputSchema>;
export type TapByDescInput = z.infer<typeof TapByDescInputSchema>;
export type TapByDescOutput = z.infer<typeof TapByDescOutputSchema>;
export type WaitForTextInput = z.infer<typeof WaitForTextInputSchema>;
export type WaitForTextOutput = z.infer<typeof WaitForTextOutputSchema>;
export type TypeByIdInput = z.infer<typeof TypeByIdInputSchema>;
export type TypeByIdOutput = z.infer<typeof TypeByIdOutputSchema>;
export type WaitForIdInput = z.infer<typeof WaitForIdInputSchema>;
export type WaitForIdOutput = z.infer<typeof WaitForIdOutputSchema>;
export type WaitForDescInput = z.infer<typeof WaitForDescInputSchema>;
export type WaitForDescOutput = z.infer<typeof WaitForDescOutputSchema>;
export type WaitForActivityInput = z.infer<typeof WaitForActivityInputSchema>;
export type WaitForActivityOutput = z.infer<typeof WaitForActivityOutputSchema>;
export type PressKeySequenceInput = z.infer<typeof PressKeySequenceInputSchema>;
export type PressKeySequenceOutput = z.infer<typeof PressKeySequenceOutputSchema>;
export type TapRelativeInput = z.infer<typeof TapRelativeInputSchema>;
export type TapRelativeOutput = z.infer<typeof TapRelativeOutputSchema>;
export type SwipeRelativeInput = z.infer<typeof SwipeRelativeInputSchema>;
export type SwipeRelativeOutput = z.infer<typeof SwipeRelativeOutputSchema>;
export type TapCenterInput = z.infer<typeof TapCenterInputSchema>;
export type TapCenterOutput = z.infer<typeof TapCenterOutputSchema>;
export type WaitForUiStableInput = z.infer<typeof WaitForUiStableInputSchema>;
export type WaitForUiStableOutput = z.infer<typeof WaitForUiStableOutputSchema>;
export type GetScreenHashInput = z.infer<typeof GetScreenHashInputSchema>;
export type GetScreenHashOutput = z.infer<typeof GetScreenHashOutputSchema>;
export type WaitForPackageInput = z.infer<typeof WaitForPackageInputSchema>;
export type WaitForPackageOutput = z.infer<typeof WaitForPackageOutputSchema>;
export type FlowStep = z.infer<typeof FlowStepSchema>;
export type RunFlowPlanInput = z.infer<typeof RunFlowPlanInputSchema>;
export type RunFlowPlanOutput = z.infer<typeof RunFlowPlanOutputSchema>;
export type UiSelector = z.infer<typeof UiSelectorSchema>;
export type QueryUiInput = z.infer<typeof QueryUiInputSchema>;
export type QueryUiOutput = z.infer<typeof QueryUiOutputSchema>;
export type WaitForNodeCountInput = z.infer<typeof WaitForNodeCountInputSchema>;
export type WaitForNodeCountOutput = z.infer<typeof WaitForNodeCountOutputSchema>;
export type TapBySelectorIndexInput = z.infer<typeof TapBySelectorIndexInputSchema>;
export type TapBySelectorIndexOutput = z.infer<typeof TapBySelectorIndexOutputSchema>;
export type UiDumpCachedInput = z.infer<typeof UiDumpCachedInputSchema>;
export type UiDumpCachedOutput = z.infer<typeof UiDumpCachedOutputSchema>;
export type ReversePortInput = z.infer<typeof ReversePortInputSchema>;
export type ReversePortOutput = z.infer<typeof ReversePortOutputSchema>;
export type ForwardPortInput = z.infer<typeof ForwardPortInputSchema>;
export type ForwardPortOutput = z.infer<typeof ForwardPortOutputSchema>;
export type GetLogcatInput = z.infer<typeof GetLogcatInputSchema>;
export type GetLogcatOutput = z.infer<typeof GetLogcatOutputSchema>;
export type ListActivitiesInput = z.infer<typeof ListActivitiesInputSchema>;
export type ListActivitiesOutput = z.infer<typeof ListActivitiesOutputSchema>;
export type HotReloadSetupInput = z.infer<typeof HotReloadSetupInputSchema>;
export type HotReloadSetupOutput = z.infer<typeof HotReloadSetupOutputSchema>;
