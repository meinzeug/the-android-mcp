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
  TypeByIdInputSchema,
  TypeByIdOutputSchema,
  TypeByIdToolSchema,
  WaitForIdInputSchema,
  WaitForIdOutputSchema,
  WaitForIdToolSchema,
  WaitForDescInputSchema,
  WaitForDescOutputSchema,
  WaitForDescToolSchema,
  WaitForActivityInputSchema,
  WaitForActivityOutputSchema,
  WaitForActivityToolSchema,
  PressKeySequenceInputSchema,
  PressKeySequenceOutputSchema,
  PressKeySequenceToolSchema,
  TapRelativeInputSchema,
  TapRelativeOutputSchema,
  TapRelativeToolSchema,
  SwipeRelativeInputSchema,
  SwipeRelativeOutputSchema,
  SwipeRelativeToolSchema,
  TapCenterInputSchema,
  TapCenterOutputSchema,
  TapCenterToolSchema,
  WaitForUiStableInputSchema,
  WaitForUiStableOutputSchema,
  WaitForUiStableToolSchema,
  GetScreenHashInputSchema,
  GetScreenHashOutputSchema,
  GetScreenHashToolSchema,
  WaitForPackageInputSchema,
  WaitForPackageOutputSchema,
  WaitForPackageToolSchema,
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
  uninstallApp as adbUninstallApp,
} from './utils/adb.js';
import { listPm2Apps, startPm2HotMode, stopPm2App } from './utils/pm2.js';
import { downloadApkFromUrl } from './utils/download.js';
import { formatErrorForResponse } from './utils/error.js';

class AndroidMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'the-android-mcp',
        version: '0.1.13',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

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
          name: 'wait_for_desc',
          description: 'Wait for UI content-desc to appear via UI dump polling',
          inputSchema: WaitForDescToolSchema,
        },
        {
          name: 'wait_for_activity',
          description: 'Wait for current activity/component',
          inputSchema: WaitForActivityToolSchema,
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
          name: 'tap_center',
          description: 'Tap the center of the screen',
          inputSchema: TapCenterToolSchema,
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
          name: 'wait_for_package',
          description: 'Wait for a package to be in the foreground',
          inputSchema: WaitForPackageToolSchema,
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

    const result = adbBatchInputActions(input.actions, targetDeviceId, {
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
    const targetDeviceId = resolveDeviceId(input.deviceId);
    const actions = [...input.actions];
    let screenshotBefore;
    let screenshotAfter;
    let uiDump;

    if (input.captureBefore) {
      screenshotBefore = await captureScreenshotResponse(targetDeviceId);
    }

    if (input.postActionWaitMs && input.postActionWaitMs > 0) {
      actions.push({ type: 'sleep', durationMs: input.postActionWaitMs });
    }

    const result = adbBatchInputActions(actions, targetDeviceId, {
      timeoutMs: input.timeoutMs,
      resolvedDeviceId: targetDeviceId,
    });

    if (input.captureAfter) {
      screenshotAfter = await captureScreenshotResponse(targetDeviceId);
    }

    if (input.includeUiDump) {
      uiDump = adbDumpUiHierarchy(targetDeviceId, { maxChars: input.uiDumpMaxChars });
    }

    return FastFlowOutputSchema.parse({
      ...result,
      screenshotBefore,
      screenshotAfter,
      uiDump,
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

  private async tapCenter(
    input: z.infer<typeof TapCenterInputSchema>
  ): Promise<z.infer<typeof TapCenterOutputSchema>> {
    const result = adbTapCenter(input.deviceId);
    return TapCenterOutputSchema.parse(result);
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

  private async waitForPackage(
    input: z.infer<typeof WaitForPackageInputSchema>
  ): Promise<z.infer<typeof WaitForPackageOutputSchema>> {
    const result = adbWaitForPackage(input.packageName, input.deviceId, {
      timeoutMs: input.timeoutMs,
      intervalMs: input.intervalMs,
    });
    return WaitForPackageOutputSchema.parse(result);
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
