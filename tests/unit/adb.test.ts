import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  checkADBInstalled,
  executeADBCommand,
  parseDeviceList,
  getConnectedDevices,
  getFirstAvailableDevice,
  captureScreenshot,
  dumpUiHierarchy,
  getDeviceInfo,
  getCurrentActivity,
  getWindowSize,
  findApkInProject,
  installApk,
  inputText,
  getLogcat,
  listPackageActivities,
} from '../../src/utils/adb';
import { ADBNotFoundError, DeviceNotFoundError, NoDevicesFoundError } from '../../src/types';

// Mock execSync
jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

describe('ADB Utilities', () => {
  const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
  const ADB_EXEC_OPTIONS = { stdio: 'pipe', timeout: 5000, maxBuffer: 50 * 1024 * 1024 };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkADBInstalled', () => {
    it('should return true if ADB is installed', () => {
      mockExecSync.mockReturnValue(Buffer.from('Android Debug Bridge version 1.0.41'));

      const result = checkADBInstalled();

      expect(result).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith('adb version', { stdio: 'pipe', timeout: 5000 });
    });

    it('should return false if ADB is not installed', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Command not found');
      });

      const result = checkADBInstalled();

      expect(result).toBe(false);
    });
  });

  describe('executeADBCommand', () => {
    it('should execute ADB command successfully', () => {
      mockExecSync.mockReturnValue(Buffer.from('List of devices attached'));

      const result = executeADBCommand('devices');

      expect(result).toBe('List of devices attached');
      expect(mockExecSync).toHaveBeenCalledWith('adb devices', ADB_EXEC_OPTIONS);
    });

    it('should throw ADBNotFoundError if ADB is not installed', () => {
      // Mock execSync to simulate ADB not found
      mockExecSync.mockImplementation(() => {
        throw new Error('Command not found');
      });

      expect(() => executeADBCommand('devices')).toThrow(ADBNotFoundError);
    });

    it('should throw ADBCommandError if command fails', () => {
      // First call for ADB version check succeeds
      mockExecSync.mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41'));
      // Second call for the actual command fails
      mockExecSync.mockImplementationOnce(() => {
        const error = new Error('Command failed') as any;
        error.status = 1;
        error.stdout = '';
        throw error;
      });

      expect(() => executeADBCommand('invalid-command')).toThrow(
        'ADB command failed: Command failed'
      );
    });

    it('should return stdout even if command returns error status 1', () => {
      // First call for ADB version check succeeds
      mockExecSync.mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41'));
      // Second call returns error with stdout
      const error = new Error('Command failed') as any;
      error.status = 1;
      error.stdout = Buffer.from('Some output');
      mockExecSync.mockImplementationOnce(() => {
        throw error;
      });

      const result = executeADBCommand('devices');

      expect(result).toBe('Some output');
    });
  });

  describe('parseDeviceList', () => {
    it('should parse device list correctly', () => {
      const output = `List of devices attached
emulator-5554	device product:sdk_gphone_x86 model:sdk_gphone_x86 device:generic_x86 transport_id:1
192.168.1.100:5555	unauthorized product:pixel model:pixel device:pixel transport_id:2`;

      const devices = parseDeviceList(output);

      expect(devices).toHaveLength(2);
      expect(devices[0]).toEqual({
        id: 'emulator-5554',
        status: 'device',
        product: 'sdk_gphone_x86',
        model: 'sdk_gphone_x86',
        transportId: '1',
      });
      expect(devices[1]).toEqual({
        id: '192.168.1.100:5555',
        status: 'unauthorized',
        product: 'pixel',
        model: 'pixel',
        transportId: '2',
      });
    });

    it('should return empty array for empty device list', () => {
      const output = 'List of devices attached';

      const devices = parseDeviceList(output);

      expect(devices).toHaveLength(0);
    });

    it('should handle malformed lines gracefully', () => {
      const output = `List of devices attached
emulator-5554	device
malformed-line
192.168.1.100:5555	unauthorized`;

      const devices = parseDeviceList(output);

      expect(devices).toHaveLength(2);
      expect(devices[0].id).toBe('emulator-5554');
      expect(devices[1].id).toBe('192.168.1.100:5555');
    });
  });

  describe('getConnectedDevices', () => {
    it('should return list of connected devices', () => {
      const output = `List of devices attached
emulator-5554	device product:sdk_gphone_x86 model:sdk_gphone_x86 transport_id:1`;

      mockExecSync
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check
        .mockReturnValueOnce(Buffer.from(output)); // devices -l call

      const devices = getConnectedDevices();

      expect(devices).toHaveLength(1);
      expect(devices[0].id).toBe('emulator-5554');
      expect(mockExecSync).toHaveBeenCalledWith('adb devices -l', ADB_EXEC_OPTIONS);
    });

    it('should throw NoDevicesFoundError if no devices are connected', () => {
      const output = 'List of devices attached';

      mockExecSync
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check
        .mockReturnValueOnce(Buffer.from(output)); // devices -l call

      expect(() => getConnectedDevices()).toThrow(NoDevicesFoundError);
    });

    it('should throw ADBCommandError if command fails', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Command failed');
      });

      expect(() => getConnectedDevices()).toThrow('Failed to list connected devices');
    });
  });

  describe('getFirstAvailableDevice', () => {
    it('should return the first available device', () => {
      const output = `List of devices attached
emulator-5554	device product:sdk_gphone_x86
192.168.1.100:5555	unauthorized product:pixel`;

      mockExecSync
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check
        .mockReturnValueOnce(Buffer.from(output)); // devices -l call

      const device = getFirstAvailableDevice();

      expect(device.id).toBe('emulator-5554');
      expect(device.status).toBe('device');
    });

    it('should throw ADBCommandError if no available devices', () => {
      const output = `List of devices attached
192.168.1.100:5555	unauthorized product:pixel`;

      mockExecSync
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check
        .mockReturnValueOnce(Buffer.from(output)); // devices -l call

      expect(() => getFirstAvailableDevice()).toThrow('No available devices found');
    });
  });

  describe('captureScreenshot', () => {
    it('should capture screenshot from specified device', () => {
      const deviceListOutput = `List of devices attached
emulator-5554	device product:sdk_gphone_x86`;

      const screenshotOutput = Buffer.from('fake-png-data'); // Simulate PNG data

      mockExecSync
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check for getConnectedDevices
        .mockReturnValueOnce(Buffer.from(deviceListOutput)) // devices -l call
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check for screenshot
        .mockReturnValueOnce(screenshotOutput); // screenshot capture

      const screenshot = captureScreenshot('emulator-5554');

      expect(screenshot).toEqual(screenshotOutput);
      expect(mockExecSync).toHaveBeenCalledWith('adb devices -l', ADB_EXEC_OPTIONS);
      expect(mockExecSync).toHaveBeenCalledWith(
        'adb -s emulator-5554 exec-out screencap -p',
        ADB_EXEC_OPTIONS
      );
    });

    it('should capture screenshot from first available device if no deviceId specified', () => {
      const deviceListOutput = `List of devices attached
emulator-5554	device product:sdk_gphone_x86`;

      const screenshotOutput = Buffer.from('fake-png-data'); // Simulate PNG data

      mockExecSync
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check for getFirstAvailableDevice
        .mockReturnValueOnce(Buffer.from(deviceListOutput)) // devices -l call
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check for screenshot
        .mockReturnValueOnce(screenshotOutput); // screenshot capture

      const screenshot = captureScreenshot();

      expect(screenshot).toEqual(screenshotOutput);
      expect(mockExecSync).toHaveBeenCalledWith(
        'adb -s emulator-5554 exec-out screencap -p',
        ADB_EXEC_OPTIONS
      );
    });

    it('should throw DeviceNotFoundError if device does not exist', () => {
      const deviceListOutput = `List of devices attached
emulator-5554	device product:sdk_gphone_x86`;

      mockExecSync
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check
        .mockReturnValueOnce(Buffer.from(deviceListOutput)); // devices -l call

      expect(() => captureScreenshot('nonexistent-device')).toThrow(DeviceNotFoundError);
    });

    it('should throw ADBCommandError if device is not available', () => {
      const deviceListOutput = `List of devices attached
emulator-5554	unauthorized product:sdk_gphone_x86`;

      mockExecSync
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check
        .mockReturnValueOnce(Buffer.from(deviceListOutput)); // devices -l call

      expect(() => captureScreenshot('emulator-5554')).toThrow(
        "Device 'emulator-5554' is not available"
      );
    });
  });

  describe('getDeviceInfo', () => {
    it('should return device information for specified device', () => {
      const deviceListOutput = `List of devices attached
emulator-5554	device product:sdk_gphone_x86 model:sdk_gphone_x86 transport_id:1`;

      mockExecSync
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check
        .mockReturnValueOnce(Buffer.from(deviceListOutput)); // devices -l call

      const deviceInfo = getDeviceInfo('emulator-5554');

      expect(deviceInfo).toEqual({
        id: 'emulator-5554',
        status: 'device',
        product: 'sdk_gphone_x86',
        model: 'sdk_gphone_x86',
        transportId: '1',
      });
    });

    it('should throw DeviceNotFoundError if device does not exist', () => {
      const deviceListOutput = `List of devices attached
emulator-5554	device product:sdk_gphone_x86`;

      mockExecSync
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check
        .mockReturnValueOnce(Buffer.from(deviceListOutput)); // devices -l call

      expect(() => getDeviceInfo('nonexistent-device')).toThrow(DeviceNotFoundError);
    });
  });

  describe('findApkInProject', () => {
    it('should find the most recent APK in common build output folders', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'the-android-mcp-'));
      const apkDir = path.join(tempDir, 'app', 'build', 'outputs', 'apk', 'debug');
      fs.mkdirSync(apkDir, { recursive: true });

      const olderApk = path.join(apkDir, 'app-debug-old.apk');
      const newerApk = path.join(apkDir, 'app-debug-new.apk');
      fs.writeFileSync(olderApk, 'old');
      fs.writeFileSync(newerApk, 'new');

      const now = new Date();
      const earlier = new Date(now.getTime() - 60_000);
      fs.utimesSync(olderApk, earlier, earlier);
      fs.utimesSync(newerApk, now, now);

      try {
        const result = findApkInProject(tempDir);
        expect(result.apkPath).toBe(newerApk);
        expect(result.candidates).toContain(olderApk);
        expect(result.candidates).toContain(newerApk);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('installApk', () => {
    it('should install APK on specified device with default flags', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'the-android-mcp-'));
      const apkPath = path.join(tempDir, 'app-debug.apk');
      fs.writeFileSync(apkPath, 'apk');

      const deviceListOutput = `List of devices attached
emulator-5554\tdevice product:sdk_gphone_x86`;

      mockExecSync
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check
        .mockReturnValueOnce(Buffer.from(deviceListOutput)) // devices -l call
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check
        .mockReturnValueOnce(Buffer.from('Success')); // install output

      try {
        const result = installApk(apkPath, 'emulator-5554');
        expect(result.success).toBe(true);

        const installCall = mockExecSync.mock.calls.find(call =>
          String(call[0]).includes('install')
        );
        expect(installCall).toBeDefined();
        expect(String(installCall?.[0])).toContain('-s emulator-5554 install -r -g');
        expect(String(installCall?.[0])).toContain(apkPath);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('inputText', () => {
    it('should encode spaces for adb input text', () => {
      const deviceListOutput = `List of devices attached
emulator-5554\tdevice product:sdk_gphone_x86`;

      mockExecSync
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check
        .mockReturnValueOnce(Buffer.from(deviceListOutput)) // devices -l call
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check
        .mockReturnValueOnce(Buffer.from('')); // input text output

      inputText('Hello World', 'emulator-5554');

      const inputCall = mockExecSync.mock.calls.find(call =>
        String(call[0]).includes('input text')
      );
      expect(inputCall).toBeDefined();
      expect(String(inputCall?.[0])).toContain("input text 'Hello%sWorld'");
    });
  });

  describe('getLogcat', () => {
    it('should build logcat command with tag and lines', () => {
      const deviceListOutput = `List of devices attached
emulator-5554\tdevice product:sdk_gphone_x86`;

      mockExecSync
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check
        .mockReturnValueOnce(Buffer.from(deviceListOutput)) // devices -l call
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check
        .mockReturnValueOnce(Buffer.from('log output')); // logcat output

      const result = getLogcat({ deviceId: 'emulator-5554', lines: 50, tag: 'ReactNative' });

      expect(result.output).toContain('log output');

      const logcatCall = mockExecSync.mock.calls.find(call =>
        String(call[0]).includes('logcat')
      );
      expect(logcatCall).toBeDefined();
      expect(String(logcatCall?.[0])).toContain('logcat -d -v time -t 50');
      expect(String(logcatCall?.[0])).toContain("-s 'ReactNative:V'");
    });
  });

  describe('listPackageActivities', () => {
    it('should parse activities from dumpsys output', () => {
      const deviceListOutput = `List of devices attached
emulator-5554\tdevice product:sdk_gphone_x86`;
      const dumpsysOutput = `Package [com.example.app]
  Activity Resolver Table:
    Non-Data Actions:
      android.intent.action.MAIN:
        com.example.app/.MainActivity filter
  Activities:
    com.example.app.MainActivity:
    com.example.app.settings.SettingsActivity:
`;

      mockExecSync
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check
        .mockReturnValueOnce(Buffer.from(deviceListOutput)) // devices -l call
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check
        .mockReturnValueOnce(Buffer.from(dumpsysOutput)) // dumpsys output
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check for resolveDeviceId
        .mockReturnValueOnce(Buffer.from(deviceListOutput)) // devices -l call
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check for resolve-activity
        .mockReturnValueOnce(Buffer.from('com.example.app/.MainActivity')); // resolve-activity output

      const result = listPackageActivities('com.example.app', 'emulator-5554');

      expect(result.activities).toContain('com.example.app.MainActivity');
      expect(result.activities).toContain('com.example.app.settings.SettingsActivity');
      expect(result.mainActivity).toBe('com.example.app.MainActivity');
    });
  });

  describe('getWindowSize', () => {
    it('should parse window size output', () => {
      const deviceListOutput = `List of devices attached
emulator-5554\tdevice product:sdk_gphone_x86`;
      const wmSizeOutput = 'Physical size: 1080x2400';

      mockExecSync
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check
        .mockReturnValueOnce(Buffer.from(deviceListOutput)) // devices -l call
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check
        .mockReturnValueOnce(Buffer.from(wmSizeOutput)); // wm size output

      const result = getWindowSize('emulator-5554');

      expect(result.width).toBe(1080);
      expect(result.height).toBe(2400);
      expect(result.physicalWidth).toBe(1080);
      expect(result.physicalHeight).toBe(2400);
    });
  });

  describe('getCurrentActivity', () => {
    it('should parse current focused activity', () => {
      const deviceListOutput = `List of devices attached
emulator-5554\tdevice product:sdk_gphone_x86`;
      const dumpsysOutput =
        'mCurrentFocus=Window{123 u0 com.example.app/.MainActivity}';

      mockExecSync
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check
        .mockReturnValueOnce(Buffer.from(deviceListOutput)) // devices -l call
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check
        .mockReturnValueOnce(Buffer.from(dumpsysOutput)); // dumpsys window output

      const result = getCurrentActivity('emulator-5554');

      expect(result.packageName).toBe('com.example.app');
      expect(result.activity).toBe('com.example.app.MainActivity');
      expect(result.component).toBe('com.example.app/com.example.app.MainActivity');
    });
  });

  describe('dumpUiHierarchy', () => {
    it('should dump ui hierarchy xml', () => {
      const deviceListOutput = `List of devices attached
emulator-5554\tdevice product:sdk_gphone_x86`;
      const dumpOutput = 'UI hierarchy dumped to: /sdcard/mcp_ui.xml';
      const xmlOutput = '<hierarchy><node text=\"Hello\" /></hierarchy>';

      mockExecSync
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check
        .mockReturnValueOnce(Buffer.from(deviceListOutput)) // devices -l call
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check
        .mockReturnValueOnce(Buffer.from(dumpOutput)) // uiautomator dump
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check
        .mockReturnValueOnce(Buffer.from(xmlOutput)) // exec-out cat
        .mockReturnValueOnce(Buffer.from('Android Debug Bridge version 1.0.41')) // ADB version check
        .mockReturnValueOnce(Buffer.from('')); // rm output

      const result = dumpUiHierarchy('emulator-5554');

      expect(result.xml).toBe(xmlOutput);
      expect(result.length).toBe(xmlOutput.length);
    });
  });
});
