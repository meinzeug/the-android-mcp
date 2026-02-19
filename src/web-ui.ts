#!/usr/bin/env node

import { spawn } from 'child_process';
import http, { IncomingMessage, ServerResponse } from 'http';
import net from 'net';
import path from 'path';
import pkg from '../package.json';
import {
  captureAndroidDisplaySnapshot,
  captureAndroidLocationSnapshot,
  captureAndroidPackageInventorySnapshot,
  captureAndroidPowerIdleSnapshot,
  captureAndroidRadioSnapshot,
  getConnectedDevices,
  openUrlInChrome,
} from './utils/adb.js';

export const DEFAULT_WEB_UI_HOST = '127.0.0.1';
export const DEFAULT_WEB_UI_PORT = 50000;

type JsonObject = Record<string, unknown>;

const MAX_BODY_BYTES = 1024 * 1024;

const INDEX_HTML = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>the-android-mcp web ui</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />
    <style>
      :root {
        --bg-0: #090e13;
        --bg-1: #0f1721;
        --bg-2: #182433;
        --card: #101a25cc;
        --line: #2f425899;
        --text: #e6f0f8;
        --muted: #8fa6bb;
        --accent: #00d9a6;
        --accent-2: #4bc3ff;
        --danger: #ff6b6b;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: 'Space Grotesk', sans-serif;
        color: var(--text);
        background:
          radial-gradient(1200px 600px at 10% -10%, #1f3047 0%, transparent 60%),
          radial-gradient(1000px 500px at 110% 0%, #123340 0%, transparent 55%),
          linear-gradient(160deg, var(--bg-0), var(--bg-1) 40%, var(--bg-2));
        padding: 24px;
      }
      .shell {
        max-width: 1200px;
        margin: 0 auto;
        display: grid;
        gap: 16px;
      }
      .hero {
        border: 1px solid var(--line);
        background: linear-gradient(135deg, #102231cc, #10213199);
        border-radius: 18px;
        padding: 18px 20px;
        display: grid;
        gap: 6px;
      }
      .hero h1 {
        margin: 0;
        font-size: 1.6rem;
        letter-spacing: 0.01em;
      }
      .hero p {
        margin: 0;
        color: var(--muted);
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: 1px solid #2d495f;
        border-radius: 999px;
        width: fit-content;
        padding: 6px 12px;
        color: #b8d2e7;
        font-family: 'IBM Plex Mono', monospace;
        font-size: 12px;
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--accent);
        box-shadow: 0 0 10px var(--accent);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 16px;
      }
      .card {
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 14px;
        background: var(--card);
        backdrop-filter: blur(6px);
      }
      .card h2 {
        margin: 0 0 10px 0;
        font-size: 1.05rem;
      }
      .row {
        display: grid;
        gap: 10px;
      }
      input,
      select,
      button {
        border: 1px solid #355067;
        border-radius: 10px;
        padding: 10px 12px;
        background: #0f1a25;
        color: var(--text);
        font: inherit;
      }
      input,
      select {
        width: 100%;
      }
      button {
        cursor: pointer;
        font-weight: 600;
        transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
      }
      button:hover {
        transform: translateY(-1px);
        border-color: var(--accent-2);
      }
      .btn-accent {
        background: linear-gradient(135deg, #0d6b58, #0c5260);
      }
      .btn-muted {
        background: linear-gradient(135deg, #163047, #1c2732);
      }
      .btn-danger {
        background: linear-gradient(135deg, #5f2229, #4a1e2b);
      }
      .quick {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .snapshots {
        display: grid;
        gap: 8px;
      }
      pre {
        margin: 0;
        border: 1px solid #2f4258;
        border-radius: 12px;
        background: #0a131d;
        padding: 12px;
        max-height: 480px;
        overflow: auto;
        font: 12px/1.45 'IBM Plex Mono', monospace;
        color: #bfe0ff;
      }
      .muted {
        color: var(--muted);
        font-size: 0.92rem;
      }
      .error {
        color: var(--danger);
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <div class="pill"><span class="dot"></span><span id="status-text">Connecting...</span></div>
        <h1>the-android-mcp v3 Web UI</h1>
        <p>Local control center on port 50000 for Android diagnostics and live URL/device workflows.</p>
      </section>

      <section class="grid">
        <article class="card row">
          <h2>Device + Navigation</h2>
          <select id="device-select"></select>
          <input id="url-input" type="url" value="https://www.wikipedia.org" />
          <button class="btn-accent" id="open-url-btn">Open URL on device</button>
          <div class="quick">
            <button class="btn-muted quick-url" data-url="https://www.wikipedia.org">Wikipedia</button>
            <button class="btn-muted quick-url" data-url="https://news.ycombinator.com">Hacker News</button>
            <button class="btn-muted quick-url" data-url="https://developer.android.com">Android Docs</button>
            <button class="btn-muted quick-url" data-url="https://www.youtube.com">YouTube</button>
          </div>
        </article>

        <article class="card row">
          <h2>v3 Snapshot Suite</h2>
          <p class="muted">One-click diagnostics: radio, display, location, power/idle, package inventory.</p>
          <div class="snapshots">
            <button class="btn-muted snapshot-btn" data-endpoint="/api/snapshot/radio">Radio Snapshot</button>
            <button class="btn-muted snapshot-btn" data-endpoint="/api/snapshot/display">Display Snapshot</button>
            <button class="btn-muted snapshot-btn" data-endpoint="/api/snapshot/location">Location Snapshot</button>
            <button class="btn-muted snapshot-btn" data-endpoint="/api/snapshot/power-idle">Power/Idle Snapshot</button>
            <button class="btn-muted snapshot-btn" data-endpoint="/api/snapshot/package-inventory">
              Package Inventory Snapshot
            </button>
          </div>
        </article>

        <article class="card row" style="grid-column: 1 / -1;">
          <h2>Output</h2>
          <p id="message" class="muted">Ready.</p>
          <pre id="output">{}</pre>
        </article>
      </section>
    </main>
    <script>
      const state = {
        devices: [],
        deviceId: undefined,
      };

      const $status = document.getElementById('status-text');
      const $deviceSelect = document.getElementById('device-select');
      const $urlInput = document.getElementById('url-input');
      const $message = document.getElementById('message');
      const $output = document.getElementById('output');

      function setMessage(text, isError = false) {
        $message.textContent = text;
        $message.classList.toggle('error', isError);
      }

      function renderOutput(value) {
        $output.textContent = JSON.stringify(value, null, 2);
      }

      async function api(path, method = 'GET', body) {
        const response = await fetch(path, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = json && json.error ? json.error : 'HTTP ' + response.status;
          throw new Error(message);
        }
        return json;
      }

      async function loadDevices() {
        const data = await api('/api/devices');
        state.devices = Array.isArray(data.devices) ? data.devices : [];
        $deviceSelect.innerHTML = '';
        for (const device of state.devices) {
          const option = document.createElement('option');
          option.value = device.id;
          option.textContent = device.id + ' (' + (device.model || 'unknown') + ')';
          $deviceSelect.appendChild(option);
        }
        state.deviceId = state.devices[0]?.id;
        if (state.deviceId) {
          $deviceSelect.value = state.deviceId;
          $status.textContent = 'Connected: ' + state.deviceId;
        } else {
          $status.textContent = 'No Android device connected';
        }
      }

      async function openUrl(url) {
        setMessage('Opening ' + url + '...');
        const result = await api('/api/open-url', 'POST', {
          url,
          deviceId: state.deviceId,
          waitForReadyMs: 2000,
        });
        renderOutput(result);
        setMessage('Opened ' + url);
      }

      async function runSnapshot(endpoint) {
        setMessage('Running ' + endpoint + '...');
        const payload = { deviceId: state.deviceId, packageName: 'com.android.chrome' };
        const result = await api(endpoint, 'POST', payload);
        renderOutput(result);
        setMessage(endpoint + ' completed');
      }

      async function init() {
        try {
          await api('/api/health');
          await loadDevices();
          renderOutput({ ok: true, note: 'UI ready' });
          setMessage('Ready.');
        } catch (error) {
          setMessage(String(error), true);
        }
      }

      $deviceSelect.addEventListener('change', () => {
        state.deviceId = $deviceSelect.value;
      });

      document.getElementById('open-url-btn').addEventListener('click', async () => {
        try {
          await openUrl($urlInput.value);
        } catch (error) {
          setMessage(String(error), true);
        }
      });

      for (const button of document.querySelectorAll('.quick-url')) {
        button.addEventListener('click', async () => {
          try {
            const url = button.dataset.url;
            if (url) {
              $urlInput.value = url;
              await openUrl(url);
            }
          } catch (error) {
            setMessage(String(error), true);
          }
        });
      }

      for (const button of document.querySelectorAll('.snapshot-btn')) {
        button.addEventListener('click', async () => {
          try {
            const endpoint = button.dataset.endpoint;
            if (endpoint) {
              await runSnapshot(endpoint);
            }
          } catch (error) {
            setMessage(String(error), true);
          }
        });
      }

      init();
    </script>
  </body>
</html>
`;

function sendJson(response: ServerResponse, statusCode: number, body: JsonObject): void {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

function sendHtml(response: ServerResponse, html: string): void {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(html);
}

async function readJsonBody(request: IncomingMessage): Promise<JsonObject> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    request.on('data', chunk => {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(value);
    });

    request.on('error', reject);
    request.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const parsed = JSON.parse(raw) as JsonObject;
        resolve(parsed);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function parseArgValue(args: string[], key: string): string | undefined {
  const index = args.findIndex(value => value === key);
  if (index < 0) {
    return undefined;
  }
  return args[index + 1];
}

async function isPortReachable(port: number, host: string): Promise<boolean> {
  return await new Promise(resolve => {
    const socket = net.createConnection({ port, host });
    const done = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(500);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function handleApi(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const method = request.method ?? 'GET';
  const pathname = request.url ? new URL(request.url, 'http://localhost').pathname : '/';

  if (method === 'GET' && pathname === '/api/health') {
    sendJson(response, 200, {
      ok: true,
      service: 'the-android-mcp-web-ui',
      version: pkg.version,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/devices') {
    sendJson(response, 200, { devices: getConnectedDevices() });
    return;
  }

  if (method === 'POST' && pathname === '/api/open-url') {
    const body = await readJsonBody(request);
    const url = typeof body.url === 'string' ? body.url : '';
    if (!url) {
      sendJson(response, 400, { error: 'url is required' });
      return;
    }
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId : undefined;
    const waitForReadyMs = typeof body.waitForReadyMs === 'number' ? body.waitForReadyMs : 2000;
    const result = openUrlInChrome(url, deviceId, { waitForReadyMs, fallbackToDefault: true });
    sendJson(response, 200, { result });
    return;
  }

  if (method === 'POST' && pathname.startsWith('/api/snapshot/')) {
    const body = await readJsonBody(request);
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId : undefined;
    const packageName = typeof body.packageName === 'string' ? body.packageName : undefined;

    if (pathname === '/api/snapshot/radio') {
      sendJson(response, 200, { result: captureAndroidRadioSnapshot({ deviceId }) });
      return;
    }
    if (pathname === '/api/snapshot/display') {
      sendJson(response, 200, { result: captureAndroidDisplaySnapshot({ deviceId }) });
      return;
    }
    if (pathname === '/api/snapshot/location') {
      sendJson(response, 200, { result: captureAndroidLocationSnapshot({ deviceId, packageName }) });
      return;
    }
    if (pathname === '/api/snapshot/power-idle') {
      sendJson(response, 200, { result: captureAndroidPowerIdleSnapshot({ deviceId }) });
      return;
    }
    if (pathname === '/api/snapshot/package-inventory') {
      sendJson(response, 200, { result: captureAndroidPackageInventorySnapshot({ deviceId }) });
      return;
    }
  }

  sendJson(response, 404, { error: 'Not found' });
}

export function startWebUiServer(options: { host?: string; port?: number } = {}): http.Server {
  const host = options.host ?? DEFAULT_WEB_UI_HOST;
  const port = options.port ?? DEFAULT_WEB_UI_PORT;

  const server = http.createServer(async (request, response) => {
    try {
      const pathname = request.url ? new URL(request.url, 'http://localhost').pathname : '/';
      if ((request.method ?? 'GET') === 'GET' && pathname === '/') {
        sendHtml(response, INDEX_HTML);
        return;
      }
      await handleApi(request, response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(response, 500, { error: message });
    }
  });

  server.listen(port, host, () => {
    console.log(`the-android-mcp web ui running on http://${host}:${port}`);
  });

  return server;
}

export async function ensureWebUiBackground(options: {
  host?: string;
  port?: number;
} = {}): Promise<{ started: boolean; url: string; reason: string; pid?: number }> {
  const host = options.host ?? DEFAULT_WEB_UI_HOST;
  const port = options.port ?? DEFAULT_WEB_UI_PORT;
  const url = `http://${host}:${port}`;

  if (await isPortReachable(port, host)) {
    return { started: false, url, reason: 'already-running' };
  }

  const scriptPath = path.join(__dirname, 'web-ui.js');
  const child = spawn(process.execPath, [scriptPath, '--serve', '--host', host, '--port', String(port)], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  return { started: true, url, reason: 'spawned', pid: child.pid };
}

function main(): void {
  const args = process.argv.slice(2);
  const shouldServe = args.includes('--serve') || args.length === 0;
  if (!shouldServe) {
    return;
  }

  const host = parseArgValue(args, '--host') ?? DEFAULT_WEB_UI_HOST;
  const portValue = parseArgValue(args, '--port');
  const parsedPort = portValue ? Number(portValue) : DEFAULT_WEB_UI_PORT;
  const port = Number.isFinite(parsedPort) ? parsedPort : DEFAULT_WEB_UI_PORT;
  startWebUiServer({ host, port });
}

if (require.main === module) {
  main();
}
