const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

let mainWindow;
let client;
let transport;

function log(message) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('mcp:log', message);
  }
}

async function ensureClient() {
  if (client) return client;

  const repoRoot = path.join(__dirname, '..', '..');
  transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(repoRoot, 'dist', 'index.js')],
    cwd: repoRoot,
    stderr: 'pipe',
  });

  if (transport.stderr) {
    transport.stderr.on('data', chunk => {
      const text = chunk.toString().trim();
      if (text) log(`[server] ${text}`);
    });
  }

  client = new Client({ name: 'the-android-mcp-gui', version: '0.0.1' });
  await client.connect(transport);
  log('Connected to MCP server');
  return client;
}

function parseToolResponse(response) {
  if (!response) {
    return { ok: false, error: 'No response from MCP server' };
  }

  if (response.isError) {
    const text = (response.content || [])
      .map(item => item.text)
      .filter(Boolean)
      .join('\n');
    return { ok: false, error: text || 'Unknown MCP error' };
  }

  const textItem = (response.content || []).find(item => item.type === 'text');
  const imageItem = (response.content || []).find(item => item.type === 'image');
  const text = textItem?.text ?? '';
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    data = text;
  }

  return { ok: true, data, image: imageItem };
}

async function callTool(name, args) {
  const mcp = await ensureClient();
  const response = await mcp.callTool({ name, arguments: args || {} });
  return parseToolResponse(response);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 980,
    minHeight: 700,
    backgroundColor: '#0b0f19',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', async () => {
    if (client) {
      try {
        await client.close();
      } catch (error) {
        // ignore
      }
    }
    client = null;
  });
}

ipcMain.handle('mcp:listDevices', async () => callTool('list_android_devices', {}));
ipcMain.handle('mcp:installApk', async (_event, payload) =>
  callTool('install_android_apk', payload)
);
ipcMain.handle('mcp:startApp', async (_event, payload) =>
  callTool('start_android_app', payload)
);
ipcMain.handle('mcp:stopApp', async (_event, payload) =>
  callTool('stop_android_app', payload)
);
ipcMain.handle('mcp:takeScreenshot', async (_event, payload) =>
  callTool('take_android_screenshot', payload)
);
ipcMain.handle('mcp:tap', async (_event, payload) =>
  callTool('tap_android_screen', payload)
);
ipcMain.handle('mcp:inputText', async (_event, payload) =>
  callTool('input_android_text', payload)
);
ipcMain.handle('mcp:keyevent', async (_event, payload) =>
  callTool('send_android_keyevent', payload)
);
ipcMain.handle('mcp:getCurrentActivity', async (_event, payload) =>
  callTool('get_android_current_activity', payload)
);
ipcMain.handle('mcp:getWindowSize', async (_event, payload) =>
  callTool('get_android_window_size', payload)
);
ipcMain.handle('mcp:dumpUi', async (_event, payload) =>
  callTool('dump_android_ui_hierarchy', payload)
);

ipcMain.handle('dialog:openApk', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'APK', extensions: ['apk'] }],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  if (client) {
    try {
      await client.close();
    } catch (error) {
      // ignore
    }
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
