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
  throttleMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Reuse cached screenshots within this window (milliseconds).'),
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
  waitForLaunch: z
    .boolean()
    .default(false)
    .describe('Wait until package is in foreground after launch attempt.'),
  waitTimeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional timeout in milliseconds when waitForLaunch is enabled.'),
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
  preActionWaitMs: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Optional wait before running the batch actions (milliseconds).'),
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

export const RunAndroidShellInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  command: z.string().min(1).describe('Raw shell command to execute on the Android device.'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional timeout in milliseconds for the shell command.'),
});

export const RunAndroidMonkeyInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  packageName: z.string().optional().describe('Optional package to constrain monkey events to.'),
  eventCount: z
    .number()
    .int()
    .positive()
    .default(1000)
    .describe('Number of monkey events to run.'),
  throttleMs: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Optional delay in milliseconds between events.'),
  seed: z.number().int().optional().describe('Optional deterministic random seed.'),
  ignoreCrashes: z
    .boolean()
    .default(true)
    .describe('Continue on application crashes.'),
  ignoreTimeouts: z
    .boolean()
    .default(true)
    .describe('Continue on application timeouts.'),
  ignoreSecurityExceptions: z
    .boolean()
    .default(true)
    .describe('Continue on security exceptions.'),
  monitorNativeCrashes: z
    .boolean()
    .default(true)
    .describe('Monitor and report native crashes.'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional timeout in milliseconds for the monkey run.'),
});

export const RecordAndroidScreenInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  durationSec: z
    .number()
    .int()
    .min(1)
    .max(180)
    .default(15)
    .describe('Recording duration in seconds (Android screenrecord max: 180).'),
  bitRateMbps: z
    .number()
    .positive()
    .optional()
    .describe('Optional video bitrate in Mbps.'),
  size: z.string().optional().describe('Optional video size (e.g., 1280x720).'),
  rotate: z.boolean().default(false).describe('Rotate the recording 90 degrees.'),
  bugreport: z
    .boolean()
    .default(false)
    .describe('Overlay bugreport diagnostics onto the recording.'),
  remotePath: z
    .string()
    .optional()
    .describe('Optional remote path on device to save the temporary recording.'),
  localPath: z
    .string()
    .optional()
    .describe('Optional local path to save the pulled recording file.'),
  deleteRemote: z
    .boolean()
    .default(true)
    .describe('Delete the temporary remote recording file after pulling.'),
});

export const CaptureBugreportInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  outputDir: z
    .string()
    .optional()
    .describe('Optional local output directory for generated bugreport files.'),
  filePrefix: z
    .string()
    .optional()
    .describe('Optional filename prefix for bugreport artifacts.'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional timeout in milliseconds for bugreport capture.'),
});

export const CollectDiagnosticsInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  packageName: z
    .string()
    .optional()
    .describe('Optional package name for package-specific diagnostics.'),
  propertyPrefix: z
    .string()
    .optional()
    .describe('Optional Android property prefix filter (e.g., ro.build).'),
  logcatLines: z
    .number()
    .int()
    .positive()
    .default(200)
    .describe('Number of logcat lines to include.'),
  logcatSince: z
    .string()
    .optional()
    .describe('Optional logcat time filter (e.g., 1m or absolute timestamp).'),
  logcatPriority: z
    .enum(['V', 'D', 'I', 'W', 'E', 'F', 'S'])
    .optional()
    .describe('Optional minimum log priority for diagnostics logcat.'),
  includeUiDump: z.boolean().default(true).describe('Include XML UI dump in diagnostics.'),
  uiMaxChars: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional max XML chars for UI dump truncation.'),
  uiUseCache: z.boolean().default(true).describe('Use cached UI dump if available.'),
  uiMaxAgeMs: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Optional maximum cache age for UI dump in milliseconds.'),
});

export const CapturePerformanceSnapshotInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  packageName: z.string().optional().describe('Optional package name for app-scoped perf stats.'),
  topLines: z
    .number()
    .int()
    .positive()
    .default(60)
    .describe('Number of lines to keep from top output.'),
  includeMeminfo: z.boolean().default(true).describe('Include dumpsys meminfo output.'),
  includeGfxInfo: z
    .boolean()
    .default(true)
    .describe('Include dumpsys gfxinfo framestats (requires packageName).'),
  includeCpuInfo: z.boolean().default(false).describe('Include /proc/cpuinfo output.'),
  includeCpuFreq: z
    .boolean()
    .default(true)
    .describe('Include current CPU frequency snapshot for all cores.'),
});

export const CaptureBatterySnapshotInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  includeHistory: z.boolean().default(false).describe('Include batterystats history tail.'),
  historyLines: z
    .number()
    .int()
    .positive()
    .default(300)
    .describe('Lines to keep when includeHistory is true.'),
  resetStats: z
    .boolean()
    .default(false)
    .describe('Reset batterystats after capture (dumpsys batterystats --reset).'),
});

export const CaptureNetworkSnapshotInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  includeWifi: z.boolean().default(true).describe('Include dumpsys wifi snapshot.'),
  includeConnectivity: z
    .boolean()
    .default(true)
    .describe('Include dumpsys connectivity snapshot.'),
  includeNetstats: z.boolean().default(true).describe('Include dumpsys netstats summary.'),
});

export const CaptureStorageSnapshotInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  packageName: z
    .string()
    .optional()
    .describe('Optional package name for package-specific storage usage probes.'),
  includePackageUsage: z
    .boolean()
    .default(true)
    .describe('Attempt to include app data/media usage for packageName.'),
});

export const CaptureCrashSnapshotInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  packageName: z.string().optional().describe('Optional package name for filtered crash logs.'),
  logcatLines: z
    .number()
    .int()
    .positive()
    .default(500)
    .describe('Lines to capture from crash buffers/logcat.'),
  includeAnrTraces: z.boolean().default(true).describe('Include /data/anr/traces.txt tail.'),
  includeTombstones: z.boolean().default(true).describe('Include tombstone file listing.'),
  includeDropBox: z
    .boolean()
    .default(false)
    .describe('Include dumpsys dropbox crash entries (can be large).'),
});

export const CaptureNotificationSnapshotInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  packageName: z.string().optional().describe('Optional package name filter for notification lines.'),
  includeListeners: z.boolean().default(true).describe('Include notification listeners snapshot.'),
  includePolicy: z.boolean().default(true).describe('Include notification policy snapshot.'),
  includeStats: z.boolean().default(true).describe('Include notification stats snapshot.'),
  maxLines: z
    .number()
    .int()
    .positive()
    .default(800)
    .describe('Maximum lines to keep from full notification dump output.'),
});

export const CaptureProcessSnapshotInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  packageName: z.string().optional().describe('Optional package name for PID-scoped process details.'),
  topLines: z
    .number()
    .int()
    .positive()
    .default(60)
    .describe('Number of lines to keep from top output.'),
  includeProcStatus: z
    .boolean()
    .default(true)
    .describe('Include /proc/<pid>/status when package PID is available.'),
  includeThreads: z
    .boolean()
    .default(false)
    .describe('Include per-thread process listing when package PID is available.'),
  includeOpenFiles: z
    .boolean()
    .default(false)
    .describe('Include /proc/<pid>/fd listing when package PID is available.'),
});

export const CaptureServicesSnapshotInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  packageName: z.string().optional().describe('Optional package name for package dump section.'),
  includeJobs: z.boolean().default(true).describe('Include jobscheduler snapshot.'),
  includeAlarms: z.boolean().default(true).describe('Include alarm manager snapshot.'),
  includeBroadcasts: z.boolean().default(true).describe('Include activity broadcasts snapshot.'),
  includePackageServices: z
    .boolean()
    .default(true)
    .describe('Include dumpsys package snapshot for packageName.'),
});

export const CaptureSensorsSnapshotInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  includeThermal: z.boolean().default(true).describe('Include thermalservice snapshot.'),
  includePower: z.boolean().default(true).describe('Include power manager snapshot.'),
  includeDisplay: z.boolean().default(true).describe('Include display snapshot.'),
});

export const CaptureGraphicsSnapshotInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  packageName: z.string().optional().describe('Optional package name for gfxinfo framestats.'),
  includeSurfaceFlinger: z.boolean().default(true).describe('Include SurfaceFlinger snapshots.'),
  includeWindow: z.boolean().default(true).describe('Include window manager snapshot.'),
  includeComposer: z
    .boolean()
    .default(false)
    .describe('Include SurfaceFlinger display/composer metadata snapshot.'),
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
  launchedActivity: z.string().optional().describe('Resolved launch activity used (if resolved)'),
  fallbackUsed: z
    .enum(['explicit', 'resolved-main', 'monkey'])
    .optional()
    .describe('Launch strategy used after trying explicit activity.'),
  waitForLaunch: z.boolean().optional().describe('Whether foreground verification was requested.'),
  foregroundPackage: z.string().optional().describe('Foreground package after launch attempt.'),
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

export const ListInstalledPackagesInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  filter: z.string().optional().describe('Optional package name filter.'),
  thirdPartyOnly: z.boolean().optional().describe('Only third-party packages (-3).'),
  systemOnly: z.boolean().optional().describe('Only system packages (-s).'),
  disabledOnly: z.boolean().optional().describe('Only disabled packages (-d).'),
  enabledOnly: z.boolean().optional().describe('Only enabled packages (-e).'),
  includeUninstalled: z.boolean().optional().describe('Include uninstalled packages (-u).'),
  user: z.union([z.string(), z.number()]).optional().describe('User id to query.'),
});

export const ListInstalledPackagesOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  packages: z.array(z.string()).describe('Package names'),
  output: z.string().describe('Raw ADB output'),
});

export const IsAppInstalledInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  packageName: z.string().min(1).describe('Package name to check.'),
});

export const IsAppInstalledOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  packageName: z.string().describe('Package name'),
  installed: z.boolean().describe('Whether the package is installed'),
  path: z.string().optional().describe('APK path if installed'),
});

export const GetAppVersionInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  packageName: z.string().min(1).describe('Package name to inspect.'),
});

export const GetAppVersionOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  packageName: z.string().describe('Package name'),
  versionName: z.string().optional().describe('Version name'),
  versionCode: z.string().optional().describe('Version code'),
  output: z.string().describe('Raw dumpsys output'),
});

export const GetAndroidPropertyInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  property: z.string().min(1).describe('Property key (getprop).'),
});

export const GetAndroidPropertyOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  property: z.string().describe('Property key'),
  value: z.string().describe('Property value'),
});

export const GetAndroidPropertiesInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  prefix: z.string().optional().describe('Optional property prefix filter.'),
});

export const GetAndroidPropertiesOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  properties: z.record(z.string()).describe('Properties map'),
  output: z.string().describe('Raw getprop output'),
});

export const OpenUrlInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  url: z.string().min(1).describe('URL to open.'),
});

export const OpenUrlOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  url: z.string().describe('URL opened'),
  output: z.string().describe('Raw ADB output'),
});

export const OpenChromeUrlInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  url: z.string().min(1).describe('URL to open in Chrome.'),
  browserPackage: z
    .string()
    .default('com.android.chrome')
    .describe('Chrome package used to open the URL.'),
  browserActivity: z
    .string()
    .default('com.google.android.apps.chrome.Main')
    .describe('Chrome activity used for explicit launch.'),
  fallbackToDefault: z
    .boolean()
    .default(true)
    .describe('If explicit launch fails, fall back to default Android VIEW intent.'),
  waitForReadyMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional wait after launch before returning (milliseconds).'),
});

export const OpenChromeUrlOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  url: z.string().describe('URL opened'),
  browserPackage: z.string().describe('Browser package used'),
  browserActivity: z.string().describe('Browser activity used'),
  browserInstalled: z.boolean().describe('Whether browser package is installed'),
  strategy: z
    .string()
    .describe('Execution strategy used: chrome-explicit, chrome-explicit-fallback, default-intent'),
  output: z.string().describe('Raw ADB output'),
});

export const OpenChromeUrlAndLoginInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  url: z.string().min(1).describe('URL to open in Chrome, then run login.'),
  email: z.string().min(1).describe('Email/login value.'),
  password: z.string().min(1).describe('Password value.'),
  browserPackage: z
    .string()
    .default('com.android.chrome')
    .describe('Chrome package used to open the URL.'),
  browserActivity: z
    .string()
    .default('com.google.android.apps.chrome.Main')
    .describe('Chrome activity used for explicit launch.'),
  fallbackToDefault: z
    .boolean()
    .default(true)
    .describe('If explicit launch fails, fall back to default Android VIEW intent.'),
  waitForReadyMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional wait after launch before starting login (milliseconds).'),
  submitLabels: z.array(z.string()).optional().describe('Custom submit button labels for login.'),
  imeId: z
    .string()
    .optional()
    .describe('Optional IME ID for ADB keyboard (default: com.android.adbkeyboard/.AdbIME).'),
  hideKeyboard: z.boolean().default(true).describe('Hide keyboard before submit.'),
  useAdbKeyboard: z.boolean().default(false).describe('Use ADB keyboard batching path for faster login.'),
  submitFallback: z
    .boolean()
    .default(true)
    .describe('Attempt editor action/enter if no submit button is found.'),
});

export const OpenChromeUrlAndLoginOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  url: z.string().describe('URL opened'),
  openResult: OpenChromeUrlOutputSchema,
  loginResult: z.object({
    deviceId: z.string().describe('Target device ID'),
    emailFieldFound: z.boolean().describe('Whether an email field was found'),
    passwordFieldFound: z.boolean().describe('Whether a password field was found'),
    submitFound: z.boolean().describe('Whether a submit button was found'),
    usedIme: z.boolean().describe('Whether ADB keyboard was used'),
    output: z.array(z.string()).describe('Raw ADB outputs'),
  }),
  steps: z.array(z.string()).describe('Combined execution output lines'),
});

export const OpenAndroidSettingsInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  screen: z
    .enum(['settings', 'developer-options'])
    .default('settings')
    .describe('Settings screen shortcut to open.'),
  activity: z.string().optional().describe('Optional explicit Android activity component to open.'),
  waitForReadyMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional wait after launch before returning (milliseconds).'),
});

export const OpenAndroidSettingsOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  screen: z.string().describe('Settings screen shortcut that was used.'),
  activity: z.string().describe('Android activity/component started.'),
  output: z.string().describe('Raw ADB output'),
});

export const ConfigureUsbDebuggingInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  action: z
    .enum(['query', 'enable', 'disable'])
    .default('query')
    .describe('Desired operation: query current state, enable, or disable USB debugging.'),
  useSettingsApi: z
    .boolean()
    .default(true)
    .describe('Try settings commands first (fastest path).'),
  fallbackToUi: z
    .boolean()
    .default(true)
    .describe('If settings commands fail, open developer settings and try a fast UI fallback.'),
  waitForReadyMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional wait after launching settings before tapping fallback UI controls.'),
});

export const ConfigureUsbDebuggingOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  action: z.string().describe('Action executed.'),
  requestedEnabled: z.boolean().optional().describe('Requested target state (for enable/disable).'),
  adbEnabledBefore: z
    .boolean()
    .optional()
    .describe('ADB-enabled state before action (global adb_enabled).'),
  developmentSettingsEnabledBefore: z
    .boolean()
    .optional()
    .describe('Developer settings state before action (secure development_settings_enabled).'),
  adbEnabledAfter: z
    .boolean()
    .optional()
    .describe('ADB-enabled state after action (global adb_enabled).'),
  developmentSettingsEnabledAfter: z
    .boolean()
    .optional()
    .describe('Developer settings state after action (secure development_settings_enabled).'),
  adbEnabledRawBefore: z
    .string()
    .describe('Raw adb_enabled value read before action.'),
  developmentSettingsEnabledRawBefore: z
    .string()
    .describe('Raw development_settings_enabled value read before action.'),
  adbEnabledRawAfter: z
    .string()
    .optional()
    .describe('Raw adb_enabled value read after action.'),
  developmentSettingsEnabledRawAfter: z
    .string()
    .optional()
    .describe('Raw development_settings_enabled value read after action.'),
  success: z.boolean().describe('Whether requested action reached intended state.'),
  strategy: z
    .string()
    .describe('Execution strategy used: settings-api, settings-api+ui-fallback, settings-api-failed, ui-open-only'),
  openedActivity: z.string().optional().describe('Opened activity when UI fallback was used.'),
  steps: z.array(z.string()).describe('Executed operation steps (for diagnostics).'),
  output: z.string().describe('Raw ADB output summary'),
});

export const PasteClipboardInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
});

export const PasteClipboardOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  output: z.string().describe('Raw ADB output'),
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
  useCache: z.boolean().optional().describe('Use cached UI dump when available.'),
  maxAgeMs: z.number().int().positive().optional().describe('Max age for cached UI dump in ms.'),
  invalidateOnActivityChange: z
    .boolean()
    .optional()
    .describe('Invalidate cache when activity changes.'),
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

export const SwipeAndScreenshotInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  startX: z.number().describe('Start X coordinate'),
  startY: z.number().describe('Start Y coordinate'),
  endX: z.number().describe('End X coordinate'),
  endY: z.number().describe('End Y coordinate'),
  durationMs: z.number().int().min(0).optional().describe('Swipe duration in milliseconds'),
  postSwipeWaitMs: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Optional delay after swipe before capturing screenshot.'),
  screenshotThrottleMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Reuse cached screenshots within this window (milliseconds).'),
});

export const SwipeAndScreenshotOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  swipe: SwipeOutputSchema,
  screenshot: TakeScreenshotOutputSchema,
});

export const SmartSwipeInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  startX: z.number().describe('Start X coordinate'),
  startY: z.number().describe('Start Y coordinate'),
  endX: z.number().describe('End X coordinate'),
  endY: z.number().describe('End Y coordinate'),
  profile: z
    .enum(['fast', 'normal', 'safe'])
    .default('normal')
    .describe('Gesture timing profile.'),
  durationMs: z.number().int().min(0).optional().describe('Optional swipe duration in milliseconds'),
  postSwipeWaitMs: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Optional delay after swipe before stabilization/screenshot.'),
  waitForUiStable: z
    .boolean()
    .optional()
    .describe('Wait for UI to stabilize after swipe (defaults by profile).'),
  stableIterations: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Stable dump count for UI stability (defaults by profile).'),
  intervalMs: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Polling interval for UI stability (defaults by profile).'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Max wait time for UI stability (defaults by profile).'),
  captureScreenshot: z.boolean().default(false).describe('Capture screenshot after swipe.'),
  screenshotThrottleMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Reuse cached screenshots within this window (milliseconds).'),
});

export const SmartSwipeOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  swipe: SwipeOutputSchema,
  uiStable: z.any().optional(),
  screenshot: TakeScreenshotOutputSchema.optional(),
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


export const TapByTextInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  text: z.string().min(1).describe('Text to match.'),
  matchMode: z.enum(['exact', 'contains', 'regex']).default('exact').describe('Match mode.'),
  index: z.number().int().min(0).default(0).describe('Match index (0-based).'),
  useFallback: z
    .boolean()
    .default(true)
    .describe('Use clickable container fallback when matched node is not directly clickable.'),
});

export const TapByTextOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  text: z.string().describe('Matched text'),
  matchMode: z.string().describe('Match mode used'),
  index: z.number().describe('Match index used'),
  found: z.boolean().describe('Whether a match was found'),
  clickableFallbackUsed: z
    .boolean()
    .optional()
    .describe('Whether a fallback tap target was used'),
  fallbackReason: z
    .string()
    .optional()
    .describe('Reason for fallback when no direct clickable match was found'),
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
  useFallback: z
    .boolean()
    .default(true)
    .describe('Use clickable container fallback when matched node is not directly clickable.'),
});

export const TapByIdOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  resourceId: z.string().describe('Matched resource-id'),
  index: z.number().describe('Match index used'),
  found: z.boolean().describe('Whether a match was found'),
  clickableFallbackUsed: z
    .boolean()
    .optional()
    .describe('Whether a fallback tap target was used'),
  fallbackReason: z
    .string()
    .optional()
    .describe('Reason for fallback when no direct clickable match was found'),
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
  useFallback: z
    .boolean()
    .default(true)
    .describe('Use clickable container fallback when matched node is not directly clickable.'),
});

export const TapByDescOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  contentDesc: z.string().describe('Matched content-desc'),
  matchMode: z.string().describe('Match mode used'),
  index: z.number().describe('Match index used'),
  found: z.boolean().describe('Whether a match was found'),
  clickableFallbackUsed: z
    .boolean()
    .optional()
    .describe('Whether a fallback tap target was used'),
  fallbackReason: z
    .string()
    .optional()
    .describe('Reason for fallback when no direct clickable match was found'),
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

export const WaitForTextDisappearInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  text: z.string().min(1).describe('Text to wait to disappear.'),
  matchMode: z.enum(['exact', 'contains', 'regex']).default('exact').describe('Match mode.'),
  timeoutMs: z.number().int().positive().optional().describe('Max wait time in milliseconds.'),
  intervalMs: z.number().int().positive().optional().describe('Polling interval in milliseconds.'),
});

export const WaitForTextDisappearOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  text: z.string().describe('Target text'),
  matchMode: z.string().describe('Match mode used'),
  disappeared: z.boolean().describe('Whether the text disappeared'),
  elapsedMs: z.number().describe('Elapsed time in milliseconds'),
  matchCount: z.number().describe('Remaining matches found'),
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

export const WaitForIdDisappearInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  resourceId: z.string().min(1).describe('Resource-id to wait to disappear.'),
  matchMode: z.enum(['exact', 'contains', 'regex']).default('exact').describe('Match mode.'),
  timeoutMs: z.number().int().positive().optional().describe('Max wait time in milliseconds.'),
  intervalMs: z.number().int().positive().optional().describe('Polling interval in milliseconds.'),
});

export const WaitForIdDisappearOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  resourceId: z.string().describe('Target resource-id'),
  matchMode: z.string().describe('Match mode used'),
  disappeared: z.boolean().describe('Whether the id disappeared'),
  elapsedMs: z.number().describe('Elapsed time in milliseconds'),
  matchCount: z.number().describe('Remaining matches found'),
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

export const WaitForDescDisappearInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  contentDesc: z.string().min(1).describe('Content-desc to wait to disappear.'),
  matchMode: z.enum(['exact', 'contains', 'regex']).default('exact').describe('Match mode.'),
  timeoutMs: z.number().int().positive().optional().describe('Max wait time in milliseconds.'),
  intervalMs: z.number().int().positive().optional().describe('Polling interval in milliseconds.'),
});

export const WaitForDescDisappearOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  contentDesc: z.string().describe('Target content-desc'),
  matchMode: z.string().describe('Match mode used'),
  disappeared: z.boolean().describe('Whether the desc disappeared'),
  elapsedMs: z.number().describe('Elapsed time in milliseconds'),
  matchCount: z.number().describe('Remaining matches found'),
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

export const WaitForActivityChangeInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  previousActivity: z.string().optional().describe('Previous activity/component to compare against.'),
  targetActivity: z.string().optional().describe('Optional target activity/component to wait for.'),
  matchMode: z.enum(['exact', 'contains', 'regex']).default('contains').describe('Match mode.'),
  timeoutMs: z.number().int().positive().optional().describe('Max wait time in milliseconds.'),
  intervalMs: z.number().int().positive().optional().describe('Polling interval in milliseconds.'),
});

export const WaitForActivityChangeOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  previous: z.string().describe('Previous activity/component'),
  current: z.string().describe('Current activity/component'),
  changed: z.boolean().describe('Whether the activity changed'),
  elapsedMs: z.number().describe('Elapsed time in milliseconds'),
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

export const ScrollVerticalInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  direction: z.enum(['up', 'down']).describe('Scroll direction (screen swipe).'),
  distancePercent: z
    .number()
    .min(10)
    .max(90)
    .optional()
    .describe('Swipe distance percentage (10-90).'),
  durationMs: z.number().int().min(0).optional().describe('Optional swipe duration in ms.'),
  startXPercent: z.number().min(0).max(100).optional().describe('Optional X percent for swipe.'),
});

export const ScrollVerticalOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  direction: z.string().describe('Scroll direction'),
  output: z.string().describe('Raw ADB output'),
});

export const SmartScrollInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  direction: z.enum(['up', 'down']).describe('Scroll direction (screen swipe).'),
  startXPercent: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe('Optional X percent for swipe.'),
  distancePercent: z
    .number()
    .min(10)
    .max(90)
    .optional()
    .describe('Swipe distance percentage (10-90).'),
  profile: z
    .enum(['fast', 'normal', 'safe'])
    .default('normal')
    .describe('Gesture timing profile.'),
  durationMs: z.number().int().min(0).optional().describe('Optional swipe duration in ms.'),
  waitForUiStable: z
    .boolean()
    .optional()
    .describe('Wait for UI to stabilize after swipe (defaults by profile).'),
  stableIterations: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Stable dump count for UI stability (defaults by profile).'),
  intervalMs: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Polling interval for UI stability (defaults by profile).'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Max wait time for UI stability (defaults by profile).'),
  captureScreenshot: z.boolean().default(false).describe('Capture screenshot after swipe.'),
  autoCorrectDirection: z
    .boolean()
    .default(true)
    .describe('Auto-correct direction if no UI change is detected.'),
  screenshotThrottleMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Reuse cached screenshots within this window (milliseconds).'),
});

export const SmartScrollOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  direction: z.string().describe('Scroll direction'),
  output: z.string().describe('Raw ADB output'),
  uiStable: z.any().optional(),
  screenshot: TakeScreenshotOutputSchema.optional(),
  hashBefore: z.string().optional().describe('UI hash before scroll'),
  hashAfter: z.string().optional().describe('UI hash after scroll'),
  changed: z.boolean().optional().describe('Whether UI hash changed after scroll'),
  correctedDirection: z.string().optional().describe('Direction used after auto-correction'),
  attempts: z.number().optional().describe('Number of scroll attempts'),
});

export const ScrollHorizontalInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  direction: z.enum(['left', 'right']).describe('Scroll direction (screen swipe).'),
  distancePercent: z
    .number()
    .min(10)
    .max(90)
    .optional()
    .describe('Swipe distance percentage (10-90).'),
  durationMs: z.number().int().min(0).optional().describe('Optional swipe duration in ms.'),
  startYPercent: z.number().min(0).max(100).optional().describe('Optional Y percent for swipe.'),
});

export const ScrollHorizontalOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  direction: z.string().describe('Scroll direction'),
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

export const LongPressInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  x: z.number().describe('X coordinate'),
  y: z.number().describe('Y coordinate'),
  durationMs: z.number().int().min(200).optional().describe('Long-press duration in ms.'),
});

export const LongPressOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  x: z.number().describe('X coordinate'),
  y: z.number().describe('Y coordinate'),
  durationMs: z.number().describe('Long-press duration in ms'),
  output: z.string().describe('Raw ADB output'),
});

export const DoubleTapInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  x: z.number().describe('X coordinate'),
  y: z.number().describe('Y coordinate'),
  intervalMs: z.number().int().min(20).optional().describe('Delay between taps.'),
});

export const DoubleTapOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  x: z.number().describe('X coordinate'),
  y: z.number().describe('Y coordinate'),
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

export const ScrollUntilTextInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  text: z.string().min(1).describe('Text to find while scrolling.'),
  matchMode: z.enum(['exact', 'contains', 'regex']).default('exact').describe('Match mode.'),
  direction: z.enum(['up', 'down']).default('down').describe('Scroll direction (screen swipe).'),
  distancePercent: z
    .number()
    .min(10)
    .max(90)
    .optional()
    .describe('Swipe distance percentage (10-90).'),
  maxScrolls: z.number().int().min(0).optional().describe('Maximum scroll attempts.'),
  intervalMs: z.number().int().min(0).optional().describe('Delay between scroll attempts.'),
});

export const ScrollUntilTextOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  text: z.string().describe('Target text'),
  found: z.boolean().describe('Whether the text was found'),
  scrolls: z.number().describe('Scroll attempts used'),
  matchCount: z.number().describe('Matches found'),
});

export const ScrollUntilIdInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  resourceId: z.string().min(1).describe('Resource-id to find while scrolling.'),
  matchMode: z.enum(['exact', 'contains', 'regex']).default('exact').describe('Match mode.'),
  direction: z.enum(['up', 'down']).default('down').describe('Scroll direction (screen swipe).'),
  distancePercent: z
    .number()
    .min(10)
    .max(90)
    .optional()
    .describe('Swipe distance percentage (10-90).'),
  maxScrolls: z.number().int().min(0).optional().describe('Maximum scroll attempts.'),
  intervalMs: z.number().int().min(0).optional().describe('Delay between scroll attempts.'),
});

export const ScrollUntilIdOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  resourceId: z.string().describe('Target resource-id'),
  found: z.boolean().describe('Whether the id was found'),
  scrolls: z.number().describe('Scroll attempts used'),
  matchCount: z.number().describe('Matches found'),
});

export const ScrollUntilDescInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  contentDesc: z.string().min(1).describe('Content-desc to find while scrolling.'),
  matchMode: z.enum(['exact', 'contains', 'regex']).default('exact').describe('Match mode.'),
  direction: z.enum(['up', 'down']).default('down').describe('Scroll direction (screen swipe).'),
  distancePercent: z
    .number()
    .min(10)
    .max(90)
    .optional()
    .describe('Swipe distance percentage (10-90).'),
  maxScrolls: z.number().int().min(0).optional().describe('Maximum scroll attempts.'),
  intervalMs: z.number().int().min(0).optional().describe('Delay between scroll attempts.'),
});

export const ScrollUntilDescOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  contentDesc: z.string().describe('Target content-desc'),
  found: z.boolean().describe('Whether the desc was found'),
  scrolls: z.number().describe('Scroll attempts used'),
  matchCount: z.number().describe('Matches found'),
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
  retries: z.number().int().min(0).optional().describe('Optional retries for this step.'),
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

const FlowAssertTextStepSchema = FlowStepBaseSchema.extend({
  type: z.literal('assert_text'),
  text: z.string().min(1),
  matchMode: z.enum(['exact', 'contains', 'regex']).optional(),
  timeoutMs: z.number().int().positive().optional(),
  intervalMs: z.number().int().positive().optional(),
});

const FlowAssertIdStepSchema = FlowStepBaseSchema.extend({
  type: z.literal('assert_id'),
  resourceId: z.string().min(1),
  matchMode: z.enum(['exact', 'contains', 'regex']).optional(),
  timeoutMs: z.number().int().positive().optional(),
  intervalMs: z.number().int().positive().optional(),
});

const FlowAssertDescStepSchema = FlowStepBaseSchema.extend({
  type: z.literal('assert_desc'),
  contentDesc: z.string().min(1),
  matchMode: z.enum(['exact', 'contains', 'regex']).optional(),
  timeoutMs: z.number().int().positive().optional(),
  intervalMs: z.number().int().positive().optional(),
});

const FlowAssertActivityStepSchema = FlowStepBaseSchema.extend({
  type: z.literal('assert_activity'),
  activity: z.string().min(1),
  matchMode: z.enum(['exact', 'contains', 'regex']).optional(),
  timeoutMs: z.number().int().positive().optional(),
  intervalMs: z.number().int().positive().optional(),
});

const FlowAssertPackageStepSchema = FlowStepBaseSchema.extend({
  type: z.literal('assert_package'),
  packageName: z.string().min(1),
  timeoutMs: z.number().int().positive().optional(),
  intervalMs: z.number().int().positive().optional(),
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
  FlowAssertTextStepSchema,
  FlowAssertIdStepSchema,
  FlowAssertDescStepSchema,
  FlowAssertActivityStepSchema,
  FlowAssertPackageStepSchema,
]);

export const RunFlowPlanInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  deviceAlias: z.string().optional().describe('Optional device alias to resolve.'),
  steps: z.array(FlowStepSchema).min(1).describe('Ordered list of steps to execute.'),
  stopOnFailure: z.boolean().default(true).describe('Stop when a step fails.'),
  stepRetries: z.number().int().min(0).default(0).describe('Retries per step.'),
  retryDelayMs: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Delay between step retries (milliseconds).'),
  onFailSteps: z
    .array(FlowStepSchema)
    .optional()
    .describe('Optional steps to execute when a step fails.'),
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

export const FastFlowInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  deviceAlias: z.string().optional().describe('Optional device alias to resolve.'),
  actions: z
    .array(BatchActionSchema)
    .optional()
    .describe('Ordered list of actions to run.'),
  steps: z.array(FlowStepSchema).optional().describe('Optional flow steps (selectors/waits).'),
  stepRetries: z.number().int().min(0).default(0).describe('Retries per step.'),
  retryDelayMs: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Delay between step retries (milliseconds).'),
  preActionWaitMs: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Optional wait before running actions (milliseconds).'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional timeout in milliseconds for the batch command.'),
  screenshotThrottleMs: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Reuse cached screenshots within this window (milliseconds).'),
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
  stepResults: z
    .array(
      z.object({
        id: z.string().optional(),
        type: z.string(),
        ok: z.boolean(),
        message: z.string().optional(),
        elapsedMs: z.number().optional(),
      })
    )
    .optional()
    .describe('Optional step execution results.'),
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
  useCache: z.boolean().optional().describe('Use cached UI dump when available.'),
  maxAgeMs: z.number().int().positive().optional().describe('Max age for cached UI dump in ms.'),
  invalidateOnActivityChange: z
    .boolean()
    .optional()
    .describe('Invalidate cache when activity changes.'),
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
  useFallback: z
    .boolean()
    .default(true)
    .describe('Use clickable container fallback when matched node is not directly clickable.'),
});

export const TapBySelectorIndexOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  selector: UiSelectorSchema,
  index: z.number().describe('Match index'),
  found: z.boolean().describe('Whether a match was found'),
  clickableFallbackUsed: z
    .boolean()
    .optional()
    .describe('Whether a fallback tap target was used'),
  fallbackReason: z
    .string()
    .optional()
    .describe('Reason for fallback when no direct clickable match was found'),
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
  maxAgeMs: z.number().int().positive().optional().describe('Max age for cached UI dump in ms.'),
  invalidateOnActivityChange: z
    .boolean()
    .optional()
    .describe('Invalidate cache when activity changes.'),
  refresh: z.boolean().optional().describe('Refresh cache when missing/stale.'),
});

export const UiDumpCachedOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  xml: z.string().describe('UI hierarchy XML'),
  length: z.number().describe('Length of XML returned'),
  truncated: z.boolean().optional().describe('Whether XML was truncated'),
  filePath: z.string().describe('Remote dump file path'),
  ageMs: z.number().describe('Age of cached dump in ms'),
  hash: z.string().optional().describe('Hash of cached dump'),
});

export const SetDeviceAliasInputSchema = z.object({
  alias: z.string().min(1).describe('Alias to assign.'),
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID to bind. Defaults to first available device.'),
});

export const SetDeviceAliasOutputSchema = z.object({
  alias: z.string().describe('Alias'),
  deviceId: z.string().describe('Resolved device ID'),
});

export const ResolveDeviceAliasInputSchema = z.object({
  alias: z.string().min(1).describe('Alias to resolve.'),
});

export const ResolveDeviceAliasOutputSchema = z.object({
  alias: z.string().describe('Alias'),
  deviceId: z.string().describe('Resolved device ID'),
});

export const ListDeviceAliasesInputSchema = z.object({});

export const ListDeviceAliasesOutputSchema = z.object({
  aliases: z.record(z.string(), z.string()).describe('Alias map'),
});

export const ClearDeviceAliasInputSchema = z.object({
  alias: z.string().min(1).describe('Alias to clear.'),
});

export const ClearDeviceAliasOutputSchema = z.object({
  alias: z.string().describe('Alias'),
  removed: z.boolean().describe('Whether the alias was removed'),
});

export const ListImesInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
});

export const ListImesOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  imes: z.array(z.string()).describe('Available IMEs'),
  current: z.string().optional().describe('Current IME'),
  output: z.string().describe('Raw ADB output'),
});

export const SetImeInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  imeId: z.string().min(1).describe('IME ID to set.'),
});

export const SetImeOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  imeId: z.string().describe('IME ID'),
  output: z.string().describe('Raw ADB output'),
});

export const EnableImeInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  imeId: z.string().min(1).describe('IME ID to enable.'),
});

export const EnableImeOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  imeId: z.string().describe('IME ID'),
  output: z.string().describe('Raw ADB output'),
});

export const AdbKeyboardInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  text: z.string().min(1).describe('Text to input via ADB Keyboard.'),
  imeId: z
    .string()
    .optional()
    .describe('Optional IME ID (default: com.android.adbkeyboard/.AdbIME).'),
  setIme: z.boolean().default(true).describe('Enable and set IME before input.'),
  useBase64: z.boolean().default(true).describe('Send via base64 broadcast.'),
});

export const AdbKeyboardOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  imeId: z.string().describe('IME ID used'),
  textLength: z.number().describe('Length of text sent'),
  output: z.string().describe('Raw ADB output'),
});

export const AdbKeyboardClearTextInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  imeId: z
    .string()
    .optional()
    .describe('Optional IME ID (default: com.android.adbkeyboard/.AdbIME).'),
  setIme: z.boolean().default(true).describe('Enable and set IME before clearing.'),
});

export const AdbKeyboardClearTextOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  imeId: z.string().describe('IME ID used'),
  output: z.string().describe('Raw ADB output'),
});

export const AdbKeyboardInputCodeInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  code: z.number().int().describe('Key code to input via ADB Keyboard.'),
  imeId: z
    .string()
    .optional()
    .describe('Optional IME ID (default: com.android.adbkeyboard/.AdbIME).'),
  setIme: z.boolean().default(true).describe('Enable and set IME before input.'),
});

export const AdbKeyboardInputCodeOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  imeId: z.string().describe('IME ID used'),
  code: z.number().describe('Key code sent'),
  output: z.string().describe('Raw ADB output'),
});

export const AdbKeyboardEditorActionInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  code: z.number().int().describe('Editor action code to send.'),
  imeId: z
    .string()
    .optional()
    .describe('Optional IME ID (default: com.android.adbkeyboard/.AdbIME).'),
  setIme: z.boolean().default(true).describe('Enable and set IME before action.'),
});

export const AdbKeyboardEditorActionOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  imeId: z.string().describe('IME ID used'),
  code: z.number().describe('Editor action code sent'),
  output: z.string().describe('Raw ADB output'),
});

export const AdbKeyboardInputCharsInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  text: z.string().min(1).describe('Text to input as codepoints.'),
  imeId: z
    .string()
    .optional()
    .describe('Optional IME ID (default: com.android.adbkeyboard/.AdbIME).'),
  setIme: z.boolean().default(true).describe('Enable and set IME before input.'),
});

export const AdbKeyboardInputCharsOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  imeId: z.string().describe('IME ID used'),
  codepoints: z.array(z.number()).describe('Unicode codepoints sent'),
  output: z.string().describe('Raw ADB output'),
});

export const SetAdbKeyboardModeInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  imeId: z
    .string()
    .optional()
    .describe('Optional IME ID (default: com.android.adbkeyboard/.AdbIME).'),
  enable: z.boolean().default(true).describe('Enable ADB keyboard mode if true; restore if false.'),
});

export const SetAdbKeyboardModeOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  imeId: z.string().describe('IME ID used'),
  previousIme: z.string().optional().describe('Previous IME when enabling'),
  output: z.string().describe('Raw ADB output'),
});

export const SmartLoginInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  email: z.string().min(1).describe('Email/login value.'),
  password: z.string().min(1).describe('Password value.'),
  submitLabels: z.array(z.string()).optional().describe('Custom submit button labels.'),
  imeId: z
    .string()
    .optional()
    .describe('Optional IME ID for ADB keyboard (default: com.android.adbkeyboard/.AdbIME).'),
  hideKeyboard: z.boolean().default(true).describe('Hide keyboard before submit.'),
  submitFallback: z
    .boolean()
    .default(true)
    .describe('Attempt editor action/enter if no submit button is found.'),
});

export const SmartLoginOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  emailFieldFound: z.boolean().describe('Whether an email field was found'),
  passwordFieldFound: z.boolean().describe('Whether a password field was found'),
  submitFound: z.boolean().describe('Whether a submit button was found'),
  usedIme: z.boolean().describe('Whether ADB keyboard was used'),
  output: z.array(z.string()).describe('Raw ADB outputs'),
});

export const DetectLoginFieldsInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  submitLabels: z.array(z.string()).optional().describe('Custom submit labels.'),
});

export const DetectLoginFieldsOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  emailField: z.any().optional().describe('Matched email field node'),
  passwordField: z.any().optional().describe('Matched password field node'),
  submitButton: z.any().optional().describe('Matched submit button node'),
});

export const SmartLoginFastInputSchema = z.object({
  deviceId: z
    .string()
    .optional()
    .describe('Optional device ID. If not provided, uses the first available device.'),
  email: z.string().min(1).describe('Email/login value.'),
  password: z.string().min(1).describe('Password value.'),
  submitLabels: z.array(z.string()).optional().describe('Custom submit labels.'),
  hideKeyboard: z.boolean().default(true).describe('Hide keyboard before submit.'),
  useAdbKeyboard: z.boolean().default(false).describe('Use ADB Keyboard instead of batch input.'),
  submitFallback: z
    .boolean()
    .default(true)
    .describe('Attempt editor action/enter if no submit button is found.'),
});

export const SmartLoginFastOutputSchema = SmartLoginOutputSchema;

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

export const RunAndroidShellOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  command: z.string().describe('Executed raw shell command'),
  output: z.string().describe('Raw shell output'),
});

export const RunAndroidMonkeyOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  packageName: z.string().optional().describe('Package constraint used for monkey run'),
  eventCount: z.number().describe('Number of monkey events executed'),
  throttleMs: z.number().describe('Delay between events in milliseconds'),
  seed: z.number().optional().describe('Random seed used for monkey run'),
  output: z.string().describe('Raw monkey output'),
});

export const RecordAndroidScreenOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  durationSec: z.number().describe('Actual recording duration in seconds'),
  remotePath: z.string().describe('Temporary recording path on device'),
  localPath: z.string().describe('Local file path where recording was saved'),
  recordOutput: z.string().describe('Raw output from screenrecord command'),
  pullOutput: z.string().describe('Raw output from adb pull'),
  deleteOutput: z.string().optional().describe('Raw output from remote file deletion'),
});

export const CaptureBugreportOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  outputDir: z.string().describe('Local directory used for bugreport artifacts'),
  outputBasePath: z.string().describe('Bugreport base path passed to adb'),
  generatedFiles: z.array(z.string()).describe('Generated bugreport artifact file paths'),
  output: z.string().describe('Raw bugreport command output'),
});

export const CollectDiagnosticsOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  capturedAt: z.string().describe('ISO timestamp when diagnostics were captured'),
  activity: GetCurrentActivityOutputSchema.describe('Current foreground activity snapshot'),
  windowSize: GetWindowSizeOutputSchema.describe('Current window size snapshot'),
  screenHash: GetScreenHashOutputSchema.describe('Current screen hash snapshot'),
  properties: GetAndroidPropertiesOutputSchema.describe('Captured Android properties'),
  logcat: GetLogcatOutputSchema.describe('Captured logcat snippet'),
  uiDump: DumpUiOutputSchema.optional().describe('Optional UI dump snapshot'),
  packageInstalled: IsAppInstalledOutputSchema.optional().describe('Optional package install state'),
  packageVersion: GetAppVersionOutputSchema.optional().describe('Optional package version details'),
});

export const CapturePerformanceSnapshotOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  capturedAt: z.string().describe('ISO timestamp when snapshot was captured'),
  packageName: z.string().optional().describe('Package name used for app-scoped probes'),
  top: z.string().describe('top snapshot output'),
  loadAverage: z.string().describe('Current /proc/loadavg'),
  meminfo: z.string().optional().describe('dumpsys meminfo output'),
  gfxinfo: z.string().optional().describe('dumpsys gfxinfo framestats output'),
  cpuinfo: z.string().optional().describe('/proc/cpuinfo output'),
  cpuFrequency: z.string().optional().describe('Per-core current frequency snapshot'),
});

export const CaptureBatterySnapshotOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  capturedAt: z.string().describe('ISO timestamp when snapshot was captured'),
  battery: z.string().describe('dumpsys battery output'),
  batteryStats: z.string().describe('dumpsys batterystats output'),
  batteryProperties: z.string().describe('Battery-related getprop snapshot'),
  history: z.string().optional().describe('Optional batterystats history tail'),
  resetOutput: z.string().optional().describe('Optional output from batterystats reset'),
});

export const CaptureNetworkSnapshotOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  capturedAt: z.string().describe('ISO timestamp when snapshot was captured'),
  ipAddress: z.string().describe('ip addr output'),
  ipRoute: z.string().describe('ip route output'),
  dnsProperties: z.string().describe('DNS/dhcp properties snapshot'),
  wifi: z.string().optional().describe('Optional dumpsys wifi output'),
  connectivity: z.string().optional().describe('Optional dumpsys connectivity output'),
  netstats: z.string().optional().describe('Optional dumpsys netstats summary'),
});

export const CaptureStorageSnapshotOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  capturedAt: z.string().describe('ISO timestamp when snapshot was captured'),
  packageName: z.string().optional().describe('Package name used for package-specific probes'),
  df: z.string().describe('df -h output'),
  diskstats: z.string().describe('dumpsys diskstats output'),
  packagePaths: z.string().optional().describe('pm path output for packageName'),
  packageDataUsage: z.string().optional().describe('du output for /data/data/<package>'),
  packageMediaUsage: z.string().optional().describe('du output for /sdcard/Android/data/<package>'),
});

export const CaptureCrashSnapshotOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  capturedAt: z.string().describe('ISO timestamp when snapshot was captured'),
  packageName: z.string().optional().describe('Package name used for filtered crash logs'),
  crashBuffer: z.string().describe('logcat crash buffer output'),
  activityCrashes: z.string().describe('dumpsys activity crashes output'),
  packageCrashLog: GetLogcatOutputSchema.optional().describe('Optional package-filtered logcat snapshot'),
  anrTraces: z.string().optional().describe('Optional /data/anr/traces.txt tail'),
  tombstones: z.string().optional().describe('Optional tombstone listing'),
  dropboxCrashes: z.string().optional().describe('Optional dumpsys dropbox crash output'),
});

export const CaptureNotificationSnapshotOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  capturedAt: z.string().describe('ISO timestamp when snapshot was captured'),
  packageName: z.string().optional().describe('Optional package name filter used'),
  notification: z.string().describe('Notification manager snapshot'),
  packageMatches: z.string().optional().describe('Filtered lines matching packageName'),
  listeners: z.string().optional().describe('Notification listeners snapshot'),
  policy: z.string().optional().describe('Notification policy snapshot'),
  stats: z.string().optional().describe('Notification stats snapshot'),
});

export const CaptureProcessSnapshotOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  capturedAt: z.string().describe('ISO timestamp when snapshot was captured'),
  packageName: z.string().optional().describe('Optional package name used for PID-scoped probes'),
  pid: z.number().optional().describe('Resolved PID for packageName'),
  ps: z.string().describe('Process table snapshot'),
  top: z.string().describe('top snapshot output'),
  activityProcesses: z.string().describe('dumpsys activity processes snapshot'),
  procStatus: z.string().optional().describe('Optional /proc/<pid>/status snapshot'),
  threads: z.string().optional().describe('Optional thread listing for package PID'),
  openFiles: z.string().optional().describe('Optional open files listing for package PID'),
});

export const CaptureServicesSnapshotOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  capturedAt: z.string().describe('ISO timestamp when snapshot was captured'),
  packageName: z.string().optional().describe('Optional package name used for package dump'),
  services: z.string().describe('Activity services snapshot'),
  jobs: z.string().optional().describe('Optional jobscheduler snapshot'),
  alarms: z.string().optional().describe('Optional alarm manager snapshot'),
  broadcasts: z.string().optional().describe('Optional activity broadcasts snapshot'),
  packageDump: z.string().optional().describe('Optional package dump snapshot'),
});

export const CaptureSensorsSnapshotOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  capturedAt: z.string().describe('ISO timestamp when snapshot was captured'),
  sensorService: z.string().describe('Sensor service snapshot'),
  thermal: z.string().optional().describe('Optional thermalservice snapshot'),
  power: z.string().optional().describe('Optional power snapshot'),
  display: z.string().optional().describe('Optional display snapshot'),
});

export const CaptureGraphicsSnapshotOutputSchema = z.object({
  deviceId: z.string().describe('Target device ID'),
  capturedAt: z.string().describe('ISO timestamp when snapshot was captured'),
  packageName: z.string().optional().describe('Optional package name used for gfxinfo'),
  surfaceList: z.string().optional().describe('Optional SurfaceFlinger --list snapshot'),
  surfaceFlinger: z.string().optional().describe('Optional SurfaceFlinger dump snapshot'),
  window: z.string().optional().describe('Optional window manager snapshot'),
  composer: z.string().optional().describe('Optional SurfaceFlinger composer/display metadata'),
  gfxInfo: z.string().optional().describe('Optional package gfxinfo framestats snapshot'),
});

export const CreateIssueInputSchema = z.object({
  repo: z.string().optional().describe('GitHub repo in owner/name format.'),
  title: z.string().min(1).describe('Issue title.'),
  body: z.string().optional().describe('Issue body/description.'),
  labels: z.array(z.string()).optional().describe('Issue labels.'),
  assignees: z.array(z.string()).optional().describe('Issue assignees.'),
  dryRun: z.boolean().optional().describe('Skip creation and return the gh command.'),
});

export const CreateIssueOutputSchema = z.object({
  repo: z.string().describe('GitHub repo in owner/name format.'),
  title: z.string().describe('Issue title.'),
  url: z.string().optional().describe('Created issue URL (if created).'),
  output: z.string().describe('Raw gh output.'),
  command: z.string().describe('Rendered gh command that was executed.'),
  dryRun: z.boolean().optional().describe('Whether this was a dry run.'),
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
    throttleMs: {
      type: 'number' as const,
      description: 'Reuse cached screenshots within this window (milliseconds).',
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
    waitForLaunch: {
      type: 'boolean' as const,
      description: 'Wait until package is in foreground after start command.',
    },
    waitTimeoutMs: {
      type: 'number' as const,
      description: 'Optional timeout in milliseconds for foreground verification.',
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

export const ListInstalledPackagesToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    filter: { type: 'string' as const, description: 'Optional package name filter.' },
    thirdPartyOnly: { type: 'boolean' as const, description: 'Only third-party packages (-3).' },
    systemOnly: { type: 'boolean' as const, description: 'Only system packages (-s).' },
    disabledOnly: { type: 'boolean' as const, description: 'Only disabled packages (-d).' },
    enabledOnly: { type: 'boolean' as const, description: 'Only enabled packages (-e).' },
    includeUninstalled: { type: 'boolean' as const, description: 'Include uninstalled packages (-u).' },
    user: { type: 'string' as const, description: 'User id to query.' },
  },
  required: [] as string[],
};

export const IsAppInstalledToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    packageName: { type: 'string' as const, description: 'Package name to check.' },
  },
  required: ['packageName'] as string[],
};

export const GetAppVersionToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    packageName: { type: 'string' as const, description: 'Package name to inspect.' },
  },
  required: ['packageName'] as string[],
};

export const GetAndroidPropertyToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    property: { type: 'string' as const, description: 'Property key (getprop).' },
  },
  required: ['property'] as string[],
};

export const GetAndroidPropertiesToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    prefix: { type: 'string' as const, description: 'Optional property prefix filter.' },
  },
  required: [] as string[],
};

export const OpenUrlToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    url: { type: 'string' as const, description: 'URL to open.' },
  },
  required: ['url'] as string[],
};

export const OpenChromeUrlToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    url: { type: 'string' as const, description: 'URL to open in Chrome.' },
    browserPackage: {
      type: 'string' as const,
      default: 'com.android.chrome',
      description: 'Chrome package used to open the URL.',
    },
    browserActivity: {
      type: 'string' as const,
      default: 'com.google.android.apps.chrome.Main',
      description: 'Chrome activity used for explicit launch.',
    },
    fallbackToDefault: {
      type: 'boolean' as const,
      default: true,
      description: 'If explicit launch fails, fall back to default Android VIEW intent.',
    },
    waitForReadyMs: {
      type: 'number' as const,
      description: 'Optional wait after launch before returning (milliseconds).',
    },
  },
  required: ['url'] as string[],
};

export const OpenChromeUrlAndLoginToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    url: { type: 'string' as const, description: 'URL to open in Chrome, then run login.' },
    email: { type: 'string' as const, description: 'Email/login value.' },
    password: { type: 'string' as const, description: 'Password value.' },
    browserPackage: {
      type: 'string' as const,
      default: 'com.android.chrome',
      description: 'Chrome package used to open the URL.',
    },
    browserActivity: {
      type: 'string' as const,
      default: 'com.google.android.apps.chrome.Main',
      description: 'Chrome activity used for explicit launch.',
    },
    fallbackToDefault: {
      type: 'boolean' as const,
      default: true,
      description: 'If explicit launch fails, fall back to default Android VIEW intent.',
    },
    waitForReadyMs: {
      type: 'number' as const,
      description: 'Optional wait after launch before starting login (milliseconds).',
    },
    submitLabels: {
      type: 'array' as const,
      description: 'Custom submit button labels for login.',
      items: { type: 'string' as const },
    },
    imeId: {
      type: 'string' as const,
      description: 'Optional IME ID for ADB keyboard (default: com.android.adbkeyboard/.AdbIME).',
    },
    hideKeyboard: {
      type: 'boolean' as const,
      default: true,
      description: 'Hide keyboard before submit.',
    },
    useAdbKeyboard: {
      type: 'boolean' as const,
      default: false,
      description: 'Use ADB keyboard batching path for faster login.',
    },
    submitFallback: {
      type: 'boolean' as const,
      default: true,
      description: 'Attempt editor action/enter if no submit button is found.',
    },
  },
  required: ['url', 'email', 'password'] as string[],
};

export const OpenAndroidSettingsToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    screen: {
      type: 'string' as const,
      enum: ['settings', 'developer-options'],
      default: 'settings',
      description: 'Settings screen shortcut to open.',
    },
    activity: {
      type: 'string' as const,
      description:
        'Optional explicit Android activity component to open (overrides preset mapping).',
    },
    waitForReadyMs: {
      type: 'number' as const,
      description: 'Optional wait after launch before returning (milliseconds).',
    },
  },
  required: [] as string[],
};

export const ConfigureUsbDebuggingToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    action: {
      type: 'string' as const,
      enum: ['query', 'enable', 'disable'],
      default: 'query',
      description: 'Desired operation: query current state, enable, or disable USB debugging.',
    },
    useSettingsApi: {
      type: 'boolean' as const,
      default: true,
      description: 'Try settings commands first (fastest path).',
    },
    fallbackToUi: {
      type: 'boolean' as const,
      default: true,
      description: 'If settings commands fail, open developer settings and try a fast UI fallback.',
    },
    waitForReadyMs: {
      type: 'number' as const,
      description: 'Optional wait after launching settings before tapping fallback UI controls (milliseconds).',
    },
  },
  required: [] as string[],
};

export const PasteClipboardToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
  },
  required: [] as string[],
};

export const CreateIssueToolSchema = {
  type: 'object' as const,
  properties: {
    repo: { type: 'string' as const, description: 'GitHub repo in owner/name format.' },
    title: { type: 'string' as const, description: 'Issue title.' },
    body: { type: 'string' as const, description: 'Issue body/description.' },
    labels: { type: 'array' as const, description: 'Issue labels.' },
    assignees: { type: 'array' as const, description: 'Issue assignees.' },
    dryRun: { type: 'boolean' as const, description: 'Skip creation and return the gh command.' },
  },
  required: ['title'] as string[],
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
    useCache: { type: 'boolean' as const, description: 'Use cached UI dump when available.' },
    maxAgeMs: { type: 'number' as const, description: 'Max age for cached UI dump in ms.' },
    invalidateOnActivityChange: {
      type: 'boolean' as const,
      description: 'Invalidate cache when activity changes.',
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

export const SwipeAndScreenshotToolSchema = {
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
    postSwipeWaitMs: {
      type: 'number' as const,
      description: 'Optional delay after swipe before screenshot.',
    },
    screenshotThrottleMs: {
      type: 'number' as const,
      description: 'Reuse cached screenshots within this window (milliseconds).',
    },
  },
  required: ['startX', 'startY', 'endX', 'endY'] as string[],
};

export const SmartSwipeToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    startX: { type: 'number' as const, description: 'Start X coordinate in pixels.' },
    startY: { type: 'number' as const, description: 'Start Y coordinate in pixels.' },
    endX: { type: 'number' as const, description: 'End X coordinate in pixels.' },
    endY: { type: 'number' as const, description: 'End Y coordinate in pixels.' },
    profile: { type: 'string' as const, enum: ['fast', 'normal', 'safe'], description: 'Gesture timing profile.' },
    durationMs: { type: 'number' as const, description: 'Optional swipe duration in milliseconds.' },
    postSwipeWaitMs: { type: 'number' as const, description: 'Optional delay after swipe before stabilization/screenshot.' },
    waitForUiStable: {
      type: 'boolean' as const,
      description: 'Wait for UI to stabilize after swipe (defaults by profile).',
    },
    stableIterations: { type: 'number' as const, description: 'Stable dump count for UI stability (defaults by profile).' },
    intervalMs: { type: 'number' as const, description: 'Polling interval for UI stability (defaults by profile).' },
    timeoutMs: { type: 'number' as const, description: 'Max wait time for UI stability (defaults by profile).' },
    captureScreenshot: { type: 'boolean' as const, description: 'Capture screenshot after swipe.' },
    screenshotThrottleMs: { type: 'number' as const, description: 'Reuse cached screenshots within this window (milliseconds).' },
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
    preActionWaitMs: {
      type: 'number' as const,
      description: 'Optional wait before running the batch actions (milliseconds).',
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
    deviceAlias: {
      type: 'string' as const,
      description: 'Optional device alias to resolve.',
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
    steps: {
      type: 'array' as const,
      description: 'Optional flow steps (selectors/waits).',
    },
    stepRetries: {
      type: 'number' as const,
      description: 'Retries per step.',
      default: 0,
    },
    retryDelayMs: {
      type: 'number' as const,
      description: 'Delay between step retries (milliseconds).',
    },
    preActionWaitMs: {
      type: 'number' as const,
      description: 'Optional wait before running actions (milliseconds).',
    },
    timeoutMs: {
      type: 'number' as const,
      description: 'Optional timeout in milliseconds for the batch command.',
    },
    screenshotThrottleMs: {
      type: 'number' as const,
      description: 'Reuse cached screenshots within this window (milliseconds).',
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
  required: [] as string[],
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

export const WaitForTextDisappearToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    text: { type: 'string' as const, description: 'Text to wait to disappear.' },
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

export const WaitForIdDisappearToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    resourceId: { type: 'string' as const, description: 'Resource-id to wait to disappear.' },
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

export const WaitForDescDisappearToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    contentDesc: { type: 'string' as const, description: 'Content-desc to wait to disappear.' },
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

export const WaitForActivityChangeToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    previousActivity: { type: 'string' as const, description: 'Previous activity/component.' },
    targetActivity: { type: 'string' as const, description: 'Target activity/component.' },
    matchMode: {
      type: 'string' as const,
      enum: ['exact', 'contains', 'regex'],
      default: 'contains',
      description: 'Match mode.',
    },
    timeoutMs: { type: 'number' as const, description: 'Max wait time in milliseconds.' },
    intervalMs: { type: 'number' as const, description: 'Polling interval in milliseconds.' },
  },
  required: [] as string[],
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

export const ScrollVerticalToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    direction: { type: 'string' as const, enum: ['up', 'down'], description: 'Scroll direction.' },
    distancePercent: { type: 'number' as const, description: 'Swipe distance percent.' },
    durationMs: { type: 'number' as const, description: 'Optional swipe duration in ms.' },
    startXPercent: { type: 'number' as const, description: 'Optional X percent for swipe.' },
  },
  required: ['direction'] as string[],
};

export const SmartScrollToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    direction: { type: 'string' as const, enum: ['up', 'down'], description: 'Scroll direction.' },
    startXPercent: { type: 'number' as const, description: 'Optional X percent for swipe.' },
    distancePercent: { type: 'number' as const, description: 'Swipe distance percent.' },
    profile: { type: 'string' as const, enum: ['fast', 'normal', 'safe'], description: 'Gesture timing profile.' },
    durationMs: { type: 'number' as const, description: 'Optional swipe duration in ms.' },
    waitForUiStable: {
      type: 'boolean' as const,
      description: 'Wait for UI to stabilize after swipe (defaults by profile).',
    },
    stableIterations: { type: 'number' as const, description: 'Stable dump count for UI stability (defaults by profile).' },
    intervalMs: { type: 'number' as const, description: 'Polling interval for UI stability (defaults by profile).' },
    timeoutMs: { type: 'number' as const, description: 'Max wait time for UI stability (defaults by profile).' },
    captureScreenshot: { type: 'boolean' as const, description: 'Capture screenshot after swipe.' },
    autoCorrectDirection: { type: 'boolean' as const, description: 'Auto-correct direction if no UI change is detected.' },
    screenshotThrottleMs: { type: 'number' as const, description: 'Reuse cached screenshots within this window (milliseconds).' },
  },
  required: ['direction'] as string[],
};

export const ScrollHorizontalToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    direction: { type: 'string' as const, enum: ['left', 'right'], description: 'Scroll direction.' },
    distancePercent: { type: 'number' as const, description: 'Swipe distance percent.' },
    durationMs: { type: 'number' as const, description: 'Optional swipe duration in ms.' },
    startYPercent: { type: 'number' as const, description: 'Optional Y percent for swipe.' },
  },
  required: ['direction'] as string[],
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

export const LongPressToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    x: { type: 'number' as const, description: 'X coordinate.' },
    y: { type: 'number' as const, description: 'Y coordinate.' },
    durationMs: { type: 'number' as const, description: 'Long-press duration in ms.' },
  },
  required: ['x', 'y'] as string[],
};

export const DoubleTapToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    x: { type: 'number' as const, description: 'X coordinate.' },
    y: { type: 'number' as const, description: 'Y coordinate.' },
    intervalMs: { type: 'number' as const, description: 'Delay between taps.' },
  },
  required: ['x', 'y'] as string[],
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

export const ScrollUntilTextToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    text: { type: 'string' as const, description: 'Text to find while scrolling.' },
    matchMode: {
      type: 'string' as const,
      enum: ['exact', 'contains', 'regex'],
      default: 'exact',
      description: 'Match mode.',
    },
    direction: { type: 'string' as const, enum: ['up', 'down'], description: 'Scroll direction.' },
    distancePercent: { type: 'number' as const, description: 'Swipe distance percent.' },
    maxScrolls: { type: 'number' as const, description: 'Maximum scroll attempts.' },
    intervalMs: { type: 'number' as const, description: 'Delay between scroll attempts.' },
  },
  required: ['text'] as string[],
};

export const ScrollUntilIdToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    resourceId: { type: 'string' as const, description: 'Resource-id to find while scrolling.' },
    matchMode: {
      type: 'string' as const,
      enum: ['exact', 'contains', 'regex'],
      default: 'exact',
      description: 'Match mode.',
    },
    direction: { type: 'string' as const, enum: ['up', 'down'], description: 'Scroll direction.' },
    distancePercent: { type: 'number' as const, description: 'Swipe distance percent.' },
    maxScrolls: { type: 'number' as const, description: 'Maximum scroll attempts.' },
    intervalMs: { type: 'number' as const, description: 'Delay between scroll attempts.' },
  },
  required: ['resourceId'] as string[],
};

export const ScrollUntilDescToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    contentDesc: { type: 'string' as const, description: 'Content-desc to find while scrolling.' },
    matchMode: {
      type: 'string' as const,
      enum: ['exact', 'contains', 'regex'],
      default: 'exact',
      description: 'Match mode.',
    },
    direction: { type: 'string' as const, enum: ['up', 'down'], description: 'Scroll direction.' },
    distancePercent: { type: 'number' as const, description: 'Swipe distance percent.' },
    maxScrolls: { type: 'number' as const, description: 'Maximum scroll attempts.' },
    intervalMs: { type: 'number' as const, description: 'Delay between scroll attempts.' },
  },
  required: ['contentDesc'] as string[],
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
    deviceAlias: {
      type: 'string' as const,
      description: 'Optional device alias to resolve.',
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
    stepRetries: {
      type: 'number' as const,
      description: 'Retries per step.',
    },
    retryDelayMs: {
      type: 'number' as const,
      description: 'Delay between step retries (milliseconds).',
    },
    onFailSteps: {
      type: 'array' as const,
      description: 'Optional steps to execute when a step fails.',
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
    useCache: { type: 'boolean' as const, description: 'Use cached UI dump when available.' },
    maxAgeMs: { type: 'number' as const, description: 'Max age for cached UI dump in ms.' },
    invalidateOnActivityChange: {
      type: 'boolean' as const,
      description: 'Invalidate cache when activity changes.',
    },
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
    maxAgeMs: { type: 'number' as const, description: 'Max age for cached UI dump in ms.' },
    invalidateOnActivityChange: {
      type: 'boolean' as const,
      description: 'Invalidate cache when activity changes.',
    },
    refresh: { type: 'boolean' as const, description: 'Refresh cache when missing/stale.' },
  },
  required: [] as string[],
};

export const SetDeviceAliasToolSchema = {
  type: 'object' as const,
  properties: {
    alias: { type: 'string' as const, description: 'Alias to assign.' },
    deviceId: { type: 'string' as const, description: 'Optional device ID to bind.' },
  },
  required: ['alias'] as string[],
};

export const ResolveDeviceAliasToolSchema = {
  type: 'object' as const,
  properties: {
    alias: { type: 'string' as const, description: 'Alias to resolve.' },
  },
  required: ['alias'] as string[],
};

export const ListDeviceAliasesToolSchema = {
  type: 'object' as const,
  properties: {},
  required: [] as string[],
};

export const ClearDeviceAliasToolSchema = {
  type: 'object' as const,
  properties: {
    alias: { type: 'string' as const, description: 'Alias to clear.' },
  },
  required: ['alias'] as string[],
};

export const ListImesToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: { type: 'string' as const, description: 'Optional device ID.' },
  },
  required: [] as string[],
};

export const SetImeToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: { type: 'string' as const, description: 'Optional device ID.' },
    imeId: { type: 'string' as const, description: 'IME ID to set.' },
  },
  required: ['imeId'] as string[],
};

export const EnableImeToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: { type: 'string' as const, description: 'Optional device ID.' },
    imeId: { type: 'string' as const, description: 'IME ID to enable.' },
  },
  required: ['imeId'] as string[],
};

export const AdbKeyboardToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: { type: 'string' as const, description: 'Optional device ID.' },
    text: { type: 'string' as const, description: 'Text to input via ADB Keyboard.' },
    imeId: { type: 'string' as const, description: 'Optional IME ID.' },
    setIme: { type: 'boolean' as const, description: 'Enable and set IME before input.' },
    useBase64: { type: 'boolean' as const, description: 'Send via base64 broadcast.' },
  },
  required: ['text'] as string[],
};

export const AdbKeyboardClearTextToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: { type: 'string' as const, description: 'Optional device ID.' },
    imeId: { type: 'string' as const, description: 'Optional IME ID.' },
    setIme: { type: 'boolean' as const, description: 'Enable and set IME before clearing.' },
  },
  required: [] as string[],
};

export const AdbKeyboardInputCodeToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: { type: 'string' as const, description: 'Optional device ID.' },
    code: { type: 'number' as const, description: 'Key code to input.' },
    imeId: { type: 'string' as const, description: 'Optional IME ID.' },
    setIme: { type: 'boolean' as const, description: 'Enable and set IME before input.' },
  },
  required: ['code'] as string[],
};

export const AdbKeyboardEditorActionToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: { type: 'string' as const, description: 'Optional device ID.' },
    code: { type: 'number' as const, description: 'Editor action code.' },
    imeId: { type: 'string' as const, description: 'Optional IME ID.' },
    setIme: { type: 'boolean' as const, description: 'Enable and set IME before action.' },
  },
  required: ['code'] as string[],
};

export const AdbKeyboardInputCharsToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: { type: 'string' as const, description: 'Optional device ID.' },
    text: { type: 'string' as const, description: 'Text to input as codepoints.' },
    imeId: { type: 'string' as const, description: 'Optional IME ID.' },
    setIme: { type: 'boolean' as const, description: 'Enable and set IME before input.' },
  },
  required: ['text'] as string[],
};

export const SetAdbKeyboardModeToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: { type: 'string' as const, description: 'Optional device ID.' },
    imeId: { type: 'string' as const, description: 'Optional IME ID.' },
    enable: { type: 'boolean' as const, description: 'Enable ADB keyboard mode if true; restore if false.' },
  },
  required: [] as string[],
};

export const SmartLoginToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: { type: 'string' as const, description: 'Optional device ID.' },
    email: { type: 'string' as const, description: 'Email/login value.' },
    password: { type: 'string' as const, description: 'Password value.' },
    submitLabels: { type: 'array' as const, description: 'Custom submit labels.' },
    imeId: { type: 'string' as const, description: 'Optional IME ID.' },
    hideKeyboard: { type: 'boolean' as const, description: 'Hide keyboard before submit.' },
    submitFallback: { type: 'boolean' as const, description: 'Attempt editor action/enter if no submit button is found.' },
  },
  required: ['email', 'password'] as string[],
};

export const DetectLoginFieldsToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: { type: 'string' as const, description: 'Optional device ID.' },
    submitLabels: { type: 'array' as const, description: 'Custom submit labels.' },
  },
  required: [] as string[],
};

export const SmartLoginFastToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: { type: 'string' as const, description: 'Optional device ID.' },
    email: { type: 'string' as const, description: 'Email/login value.' },
    password: { type: 'string' as const, description: 'Password value.' },
    submitLabels: { type: 'array' as const, description: 'Custom submit labels.' },
    hideKeyboard: { type: 'boolean' as const, description: 'Hide keyboard before submit.' },
    useAdbKeyboard: { type: 'boolean' as const, description: 'Use ADB Keyboard instead of batch input.' },
    submitFallback: { type: 'boolean' as const, description: 'Attempt editor action/enter if no submit button is found.' },
  },
  required: ['email', 'password'] as string[],
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

export const RunAndroidShellToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    command: {
      type: 'string' as const,
      description: 'Raw shell command to execute on the Android device.',
    },
    timeoutMs: {
      type: 'number' as const,
      description: 'Optional timeout in milliseconds for the shell command.',
    },
  },
  required: ['command'] as string[],
};

export const RunAndroidMonkeyToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    packageName: {
      type: 'string' as const,
      description: 'Optional package to constrain monkey events to.',
    },
    eventCount: {
      type: 'number' as const,
      description: 'Number of monkey events to run.',
      default: 1000,
    },
    throttleMs: {
      type: 'number' as const,
      description: 'Optional delay in milliseconds between events.',
      default: 0,
    },
    seed: {
      type: 'number' as const,
      description: 'Optional deterministic random seed.',
    },
    ignoreCrashes: {
      type: 'boolean' as const,
      description: 'Continue on application crashes.',
      default: true,
    },
    ignoreTimeouts: {
      type: 'boolean' as const,
      description: 'Continue on application timeouts.',
      default: true,
    },
    ignoreSecurityExceptions: {
      type: 'boolean' as const,
      description: 'Continue on security exceptions.',
      default: true,
    },
    monitorNativeCrashes: {
      type: 'boolean' as const,
      description: 'Monitor and report native crashes.',
      default: true,
    },
    timeoutMs: {
      type: 'number' as const,
      description: 'Optional timeout in milliseconds for the monkey run.',
    },
  },
  required: [] as string[],
};

export const RecordAndroidScreenToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    durationSec: {
      type: 'number' as const,
      description: 'Recording duration in seconds (max 180).',
      default: 15,
    },
    bitRateMbps: {
      type: 'number' as const,
      description: 'Optional video bitrate in Mbps.',
    },
    size: {
      type: 'string' as const,
      description: 'Optional video size (e.g., 1280x720).',
    },
    rotate: {
      type: 'boolean' as const,
      description: 'Rotate the recording 90 degrees.',
      default: false,
    },
    bugreport: {
      type: 'boolean' as const,
      description: 'Overlay bugreport diagnostics onto the recording.',
      default: false,
    },
    remotePath: {
      type: 'string' as const,
      description: 'Optional remote path on device to save the temporary recording.',
    },
    localPath: {
      type: 'string' as const,
      description: 'Optional local path to save the pulled recording file.',
    },
    deleteRemote: {
      type: 'boolean' as const,
      description: 'Delete the temporary remote recording file after pulling.',
      default: true,
    },
  },
  required: [] as string[],
};

export const CaptureBugreportToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    outputDir: {
      type: 'string' as const,
      description: 'Optional local output directory for generated bugreport files.',
    },
    filePrefix: {
      type: 'string' as const,
      description: 'Optional filename prefix for bugreport artifacts.',
    },
    timeoutMs: {
      type: 'number' as const,
      description: 'Optional timeout in milliseconds for bugreport capture.',
    },
  },
  required: [] as string[],
};

export const CollectDiagnosticsToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    packageName: {
      type: 'string' as const,
      description: 'Optional package name for package-specific diagnostics.',
    },
    propertyPrefix: {
      type: 'string' as const,
      description: 'Optional Android property prefix filter (e.g., ro.build).',
    },
    logcatLines: {
      type: 'number' as const,
      description: 'Number of logcat lines to include.',
      default: 200,
    },
    logcatSince: {
      type: 'string' as const,
      description: 'Optional logcat time filter (e.g., 1m or absolute timestamp).',
    },
    logcatPriority: {
      type: 'string' as const,
      description: 'Optional minimum log priority (V/D/I/W/E/F/S).',
    },
    includeUiDump: {
      type: 'boolean' as const,
      description: 'Include XML UI dump in diagnostics.',
      default: true,
    },
    uiMaxChars: {
      type: 'number' as const,
      description: 'Optional max XML chars for UI dump truncation.',
    },
    uiUseCache: {
      type: 'boolean' as const,
      description: 'Use cached UI dump if available.',
      default: true,
    },
    uiMaxAgeMs: {
      type: 'number' as const,
      description: 'Optional maximum cache age for UI dump in milliseconds.',
    },
  },
  required: [] as string[],
};

export const CapturePerformanceSnapshotToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    packageName: {
      type: 'string' as const,
      description: 'Optional package name for app-scoped perf stats.',
    },
    topLines: {
      type: 'number' as const,
      description: 'Number of lines to keep from top output.',
      default: 60,
    },
    includeMeminfo: {
      type: 'boolean' as const,
      description: 'Include dumpsys meminfo output.',
      default: true,
    },
    includeGfxInfo: {
      type: 'boolean' as const,
      description: 'Include dumpsys gfxinfo framestats (requires packageName).',
      default: true,
    },
    includeCpuInfo: {
      type: 'boolean' as const,
      description: 'Include /proc/cpuinfo output.',
      default: false,
    },
    includeCpuFreq: {
      type: 'boolean' as const,
      description: 'Include current CPU frequency snapshot for all cores.',
      default: true,
    },
  },
  required: [] as string[],
};

export const CaptureBatterySnapshotToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    includeHistory: {
      type: 'boolean' as const,
      description: 'Include batterystats history tail.',
      default: false,
    },
    historyLines: {
      type: 'number' as const,
      description: 'Lines to keep when includeHistory is true.',
      default: 300,
    },
    resetStats: {
      type: 'boolean' as const,
      description: 'Reset batterystats after capture.',
      default: false,
    },
  },
  required: [] as string[],
};

export const CaptureNetworkSnapshotToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    includeWifi: {
      type: 'boolean' as const,
      description: 'Include dumpsys wifi snapshot.',
      default: true,
    },
    includeConnectivity: {
      type: 'boolean' as const,
      description: 'Include dumpsys connectivity snapshot.',
      default: true,
    },
    includeNetstats: {
      type: 'boolean' as const,
      description: 'Include dumpsys netstats summary.',
      default: true,
    },
  },
  required: [] as string[],
};

export const CaptureStorageSnapshotToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    packageName: {
      type: 'string' as const,
      description: 'Optional package name for package-specific storage usage probes.',
    },
    includePackageUsage: {
      type: 'boolean' as const,
      description: 'Attempt to include app data/media usage for packageName.',
      default: true,
    },
  },
  required: [] as string[],
};

export const CaptureCrashSnapshotToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    packageName: {
      type: 'string' as const,
      description: 'Optional package name for filtered crash logs.',
    },
    logcatLines: {
      type: 'number' as const,
      description: 'Lines to capture from crash buffers/logcat.',
      default: 500,
    },
    includeAnrTraces: {
      type: 'boolean' as const,
      description: 'Include /data/anr/traces.txt tail.',
      default: true,
    },
    includeTombstones: {
      type: 'boolean' as const,
      description: 'Include tombstone file listing.',
      default: true,
    },
    includeDropBox: {
      type: 'boolean' as const,
      description: 'Include dumpsys dropbox crash entries (can be large).',
      default: false,
    },
  },
  required: [] as string[],
};

export const CaptureNotificationSnapshotToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    packageName: {
      type: 'string' as const,
      description: 'Optional package name filter for notification lines.',
    },
    includeListeners: {
      type: 'boolean' as const,
      description: 'Include notification listeners snapshot.',
      default: true,
    },
    includePolicy: {
      type: 'boolean' as const,
      description: 'Include notification policy snapshot.',
      default: true,
    },
    includeStats: {
      type: 'boolean' as const,
      description: 'Include notification stats snapshot.',
      default: true,
    },
    maxLines: {
      type: 'number' as const,
      description: 'Maximum lines to keep from full notification dump output.',
      default: 800,
    },
  },
  required: [] as string[],
};

export const CaptureProcessSnapshotToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    packageName: {
      type: 'string' as const,
      description: 'Optional package name for PID-scoped process details.',
    },
    topLines: {
      type: 'number' as const,
      description: 'Number of lines to keep from top output.',
      default: 60,
    },
    includeProcStatus: {
      type: 'boolean' as const,
      description: 'Include /proc/<pid>/status when package PID is available.',
      default: true,
    },
    includeThreads: {
      type: 'boolean' as const,
      description: 'Include per-thread process listing when package PID is available.',
      default: false,
    },
    includeOpenFiles: {
      type: 'boolean' as const,
      description: 'Include /proc/<pid>/fd listing when package PID is available.',
      default: false,
    },
  },
  required: [] as string[],
};

export const CaptureServicesSnapshotToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    packageName: {
      type: 'string' as const,
      description: 'Optional package name for package dump section.',
    },
    includeJobs: {
      type: 'boolean' as const,
      description: 'Include jobscheduler snapshot.',
      default: true,
    },
    includeAlarms: {
      type: 'boolean' as const,
      description: 'Include alarm manager snapshot.',
      default: true,
    },
    includeBroadcasts: {
      type: 'boolean' as const,
      description: 'Include activity broadcasts snapshot.',
      default: true,
    },
    includePackageServices: {
      type: 'boolean' as const,
      description: 'Include dumpsys package snapshot for packageName.',
      default: true,
    },
  },
  required: [] as string[],
};

export const CaptureSensorsSnapshotToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    includeThermal: {
      type: 'boolean' as const,
      description: 'Include thermalservice snapshot.',
      default: true,
    },
    includePower: {
      type: 'boolean' as const,
      description: 'Include power manager snapshot.',
      default: true,
    },
    includeDisplay: {
      type: 'boolean' as const,
      description: 'Include display snapshot.',
      default: true,
    },
  },
  required: [] as string[],
};

export const CaptureGraphicsSnapshotToolSchema = {
  type: 'object' as const,
  properties: {
    deviceId: {
      type: 'string' as const,
      description: 'Optional device ID. If not provided, uses the first available device.',
    },
    packageName: {
      type: 'string' as const,
      description: 'Optional package name for gfxinfo framestats.',
    },
    includeSurfaceFlinger: {
      type: 'boolean' as const,
      description: 'Include SurfaceFlinger snapshots.',
      default: true,
    },
    includeWindow: {
      type: 'boolean' as const,
      description: 'Include window manager snapshot.',
      default: true,
    },
    includeComposer: {
      type: 'boolean' as const,
      description: 'Include SurfaceFlinger display/composer metadata snapshot.',
      default: false,
    },
  },
  required: [] as string[],
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
export type ListInstalledPackagesInput = z.infer<typeof ListInstalledPackagesInputSchema>;
export type ListInstalledPackagesOutput = z.infer<typeof ListInstalledPackagesOutputSchema>;
export type IsAppInstalledInput = z.infer<typeof IsAppInstalledInputSchema>;
export type IsAppInstalledOutput = z.infer<typeof IsAppInstalledOutputSchema>;
export type GetAppVersionInput = z.infer<typeof GetAppVersionInputSchema>;
export type GetAppVersionOutput = z.infer<typeof GetAppVersionOutputSchema>;
export type GetAndroidPropertyInput = z.infer<typeof GetAndroidPropertyInputSchema>;
export type GetAndroidPropertyOutput = z.infer<typeof GetAndroidPropertyOutputSchema>;
export type GetAndroidPropertiesInput = z.infer<typeof GetAndroidPropertiesInputSchema>;
export type GetAndroidPropertiesOutput = z.infer<typeof GetAndroidPropertiesOutputSchema>;
export type OpenUrlInput = z.infer<typeof OpenUrlInputSchema>;
export type OpenUrlOutput = z.infer<typeof OpenUrlOutputSchema>;
export type OpenChromeUrlInput = z.infer<typeof OpenChromeUrlInputSchema>;
export type OpenChromeUrlOutput = z.infer<typeof OpenChromeUrlOutputSchema>;
export type OpenChromeUrlAndLoginInput = z.infer<typeof OpenChromeUrlAndLoginInputSchema>;
export type OpenChromeUrlAndLoginOutput = z.infer<typeof OpenChromeUrlAndLoginOutputSchema>;
export type OpenAndroidSettingsInput = z.infer<typeof OpenAndroidSettingsInputSchema>;
export type OpenAndroidSettingsOutput = z.infer<typeof OpenAndroidSettingsOutputSchema>;
export type ConfigureUsbDebuggingInput = z.infer<typeof ConfigureUsbDebuggingInputSchema>;
export type ConfigureUsbDebuggingOutput = z.infer<typeof ConfigureUsbDebuggingOutputSchema>;
export type PasteClipboardInput = z.infer<typeof PasteClipboardInputSchema>;
export type PasteClipboardOutput = z.infer<typeof PasteClipboardOutputSchema>;
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
export type SwipeAndScreenshotInput = z.infer<typeof SwipeAndScreenshotInputSchema>;
export type SwipeAndScreenshotOutput = z.infer<typeof SwipeAndScreenshotOutputSchema>;
export type SmartSwipeInput = z.infer<typeof SmartSwipeInputSchema>;
export type SmartSwipeOutput = z.infer<typeof SmartSwipeOutputSchema>;
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
export type WaitForTextDisappearInput = z.infer<typeof WaitForTextDisappearInputSchema>;
export type WaitForTextDisappearOutput = z.infer<typeof WaitForTextDisappearOutputSchema>;
export type TypeByIdInput = z.infer<typeof TypeByIdInputSchema>;
export type TypeByIdOutput = z.infer<typeof TypeByIdOutputSchema>;
export type WaitForIdInput = z.infer<typeof WaitForIdInputSchema>;
export type WaitForIdOutput = z.infer<typeof WaitForIdOutputSchema>;
export type WaitForIdDisappearInput = z.infer<typeof WaitForIdDisappearInputSchema>;
export type WaitForIdDisappearOutput = z.infer<typeof WaitForIdDisappearOutputSchema>;
export type WaitForDescInput = z.infer<typeof WaitForDescInputSchema>;
export type WaitForDescOutput = z.infer<typeof WaitForDescOutputSchema>;
export type WaitForDescDisappearInput = z.infer<typeof WaitForDescDisappearInputSchema>;
export type WaitForDescDisappearOutput = z.infer<typeof WaitForDescDisappearOutputSchema>;
export type WaitForActivityInput = z.infer<typeof WaitForActivityInputSchema>;
export type WaitForActivityOutput = z.infer<typeof WaitForActivityOutputSchema>;
export type WaitForActivityChangeInput = z.infer<typeof WaitForActivityChangeInputSchema>;
export type WaitForActivityChangeOutput = z.infer<typeof WaitForActivityChangeOutputSchema>;
export type PressKeySequenceInput = z.infer<typeof PressKeySequenceInputSchema>;
export type PressKeySequenceOutput = z.infer<typeof PressKeySequenceOutputSchema>;
export type TapRelativeInput = z.infer<typeof TapRelativeInputSchema>;
export type TapRelativeOutput = z.infer<typeof TapRelativeOutputSchema>;
export type SwipeRelativeInput = z.infer<typeof SwipeRelativeInputSchema>;
export type SwipeRelativeOutput = z.infer<typeof SwipeRelativeOutputSchema>;
export type ScrollVerticalInput = z.infer<typeof ScrollVerticalInputSchema>;
export type ScrollVerticalOutput = z.infer<typeof ScrollVerticalOutputSchema>;
export type SmartScrollInput = z.infer<typeof SmartScrollInputSchema>;
export type SmartScrollOutput = z.infer<typeof SmartScrollOutputSchema>;
export type ScrollHorizontalInput = z.infer<typeof ScrollHorizontalInputSchema>;
export type ScrollHorizontalOutput = z.infer<typeof ScrollHorizontalOutputSchema>;
export type TapCenterInput = z.infer<typeof TapCenterInputSchema>;
export type TapCenterOutput = z.infer<typeof TapCenterOutputSchema>;
export type LongPressInput = z.infer<typeof LongPressInputSchema>;
export type LongPressOutput = z.infer<typeof LongPressOutputSchema>;
export type DoubleTapInput = z.infer<typeof DoubleTapInputSchema>;
export type DoubleTapOutput = z.infer<typeof DoubleTapOutputSchema>;
export type WaitForUiStableInput = z.infer<typeof WaitForUiStableInputSchema>;
export type WaitForUiStableOutput = z.infer<typeof WaitForUiStableOutputSchema>;
export type GetScreenHashInput = z.infer<typeof GetScreenHashInputSchema>;
export type GetScreenHashOutput = z.infer<typeof GetScreenHashOutputSchema>;
export type ScrollUntilTextInput = z.infer<typeof ScrollUntilTextInputSchema>;
export type ScrollUntilTextOutput = z.infer<typeof ScrollUntilTextOutputSchema>;
export type ScrollUntilIdInput = z.infer<typeof ScrollUntilIdInputSchema>;
export type ScrollUntilIdOutput = z.infer<typeof ScrollUntilIdOutputSchema>;
export type ScrollUntilDescInput = z.infer<typeof ScrollUntilDescInputSchema>;
export type ScrollUntilDescOutput = z.infer<typeof ScrollUntilDescOutputSchema>;
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
export type SetDeviceAliasInput = z.infer<typeof SetDeviceAliasInputSchema>;
export type SetDeviceAliasOutput = z.infer<typeof SetDeviceAliasOutputSchema>;
export type ResolveDeviceAliasInput = z.infer<typeof ResolveDeviceAliasInputSchema>;
export type ResolveDeviceAliasOutput = z.infer<typeof ResolveDeviceAliasOutputSchema>;
export type ListDeviceAliasesInput = z.infer<typeof ListDeviceAliasesInputSchema>;
export type ListDeviceAliasesOutput = z.infer<typeof ListDeviceAliasesOutputSchema>;
export type ClearDeviceAliasInput = z.infer<typeof ClearDeviceAliasInputSchema>;
export type ClearDeviceAliasOutput = z.infer<typeof ClearDeviceAliasOutputSchema>;
export type ListImesInput = z.infer<typeof ListImesInputSchema>;
export type ListImesOutput = z.infer<typeof ListImesOutputSchema>;
export type SetImeInput = z.infer<typeof SetImeInputSchema>;
export type SetImeOutput = z.infer<typeof SetImeOutputSchema>;
export type EnableImeInput = z.infer<typeof EnableImeInputSchema>;
export type EnableImeOutput = z.infer<typeof EnableImeOutputSchema>;
export type AdbKeyboardInput = z.infer<typeof AdbKeyboardInputSchema>;
export type AdbKeyboardOutput = z.infer<typeof AdbKeyboardOutputSchema>;
export type AdbKeyboardClearTextInput = z.infer<typeof AdbKeyboardClearTextInputSchema>;
export type AdbKeyboardClearTextOutput = z.infer<typeof AdbKeyboardClearTextOutputSchema>;
export type AdbKeyboardInputCodeInput = z.infer<typeof AdbKeyboardInputCodeInputSchema>;
export type AdbKeyboardInputCodeOutput = z.infer<typeof AdbKeyboardInputCodeOutputSchema>;
export type AdbKeyboardEditorActionInput = z.infer<typeof AdbKeyboardEditorActionInputSchema>;
export type AdbKeyboardEditorActionOutput = z.infer<typeof AdbKeyboardEditorActionOutputSchema>;
export type AdbKeyboardInputCharsInput = z.infer<typeof AdbKeyboardInputCharsInputSchema>;
export type AdbKeyboardInputCharsOutput = z.infer<typeof AdbKeyboardInputCharsOutputSchema>;
export type SetAdbKeyboardModeInput = z.infer<typeof SetAdbKeyboardModeInputSchema>;
export type SetAdbKeyboardModeOutput = z.infer<typeof SetAdbKeyboardModeOutputSchema>;
export type SmartLoginInput = z.infer<typeof SmartLoginInputSchema>;
export type SmartLoginOutput = z.infer<typeof SmartLoginOutputSchema>;
export type DetectLoginFieldsInput = z.infer<typeof DetectLoginFieldsInputSchema>;
export type DetectLoginFieldsOutput = z.infer<typeof DetectLoginFieldsOutputSchema>;
export type SmartLoginFastInput = z.infer<typeof SmartLoginFastInputSchema>;
export type SmartLoginFastOutput = z.infer<typeof SmartLoginFastOutputSchema>;
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
export type RunAndroidShellInput = z.infer<typeof RunAndroidShellInputSchema>;
export type RunAndroidShellOutput = z.infer<typeof RunAndroidShellOutputSchema>;
export type RunAndroidMonkeyInput = z.infer<typeof RunAndroidMonkeyInputSchema>;
export type RunAndroidMonkeyOutput = z.infer<typeof RunAndroidMonkeyOutputSchema>;
export type RecordAndroidScreenInput = z.infer<typeof RecordAndroidScreenInputSchema>;
export type RecordAndroidScreenOutput = z.infer<typeof RecordAndroidScreenOutputSchema>;
export type CaptureBugreportInput = z.infer<typeof CaptureBugreportInputSchema>;
export type CaptureBugreportOutput = z.infer<typeof CaptureBugreportOutputSchema>;
export type CollectDiagnosticsInput = z.infer<typeof CollectDiagnosticsInputSchema>;
export type CollectDiagnosticsOutput = z.infer<typeof CollectDiagnosticsOutputSchema>;
export type CapturePerformanceSnapshotInput = z.infer<typeof CapturePerformanceSnapshotInputSchema>;
export type CapturePerformanceSnapshotOutput = z.infer<typeof CapturePerformanceSnapshotOutputSchema>;
export type CaptureBatterySnapshotInput = z.infer<typeof CaptureBatterySnapshotInputSchema>;
export type CaptureBatterySnapshotOutput = z.infer<typeof CaptureBatterySnapshotOutputSchema>;
export type CaptureNetworkSnapshotInput = z.infer<typeof CaptureNetworkSnapshotInputSchema>;
export type CaptureNetworkSnapshotOutput = z.infer<typeof CaptureNetworkSnapshotOutputSchema>;
export type CaptureStorageSnapshotInput = z.infer<typeof CaptureStorageSnapshotInputSchema>;
export type CaptureStorageSnapshotOutput = z.infer<typeof CaptureStorageSnapshotOutputSchema>;
export type CaptureCrashSnapshotInput = z.infer<typeof CaptureCrashSnapshotInputSchema>;
export type CaptureCrashSnapshotOutput = z.infer<typeof CaptureCrashSnapshotOutputSchema>;
export type CaptureNotificationSnapshotInput = z.infer<typeof CaptureNotificationSnapshotInputSchema>;
export type CaptureNotificationSnapshotOutput = z.infer<typeof CaptureNotificationSnapshotOutputSchema>;
export type CaptureProcessSnapshotInput = z.infer<typeof CaptureProcessSnapshotInputSchema>;
export type CaptureProcessSnapshotOutput = z.infer<typeof CaptureProcessSnapshotOutputSchema>;
export type CaptureServicesSnapshotInput = z.infer<typeof CaptureServicesSnapshotInputSchema>;
export type CaptureServicesSnapshotOutput = z.infer<typeof CaptureServicesSnapshotOutputSchema>;
export type CaptureSensorsSnapshotInput = z.infer<typeof CaptureSensorsSnapshotInputSchema>;
export type CaptureSensorsSnapshotOutput = z.infer<typeof CaptureSensorsSnapshotOutputSchema>;
export type CaptureGraphicsSnapshotInput = z.infer<typeof CaptureGraphicsSnapshotInputSchema>;
export type CaptureGraphicsSnapshotOutput = z.infer<typeof CaptureGraphicsSnapshotOutputSchema>;
export type CreateIssueInput = z.infer<typeof CreateIssueInputSchema>;
export type CreateIssueOutput = z.infer<typeof CreateIssueOutputSchema>;
