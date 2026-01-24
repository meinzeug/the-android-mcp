const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mcp', {
  listDevices: () => ipcRenderer.invoke('mcp:listDevices'),
  installApk: payload => ipcRenderer.invoke('mcp:installApk', payload),
  startApp: payload => ipcRenderer.invoke('mcp:startApp', payload),
  stopApp: payload => ipcRenderer.invoke('mcp:stopApp', payload),
  takeScreenshot: payload => ipcRenderer.invoke('mcp:takeScreenshot', payload),
  tap: payload => ipcRenderer.invoke('mcp:tap', payload),
  inputText: payload => ipcRenderer.invoke('mcp:inputText', payload),
  keyevent: payload => ipcRenderer.invoke('mcp:keyevent', payload),
  getCurrentActivity: payload => ipcRenderer.invoke('mcp:getCurrentActivity', payload),
  getWindowSize: payload => ipcRenderer.invoke('mcp:getWindowSize', payload),
  dumpUi: payload => ipcRenderer.invoke('mcp:dumpUi', payload),
  openApkDialog: () => ipcRenderer.invoke('dialog:openApk'),
  onLog: handler => ipcRenderer.on('mcp:log', (_event, message) => handler(message)),
});
