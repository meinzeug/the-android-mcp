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
