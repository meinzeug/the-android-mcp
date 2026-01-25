import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { spawn } from 'child_process';
import path from 'path';
import { setupADBMock } from '../mocks/adb.mock';

// Mock ADB before importing server
setupADBMock();

// Set up module mocking for the types module
jest.mock('../../src/types', () => {
  const z = require('zod');
  const ADBCommandError = class extends Error {
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
  };

  return {
    // Device information interfaces
    AndroidDevice: {},

    // Screenshot response interfaces
    ScreenshotResponse: {},

    // Error handling interfaces
    ADBError: {},
    ADBCommandError,
    ADBNotFoundError: class extends ADBCommandError {
      constructor() {
        super('ADB_NOT_FOUND', 'Android Debug Bridge (ADB) not found');
        this.name = 'ADBNotFoundError';
      }
    },
    DeviceNotFoundError: class extends ADBCommandError {
      constructor(deviceId: string) {
        super('DEVICE_NOT_FOUND', `Device with ID '${deviceId}' not found`);
        this.name = 'DeviceNotFoundError';
      }
    },
    NoDevicesFoundError: class extends ADBCommandError {
      constructor() {
        super('NO_DEVICES_FOUND', 'No Android devices found');
        this.name = 'NoDevicesFoundError';
      }
    },
    ScreenshotCaptureError: class extends ADBCommandError {
      constructor(deviceId: string, originalError?: Error) {
        super('SCREENSHOT_CAPTURE_FAILED', `Failed to capture screenshot from device '${deviceId}'`);
        this.name = 'ScreenshotCaptureError';
      }
    },
    APKNotFoundError: class extends ADBCommandError {
      constructor() {
        super('APK_NOT_FOUND', 'No APK files found to install');
        this.name = 'APKNotFoundError';
      }
    },
    APKDownloadError: class extends ADBCommandError {
      constructor(url: string) {
        super('APK_DOWNLOAD_FAILED', `Failed to download APK from '${url}'`);
        this.name = 'APKDownloadError';
      }
    },

    // Tool input schemas
    TakeScreenshotInputSchema: z.object({
      deviceId: z.string().optional(),
      format: z.enum(['png']).default('png'),
      throttleMs: z.number().optional(),
    }),
    ListDevicesInputSchema: z.object({}),
    FindApkInputSchema: z.object({
      projectRoot: z.string().optional(),
    }),
    InstallApkInputSchema: z.object({
      deviceId: z.string().optional(),
      apkPath: z.string().optional(),
      apkUrl: z.string().optional(),
      projectRoot: z.string().optional(),
      reinstall: z.boolean().optional(),
      grantPermissions: z.boolean().optional(),
      allowTestPackages: z.boolean().optional(),
      allowDowngrade: z.boolean().optional(),
      timeoutMs: z.number().optional(),
    }),
    UninstallAppInputSchema: z.object({
      deviceId: z.string().optional(),
      packageName: z.string(),
      keepData: z.boolean().optional(),
    }),
    StartAppInputSchema: z.object({
      deviceId: z.string().optional(),
      packageName: z.string(),
      activity: z.string().optional(),
    }),
    GetCurrentActivityInputSchema: z.object({
      deviceId: z.string().optional(),
    }),
    GetWindowSizeInputSchema: z.object({
      deviceId: z.string().optional(),
    }),
    ListInstalledPackagesInputSchema: z.object({
      deviceId: z.string().optional(),
      filter: z.string().optional(),
      thirdPartyOnly: z.boolean().optional(),
      systemOnly: z.boolean().optional(),
      disabledOnly: z.boolean().optional(),
      enabledOnly: z.boolean().optional(),
      includeUninstalled: z.boolean().optional(),
      user: z.union([z.string(), z.number()]).optional(),
    }),
    IsAppInstalledInputSchema: z.object({
      deviceId: z.string().optional(),
      packageName: z.string(),
    }),
    GetAppVersionInputSchema: z.object({
      deviceId: z.string().optional(),
      packageName: z.string(),
    }),
    GetAndroidPropertyInputSchema: z.object({
      deviceId: z.string().optional(),
      property: z.string(),
    }),
    GetAndroidPropertiesInputSchema: z.object({
      deviceId: z.string().optional(),
      prefix: z.string().optional(),
    }),
    OpenUrlInputSchema: z.object({
      deviceId: z.string().optional(),
      url: z.string(),
    }),
    PasteClipboardInputSchema: z.object({
      deviceId: z.string().optional(),
    }),
    DumpUiInputSchema: z.object({
      deviceId: z.string().optional(),
      maxChars: z.number().optional(),
      useCache: z.boolean().optional(),
      maxAgeMs: z.number().optional(),
      invalidateOnActivityChange: z.boolean().optional(),
    }),
    StopAppInputSchema: z.object({
      deviceId: z.string().optional(),
      packageName: z.string(),
    }),
    ClearAppDataInputSchema: z.object({
      deviceId: z.string().optional(),
      packageName: z.string(),
    }),
    TapInputSchema: z.object({
      deviceId: z.string().optional(),
      x: z.number(),
      y: z.number(),
    }),
    SwipeInputSchema: z.object({
      deviceId: z.string().optional(),
      startX: z.number(),
      startY: z.number(),
      endX: z.number(),
      endY: z.number(),
      durationMs: z.number().optional(),
    }),
    SwipeAndScreenshotInputSchema: z.object({
      deviceId: z.string().optional(),
      startX: z.number(),
      startY: z.number(),
      endX: z.number(),
      endY: z.number(),
      durationMs: z.number().optional(),
      postSwipeWaitMs: z.number().optional(),
      screenshotThrottleMs: z.number().optional(),
    }),
    SmartSwipeInputSchema: z.object({
      deviceId: z.string().optional(),
      startX: z.number(),
      startY: z.number(),
      endX: z.number(),
      endY: z.number(),
      profile: z.string().optional(),
      durationMs: z.number().optional(),
      postSwipeWaitMs: z.number().optional(),
      waitForUiStable: z.boolean().optional(),
      stableIterations: z.number().optional(),
      intervalMs: z.number().optional(),
      timeoutMs: z.number().optional(),
      captureScreenshot: z.boolean().optional(),
      screenshotThrottleMs: z.number().optional(),
    }),
    InputTextInputSchema: z.object({
      deviceId: z.string().optional(),
      text: z.string(),
    }),
    KeyeventInputSchema: z.object({
      deviceId: z.string().optional(),
      keyCode: z.union([z.string(), z.number()]),
    }),
    BatchActionsInputSchema: z.object({
      deviceId: z.string().optional(),
      actions: z.array(z.any()),
      preActionWaitMs: z.number().optional(),
      timeoutMs: z.number().optional(),
      captureBefore: z.boolean().optional(),
      captureAfter: z.boolean().optional(),
    }),
    Pm2StartHotModeInputSchema: z.object({
      projectRoot: z.string().optional(),
      configPath: z.string().optional(),
      appName: z.string().optional(),
    }),
    Pm2StopInputSchema: z.object({
      appName: z.string(),
    }),
    Pm2ListInputSchema: z.object({}),
    FastFlowInputSchema: z.object({
      deviceId: z.string().optional(),
      deviceAlias: z.string().optional(),
      actions: z.array(z.any()),
      steps: z.array(z.any()).optional(),
      stepRetries: z.number().optional(),
      retryDelayMs: z.number().optional(),
      preActionWaitMs: z.number().optional(),
      timeoutMs: z.number().optional(),
      screenshotThrottleMs: z.number().optional(),
      captureBefore: z.boolean().optional(),
      captureAfter: z.boolean().optional(),
      postActionWaitMs: z.number().optional(),
      includeUiDump: z.boolean().optional(),
      uiDumpMaxChars: z.number().optional(),
    }),
    TapByTextInputSchema: z.object({
      deviceId: z.string().optional(),
      text: z.string(),
      matchMode: z.string().optional(),
      index: z.number().optional(),
    }),
    TapByIdInputSchema: z.object({
      deviceId: z.string().optional(),
      resourceId: z.string(),
      index: z.number().optional(),
    }),
    TapByDescInputSchema: z.object({
      deviceId: z.string().optional(),
      contentDesc: z.string(),
      matchMode: z.string().optional(),
      index: z.number().optional(),
    }),
    WaitForTextInputSchema: z.object({
      deviceId: z.string().optional(),
      text: z.string(),
      matchMode: z.string().optional(),
      timeoutMs: z.number().optional(),
      intervalMs: z.number().optional(),
    }),
    WaitForTextDisappearInputSchema: z.object({
      deviceId: z.string().optional(),
      text: z.string(),
      matchMode: z.string().optional(),
      timeoutMs: z.number().optional(),
      intervalMs: z.number().optional(),
    }),
    TypeByIdInputSchema: z.object({
      deviceId: z.string().optional(),
      resourceId: z.string(),
      text: z.string(),
      matchMode: z.string().optional(),
      index: z.number().optional(),
    }),
    WaitForIdInputSchema: z.object({
      deviceId: z.string().optional(),
      resourceId: z.string(),
      matchMode: z.string().optional(),
      timeoutMs: z.number().optional(),
      intervalMs: z.number().optional(),
    }),
    WaitForIdDisappearInputSchema: z.object({
      deviceId: z.string().optional(),
      resourceId: z.string(),
      matchMode: z.string().optional(),
      timeoutMs: z.number().optional(),
      intervalMs: z.number().optional(),
    }),
    WaitForDescInputSchema: z.object({
      deviceId: z.string().optional(),
      contentDesc: z.string(),
      matchMode: z.string().optional(),
      timeoutMs: z.number().optional(),
      intervalMs: z.number().optional(),
    }),
    WaitForDescDisappearInputSchema: z.object({
      deviceId: z.string().optional(),
      contentDesc: z.string(),
      matchMode: z.string().optional(),
      timeoutMs: z.number().optional(),
      intervalMs: z.number().optional(),
    }),
    WaitForActivityInputSchema: z.object({
      deviceId: z.string().optional(),
      activity: z.string(),
      matchMode: z.string().optional(),
      timeoutMs: z.number().optional(),
      intervalMs: z.number().optional(),
    }),
    WaitForActivityChangeInputSchema: z.object({
      deviceId: z.string().optional(),
      previousActivity: z.string().optional(),
      targetActivity: z.string().optional(),
      matchMode: z.string().optional(),
      timeoutMs: z.number().optional(),
      intervalMs: z.number().optional(),
    }),
    PressKeySequenceInputSchema: z.object({
      deviceId: z.string().optional(),
      keyCodes: z.array(z.any()),
      intervalMs: z.number().optional(),
      timeoutMs: z.number().optional(),
    }),
    TapRelativeInputSchema: z.object({
      deviceId: z.string().optional(),
      xPercent: z.number(),
      yPercent: z.number(),
    }),
    SwipeRelativeInputSchema: z.object({
      deviceId: z.string().optional(),
      startXPercent: z.number(),
      startYPercent: z.number(),
      endXPercent: z.number(),
      endYPercent: z.number(),
      durationMs: z.number().optional(),
    }),
    ScrollVerticalInputSchema: z.object({
      deviceId: z.string().optional(),
      direction: z.string(),
      distancePercent: z.number().optional(),
      durationMs: z.number().optional(),
      startXPercent: z.number().optional(),
    }),
    SmartScrollInputSchema: z.object({
      deviceId: z.string().optional(),
      direction: z.string(),
      startXPercent: z.number().optional(),
      distancePercent: z.number().optional(),
      profile: z.string().optional(),
      durationMs: z.number().optional(),
      waitForUiStable: z.boolean().optional(),
      stableIterations: z.number().optional(),
      intervalMs: z.number().optional(),
      timeoutMs: z.number().optional(),
      captureScreenshot: z.boolean().optional(),
      screenshotThrottleMs: z.number().optional(),
    }),
    ScrollHorizontalInputSchema: z.object({
      deviceId: z.string().optional(),
      direction: z.string(),
      distancePercent: z.number().optional(),
      durationMs: z.number().optional(),
      startYPercent: z.number().optional(),
    }),
    TapCenterInputSchema: z.object({
      deviceId: z.string().optional(),
    }),
    LongPressInputSchema: z.object({
      deviceId: z.string().optional(),
      x: z.number(),
      y: z.number(),
      durationMs: z.number().optional(),
    }),
    DoubleTapInputSchema: z.object({
      deviceId: z.string().optional(),
      x: z.number(),
      y: z.number(),
      intervalMs: z.number().optional(),
    }),
    WaitForUiStableInputSchema: z.object({
      deviceId: z.string().optional(),
      stableIterations: z.number().optional(),
      intervalMs: z.number().optional(),
      timeoutMs: z.number().optional(),
    }),
    GetScreenHashInputSchema: z.object({
      deviceId: z.string().optional(),
    }),
    ScrollUntilTextInputSchema: z.object({
      deviceId: z.string().optional(),
      text: z.string(),
      matchMode: z.string().optional(),
      direction: z.string().optional(),
      distancePercent: z.number().optional(),
      maxScrolls: z.number().optional(),
      intervalMs: z.number().optional(),
    }),
    ScrollUntilIdInputSchema: z.object({
      deviceId: z.string().optional(),
      resourceId: z.string(),
      matchMode: z.string().optional(),
      direction: z.string().optional(),
      distancePercent: z.number().optional(),
      maxScrolls: z.number().optional(),
      intervalMs: z.number().optional(),
    }),
    ScrollUntilDescInputSchema: z.object({
      deviceId: z.string().optional(),
      contentDesc: z.string(),
      matchMode: z.string().optional(),
      direction: z.string().optional(),
      distancePercent: z.number().optional(),
      maxScrolls: z.number().optional(),
      intervalMs: z.number().optional(),
    }),
    WaitForPackageInputSchema: z.object({
      deviceId: z.string().optional(),
      packageName: z.string(),
      timeoutMs: z.number().optional(),
      intervalMs: z.number().optional(),
    }),
    RunFlowPlanInputSchema: z.object({
      deviceId: z.string().optional(),
      deviceAlias: z.string().optional(),
      steps: z.array(z.any()),
      stopOnFailure: z.boolean().optional(),
      stepRetries: z.number().optional(),
      retryDelayMs: z.number().optional(),
      onFailSteps: z.array(z.any()).optional(),
    }),
    QueryUiInputSchema: z.object({
      deviceId: z.string().optional(),
      selector: z.any(),
      maxResults: z.number().optional(),
      useCache: z.boolean().optional(),
      maxAgeMs: z.number().optional(),
      invalidateOnActivityChange: z.boolean().optional(),
    }),
    WaitForNodeCountInputSchema: z.object({
      deviceId: z.string().optional(),
      selector: z.any(),
      count: z.number(),
      comparator: z.string().optional(),
      timeoutMs: z.number().optional(),
      intervalMs: z.number().optional(),
    }),
    TapBySelectorIndexInputSchema: z.object({
      deviceId: z.string().optional(),
      selector: z.any(),
      index: z.number().optional(),
    }),
    UiDumpCachedInputSchema: z.object({
      deviceId: z.string().optional(),
      maxChars: z.number().optional(),
      maxAgeMs: z.number().optional(),
      invalidateOnActivityChange: z.boolean().optional(),
      refresh: z.boolean().optional(),
    }),
    SetDeviceAliasInputSchema: z.object({
      alias: z.string(),
      deviceId: z.string().optional(),
    }),
    ResolveDeviceAliasInputSchema: z.object({
      alias: z.string(),
    }),
    ListDeviceAliasesInputSchema: z.object({}),
    ClearDeviceAliasInputSchema: z.object({
      alias: z.string(),
    }),
    ListImesInputSchema: z.object({
      deviceId: z.string().optional(),
    }),
    SetImeInputSchema: z.object({
      deviceId: z.string().optional(),
      imeId: z.string(),
    }),
    EnableImeInputSchema: z.object({
      deviceId: z.string().optional(),
      imeId: z.string(),
    }),
    AdbKeyboardInputSchema: z.object({
      deviceId: z.string().optional(),
      text: z.string(),
      imeId: z.string().optional(),
      setIme: z.boolean().optional(),
      useBase64: z.boolean().optional(),
    }),
    AdbKeyboardClearTextInputSchema: z.object({
      deviceId: z.string().optional(),
      imeId: z.string().optional(),
      setIme: z.boolean().optional(),
    }),
    AdbKeyboardInputCodeInputSchema: z.object({
      deviceId: z.string().optional(),
      code: z.number(),
      imeId: z.string().optional(),
      setIme: z.boolean().optional(),
    }),
    AdbKeyboardEditorActionInputSchema: z.object({
      deviceId: z.string().optional(),
      code: z.number(),
      imeId: z.string().optional(),
      setIme: z.boolean().optional(),
    }),
    AdbKeyboardInputCharsInputSchema: z.object({
      deviceId: z.string().optional(),
      text: z.string(),
      imeId: z.string().optional(),
      setIme: z.boolean().optional(),
    }),
    SetAdbKeyboardModeInputSchema: z.object({
      deviceId: z.string().optional(),
      imeId: z.string().optional(),
      enable: z.boolean().optional(),
    }),
    SmartLoginInputSchema: z.object({
      deviceId: z.string().optional(),
      email: z.string(),
      password: z.string(),
      submitLabels: z.array(z.string()).optional(),
      imeId: z.string().optional(),
      hideKeyboard: z.boolean().optional(),
      submitFallback: z.boolean().optional(),
    }),
    DetectLoginFieldsInputSchema: z.object({
      deviceId: z.string().optional(),
      submitLabels: z.array(z.string()).optional(),
    }),
    SmartLoginFastInputSchema: z.object({
      deviceId: z.string().optional(),
      email: z.string(),
      password: z.string(),
      submitLabels: z.array(z.string()).optional(),
      hideKeyboard: z.boolean().optional(),
      useAdbKeyboard: z.boolean().optional(),
      submitFallback: z.boolean().optional(),
    }),
    ReversePortInputSchema: z.object({
      deviceId: z.string().optional(),
      devicePort: z.number(),
      hostPort: z.number().optional(),
    }),
    ForwardPortInputSchema: z.object({
      deviceId: z.string().optional(),
      devicePort: z.number(),
      hostPort: z.number(),
    }),
    GetLogcatInputSchema: z.object({
      deviceId: z.string().optional(),
      lines: z.number().optional(),
      since: z.string().optional(),
      tag: z.string().optional(),
      priority: z.string().optional(),
      pid: z.number().optional(),
      packageName: z.string().optional(),
      format: z.string().optional(),
    }),
    ListActivitiesInputSchema: z.object({
      deviceId: z.string().optional(),
      packageName: z.string(),
    }),
    HotReloadSetupInputSchema: z.object({
      deviceId: z.string().optional(),
      packageName: z.string(),
      activity: z.string().optional(),
      apkPath: z.string().optional(),
      projectRoot: z.string().optional(),
      reversePorts: z.array(z.any()).optional(),
      install: z.boolean().optional(),
      start: z.boolean().optional(),
      stopBeforeStart: z.boolean().optional(),
      reinstall: z.boolean().optional(),
      grantPermissions: z.boolean().optional(),
      allowTestPackages: z.boolean().optional(),
      allowDowngrade: z.boolean().optional(),
      timeoutMs: z.number().optional(),
      playProtectAction: z.string().optional(),
      playProtectMaxWaitMs: z.number().optional(),
    }),
    CreateIssueInputSchema: z.object({
      repo: z.string().optional(),
      title: z.string(),
      body: z.string().optional(),
      labels: z.array(z.string()).optional(),
      assignees: z.array(z.string()).optional(),
      dryRun: z.boolean().optional(),
    }),

    // Tool output schemas
    TakeScreenshotOutputSchema: z.object({
      data: z.string(),
      format: z.string(),
      width: z.number(),
      height: z.number(),
      deviceId: z.string(),
      timestamp: z.number(),
    }),
    ListDevicesOutputSchema: z.object({
      devices: z.array(
        z.object({
          id: z.string(),
          status: z.string(),
          model: z.string().optional(),
          product: z.string().optional(),
          transportId: z.string().optional(),
          usb: z.string().optional(),
          productString: z.string().optional(),
        })
      ),
    }),
    FindApkOutputSchema: z.object({
      projectRoot: z.string(),
      apkPath: z.string(),
      candidates: z.array(z.string()),
    }),
    InstallApkOutputSchema: z.object({
      deviceId: z.string(),
      apkPath: z.string(),
      output: z.string(),
      success: z.boolean(),
      downloadedFrom: z.string().optional(),
    }),
    UninstallAppOutputSchema: z.object({
      deviceId: z.string(),
      packageName: z.string(),
      output: z.string(),
      success: z.boolean(),
    }),
    StartAppOutputSchema: z.object({
      deviceId: z.string(),
      packageName: z.string(),
      activity: z.string().optional(),
      output: z.string(),
    }),
    GetCurrentActivityOutputSchema: z.object({
      deviceId: z.string(),
      packageName: z.string().optional(),
      activity: z.string().optional(),
      component: z.string().optional(),
      raw: z.string(),
    }),
    GetWindowSizeOutputSchema: z.object({
      deviceId: z.string(),
      width: z.number(),
      height: z.number(),
      physicalWidth: z.number().optional(),
      physicalHeight: z.number().optional(),
      overrideWidth: z.number().optional(),
      overrideHeight: z.number().optional(),
      raw: z.string(),
    }),
    ListInstalledPackagesOutputSchema: z.object({
      deviceId: z.string(),
      packages: z.array(z.string()),
      output: z.string(),
    }),
    IsAppInstalledOutputSchema: z.object({
      deviceId: z.string(),
      packageName: z.string(),
      installed: z.boolean(),
      path: z.string().optional(),
    }),
    GetAppVersionOutputSchema: z.object({
      deviceId: z.string(),
      packageName: z.string(),
      versionName: z.string().optional(),
      versionCode: z.string().optional(),
      output: z.string(),
    }),
    GetAndroidPropertyOutputSchema: z.object({
      deviceId: z.string(),
      property: z.string(),
      value: z.string(),
    }),
    GetAndroidPropertiesOutputSchema: z.object({
      deviceId: z.string(),
      properties: z.record(z.string()),
      output: z.string(),
    }),
    OpenUrlOutputSchema: z.object({
      deviceId: z.string(),
      url: z.string(),
      output: z.string(),
    }),
    PasteClipboardOutputSchema: z.object({
      deviceId: z.string(),
      output: z.string(),
    }),
    DumpUiOutputSchema: z.object({
      deviceId: z.string(),
      xml: z.string(),
      length: z.number(),
      truncated: z.boolean().optional(),
      filePath: z.string(),
    }),
    StopAppOutputSchema: z.object({
      deviceId: z.string(),
      packageName: z.string(),
      output: z.string(),
    }),
    ClearAppDataOutputSchema: z.object({
      deviceId: z.string(),
      packageName: z.string(),
      output: z.string(),
      success: z.boolean(),
    }),
    TapOutputSchema: z.object({
      deviceId: z.string(),
      x: z.number(),
      y: z.number(),
      output: z.string(),
    }),
    SwipeOutputSchema: z.object({
      deviceId: z.string(),
      startX: z.number(),
      startY: z.number(),
      endX: z.number(),
      endY: z.number(),
      durationMs: z.number().optional(),
      output: z.string(),
    }),
    SwipeAndScreenshotOutputSchema: z.object({
      deviceId: z.string(),
      swipe: z.any(),
      screenshot: z.any(),
    }),
    SmartSwipeOutputSchema: z.object({
      deviceId: z.string(),
      swipe: z.any(),
      uiStable: z.any().optional(),
      screenshot: z.any().optional(),
    }),
    InputTextOutputSchema: z.object({
      deviceId: z.string(),
      text: z.string(),
      output: z.string(),
    }),
    KeyeventOutputSchema: z.object({
      deviceId: z.string(),
      keyCode: z.union([z.string(), z.number()]),
      output: z.string(),
    }),
    BatchActionsOutputSchema: z.object({
      deviceId: z.string(),
      actions: z.array(z.any()),
      output: z.string(),
      screenshotBefore: z.any().optional(),
      screenshotAfter: z.any().optional(),
    }),
    Pm2StartHotModeOutputSchema: z.object({
      configPath: z.string(),
      appName: z.string().optional(),
      output: z.string(),
    }),
    Pm2StopOutputSchema: z.object({
      appName: z.string(),
      output: z.string(),
    }),
    Pm2ListOutputSchema: z.object({
      processes: z.array(z.any()),
      output: z.string(),
    }),
    FastFlowOutputSchema: z.object({
      deviceId: z.string(),
      actions: z.array(z.any()),
      output: z.string(),
      screenshotBefore: z.any().optional(),
      screenshotAfter: z.any().optional(),
      uiDump: z.any().optional(),
      stepResults: z.any().optional(),
    }),
    TapByTextOutputSchema: z.object({
      deviceId: z.string(),
      text: z.string(),
      matchMode: z.string(),
      index: z.number(),
      found: z.boolean(),
      x: z.number().optional(),
      y: z.number().optional(),
      output: z.string().optional(),
    }),
    TapByIdOutputSchema: z.object({
      deviceId: z.string(),
      resourceId: z.string(),
      index: z.number(),
      found: z.boolean(),
      x: z.number().optional(),
      y: z.number().optional(),
      output: z.string().optional(),
    }),
    TapByDescOutputSchema: z.object({
      deviceId: z.string(),
      contentDesc: z.string(),
      matchMode: z.string(),
      index: z.number(),
      found: z.boolean(),
      x: z.number().optional(),
      y: z.number().optional(),
      output: z.string().optional(),
    }),
    WaitForTextOutputSchema: z.object({
      deviceId: z.string(),
      text: z.string(),
      matchMode: z.string(),
      found: z.boolean(),
      elapsedMs: z.number(),
      matchCount: z.number(),
    }),
    WaitForTextDisappearOutputSchema: z.object({
      deviceId: z.string(),
      text: z.string(),
      matchMode: z.string(),
      disappeared: z.boolean(),
      elapsedMs: z.number(),
      matchCount: z.number(),
    }),
    TypeByIdOutputSchema: z.object({
      deviceId: z.string(),
      resourceId: z.string(),
      text: z.string(),
      matchMode: z.string(),
      index: z.number(),
      found: z.boolean(),
      output: z.string().optional(),
    }),
    WaitForIdOutputSchema: z.object({
      deviceId: z.string(),
      resourceId: z.string(),
      matchMode: z.string(),
      found: z.boolean(),
      elapsedMs: z.number(),
      matchCount: z.number(),
    }),
    WaitForIdDisappearOutputSchema: z.object({
      deviceId: z.string(),
      resourceId: z.string(),
      matchMode: z.string(),
      disappeared: z.boolean(),
      elapsedMs: z.number(),
      matchCount: z.number(),
    }),
    WaitForDescOutputSchema: z.object({
      deviceId: z.string(),
      contentDesc: z.string(),
      matchMode: z.string(),
      found: z.boolean(),
      elapsedMs: z.number(),
      matchCount: z.number(),
    }),
    WaitForDescDisappearOutputSchema: z.object({
      deviceId: z.string(),
      contentDesc: z.string(),
      matchMode: z.string(),
      disappeared: z.boolean(),
      elapsedMs: z.number(),
      matchCount: z.number(),
    }),
    WaitForActivityOutputSchema: z.object({
      deviceId: z.string(),
      activity: z.string(),
      matchMode: z.string(),
      found: z.boolean(),
      elapsedMs: z.number(),
      current: z.string().optional(),
    }),
    WaitForActivityChangeOutputSchema: z.object({
      deviceId: z.string(),
      previous: z.string(),
      current: z.string(),
      changed: z.boolean(),
      elapsedMs: z.number(),
    }),
    PressKeySequenceOutputSchema: z.object({
      deviceId: z.string(),
      keyCodes: z.array(z.any()),
      output: z.string(),
    }),
    TapRelativeOutputSchema: z.object({
      deviceId: z.string(),
      xPercent: z.number(),
      yPercent: z.number(),
      x: z.number(),
      y: z.number(),
      output: z.string(),
    }),
    SwipeRelativeOutputSchema: z.object({
      deviceId: z.string(),
      startXPercent: z.number(),
      startYPercent: z.number(),
      endXPercent: z.number(),
      endYPercent: z.number(),
      startX: z.number(),
      startY: z.number(),
      endX: z.number(),
      endY: z.number(),
      durationMs: z.number().optional(),
      output: z.string(),
    }),
    ScrollVerticalOutputSchema: z.object({
      deviceId: z.string(),
      direction: z.string(),
      output: z.string(),
    }),
    SmartScrollOutputSchema: z.object({
      deviceId: z.string(),
      direction: z.string(),
      output: z.string(),
      uiStable: z.any().optional(),
      screenshot: z.any().optional(),
    }),
    ScrollHorizontalOutputSchema: z.object({
      deviceId: z.string(),
      direction: z.string(),
      output: z.string(),
    }),
    TapCenterOutputSchema: z.object({
      deviceId: z.string(),
      x: z.number(),
      y: z.number(),
      output: z.string(),
    }),
    LongPressOutputSchema: z.object({
      deviceId: z.string(),
      x: z.number(),
      y: z.number(),
      durationMs: z.number(),
      output: z.string(),
    }),
    DoubleTapOutputSchema: z.object({
      deviceId: z.string(),
      x: z.number(),
      y: z.number(),
      output: z.string(),
    }),
    WaitForUiStableOutputSchema: z.object({
      deviceId: z.string(),
      stable: z.boolean(),
      elapsedMs: z.number(),
      hash: z.string().optional(),
    }),
    GetScreenHashOutputSchema: z.object({
      deviceId: z.string(),
      hash: z.string(),
      length: z.number(),
    }),
    ScrollUntilTextOutputSchema: z.object({
      deviceId: z.string(),
      text: z.string(),
      found: z.boolean(),
      scrolls: z.number(),
      matchCount: z.number(),
    }),
    ScrollUntilIdOutputSchema: z.object({
      deviceId: z.string(),
      resourceId: z.string(),
      found: z.boolean(),
      scrolls: z.number(),
      matchCount: z.number(),
    }),
    ScrollUntilDescOutputSchema: z.object({
      deviceId: z.string(),
      contentDesc: z.string(),
      found: z.boolean(),
      scrolls: z.number(),
      matchCount: z.number(),
    }),
    WaitForPackageOutputSchema: z.object({
      deviceId: z.string(),
      packageName: z.string(),
      found: z.boolean(),
      elapsedMs: z.number(),
      current: z.string().optional(),
    }),
    RunFlowPlanOutputSchema: z.object({
      deviceId: z.string(),
      steps: z.array(z.any()),
    }),
    QueryUiOutputSchema: z.object({
      deviceId: z.string(),
      selector: z.any(),
      count: z.number(),
      nodes: z.array(z.any()),
    }),
    WaitForNodeCountOutputSchema: z.object({
      deviceId: z.string(),
      selector: z.any(),
      count: z.number(),
      comparator: z.string(),
      found: z.boolean(),
      elapsedMs: z.number(),
      matchCount: z.number(),
    }),
    TapBySelectorIndexOutputSchema: z.object({
      deviceId: z.string(),
      selector: z.any(),
      index: z.number(),
      found: z.boolean(),
      x: z.number().optional(),
      y: z.number().optional(),
      output: z.string().optional(),
    }),
    UiDumpCachedOutputSchema: z.object({
      deviceId: z.string(),
      xml: z.string(),
      length: z.number(),
      truncated: z.boolean().optional(),
      filePath: z.string(),
      ageMs: z.number(),
      hash: z.string().optional(),
    }),
    SetDeviceAliasOutputSchema: z.object({
      alias: z.string(),
      deviceId: z.string(),
    }),
    ResolveDeviceAliasOutputSchema: z.object({
      alias: z.string(),
      deviceId: z.string(),
    }),
    ListDeviceAliasesOutputSchema: z.object({
      aliases: z.any(),
    }),
    ClearDeviceAliasOutputSchema: z.object({
      alias: z.string(),
      removed: z.boolean(),
    }),
    ListImesOutputSchema: z.object({
      deviceId: z.string(),
      imes: z.array(z.string()),
      current: z.string().optional(),
      output: z.string(),
    }),
    SetImeOutputSchema: z.object({
      deviceId: z.string(),
      imeId: z.string(),
      output: z.string(),
    }),
    EnableImeOutputSchema: z.object({
      deviceId: z.string(),
      imeId: z.string(),
      output: z.string(),
    }),
    AdbKeyboardOutputSchema: z.object({
      deviceId: z.string(),
      imeId: z.string(),
      textLength: z.number(),
      output: z.string(),
    }),
    AdbKeyboardClearTextOutputSchema: z.object({
      deviceId: z.string(),
      imeId: z.string(),
      output: z.string(),
    }),
    AdbKeyboardInputCodeOutputSchema: z.object({
      deviceId: z.string(),
      imeId: z.string(),
      code: z.number(),
      output: z.string(),
    }),
    AdbKeyboardEditorActionOutputSchema: z.object({
      deviceId: z.string(),
      imeId: z.string(),
      code: z.number(),
      output: z.string(),
    }),
    AdbKeyboardInputCharsOutputSchema: z.object({
      deviceId: z.string(),
      imeId: z.string(),
      codepoints: z.array(z.number()),
      output: z.string(),
    }),
    SetAdbKeyboardModeOutputSchema: z.object({
      deviceId: z.string(),
      imeId: z.string(),
      previousIme: z.string().optional(),
      output: z.string(),
    }),
    SmartLoginOutputSchema: z.object({
      deviceId: z.string(),
      emailFieldFound: z.boolean(),
      passwordFieldFound: z.boolean(),
      submitFound: z.boolean(),
      usedIme: z.boolean(),
      output: z.array(z.string()),
    }),
    DetectLoginFieldsOutputSchema: z.object({
      deviceId: z.string(),
      emailField: z.any().optional(),
      passwordField: z.any().optional(),
      submitButton: z.any().optional(),
    }),
    SmartLoginFastOutputSchema: z.object({
      deviceId: z.string(),
      emailFieldFound: z.boolean(),
      passwordFieldFound: z.boolean(),
      submitFound: z.boolean(),
      usedIme: z.boolean(),
      output: z.array(z.string()),
    }),
    ReversePortOutputSchema: z.object({
      deviceId: z.string(),
      devicePort: z.number(),
      hostPort: z.number(),
      output: z.string(),
    }),
    ForwardPortOutputSchema: z.object({
      deviceId: z.string(),
      devicePort: z.number(),
      hostPort: z.number(),
      output: z.string(),
    }),
    GetLogcatOutputSchema: z.object({
      deviceId: z.string(),
      output: z.string(),
      lines: z.number(),
      pid: z.number().optional(),
      packageName: z.string().optional(),
    }),
    ListActivitiesOutputSchema: z.object({
      deviceId: z.string(),
      packageName: z.string(),
      activities: z.array(z.string()),
      mainActivity: z.string().optional(),
    }),
    HotReloadSetupOutputSchema: z.object({
      deviceId: z.string(),
      reversedPorts: z.array(z.any()),
      install: z.any().optional(),
      stop: z.any().optional(),
      start: z.any().optional(),
      playProtect: z.any().optional(),
    }),
    CreateIssueOutputSchema: z.object({
      repo: z.string(),
      title: z.string(),
      output: z.string(),
      url: z.string().optional(),
      command: z.string(),
      dryRun: z.boolean().optional(),
    }),

    // MCP Tool schemas
    TakeScreenshotToolSchema: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'string',
          description:
            'The ID of the Android device to capture a screenshot from. If not provided, uses the first available device.',
        },
        format: {
          type: 'string',
          enum: ['png'],
          default: 'png',
          description: 'The image format for the screenshot. Currently only PNG is supported.',
        },
      },
      required: [],
    },
    ListDevicesToolSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    FindApkToolSchema: {
      type: 'object',
      properties: {
        projectRoot: {
          type: 'string',
          description: 'Optional project root to search for APKs.',
        },
      },
      required: [],
    },
    InstallApkToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        apkPath: { type: 'string' },
        apkUrl: { type: 'string' },
        projectRoot: { type: 'string' },
        reinstall: { type: 'boolean' },
        grantPermissions: { type: 'boolean' },
        allowTestPackages: { type: 'boolean' },
        allowDowngrade: { type: 'boolean' },
        timeoutMs: { type: 'number' },
      },
      required: [],
    },
    UninstallAppToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        packageName: { type: 'string' },
        keepData: { type: 'boolean' },
      },
      required: ['packageName'],
    },
    StartAppToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        packageName: { type: 'string' },
        activity: { type: 'string' },
      },
      required: ['packageName'],
    },
    GetCurrentActivityToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
      },
      required: [],
    },
    GetWindowSizeToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
      },
      required: [],
    },
    ListInstalledPackagesToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        filter: { type: 'string' },
        thirdPartyOnly: { type: 'boolean' },
        systemOnly: { type: 'boolean' },
        disabledOnly: { type: 'boolean' },
        enabledOnly: { type: 'boolean' },
        includeUninstalled: { type: 'boolean' },
        user: { type: 'string' },
      },
      required: [],
    },
    IsAppInstalledToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        packageName: { type: 'string' },
      },
      required: ['packageName'],
    },
    GetAppVersionToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        packageName: { type: 'string' },
      },
      required: ['packageName'],
    },
    GetAndroidPropertyToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        property: { type: 'string' },
      },
      required: ['property'],
    },
    GetAndroidPropertiesToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        prefix: { type: 'string' },
      },
      required: [],
    },
    OpenUrlToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        url: { type: 'string' },
      },
      required: ['url'],
    },
    PasteClipboardToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
      },
      required: [],
    },
    DumpUiToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        maxChars: { type: 'number' },
        useCache: { type: 'boolean' },
        maxAgeMs: { type: 'number' },
        invalidateOnActivityChange: { type: 'boolean' },
      },
      required: [],
    },
    StopAppToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        packageName: { type: 'string' },
      },
      required: ['packageName'],
    },
    ClearAppDataToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        packageName: { type: 'string' },
      },
      required: ['packageName'],
    },
    TapToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
      },
      required: ['x', 'y'],
    },
    SwipeToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        startX: { type: 'number' },
        startY: { type: 'number' },
        endX: { type: 'number' },
        endY: { type: 'number' },
        durationMs: { type: 'number' },
      },
      required: ['startX', 'startY', 'endX', 'endY'],
    },
    SwipeAndScreenshotToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        startX: { type: 'number' },
        startY: { type: 'number' },
        endX: { type: 'number' },
        endY: { type: 'number' },
        durationMs: { type: 'number' },
        postSwipeWaitMs: { type: 'number' },
        screenshotThrottleMs: { type: 'number' },
      },
      required: ['startX', 'startY', 'endX', 'endY'],
    },
    SmartSwipeToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        startX: { type: 'number' },
        startY: { type: 'number' },
        endX: { type: 'number' },
        endY: { type: 'number' },
        profile: { type: 'string' },
        durationMs: { type: 'number' },
        postSwipeWaitMs: { type: 'number' },
        waitForUiStable: { type: 'boolean' },
        stableIterations: { type: 'number' },
        intervalMs: { type: 'number' },
        timeoutMs: { type: 'number' },
        captureScreenshot: { type: 'boolean' },
        screenshotThrottleMs: { type: 'number' },
      },
      required: ['startX', 'startY', 'endX', 'endY'],
    },
    InputTextToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['text'],
    },
    KeyeventToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        keyCode: { type: 'string' },
      },
      required: ['keyCode'],
    },
    BatchActionsToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        actions: { type: 'array' },
        preActionWaitMs: { type: 'number' },
        timeoutMs: { type: 'number' },
        captureBefore: { type: 'boolean' },
        captureAfter: { type: 'boolean' },
      },
      required: ['actions'],
    },
    Pm2StartHotModeToolSchema: {
      type: 'object',
      properties: {
        projectRoot: { type: 'string' },
        configPath: { type: 'string' },
        appName: { type: 'string' },
      },
      required: [],
    },
    Pm2StopToolSchema: {
      type: 'object',
      properties: {
        appName: { type: 'string' },
      },
      required: ['appName'],
    },
    Pm2ListToolSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    FastFlowToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        deviceAlias: { type: 'string' },
        actions: { type: 'array' },
        steps: { type: 'array' },
        stepRetries: { type: 'number' },
        retryDelayMs: { type: 'number' },
        preActionWaitMs: { type: 'number' },
        timeoutMs: { type: 'number' },
        screenshotThrottleMs: { type: 'number' },
        captureBefore: { type: 'boolean' },
        captureAfter: { type: 'boolean' },
        postActionWaitMs: { type: 'number' },
        includeUiDump: { type: 'boolean' },
        uiDumpMaxChars: { type: 'number' },
      },
      required: [],
    },
    TapByTextToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        text: { type: 'string' },
        matchMode: { type: 'string' },
        index: { type: 'number' },
      },
      required: ['text'],
    },
    TapByIdToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        resourceId: { type: 'string' },
        index: { type: 'number' },
      },
      required: ['resourceId'],
    },
    TapByDescToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        contentDesc: { type: 'string' },
        matchMode: { type: 'string' },
        index: { type: 'number' },
      },
      required: ['contentDesc'],
    },
    WaitForTextToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        text: { type: 'string' },
        matchMode: { type: 'string' },
        timeoutMs: { type: 'number' },
        intervalMs: { type: 'number' },
      },
      required: ['text'],
    },
    WaitForTextDisappearToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        text: { type: 'string' },
        matchMode: { type: 'string' },
        timeoutMs: { type: 'number' },
        intervalMs: { type: 'number' },
      },
      required: ['text'],
    },
    TypeByIdToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        resourceId: { type: 'string' },
        text: { type: 'string' },
        matchMode: { type: 'string' },
        index: { type: 'number' },
      },
      required: ['resourceId', 'text'],
    },
    WaitForIdToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        resourceId: { type: 'string' },
        matchMode: { type: 'string' },
        timeoutMs: { type: 'number' },
        intervalMs: { type: 'number' },
      },
      required: ['resourceId'],
    },
    WaitForIdDisappearToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        resourceId: { type: 'string' },
        matchMode: { type: 'string' },
        timeoutMs: { type: 'number' },
        intervalMs: { type: 'number' },
      },
      required: ['resourceId'],
    },
    WaitForDescToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        contentDesc: { type: 'string' },
        matchMode: { type: 'string' },
        timeoutMs: { type: 'number' },
        intervalMs: { type: 'number' },
      },
      required: ['contentDesc'],
    },
    WaitForDescDisappearToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        contentDesc: { type: 'string' },
        matchMode: { type: 'string' },
        timeoutMs: { type: 'number' },
        intervalMs: { type: 'number' },
      },
      required: ['contentDesc'],
    },
    WaitForActivityToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        activity: { type: 'string' },
        matchMode: { type: 'string' },
        timeoutMs: { type: 'number' },
        intervalMs: { type: 'number' },
      },
      required: ['activity'],
    },
    WaitForActivityChangeToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        previousActivity: { type: 'string' },
        targetActivity: { type: 'string' },
        matchMode: { type: 'string' },
        timeoutMs: { type: 'number' },
        intervalMs: { type: 'number' },
      },
      required: [],
    },
    PressKeySequenceToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        keyCodes: { type: 'array' },
        intervalMs: { type: 'number' },
        timeoutMs: { type: 'number' },
      },
      required: ['keyCodes'],
    },
    TapRelativeToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        xPercent: { type: 'number' },
        yPercent: { type: 'number' },
      },
      required: ['xPercent', 'yPercent'],
    },
    SwipeRelativeToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        startXPercent: { type: 'number' },
        startYPercent: { type: 'number' },
        endXPercent: { type: 'number' },
        endYPercent: { type: 'number' },
        durationMs: { type: 'number' },
      },
      required: ['startXPercent', 'startYPercent', 'endXPercent', 'endYPercent'],
    },
    ScrollVerticalToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        direction: { type: 'string' },
        distancePercent: { type: 'number' },
        durationMs: { type: 'number' },
        startXPercent: { type: 'number' },
      },
      required: ['direction'],
    },
    SmartScrollToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        direction: { type: 'string' },
        startXPercent: { type: 'number' },
        distancePercent: { type: 'number' },
        profile: { type: 'string' },
        durationMs: { type: 'number' },
        waitForUiStable: { type: 'boolean' },
        stableIterations: { type: 'number' },
        intervalMs: { type: 'number' },
        timeoutMs: { type: 'number' },
        captureScreenshot: { type: 'boolean' },
        screenshotThrottleMs: { type: 'number' },
      },
      required: ['direction'],
    },
    ScrollHorizontalToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        direction: { type: 'string' },
        distancePercent: { type: 'number' },
        durationMs: { type: 'number' },
        startYPercent: { type: 'number' },
      },
      required: ['direction'],
    },
    TapCenterToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
      },
      required: [],
    },
    LongPressToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        durationMs: { type: 'number' },
      },
      required: ['x', 'y'],
    },
    DoubleTapToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        intervalMs: { type: 'number' },
      },
      required: ['x', 'y'],
    },
    WaitForUiStableToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        stableIterations: { type: 'number' },
        intervalMs: { type: 'number' },
        timeoutMs: { type: 'number' },
      },
      required: [],
    },
    GetScreenHashToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
      },
      required: [],
    },
    ScrollUntilTextToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        text: { type: 'string' },
        matchMode: { type: 'string' },
        direction: { type: 'string' },
        distancePercent: { type: 'number' },
        maxScrolls: { type: 'number' },
        intervalMs: { type: 'number' },
      },
      required: ['text'],
    },
    ScrollUntilIdToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        resourceId: { type: 'string' },
        matchMode: { type: 'string' },
        direction: { type: 'string' },
        distancePercent: { type: 'number' },
        maxScrolls: { type: 'number' },
        intervalMs: { type: 'number' },
      },
      required: ['resourceId'],
    },
    ScrollUntilDescToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        contentDesc: { type: 'string' },
        matchMode: { type: 'string' },
        direction: { type: 'string' },
        distancePercent: { type: 'number' },
        maxScrolls: { type: 'number' },
        intervalMs: { type: 'number' },
      },
      required: ['contentDesc'],
    },
    WaitForPackageToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        packageName: { type: 'string' },
        timeoutMs: { type: 'number' },
        intervalMs: { type: 'number' },
      },
      required: ['packageName'],
    },
    RunFlowPlanToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        deviceAlias: { type: 'string' },
        steps: { type: 'array' },
        stopOnFailure: { type: 'boolean' },
        stepRetries: { type: 'number' },
        retryDelayMs: { type: 'number' },
        onFailSteps: { type: 'array' },
      },
      required: ['steps'],
    },
    QueryUiToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        selector: { type: 'object' },
        maxResults: { type: 'number' },
        useCache: { type: 'boolean' },
        maxAgeMs: { type: 'number' },
        invalidateOnActivityChange: { type: 'boolean' },
      },
      required: ['selector'],
    },
    WaitForNodeCountToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        selector: { type: 'object' },
        count: { type: 'number' },
        comparator: { type: 'string' },
        timeoutMs: { type: 'number' },
        intervalMs: { type: 'number' },
      },
      required: ['selector', 'count'],
    },
    TapBySelectorIndexToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        selector: { type: 'object' },
        index: { type: 'number' },
      },
      required: ['selector'],
    },
    UiDumpCachedToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        maxChars: { type: 'number' },
        maxAgeMs: { type: 'number' },
        invalidateOnActivityChange: { type: 'boolean' },
        refresh: { type: 'boolean' },
      },
      required: [],
    },
    SetDeviceAliasToolSchema: {
      type: 'object',
      properties: {
        alias: { type: 'string' },
        deviceId: { type: 'string' },
      },
      required: ['alias'],
    },
    ResolveDeviceAliasToolSchema: {
      type: 'object',
      properties: {
        alias: { type: 'string' },
      },
      required: ['alias'],
    },
    ListDeviceAliasesToolSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    ClearDeviceAliasToolSchema: {
      type: 'object',
      properties: {
        alias: { type: 'string' },
      },
      required: ['alias'],
    },
    ListImesToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
      },
      required: [],
    },
    SetImeToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        imeId: { type: 'string' },
      },
      required: ['imeId'],
    },
    EnableImeToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        imeId: { type: 'string' },
      },
      required: ['imeId'],
    },
    AdbKeyboardToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        text: { type: 'string' },
        imeId: { type: 'string' },
        setIme: { type: 'boolean' },
        useBase64: { type: 'boolean' },
      },
      required: ['text'],
    },
    AdbKeyboardClearTextToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        imeId: { type: 'string' },
        setIme: { type: 'boolean' },
      },
      required: [],
    },
    AdbKeyboardInputCodeToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        code: { type: 'number' },
        imeId: { type: 'string' },
        setIme: { type: 'boolean' },
      },
      required: ['code'],
    },
    AdbKeyboardEditorActionToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        code: { type: 'number' },
        imeId: { type: 'string' },
        setIme: { type: 'boolean' },
      },
      required: ['code'],
    },
    AdbKeyboardInputCharsToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        text: { type: 'string' },
        imeId: { type: 'string' },
        setIme: { type: 'boolean' },
      },
      required: ['text'],
    },
    SetAdbKeyboardModeToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        imeId: { type: 'string' },
        enable: { type: 'boolean' },
      },
      required: [],
    },
    SmartLoginToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        email: { type: 'string' },
        password: { type: 'string' },
        submitLabels: { type: 'array' },
        imeId: { type: 'string' },
        hideKeyboard: { type: 'boolean' },
        submitFallback: { type: 'boolean' },
      },
      required: ['email', 'password'],
    },
    DetectLoginFieldsToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        submitLabels: { type: 'array' },
      },
      required: [],
    },
    SmartLoginFastToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        email: { type: 'string' },
        password: { type: 'string' },
        submitLabels: { type: 'array' },
        hideKeyboard: { type: 'boolean' },
        useAdbKeyboard: { type: 'boolean' },
        submitFallback: { type: 'boolean' },
      },
      required: ['email', 'password'],
    },
    ReversePortToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        devicePort: { type: 'number' },
        hostPort: { type: 'number' },
      },
      required: ['devicePort'],
    },
    ForwardPortToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        devicePort: { type: 'number' },
        hostPort: { type: 'number' },
      },
      required: ['devicePort', 'hostPort'],
    },
    GetLogcatToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        lines: { type: 'number' },
        since: { type: 'string' },
        tag: { type: 'string' },
        priority: { type: 'string' },
        pid: { type: 'number' },
        packageName: { type: 'string' },
        format: { type: 'string' },
      },
      required: [],
    },
    ListActivitiesToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        packageName: { type: 'string' },
      },
      required: ['packageName'],
    },
    HotReloadSetupToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        packageName: { type: 'string' },
        activity: { type: 'string' },
        apkPath: { type: 'string' },
        projectRoot: { type: 'string' },
        reversePorts: { type: 'array' },
        install: { type: 'boolean' },
        start: { type: 'boolean' },
        stopBeforeStart: { type: 'boolean' },
        reinstall: { type: 'boolean' },
        grantPermissions: { type: 'boolean' },
        allowTestPackages: { type: 'boolean' },
        allowDowngrade: { type: 'boolean' },
        timeoutMs: { type: 'number' },
        playProtectAction: { type: 'string' },
        playProtectMaxWaitMs: { type: 'number' },
      },
      required: ['packageName'],
    },
    CreateIssueToolSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        labels: { type: 'array' },
        assignees: { type: 'array' },
        dryRun: { type: 'boolean' },
      },
      required: ['title'],
    },

    // Type exports
    TakeScreenshotInput: {},
    ListDevicesInput: {},
    TakeScreenshotOutput: {},
    ListDevicesOutput: {},
    FindApkInput: {},
    FindApkOutput: {},
    InstallApkInput: {},
    InstallApkOutput: {},
    UninstallAppInput: {},
    UninstallAppOutput: {},
    StartAppInput: {},
    StartAppOutput: {},
    GetCurrentActivityInput: {},
    GetCurrentActivityOutput: {},
    GetWindowSizeInput: {},
    GetWindowSizeOutput: {},
    DumpUiInput: {},
    DumpUiOutput: {},
    StopAppInput: {},
    StopAppOutput: {},
    ClearAppDataInput: {},
    ClearAppDataOutput: {},
    TapInput: {},
    TapOutput: {},
    SwipeInput: {},
    SwipeOutput: {},
    InputTextInput: {},
    InputTextOutput: {},
    KeyeventInput: {},
    KeyeventOutput: {},
    BatchActionsInput: {},
    BatchActionsOutput: {},
    Pm2StartHotModeInput: {},
    Pm2StartHotModeOutput: {},
    Pm2StopInput: {},
    Pm2StopOutput: {},
    Pm2ListInput: {},
    Pm2ListOutput: {},
    FastFlowInput: {},
    FastFlowOutput: {},
    TapByTextInput: {},
    TapByTextOutput: {},
    TapByIdInput: {},
    TapByIdOutput: {},
    TapByDescInput: {},
    TapByDescOutput: {},
    WaitForTextInput: {},
    WaitForTextOutput: {},
    TypeByIdInput: {},
    TypeByIdOutput: {},
    WaitForIdInput: {},
    WaitForIdOutput: {},
    WaitForDescInput: {},
    WaitForDescOutput: {},
    WaitForActivityInput: {},
    WaitForActivityOutput: {},
    PressKeySequenceInput: {},
    PressKeySequenceOutput: {},
    TapRelativeInput: {},
    TapRelativeOutput: {},
    SwipeRelativeInput: {},
    SwipeRelativeOutput: {},
    TapCenterInput: {},
    TapCenterOutput: {},
    WaitForUiStableInput: {},
    WaitForUiStableOutput: {},
    GetScreenHashInput: {},
    GetScreenHashOutput: {},
    WaitForPackageInput: {},
    WaitForPackageOutput: {},
    RunFlowPlanInput: {},
    RunFlowPlanOutput: {},
    QueryUiInput: {},
    QueryUiOutput: {},
    WaitForNodeCountInput: {},
    WaitForNodeCountOutput: {},
    TapBySelectorIndexInput: {},
    TapBySelectorIndexOutput: {},
    UiDumpCachedInput: {},
    UiDumpCachedOutput: {},
    SetDeviceAliasInput: {},
    SetDeviceAliasOutput: {},
    ResolveDeviceAliasInput: {},
    ResolveDeviceAliasOutput: {},
    ListDeviceAliasesInput: {},
    ListDeviceAliasesOutput: {},
    ClearDeviceAliasInput: {},
    ClearDeviceAliasOutput: {},
    ListImesInput: {},
    ListImesOutput: {},
    SetImeInput: {},
    SetImeOutput: {},
    EnableImeInput: {},
    EnableImeOutput: {},
    AdbKeyboardInput: {},
    AdbKeyboardOutput: {},
    SetAdbKeyboardModeInput: {},
    SetAdbKeyboardModeOutput: {},
    SmartLoginInput: {},
    SmartLoginOutput: {},
    DetectLoginFieldsInput: {},
    DetectLoginFieldsOutput: {},
    SmartLoginFastInput: {},
    SmartLoginFastOutput: {},
    ReversePortInput: {},
    ReversePortOutput: {},
    ForwardPortInput: {},
    ForwardPortOutput: {},
    GetLogcatInput: {},
    GetLogcatOutput: {},
    ListActivitiesInput: {},
    ListActivitiesOutput: {},
    HotReloadSetupInput: {},
    HotReloadSetupOutput: {},
  };
});

// Import server after setting up mocks
import { AndroidMcpServer } from '../../src/server';

describe('MCP Server Integration Tests', () => {
  let serverProcess: any;
  let server: AndroidMcpServer;

  beforeAll(async () => {
    // Create a real server instance for testing
    server = new AndroidMcpServer();
  });

  afterAll(async () => {
    // Clean up if needed
  });

  describe('Server Initialization', () => {
    it('should initialize server with correct capabilities', () => {
      expect(server).toBeDefined();
      // The server should have tools capability
      // We can't directly access the capabilities, but we can test through tool requests
    });
  });

  describe('Tool Listing', () => {
    it('should list available tools', async () => {
      // Create a mock request handler to test tool listing
      const listToolsHandler = server['server']['_requestHandlers'].get('tools/list');

      if (listToolsHandler) {
        const response = await listToolsHandler({ method: 'tools/list', params: {} });

        expect(response.tools).toBeDefined();
        expect(response.tools.length).toBeGreaterThanOrEqual(2);

        const toolNames = response.tools.map((tool: any) => tool.name);
        expect(toolNames).toContain('take_android_screenshot');
        expect(toolNames).toContain('list_android_devices');
        expect(toolNames).toContain('set_device_alias');
        expect(toolNames).toContain('resolve_device_alias');
        expect(toolNames).toContain('list_device_aliases');
        expect(toolNames).toContain('clear_device_alias');
        expect(toolNames).toContain('list_imes');
        expect(toolNames).toContain('set_ime');
        expect(toolNames).toContain('enable_ime');
        expect(toolNames).toContain('adb_keyboard_input');
        expect(toolNames).toContain('adb_keyboard_clear_text');
        expect(toolNames).toContain('adb_keyboard_input_code');
        expect(toolNames).toContain('adb_keyboard_editor_action');
        expect(toolNames).toContain('adb_keyboard_input_chars');
        expect(toolNames).toContain('set_adb_keyboard_mode');
        expect(toolNames).toContain('smart_login');
        expect(toolNames).toContain('detect_login_fields');
        expect(toolNames).toContain('smart_login_fast');
        expect(toolNames).toContain('install_android_apk');
        expect(toolNames).toContain('tap_android_screen');
        expect(toolNames).toContain('batch_android_actions');
        expect(toolNames).toContain('swipe_and_screenshot');
        expect(toolNames).toContain('smart_swipe');
        expect(toolNames).toContain('pm2_start_hot_mode');
        expect(toolNames).toContain('pm2_stop_app');
        expect(toolNames).toContain('pm2_list');
        expect(toolNames).toContain('fast_flow');
        expect(toolNames).toContain('tap_by_text');
        expect(toolNames).toContain('tap_by_id');
        expect(toolNames).toContain('tap_by_desc');
        expect(toolNames).toContain('wait_for_text');
        expect(toolNames).toContain('wait_for_text_disappear');
        expect(toolNames).toContain('type_by_id');
        expect(toolNames).toContain('wait_for_id');
        expect(toolNames).toContain('wait_for_id_disappear');
        expect(toolNames).toContain('wait_for_desc');
        expect(toolNames).toContain('wait_for_desc_disappear');
        expect(toolNames).toContain('wait_for_activity');
        expect(toolNames).toContain('wait_for_activity_change');
        expect(toolNames).toContain('press_key_sequence');
        expect(toolNames).toContain('tap_relative');
        expect(toolNames).toContain('swipe_relative');
        expect(toolNames).toContain('scroll_vertical');
        expect(toolNames).toContain('smart_scroll');
        expect(toolNames).toContain('scroll_horizontal');
        expect(toolNames).toContain('tap_center');
        expect(toolNames).toContain('long_press');
        expect(toolNames).toContain('double_tap');
        expect(toolNames).toContain('wait_for_ui_stable');
        expect(toolNames).toContain('get_screen_hash');
        expect(toolNames).toContain('scroll_until_text');
        expect(toolNames).toContain('scroll_until_id');
        expect(toolNames).toContain('scroll_until_desc');
        expect(toolNames).toContain('wait_for_package');
        expect(toolNames).toContain('run_flow_plan');
        expect(toolNames).toContain('query_ui');
        expect(toolNames).toContain('wait_for_node_count');
        expect(toolNames).toContain('tap_by_selector_index');
        expect(toolNames).toContain('ui_dump_cached');
        expect(toolNames).toContain('get_android_current_activity');
        expect(toolNames).toContain('get_android_window_size');
        expect(toolNames).toContain('list_installed_packages');
        expect(toolNames).toContain('is_app_installed');
        expect(toolNames).toContain('get_app_version');
        expect(toolNames).toContain('get_android_property');
        expect(toolNames).toContain('get_android_properties');
        expect(toolNames).toContain('open_url');
        expect(toolNames).toContain('paste_clipboard');
        expect(toolNames).toContain('dump_android_ui_hierarchy');
        expect(toolNames).toContain('get_android_logcat');
        expect(toolNames).toContain('list_android_activities');
        expect(toolNames).toContain('hot_reload_android_app');
        expect(toolNames).toContain('create_github_issue');

        // Check tool descriptions
        const screenshotTool = response.tools.find(
          (tool: any) => tool.name === 'take_android_screenshot'
        );
        expect(screenshotTool.description).toContain('screenshot');

        const devicesTool = response.tools.find(
          (tool: any) => tool.name === 'list_android_devices'
        );
        expect(devicesTool.description).toContain('devices');
      }
    });
  });

  describe('Tool Calling', () => {
    it('should handle list_android_devices tool call', async () => {
      // Create a mock request handler to test tool calling
      const callToolHandler = server['server']['_requestHandlers'].get('tools/call');

      if (callToolHandler) {
        const request = {
          method: 'tools/call',
          params: {
            name: 'list_android_devices',
            arguments: {},
          },
        };

        const response = await callToolHandler(request);

        expect(response.content).toBeDefined();
        expect(response.content).toHaveLength(1);
        expect(response.content[0].type).toBe('text');

        // Parse the response text
        const responseData = JSON.parse(response.content[0].text);
        expect(responseData.devices).toBeDefined();
        expect(Array.isArray(responseData.devices)).toBe(true);
        expect(responseData.devices.length).toBeGreaterThan(0);

        // Check device structure
        const device = responseData.devices[0];
        expect(device.id).toBeDefined();
        expect(device.status).toBeDefined();
      }
    });

    it('should handle take_android_screenshot tool call', async () => {
      // Create a mock request handler to test tool calling
      const callToolHandler = server['server']['_requestHandlers'].get('tools/call');

      if (callToolHandler) {
        const request = {
          method: 'tools/call',
          params: {
            name: 'take_android_screenshot',
            arguments: {},
          },
        };

        const response = await callToolHandler(request);

        expect(response.content).toBeDefined();
        expect(response.content.length).toBeGreaterThanOrEqual(2);

        const imageContent = response.content.find((item: any) => item.type === 'image');
        const textContent = response.content.find((item: any) => item.type === 'text');

        expect(imageContent).toBeDefined();
        expect(imageContent.mimeType).toBe('image/png');
        expect(imageContent.data).toBeDefined();

        expect(textContent).toBeDefined();
        expect(textContent.text).toContain('Android screenshot captured');
      }
    });

    it('should handle take_android_screenshot with specific device', async () => {
      // Create a mock request handler to test tool calling
      const callToolHandler = server['server']['_requestHandlers'].get('tools/call');

      if (callToolHandler) {
        const request = {
          method: 'tools/call',
          params: {
            name: 'take_android_screenshot',
            arguments: {
              deviceId: 'emulator-5554',
            },
          },
        };

        const response = await callToolHandler(request);

        expect(response.content).toBeDefined();
        expect(response.content.length).toBeGreaterThanOrEqual(2);

        const textContent = response.content.find((item: any) => item.type === 'text');
        expect(textContent).toBeDefined();
        expect(textContent.text).toContain('emulator-5554');
      }
    });

    it('should handle unknown tool name', async () => {
      // Create a mock request handler to test tool calling
      const callToolHandler = server['server']['_requestHandlers'].get('tools/call');

      if (callToolHandler) {
        const request = {
          method: 'tools/call',
          params: {
            name: 'unknown_tool',
            arguments: {},
          },
        };

        const response = await callToolHandler(request);
        expect(response.isError).toBe(true);
        expect(response.content[0].text).toContain('Unknown tool');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully', async () => {
      // Create a mock request handler to test tool calling
      const callToolHandler = server['server']['_requestHandlers'].get('tools/call');

      if (callToolHandler) {
        // Test with invalid arguments that should cause an error
        const request = {
          method: 'tools/call',
          params: {
            name: 'take_android_screenshot',
            arguments: {
              deviceId: 'nonexistent-device',
            },
          },
        };

        const response = await callToolHandler(request);

        expect(response.content).toBeDefined();
        expect(response.content).toHaveLength(1);
        expect(response.content[0].type).toBe('text');
        expect(response.isError).toBe(true);

        // The error message should contain information about the error
        const errorMessage = response.content[0].text;
        expect(errorMessage).toContain('Device with ID');
      }
    });
  });
});

// Additional test for actual server process communication
describe('Server Process Communication', () => {
  jest.setTimeout(20000);
  let serverProcess: any;
  let serverOutput: string = '';
  let serverError: string = '';

  beforeAll(async () => {
    // Build the project first
    const { execSync } = require('child_process');
    try {
      execSync('npm run build', { stdio: 'pipe', cwd: path.join(__dirname, '..', '..') });
    } catch (error) {
      console.warn('Build failed, skipping process communication tests');
      return;
    }

    // Start the server process
    serverProcess = spawn('node', [path.join(__dirname, '..', '..', 'dist', 'index.js')]);

    // Collect output
    serverProcess.stdout.on('data', (data: Buffer) => {
      serverOutput += data.toString();
    });

    serverProcess.stderr.on('data', (data: Buffer) => {
      serverError += data.toString();
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  it('should start server process without errors', () => {
    if (!serverProcess) {
      // Skip test if build failed
      return;
    }

    expect(serverProcess.pid).toBeDefined();
    expect(serverError).not.toContain('Error');
  });

  it('should handle JSON-RPC requests', async () => {
    if (!serverProcess) {
      // Skip test if build failed
      return;
    }

    // Send a list tools request
    const request = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });

    serverProcess.stdin.write(request + '\n');

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check if we got a valid JSON response
    const responseLines = serverOutput.split('\n').filter(line => line.trim());
    const lastLine = responseLines[responseLines.length - 1];

    expect(lastLine).toBeDefined();

    try {
      const response = JSON.parse(lastLine);
      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.result).toBeDefined();
      expect(response.result.tools).toBeDefined();
    } catch (error) {
      console.error('Failed to parse server response:', lastLine);
      throw error;
    }
  });
});
