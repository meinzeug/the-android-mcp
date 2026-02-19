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

const UPDATE_HINT = 'npm install -g the-android-mcp@latest';
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_EVENTS = 400;

type JsonObject = Record<string, unknown>;

interface UiEvent {
  id: number;
  at: string;
  type: string;
  message: string;
  data?: unknown;
}

const serverStartedAt = Date.now();
let eventSeq = 1;
const eventHistory: UiEvent[] = [];
const sseClients = new Set<ServerResponse>();

function nowIso(): string {
  return new Date().toISOString();
}

function pushEvent(type: string, message: string, data?: unknown): UiEvent {
  const event: UiEvent = {
    id: eventSeq++,
    at: nowIso(),
    type,
    message,
    data,
  };
  eventHistory.push(event);
  if (eventHistory.length > MAX_EVENTS) {
    eventHistory.splice(0, eventHistory.length - MAX_EVENTS);
  }
  broadcastEvent(event);
  return event;
}

function broadcastEvent(event: UiEvent): void {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      try {
        client.end();
      } catch {
        // ignore
      }
      sseClients.delete(client);
    }
  }
}

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

function getCompactTextSummary(value: string | undefined): JsonObject | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const lines = value.split('\n').length;
  const trimmed = value.slice(0, 280);
  return {
    length: value.length,
    lines,
    preview: trimmed,
  };
}

function summarizeSnapshot(result: Record<string, unknown>): JsonObject {
  const summary: JsonObject = {};
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'string') {
      summary[key] = {
        length: value.length,
        lines: value.split('\n').length,
      };
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      summary[key] = value;
    }
  }
  return summary;
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
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          resolve(parsed as JsonObject);
          return;
        }
        reject(new Error('JSON body must be an object'));
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

function extractDeviceId(body: JsonObject): string | undefined {
  const value = body.deviceId;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  const parsed = Math.trunc(value);
  return Math.max(min, Math.min(max, parsed));
}

function buildStatePayload(host: string, port: number): JsonObject {
  const devices = getConnectedDevices();
  return {
    ok: true,
    version: pkg.version,
    service: 'the-android-mcp-web-ui',
    endpoint: `http://${host}:${port}`,
    uptimeMs: Date.now() - serverStartedAt,
    updateHint: UPDATE_HINT,
    connectedDevices: devices,
    connectedDeviceCount: devices.length,
    eventCount: eventHistory.length,
  };
}

function getSnapshotSuite(deviceId?: string, packageName?: string): JsonObject {
  const startedAt = Date.now();
  const radio = captureAndroidRadioSnapshot({ deviceId });
  const display = captureAndroidDisplaySnapshot({ deviceId });
  const location = captureAndroidLocationSnapshot({ deviceId, packageName });
  const powerIdle = captureAndroidPowerIdleSnapshot({ deviceId, batteryStatsLines: 400 });
  const packageInventory = captureAndroidPackageInventorySnapshot({
    deviceId,
    includePackagePaths: false,
    packageListLines: 1200,
  });

  return {
    deviceId: radio.deviceId,
    capturedAt: nowIso(),
    durationMs: Date.now() - startedAt,
    summaries: {
      radio: summarizeSnapshot(radio as unknown as Record<string, unknown>),
      display: summarizeSnapshot(display as unknown as Record<string, unknown>),
      location: summarizeSnapshot(location as unknown as Record<string, unknown>),
      powerIdle: summarizeSnapshot(powerIdle as unknown as Record<string, unknown>),
      packageInventory: {
        packageCount: packageInventory.packageCount,
        thirdPartyCount: packageInventory.thirdPartyCount,
        systemCount: packageInventory.systemCount,
        disabledCount: packageInventory.disabledCount,
      },
    },
    raw: {
      radio,
      display,
      location,
      powerIdle,
      packageInventory,
    },
  };
}

function runStressScenario(body: JsonObject): JsonObject {
  const deviceId = extractDeviceId(body);
  const urlsValue = body.urls;
  const urls = Array.isArray(urlsValue)
    ? urlsValue.filter((entry): entry is string => typeof entry === 'string' && entry.startsWith('http'))
    : [];
  const normalizedUrls = urls.length
    ? urls
    : ['https://www.wikipedia.org', 'https://news.ycombinator.com', 'https://developer.android.com'];
  const loops = clampInt(body.loops, 1, 1, 5);
  const waitForReadyMs = clampInt(body.waitForReadyMs, 1200, 200, 6000);
  const includeSnapshotAfterEach = body.includeSnapshotAfterEach !== false;

  const startedAt = Date.now();
  const steps: JsonObject[] = [];

  for (let loop = 1; loop <= loops; loop += 1) {
    for (const url of normalizedUrls) {
      const openStart = Date.now();
      const open = openUrlInChrome(url, deviceId, {
        waitForReadyMs,
        fallbackToDefault: true,
      });
      const entry: JsonObject = {
        kind: 'open_url',
        loop,
        url,
        deviceId: open.deviceId,
        strategy: open.strategy,
        durationMs: Date.now() - openStart,
      };

      if (includeSnapshotAfterEach) {
        const snapStart = Date.now();
        const radio = captureAndroidRadioSnapshot({ deviceId: open.deviceId, includeWifiDump: false });
        const display = captureAndroidDisplaySnapshot({
          deviceId: open.deviceId,
          includeDisplayDump: false,
          includeWindowDump: false,
          includeSurfaceFlinger: false,
        });
        entry.snapshot = {
          durationMs: Date.now() - snapStart,
          radio: {
            wifiEnabled: radio.wifiEnabled,
            mobileDataEnabled: radio.mobileDataEnabled,
            airplaneMode: radio.airplaneMode,
          },
          display: {
            wmSize: display.wmSize,
            wmDensity: display.wmDensity,
            screenBrightness: display.screenBrightness,
          },
        };
      }

      steps.push(entry);
    }
  }

  return {
    ok: true,
    scenario: 'stress-run',
    deviceId,
    loops,
    waitForReadyMs,
    includeSnapshotAfterEach,
    urls: normalizedUrls,
    steps,
    totalSteps: steps.length,
    durationMs: Date.now() - startedAt,
    updateHint: UPDATE_HINT,
  };
}

function setupSse(request: IncomingMessage, response: ServerResponse): void {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  response.write(`data: ${JSON.stringify({ type: 'hello', at: nowIso(), message: 'event-stream-ready' })}\n\n`);
  sseClients.add(response);

  const heartbeat = setInterval(() => {
    try {
      response.write(`data: ${JSON.stringify({ type: 'heartbeat', at: nowIso() })}\n\n`);
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(response);
    }
  }, 15000);

  request.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(response);
  });
}

async function handleApi(
  request: IncomingMessage,
  response: ServerResponse,
  context: { host: string; port: number }
): Promise<void> {
  const method = request.method ?? 'GET';
  const url = request.url ? new URL(request.url, 'http://localhost') : new URL('http://localhost/');
  const pathname = url.pathname;

  if (method === 'GET' && pathname === '/api/health') {
    sendJson(response, 200, {
      ok: true,
      service: 'the-android-mcp-web-ui',
      version: pkg.version,
      timestamp: nowIso(),
      updateHint: UPDATE_HINT,
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/state') {
    sendJson(response, 200, buildStatePayload(context.host, context.port));
    return;
  }

  if (method === 'GET' && pathname === '/api/devices') {
    const devices = getConnectedDevices();
    sendJson(response, 200, {
      devices,
      count: devices.length,
      updateHint: UPDATE_HINT,
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/history') {
    const limitRaw = Number(url.searchParams.get('limit') ?? '120');
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(400, Math.trunc(limitRaw))) : 120;
    sendJson(response, 200, {
      events: eventHistory.slice(-limit),
      count: Math.min(limit, eventHistory.length),
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/events') {
    setupSse(request, response);
    return;
  }

  if (method === 'POST' && pathname === '/api/open-url') {
    const body = await readJsonBody(request);
    const deviceId = extractDeviceId(body);
    const urlValue = typeof body.url === 'string' ? body.url.trim() : '';
    if (!urlValue || !/^https?:\/\//i.test(urlValue)) {
      sendJson(response, 400, { error: 'url must be a valid http/https URL' });
      return;
    }
    const waitForReadyMs = clampInt(body.waitForReadyMs, 1500, 200, 10000);
    const startedAt = Date.now();
    const result = openUrlInChrome(urlValue, deviceId, {
      waitForReadyMs,
      fallbackToDefault: true,
    });

    pushEvent('open-url', 'Opened URL on device', {
      deviceId: result.deviceId,
      url: urlValue,
      strategy: result.strategy,
      durationMs: Date.now() - startedAt,
    });

    sendJson(response, 200, {
      ok: true,
      result,
      durationMs: Date.now() - startedAt,
      updateHint: UPDATE_HINT,
    });
    return;
  }

  if (method === 'POST' && pathname.startsWith('/api/snapshot/')) {
    const body = await readJsonBody(request);
    const deviceId = extractDeviceId(body);
    const packageName = typeof body.packageName === 'string' ? body.packageName.trim() : undefined;
    const includeRaw = body.includeRaw === true;

    if (pathname === '/api/snapshot/radio') {
      const startedAt = Date.now();
      const result = captureAndroidRadioSnapshot({ deviceId });
      pushEvent('snapshot-radio', 'Captured radio snapshot', {
        deviceId: result.deviceId,
        durationMs: Date.now() - startedAt,
      });
      sendJson(response, 200, {
        ok: true,
        result: includeRaw ? result : undefined,
        summary: summarizeSnapshot(result as unknown as Record<string, unknown>),
        durationMs: Date.now() - startedAt,
        updateHint: UPDATE_HINT,
      });
      return;
    }

    if (pathname === '/api/snapshot/display') {
      const startedAt = Date.now();
      const result = captureAndroidDisplaySnapshot({ deviceId });
      pushEvent('snapshot-display', 'Captured display snapshot', {
        deviceId: result.deviceId,
        durationMs: Date.now() - startedAt,
      });
      sendJson(response, 200, {
        ok: true,
        result: includeRaw ? result : undefined,
        summary: summarizeSnapshot(result as unknown as Record<string, unknown>),
        durationMs: Date.now() - startedAt,
        updateHint: UPDATE_HINT,
      });
      return;
    }

    if (pathname === '/api/snapshot/location') {
      const startedAt = Date.now();
      const result = captureAndroidLocationSnapshot({ deviceId, packageName });
      pushEvent('snapshot-location', 'Captured location snapshot', {
        deviceId: result.deviceId,
        durationMs: Date.now() - startedAt,
      });
      sendJson(response, 200, {
        ok: true,
        result: includeRaw ? result : undefined,
        summary: summarizeSnapshot(result as unknown as Record<string, unknown>),
        durationMs: Date.now() - startedAt,
        updateHint: UPDATE_HINT,
      });
      return;
    }

    if (pathname === '/api/snapshot/power-idle') {
      const startedAt = Date.now();
      const result = captureAndroidPowerIdleSnapshot({
        deviceId,
        batteryStatsLines: clampInt(body.batteryStatsLines, 400, 100, 5000),
      });
      pushEvent('snapshot-power-idle', 'Captured power/idle snapshot', {
        deviceId: result.deviceId,
        durationMs: Date.now() - startedAt,
      });
      sendJson(response, 200, {
        ok: true,
        result: includeRaw ? result : undefined,
        summary: summarizeSnapshot(result as unknown as Record<string, unknown>),
        durationMs: Date.now() - startedAt,
        updateHint: UPDATE_HINT,
      });
      return;
    }

    if (pathname === '/api/snapshot/package-inventory') {
      const startedAt = Date.now();
      const result = captureAndroidPackageInventorySnapshot({
        deviceId,
        includePackagePaths: body.includePackagePaths === true,
        packageListLines: clampInt(body.packageListLines, 1200, 200, 5000),
      });
      pushEvent('snapshot-package-inventory', 'Captured package inventory snapshot', {
        deviceId: result.deviceId,
        packageCount: result.packageCount,
        durationMs: Date.now() - startedAt,
      });
      sendJson(response, 200, {
        ok: true,
        result: includeRaw ? result : undefined,
        summary: {
          packageCount: result.packageCount,
          thirdPartyCount: result.thirdPartyCount,
          systemCount: result.systemCount,
          disabledCount: result.disabledCount,
          features: getCompactTextSummary(result.features),
        },
        durationMs: Date.now() - startedAt,
        updateHint: UPDATE_HINT,
      });
      return;
    }
  }

  if (method === 'POST' && pathname === '/api/snapshot-suite') {
    const body = await readJsonBody(request);
    const deviceId = extractDeviceId(body);
    const packageName = typeof body.packageName === 'string' ? body.packageName.trim() : undefined;
    const startedAt = Date.now();
    const suite = getSnapshotSuite(deviceId, packageName);
    pushEvent('snapshot-suite', 'Captured full v3 snapshot suite', {
      deviceId,
      durationMs: Date.now() - startedAt,
    });
    sendJson(response, 200, {
      ok: true,
      suite,
      durationMs: Date.now() - startedAt,
      updateHint: UPDATE_HINT,
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/stress-run') {
    const body = await readJsonBody(request);
    const startedAt = Date.now();
    const result = runStressScenario(body);
    pushEvent('stress-run', 'Completed stress scenario', {
      durationMs: Date.now() - startedAt,
      totalSteps: result.totalSteps,
      loops: result.loops,
    });
    sendJson(response, 200, result);
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
}

const INDEX_HTML = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>the-android-mcp web ui v3</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />
    <style>
      :root {
        --bg0: #0a0f14;
        --bg1: #0f1a24;
        --bg2: #142535;
        --card: #0f1b2799;
        --line: #2e455a99;
        --text: #e7f1f8;
        --muted: #95adc3;
        --acc0: #00c2a8;
        --acc1: #0aa3ff;
        --warn: #ffbf46;
        --bad: #ff6a6a;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: 'Sora', sans-serif;
        color: var(--text);
        background:
          radial-gradient(1200px 600px at -5% -10%, #1d2f42 0%, transparent 60%),
          radial-gradient(900px 500px at 110% -20%, #18394a 0%, transparent 55%),
          linear-gradient(160deg, var(--bg0), var(--bg1) 44%, var(--bg2));
        padding: 18px;
      }
      .layout {
        max-width: 1400px;
        margin: 0 auto;
        display: grid;
        gap: 14px;
      }
      .hero {
        border: 1px solid var(--line);
        border-radius: 18px;
        background: linear-gradient(140deg, #112231cc, #0f1e2caa);
        padding: 16px;
        display: grid;
        gap: 6px;
      }
      .row {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        align-items: center;
      }
      .badge {
        border: 1px solid #3a5c74;
        border-radius: 999px;
        padding: 5px 10px;
        font-size: 12px;
        color: #b8d4e7;
        font-family: 'JetBrains Mono', monospace;
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--acc0);
        box-shadow: 0 0 12px var(--acc0);
        display: inline-block;
        margin-right: 6px;
      }
      .grid {
        display: grid;
        gap: 12px;
        grid-template-columns: 1.2fr 1fr 1fr;
      }
      .card {
        border: 1px solid var(--line);
        border-radius: 16px;
        background: var(--card);
        backdrop-filter: blur(6px);
        padding: 12px;
      }
      .card h2 {
        margin: 0 0 8px 0;
        font-size: 1rem;
      }
      .muted {
        margin: 0;
        color: var(--muted);
        font-size: 0.9rem;
      }
      .controls {
        display: grid;
        gap: 8px;
      }
      .stack {
        display: grid;
        gap: 8px;
      }
      .split {
        display: grid;
        gap: 8px;
        grid-template-columns: 1fr 1fr;
      }
      input,
      textarea,
      select,
      button {
        width: 100%;
        border: 1px solid #3a566f;
        border-radius: 10px;
        background: #0f1a24;
        color: var(--text);
        padding: 10px;
        font: inherit;
      }
      textarea {
        min-height: 92px;
        resize: vertical;
      }
      button {
        cursor: pointer;
        font-weight: 600;
        transition: transform 120ms ease, border-color 120ms ease, filter 120ms ease;
      }
      button:hover {
        transform: translateY(-1px);
        border-color: var(--acc1);
        filter: brightness(1.06);
      }
      .btn-primary {
        background: linear-gradient(130deg, #0f7464, #145d72);
      }
      .btn-secondary {
        background: linear-gradient(130deg, #1c3248, #1a2b3a);
      }
      .btn-warning {
        background: linear-gradient(130deg, #7a5a18, #5e3d1f);
      }
      .quick-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
      }
      .events {
        max-height: 380px;
        overflow: auto;
        border: 1px solid #2c4358;
        border-radius: 12px;
        padding: 8px;
        background: #0b141d;
        display: grid;
        gap: 7px;
      }
      .event {
        border: 1px solid #2b4458;
        border-radius: 10px;
        padding: 7px;
        font-size: 12px;
      }
      .event .meta {
        color: #99b4c9;
        font-family: 'JetBrains Mono', monospace;
        margin-bottom: 4px;
      }
      .output-wrap {
        border: 1px solid #2b4559;
        border-radius: 14px;
        background: #0a131d;
        overflow: hidden;
      }
      .output-head {
        padding: 10px;
        border-bottom: 1px solid #2b4559;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      pre {
        margin: 0;
        padding: 12px;
        max-height: 460px;
        overflow: auto;
        color: #c6e4ff;
        font: 12px/1.45 'JetBrains Mono', monospace;
      }
      .ok {
        color: #8ae3c8;
      }
      .err {
        color: var(--bad);
      }
      @media (max-width: 1200px) {
        .grid {
          grid-template-columns: 1fr 1fr;
        }
      }
      @media (max-width: 900px) {
        .grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main class="layout">
      <section class="hero">
        <div class="row">
          <span class="badge"><span class="dot"></span><span id="status">connecting</span></span>
          <span class="badge" id="version-pill">v3</span>
          <span class="badge" id="device-pill">device: n/a</span>
          <span class="badge">port: 50000</span>
        </div>
        <h1 style="margin:0;font-size:1.5rem;">the-android-mcp v3 command center</h1>
        <p class="muted" id="subtitle">High-throughput local web UI with live backend integration and smartphone stress workflows.</p>
      </section>

      <section class="grid">
        <article class="card controls">
          <h2>Device operations</h2>
          <select id="device-select"></select>
          <input id="url-input" type="url" value="https://www.wikipedia.org" />
          <div class="split">
            <button class="btn-primary" id="open-url-btn">Open URL</button>
            <button class="btn-secondary" id="suite-btn">Run full snapshot suite</button>
          </div>
          <div class="quick-grid">
            <button class="btn-secondary quick-url" data-url="https://www.wikipedia.org">Wikipedia</button>
            <button class="btn-secondary quick-url" data-url="https://news.ycombinator.com">Hacker News</button>
            <button class="btn-secondary quick-url" data-url="https://developer.android.com">Android Docs</button>
            <button class="btn-secondary quick-url" data-url="https://www.youtube.com">YouTube</button>
          </div>
          <p class="muted">Update hint: <code>npm install -g the-android-mcp@latest</code></p>
        </article>

        <article class="card stack">
          <h2>Stress scenario</h2>
          <p class="muted">Runs URL loops and optional lightweight snapshots after each step.</p>
          <textarea id="stress-urls">https://www.wikipedia.org
https://news.ycombinator.com
https://developer.android.com</textarea>
          <div class="split">
            <input id="stress-loops" type="number" min="1" max="5" value="1" />
            <input id="stress-wait" type="number" min="200" max="6000" value="1200" />
          </div>
          <button class="btn-warning" id="stress-btn">Run stress scenario</button>
          <p class="muted">Fields: loops / wait-ms</p>
        </article>

        <article class="card stack">
          <h2>Live events</h2>
          <div id="events" class="events"></div>
        </article>

        <article class="card" style="grid-column: 1 / -1;">
          <h2>Snapshot actions</h2>
          <div class="quick-grid" style="grid-template-columns: repeat(auto-fit,minmax(180px,1fr));">
            <button class="btn-secondary snap-btn" data-endpoint="/api/snapshot/radio">Radio</button>
            <button class="btn-secondary snap-btn" data-endpoint="/api/snapshot/display">Display</button>
            <button class="btn-secondary snap-btn" data-endpoint="/api/snapshot/location">Location</button>
            <button class="btn-secondary snap-btn" data-endpoint="/api/snapshot/power-idle">Power/Idle</button>
            <button class="btn-secondary snap-btn" data-endpoint="/api/snapshot/package-inventory">Packages</button>
            <button class="btn-primary" id="refresh-state-btn">Refresh state</button>
          </div>
        </article>

        <article class="card" style="grid-column: 1 / -1;">
          <div class="output-wrap">
            <div class="output-head">
              <strong id="message" class="ok">Ready.</strong>
              <button class="btn-secondary" id="clear-output-btn" style="width:auto;padding:6px 10px;">Clear</button>
            </div>
            <pre id="output">{}</pre>
          </div>
        </article>
      </section>
    </main>

    <script>
      const state = {
        devices: [],
        deviceId: undefined,
        eventCount: 0,
      };

      const $status = document.getElementById('status');
      const $versionPill = document.getElementById('version-pill');
      const $devicePill = document.getElementById('device-pill');
      const $deviceSelect = document.getElementById('device-select');
      const $urlInput = document.getElementById('url-input');
      const $message = document.getElementById('message');
      const $output = document.getElementById('output');
      const $events = document.getElementById('events');
      const $stressUrls = document.getElementById('stress-urls');
      const $stressLoops = document.getElementById('stress-loops');
      const $stressWait = document.getElementById('stress-wait');

      function setMessage(text, isError) {
        $message.textContent = text;
        $message.classList.toggle('ok', !isError);
        $message.classList.toggle('err', !!isError);
      }

      function renderOutput(value) {
        $output.textContent = JSON.stringify(value, null, 2);
      }

      function addEvent(event) {
        const item = document.createElement('div');
        item.className = 'event';
        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = '[' + (event.at || new Date().toISOString()) + '] ' + (event.type || 'event');
        const text = document.createElement('div');
        text.textContent = event.message || '';
        item.appendChild(meta);
        item.appendChild(text);
        if (event.data) {
          const data = document.createElement('div');
          data.style.color = '#9ec1d9';
          data.style.marginTop = '4px';
          data.textContent = JSON.stringify(event.data);
          item.appendChild(data);
        }
        $events.prepend(item);
        while ($events.children.length > 80) {
          $events.removeChild($events.lastChild);
        }
      }

      async function api(path, method, body) {
        const response = await fetch(path, {
          method: method || 'GET',
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        });
        const json = await response.json().catch(function () { return {}; });
        if (!response.ok) {
          throw new Error((json && json.error) || ('HTTP ' + response.status));
        }
        return json;
      }

      async function refreshState() {
        const data = await api('/api/state');
        $status.textContent = data.connectedDeviceCount > 0 ? 'online' : 'no device';
        $versionPill.textContent = 'v' + data.version;
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
        state.deviceId = state.devices[0] ? state.devices[0].id : undefined;
        if (state.deviceId) {
          $deviceSelect.value = state.deviceId;
          $devicePill.textContent = 'device: ' + state.deviceId;
        } else {
          $devicePill.textContent = 'device: none';
        }
      }

      function currentDeviceId() {
        return state.deviceId || undefined;
      }

      async function openUrl(url) {
        setMessage('Opening URL: ' + url, false);
        const result = await api('/api/open-url', 'POST', {
          deviceId: currentDeviceId(),
          url,
          waitForReadyMs: 1200,
        });
        renderOutput(result);
        setMessage('URL opened', false);
      }

      async function runSnapshot(endpoint) {
        setMessage('Running snapshot: ' + endpoint, false);
        const result = await api(endpoint, 'POST', {
          deviceId: currentDeviceId(),
          packageName: 'com.android.chrome',
          includeRaw: false,
        });
        renderOutput(result);
        setMessage('Snapshot completed', false);
      }

      async function runSuite() {
        setMessage('Running full snapshot suite', false);
        const result = await api('/api/snapshot-suite', 'POST', {
          deviceId: currentDeviceId(),
          packageName: 'com.android.chrome',
        });
        renderOutput(result);
        setMessage('Snapshot suite completed', false);
      }

      async function runStress() {
        const urls = $stressUrls.value
          .split('\n')
          .map(function (line) { return line.trim(); })
          .filter(function (line) { return line.length > 0; });
        const loops = Number($stressLoops.value || '1');
        const waitForReadyMs = Number($stressWait.value || '1200');

        setMessage('Running stress scenario', false);
        const result = await api('/api/stress-run', 'POST', {
          deviceId: currentDeviceId(),
          urls,
          loops,
          waitForReadyMs,
          includeSnapshotAfterEach: true,
        });
        renderOutput(result);
        setMessage('Stress scenario completed', false);
      }

      function connectEvents() {
        const es = new EventSource('/api/events');
        es.onmessage = function (event) {
          try {
            const payload = JSON.parse(event.data);
            if (payload && payload.type && payload.type !== 'heartbeat') {
              addEvent(payload);
            }
          } catch (err) {
            // ignore
          }
        };
        es.onerror = function () {
          setMessage('Event stream reconnecting...', true);
        };
      }

      document.getElementById('open-url-btn').addEventListener('click', async function () {
        try {
          await openUrl($urlInput.value);
        } catch (error) {
          setMessage(String(error), true);
        }
      });

      for (const button of document.querySelectorAll('.quick-url')) {
        button.addEventListener('click', async function () {
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

      for (const button of document.querySelectorAll('.snap-btn')) {
        button.addEventListener('click', async function () {
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

      document.getElementById('suite-btn').addEventListener('click', async function () {
        try {
          await runSuite();
        } catch (error) {
          setMessage(String(error), true);
        }
      });

      document.getElementById('stress-btn').addEventListener('click', async function () {
        try {
          await runStress();
        } catch (error) {
          setMessage(String(error), true);
        }
      });

      document.getElementById('refresh-state-btn').addEventListener('click', async function () {
        try {
          await refreshState();
          await loadDevices();
          setMessage('State refreshed', false);
        } catch (error) {
          setMessage(String(error), true);
        }
      });

      document.getElementById('clear-output-btn').addEventListener('click', function () {
        renderOutput({});
      });

      $deviceSelect.addEventListener('change', function () {
        state.deviceId = $deviceSelect.value;
        $devicePill.textContent = 'device: ' + (state.deviceId || 'none');
      });

      async function init() {
        try {
          await refreshState();
          await loadDevices();
          const history = await api('/api/history?limit=30');
          const events = Array.isArray(history.events) ? history.events : [];
          for (let i = events.length - 1; i >= 0; i -= 1) {
            addEvent(events[i]);
          }
          connectEvents();
          renderOutput({ ok: true, message: 'UI ready', updateHint: '${UPDATE_HINT}' });
          setMessage('Ready.', false);
          setInterval(async function () {
            try {
              await refreshState();
              await loadDevices();
            } catch (err) {
              setMessage('Background refresh failed', true);
            }
          }, 10000);
        } catch (error) {
          setMessage(String(error), true);
        }
      }

      init();
    </script>
  </body>
</html>
`;

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
      await handleApi(request, response, { host, port });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pushEvent('api-error', 'API handler error', { message });
      sendJson(response, 500, { error: message });
    }
  });

  server.listen(port, host, () => {
    pushEvent('server-start', 'Web UI started', { host, port, version: pkg.version });
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
