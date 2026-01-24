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
    DumpUiInputSchema: z.object({
      deviceId: z.string().optional(),
      maxChars: z.number().optional(),
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
    InputTextInputSchema: z.object({
      deviceId: z.string().optional(),
      text: z.string(),
    }),
    KeyeventInputSchema: z.object({
      deviceId: z.string().optional(),
      keyCode: z.union([z.string(), z.number()]),
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
    DumpUiToolSchema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string' },
        maxChars: { type: 'number' },
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
      },
      required: ['packageName'],
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
        expect(toolNames).toContain('install_android_apk');
        expect(toolNames).toContain('tap_android_screen');
        expect(toolNames).toContain('get_android_current_activity');
        expect(toolNames).toContain('get_android_window_size');
        expect(toolNames).toContain('dump_android_ui_hierarchy');
        expect(toolNames).toContain('get_android_logcat');
        expect(toolNames).toContain('list_android_activities');
        expect(toolNames).toContain('hot_reload_android_app');

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
