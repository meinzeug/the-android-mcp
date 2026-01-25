const logEl = document.getElementById('log');
const statusEl = document.getElementById('status');
const deviceListEl = document.getElementById('deviceList');
const screenImg = document.getElementById('screenImg');
const screenMeta = document.getElementById('screenMeta');
const screenOverlay = document.getElementById('screenOverlay');

const refreshDevicesBtn = document.getElementById('refreshDevices');
const screenshotBtn = document.getElementById('shotBtn');
const tapToggleBtn = document.getElementById('tapToggle');
const startAppBtn = document.getElementById('startApp');
const stopAppBtn = document.getElementById('stopApp');
const installBtn = document.getElementById('installApk');
const installLocalBtn = document.getElementById('installLocal');
const sendTextBtn = document.getElementById('sendText');
const sendKeyBtn = document.getElementById('sendKeyevent');
const refreshTelemetryBtn = document.getElementById('refreshTelemetry');
const dumpUiBtn = document.getElementById('dumpUi');
const clearLogBtn = document.getElementById('clearLog');

const packageInput = document.getElementById('packageName');
const activityInput = document.getElementById('activityName');
const apkUrlInput = document.getElementById('apkUrl');
const inputTextEl = document.getElementById('inputText');
const keyeventEl = document.getElementById('keyevent');

const currentActivityEl = document.getElementById('currentActivity');
const windowSizeEl = document.getElementById('windowSize');
const uiDumpEl = document.getElementById('uiDump');

let selectedDevice = null;
let screenMetrics = { width: null, height: null };
let tapMode = false;

function log(message) {
  const time = new Date().toLocaleTimeString();
  logEl.textContent = `[${time}] ${message}\n` + logEl.textContent;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function setDevices(devices) {
  deviceListEl.innerHTML = '';
  if (!devices || devices.length === 0) {
    deviceListEl.innerHTML = '<div class="device-item">No devices found</div>';
    return;
  }

  devices.forEach(device => {
    const item = document.createElement('div');
    item.className = 'device-item';
    item.textContent = `${device.model || device.id} (${device.status})`;
    item.onclick = () => selectDevice(device);
    if (selectedDevice && selectedDevice.id === device.id) {
      item.classList.add('active');
    }
    deviceListEl.appendChild(item);
  });
}

function selectDevice(device) {
  selectedDevice = device;
  setDevices(window.cachedDevices || []);
  setStatus(`Selected: ${device.model || device.id}`);
}

async function refreshDevices() {
  setStatus('Refreshing devices...');
  const result = await window.mcp.listDevices();
  if (!result.ok) {
    log(result.error || 'Failed to list devices');
    setStatus('Disconnected');
    return;
  }
  const devices = result.data?.devices || [];
  window.cachedDevices = devices;
  if (!selectedDevice && devices.length > 0) {
    selectedDevice = devices[0];
  }
  setDevices(devices);
  if (selectedDevice) {
    setStatus(`Selected: ${selectedDevice.model || selectedDevice.id}`);
  } else {
    setStatus('No device');
  }
}

async function takeScreenshot() {
  if (!selectedDevice) return log('Select a device first');
  const result = await window.mcp.takeScreenshot({ deviceId: selectedDevice.id });
  if (!result.ok) return log(result.error || 'Screenshot failed');

  const image = result.image;
  if (!image) return log('No image data returned');

  screenImg.src = `data:${image.mimeType};base64,${image.data}`;
  screenMetrics.width = image.width || screenMetrics.width;
  screenMetrics.height = image.height || screenMetrics.height;

  const metaText = image.width && image.height ? `${image.width}x${image.height}` : 'Unknown size';
  screenMeta.textContent = `Captured ${metaText}`;
  log('Screenshot captured');
}

async function installApk() {
  if (!selectedDevice) return log('Select a device first');
  const url = apkUrlInput.value.trim();
  if (!url) return log('Provide APK URL');
  const result = await window.mcp.installApk({ deviceId: selectedDevice.id, apkUrl: url, grantPermissions: true });
  if (!result.ok) return log(result.error || 'Install failed');
  log(`APK installed: ${result.data?.apkPath || 'ok'}`);
}

async function installLocalApk() {
  if (!selectedDevice) return log('Select a device first');
  const path = await window.mcp.openApkDialog();
  if (!path) return;
  const result = await window.mcp.installApk({ deviceId: selectedDevice.id, apkPath: path, grantPermissions: true });
  if (!result.ok) return log(result.error || 'Install failed');
  log(`APK installed: ${result.data?.apkPath || 'ok'}`);
}

async function startApp() {
  if (!selectedDevice) return log('Select a device first');
  const packageName = packageInput.value.trim();
  if (!packageName) return log('Enter package name');
  const activity = activityInput.value.trim();
  const result = await window.mcp.startApp({
    deviceId: selectedDevice.id,
    packageName,
    activity: activity || undefined,
  });
  if (!result.ok) return log(result.error || 'Start failed');
  log(`App started: ${packageName}`);
}

async function stopApp() {
  if (!selectedDevice) return log('Select a device first');
  const packageName = packageInput.value.trim();
  if (!packageName) return log('Enter package name');
  const result = await window.mcp.stopApp({ deviceId: selectedDevice.id, packageName });
  if (!result.ok) return log(result.error || 'Stop failed');
  log(`App stopped: ${packageName}`);
}

async function sendText() {
  if (!selectedDevice) return log('Select a device first');
  const text = inputTextEl.value;
  if (!text) return log('Enter text');
  const result = await window.mcp.inputText({ deviceId: selectedDevice.id, text });
  if (!result.ok) return log(result.error || 'Input failed');
  log(`Text sent`);
}

async function sendKeyevent() {
  if (!selectedDevice) return log('Select a device first');
  const keyCode = keyeventEl.value.trim();
  if (!keyCode) return log('Enter key code');
  const result = await window.mcp.keyevent({ deviceId: selectedDevice.id, keyCode });
  if (!result.ok) return log(result.error || 'Keyevent failed');
  log(`Keyevent sent: ${keyCode}`);
}

async function refreshTelemetry() {
  if (!selectedDevice) return log('Select a device first');
  const activity = await window.mcp.getCurrentActivity({ deviceId: selectedDevice.id });
  if (activity.ok) {
    const data = activity.data || {};
    currentActivityEl.textContent = data.component || data.activity || 'Unknown';
  } else {
    currentActivityEl.textContent = 'Error';
    log(activity.error || 'Activity fetch failed');
  }

  const size = await window.mcp.getWindowSize({ deviceId: selectedDevice.id });
  if (size.ok) {
    const data = size.data || {};
    windowSizeEl.textContent = `${data.width}x${data.height}`;
  } else {
    windowSizeEl.textContent = 'Error';
    log(size.error || 'Window size failed');
  }
}

async function dumpUi() {
  if (!selectedDevice) return log('Select a device first');
  const result = await window.mcp.dumpUi({ deviceId: selectedDevice.id, maxChars: 6000 });
  if (!result.ok) return log(result.error || 'Dump failed');
  uiDumpEl.value = result.data?.xml || '';
  log('UI hierarchy dumped');
}

function toggleTapMode() {
  tapMode = !tapMode;
  tapToggleBtn.classList.toggle('active', tapMode);
  screenOverlay.classList.toggle('active', tapMode);
  document.body.classList.toggle('tap-active', tapMode);
}

async function handleTap(event) {
  if (!tapMode) return;
  if (!selectedDevice) return log('Select a device first');
  if (!screenMetrics.width || !screenMetrics.height) return log('Take a screenshot first');
  const rect = screenImg.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = Math.round(((event.clientX - rect.left) / rect.width) * screenMetrics.width);
  const y = Math.round(((event.clientY - rect.top) / rect.height) * screenMetrics.height);
  const result = await window.mcp.tap({ deviceId: selectedDevice.id, x, y });
  if (!result.ok) return log(result.error || 'Tap failed');
  log(`Tap at ${x}, ${y}`);
}

screenImg.addEventListener('click', handleTap);
screenOverlay.addEventListener('click', handleTap);

refreshDevicesBtn.addEventListener('click', refreshDevices);
screenshotBtn.addEventListener('click', takeScreenshot);
tapToggleBtn.addEventListener('click', toggleTapMode);
startAppBtn.addEventListener('click', startApp);
stopAppBtn.addEventListener('click', stopApp);
installBtn.addEventListener('click', installApk);
installLocalBtn.addEventListener('click', installLocalApk);
sendTextBtn.addEventListener('click', sendText);
sendKeyBtn.addEventListener('click', sendKeyevent);
refreshTelemetryBtn.addEventListener('click', refreshTelemetry);
dumpUiBtn.addEventListener('click', dumpUi);
clearLogBtn.addEventListener('click', () => (logEl.textContent = ''));

window.mcp.onLog(message => log(message));

refreshDevices().then(() => {
  setStatus('Ready');
});
