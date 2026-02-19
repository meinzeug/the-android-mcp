#!/usr/bin/env node

import { spawn } from 'child_process';
import fs from 'fs';
import http, { IncomingMessage, ServerResponse } from 'http';
import net from 'net';
import os from 'os';
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
const MAX_EVENTS = 500;
const WORKFLOW_DIR = path.join(os.homedir(), '.the-android-mcp');
const WORKFLOW_FILE = path.join(WORKFLOW_DIR, 'web-ui-workflows.json');

const SNAPSHOT_KINDS = [
  'radio',
  'display',
  'location',
  'power-idle',
  'package-inventory',
] as const;
type SnapshotKind = (typeof SNAPSHOT_KINDS)[number];

type JsonObject = Record<string, unknown>;

interface UiEvent {
  id: number;
  at: string;
  type: string;
  message: string;
  data?: unknown;
}

interface MetricEntry {
  name: string;
  count: number;
  success: number;
  errors: number;
  totalDurationMs: number;
  lastDurationMs: number;
  lastError?: string;
  lastAt?: string;
}

interface WorkflowStep {
  type: 'open_url' | 'snapshot' | 'snapshot_suite' | 'sleep_ms';
  url?: string;
  waitForReadyMs?: number;
  snapshot?: SnapshotKind;
  packageName?: string;
  includeRaw?: boolean;
  durationMs?: number;
}

interface WorkflowDefinition {
  name: string;
  description?: string;
  updatedAt: string;
  steps: WorkflowStep[];
}

const serverStartedAt = Date.now();
let eventSeq = 1;
const eventHistory: UiEvent[] = [];
const sseClients = new Set<ServerResponse>();
const metrics: Record<string, MetricEntry> = {};
const snapshotCache: Partial<Record<SnapshotKind, unknown>> = {};
let workflows: Record<string, WorkflowDefinition> = loadWorkflows();

function nowIso(): string {
  return new Date().toISOString();
}

function isSnapshotKind(value: string): value is SnapshotKind {
  return SNAPSHOT_KINDS.includes(value as SnapshotKind);
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  const parsed = Math.trunc(value);
  return Math.max(min, Math.min(max, parsed));
}

function trackMetric(name: string, durationMs: number, ok: boolean, errorMessage?: string): void {
  const entry = metrics[name] ?? {
    name,
    count: 0,
    success: 0,
    errors: 0,
    totalDurationMs: 0,
    lastDurationMs: 0,
  };
  entry.count += 1;
  entry.totalDurationMs += durationMs;
  entry.lastDurationMs = durationMs;
  entry.lastAt = nowIso();
  if (ok) {
    entry.success += 1;
  } else {
    entry.errors += 1;
    entry.lastError = errorMessage;
  }
  metrics[name] = entry;
}

async function withMetric<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    trackMetric(name, Date.now() - startedAt, true);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    trackMetric(name, Date.now() - startedAt, false, message);
    throw error;
  }
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

function compactStringSummary(value: unknown): JsonObject {
  if (typeof value !== 'string') {
    return { type: typeof value };
  }
  return {
    length: value.length,
    lines: value.split('\n').length,
    preview: value.slice(0, 200),
  };
}

function summarizeObjectShape(input: unknown): JsonObject {
  if (!input || typeof input !== 'object') {
    return { type: typeof input };
  }

  const result: JsonObject = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === 'string') {
      result[key] = {
        length: value.length,
        lines: value.split('\n').length,
      };
      continue;
    }
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      result[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      result[key] = { type: 'array', length: value.length };
      continue;
    }
    if (typeof value === 'object' && value !== null) {
      result[key] = { type: 'object', keys: Object.keys(value as Record<string, unknown>).length };
      continue;
    }
    result[key] = { type: typeof value };
  }
  return result;
}

function normalizeWorkflowStep(value: unknown): WorkflowStep {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid workflow step (must be object)');
  }
  const step = value as Record<string, unknown>;
  const type = step.type;
  if (type !== 'open_url' && type !== 'snapshot' && type !== 'snapshot_suite' && type !== 'sleep_ms') {
    throw new Error('Invalid workflow step type');
  }

  const normalized: WorkflowStep = { type };

  if (type === 'open_url') {
    if (typeof step.url !== 'string' || !/^https?:\/\//i.test(step.url)) {
      throw new Error('Workflow open_url step requires valid url');
    }
    normalized.url = step.url;
    normalized.waitForReadyMs = clampInt(step.waitForReadyMs, 1200, 200, 10000);
    return normalized;
  }

  if (type === 'snapshot') {
    if (typeof step.snapshot !== 'string' || !isSnapshotKind(step.snapshot)) {
      throw new Error('Workflow snapshot step requires valid snapshot kind');
    }
    normalized.snapshot = step.snapshot;
    if (typeof step.packageName === 'string') {
      normalized.packageName = step.packageName;
    }
    normalized.includeRaw = step.includeRaw === true;
    return normalized;
  }

  if (type === 'snapshot_suite') {
    if (typeof step.packageName === 'string') {
      normalized.packageName = step.packageName;
    }
    return normalized;
  }

  normalized.durationMs = clampInt(step.durationMs, 500, 50, 20000);
  return normalized;
}

function ensureWorkflowStore(): void {
  if (!fs.existsSync(WORKFLOW_DIR)) {
    fs.mkdirSync(WORKFLOW_DIR, { recursive: true });
  }
}

function defaultWorkflows(): Record<string, WorkflowDefinition> {
  const createdAt = nowIso();
  const smoke: WorkflowDefinition = {
    name: 'smoke-web-flow',
    description: 'Open three URLs and capture radio/display quickly.',
    updatedAt: createdAt,
    steps: [
      { type: 'open_url', url: 'https://www.wikipedia.org', waitForReadyMs: 1000 },
      { type: 'snapshot', snapshot: 'radio' },
      { type: 'open_url', url: 'https://news.ycombinator.com', waitForReadyMs: 1000 },
      { type: 'snapshot', snapshot: 'display' },
      { type: 'open_url', url: 'https://developer.android.com', waitForReadyMs: 1000 },
    ],
  };
  const diagnostic: WorkflowDefinition = {
    name: 'diagnostic-suite',
    description: 'Capture full v3 snapshot suite for current device.',
    updatedAt: createdAt,
    steps: [{ type: 'snapshot_suite', packageName: 'com.android.chrome' }],
  };

  return {
    [smoke.name]: smoke,
    [diagnostic.name]: diagnostic,
  };
}

function loadWorkflows(): Record<string, WorkflowDefinition> {
  try {
    ensureWorkflowStore();
    if (!fs.existsSync(WORKFLOW_FILE)) {
      const defaults = defaultWorkflows();
      fs.writeFileSync(WORKFLOW_FILE, JSON.stringify(defaults, null, 2), 'utf8');
      return defaults;
    }

    const raw = fs.readFileSync(WORKFLOW_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return defaultWorkflows();
    }

    const result: Record<string, WorkflowDefinition> = {};
    for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') {
        continue;
      }
      const item = value as Record<string, unknown>;
      if (typeof item.name !== 'string' || item.name.trim().length === 0) {
        continue;
      }
      const stepsValue = Array.isArray(item.steps) ? item.steps : [];
      const steps = stepsValue.map(step => normalizeWorkflowStep(step));
      result[name] = {
        name,
        description: typeof item.description === 'string' ? item.description : undefined,
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : nowIso(),
        steps,
      };
    }

    if (Object.keys(result).length === 0) {
      return defaultWorkflows();
    }

    return result;
  } catch {
    return defaultWorkflows();
  }
}

function saveWorkflows(): void {
  ensureWorkflowStore();
  fs.writeFileSync(WORKFLOW_FILE, JSON.stringify(workflows, null, 2), 'utf8');
}

function workflowsList(): WorkflowDefinition[] {
  return Object.values(workflows).sort((a, b) => a.name.localeCompare(b.name));
}

async function sleepMs(durationMs: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, durationMs));
}

function extractDeviceId(body: JsonObject): string | undefined {
  const value = body.deviceId;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function captureSnapshot(kind: SnapshotKind, options: {
  deviceId?: string;
  packageName?: string;
  includeRaw?: boolean;
}): JsonObject {
  const includeRaw = options.includeRaw === true;

  if (kind === 'radio') {
    const raw = captureAndroidRadioSnapshot({ deviceId: options.deviceId });
    snapshotCache[kind] = raw;
    return {
      kind,
      deviceId: raw.deviceId,
      capturedAt: raw.capturedAt,
      summary: summarizeObjectShape(raw),
      raw: includeRaw ? raw : undefined,
    };
  }

  if (kind === 'display') {
    const raw = captureAndroidDisplaySnapshot({ deviceId: options.deviceId });
    snapshotCache[kind] = raw;
    return {
      kind,
      deviceId: raw.deviceId,
      capturedAt: raw.capturedAt,
      summary: summarizeObjectShape(raw),
      raw: includeRaw ? raw : undefined,
    };
  }

  if (kind === 'location') {
    const raw = captureAndroidLocationSnapshot({
      deviceId: options.deviceId,
      packageName: options.packageName,
    });
    snapshotCache[kind] = raw;
    return {
      kind,
      deviceId: raw.deviceId,
      capturedAt: raw.capturedAt,
      summary: summarizeObjectShape(raw),
      raw: includeRaw ? raw : undefined,
    };
  }

  if (kind === 'power-idle') {
    const raw = captureAndroidPowerIdleSnapshot({
      deviceId: options.deviceId,
      batteryStatsLines: 450,
    });
    snapshotCache[kind] = raw;
    return {
      kind,
      deviceId: raw.deviceId,
      capturedAt: raw.capturedAt,
      summary: summarizeObjectShape(raw),
      raw: includeRaw ? raw : undefined,
    };
  }

  const raw = captureAndroidPackageInventorySnapshot({
    deviceId: options.deviceId,
    includePackagePaths: false,
    packageListLines: 1200,
  });
  snapshotCache[kind] = raw;
  return {
    kind,
    deviceId: raw.deviceId,
    capturedAt: raw.capturedAt,
    summary: {
      packageCount: raw.packageCount,
      thirdPartyCount: raw.thirdPartyCount,
      systemCount: raw.systemCount,
      disabledCount: raw.disabledCount,
      features: compactStringSummary(raw.features),
    },
    raw: includeRaw ? raw : undefined,
  };
}

function diffSnapshot(prev: unknown, next: unknown): JsonObject {
  if (!prev || typeof prev !== 'object' || !next || typeof next !== 'object') {
    return { changedCount: 0, changed: [], note: 'No comparable snapshots' };
  }

  const a = prev as Record<string, unknown>;
  const b = next as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changed: JsonObject[] = [];

  for (const key of keys) {
    const oldValue = a[key];
    const newValue = b[key];

    if (typeof oldValue === 'string' || typeof newValue === 'string') {
      const oldText = typeof oldValue === 'string' ? oldValue : JSON.stringify(oldValue);
      const newText = typeof newValue === 'string' ? newValue : JSON.stringify(newValue);
      if (oldText !== newText) {
        changed.push({
          key,
          type: 'text',
          beforeLength: oldText.length,
          afterLength: newText.length,
        });
      }
      continue;
    }

    const oldJson = JSON.stringify(oldValue);
    const newJson = JSON.stringify(newValue);
    if (oldJson !== newJson) {
      changed.push({ key, type: 'value', before: oldValue, after: newValue });
    }
  }

  return {
    changedCount: changed.length,
    changed,
  };
}

function getSnapshotSuite(deviceId?: string, packageName?: string): JsonObject {
  const startedAt = Date.now();
  const radio = captureSnapshot('radio', { deviceId, includeRaw: true });
  const display = captureSnapshot('display', { deviceId, includeRaw: true });
  const location = captureSnapshot('location', { deviceId, packageName, includeRaw: true });
  const powerIdle = captureSnapshot('power-idle', { deviceId, includeRaw: true });
  const packageInventory = captureSnapshot('package-inventory', { deviceId, includeRaw: true });

  return {
    capturedAt: nowIso(),
    durationMs: Date.now() - startedAt,
    snapshots: {
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
    ? urlsValue.filter((entry): entry is string => typeof entry === 'string' && /^https?:\/\//i.test(entry))
    : [];
  const normalizedUrls =
    urls.length > 0
      ? urls
      : ['https://www.wikipedia.org', 'https://news.ycombinator.com', 'https://developer.android.com'];

  const loops = clampInt(body.loops, 1, 1, 5);
  const waitForReadyMs = clampInt(body.waitForReadyMs, 1000, 200, 6000);
  const includeSnapshotAfterEach = body.includeSnapshotAfterEach !== false;

  const startedAt = Date.now();
  const steps: JsonObject[] = [];

  for (let loop = 1; loop <= loops; loop += 1) {
    for (const url of normalizedUrls) {
      const actionStarted = Date.now();
      const open = openUrlInChrome(url, deviceId, {
        waitForReadyMs,
        fallbackToDefault: true,
      });

      const record: JsonObject = {
        kind: 'open_url',
        loop,
        url,
        strategy: open.strategy,
        deviceId: open.deviceId,
        durationMs: Date.now() - actionStarted,
      };

      if (includeSnapshotAfterEach) {
        const snapshotStarted = Date.now();
        const radio = captureAndroidRadioSnapshot({ deviceId: open.deviceId, includeWifiDump: false });
        const display = captureAndroidDisplaySnapshot({
          deviceId: open.deviceId,
          includeDisplayDump: false,
          includeWindowDump: false,
          includeSurfaceFlinger: false,
        });
        record.snapshot = {
          durationMs: Date.now() - snapshotStarted,
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

      steps.push(record);
    }
  }

  return {
    ok: true,
    scenario: 'stress-run',
    loops,
    waitForReadyMs,
    includeSnapshotAfterEach,
    urls: normalizedUrls,
    totalSteps: steps.length,
    durationMs: Date.now() - startedAt,
    steps,
    updateHint: UPDATE_HINT,
  };
}

async function runWorkflow(name: string, options: {
  deviceId?: string;
  packageName?: string;
  includeRaw?: boolean;
}): Promise<JsonObject> {
  const workflow = workflows[name];
  if (!workflow) {
    throw new Error(`Workflow '${name}' not found`);
  }

  const startedAt = Date.now();
  const outputs: JsonObject[] = [];

  for (const step of workflow.steps) {
    const stepStarted = Date.now();

    if (step.type === 'open_url') {
      const result = openUrlInChrome(step.url || 'https://www.wikipedia.org', options.deviceId, {
        waitForReadyMs: clampInt(step.waitForReadyMs, 1200, 200, 10000),
        fallbackToDefault: true,
      });
      outputs.push({
        step: 'open_url',
        url: step.url,
        strategy: result.strategy,
        deviceId: result.deviceId,
        durationMs: Date.now() - stepStarted,
      });
      continue;
    }

    if (step.type === 'snapshot') {
      const snapshotKind = step.snapshot || 'radio';
      const snapshot = captureSnapshot(snapshotKind, {
        deviceId: options.deviceId,
        packageName: step.packageName || options.packageName,
        includeRaw: step.includeRaw === true || options.includeRaw === true,
      });
      outputs.push({
        step: 'snapshot',
        snapshotKind,
        durationMs: Date.now() - stepStarted,
        snapshot,
      });
      continue;
    }

    if (step.type === 'snapshot_suite') {
      const suite = getSnapshotSuite(options.deviceId, step.packageName || options.packageName);
      outputs.push({
        step: 'snapshot_suite',
        durationMs: Date.now() - stepStarted,
        suite,
      });
      continue;
    }

    const duration = clampInt(step.durationMs, 500, 50, 20000);
    await sleepMs(duration);
    outputs.push({
      step: 'sleep_ms',
      durationMs: duration,
    });
  }

  return {
    ok: true,
    workflow: {
      name: workflow.name,
      description: workflow.description,
      updatedAt: workflow.updatedAt,
      stepCount: workflow.steps.length,
    },
    outputs,
    durationMs: Date.now() - startedAt,
    updateHint: UPDATE_HINT,
  };
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
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new Error('JSON body must be an object'));
          return;
        }
        resolve(parsed as JsonObject);
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

function buildStatePayload(host: string, port: number): JsonObject {
  const devices = getConnectedDevices();
  return {
    ok: true,
    service: 'the-android-mcp-web-ui',
    version: pkg.version,
    endpoint: `http://${host}:${port}`,
    updateHint: UPDATE_HINT,
    uptimeMs: Date.now() - serverStartedAt,
    connectedDevices: devices,
    connectedDeviceCount: devices.length,
    eventCount: eventHistory.length,
    workflowCount: Object.keys(workflows).length,
    snapshotKinds: SNAPSHOT_KINDS,
  };
}

function buildMetricsPayload(): JsonObject {
  const items = Object.values(metrics)
    .sort((a, b) => b.count - a.count)
    .map(item => ({
      ...item,
      avgDurationMs: item.count > 0 ? Math.round((item.totalDurationMs / item.count) * 100) / 100 : 0,
      successRate: item.count > 0 ? Math.round((item.success / item.count) * 10000) / 100 : 0,
    }));

  return {
    generatedAt: nowIso(),
    uptimeMs: Date.now() - serverStartedAt,
    totalActions: items.reduce((sum, item) => sum + item.count, 0),
    errors: items.reduce((sum, item) => sum + item.errors, 0),
    entries: items,
  };
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
    await withMetric('health', () => {
      sendJson(response, 200, {
        ok: true,
        service: 'the-android-mcp-web-ui',
        version: pkg.version,
        timestamp: nowIso(),
        updateHint: UPDATE_HINT,
      });
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/state') {
    await withMetric('state', () => {
      sendJson(response, 200, buildStatePayload(context.host, context.port));
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/devices') {
    await withMetric('devices', () => {
      const devices = getConnectedDevices();
      sendJson(response, 200, {
        devices,
        count: devices.length,
        updateHint: UPDATE_HINT,
      });
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/history') {
    await withMetric('history', () => {
      const limitRaw = Number(url.searchParams.get('limit') ?? '120');
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.trunc(limitRaw))) : 120;
      sendJson(response, 200, {
        count: Math.min(limit, eventHistory.length),
        events: eventHistory.slice(-limit),
      });
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/events') {
    await withMetric('events', () => {
      setupSse(request, response);
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/metrics') {
    await withMetric('metrics', () => {
      sendJson(response, 200, buildMetricsPayload());
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/workflows') {
    await withMetric('workflows-list', () => {
      sendJson(response, 200, {
        workflows: workflowsList(),
        count: Object.keys(workflows).length,
      });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/workflows') {
    await withMetric('workflows-save', async () => {
      const body = await readJsonBody(request);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const description = typeof body.description === 'string' ? body.description.trim() : undefined;
      const stepsRaw = Array.isArray(body.steps) ? body.steps : undefined;

      if (!name) {
        sendJson(response, 400, { error: 'name is required' });
        return;
      }
      if (!stepsRaw || stepsRaw.length === 0) {
        sendJson(response, 400, { error: 'steps must be a non-empty array' });
        return;
      }

      const steps = stepsRaw.map(step => normalizeWorkflowStep(step));
      const workflow: WorkflowDefinition = {
        name,
        description,
        updatedAt: nowIso(),
        steps,
      };
      workflows[name] = workflow;
      saveWorkflows();

      pushEvent('workflow-saved', 'Workflow saved', {
        name,
        stepCount: steps.length,
      });

      sendJson(response, 200, {
        ok: true,
        workflow,
      });
    });
    return;
  }

  if (method === 'DELETE' && pathname.startsWith('/api/workflows/')) {
    await withMetric('workflows-delete', () => {
      const name = decodeURIComponent(pathname.slice('/api/workflows/'.length));
      if (!name) {
        sendJson(response, 400, { error: 'workflow name is required' });
        return;
      }
      if (!workflows[name]) {
        sendJson(response, 404, { error: `workflow '${name}' not found` });
        return;
      }
      delete workflows[name];
      saveWorkflows();

      pushEvent('workflow-deleted', 'Workflow deleted', { name });

      sendJson(response, 200, { ok: true, name });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/workflows/run') {
    await withMetric('workflows-run', async () => {
      const body = await readJsonBody(request);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'name is required' });
        return;
      }

      const result = await runWorkflow(name, {
        deviceId: extractDeviceId(body),
        packageName: typeof body.packageName === 'string' ? body.packageName : undefined,
        includeRaw: body.includeRaw === true,
      });

      pushEvent('workflow-run', 'Workflow executed', {
        name,
        durationMs: result.durationMs,
      });

      sendJson(response, 200, result);
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/open-url') {
    await withMetric('open-url', async () => {
      const body = await readJsonBody(request);
      const targetUrl = typeof body.url === 'string' ? body.url.trim() : '';
      if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
        sendJson(response, 400, { error: 'url must be valid http/https URL' });
        return;
      }
      const deviceId = extractDeviceId(body);
      const waitForReadyMs = clampInt(body.waitForReadyMs, 1200, 200, 10000);

      const startedAt = Date.now();
      const result = openUrlInChrome(targetUrl, deviceId, {
        waitForReadyMs,
        fallbackToDefault: true,
      });

      pushEvent('open-url', 'Opened URL on device', {
        url: targetUrl,
        deviceId: result.deviceId,
        strategy: result.strategy,
        durationMs: Date.now() - startedAt,
      });

      sendJson(response, 200, {
        ok: true,
        result,
        durationMs: Date.now() - startedAt,
        updateHint: UPDATE_HINT,
      });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/snapshot-suite') {
    await withMetric('snapshot-suite', async () => {
      const body = await readJsonBody(request);
      const suite = getSnapshotSuite(
        extractDeviceId(body),
        typeof body.packageName === 'string' ? body.packageName : undefined
      );
      pushEvent('snapshot-suite', 'Captured full snapshot suite', {
        durationMs: suite.durationMs,
      });
      sendJson(response, 200, {
        ok: true,
        suite,
        updateHint: UPDATE_HINT,
      });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/snapshot/diff') {
    await withMetric('snapshot-diff', async () => {
      const body = await readJsonBody(request);
      const kindValue = typeof body.kind === 'string' ? body.kind : '';
      if (!isSnapshotKind(kindValue)) {
        sendJson(response, 400, { error: 'kind must be one of snapshot kinds' });
        return;
      }

      const prev = snapshotCache[kindValue];
      const fresh = captureSnapshot(kindValue, {
        deviceId: extractDeviceId(body),
        packageName: typeof body.packageName === 'string' ? body.packageName : undefined,
        includeRaw: true,
      });
      const currentRaw = (fresh.raw as unknown) ?? null;
      snapshotCache[kindValue] = currentRaw ?? snapshotCache[kindValue];
      const diff = diffSnapshot(prev, currentRaw);

      pushEvent('snapshot-diff', 'Captured snapshot diff', {
        kind: kindValue,
        changedCount: diff.changedCount,
      });

      sendJson(response, 200, {
        ok: true,
        kind: kindValue,
        hadPrevious: Boolean(prev),
        diff,
        currentSummary: fresh.summary,
        updateHint: UPDATE_HINT,
      });
    });
    return;
  }

  if (method === 'POST' && pathname.startsWith('/api/snapshot/')) {
    await withMetric('snapshot-kind', async () => {
      const body = await readJsonBody(request);
      const kindValue = pathname.slice('/api/snapshot/'.length);
      if (!isSnapshotKind(kindValue)) {
        sendJson(response, 404, { error: 'snapshot endpoint not found' });
        return;
      }

      const result = captureSnapshot(kindValue, {
        deviceId: extractDeviceId(body),
        packageName: typeof body.packageName === 'string' ? body.packageName : undefined,
        includeRaw: body.includeRaw === true,
      });

      pushEvent('snapshot', 'Captured snapshot', {
        kind: kindValue,
        deviceId: result.deviceId,
      });

      sendJson(response, 200, {
        ok: true,
        result,
        updateHint: UPDATE_HINT,
      });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/stress-run') {
    await withMetric('stress-run', async () => {
      const body = await readJsonBody(request);
      const result = runStressScenario(body);
      pushEvent('stress-run', 'Completed stress run', {
        totalSteps: result.totalSteps,
        durationMs: result.durationMs,
      });
      sendJson(response, 200, result);
    });
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
}

const INDEX_HTML = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>the-android-mcp web ui v3.2</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
    <style>
      :root {
        --bg0: #090f16;
        --bg1: #0f1d2b;
        --bg2: #193042;
        --card: #101f2cb3;
        --line: #2e4a6199;
        --text: #eaf3fb;
        --muted: #98b3c8;
        --ok: #8be3c6;
        --err: #ff7676;
        --acc0: #00c8a4;
        --acc1: #14a7ff;
        --warn: #ffb24d;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: 'Manrope', sans-serif;
        color: var(--text);
        min-height: 100vh;
        background:
          radial-gradient(1000px 500px at -5% -10%, #1e3246 0%, transparent 58%),
          radial-gradient(900px 500px at 110% -20%, #1f3f4d 0%, transparent 55%),
          linear-gradient(155deg, var(--bg0), var(--bg1) 44%, var(--bg2));
        padding: 16px;
      }
      .app { max-width: 1450px; margin: 0 auto; display: grid; gap: 12px; }
      .hero {
        border: 1px solid var(--line);
        border-radius: 18px;
        background: linear-gradient(135deg, #122536cc, #102334b3);
        padding: 14px;
        display: grid;
        gap: 6px;
      }
      .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      .pill {
        border: 1px solid #3b5d75;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 12px;
        font-family: 'JetBrains Mono', monospace;
        color: #bdd7ea;
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--acc0);
        box-shadow: 0 0 11px var(--acc0);
        display: inline-block;
        margin-right: 6px;
      }
      .grid {
        display: grid;
        gap: 10px;
        grid-template-columns: 1.1fr 1fr 1fr;
      }
      .card {
        border: 1px solid var(--line);
        border-radius: 14px;
        background: var(--card);
        backdrop-filter: blur(5px);
        padding: 10px;
      }
      .card h2 { margin: 0 0 7px 0; font-size: 0.98rem; }
      .stack { display: grid; gap: 8px; }
      .split { display: grid; gap: 8px; grid-template-columns: 1fr 1fr; }
      .quick { display: grid; gap: 6px; grid-template-columns: 1fr 1fr; }
      input, textarea, select, button {
        width: 100%;
        border: 1px solid #3b5d75;
        border-radius: 10px;
        background: #0f1c28;
        color: var(--text);
        padding: 9px;
        font: inherit;
      }
      textarea { min-height: 94px; resize: vertical; }
      button { cursor: pointer; font-weight: 700; transition: transform 120ms ease, filter 120ms ease; }
      button:hover { transform: translateY(-1px); filter: brightness(1.08); }
      .p { background: linear-gradient(130deg, #0d7666, #155f75); }
      .s { background: linear-gradient(130deg, #1d3348, #192b3c); }
      .w { background: linear-gradient(130deg, #7a5917, #61401f); }
      .events, .metrics {
        max-height: 300px;
        overflow: auto;
        border: 1px solid #2f4a61;
        border-radius: 10px;
        padding: 8px;
        background: #0b141d;
      }
      .event, .metric {
        border: 1px solid #2e4a61;
        border-radius: 8px;
        padding: 6px;
        margin-bottom: 6px;
        font-size: 12px;
      }
      .meta { color: #9fbad0; font-family: 'JetBrains Mono', monospace; font-size: 11px; }
      .out {
        border: 1px solid #2f4a61;
        border-radius: 14px;
        background: #0a121b;
        overflow: hidden;
      }
      .out-head {
        padding: 9px;
        border-bottom: 1px solid #2f4a61;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      pre {
        margin: 0;
        padding: 10px;
        max-height: 450px;
        overflow: auto;
        color: #c6e4ff;
        font: 12px/1.45 'JetBrains Mono', monospace;
      }
      .muted { margin: 0; color: var(--muted); font-size: 12px; }
      .ok { color: var(--ok); }
      .err { color: var(--err); }
      @media (max-width: 1200px) { .grid { grid-template-columns: 1fr 1fr; } }
      @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main class="app">
      <section class="hero">
        <div class="row">
          <span class="pill"><span class="dot"></span><span id="status">booting</span></span>
          <span class="pill" id="version-pill">v3</span>
          <span class="pill" id="device-pill">device: n/a</span>
          <span class="pill" id="workflow-pill">workflows: 0</span>
          <span class="pill">port: 50000</span>
        </div>
        <h1 style="margin:0;font-size:1.45rem;">the-android-mcp v3.2 command center</h1>
        <p class="muted">Live backend integration, workflow engine, snapshot diff, stress automation, and streaming events.</p>
      </section>

      <section class="grid">
        <article class="card stack">
          <h2>Device + URL actions</h2>
          <select id="device-select"></select>
          <input id="url-input" type="url" value="https://www.wikipedia.org" />
          <div class="split">
            <button class="p" id="open-url-btn">Open URL</button>
            <button class="p" id="suite-btn">Run suite</button>
          </div>
          <div class="quick">
            <button class="s quick-url" data-url="https://www.wikipedia.org">Wikipedia</button>
            <button class="s quick-url" data-url="https://news.ycombinator.com">Hacker News</button>
            <button class="s quick-url" data-url="https://developer.android.com">Android Docs</button>
            <button class="s quick-url" data-url="https://www.youtube.com">YouTube</button>
          </div>
          <p class="muted">Update hint: <code>npm install -g the-android-mcp@latest</code></p>
        </article>

        <article class="card stack">
          <h2>Snapshot + diff</h2>
          <select id="snapshot-kind">
            <option value="radio">radio</option>
            <option value="display">display</option>
            <option value="location">location</option>
            <option value="power-idle">power-idle</option>
            <option value="package-inventory">package-inventory</option>
          </select>
          <div class="split">
            <button class="s" id="snapshot-btn">Capture</button>
            <button class="w" id="snapshot-diff-btn">Capture diff</button>
          </div>
          <p class="muted">Diff compares latest capture with previous capture of same type.</p>
        </article>

        <article class="card stack">
          <h2>Stress run</h2>
          <textarea id="stress-urls">https://www.wikipedia.org
https://news.ycombinator.com
https://developer.android.com</textarea>
          <div class="split">
            <input id="stress-loops" type="number" min="1" max="5" value="1" />
            <input id="stress-wait" type="number" min="200" max="6000" value="1000" />
          </div>
          <button class="w" id="stress-btn">Run stress</button>
          <p class="muted">Config: loops / wait-ms</p>
        </article>

        <article class="card stack">
          <h2>Workflow engine</h2>
          <select id="workflow-select"></select>
          <input id="workflow-name" placeholder="workflow name" value="" />
          <textarea id="workflow-steps">[
  {"type":"open_url","url":"https://www.wikipedia.org","waitForReadyMs":1000},
  {"type":"snapshot","snapshot":"radio"},
  {"type":"open_url","url":"https://developer.android.com","waitForReadyMs":1000},
  {"type":"snapshot_suite","packageName":"com.android.chrome"}
]</textarea>
          <div class="split">
            <button class="p" id="workflow-save-btn">Save</button>
            <button class="p" id="workflow-run-btn">Run</button>
          </div>
          <button class="s" id="workflow-delete-btn">Delete selected</button>
        </article>

        <article class="card stack">
          <h2>Live events</h2>
          <div id="events" class="events"></div>
        </article>

        <article class="card stack">
          <h2>Backend metrics</h2>
          <div id="metrics" class="metrics"></div>
          <button class="s" id="refresh-state-btn">Refresh state</button>
        </article>

        <article class="card" style="grid-column: 1 / -1;">
          <div class="out">
            <div class="out-head">
              <strong id="message" class="ok">Ready.</strong>
              <button class="s" id="clear-output-btn" style="width:auto;padding:6px 10px;">Clear</button>
            </div>
            <pre id="output">{}</pre>
          </div>
        </article>
      </section>
    </main>

    <script>
      const state = {
        deviceId: undefined,
        workflows: [],
      };

      const $status = document.getElementById('status');
      const $versionPill = document.getElementById('version-pill');
      const $devicePill = document.getElementById('device-pill');
      const $workflowPill = document.getElementById('workflow-pill');
      const $deviceSelect = document.getElementById('device-select');
      const $urlInput = document.getElementById('url-input');
      const $message = document.getElementById('message');
      const $output = document.getElementById('output');
      const $events = document.getElementById('events');
      const $metrics = document.getElementById('metrics');
      const $snapshotKind = document.getElementById('snapshot-kind');
      const $stressUrls = document.getElementById('stress-urls');
      const $stressLoops = document.getElementById('stress-loops');
      const $stressWait = document.getElementById('stress-wait');
      const $workflowSelect = document.getElementById('workflow-select');
      const $workflowName = document.getElementById('workflow-name');
      const $workflowSteps = document.getElementById('workflow-steps');

      function setMessage(text, isError) {
        $message.textContent = text;
        $message.classList.toggle('ok', !isError);
        $message.classList.toggle('err', !!isError);
      }

      function renderOutput(value) {
        $output.textContent = JSON.stringify(value, null, 2);
      }

      function addEvent(event) {
        if (!event || !event.type || event.type === 'heartbeat') {
          return;
        }
        const item = document.createElement('div');
        item.className = 'event';
        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = '[' + (event.at || new Date().toISOString()) + '] ' + event.type;
        const message = document.createElement('div');
        message.textContent = event.message || '';
        item.appendChild(meta);
        item.appendChild(message);
        if (event.data) {
          const data = document.createElement('div');
          data.style.color = '#a5c6db';
          data.style.marginTop = '4px';
          data.textContent = JSON.stringify(event.data);
          item.appendChild(data);
        }
        $events.prepend(item);
        while ($events.children.length > 100) {
          $events.removeChild($events.lastChild);
        }
      }

      function renderMetrics(payload) {
        const entries = Array.isArray(payload.entries) ? payload.entries : [];
        $metrics.innerHTML = '';
        for (const entry of entries.slice(0, 20)) {
          const item = document.createElement('div');
          item.className = 'metric';
          item.innerHTML =
            '<div class="meta">' + entry.name + '</div>' +
            '<div>count=' + entry.count + ' success=' + entry.success + ' errors=' + entry.errors + '</div>' +
            '<div>avg=' + entry.avgDurationMs + 'ms successRate=' + entry.successRate + '%</div>';
          $metrics.appendChild(item);
        }
        if (!entries.length) {
          $metrics.textContent = 'No metrics yet.';
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

      function selectedDeviceId() {
        return state.deviceId || undefined;
      }

      async function refreshState() {
        const statePayload = await api('/api/state');
        $status.textContent = statePayload.connectedDeviceCount > 0 ? 'online' : 'no-device';
        $versionPill.textContent = 'v' + statePayload.version;
        $workflowPill.textContent = 'workflows: ' + statePayload.workflowCount;

        const devicesPayload = await api('/api/devices');
        const devices = Array.isArray(devicesPayload.devices) ? devicesPayload.devices : [];
        $deviceSelect.innerHTML = '';
        for (const device of devices) {
          const option = document.createElement('option');
          option.value = device.id;
          option.textContent = device.id + ' (' + (device.model || 'unknown') + ')';
          $deviceSelect.appendChild(option);
        }
        state.deviceId = devices[0] ? devices[0].id : undefined;
        if (state.deviceId) {
          $deviceSelect.value = state.deviceId;
          $devicePill.textContent = 'device: ' + state.deviceId;
        } else {
          $devicePill.textContent = 'device: none';
        }

        const workflowsPayload = await api('/api/workflows');
        state.workflows = Array.isArray(workflowsPayload.workflows) ? workflowsPayload.workflows : [];
        $workflowSelect.innerHTML = '';
        for (const workflow of state.workflows) {
          const option = document.createElement('option');
          option.value = workflow.name;
          option.textContent = workflow.name;
          $workflowSelect.appendChild(option);
        }
        if (state.workflows.length > 0) {
          const selected = state.workflows[0];
          $workflowSelect.value = selected.name;
          $workflowName.value = selected.name;
          $workflowSteps.value = JSON.stringify(selected.steps || [], null, 2);
        }

        const metricsPayload = await api('/api/metrics');
        renderMetrics(metricsPayload);
      }

      function connectEvents() {
        const es = new EventSource('/api/events');
        es.onmessage = function (event) {
          try {
            addEvent(JSON.parse(event.data));
          } catch (err) {
            // ignore
          }
        };
      }

      async function openUrl(url) {
        setMessage('Opening URL: ' + url, false);
        const result = await api('/api/open-url', 'POST', {
          deviceId: selectedDeviceId(),
          url: url,
          waitForReadyMs: 1000,
        });
        renderOutput(result);
        setMessage('URL opened', false);
      }

      async function captureSnapshot() {
        const kind = $snapshotKind.value;
        setMessage('Capturing snapshot: ' + kind, false);
        const result = await api('/api/snapshot/' + kind, 'POST', {
          deviceId: selectedDeviceId(),
          packageName: 'com.android.chrome',
          includeRaw: false,
        });
        renderOutput(result);
        setMessage('Snapshot captured', false);
      }

      async function captureSnapshotDiff() {
        const kind = $snapshotKind.value;
        setMessage('Capturing snapshot diff: ' + kind, false);
        const result = await api('/api/snapshot/diff', 'POST', {
          deviceId: selectedDeviceId(),
          packageName: 'com.android.chrome',
          kind: kind,
        });
        renderOutput(result);
        setMessage('Snapshot diff done', false);
      }

      async function runSuite() {
        setMessage('Running full suite', false);
        const result = await api('/api/snapshot-suite', 'POST', {
          deviceId: selectedDeviceId(),
          packageName: 'com.android.chrome',
        });
        renderOutput(result);
        setMessage('Suite done', false);
      }

      async function runStress() {
        setMessage('Running stress', false);
        const urls = $stressUrls.value
          .split('\n')
          .map(function (line) { return line.trim(); })
          .filter(function (line) { return line.length > 0; });
        const loops = Number($stressLoops.value || '1');
        const waitForReadyMs = Number($stressWait.value || '1000');

        const result = await api('/api/stress-run', 'POST', {
          deviceId: selectedDeviceId(),
          urls,
          loops,
          waitForReadyMs,
          includeSnapshotAfterEach: true,
        });
        renderOutput(result);
        setMessage('Stress run done', false);
      }

      async function saveWorkflow() {
        const name = ($workflowName.value || '').trim();
        if (!name) {
          throw new Error('workflow name required');
        }
        let steps;
        try {
          steps = JSON.parse($workflowSteps.value || '[]');
        } catch (error) {
          throw new Error('workflow steps must be valid JSON array');
        }
        const result = await api('/api/workflows', 'POST', {
          name,
          steps,
        });
        renderOutput(result);
        setMessage('Workflow saved', false);
        await refreshState();
      }

      async function runWorkflow() {
        const name = ($workflowSelect.value || '').trim();
        if (!name) {
          throw new Error('select workflow first');
        }
        const result = await api('/api/workflows/run', 'POST', {
          name,
          deviceId: selectedDeviceId(),
          packageName: 'com.android.chrome',
          includeRaw: false,
        });
        renderOutput(result);
        setMessage('Workflow done', false);
      }

      async function deleteWorkflow() {
        const name = ($workflowSelect.value || '').trim();
        if (!name) {
          throw new Error('select workflow first');
        }
        const result = await api('/api/workflows/' + encodeURIComponent(name), 'DELETE');
        renderOutput(result);
        setMessage('Workflow deleted', false);
        await refreshState();
      }

      document.getElementById('open-url-btn').addEventListener('click', async function () {
        try { await openUrl($urlInput.value); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('suite-btn').addEventListener('click', async function () {
        try { await runSuite(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('snapshot-btn').addEventListener('click', async function () {
        try { await captureSnapshot(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('snapshot-diff-btn').addEventListener('click', async function () {
        try { await captureSnapshotDiff(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('stress-btn').addEventListener('click', async function () {
        try { await runStress(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('workflow-save-btn').addEventListener('click', async function () {
        try { await saveWorkflow(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('workflow-run-btn').addEventListener('click', async function () {
        try { await runWorkflow(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('workflow-delete-btn').addEventListener('click', async function () {
        try { await deleteWorkflow(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('refresh-state-btn').addEventListener('click', async function () {
        try {
          await refreshState();
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

      $workflowSelect.addEventListener('change', function () {
        const selected = state.workflows.find(function (item) { return item.name === $workflowSelect.value; });
        if (selected) {
          $workflowName.value = selected.name;
          $workflowSteps.value = JSON.stringify(selected.steps || [], null, 2);
        }
      });

      async function init() {
        try {
          await refreshState();
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
              const metricsPayload = await api('/api/metrics');
              renderMetrics(metricsPayload);
            } catch (error) {
              setMessage('Metrics refresh failed', true);
            }
          }, 5000);
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
