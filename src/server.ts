import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  TakeScreenshotInputSchema,
  TakeScreenshotOutputSchema,
  ListDevicesInputSchema,
  ListDevicesOutputSchema,
  TakeScreenshotToolSchema,
  ListDevicesToolSchema,
  FindApkInputSchema,
  FindApkOutputSchema,
  FindApkToolSchema,
  InstallApkInputSchema,
  InstallApkOutputSchema,
  InstallApkToolSchema,
  UninstallAppInputSchema,
  UninstallAppOutputSchema,
  UninstallAppToolSchema,
  StartAppInputSchema,
  StartAppOutputSchema,
  StartAppToolSchema,
  GetCurrentActivityInputSchema,
  GetCurrentActivityOutputSchema,
  GetCurrentActivityToolSchema,
  GetWindowSizeInputSchema,
  GetWindowSizeOutputSchema,
  GetWindowSizeToolSchema,
  ListInstalledPackagesInputSchema,
  ListInstalledPackagesOutputSchema,
  ListInstalledPackagesToolSchema,
  IsAppInstalledInputSchema,
  IsAppInstalledOutputSchema,
  IsAppInstalledToolSchema,
  GetAppVersionInputSchema,
  GetAppVersionOutputSchema,
  GetAppVersionToolSchema,
  GetAndroidPropertyInputSchema,
  GetAndroidPropertyOutputSchema,
  GetAndroidPropertyToolSchema,
  GetAndroidPropertiesInputSchema,
  GetAndroidPropertiesOutputSchema,
  GetAndroidPropertiesToolSchema,
  OpenUrlInputSchema,
  OpenUrlOutputSchema,
  OpenUrlToolSchema,
  PasteClipboardInputSchema,
  PasteClipboardOutputSchema,
  PasteClipboardToolSchema,
  DumpUiInputSchema,
  DumpUiOutputSchema,
  DumpUiToolSchema,
  StopAppInputSchema,
  StopAppOutputSchema,
  StopAppToolSchema,
  ClearAppDataInputSchema,
  ClearAppDataOutputSchema,
  ClearAppDataToolSchema,
  TapInputSchema,
  TapOutputSchema,
  TapToolSchema,
  SwipeInputSchema,
  SwipeOutputSchema,
  SwipeToolSchema,
  InputTextInputSchema,
  InputTextOutputSchema,
  InputTextToolSchema,
  KeyeventInputSchema,
  KeyeventOutputSchema,
  KeyeventToolSchema,
  BatchActionsInputSchema,
  BatchActionsOutputSchema,
  BatchActionsToolSchema,
  Pm2StartHotModeInputSchema,
  Pm2StartHotModeOutputSchema,
  Pm2StartHotModeToolSchema,
  Pm2StopInputSchema,
  Pm2StopOutputSchema,
  Pm2StopToolSchema,
  Pm2ListInputSchema,
  Pm2ListOutputSchema,
  Pm2ListToolSchema,
  FastFlowInputSchema,
  FastFlowOutputSchema,
  FastFlowToolSchema,
  TapByTextInputSchema,
  TapByTextOutputSchema,
  TapByTextToolSchema,
  TapByIdInputSchema,
  TapByIdOutputSchema,
  TapByIdToolSchema,
  TapByDescInputSchema,
  TapByDescOutputSchema,
  TapByDescToolSchema,
  WaitForTextInputSchema,
  WaitForTextOutputSchema,
  WaitForTextToolSchema,
  WaitForTextDisappearInputSchema,
  WaitForTextDisappearOutputSchema,
  WaitForTextDisappearToolSchema,
  TypeByIdInputSchema,
  TypeByIdOutputSchema,
  TypeByIdToolSchema,
  WaitForIdInputSchema,
  WaitForIdOutputSchema,
  WaitForIdToolSchema,
  WaitForIdDisappearInputSchema,
  WaitForIdDisappearOutputSchema,
  WaitForIdDisappearToolSchema,
  WaitForDescInputSchema,
  WaitForDescOutputSchema,
  WaitForDescToolSchema,
  WaitForDescDisappearInputSchema,
  WaitForDescDisappearOutputSchema,
  WaitForDescDisappearToolSchema,
  WaitForActivityInputSchema,
  WaitForActivityOutputSchema,
  WaitForActivityToolSchema,
  WaitForActivityChangeInputSchema,
  WaitForActivityChangeOutputSchema,
  WaitForActivityChangeToolSchema,
  PressKeySequenceInputSchema,
  PressKeySequenceOutputSchema,
  PressKeySequenceToolSchema,
  TapRelativeInputSchema,
  TapRelativeOutputSchema,
  TapRelativeToolSchema,
  SwipeRelativeInputSchema,
  SwipeRelativeOutputSchema,
  SwipeRelativeToolSchema,
  ScrollVerticalInputSchema,
  ScrollVerticalOutputSchema,
  ScrollVerticalToolSchema,
  ScrollHorizontalInputSchema,
  ScrollHorizontalOutputSchema,
  ScrollHorizontalToolSchema,
  TapCenterInputSchema,
  TapCenterOutputSchema,
  TapCenterToolSchema,
  LongPressInputSchema,
  LongPressOutputSchema,
  LongPressToolSchema,
  DoubleTapInputSchema,
  DoubleTapOutputSchema,
  DoubleTapToolSchema,
  WaitForUiStableInputSchema,
  WaitForUiStableOutputSchema,
  WaitForUiStableToolSchema,
  GetScreenHashInputSchema,
  GetScreenHashOutputSchema,
  GetScreenHashToolSchema,
  ScrollUntilTextInputSchema,
  ScrollUntilTextOutputSchema,
  ScrollUntilTextToolSchema,
  ScrollUntilIdInputSchema,
  ScrollUntilIdOutputSchema,
  ScrollUntilIdToolSchema,
  ScrollUntilDescInputSchema,
  ScrollUntilDescOutputSchema,
  ScrollUntilDescToolSchema,
  WaitForPackageInputSchema,
  WaitForPackageOutputSchema,
  WaitForPackageToolSchema,
  RunFlowPlanInputSchema,
  RunFlowPlanOutputSchema,
  RunFlowPlanToolSchema,
  UiSelectorSchema,
  QueryUiInputSchema,
  QueryUiOutputSchema,
  QueryUiToolSchema,
  WaitForNodeCountInputSchema,
  WaitForNodeCountOutputSchema,
  WaitForNodeCountToolSchema,
  TapBySelectorIndexInputSchema,
  TapBySelectorIndexOutputSchema,
  TapBySelectorIndexToolSchema,
  UiDumpCachedInputSchema,
  UiDumpCachedOutputSchema,
  UiDumpCachedToolSchema,
  SetDeviceAliasInputSchema,
  SetDeviceAliasOutputSchema,
  SetDeviceAliasToolSchema,
  ResolveDeviceAliasInputSchema,
  ResolveDeviceAliasOutputSchema,
  ResolveDeviceAliasToolSchema,
  ListDeviceAliasesInputSchema,
  ListDeviceAliasesOutputSchema,
  ListDeviceAliasesToolSchema,
  ClearDeviceAliasInputSchema,
  ClearDeviceAliasOutputSchema,
  ClearDeviceAliasToolSchema,
  ListImesInputSchema,
  ListImesOutputSchema,
  ListImesToolSchema,
  SetImeInputSchema,
  SetImeOutputSchema,
  SetImeToolSchema,
  EnableImeInputSchema,
  EnableImeOutputSchema,
  EnableImeToolSchema,
  AdbKeyboardInputSchema,
  AdbKeyboardOutputSchema,
  AdbKeyboardToolSchema,
  AdbKeyboardClearTextInputSchema,
  AdbKeyboardClearTextOutputSchema,
  AdbKeyboardClearTextToolSchema,
  AdbKeyboardInputCodeInputSchema,
  AdbKeyboardInputCodeOutputSchema,
  AdbKeyboardInputCodeToolSchema,
  AdbKeyboardEditorActionInputSchema,
  AdbKeyboardEditorActionOutputSchema,
  AdbKeyboardEditorActionToolSchema,
  AdbKeyboardInputCharsInputSchema,
  AdbKeyboardInputCharsOutputSchema,
  AdbKeyboardInputCharsToolSchema,
  SetAdbKeyboardModeInputSchema,
  SetAdbKeyboardModeOutputSchema,
  SetAdbKeyboardModeToolSchema,
  SmartLoginInputSchema,
  SmartLoginOutputSchema,
  SmartLoginToolSchema,
  DetectLoginFieldsInputSchema,
  DetectLoginFieldsOutputSchema,
  DetectLoginFieldsToolSchema,
  SmartLoginFastInputSchema,
  SmartLoginFastOutputSchema,
  SmartLoginFastToolSchema,
  ReversePortInputSchema,
  ReversePortOutputSchema,
  ReversePortToolSchema,
  ForwardPortInputSchema,
  ForwardPortOutputSchema,
  ForwardPortToolSchema,
  GetLogcatInputSchema,
  GetLogcatOutputSchema,
  GetLogcatToolSchema,
  ListActivitiesInputSchema,
  ListActivitiesOutputSchema,
  ListActivitiesToolSchema,
  HotReloadSetupInputSchema,
  HotReloadSetupOutputSchema,
  HotReloadSetupToolSchema,
} from './types.js';
import { captureScreenshotResponse } from './utils/screenshot.js';
import {
  clearAppData as adbClearAppData,
  dumpUiHierarchy as adbDumpUiHierarchy,
  findApkInProject as adbFindApkInProject,
  forwardPort as adbForwardPort,
  getCurrentActivity as adbGetCurrentActivity,
  getLogcat as adbGetLogcat,
  getConnectedDevices,
  getWindowSize as adbGetWindowSize,
  hotReloadSetup as adbHotReloadSetup,
  installApk as adbInstallApk,
  inputText as adbInputText,
  listPackageActivities as adbListPackageActivities,
  batchInputActions as adbBatchInputActions,
  reversePort as adbReversePort,
  resolveDeviceId,
  sendKeyevent as adbSendKeyevent,
  startApp as adbStartApp,
  stopApp as adbStopApp,
  swipeScreen as adbSwipeScreen,
  tapScreen as adbTapScreen,
  tapByText as adbTapByText,
  tapById as adbTapById,
  tapByDesc as adbTapByDesc,
  waitForText as adbWaitForText,
  typeById as adbTypeById,
  waitForId as adbWaitForId,
  waitForDesc as adbWaitForDesc,
  waitForActivity as adbWaitForActivity,
  pressKeySequence as adbPressKeySequence,
  tapRelative as adbTapRelative,
  swipeRelative as adbSwipeRelative,
  tapCenter as adbTapCenter,
  waitForUiStable as adbWaitForUiStable,
  getScreenHash as adbGetScreenHash,
  waitForPackage as adbWaitForPackage,
  runFlowPlan as adbRunFlowPlan,
  queryUi as adbQueryUi,
  waitForNodeCount as adbWaitForNodeCount,
  tapBySelectorIndex as adbTapBySelectorIndex,
  getCachedUiDump as adbGetCachedUiDump,
  listImes as adbListImes,
  setIme as adbSetIme,
  enableIme as adbEnableIme,
  adbKeyboardInput as adbKeyboardInput,
  adbKeyboardClearText as adbKeyboardClearText,
  adbKeyboardInputCode as adbKeyboardInputCode,
  adbKeyboardEditorAction as adbKeyboardEditorAction,
  adbKeyboardInputChars as adbKeyboardInputChars,
  getCurrentIme as adbGetCurrentIme,
  smartLogin as adbSmartLogin,
  detectLoginFields as adbDetectLoginFields,
  smartLoginFast as adbSmartLoginFast,
  waitForTextDisappear as adbWaitForTextDisappear,
  waitForIdDisappear as adbWaitForIdDisappear,
  waitForDescDisappear as adbWaitForDescDisappear,
  waitForActivityChange as adbWaitForActivityChange,
  scrollVertical as adbScrollVertical,
  scrollHorizontal as adbScrollHorizontal,
  scrollUntilText as adbScrollUntilText,
  scrollUntilId as adbScrollUntilId,
  scrollUntilDesc as adbScrollUntilDesc,
  listInstalledPackages as adbListInstalledPackages,
  isAppInstalled as adbIsAppInstalled,
  getAppVersion as adbGetAppVersion,
  getAndroidProperty as adbGetAndroidProperty,
  getAndroidProperties as adbGetAndroidProperties,
  openUrl as adbOpenUrl,
  longPress as adbLongPress,
  doubleTap as adbDoubleTap,
  pasteClipboard as adbPasteClipboard,
  uninstallApp as adbUninstallApp,
} from './utils/adb.js';
import { listPm2Apps, startPm2HotMode, stopPm2App } from './utils/pm2.js';
import { downloadApkFromUrl } from './utils/download.js';
import { formatErrorForResponse } from './utils/error.js';

class AndroidMcpServer {
  private server: Server;
  private deviceAliases: Map<string, string>;
  private screenshotCache: Map<
    string,
    { timestamp: number; shot: z.infer<typeof TakeScreenshotOutputSchema> }
  >;
  private imeRestoreMap: Map<string, string>;

  constructor() {
    this.server = new Server(
      {
        name: 'the-android-mcp',
        version: '2.0.1',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.deviceAliases = new Map();
    this.screenshotCache = new Map();
    this.imeRestoreMap = new Map();
    this.setupToolHandlers();
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: 'take_android_screenshot',
          description: 'Capture a screenshot from an Android device or emulator',
          inputSchema: TakeScreenshotToolSchema,
        },
        {
          name: 'list_android_devices',
          description: 'List all connected Android devices and emulators',
          inputSchema: ListDevicesToolSchema,
        },
        {
          name: 'set_device_alias',
          description: 'Set a device alias for later reuse',
          inputSchema: SetDeviceAliasToolSchema,
        },
        {
          name: 'resolve_device_alias',
          description: 'Resolve a device alias to a device ID',
          inputSchema: ResolveDeviceAliasToolSchema,
        },
        {
          name: 'list_device_aliases',
          description: 'List configured device aliases',
          inputSchema: ListDeviceAliasesToolSchema,
        },
        {
          name: 'clear_device_alias',
          description: 'Clear a device alias',
          inputSchema: ClearDeviceAliasToolSchema,
        },
        {
          name: 'list_imes',
          description: 'List available Android IMEs',
          inputSchema: ListImesToolSchema,
        },
        {
          name: 'set_ime',
          description: 'Set the current Android IME',
          inputSchema: SetImeToolSchema,
        },
        {
          name: 'enable_ime',
          description: 'Enable an Android IME',
          inputSchema: EnableImeToolSchema,
        },
        {
          name: 'adb_keyboard_input',
          description: 'Input text via ADB Keyboard IME',
          inputSchema: AdbKeyboardToolSchema,
        },
        {
          name: 'adb_keyboard_clear_text',
          description: 'Clear text via ADB Keyboard IME',
          inputSchema: AdbKeyboardClearTextToolSchema,
        },
        {
          name: 'adb_keyboard_input_code',
          description: 'Send a key code via ADB Keyboard IME',
          inputSchema: AdbKeyboardInputCodeToolSchema,
        },
        {
          name: 'adb_keyboard_editor_action',
          description: 'Send an editor action code via ADB Keyboard IME',
          inputSchema: AdbKeyboardEditorActionToolSchema,
        },
        {
          name: 'adb_keyboard_input_chars',
          description: 'Send unicode codepoints via ADB Keyboard IME',
          inputSchema: AdbKeyboardInputCharsToolSchema,
        },
        {
          name: 'set_adb_keyboard_mode',
          description: 'Enable/disable ADB keyboard mode (restore previous IME)',
          inputSchema: SetAdbKeyboardModeToolSchema,
        },
        {
          name: 'smart_login',
          description: 'Auto-fill login screen quickly (email/password/submit)',
          inputSchema: SmartLoginToolSchema,
        },
        {
          name: 'detect_login_fields',
          description: 'Detect login-related fields and submit buttons',
          inputSchema: DetectLoginFieldsToolSchema,
        },
        {
          name: 'smart_login_fast',
          description: 'Fast login with single UI dump + batch actions',
          inputSchema: SmartLoginFastToolSchema,
        },
        {
          name: 'find_android_apk',
          description: 'Find the most recent APK in a project directory',
          inputSchema: FindApkToolSchema,
        },
        {
          name: 'install_android_apk',
          description: 'Install an APK on a connected Android device or emulator',
          inputSchema: InstallApkToolSchema,
        },
        {
          name: 'uninstall_android_app',
          description: 'Uninstall an Android app by package name',
          inputSchema: UninstallAppToolSchema,
        },
        {
          name: 'start_android_app',
          description: 'Start an Android app by package name (optionally activity)',
          inputSchema: StartAppToolSchema,
        },
        {
          name: 'get_android_current_activity',
          description: 'Get the currently focused app activity',
          inputSchema: GetCurrentActivityToolSchema,
        },
        {
          name: 'get_android_window_size',
          description: 'Get device window size (physical/override)',
          inputSchema: GetWindowSizeToolSchema,
        },
        {
          name: 'list_installed_packages',
          description: 'List installed package names',
          inputSchema: ListInstalledPackagesToolSchema,
        },
        {
          name: 'is_app_installed',
          description: 'Check if a package is installed',
          inputSchema: IsAppInstalledToolSchema,
        },
        {
          name: 'get_app_version',
          description: 'Get app version info via dumpsys',
          inputSchema: GetAppVersionToolSchema,
        },
        {
          name: 'get_android_property',
          description: 'Read a system property (getprop)',
          inputSchema: GetAndroidPropertyToolSchema,
        },
        {
          name: 'get_android_properties',
          description: 'Read system properties (optionally filtered by prefix)',
          inputSchema: GetAndroidPropertiesToolSchema,
        },
        {
          name: 'open_url',
          description: 'Open a URL via Android intent',
          inputSchema: OpenUrlToolSchema,
        },
        {
          name: 'paste_clipboard',
          description: 'Paste clipboard content via keyevent',
          inputSchema: PasteClipboardToolSchema,
        },
        {
          name: 'dump_android_ui_hierarchy',
          description: 'Dump UI hierarchy XML from the device',
          inputSchema: DumpUiToolSchema,
        },
        {
          name: 'stop_android_app',
          description: 'Force-stop an Android app by package name',
          inputSchema: StopAppToolSchema,
        },
        {
          name: 'clear_android_app_data',
          description: 'Clear app data for a package name',
          inputSchema: ClearAppDataToolSchema,
        },
        {
          name: 'tap_android_screen',
          description: 'Send a tap event to the device screen',
          inputSchema: TapToolSchema,
        },
        {
          name: 'swipe_android_screen',
          description: 'Send a swipe gesture to the device screen',
          inputSchema: SwipeToolSchema,
        },
        {
          name: 'input_android_text',
          description: 'Type text into the focused input field',
          inputSchema: InputTextToolSchema,
        },
        {
          name: 'send_android_keyevent',
          description: 'Send an Android keyevent',
          inputSchema: KeyeventToolSchema,
        },
        {
          name: 'batch_android_actions',
          description: 'Run multiple input actions in a single ADB shell call',
          inputSchema: BatchActionsToolSchema,
        },
        {
          name: 'pm2_start_hot_mode',
          description: 'Start the Android hot mode build in the background via PM2',
          inputSchema: Pm2StartHotModeToolSchema,
        },
        {
          name: 'pm2_stop_app',
          description: 'Stop a PM2 app by name',
          inputSchema: Pm2StopToolSchema,
        },
        {
          name: 'pm2_list',
          description: 'List PM2 apps',
          inputSchema: Pm2ListToolSchema,
        },
        {
          name: 'fast_flow',
          description: 'Run a fast UI flow with optional screenshots and UI dump',
          inputSchema: FastFlowToolSchema,
        },
        {
          name: 'tap_by_text',
          description: 'Tap the first UI node matching text',
          inputSchema: TapByTextToolSchema,
        },
        {
          name: 'tap_by_id',
          description: 'Tap the first UI node matching resource-id',
          inputSchema: TapByIdToolSchema,
        },
        {
          name: 'tap_by_desc',
          description: 'Tap the first UI node matching content-desc',
          inputSchema: TapByDescToolSchema,
        },
        {
          name: 'wait_for_text',
          description: 'Wait for UI text to appear via UI dump polling',
          inputSchema: WaitForTextToolSchema,
        },
        {
          name: 'wait_for_text_disappear',
          description: 'Wait for UI text to disappear via UI dump polling',
          inputSchema: WaitForTextDisappearToolSchema,
        },
        {
          name: 'type_by_id',
          description: 'Tap a field by resource-id and type text',
          inputSchema: TypeByIdToolSchema,
        },
        {
          name: 'wait_for_id',
          description: 'Wait for UI resource-id to appear via UI dump polling',
          inputSchema: WaitForIdToolSchema,
        },
        {
          name: 'wait_for_id_disappear',
          description: 'Wait for UI resource-id to disappear via UI dump polling',
          inputSchema: WaitForIdDisappearToolSchema,
        },
        {
          name: 'wait_for_desc',
          description: 'Wait for UI content-desc to appear via UI dump polling',
          inputSchema: WaitForDescToolSchema,
        },
        {
          name: 'wait_for_desc_disappear',
          description: 'Wait for UI content-desc to disappear via UI dump polling',
          inputSchema: WaitForDescDisappearToolSchema,
        },
        {
          name: 'wait_for_activity',
          description: 'Wait for current activity/component',
          inputSchema: WaitForActivityToolSchema,
        },
        {
          name: 'wait_for_activity_change',
          description: 'Wait for activity/component to change (or match target)',
          inputSchema: WaitForActivityChangeToolSchema,
        },
        {
          name: 'press_key_sequence',
          description: 'Press multiple Android keyevents in sequence',
          inputSchema: PressKeySequenceToolSchema,
        },
        {
          name: 'tap_relative',
          description: 'Tap using percentage coordinates',
          inputSchema: TapRelativeToolSchema,
        },
        {
          name: 'swipe_relative',
          description: 'Swipe using percentage coordinates',
          inputSchema: SwipeRelativeToolSchema,
        },
        {
          name: 'scroll_vertical',
          description: 'Scroll vertically using percentage swipe',
          inputSchema: ScrollVerticalToolSchema,
        },
        {
          name: 'scroll_horizontal',
          description: 'Scroll horizontally using percentage swipe',
          inputSchema: ScrollHorizontalToolSchema,
        },
        {
          name: 'tap_center',
          description: 'Tap the center of the screen',
          inputSchema: TapCenterToolSchema,
        },
        {
          name: 'long_press',
          description: 'Long-press on a coordinate',
          inputSchema: LongPressToolSchema,
        },
        {
          name: 'double_tap',
          description: 'Double tap on a coordinate',
          inputSchema: DoubleTapToolSchema,
        },
        {
          name: 'wait_for_ui_stable',
          description: 'Wait until the UI dump is stable',
          inputSchema: WaitForUiStableToolSchema,
        },
        {
          name: 'get_screen_hash',
          description: 'Get a UI hash from the current UI dump',
          inputSchema: GetScreenHashToolSchema,
        },
        {
          name: 'scroll_until_text',
          description: 'Scroll until text appears',
          inputSchema: ScrollUntilTextToolSchema,
        },
        {
          name: 'scroll_until_id',
          description: 'Scroll until resource-id appears',
          inputSchema: ScrollUntilIdToolSchema,
        },
        {
          name: 'scroll_until_desc',
          description: 'Scroll until content-desc appears',
          inputSchema: ScrollUntilDescToolSchema,
        },
        {
          name: 'wait_for_package',
          description: 'Wait for a package to be in the foreground',
          inputSchema: WaitForPackageToolSchema,
        },
        {
          name: 'run_flow_plan',
          description: 'Execute a multi-step UI flow plan quickly',
          inputSchema: RunFlowPlanToolSchema,
        },
        {
          name: 'query_ui',
          description: 'Query UI nodes by selector (text/id/desc)',
          inputSchema: QueryUiToolSchema,
        },
        {
          name: 'wait_for_node_count',
          description: 'Wait for a selector to reach a match count',
          inputSchema: WaitForNodeCountToolSchema,
        },
        {
          name: 'tap_by_selector_index',
          description: 'Tap a selector match by index',
          inputSchema: TapBySelectorIndexToolSchema,
        },
        {
          name: 'ui_dump_cached',
          description: 'Return the last cached UI dump for a device',
          inputSchema: UiDumpCachedToolSchema,
        },
        {
          name: 'reverse_android_port',
          description: 'Reverse a TCP port from device to host (useful for hot reload)',
          inputSchema: ReversePortToolSchema,
        },
        {
          name: 'forward_android_port',
          description: 'Forward a TCP port from host to device',
          inputSchema: ForwardPortToolSchema,
        },
        {
          name: 'get_android_logcat',
          description: 'Fetch recent logcat output (optionally filtered)',
          inputSchema: GetLogcatToolSchema,
        },
        {
          name: 'list_android_activities',
          description: 'List activities for a given package name',
          inputSchema: ListActivitiesToolSchema,
        },
        {
          name: 'hot_reload_android_app',
          description: 'Reverse ports, install (optional), and start an app for hot reload',
          inputSchema: HotReloadSetupToolSchema,
        },
      ];

      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'take_android_screenshot': {
            const input = TakeScreenshotInputSchema.parse(args);
            const result = await this.takeScreenshot(input);
            return {
              content: [
                {
                  type: 'image',
                  data: result.data,
                  mimeType: 'image/png',
                },
                {
                  type: 'text',
                  text: `Android screenshot captured from ${result.deviceId}: ${result.width}x${result.height} pixels`,
                },
              ],
            };
          }

          case 'list_android_devices': {
            const input = ListDevicesInputSchema.parse(args);
            const result = await this.listDevices(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'set_device_alias': {
            const input = SetDeviceAliasInputSchema.parse(args);
            const result = await this.setDeviceAlias(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'resolve_device_alias': {
            const input = ResolveDeviceAliasInputSchema.parse(args);
            const result = await this.resolveDeviceAlias(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'list_device_aliases': {
            const input = ListDeviceAliasesInputSchema.parse(args);
            const result = await this.listDeviceAliases(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'clear_device_alias': {
            const input = ClearDeviceAliasInputSchema.parse(args);
            const result = await this.clearDeviceAlias(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'list_imes': {
            const input = ListImesInputSchema.parse(args);
            const result = await this.listImes(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'set_ime': {
            const input = SetImeInputSchema.parse(args);
            const result = await this.setIme(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'enable_ime': {
            const input = EnableImeInputSchema.parse(args);
            const result = await this.enableIme(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'adb_keyboard_input': {
            const input = AdbKeyboardInputSchema.parse(args);
            const result = await this.adbKeyboardInput(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'adb_keyboard_clear_text': {
            const input = AdbKeyboardClearTextInputSchema.parse(args);
            const result = await this.adbKeyboardClearText(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'adb_keyboard_input_code': {
            const input = AdbKeyboardInputCodeInputSchema.parse(args);
            const result = await this.adbKeyboardInputCode(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'adb_keyboard_editor_action': {
            const input = AdbKeyboardEditorActionInputSchema.parse(args);
            const result = await this.adbKeyboardEditorAction(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'adb_keyboard_input_chars': {
            const input = AdbKeyboardInputCharsInputSchema.parse(args);
            const result = await this.adbKeyboardInputChars(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'set_adb_keyboard_mode': {
            const input = SetAdbKeyboardModeInputSchema.parse(args);
            const result = await this.setAdbKeyboardMode(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'smart_login': {
            const input = SmartLoginInputSchema.parse(args);
            const result = await this.smartLogin(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'detect_login_fields': {
            const input = DetectLoginFieldsInputSchema.parse(args);
            const result = await this.detectLoginFields(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'smart_login_fast': {
            const input = SmartLoginFastInputSchema.parse(args);
            const result = await this.smartLoginFast(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'find_android_apk': {
            const input = FindApkInputSchema.parse(args);
            const result = await this.findApk(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'install_android_apk': {
            const input = InstallApkInputSchema.parse(args);
            const result = await this.installApk(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'uninstall_android_app': {
            const input = UninstallAppInputSchema.parse(args);
            const result = await this.uninstallApp(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'start_android_app': {
            const input = StartAppInputSchema.parse(args);
            const result = await this.startApp(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'get_android_current_activity': {
            const input = GetCurrentActivityInputSchema.parse(args);
            const result = await this.getCurrentActivity(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'get_android_window_size': {
            const input = GetWindowSizeInputSchema.parse(args);
            const result = await this.getWindowSize(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'list_installed_packages': {
            const input = ListInstalledPackagesInputSchema.parse(args);
            const result = await this.listInstalledPackages(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'is_app_installed': {
            const input = IsAppInstalledInputSchema.parse(args);
            const result = await this.isAppInstalled(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'get_app_version': {
            const input = GetAppVersionInputSchema.parse(args);
            const result = await this.getAppVersion(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'get_android_property': {
            const input = GetAndroidPropertyInputSchema.parse(args);
            const result = await this.getAndroidProperty(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'get_android_properties': {
            const input = GetAndroidPropertiesInputSchema.parse(args);
            const result = await this.getAndroidProperties(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'open_url': {
            const input = OpenUrlInputSchema.parse(args);
            const result = await this.openUrl(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'paste_clipboard': {
            const input = PasteClipboardInputSchema.parse(args);
            const result = await this.pasteClipboard(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'dump_android_ui_hierarchy': {
            const input = DumpUiInputSchema.parse(args);
            const result = await this.dumpUiHierarchy(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'stop_android_app': {
            const input = StopAppInputSchema.parse(args);
            const result = await this.stopApp(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'clear_android_app_data': {
            const input = ClearAppDataInputSchema.parse(args);
            const result = await this.clearAppData(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'tap_android_screen': {
            const input = TapInputSchema.parse(args);
            const result = await this.tapScreen(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'swipe_android_screen': {
            const input = SwipeInputSchema.parse(args);
            const result = await this.swipeScreen(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'input_android_text': {
            const input = InputTextInputSchema.parse(args);
            const result = await this.inputText(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'send_android_keyevent': {
            const input = KeyeventInputSchema.parse(args);
            const result = await this.sendKeyevent(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'batch_android_actions': {
            const input = BatchActionsInputSchema.parse(args);
            const result = await this.batchActions(input);
            const content: Array<{ type: 'image' | 'text'; data?: string; mimeType?: string; text?: string }> = [];

            if (result.screenshotBefore) {
              content.push({
                type: 'image',
                data: result.screenshotBefore.data,
                mimeType: 'image/png',
              });
            }

            if (result.screenshotAfter) {
              content.push({
                type: 'image',
                data: result.screenshotAfter.data,
                mimeType: 'image/png',
              });
            }

            const summary = {
              deviceId: result.deviceId,
              actions: result.actions,
              output: result.output,
              screenshotBefore: result.screenshotBefore
                ? {
                    deviceId: result.screenshotBefore.deviceId,
                    width: result.screenshotBefore.width,
                    height: result.screenshotBefore.height,
                    timestamp: result.screenshotBefore.timestamp,
                  }
                : undefined,
              screenshotAfter: result.screenshotAfter
                ? {
                    deviceId: result.screenshotAfter.deviceId,
                    width: result.screenshotAfter.width,
                    height: result.screenshotAfter.height,
                    timestamp: result.screenshotAfter.timestamp,
                  }
                : undefined,
            };

            content.push({
              type: 'text',
              text: JSON.stringify(summary),
            });

            return { content };
          }

          case 'pm2_start_hot_mode': {
            const input = Pm2StartHotModeInputSchema.parse(args);
            const result = await this.pm2StartHotMode(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'pm2_stop_app': {
            const input = Pm2StopInputSchema.parse(args);
            const result = await this.pm2StopApp(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'pm2_list': {
            const input = Pm2ListInputSchema.parse(args);
            const result = await this.pm2List(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'fast_flow': {
            const input = FastFlowInputSchema.parse(args);
            const result = await this.fastFlow(input);
            const content: Array<{ type: 'image' | 'text'; data?: string; mimeType?: string; text?: string }> = [];

            if (result.screenshotBefore) {
              content.push({
                type: 'image',
                data: result.screenshotBefore.data,
                mimeType: 'image/png',
              });
            }

            if (result.screenshotAfter) {
              content.push({
                type: 'image',
                data: result.screenshotAfter.data,
                mimeType: 'image/png',
              });
            }

            const summary = {
              deviceId: result.deviceId,
              actions: result.actions,
              output: result.output,
              screenshotBefore: result.screenshotBefore
                ? {
                    deviceId: result.screenshotBefore.deviceId,
                    width: result.screenshotBefore.width,
                    height: result.screenshotBefore.height,
                    timestamp: result.screenshotBefore.timestamp,
                  }
                : undefined,
              screenshotAfter: result.screenshotAfter
                ? {
                    deviceId: result.screenshotAfter.deviceId,
                    width: result.screenshotAfter.width,
                    height: result.screenshotAfter.height,
                    timestamp: result.screenshotAfter.timestamp,
                  }
                : undefined,
              uiDump: result.uiDump
                ? {
                    deviceId: result.uiDump.deviceId,
                    length: result.uiDump.length,
                    truncated: result.uiDump.truncated,
                    filePath: result.uiDump.filePath,
                  }
                : undefined,
              stepResults: result.stepResults,
            };

            content.push({
              type: 'text',
              text: JSON.stringify(summary),
            });

            return { content };
          }

          case 'tap_by_text': {
            const input = TapByTextInputSchema.parse(args);
            const result = await this.tapByText(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'tap_by_id': {
            const input = TapByIdInputSchema.parse(args);
            const result = await this.tapById(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'tap_by_desc': {
            const input = TapByDescInputSchema.parse(args);
            const result = await this.tapByDesc(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'wait_for_text': {
            const input = WaitForTextInputSchema.parse(args);
            const result = await this.waitForText(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'wait_for_text_disappear': {
            const input = WaitForTextDisappearInputSchema.parse(args);
            const result = await this.waitForTextDisappear(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'type_by_id': {
            const input = TypeByIdInputSchema.parse(args);
            const result = await this.typeById(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'wait_for_id': {
            const input = WaitForIdInputSchema.parse(args);
            const result = await this.waitForId(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'wait_for_id_disappear': {
            const input = WaitForIdDisappearInputSchema.parse(args);
            const result = await this.waitForIdDisappear(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'wait_for_desc': {
            const input = WaitForDescInputSchema.parse(args);
            const result = await this.waitForDesc(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'wait_for_activity': {
            const input = WaitForActivityInputSchema.parse(args);
            const result = await this.waitForActivity(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'wait_for_desc_disappear': {
            const input = WaitForDescDisappearInputSchema.parse(args);
            const result = await this.waitForDescDisappear(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'wait_for_activity_change': {
            const input = WaitForActivityChangeInputSchema.parse(args);
            const result = await this.waitForActivityChange(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'press_key_sequence': {
            const input = PressKeySequenceInputSchema.parse(args);
            const result = await this.pressKeySequence(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'tap_relative': {
            const input = TapRelativeInputSchema.parse(args);
            const result = await this.tapRelative(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'swipe_relative': {
            const input = SwipeRelativeInputSchema.parse(args);
            const result = await this.swipeRelative(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'scroll_vertical': {
            const input = ScrollVerticalInputSchema.parse(args);
            const result = await this.scrollVertical(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'scroll_horizontal': {
            const input = ScrollHorizontalInputSchema.parse(args);
            const result = await this.scrollHorizontal(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'tap_center': {
            const input = TapCenterInputSchema.parse(args);
            const result = await this.tapCenter(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'wait_for_ui_stable': {
            const input = WaitForUiStableInputSchema.parse(args);
            const result = await this.waitForUiStable(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'get_screen_hash': {
            const input = GetScreenHashInputSchema.parse(args);
            const result = await this.getScreenHash(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'long_press': {
            const input = LongPressInputSchema.parse(args);
            const result = await this.longPress(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'double_tap': {
            const input = DoubleTapInputSchema.parse(args);
            const result = await this.doubleTap(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'scroll_until_text': {
            const input = ScrollUntilTextInputSchema.parse(args);
            const result = await this.scrollUntilText(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'scroll_until_id': {
            const input = ScrollUntilIdInputSchema.parse(args);
            const result = await this.scrollUntilId(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'scroll_until_desc': {
            const input = ScrollUntilDescInputSchema.parse(args);
            const result = await this.scrollUntilDesc(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'wait_for_package': {
            const input = WaitForPackageInputSchema.parse(args);
            const result = await this.waitForPackage(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'run_flow_plan': {
            const input = RunFlowPlanInputSchema.parse(args);
            const result = await this.runFlowPlan(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'query_ui': {
            const input = QueryUiInputSchema.parse(args);
            const result = await this.queryUi(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'wait_for_node_count': {
            const input = WaitForNodeCountInputSchema.parse(args);
            const result = await this.waitForNodeCount(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'tap_by_selector_index': {
            const input = TapBySelectorIndexInputSchema.parse(args);
            const result = await this.tapBySelectorIndex(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'ui_dump_cached': {
            const input = UiDumpCachedInputSchema.parse(args);
            const result = await this.uiDumpCached(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'reverse_android_port': {
            const input = ReversePortInputSchema.parse(args);
            const result = await this.reversePort(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'forward_android_port': {
            const input = ForwardPortInputSchema.parse(args);
            const result = await this.forwardPort(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'get_android_logcat': {
            const input = GetLogcatInputSchema.parse(args);
            const result = await this.getLogcat(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'list_android_activities': {
            const input = ListActivitiesInputSchema.parse(args);
            const result = await this.listActivities(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          case 'hot_reload_android_app': {
            const input = HotReloadSetupInputSchema.parse(args);
            const result = await this.hotReload(input);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result),
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: formatErrorForResponse(error),
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async takeScreenshot(
    input: z.infer<typeof TakeScreenshotInputSchema>
  ): Promise<z.infer<typeof TakeScreenshotOutputSchema>> {
    const screenshot = await captureScreenshotResponse(input.deviceId);

    const result = {
      data: screenshot.data,
      format: screenshot.format,
      width: screenshot.width,
      height: screenshot.height,
      deviceId: screenshot.deviceId,
      timestamp: screenshot.timestamp,
    };

    return TakeScreenshotOutputSchema.parse(result);
  }

  private async listDevices(
    input: z.infer<typeof ListDevicesInputSchema>
  ): Promise<z.infer<typeof ListDevicesOutputSchema>> {
    const devices = getConnectedDevices();

    const result = {
      devices: devices.map(device => ({
        id: device.id,
        status: device.status,
        model: device.model,
        product: device.product,
        transportId: device.transportId,
        usb: device.usb,
        productString: device.productString,
      })),
    };

    return ListDevicesOutputSchema.parse(result);
  }

  private resolveDeviceIdInput(deviceId?: string, deviceAlias?: string): string {
    if (deviceAlias) {
      const resolved = this.deviceAliases.get(deviceAlias);
      if (!resolved) {
        throw new Error(`Unknown device alias '${deviceAlias}'`);
      }
      return resolveDeviceId(resolved);
    }
    return resolveDeviceId(deviceId);
  }

  private async setDeviceAlias(
    input: z.infer<typeof SetDeviceAliasInputSchema>
  ): Promise<z.infer<typeof SetDeviceAliasOutputSchema>> {
    const resolved = resolveDeviceId(input.deviceId);
    this.deviceAliases.set(input.alias, resolved);
    return SetDeviceAliasOutputSchema.parse({ alias: input.alias, deviceId: resolved });
  }

  private async resolveDeviceAlias(
    input: z.infer<typeof ResolveDeviceAliasInputSchema>
  ): Promise<z.infer<typeof ResolveDeviceAliasOutputSchema>> {
    const resolved = this.deviceAliases.get(input.alias);
    if (!resolved) {
      throw new Error(`Unknown device alias '${input.alias}'`);
    }
    return ResolveDeviceAliasOutputSchema.parse({ alias: input.alias, deviceId: resolved });
  }

  private async listDeviceAliases(
    _input: z.infer<typeof ListDeviceAliasesInputSchema>
  ): Promise<z.infer<typeof ListDeviceAliasesOutputSchema>> {
    const aliases: Record<string, string> = {};
    for (const [alias, deviceId] of this.deviceAliases.entries()) {
      aliases[alias] = deviceId;
    }
    return ListDeviceAliasesOutputSchema.parse({ aliases });
  }

  private async clearDeviceAlias(
    input: z.infer<typeof ClearDeviceAliasInputSchema>
  ): Promise<z.infer<typeof ClearDeviceAliasOutputSchema>> {
    const removed = this.deviceAliases.delete(input.alias);
    return ClearDeviceAliasOutputSchema.parse({ alias: input.alias, removed });
  }

  private async listImes(
    input: z.infer<typeof ListImesInputSchema>
  ): Promise<z.infer<typeof ListImesOutputSchema>> {
    const result = adbListImes(input.deviceId);
    return ListImesOutputSchema.parse(result);
  }

  private async setIme(
    input: z.infer<typeof SetImeInputSchema>
  ): Promise<z.infer<typeof SetImeOutputSchema>> {
    const result = adbSetIme(input.imeId, input.deviceId);
    return SetImeOutputSchema.parse(result);
  }

  private async enableIme(
    input: z.infer<typeof EnableImeInputSchema>
  ): Promise<z.infer<typeof EnableImeOutputSchema>> {
    const result = adbEnableIme(input.imeId, input.deviceId);
    return EnableImeOutputSchema.parse(result);
  }

  private async adbKeyboardInput(
    input: z.infer<typeof AdbKeyboardInputSchema>
  ): Promise<z.infer<typeof AdbKeyboardOutputSchema>> {
    const result = adbKeyboardInput(input.text, input.deviceId, {
      imeId: input.imeId,
      setIme: input.setIme,
      useBase64: input.useBase64,
    });
    return AdbKeyboardOutputSchema.parse(result);
  }

  private async adbKeyboardClearText(
    input: z.infer<typeof AdbKeyboardClearTextInputSchema>
  ): Promise<z.infer<typeof AdbKeyboardClearTextOutputSchema>> {
    const result = adbKeyboardClearText(input.deviceId, {
      imeId: input.imeId,
      setIme: input.setIme,
    });
    return AdbKeyboardClearTextOutputSchema.parse(result);
  }

  private async adbKeyboardInputCode(
    input: z.infer<typeof AdbKeyboardInputCodeInputSchema>
  ): Promise<z.infer<typeof AdbKeyboardInputCodeOutputSchema>> {
    const result = adbKeyboardInputCode(input.code, input.deviceId, {
      imeId: input.imeId,
      setIme: input.setIme,
    });
    return AdbKeyboardInputCodeOutputSchema.parse(result);
  }

  private async adbKeyboardEditorAction(
    input: z.infer<typeof AdbKeyboardEditorActionInputSchema>
  ): Promise<z.infer<typeof AdbKeyboardEditorActionOutputSchema>> {
    const result = adbKeyboardEditorAction(input.code, input.deviceId, {
      imeId: input.imeId,
      setIme: input.setIme,
    });
    return AdbKeyboardEditorActionOutputSchema.parse(result);
  }

  private async adbKeyboardInputChars(
    input: z.infer<typeof AdbKeyboardInputCharsInputSchema>
  ): Promise<z.infer<typeof AdbKeyboardInputCharsOutputSchema>> {
    const result = adbKeyboardInputChars(input.text, input.deviceId, {
      imeId: input.imeId,
      setIme: input.setIme,
    });
    return AdbKeyboardInputCharsOutputSchema.parse(result);
  }

  private async setAdbKeyboardMode(
    input: z.infer<typeof SetAdbKeyboardModeInputSchema>
  ): Promise<z.infer<typeof SetAdbKeyboardModeOutputSchema>> {
    const deviceId = resolveDeviceId(input.deviceId);
    const imeId = input.imeId ?? 'com.android.adbkeyboard/.AdbIME';

    if (input.enable !== false) {
      const previousIme = adbGetCurrentIme(deviceId);
      if (previousIme) {
        this.imeRestoreMap.set(deviceId, previousIme);
      }
      adbEnableIme(imeId, deviceId);
      const result = adbSetIme(imeId, deviceId);
      return SetAdbKeyboardModeOutputSchema.parse({
        deviceId,
        imeId,
        previousIme,
        output: result.output,
      });
    }

    const previousIme = this.imeRestoreMap.get(deviceId);
    if (!previousIme) {
      return SetAdbKeyboardModeOutputSchema.parse({
        deviceId,
        imeId,
        output: 'No previous IME stored',
      });
    }
    const result = adbSetIme(previousIme, deviceId);
    this.imeRestoreMap.delete(deviceId);
    return SetAdbKeyboardModeOutputSchema.parse({
      deviceId,
      imeId: previousIme,
      previousIme,
      output: result.output,
    });
  }

  private async smartLogin(
    input: z.infer<typeof SmartLoginInputSchema>
  ): Promise<z.infer<typeof SmartLoginOutputSchema>> {
    const result = adbSmartLogin({
      deviceId: input.deviceId,
      email: input.email,
      password: input.password,
      submitLabels: input.submitLabels,
      imeId: input.imeId,
      hideKeyboard: input.hideKeyboard,
    });
    return SmartLoginOutputSchema.parse(result);
  }

  private async detectLoginFields(
    input: z.infer<typeof DetectLoginFieldsInputSchema>
  ): Promise<z.infer<typeof DetectLoginFieldsOutputSchema>> {
    const result = adbDetectLoginFields({
      deviceId: input.deviceId,
      submitLabels: input.submitLabels,
    });
    return DetectLoginFieldsOutputSchema.parse(result);
  }

  private async smartLoginFast(
    input: z.infer<typeof SmartLoginFastInputSchema>
  ): Promise<z.infer<typeof SmartLoginFastOutputSchema>> {
    const result = adbSmartLoginFast({
      deviceId: input.deviceId,
      email: input.email,
      password: input.password,
      submitLabels: input.submitLabels,
      hideKeyboard: input.hideKeyboard,
      useAdbKeyboard: input.useAdbKeyboard,
    });
    return SmartLoginFastOutputSchema.parse(result);
  }

  private async getScreenshotWithThrottle(
    deviceId: string,
    throttleMs?: number
  ): Promise<z.infer<typeof TakeScreenshotOutputSchema>> {
    const cached = this.screenshotCache.get(deviceId);
    if (cached && typeof throttleMs === 'number' && throttleMs > 0) {
      if (Date.now() - cached.timestamp <= throttleMs) {
        return cached.shot;
      }
    }

    const shot = await captureScreenshotResponse(deviceId);
    this.screenshotCache.set(deviceId, { timestamp: Date.now(), shot });
    return shot;
  }

  private async findApk(
    input: z.infer<typeof FindApkInputSchema>
  ): Promise<z.infer<typeof FindApkOutputSchema>> {
    const result = adbFindApkInProject(input.projectRoot);
    return FindApkOutputSchema.parse(result);
  }

  private async installApk(
    input: z.infer<typeof InstallApkInputSchema>
  ): Promise<z.infer<typeof InstallApkOutputSchema>> {
    const apkPath = input.apkUrl ? await downloadApkFromUrl(input.apkUrl) : input.apkPath;
    const result = adbInstallApk(apkPath, input.deviceId, {
      projectRoot: input.projectRoot,
      reinstall: input.reinstall,
      grantPermissions: input.grantPermissions,
      allowTestPackages: input.allowTestPackages,
      allowDowngrade: input.allowDowngrade,
      timeoutMs: input.timeoutMs,
    });

    return InstallApkOutputSchema.parse({
      ...result,
      downloadedFrom: input.apkUrl,
    });
  }

  private async uninstallApp(
    input: z.infer<typeof UninstallAppInputSchema>
  ): Promise<z.infer<typeof UninstallAppOutputSchema>> {
    const result = adbUninstallApp(input.packageName, input.deviceId, {
      keepData: input.keepData,
    });

    return UninstallAppOutputSchema.parse(result);
  }

  private async startApp(
    input: z.infer<typeof StartAppInputSchema>
  ): Promise<z.infer<typeof StartAppOutputSchema>> {
    const result = adbStartApp(input.packageName, input.activity, input.deviceId);
    return StartAppOutputSchema.parse(result);
  }

  private async getCurrentActivity(
    input: z.infer<typeof GetCurrentActivityInputSchema>
  ): Promise<z.infer<typeof GetCurrentActivityOutputSchema>> {
    const result = adbGetCurrentActivity(input.deviceId);
    return GetCurrentActivityOutputSchema.parse(result);
  }

  private async getWindowSize(
    input: z.infer<typeof GetWindowSizeInputSchema>
  ): Promise<z.infer<typeof GetWindowSizeOutputSchema>> {
    const result = adbGetWindowSize(input.deviceId);
    return GetWindowSizeOutputSchema.parse(result);
  }

  private async listInstalledPackages(
    input: z.infer<typeof ListInstalledPackagesInputSchema>
  ): Promise<z.infer<typeof ListInstalledPackagesOutputSchema>> {
    const result = adbListInstalledPackages(input.deviceId, {
      filter: input.filter,
      thirdPartyOnly: input.thirdPartyOnly,
      systemOnly: input.systemOnly,
      disabledOnly: input.disabledOnly,
      enabledOnly: input.enabledOnly,
      includeUninstalled: input.includeUninstalled,
      user: input.user,
    });
    return ListInstalledPackagesOutputSchema.parse(result);
  }

  private async isAppInstalled(
    input: z.infer<typeof IsAppInstalledInputSchema>
  ): Promise<z.infer<typeof IsAppInstalledOutputSchema>> {
    const result = adbIsAppInstalled(input.packageName, input.deviceId);
    return IsAppInstalledOutputSchema.parse(result);
  }

  private async getAppVersion(
    input: z.infer<typeof GetAppVersionInputSchema>
  ): Promise<z.infer<typeof GetAppVersionOutputSchema>> {
    const result = adbGetAppVersion(input.packageName, input.deviceId);
    return GetAppVersionOutputSchema.parse(result);
  }

  private async getAndroidProperty(
    input: z.infer<typeof GetAndroidPropertyInputSchema>
  ): Promise<z.infer<typeof GetAndroidPropertyOutputSchema>> {
    const result = adbGetAndroidProperty(input.property, input.deviceId);
    return GetAndroidPropertyOutputSchema.parse(result);
  }

  private async getAndroidProperties(
    input: z.infer<typeof GetAndroidPropertiesInputSchema>
  ): Promise<z.infer<typeof GetAndroidPropertiesOutputSchema>> {
    const result = adbGetAndroidProperties(input.deviceId, { prefix: input.prefix });
    return GetAndroidPropertiesOutputSchema.parse(result);
  }

  private async openUrl(
    input: z.infer<typeof OpenUrlInputSchema>
  ): Promise<z.infer<typeof OpenUrlOutputSchema>> {
    const result = adbOpenUrl(input.url, input.deviceId);
    return OpenUrlOutputSchema.parse(result);
  }

  private async pasteClipboard(
    input: z.infer<typeof PasteClipboardInputSchema>
  ): Promise<z.infer<typeof PasteClipboardOutputSchema>> {
    const result = adbPasteClipboard(input.deviceId);
    return PasteClipboardOutputSchema.parse(result);
  }

  private async dumpUiHierarchy(
    input: z.infer<typeof DumpUiInputSchema>
  ): Promise<z.infer<typeof DumpUiOutputSchema>> {
    const result = adbDumpUiHierarchy(input.deviceId, { maxChars: input.maxChars });
    return DumpUiOutputSchema.parse(result);
  }

  private async stopApp(
    input: z.infer<typeof StopAppInputSchema>
  ): Promise<z.infer<typeof StopAppOutputSchema>> {
    const result = adbStopApp(input.packageName, input.deviceId);
    return StopAppOutputSchema.parse(result);
  }

  private async clearAppData(
    input: z.infer<typeof ClearAppDataInputSchema>
  ): Promise<z.infer<typeof ClearAppDataOutputSchema>> {
    const result = adbClearAppData(input.packageName, input.deviceId);
    return ClearAppDataOutputSchema.parse(result);
  }

  private async tapScreen(
    input: z.infer<typeof TapInputSchema>
  ): Promise<z.infer<typeof TapOutputSchema>> {
    const result = adbTapScreen(input.x, input.y, input.deviceId);
    return TapOutputSchema.parse(result);
  }

  private async swipeScreen(
    input: z.infer<typeof SwipeInputSchema>
  ): Promise<z.infer<typeof SwipeOutputSchema>> {
    const result = adbSwipeScreen(
      input.startX,
      input.startY,
      input.endX,
      input.endY,
      input.durationMs,
      input.deviceId
    );
    return SwipeOutputSchema.parse(result);
  }

  private async inputText(
    input: z.infer<typeof InputTextInputSchema>
  ): Promise<z.infer<typeof InputTextOutputSchema>> {
    const result = adbInputText(input.text, input.deviceId);
    return InputTextOutputSchema.parse(result);
  }

  private async sendKeyevent(
    input: z.infer<typeof KeyeventInputSchema>
  ): Promise<z.infer<typeof KeyeventOutputSchema>> {
    const result = adbSendKeyevent(input.keyCode, input.deviceId);
    return KeyeventOutputSchema.parse(result);
  }

  private async batchActions(
    input: z.infer<typeof BatchActionsInputSchema>
  ): Promise<z.infer<typeof BatchActionsOutputSchema>> {
    const targetDeviceId = resolveDeviceId(input.deviceId);
    let screenshotBefore;
    let screenshotAfter;

    if (input.captureBefore) {
      screenshotBefore = await captureScreenshotResponse(targetDeviceId);
    }

    const actions = [...input.actions];
    if (input.preActionWaitMs && input.preActionWaitMs > 0) {
      actions.unshift({ type: 'sleep', durationMs: input.preActionWaitMs });
    }

    const result = adbBatchInputActions(actions, targetDeviceId, {
      timeoutMs: input.timeoutMs,
      resolvedDeviceId: targetDeviceId,
    });

    if (input.captureAfter) {
      screenshotAfter = await captureScreenshotResponse(targetDeviceId);
    }

    return BatchActionsOutputSchema.parse({
      ...result,
      screenshotBefore,
      screenshotAfter,
    });
  }

  private async pm2StartHotMode(
    input: z.infer<typeof Pm2StartHotModeInputSchema>
  ): Promise<z.infer<typeof Pm2StartHotModeOutputSchema>> {
    const result = startPm2HotMode({
      configPath: input.configPath,
      projectRoot: input.projectRoot,
      appName: input.appName,
    });
    return Pm2StartHotModeOutputSchema.parse(result);
  }

  private async pm2StopApp(
    input: z.infer<typeof Pm2StopInputSchema>
  ): Promise<z.infer<typeof Pm2StopOutputSchema>> {
    const result = stopPm2App(input.appName);
    return Pm2StopOutputSchema.parse(result);
  }

  private async pm2List(
    _input: z.infer<typeof Pm2ListInputSchema>
  ): Promise<z.infer<typeof Pm2ListOutputSchema>> {
    const result = listPm2Apps();
    return Pm2ListOutputSchema.parse(result);
  }

  private async fastFlow(
    input: z.infer<typeof FastFlowInputSchema>
  ): Promise<z.infer<typeof FastFlowOutputSchema>> {
    const targetDeviceId = this.resolveDeviceIdInput(input.deviceId, input.deviceAlias);
    const actions = input.actions ? [...input.actions] : [];
    if (actions.length === 0 && (!input.steps || input.steps.length === 0)) {
      throw new Error('fast_flow requires at least one action or step.');
    }
    let screenshotBefore;
    let screenshotAfter;
    let uiDump;
    let stepResults;

    if (input.captureBefore) {
      screenshotBefore = await this.getScreenshotWithThrottle(
        targetDeviceId,
        input.screenshotThrottleMs
      );
    }

    if (input.preActionWaitMs && input.preActionWaitMs > 0) {
      actions.unshift({ type: 'sleep', durationMs: input.preActionWaitMs });
    }

    if (input.postActionWaitMs && input.postActionWaitMs > 0 && actions.length > 0) {
      actions.push({ type: 'sleep', durationMs: input.postActionWaitMs });
    }

    if (input.steps && input.steps.length > 0) {
      stepResults = [];
      const retries = input.stepRetries ?? 0;
      for (const step of input.steps) {
        let lastResult: z.infer<typeof RunFlowPlanOutputSchema> | undefined;
        let attempt = 0;
        while (attempt <= retries) {
          lastResult = adbRunFlowPlan([step], targetDeviceId, { stopOnFailure: true });
          const stepResult = lastResult.steps[0];
          if (stepResult?.ok) {
            stepResults.push(stepResult);
            break;
          }
          attempt += 1;
          if (attempt > retries) {
            if (stepResult) {
              stepResults.push(stepResult);
            }
            break;
          }
          if (input.retryDelayMs && input.retryDelayMs > 0) {
            adbBatchInputActions(
              [{ type: 'sleep', durationMs: input.retryDelayMs }],
              targetDeviceId,
              { timeoutMs: input.timeoutMs, resolvedDeviceId: targetDeviceId }
            );
          }
        }

        const lastStep = stepResults[stepResults.length - 1];
        if (input.stepRetries !== undefined && input.stepRetries >= 0 && lastStep && !lastStep.ok) {
          break;
        }
      }
    }

    const result =
      actions.length > 0
        ? adbBatchInputActions(actions, targetDeviceId, {
            timeoutMs: input.timeoutMs,
            resolvedDeviceId: targetDeviceId,
          })
        : { deviceId: targetDeviceId, actions: [], output: '' };

    if (input.captureAfter) {
      screenshotAfter = await this.getScreenshotWithThrottle(
        targetDeviceId,
        input.screenshotThrottleMs
      );
    }

    if (input.includeUiDump) {
      uiDump = adbDumpUiHierarchy(targetDeviceId, { maxChars: input.uiDumpMaxChars });
    }

    return FastFlowOutputSchema.parse({
      ...result,
      screenshotBefore,
      screenshotAfter,
      uiDump,
      stepResults,
    });
  }

  private async tapByText(
    input: z.infer<typeof TapByTextInputSchema>
  ): Promise<z.infer<typeof TapByTextOutputSchema>> {
    const result = adbTapByText(input.text, input.deviceId, {
      matchMode: input.matchMode,
      index: input.index,
    });
    return TapByTextOutputSchema.parse(result);
  }

  private async tapById(
    input: z.infer<typeof TapByIdInputSchema>
  ): Promise<z.infer<typeof TapByIdOutputSchema>> {
    const result = adbTapById(input.resourceId, input.deviceId, {
      index: input.index,
    });
    return TapByIdOutputSchema.parse(result);
  }

  private async tapByDesc(
    input: z.infer<typeof TapByDescInputSchema>
  ): Promise<z.infer<typeof TapByDescOutputSchema>> {
    const result = adbTapByDesc(input.contentDesc, input.deviceId, {
      matchMode: input.matchMode,
      index: input.index,
    });
    return TapByDescOutputSchema.parse(result);
  }

  private async waitForText(
    input: z.infer<typeof WaitForTextInputSchema>
  ): Promise<z.infer<typeof WaitForTextOutputSchema>> {
    const result = adbWaitForText(input.text, input.deviceId, {
      matchMode: input.matchMode,
      timeoutMs: input.timeoutMs,
      intervalMs: input.intervalMs,
    });
    return WaitForTextOutputSchema.parse(result);
  }

  private async waitForTextDisappear(
    input: z.infer<typeof WaitForTextDisappearInputSchema>
  ): Promise<z.infer<typeof WaitForTextDisappearOutputSchema>> {
    const result = adbWaitForTextDisappear(input.text, input.deviceId, {
      matchMode: input.matchMode,
      timeoutMs: input.timeoutMs,
      intervalMs: input.intervalMs,
    });
    return WaitForTextDisappearOutputSchema.parse(result);
  }

  private async typeById(
    input: z.infer<typeof TypeByIdInputSchema>
  ): Promise<z.infer<typeof TypeByIdOutputSchema>> {
    const result = adbTypeById(input.resourceId, input.text, input.deviceId, {
      matchMode: input.matchMode,
      index: input.index,
    });
    return TypeByIdOutputSchema.parse(result);
  }

  private async waitForId(
    input: z.infer<typeof WaitForIdInputSchema>
  ): Promise<z.infer<typeof WaitForIdOutputSchema>> {
    const result = adbWaitForId(input.resourceId, input.deviceId, {
      matchMode: input.matchMode,
      timeoutMs: input.timeoutMs,
      intervalMs: input.intervalMs,
    });
    return WaitForIdOutputSchema.parse(result);
  }

  private async waitForIdDisappear(
    input: z.infer<typeof WaitForIdDisappearInputSchema>
  ): Promise<z.infer<typeof WaitForIdDisappearOutputSchema>> {
    const result = adbWaitForIdDisappear(input.resourceId, input.deviceId, {
      matchMode: input.matchMode,
      timeoutMs: input.timeoutMs,
      intervalMs: input.intervalMs,
    });
    return WaitForIdDisappearOutputSchema.parse(result);
  }

  private async waitForDesc(
    input: z.infer<typeof WaitForDescInputSchema>
  ): Promise<z.infer<typeof WaitForDescOutputSchema>> {
    const result = adbWaitForDesc(input.contentDesc, input.deviceId, {
      matchMode: input.matchMode,
      timeoutMs: input.timeoutMs,
      intervalMs: input.intervalMs,
    });
    return WaitForDescOutputSchema.parse(result);
  }

  private async waitForDescDisappear(
    input: z.infer<typeof WaitForDescDisappearInputSchema>
  ): Promise<z.infer<typeof WaitForDescDisappearOutputSchema>> {
    const result = adbWaitForDescDisappear(input.contentDesc, input.deviceId, {
      matchMode: input.matchMode,
      timeoutMs: input.timeoutMs,
      intervalMs: input.intervalMs,
    });
    return WaitForDescDisappearOutputSchema.parse(result);
  }

  private async waitForActivity(
    input: z.infer<typeof WaitForActivityInputSchema>
  ): Promise<z.infer<typeof WaitForActivityOutputSchema>> {
    const result = adbWaitForActivity(input.activity, input.deviceId, {
      matchMode: input.matchMode,
      timeoutMs: input.timeoutMs,
      intervalMs: input.intervalMs,
    });
    return WaitForActivityOutputSchema.parse(result);
  }

  private async waitForActivityChange(
    input: z.infer<typeof WaitForActivityChangeInputSchema>
  ): Promise<z.infer<typeof WaitForActivityChangeOutputSchema>> {
    const result = adbWaitForActivityChange(input.deviceId, {
      previousActivity: input.previousActivity,
      targetActivity: input.targetActivity,
      matchMode: input.matchMode,
      timeoutMs: input.timeoutMs,
      intervalMs: input.intervalMs,
    });
    return WaitForActivityChangeOutputSchema.parse(result);
  }

  private async pressKeySequence(
    input: z.infer<typeof PressKeySequenceInputSchema>
  ): Promise<z.infer<typeof PressKeySequenceOutputSchema>> {
    const result = adbPressKeySequence(input.keyCodes, input.deviceId, {
      intervalMs: input.intervalMs,
      timeoutMs: input.timeoutMs,
    });
    return PressKeySequenceOutputSchema.parse(result);
  }

  private async tapRelative(
    input: z.infer<typeof TapRelativeInputSchema>
  ): Promise<z.infer<typeof TapRelativeOutputSchema>> {
    const result = adbTapRelative(input.xPercent, input.yPercent, input.deviceId);
    return TapRelativeOutputSchema.parse(result);
  }

  private async swipeRelative(
    input: z.infer<typeof SwipeRelativeInputSchema>
  ): Promise<z.infer<typeof SwipeRelativeOutputSchema>> {
    const result = adbSwipeRelative(
      input.startXPercent,
      input.startYPercent,
      input.endXPercent,
      input.endYPercent,
      input.deviceId,
      input.durationMs
    );
    return SwipeRelativeOutputSchema.parse(result);
  }

  private async scrollVertical(
    input: z.infer<typeof ScrollVerticalInputSchema>
  ): Promise<z.infer<typeof ScrollVerticalOutputSchema>> {
    const result = adbScrollVertical(input.direction, input.deviceId, {
      distancePercent: input.distancePercent,
      durationMs: input.durationMs,
      startXPercent: input.startXPercent,
    });
    return ScrollVerticalOutputSchema.parse(result);
  }

  private async scrollHorizontal(
    input: z.infer<typeof ScrollHorizontalInputSchema>
  ): Promise<z.infer<typeof ScrollHorizontalOutputSchema>> {
    const result = adbScrollHorizontal(input.direction, input.deviceId, {
      distancePercent: input.distancePercent,
      durationMs: input.durationMs,
      startYPercent: input.startYPercent,
    });
    return ScrollHorizontalOutputSchema.parse(result);
  }

  private async tapCenter(
    input: z.infer<typeof TapCenterInputSchema>
  ): Promise<z.infer<typeof TapCenterOutputSchema>> {
    const result = adbTapCenter(input.deviceId);
    return TapCenterOutputSchema.parse(result);
  }

  private async longPress(
    input: z.infer<typeof LongPressInputSchema>
  ): Promise<z.infer<typeof LongPressOutputSchema>> {
    const result = adbLongPress(input.x, input.y, input.deviceId, {
      durationMs: input.durationMs,
    });
    return LongPressOutputSchema.parse(result);
  }

  private async doubleTap(
    input: z.infer<typeof DoubleTapInputSchema>
  ): Promise<z.infer<typeof DoubleTapOutputSchema>> {
    const result = adbDoubleTap(input.x, input.y, input.deviceId, {
      intervalMs: input.intervalMs,
    });
    return DoubleTapOutputSchema.parse(result);
  }

  private async waitForUiStable(
    input: z.infer<typeof WaitForUiStableInputSchema>
  ): Promise<z.infer<typeof WaitForUiStableOutputSchema>> {
    const result = adbWaitForUiStable(input.deviceId, {
      stableIterations: input.stableIterations,
      intervalMs: input.intervalMs,
      timeoutMs: input.timeoutMs,
    });
    return WaitForUiStableOutputSchema.parse(result);
  }

  private async getScreenHash(
    input: z.infer<typeof GetScreenHashInputSchema>
  ): Promise<z.infer<typeof GetScreenHashOutputSchema>> {
    const result = adbGetScreenHash(input.deviceId);
    return GetScreenHashOutputSchema.parse(result);
  }

  private async scrollUntilText(
    input: z.infer<typeof ScrollUntilTextInputSchema>
  ): Promise<z.infer<typeof ScrollUntilTextOutputSchema>> {
    const result = adbScrollUntilText(input.text, input.deviceId, {
      matchMode: input.matchMode,
      direction: input.direction,
      distancePercent: input.distancePercent,
      maxScrolls: input.maxScrolls,
      intervalMs: input.intervalMs,
    });
    return ScrollUntilTextOutputSchema.parse(result);
  }

  private async scrollUntilId(
    input: z.infer<typeof ScrollUntilIdInputSchema>
  ): Promise<z.infer<typeof ScrollUntilIdOutputSchema>> {
    const result = adbScrollUntilId(input.resourceId, input.deviceId, {
      matchMode: input.matchMode,
      direction: input.direction,
      distancePercent: input.distancePercent,
      maxScrolls: input.maxScrolls,
      intervalMs: input.intervalMs,
    });
    return ScrollUntilIdOutputSchema.parse(result);
  }

  private async scrollUntilDesc(
    input: z.infer<typeof ScrollUntilDescInputSchema>
  ): Promise<z.infer<typeof ScrollUntilDescOutputSchema>> {
    const result = adbScrollUntilDesc(input.contentDesc, input.deviceId, {
      matchMode: input.matchMode,
      direction: input.direction,
      distancePercent: input.distancePercent,
      maxScrolls: input.maxScrolls,
      intervalMs: input.intervalMs,
    });
    return ScrollUntilDescOutputSchema.parse(result);
  }

  private async waitForPackage(
    input: z.infer<typeof WaitForPackageInputSchema>
  ): Promise<z.infer<typeof WaitForPackageOutputSchema>> {
    const result = adbWaitForPackage(input.packageName, input.deviceId, {
      timeoutMs: input.timeoutMs,
      intervalMs: input.intervalMs,
    });
    return WaitForPackageOutputSchema.parse(result);
  }

  private async runFlowPlan(
    input: z.infer<typeof RunFlowPlanInputSchema>
  ): Promise<z.infer<typeof RunFlowPlanOutputSchema>> {
    const targetDeviceId = this.resolveDeviceIdInput(input.deviceId, input.deviceAlias);
    const result = adbRunFlowPlan(input.steps, targetDeviceId, {
      stopOnFailure: input.stopOnFailure,
    });
    return RunFlowPlanOutputSchema.parse(result);
  }

  private async queryUi(
    input: z.infer<typeof QueryUiInputSchema>
  ): Promise<z.infer<typeof QueryUiOutputSchema>> {
    const selector = UiSelectorSchema.parse(input.selector);
    const result = adbQueryUi(selector, input.deviceId, { maxResults: input.maxResults });
    return QueryUiOutputSchema.parse(result);
  }

  private async waitForNodeCount(
    input: z.infer<typeof WaitForNodeCountInputSchema>
  ): Promise<z.infer<typeof WaitForNodeCountOutputSchema>> {
    const selector = UiSelectorSchema.parse(input.selector);
    const result = adbWaitForNodeCount(
      selector,
      input.count,
      input.comparator,
      input.deviceId,
      {
        timeoutMs: input.timeoutMs,
        intervalMs: input.intervalMs,
      }
    );
    return WaitForNodeCountOutputSchema.parse(result);
  }

  private async tapBySelectorIndex(
    input: z.infer<typeof TapBySelectorIndexInputSchema>
  ): Promise<z.infer<typeof TapBySelectorIndexOutputSchema>> {
    const selector = UiSelectorSchema.parse(input.selector);
    const result = adbTapBySelectorIndex(selector, input.index ?? 0, input.deviceId);
    return TapBySelectorIndexOutputSchema.parse(result);
  }

  private async uiDumpCached(
    input: z.infer<typeof UiDumpCachedInputSchema>
  ): Promise<z.infer<typeof UiDumpCachedOutputSchema>> {
    const result = adbGetCachedUiDump(input.deviceId, { maxChars: input.maxChars });
    return UiDumpCachedOutputSchema.parse(result);
  }

  private async reversePort(
    input: z.infer<typeof ReversePortInputSchema>
  ): Promise<z.infer<typeof ReversePortOutputSchema>> {
    const result = adbReversePort(input.devicePort, input.hostPort, input.deviceId);
    return ReversePortOutputSchema.parse(result);
  }

  private async forwardPort(
    input: z.infer<typeof ForwardPortInputSchema>
  ): Promise<z.infer<typeof ForwardPortOutputSchema>> {
    const result = adbForwardPort(input.devicePort, input.hostPort, input.deviceId);
    return ForwardPortOutputSchema.parse(result);
  }

  private async getLogcat(
    input: z.infer<typeof GetLogcatInputSchema>
  ): Promise<z.infer<typeof GetLogcatOutputSchema>> {
    const result = adbGetLogcat({
      deviceId: input.deviceId,
      lines: input.lines,
      since: input.since,
      tag: input.tag,
      priority: input.priority,
      pid: input.pid,
      packageName: input.packageName,
      format: input.format,
    });
    return GetLogcatOutputSchema.parse(result);
  }

  private async listActivities(
    input: z.infer<typeof ListActivitiesInputSchema>
  ): Promise<z.infer<typeof ListActivitiesOutputSchema>> {
    const result = adbListPackageActivities(input.packageName, input.deviceId);
    return ListActivitiesOutputSchema.parse(result);
  }

  private async hotReload(
    input: z.infer<typeof HotReloadSetupInputSchema>
  ): Promise<z.infer<typeof HotReloadSetupOutputSchema>> {
    const result = adbHotReloadSetup({
      deviceId: input.deviceId,
      packageName: input.packageName,
      activity: input.activity,
      apkPath: input.apkPath,
      projectRoot: input.projectRoot,
      reversePorts: input.reversePorts,
      install: input.install,
      start: input.start,
      stopBeforeStart: input.stopBeforeStart,
      reinstall: input.reinstall,
      grantPermissions: input.grantPermissions,
      allowTestPackages: input.allowTestPackages,
      allowDowngrade: input.allowDowngrade,
      timeoutMs: input.timeoutMs,
      playProtectAction: input.playProtectAction,
      playProtectMaxWaitMs: input.playProtectMaxWaitMs,
    });
    return HotReloadSetupOutputSchema.parse(result);
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('The Android MCP server started');
  }
}

// Export the server class
export { AndroidMcpServer };

// Main entry point
async function main() {
  const server = new AndroidMcpServer();
  await server.run();
}

// Run the server if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Server error:', error);
    process.exit(1);
  });
}
