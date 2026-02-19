#!/usr/bin/env node

import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import http, { IncomingMessage, ServerResponse } from 'http';
import net from 'net';
import os from 'os';
import path from 'path';
import { Duplex } from 'stream';
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
const MAX_EVENTS = 600;
const MAX_JOBS = 300;
const MAX_TIMELINE_POINTS = 480;

const APP_STATE_DIR = path.join(os.homedir(), '.the-android-mcp');
const WORKFLOW_FILE = path.join(APP_STATE_DIR, 'web-ui-workflows.json');
const SESSION_EVENTS_FILE = path.join(APP_STATE_DIR, 'web-ui-session-events.ndjson');
const QUEUE_PRESETS_FILE = path.join(APP_STATE_DIR, 'web-ui-queue-presets.json');
const RECORDER_SESSIONS_FILE = path.join(APP_STATE_DIR, 'web-ui-recorder-sessions.json');
const SCHEDULES_FILE = path.join(APP_STATE_DIR, 'web-ui-schedules.json');
const ALERT_RULES_FILE = path.join(APP_STATE_DIR, 'web-ui-alert-rules.json');
const DEVICE_BASELINES_FILE = path.join(APP_STATE_DIR, 'web-ui-device-baselines.json');

const SNAPSHOT_KINDS = [
  'radio',
  'display',
  'location',
  'power-idle',
  'package-inventory',
] as const;
type SnapshotKind = (typeof SNAPSHOT_KINDS)[number];

type JobType = 'open_url' | 'snapshot_suite' | 'stress_run' | 'workflow_run' | 'device_profile';

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

interface JobRecord {
  id: number;
  type: JobType;
  laneId: string;
  deviceId?: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  input: JsonObject;
  result?: unknown;
  error?: string;
}

interface LaneState {
  id: string;
  deviceId?: string;
  paused: boolean;
  active: boolean;
  queue: number[];
  completed: number;
  failed: number;
  cancelled: number;
  updatedAt: string;
}

interface TimelinePoint {
  id: number;
  at: string;
  reason: string;
  laneCount: number;
  pausedLaneCount: number;
  activeLaneCount: number;
  queueDepth: number;
  jobCount: number;
  completed: number;
  failed: number;
  cancelled: number;
}

interface QueuePreset {
  name: string;
  description?: string;
  updatedAt: string;
  jobs: Array<{ type: JobType; input: JsonObject }>;
}

interface RecorderEntry {
  at: string;
  type: JobType;
  input: JsonObject;
}

interface RecorderSession {
  name: string;
  startedAt: string;
  stoppedAt?: string;
  entries: RecorderEntry[];
}

interface OpsPolicy {
  maxQueuePerLane: number;
  autoPauseOnFailure: boolean;
  failurePauseThreshold: number;
  autoRetryFailedLimit: number;
}

interface ScheduleTask {
  id: number;
  name: string;
  runbook: string;
  everyMs: number;
  deviceId?: string;
  active: boolean;
  runs: number;
  failures: number;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastError?: string;
}

interface AlertRule {
  id: number;
  name: string;
  metric: 'queueDepth' | 'failedJobs' | 'pausedLanes';
  operator: 'gte' | 'lte';
  threshold: number;
  cooldownMs: number;
  enabled: boolean;
  updatedAt: string;
  lastTriggeredAt?: string;
}

interface AlertIncident {
  id: number;
  ruleId: number;
  ruleName: string;
  metric: string;
  value: number;
  threshold: number;
  at: string;
  acknowledgedAt?: string;
}

interface DeviceBaseline {
  name: string;
  deviceId?: string;
  capturedAt: string;
  profile: JsonObject;
}

const serverStartedAt = Date.now();
let eventSeq = 1;
let jobSeq = 1;
let timelineSeq = 1;
let scheduleSeq = 1;
let alertRuleSeq = 1;
let alertIncidentSeq = 1;

const eventHistory: UiEvent[] = [];
const dashboardTimeline: TimelinePoint[] = [];
const sseClients = new Set<ServerResponse>();
const wsClients = new Set<Duplex>();

const metrics: Record<string, MetricEntry> = {};
const snapshotCache: Partial<Record<SnapshotKind, unknown>> = {};

let workflows: Record<string, WorkflowDefinition> = loadWorkflows();
let queuePresets: Record<string, QueuePreset> = loadQueuePresets();
let recorderSessions: Record<string, RecorderSession> = loadRecorderSessions();
let activeRecorder: RecorderSession | null = null;
let opsPolicy: OpsPolicy = {
  maxQueuePerLane: 60,
  autoPauseOnFailure: true,
  failurePauseThreshold: 6,
  autoRetryFailedLimit: 15,
};
const jobs: JobRecord[] = [];
const lanes: Record<string, LaneState> = {};
const schedules: Record<number, ScheduleTask> = {};
const scheduleTimers: Record<number, NodeJS.Timeout> = {};
const scheduleRunning: Record<number, boolean> = {};
let alertRules: Record<number, AlertRule> = loadAlertRules();
const alertIncidents: AlertIncident[] = [];
let schedulesInitialized = false;
let deviceBaselines: Record<string, DeviceBaseline> = loadDeviceBaselines();

function nowIso(): string {
  return new Date().toISOString();
}

function ensureAppStateDir(): void {
  if (!fs.existsSync(APP_STATE_DIR)) {
    fs.mkdirSync(APP_STATE_DIR, { recursive: true });
  }
}

function appendSessionEvent(event: UiEvent): void {
  try {
    ensureAppStateDir();
    fs.appendFileSync(SESSION_EVENTS_FILE, `${JSON.stringify(event)}\n`, 'utf8');
  } catch {
    // ignore event persistence failures
  }
}

function isSnapshotKind(value: string): value is SnapshotKind {
  return SNAPSHOT_KINDS.includes(value as SnapshotKind);
}

function isJobType(value: string): value is JobType {
  return (
    value === 'open_url' ||
    value === 'snapshot_suite' ||
    value === 'stress_run' ||
    value === 'workflow_run' ||
    value === 'device_profile'
  );
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  const parsed = Math.trunc(value);
  return Math.max(min, Math.min(max, parsed));
}

function laneTotals(): {
  laneCount: number;
  pausedLaneCount: number;
  activeLaneCount: number;
  queueDepth: number;
  completed: number;
  failed: number;
  cancelled: number;
} {
  const laneValues = Object.values(lanes);
  return {
    laneCount: laneValues.length,
    pausedLaneCount: laneValues.filter(lane => lane.paused).length,
    activeLaneCount: laneValues.filter(lane => lane.active).length,
    queueDepth: laneValues.reduce((sum, lane) => sum + lane.queue.length, 0),
    completed: laneValues.reduce((sum, lane) => sum + lane.completed, 0),
    failed: laneValues.reduce((sum, lane) => sum + lane.failed, 0),
    cancelled: laneValues.reduce((sum, lane) => sum + lane.cancelled, 0),
  };
}

function getPolicyPayload(): JsonObject {
  return {
    maxQueuePerLane: opsPolicy.maxQueuePerLane,
    autoPauseOnFailure: opsPolicy.autoPauseOnFailure,
    failurePauseThreshold: opsPolicy.failurePauseThreshold,
    autoRetryFailedLimit: opsPolicy.autoRetryFailedLimit,
  };
}

function updatePolicy(input: JsonObject): OpsPolicy {
  opsPolicy = {
    maxQueuePerLane: clampInt(input.maxQueuePerLane, opsPolicy.maxQueuePerLane, 5, 500),
    autoPauseOnFailure: input.autoPauseOnFailure === undefined ? opsPolicy.autoPauseOnFailure : input.autoPauseOnFailure === true,
    failurePauseThreshold: clampInt(input.failurePauseThreshold, opsPolicy.failurePauseThreshold, 1, 200),
    autoRetryFailedLimit: clampInt(input.autoRetryFailedLimit, opsPolicy.autoRetryFailedLimit, 1, 300),
  };
  pushEvent('policy-updated', 'Ops policy updated', getPolicyPayload());
  return opsPolicy;
}

function alertMetricValue(metric: AlertRule['metric']): number {
  const totals = laneTotals();
  if (metric === 'queueDepth') {
    return totals.queueDepth;
  }
  if (metric === 'pausedLanes') {
    return totals.pausedLaneCount;
  }
  return jobs.filter(job => job.status === 'failed').length;
}

function listAlertRules(): AlertRule[] {
  return Object.values(alertRules).sort((a, b) => a.id - b.id);
}

function listAlertIncidents(limit: number): AlertIncident[] {
  const max = clampInt(limit, 120, 1, 1000);
  return alertIncidents.slice(-max).reverse();
}

function evaluateAlertRulesNow(): JsonObject {
  const now = Date.now();
  const created: AlertIncident[] = [];
  for (const rule of Object.values(alertRules)) {
    if (!rule.enabled) {
      continue;
    }
    const value = alertMetricValue(rule.metric);
    const matches = rule.operator === 'gte' ? value >= rule.threshold : value <= rule.threshold;
    if (!matches) {
      continue;
    }
    const lastTriggeredMs = rule.lastTriggeredAt ? Date.parse(rule.lastTriggeredAt) : 0;
    if (Number.isFinite(lastTriggeredMs) && lastTriggeredMs > 0 && now - lastTriggeredMs < rule.cooldownMs) {
      continue;
    }
    const incident: AlertIncident = {
      id: alertIncidentSeq++,
      ruleId: rule.id,
      ruleName: rule.name,
      metric: rule.metric,
      value,
      threshold: rule.threshold,
      at: nowIso(),
    };
    alertIncidents.push(incident);
    if (alertIncidents.length > 600) {
      alertIncidents.splice(0, alertIncidents.length - 600);
    }
    rule.lastTriggeredAt = incident.at;
    rule.updatedAt = nowIso();
    created.push(incident);
    pushEvent('alert-triggered', 'Alert rule triggered', {
      ruleId: rule.id,
      name: rule.name,
      metric: rule.metric,
      value,
      threshold: rule.threshold,
      incidentId: incident.id,
    });
  }
  if (created.length > 0) {
    saveAlertRules();
  }
  return {
    ok: true,
    createdCount: created.length,
    incidents: created,
  };
}

function captureTimelinePoint(reason: string): TimelinePoint {
  const totals = laneTotals();
  const point: TimelinePoint = {
    id: timelineSeq++,
    at: nowIso(),
    reason,
    laneCount: totals.laneCount,
    pausedLaneCount: totals.pausedLaneCount,
    activeLaneCount: totals.activeLaneCount,
    queueDepth: totals.queueDepth,
    jobCount: jobs.length,
    completed: totals.completed,
    failed: totals.failed,
    cancelled: totals.cancelled,
  };

  dashboardTimeline.push(point);
  if (dashboardTimeline.length > MAX_TIMELINE_POINTS) {
    dashboardTimeline.splice(0, dashboardTimeline.length - MAX_TIMELINE_POINTS);
  }
  return point;
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

  appendSessionEvent(event);
  broadcastEvent(event);
  captureTimelinePoint(type);
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
  broadcastWsEvent(event);
}

function buildWsTextFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  const length = payload.length;

  if (length <= 125) {
    const frame = Buffer.alloc(2 + length);
    frame[0] = 0x81;
    frame[1] = length;
    payload.copy(frame, 2);
    return frame;
  }

  if (length <= 65535) {
    const frame = Buffer.alloc(4 + length);
    frame[0] = 0x81;
    frame[1] = 126;
    frame.writeUInt16BE(length, 2);
    payload.copy(frame, 4);
    return frame;
  }

  const frame = Buffer.alloc(10 + length);
  frame[0] = 0x81;
  frame[1] = 127;
  frame.writeUInt32BE(0, 2);
  frame.writeUInt32BE(length, 6);
  payload.copy(frame, 10);
  return frame;
}

function broadcastWsEvent(event: UiEvent): void {
  const frame = buildWsTextFrame(JSON.stringify(event));
  for (const socket of wsClients) {
    if (socket.destroyed) {
      wsClients.delete(socket);
      continue;
    }
    try {
      socket.write(frame);
    } catch {
      wsClients.delete(socket);
      try {
        socket.destroy();
      } catch {
        // ignore
      }
    }
  }
}

function setupWebSocketUpgrade(server: http.Server): void {
  const wsGuid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

  server.on('upgrade', (request, socket) => {
    try {
      const pathname = request.url ? new URL(request.url, 'http://localhost').pathname : '/';
      if (pathname !== '/api/ws') {
        socket.destroy();
        return;
      }

      const key = request.headers['sec-websocket-key'];
      if (!key || typeof key !== 'string') {
        socket.destroy();
        return;
      }

      const accept = crypto
        .createHash('sha1')
        .update(`${key}${wsGuid}`)
        .digest('base64');

      const headers = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
      ];
      socket.write(`${headers.join('\r\n')}\r\n\r\n`);

      wsClients.add(socket);

      const hello: UiEvent = {
        id: eventSeq++,
        at: nowIso(),
        type: 'ws-hello',
        message: 'websocket-ready',
      };
      socket.write(buildWsTextFrame(JSON.stringify(hello)));

      socket.on('data', buffer => {
        if (!buffer || buffer.length < 2) {
          return;
        }
        const opcode = buffer[0] & 0x0f;
        if (opcode === 0x8) {
          wsClients.delete(socket);
          try {
            socket.end();
          } catch {
            // ignore
          }
          return;
        }
        if (opcode === 0x9) {
          try {
            socket.write(Buffer.from([0x8a, 0x00]));
          } catch {
            // ignore
          }
        }
      });

      const onClose = () => {
        wsClients.delete(socket);
      };
      socket.on('end', onClose);
      socket.on('close', onClose);
      socket.on('error', onClose);
    } catch {
      try {
        socket.destroy();
      } catch {
        // ignore
      }
    }
  });
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

function compactStringSummary(value: unknown): JsonObject {
  if (typeof value !== 'string') {
    return { type: typeof value };
  }
  return {
    length: value.length,
    lines: value.split('\n').length,
    preview: value.slice(0, 220),
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
    if (typeof value === 'object') {
      result[key] = { type: 'object', keys: Object.keys(value as Record<string, unknown>).length };
      continue;
    }
    result[key] = { type: typeof value };
  }
  return result;
}

function defaultWorkflows(): Record<string, WorkflowDefinition> {
  const createdAt = nowIso();
  return {
    'smoke-web-flow': {
      name: 'smoke-web-flow',
      description: 'Open URLs and collect lightweight snapshots.',
      updatedAt: createdAt,
      steps: [
        { type: 'open_url', url: 'https://www.wikipedia.org', waitForReadyMs: 900 },
        { type: 'snapshot', snapshot: 'radio' },
        { type: 'open_url', url: 'https://news.ycombinator.com', waitForReadyMs: 900 },
        { type: 'snapshot', snapshot: 'display' },
      ],
    },
    'diagnostic-suite': {
      name: 'diagnostic-suite',
      description: 'Run complete v3 snapshot suite.',
      updatedAt: createdAt,
      steps: [{ type: 'snapshot_suite', packageName: 'com.android.chrome' }],
    },
  };
}

function normalizeWorkflowStep(value: unknown): WorkflowStep {
  if (!value || typeof value !== 'object') {
    throw new Error('Workflow step must be an object');
  }
  const step = value as Record<string, unknown>;
  const type = step.type;

  if (type !== 'open_url' && type !== 'snapshot' && type !== 'snapshot_suite' && type !== 'sleep_ms') {
    throw new Error('Unsupported workflow step type');
  }

  const normalized: WorkflowStep = { type };

  if (type === 'open_url') {
    if (typeof step.url !== 'string' || !/^https?:\/\//i.test(step.url)) {
      throw new Error('open_url step requires valid url');
    }
    normalized.url = step.url;
    normalized.waitForReadyMs = clampInt(step.waitForReadyMs, 1000, 200, 10000);
    return normalized;
  }

  if (type === 'snapshot') {
    if (typeof step.snapshot !== 'string' || !isSnapshotKind(step.snapshot)) {
      throw new Error('snapshot step requires valid snapshot kind');
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

  normalized.durationMs = clampInt(step.durationMs, 500, 50, 30000);
  return normalized;
}

function loadWorkflows(): Record<string, WorkflowDefinition> {
  try {
    ensureAppStateDir();
    if (!fs.existsSync(WORKFLOW_FILE)) {
      const defaults = defaultWorkflows();
      fs.writeFileSync(WORKFLOW_FILE, JSON.stringify(defaults, null, 2), 'utf8');
      return defaults;
    }

    const raw = fs.readFileSync(WORKFLOW_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
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
      const stepsRaw = Array.isArray(item.steps) ? item.steps : [];
      const steps: WorkflowStep[] = [];
      for (const stepRaw of stepsRaw) {
        try {
          steps.push(normalizeWorkflowStep(stepRaw));
        } catch {
          // skip invalid step
        }
      }
      if (steps.length === 0) {
        continue;
      }
      result[name] = {
        name,
        description: typeof item.description === 'string' ? item.description : undefined,
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : nowIso(),
        steps,
      };
    }

    return Object.keys(result).length > 0 ? result : defaultWorkflows();
  } catch {
    return defaultWorkflows();
  }
}

function saveWorkflows(): void {
  ensureAppStateDir();
  fs.writeFileSync(WORKFLOW_FILE, JSON.stringify(workflows, null, 2), 'utf8');
}

function defaultQueuePresets(): Record<string, QueuePreset> {
  const createdAt = nowIso();
  return {
    'smoke-burst': {
      name: 'smoke-burst',
      description: 'Fast URL + profile queue bundle.',
      updatedAt: createdAt,
      jobs: [
        { type: 'open_url', input: { url: 'https://www.wikipedia.org', waitForReadyMs: 800 } },
        { type: 'open_url', input: { url: 'https://news.ycombinator.com', waitForReadyMs: 800 } },
        { type: 'device_profile', input: { packageName: 'com.android.chrome' } },
      ],
    },
    'diagnostic-heavy': {
      name: 'diagnostic-heavy',
      description: 'Heavy suite with stress + snapshot suite.',
      updatedAt: createdAt,
      jobs: [
        {
          type: 'stress_run',
          input: {
            urls: ['https://www.wikipedia.org', 'https://developer.android.com'],
            loops: 2,
            waitForReadyMs: 900,
            includeSnapshotAfterEach: true,
          },
        },
        { type: 'snapshot_suite', input: { packageName: 'com.android.chrome' } },
      ],
    },
  };
}

function normalizePresetJobs(input: unknown): Array<{ type: JobType; input: JsonObject }> {
  if (!Array.isArray(input)) {
    return [];
  }
  const jobs: Array<{ type: JobType; input: JsonObject }> = [];
  for (const itemRaw of input) {
    if (!itemRaw || typeof itemRaw !== 'object') {
      continue;
    }
    const item = itemRaw as Record<string, unknown>;
    const typeValue = typeof item.type === 'string' ? item.type : '';
    if (!isJobType(typeValue)) {
      continue;
    }
    const normalizedInput = item.input && typeof item.input === 'object' && !Array.isArray(item.input)
      ? (item.input as JsonObject)
      : {};
    jobs.push({ type: typeValue, input: normalizedInput });
  }
  return jobs;
}

function loadQueuePresets(): Record<string, QueuePreset> {
  try {
    ensureAppStateDir();
    if (!fs.existsSync(QUEUE_PRESETS_FILE)) {
      const defaults = defaultQueuePresets();
      fs.writeFileSync(QUEUE_PRESETS_FILE, JSON.stringify(defaults, null, 2), 'utf8');
      return defaults;
    }

    const raw = fs.readFileSync(QUEUE_PRESETS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return defaultQueuePresets();
    }

    const result: Record<string, QueuePreset> = {};
    for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') {
        continue;
      }
      const item = value as Record<string, unknown>;
      const presetName = typeof item.name === 'string' && item.name.trim().length > 0 ? item.name.trim() : name;
      if (!presetName) {
        continue;
      }
      const jobs = normalizePresetJobs(item.jobs);
      if (jobs.length === 0) {
        continue;
      }
      result[presetName] = {
        name: presetName,
        description: typeof item.description === 'string' ? item.description : undefined,
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : nowIso(),
        jobs,
      };
    }
    return Object.keys(result).length > 0 ? result : defaultQueuePresets();
  } catch {
    return defaultQueuePresets();
  }
}

function saveQueuePresets(): void {
  ensureAppStateDir();
  fs.writeFileSync(QUEUE_PRESETS_FILE, JSON.stringify(queuePresets, null, 2), 'utf8');
}

function queuePresetsList(): QueuePreset[] {
  return Object.values(queuePresets).sort((a, b) => a.name.localeCompare(b.name));
}

function loadRecorderSessions(): Record<string, RecorderSession> {
  try {
    ensureAppStateDir();
    if (!fs.existsSync(RECORDER_SESSIONS_FILE)) {
      fs.writeFileSync(RECORDER_SESSIONS_FILE, JSON.stringify({}, null, 2), 'utf8');
      return {};
    }
    const raw = fs.readFileSync(RECORDER_SESSIONS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const result: Record<string, RecorderSession> = {};
    for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') {
        continue;
      }
      const item = value as Record<string, unknown>;
      const sessionName = typeof item.name === 'string' && item.name.trim().length > 0 ? item.name.trim() : name;
      const entriesRaw = Array.isArray(item.entries) ? item.entries : [];
      const entries: RecorderEntry[] = [];
      for (const entryRaw of entriesRaw) {
        if (!entryRaw || typeof entryRaw !== 'object') {
          continue;
        }
        const entry = entryRaw as Record<string, unknown>;
        const typeValue = typeof entry.type === 'string' ? entry.type : '';
        if (!isJobType(typeValue)) {
          continue;
        }
        const entryInput = entry.input && typeof entry.input === 'object' && !Array.isArray(entry.input)
          ? (entry.input as JsonObject)
          : {};
        entries.push({
          at: typeof entry.at === 'string' ? entry.at : nowIso(),
          type: typeValue,
          input: entryInput,
        });
      }
      if (!sessionName || entries.length === 0) {
        continue;
      }
      result[sessionName] = {
        name: sessionName,
        startedAt: typeof item.startedAt === 'string' ? item.startedAt : nowIso(),
        stoppedAt: typeof item.stoppedAt === 'string' ? item.stoppedAt : undefined,
        entries,
      };
    }
    return result;
  } catch {
    return {};
  }
}

function saveRecorderSessions(): void {
  ensureAppStateDir();
  fs.writeFileSync(RECORDER_SESSIONS_FILE, JSON.stringify(recorderSessions, null, 2), 'utf8');
}

function defaultAlertRules(): Record<number, AlertRule> {
  const createdAt = nowIso();
  return {
    1: {
      id: 1,
      name: 'High queue depth',
      metric: 'queueDepth',
      operator: 'gte',
      threshold: 12,
      cooldownMs: 120000,
      enabled: true,
      updatedAt: createdAt,
    },
    2: {
      id: 2,
      name: 'Many failed jobs',
      metric: 'failedJobs',
      operator: 'gte',
      threshold: 3,
      cooldownMs: 120000,
      enabled: true,
      updatedAt: createdAt,
    },
  };
}

function loadAlertRules(): Record<number, AlertRule> {
  try {
    ensureAppStateDir();
    if (!fs.existsSync(ALERT_RULES_FILE)) {
      const defaults = defaultAlertRules();
      fs.writeFileSync(ALERT_RULES_FILE, JSON.stringify(defaults, null, 2), 'utf8');
      alertRuleSeq = 3;
      return defaults;
    }

    const raw = fs.readFileSync(ALERT_RULES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      const defaults = defaultAlertRules();
      alertRuleSeq = 3;
      return defaults;
    }

    const result: Record<number, AlertRule> = {};
    let maxId = 0;
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') {
        continue;
      }
      const item = value as Record<string, unknown>;
      const id = Number(item.id ?? key);
      if (!Number.isFinite(id) || id <= 0) {
        continue;
      }
      const metric = typeof item.metric === 'string' ? item.metric : '';
      const operator = typeof item.operator === 'string' ? item.operator : '';
      if (metric !== 'queueDepth' && metric !== 'failedJobs' && metric !== 'pausedLanes') {
        continue;
      }
      if (operator !== 'gte' && operator !== 'lte') {
        continue;
      }
      result[id] = {
        id,
        name: typeof item.name === 'string' && item.name.trim().length > 0 ? item.name : `rule-${id}`,
        metric,
        operator,
        threshold: clampInt(item.threshold, 1, 0, 100000),
        cooldownMs: clampInt(item.cooldownMs, 120000, 1000, 86400000),
        enabled: item.enabled !== false,
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : nowIso(),
        lastTriggeredAt: typeof item.lastTriggeredAt === 'string' ? item.lastTriggeredAt : undefined,
      };
      if (id > maxId) {
        maxId = id;
      }
    }

    if (Object.keys(result).length === 0) {
      const defaults = defaultAlertRules();
      alertRuleSeq = 3;
      return defaults;
    }

    alertRuleSeq = maxId + 1;
    return result;
  } catch {
    const defaults = defaultAlertRules();
    alertRuleSeq = 3;
    return defaults;
  }
}

function saveAlertRules(): void {
  ensureAppStateDir();
  fs.writeFileSync(ALERT_RULES_FILE, JSON.stringify(alertRules, null, 2), 'utf8');
}

function loadDeviceBaselines(): Record<string, DeviceBaseline> {
  try {
    ensureAppStateDir();
    if (!fs.existsSync(DEVICE_BASELINES_FILE)) {
      fs.writeFileSync(DEVICE_BASELINES_FILE, JSON.stringify({}, null, 2), 'utf8');
      return {};
    }
    const raw = fs.readFileSync(DEVICE_BASELINES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const result: Record<string, DeviceBaseline> = {};
    for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') {
        continue;
      }
      const item = value as Record<string, unknown>;
      const baselineName = typeof item.name === 'string' && item.name.trim().length > 0 ? item.name.trim() : name;
      if (!baselineName) {
        continue;
      }
      const profile = item.profile && typeof item.profile === 'object' && !Array.isArray(item.profile)
        ? (item.profile as JsonObject)
        : undefined;
      if (!profile) {
        continue;
      }
      result[baselineName] = {
        name: baselineName,
        deviceId: typeof item.deviceId === 'string' ? item.deviceId : undefined,
        capturedAt: typeof item.capturedAt === 'string' ? item.capturedAt : nowIso(),
        profile,
      };
    }
    return result;
  } catch {
    return {};
  }
}

function saveDeviceBaselines(): void {
  ensureAppStateDir();
  fs.writeFileSync(DEVICE_BASELINES_FILE, JSON.stringify(deviceBaselines, null, 2), 'utf8');
}

function listDeviceBaselines(): DeviceBaseline[] {
  return Object.values(deviceBaselines).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

function loadSchedules(): void {
  try {
    ensureAppStateDir();
    if (!fs.existsSync(SCHEDULES_FILE)) {
      fs.writeFileSync(SCHEDULES_FILE, JSON.stringify({ scheduleSeq: 1, schedules: {} }, null, 2), 'utf8');
      return;
    }
    const raw = fs.readFileSync(SCHEDULES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return;
    }
    const payload = parsed as Record<string, unknown>;
    const schedulesRaw = payload.schedules && typeof payload.schedules === 'object'
      ? (payload.schedules as Record<string, unknown>)
      : {};
    const restored: Record<number, ScheduleTask> = {};
    let maxId = 0;
    for (const value of Object.values(schedulesRaw)) {
      if (!value || typeof value !== 'object') {
        continue;
      }
      const item = value as Record<string, unknown>;
      const id = Number(item.id);
      if (!Number.isFinite(id) || id <= 0) {
        continue;
      }
      const runbook = typeof item.runbook === 'string' ? item.runbook : '';
      if (!runbook) {
        continue;
      }
      const task: ScheduleTask = {
        id,
        name: typeof item.name === 'string' && item.name.trim().length > 0 ? item.name : `schedule-${id}`,
        runbook,
        everyMs: clampInt(item.everyMs, 30000, 1000, 24 * 60 * 60 * 1000),
        deviceId: typeof item.deviceId === 'string' && item.deviceId.trim().length > 0 ? item.deviceId : undefined,
        active: item.active === true,
        runs: clampInt(item.runs, 0, 0, 1000000),
        failures: clampInt(item.failures, 0, 0, 1000000),
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : nowIso(),
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : nowIso(),
        lastRunAt: typeof item.lastRunAt === 'string' ? item.lastRunAt : undefined,
        lastError: typeof item.lastError === 'string' ? item.lastError : undefined,
      };
      restored[id] = task;
      if (id > maxId) {
        maxId = id;
      }
    }
    for (const id of Object.keys(schedules)) {
      delete schedules[Number(id)];
    }
    Object.assign(schedules, restored);

    const storedSeq = Number(payload.scheduleSeq);
    if (Number.isFinite(storedSeq) && storedSeq > maxId) {
      scheduleSeq = Math.trunc(storedSeq);
    } else {
      scheduleSeq = maxId + 1;
    }
  } catch {
    // ignore
  }
}

function saveSchedules(): void {
  ensureAppStateDir();
  const payload = {
    scheduleSeq,
    schedules,
  };
  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

function ensureSchedulesInitialized(): void {
  if (schedulesInitialized) {
    return;
  }
  loadSchedules();
  for (const task of Object.values(schedules)) {
    if (task.active) {
      startSchedule(task.id);
    }
  }
  schedulesInitialized = true;
}

function recorderSessionsList(): RecorderSession[] {
  const sessions = Object.values(recorderSessions).sort((a, b) => (b.stoppedAt || b.startedAt).localeCompare(a.stoppedAt || a.startedAt));
  const current = activeRecorder;
  if (current) {
    return [current, ...sessions.filter(item => item.name !== current.name)];
  }
  return sessions;
}

function workflowsList(): WorkflowDefinition[] {
  return Object.values(workflows).sort((a, b) => a.name.localeCompare(b.name));
}

function extractDeviceId(body: JsonObject): string | undefined {
  const value = body.deviceId;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

async function sleepMs(durationMs: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, durationMs));
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
    return { changedCount: 0, changed: [], note: 'No comparable snapshots available' };
  }

  const a = prev as Record<string, unknown>;
  const b = next as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changed: JsonObject[] = [];

  for (const key of keys) {
    const oldValue = a[key];
    const newValue = b[key];
    const oldJson = JSON.stringify(oldValue);
    const newJson = JSON.stringify(newValue);
    if (oldJson !== newJson) {
      changed.push({
        key,
        beforeType: typeof oldValue,
        afterType: typeof newValue,
        beforeSize: oldJson ? oldJson.length : 0,
        afterSize: newJson ? newJson.length : 0,
      });
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

function computeHealthScore(profile: JsonObject): number {
  let score = 100;
  const radio = profile.radio as JsonObject | undefined;
  const location = profile.location as JsonObject | undefined;
  const packages = profile.packages as JsonObject | undefined;

  if (radio && radio.airplaneMode === '1') {
    score -= 25;
  }
  if (location && location.mode === '0') {
    score -= 20;
  }
  if (packages && typeof packages.disabled === 'number' && packages.disabled > 20) {
    score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}

function buildDeviceProfile(deviceId?: string, packageName?: string): JsonObject {
  const startedAt = Date.now();
  const radio = captureAndroidRadioSnapshot({
    deviceId,
    includeWifiDump: false,
    includeTelephonyDump: false,
    includeBluetoothDump: false,
    includeIpState: true,
    includeConnectivityDump: false,
  });
  const display = captureAndroidDisplaySnapshot({
    deviceId,
    includeDisplayDump: false,
    includeWindowDump: false,
    includeSurfaceFlinger: false,
  });
  const location = captureAndroidLocationSnapshot({
    deviceId,
    packageName,
    includeLocationDump: false,
    includeLocationAppOps: true,
  });
  const power = captureAndroidPowerIdleSnapshot({
    deviceId,
    includePowerDump: false,
    includeDeviceIdle: false,
    includeBatteryStats: false,
    includeThermal: false,
  });
  const packages = captureAndroidPackageInventorySnapshot({
    deviceId,
    includeThirdParty: true,
    includeSystem: true,
    includeDisabled: true,
    includePackagePaths: false,
    includeFeatures: false,
    packageListLines: 600,
  });

  const profile: JsonObject = {
    capturedAt: nowIso(),
    durationMs: Date.now() - startedAt,
    deviceId: radio.deviceId,
    radio: {
      wifiEnabled: radio.wifiEnabled,
      mobileDataEnabled: radio.mobileDataEnabled,
      airplaneMode: radio.airplaneMode,
      bluetoothEnabled: radio.bluetoothEnabled,
    },
    display: {
      wmSize: display.wmSize,
      wmDensity: display.wmDensity,
      brightness: display.screenBrightness,
      rotation: display.userRotation,
    },
    location: {
      mode: location.locationMode,
      mockLocation: location.mockLocation,
      appOps: compactStringSummary(location.locationAppOps),
    },
    power: {
      battery: compactStringSummary(power.battery),
    },
    packages: {
      total: packages.packageCount,
      thirdParty: packages.thirdPartyCount,
      system: packages.systemCount,
      disabled: packages.disabledCount,
    },
  };

  profile.healthScore = computeHealthScore(profile);
  return profile;
}

function buildProfilesForDevices(deviceIds: string[], packageName?: string): JsonObject {
  const startedAt = Date.now();
  const profiles: JsonObject[] = [];

  for (const deviceId of deviceIds) {
    try {
      const profile = buildDeviceProfile(deviceId, packageName);
      profiles.push({ ok: true, deviceId, profile });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      profiles.push({ ok: false, deviceId, error: message });
    }
  }

  return {
    capturedAt: nowIso(),
    durationMs: Date.now() - startedAt,
    count: profiles.length,
    profiles,
  };
}

function buildDeviceWallboard(body: JsonObject): JsonObject {
  const packageName = typeof body.packageName === 'string' ? body.packageName : 'com.android.chrome';
  const requestedIds = Array.isArray(body.deviceIds)
    ? body.deviceIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
  const discovered = getConnectedDevices().map(device => device.id);
  const deviceIds = requestedIds.length > 0 ? requestedIds : discovered;
  const matrix = buildProfilesForDevices(deviceIds, packageName);
  const profiles = Array.isArray(matrix.profiles) ? matrix.profiles : [];

  const healthScores = profiles
    .map(item => {
      if (!item || typeof item !== 'object') {
        return undefined;
      }
      const obj = item as Record<string, unknown>;
      if (obj.ok !== true || !obj.profile || typeof obj.profile !== 'object') {
        return undefined;
      }
      const profile = obj.profile as Record<string, unknown>;
      return typeof profile.healthScore === 'number' ? profile.healthScore : undefined;
    })
    .filter((value): value is number => typeof value === 'number');

  const avgHealthScore = healthScores.length > 0
    ? Math.round((healthScores.reduce((sum, value) => sum + value, 0) / healthScores.length) * 100) / 100
    : 0;

  return {
    ok: true,
    generatedAt: nowIso(),
    packageName,
    deviceCount: deviceIds.length,
    avgHealthScore,
    profiles: matrix.profiles,
    updateHint: UPDATE_HINT,
  };
}

function buildLaneHeatmap(): JsonObject {
  const lanesData = Object.values(lanes).map(lane => {
    const terminal = lane.completed + lane.failed + lane.cancelled;
    const successRate = terminal > 0 ? Math.round((lane.completed / terminal) * 10000) / 100 : 0;
    const loadScore = Math.max(0, Math.min(100, lane.queue.length * 8 + (lane.active ? 18 : 0) + (lane.paused ? 20 : 0)));
    return {
      id: lane.id,
      deviceId: lane.deviceId,
      paused: lane.paused,
      active: lane.active,
      queueDepth: lane.queue.length,
      completed: lane.completed,
      failed: lane.failed,
      cancelled: lane.cancelled,
      successRate,
      loadScore,
      updatedAt: lane.updatedAt,
    };
  });

  const hottest = lanesData.slice().sort((a, b) => b.loadScore - a.loadScore).slice(0, 6);

  return {
    ok: true,
    generatedAt: nowIso(),
    laneCount: lanesData.length,
    lanes: lanesData,
    hottest,
  };
}

function runQueuePreset(nameRaw: string, options: { deviceId?: string }): JobRecord[] {
  const name = nameRaw.trim();
  const preset = queuePresets[name];
  if (!preset) {
    throw new Error(`Queue preset '${name}' not found`);
  }
  const created: JobRecord[] = [];
  for (const entry of preset.jobs) {
    const input = JSON.parse(JSON.stringify(entry.input)) as JsonObject;
    if (options.deviceId) {
      input.deviceId = options.deviceId;
    }
    created.push(createJob(entry.type, input));
  }
  pushEvent('queue-preset-run', 'Queue preset queued', {
    name,
    createdCount: created.length,
    deviceIdOverride: options.deviceId || null,
  });
  return created;
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

  const loops = clampInt(body.loops, 1, 1, 6);
  const waitForReadyMs = clampInt(body.waitForReadyMs, 1000, 200, 7000);
  const includeSnapshotAfterEach = body.includeSnapshotAfterEach !== false;

  const startedAt = Date.now();
  const steps: JsonObject[] = [];

  for (let loop = 1; loop <= loops; loop += 1) {
    for (const targetUrl of normalizedUrls) {
      const openStarted = Date.now();
      const open = openUrlInChrome(targetUrl, deviceId, {
        waitForReadyMs,
        fallbackToDefault: true,
      });
      const step: JsonObject = {
        kind: 'open_url',
        loop,
        url: targetUrl,
        strategy: open.strategy,
        deviceId: open.deviceId,
        durationMs: Date.now() - openStarted,
      };

      if (includeSnapshotAfterEach) {
        const snapStarted = Date.now();
        const radio = captureAndroidRadioSnapshot({ deviceId: open.deviceId, includeWifiDump: false });
        const display = captureAndroidDisplaySnapshot({
          deviceId: open.deviceId,
          includeDisplayDump: false,
          includeWindowDump: false,
          includeSurfaceFlinger: false,
        });
        step.snapshot = {
          durationMs: Date.now() - snapStarted,
          radio: {
            wifiEnabled: radio.wifiEnabled,
            mobileDataEnabled: radio.mobileDataEnabled,
            airplaneMode: radio.airplaneMode,
          },
          display: {
            wmSize: display.wmSize,
            wmDensity: display.wmDensity,
            brightness: display.screenBrightness,
          },
        };
      }

      steps.push(step);
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

function enqueueBurstScenario(body: JsonObject): JsonObject {
  const deviceId = extractDeviceId(body);
  const urlsValue = body.urls;
  const urls = Array.isArray(urlsValue)
    ? urlsValue.filter((entry): entry is string => typeof entry === 'string' && /^https?:\/\//i.test(entry))
    : [];
  const normalizedUrls =
    urls.length > 0
      ? urls
      : ['https://www.wikipedia.org', 'https://news.ycombinator.com', 'https://developer.android.com'];

  const loops = clampInt(body.loops, 2, 1, 12);
  const waitForReadyMs = clampInt(body.waitForReadyMs, 900, 200, 10000);
  const workflowNameRaw = typeof body.workflowName === 'string' ? body.workflowName.trim() : '';
  const workflowName = workflowNameRaw && workflows[workflowNameRaw] ? workflowNameRaw : undefined;
  const packageName = typeof body.packageName === 'string' ? body.packageName : 'com.android.chrome';

  const created: JobRecord[] = [];

  for (let loop = 1; loop <= loops; loop += 1) {
    for (const url of normalizedUrls) {
      created.push(
        createJob('open_url', {
          deviceId,
          url,
          waitForReadyMs,
          loop,
        })
      );
    }
    created.push(
      createJob('device_profile', {
        deviceId,
        packageName,
        loop,
      })
    );
    if (loop % 2 === 0) {
      created.push(
        createJob('snapshot_suite', {
          deviceId,
          packageName,
          loop,
        })
      );
    }
    if (workflowName) {
      created.push(
        createJob('workflow_run', {
          deviceId,
          name: workflowName,
          packageName,
          includeRaw: false,
          loop,
        })
      );
    }
  }

  pushEvent('scenario-burst-queued', 'Burst scenario queued into lanes', {
    createdCount: created.length,
    loops,
    urlCount: normalizedUrls.length,
    workflowName,
  });

  return {
    ok: true,
    scenario: 'burst',
    loops,
    urls: normalizedUrls,
    workflowName: workflowName ?? null,
    createdCount: created.length,
    jobIds: created.map(job => job.id),
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
        waitForReadyMs: clampInt(step.waitForReadyMs, 1000, 200, 10000),
        fallbackToDefault: true,
      });
      outputs.push({
        step: 'open_url',
        url: step.url,
        strategy: result.strategy,
        durationMs: Date.now() - stepStarted,
      });
      continue;
    }

    if (step.type === 'snapshot') {
      const kind = step.snapshot || 'radio';
      const snapshot = captureSnapshot(kind, {
        deviceId: options.deviceId,
        packageName: step.packageName || options.packageName,
        includeRaw: step.includeRaw === true || options.includeRaw === true,
      });
      outputs.push({
        step: 'snapshot',
        snapshotKind: kind,
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

    const duration = clampInt(step.durationMs, 500, 50, 30000);
    await sleepMs(duration);
    outputs.push({ step: 'sleep_ms', durationMs: duration });
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

function resolveLaneForDevice(deviceId?: string): LaneState {
  const laneId = deviceId ? `device:${deviceId}` : 'device:default';
  if (!lanes[laneId]) {
    lanes[laneId] = {
      id: laneId,
      deviceId,
      paused: false,
      active: false,
      queue: [],
      completed: 0,
      failed: 0,
      cancelled: 0,
      updatedAt: nowIso(),
    };
  }
  return lanes[laneId];
}

function startRecorder(nameRaw: string): RecorderSession {
  const name = nameRaw.trim();
  if (!name) {
    throw new Error('Recorder name is required');
  }
  if (activeRecorder && activeRecorder.name !== name) {
    throw new Error(`Recorder '${activeRecorder.name}' is already active`);
  }
  if (!activeRecorder) {
    activeRecorder = {
      name,
      startedAt: nowIso(),
      entries: [],
    };
    pushEvent('recorder-started', 'Recorder started', { name });
  }
  const recorder = activeRecorder;
  if (!recorder) {
    throw new Error('Failed to initialize recorder');
  }
  return recorder;
}

function stopRecorder(): RecorderSession {
  if (!activeRecorder) {
    throw new Error('No active recorder');
  }
  const finished: RecorderSession = {
    ...activeRecorder,
    stoppedAt: nowIso(),
  };
  recorderSessions[finished.name] = finished;
  saveRecorderSessions();
  activeRecorder = null;
  pushEvent('recorder-stopped', 'Recorder stopped', {
    name: finished.name,
    entries: finished.entries.length,
  });
  return finished;
}

function captureRecorderEntry(type: JobType, input: JsonObject): void {
  if (!activeRecorder) {
    return;
  }
  const clone = JSON.parse(JSON.stringify(input)) as JsonObject;
  activeRecorder.entries.push({
    at: nowIso(),
    type,
    input: clone,
  });
}

function replayRecorderSession(nameRaw: string, options: {
  deviceId?: string;
  limit?: number;
}): JobRecord[] {
  const name = nameRaw.trim();
  const session = recorderSessions[name];
  if (!session) {
    throw new Error(`Recorder session '${name}' not found`);
  }
  const limit = clampInt(options.limit, 200, 1, 1200);
  const entries = session.entries.slice(0, limit);
  const created: JobRecord[] = [];
  for (const entry of entries) {
    const input = JSON.parse(JSON.stringify(entry.input)) as JsonObject;
    if (options.deviceId) {
      input.deviceId = options.deviceId;
    }
    created.push(createJob(entry.type, input));
  }
  pushEvent('recorder-replay', 'Recorder session replay queued', {
    name,
    requested: entries.length,
    created: created.length,
    deviceIdOverride: options.deviceId || null,
  });
  return created;
}

function createJob(type: JobType, input: JsonObject): JobRecord {
  const rawDeviceId = typeof input.deviceId === 'string' ? input.deviceId : undefined;
  const lane = resolveLaneForDevice(rawDeviceId);

  const job: JobRecord = {
    id: jobSeq++,
    type,
    laneId: lane.id,
    deviceId: lane.deviceId,
    status: 'queued',
    createdAt: nowIso(),
    input,
  };

  jobs.unshift(job);
  if (jobs.length > MAX_JOBS) {
    jobs.splice(MAX_JOBS);
  }

  if (lane.queue.length >= opsPolicy.maxQueuePerLane) {
    pushEvent('policy-queue-pressure', 'Lane queue depth exceeded policy threshold', {
      laneId: lane.id,
      queueDepth: lane.queue.length,
      maxQueuePerLane: opsPolicy.maxQueuePerLane,
    });
  }

  lane.queue.push(job.id);
  lane.updatedAt = nowIso();
  captureRecorderEntry(type, input);

  pushEvent('job-queued', 'Job queued', {
    id: job.id,
    type: job.type,
    laneId: lane.id,
    queueDepth: lane.queue.length,
  });

  void scheduleLanes();
  return job;
}

function getJobById(id: number): JobRecord | undefined {
  return jobs.find(job => job.id === id);
}

function listJobSummaries(): JsonObject[] {
  return jobs
    .slice()
    .sort((a, b) => b.id - a.id)
    .map(job => ({
      id: job.id,
      type: job.type,
      laneId: job.laneId,
      deviceId: job.deviceId,
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      durationMs: job.durationMs,
      error: job.error,
    }));
}

function cancelQueuedJob(id: number): boolean {
  const job = getJobById(id);
  if (!job || job.status !== 'queued') {
    return false;
  }
  const lane = lanes[job.laneId];
  if (!lane) {
    return false;
  }

  const idx = lane.queue.indexOf(id);
  if (idx >= 0) {
    lane.queue.splice(idx, 1);
  }

  job.status = 'cancelled';
  job.finishedAt = nowIso();
  job.durationMs = 0;
  lane.cancelled += 1;
  lane.updatedAt = nowIso();

  pushEvent('job-cancelled', 'Job cancelled', { id, laneId: lane.id });
  return true;
}

function cancelQueuedJobs(input: { ids?: number[]; laneId?: string }): {
  cancelled: number;
  requested: number;
  ids: number[];
} {
  const laneFilter = typeof input.laneId === 'string' && input.laneId.length > 0 ? input.laneId : undefined;
  const requestedIds = Array.isArray(input.ids)
    ? input.ids.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    : undefined;

  const queueIds =
    requestedIds && requestedIds.length > 0
      ? requestedIds.map(id => Math.trunc(id))
      : Object.values(lanes)
          .filter(lane => !laneFilter || lane.id === laneFilter)
          .flatMap(lane => lane.queue.slice());

  let cancelled = 0;
  const cancelledIds: number[] = [];

  for (const id of queueIds) {
    if (cancelQueuedJob(id)) {
      cancelled += 1;
      cancelledIds.push(id);
    }
  }

  pushEvent('jobs-cancel-queued', 'Queued jobs cancelled', {
    cancelled,
    requested: queueIds.length,
    laneId: laneFilter,
  });

  return {
    cancelled,
    requested: queueIds.length,
    ids: cancelledIds,
  };
}

function promoteQueuedJob(id: number): { ok: boolean; reason?: string; laneId?: string; queueDepth?: number } {
  const job = getJobById(id);
  if (!job) {
    return { ok: false, reason: 'job not found' };
  }
  if (job.status !== 'queued') {
    return { ok: false, reason: 'job is not queued' };
  }
  const lane = lanes[job.laneId];
  if (!lane) {
    return { ok: false, reason: 'lane not found' };
  }
  const index = lane.queue.indexOf(id);
  if (index < 0) {
    return { ok: false, reason: 'job not in lane queue' };
  }

  if (index > 0) {
    lane.queue.splice(index, 1);
    lane.queue.unshift(id);
  }
  lane.updatedAt = nowIso();

  pushEvent('job-promoted', 'Queued job promoted to lane front', {
    id,
    laneId: lane.id,
    queueDepth: lane.queue.length,
  });

  void scheduleLanes();
  return { ok: true, laneId: lane.id, queueDepth: lane.queue.length };
}

function setLanePaused(laneId: string, paused: boolean): LaneState | undefined {
  const lane = lanes[laneId];
  if (!lane) {
    return undefined;
  }
  if (lane.paused === paused) {
    return lane;
  }

  lane.paused = paused;
  lane.updatedAt = nowIso();

  pushEvent(paused ? 'lane-paused' : 'lane-resumed', paused ? 'Lane paused' : 'Lane resumed', {
    laneId: lane.id,
    queueDepth: lane.queue.length,
  });

  if (!paused) {
    void scheduleLanes();
  }
  return lane;
}

function setAllLanesPaused(paused: boolean): number {
  let changed = 0;
  for (const lane of Object.values(lanes)) {
    if (lane.paused !== paused) {
      lane.paused = paused;
      lane.updatedAt = nowIso();
      changed += 1;
    }
  }

  pushEvent(paused ? 'lanes-paused' : 'lanes-resumed', paused ? 'All lanes paused' : 'All lanes resumed', {
    changed,
    laneCount: Object.keys(lanes).length,
  });

  if (!paused) {
    void scheduleLanes();
  }
  return changed;
}

function retryJob(id: number): JobRecord | undefined {
  const previous = getJobById(id);
  if (!previous) {
    return undefined;
  }
  if (previous.status !== 'failed' && previous.status !== 'completed' && previous.status !== 'cancelled') {
    return undefined;
  }

  const cloneInput = JSON.parse(JSON.stringify(previous.input)) as JsonObject;
  return createJob(previous.type, cloneInput);
}

function retryFailedJobs(options: { laneId?: string; limit?: number }): JobRecord[] {
  const laneId = typeof options.laneId === 'string' && options.laneId.length > 0 ? options.laneId : undefined;
  const limit = clampInt(options.limit, 30, 1, 200);
  const failed = jobs
    .filter(job => job.status === 'failed')
    .filter(job => !laneId || job.laneId === laneId)
    .sort((a, b) => a.id - b.id)
    .slice(0, limit);

  const created: JobRecord[] = [];
  for (const item of failed) {
    const cloneInput = JSON.parse(JSON.stringify(item.input)) as JsonObject;
    created.push(createJob(item.type, cloneInput));
  }

  pushEvent('jobs-retry-failed', 'Failed jobs re-queued', {
    laneId,
    requested: failed.length,
    created: created.length,
  });

  return created;
}

function pruneJobs(options: { statuses?: string[]; keepLatest?: number }): {
  removed: number;
  before: number;
  after: number;
  keepLatest: number;
  statuses: string[];
} {
  const terminalStatuses = new Set(['completed', 'failed', 'cancelled']);
  const requested = Array.isArray(options.statuses)
    ? options.statuses.filter(value => terminalStatuses.has(value))
    : ['completed', 'failed', 'cancelled'];
  const selectedStatuses = requested.length > 0 ? requested : ['completed', 'failed', 'cancelled'];
  const keepLatest = clampInt(options.keepLatest, 140, 0, MAX_JOBS);
  const before = jobs.length;

  const keepSet = new Set(selectedStatuses);
  let keptTerminal = 0;
  const next: JobRecord[] = [];

  for (const job of jobs) {
    if (job.status === 'queued' || job.status === 'running') {
      next.push(job);
      continue;
    }
    if (!keepSet.has(job.status)) {
      next.push(job);
      continue;
    }
    if (keptTerminal < keepLatest) {
      next.push(job);
      keptTerminal += 1;
    }
  }

  jobs.splice(0, jobs.length, ...next);
  const removed = before - jobs.length;

  pushEvent('jobs-pruned', 'Terminal jobs pruned from memory', {
    removed,
    keepLatest,
    statuses: selectedStatuses,
  });

  return {
    removed,
    before,
    after: jobs.length,
    keepLatest,
    statuses: selectedStatuses,
  };
}

function runJobsTransaction(body: JsonObject): {
  dryRun: boolean;
  atomic: boolean;
  acceptedCount: number;
  invalidCount: number;
  invalid: JsonObject[];
  jobs: JobRecord[];
} {
  const items = Array.isArray(body.jobs) ? body.jobs : [];
  const dryRun = body.dryRun === true;
  const atomic = body.atomic !== false;
  const deviceId = extractDeviceId(body);

  const accepted: Array<{ type: JobType; input: JsonObject }> = [];
  const invalid: JsonObject[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const itemRaw = items[index];
    if (!itemRaw || typeof itemRaw !== 'object') {
      invalid.push({ index, error: 'job item must be object' });
      continue;
    }
    const item = itemRaw as Record<string, unknown>;
    const typeValue = typeof item.type === 'string' ? item.type : '';
    if (!isJobType(typeValue)) {
      invalid.push({ index, error: 'invalid job type' });
      continue;
    }
    const input = item.input && typeof item.input === 'object' && !Array.isArray(item.input)
      ? (item.input as JsonObject)
      : {};
    if (deviceId && !input.deviceId) {
      input.deviceId = deviceId;
    }
    accepted.push({ type: typeValue, input });
  }

  if (atomic && invalid.length > 0) {
    return {
      dryRun,
      atomic,
      acceptedCount: 0,
      invalidCount: invalid.length,
      invalid,
      jobs: [],
    };
  }

  if (dryRun) {
    return {
      dryRun,
      atomic,
      acceptedCount: accepted.length,
      invalidCount: invalid.length,
      invalid,
      jobs: [],
    };
  }

  const jobsCreated: JobRecord[] = [];
  for (const entry of accepted) {
    jobsCreated.push(createJob(entry.type, entry.input));
  }

  pushEvent('jobs-transaction', 'Jobs transaction queued', {
    atomic,
    acceptedCount: jobsCreated.length,
    invalidCount: invalid.length,
  });

  return {
    dryRun,
    atomic,
    acceptedCount: jobsCreated.length,
    invalidCount: invalid.length,
    invalid,
    jobs: jobsCreated,
  };
}

function reorderLaneQueue(laneIdRaw: string, orderedJobIds: number[]): LaneState {
  const laneId = laneIdRaw.trim();
  if (!laneId) {
    throw new Error('laneId is required');
  }
  const lane = lanes[laneId];
  if (!lane) {
    throw new Error(`lane '${laneId}' not found`);
  }

  const existingQueued = lane.queue.filter(id => {
    const job = getJobById(id);
    return Boolean(job && job.status === 'queued');
  });
  const uniqueRequested = Array.from(new Set(orderedJobIds.filter(id => Number.isFinite(id)).map(id => Math.trunc(id))));
  const front = uniqueRequested.filter(id => existingQueued.includes(id));
  const tail = existingQueued.filter(id => !front.includes(id));
  lane.queue = [...front, ...tail];
  lane.updatedAt = nowIso();

  pushEvent('lane-queue-reordered', 'Lane queue reordered', {
    laneId: lane.id,
    frontCount: front.length,
    queueDepth: lane.queue.length,
  });

  return lane;
}

function moveQueuedJob(id: number, options: { targetLaneId?: string; targetDeviceId?: string }): JobRecord {
  const job = getJobById(id);
  if (!job) {
    throw new Error(`job ${id} not found`);
  }
  if (job.status !== 'queued') {
    throw new Error(`job ${id} is not queued`);
  }

  const sourceLane = lanes[job.laneId];
  if (!sourceLane) {
    throw new Error(`source lane '${job.laneId}' not found`);
  }

  const idx = sourceLane.queue.indexOf(job.id);
  if (idx >= 0) {
    sourceLane.queue.splice(idx, 1);
  }
  sourceLane.updatedAt = nowIso();

  let targetLane: LaneState | undefined;
  if (options.targetLaneId) {
    const laneId = options.targetLaneId.trim();
    if (!laneId) {
      throw new Error('targetLaneId cannot be empty');
    }
    targetLane = lanes[laneId];
    if (!targetLane) {
      if (laneId.startsWith('device:')) {
        targetLane = resolveLaneForDevice(laneId.slice('device:'.length));
      } else {
        throw new Error(`target lane '${laneId}' not found`);
      }
    }
  } else {
    targetLane = resolveLaneForDevice(options.targetDeviceId);
  }

  job.laneId = targetLane.id;
  job.deviceId = targetLane.deviceId;
  targetLane.queue.push(job.id);
  targetLane.updatedAt = nowIso();

  pushEvent('job-moved', 'Queued job moved across lanes', {
    id: job.id,
    fromLaneId: sourceLane.id,
    toLaneId: targetLane.id,
  });

  void scheduleLanes();
  return job;
}

function runOpsRunbook(body: JsonObject): JsonObject {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    throw new Error('runbook name is required');
  }
  const deviceId = extractDeviceId(body);
  const laneId = typeof body.laneId === 'string'
    ? body.laneId
    : (deviceId ? `device:${deviceId}` : 'device:default');
  const startedAt = Date.now();

  if (name === 'recover-lane') {
    const lane = lanes[laneId];
    if (lane) {
      setLanePaused(lane.id, false);
    }
    const retried = retryFailedJobs({
      laneId,
      limit: opsPolicy.autoRetryFailedLimit,
    });
    return {
      ok: true,
      runbook: name,
      laneId,
      resumed: Boolean(lane),
      retriedCount: retried.length,
      durationMs: Date.now() - startedAt,
      updateHint: UPDATE_HINT,
    };
  }

  if (name === 'purge-lane') {
    const cancelled = cancelQueuedJobs({ laneId });
    const pruned = pruneJobs({
      statuses: ['completed', 'failed', 'cancelled'],
      keepLatest: 100,
    });
    return {
      ok: true,
      runbook: name,
      laneId,
      cancelled,
      pruned,
      durationMs: Date.now() - startedAt,
      updateHint: UPDATE_HINT,
    };
  }

  if (name === 'smoke-now') {
    const smoke = runDeviceSmokeScenario({
      deviceId,
      url: typeof body.url === 'string' ? body.url : 'https://www.wikipedia.org',
      packageName: typeof body.packageName === 'string' ? body.packageName : 'com.android.chrome',
      waitForReadyMs: typeof body.waitForReadyMs === 'number' ? body.waitForReadyMs : 900,
    });
    return {
      ok: true,
      runbook: name,
      smoke,
      durationMs: Date.now() - startedAt,
      updateHint: UPDATE_HINT,
    };
  }

  if (name === 'autopilot-lite') {
    const autopilot = runAutopilot({
      deviceIds: deviceId ? [deviceId] : body.deviceIds,
      loops: 1,
      waitForReadyMs: typeof body.waitForReadyMs === 'number' ? body.waitForReadyMs : 700,
      urls: Array.isArray(body.urls) ? body.urls : ['https://www.wikipedia.org', 'https://news.ycombinator.com'],
      packageName: typeof body.packageName === 'string' ? body.packageName : 'com.android.chrome',
    });
    return {
      ok: true,
      runbook: name,
      autopilot,
      durationMs: Date.now() - startedAt,
      updateHint: UPDATE_HINT,
    };
  }

  throw new Error(`Unknown runbook '${name}'`);
}

function saveDeviceBaseline(nameRaw: string, body: JsonObject): DeviceBaseline {
  const name = nameRaw.trim();
  if (!name) {
    throw new Error('baseline name is required');
  }
  const profile = buildDeviceProfile(
    extractDeviceId(body),
    typeof body.packageName === 'string' ? body.packageName : 'com.android.chrome'
  );
  const baseline: DeviceBaseline = {
    name,
    deviceId: typeof profile.deviceId === 'string' ? profile.deviceId : undefined,
    capturedAt: nowIso(),
    profile,
  };
  deviceBaselines[name] = baseline;
  saveDeviceBaselines();
  pushEvent('device-baseline-saved', 'Device baseline saved', {
    name,
    deviceId: baseline.deviceId,
  });
  return baseline;
}

function compareWithDeviceBaseline(nameRaw: string, body: JsonObject): JsonObject {
  const name = nameRaw.trim();
  if (!name) {
    throw new Error('baseline name is required');
  }
  const baseline = deviceBaselines[name];
  if (!baseline) {
    throw new Error(`baseline '${name}' not found`);
  }
  const current = buildDeviceProfile(
    extractDeviceId(body),
    typeof body.packageName === 'string' ? body.packageName : 'com.android.chrome'
  );
  const diff = diffSnapshot(baseline.profile, current);
  const scoreBefore = typeof baseline.profile.healthScore === 'number' ? baseline.profile.healthScore : undefined;
  const scoreCurrent = typeof current.healthScore === 'number' ? current.healthScore : undefined;
  const scoreDelta = typeof scoreBefore === 'number' && typeof scoreCurrent === 'number'
    ? Math.round((scoreCurrent - scoreBefore) * 100) / 100
    : undefined;

  return {
    ok: true,
    baseline: {
      name: baseline.name,
      deviceId: baseline.deviceId,
      capturedAt: baseline.capturedAt,
      healthScore: scoreBefore,
    },
    current: {
      deviceId: current.deviceId,
      capturedAt: current.capturedAt,
      healthScore: scoreCurrent,
    },
    healthScoreDelta: scoreDelta,
    diff,
    updateHint: UPDATE_HINT,
  };
}

function buildDiagnosticsReport(host: string, port: number): JsonObject {
  const state = buildStatePayload(host, port);
  const heatmap = buildLaneHeatmap();
  const queueBoard = buildQueueBoard();
  const failedJobs = jobs
    .filter(job => job.status === 'failed')
    .slice(0, 30)
    .map(job => ({
      id: job.id,
      type: job.type,
      laneId: job.laneId,
      finishedAt: job.finishedAt,
      error: job.error,
    }));
  const alerts = {
    rules: listAlertRules(),
    incidents: listAlertIncidents(80),
  };

  const markdownLines = [
    '# the-android-mcp diagnostics report',
    '',
    `generatedAt: ${nowIso()}`,
    `endpoint: ${state.endpoint}`,
    `version: ${state.version}`,
    '',
    '## state',
    `- queueDepth: ${state.queueDepth}`,
    `- laneCount: ${state.laneCount}`,
    `- pausedLaneCount: ${state.pausedLaneCount}`,
    `- activeLaneCount: ${state.activeLaneCount}`,
    `- connectedDeviceCount: ${state.connectedDeviceCount}`,
    `- scheduleCount: ${state.scheduleCount}`,
    '',
    '## alerts',
    `- rules: ${alerts.rules.length}`,
    `- incidents: ${alerts.incidents.length}`,
    '',
    '## failed jobs (top)',
    ...failedJobs.slice(0, 10).map(item => `- #${item.id} ${item.type} lane=${item.laneId} error=${item.error || '-'}`),
  ];

  return {
    ok: true,
    generatedAt: nowIso(),
    state,
    heatmap,
    queueBoard,
    failedJobs,
    alerts,
    markdown: markdownLines.join('\n'),
    updateHint: UPDATE_HINT,
  };
}

function runbookCatalog(): JsonObject[] {
  return [
    {
      name: 'recover-lane',
      description: 'Resume lane and retry failed jobs according to policy.',
      required: [],
      optional: ['laneId', 'deviceId'],
    },
    {
      name: 'purge-lane',
      description: 'Cancel queued jobs for lane and prune terminal history.',
      required: [],
      optional: ['laneId', 'deviceId'],
    },
    {
      name: 'smoke-now',
      description: 'Open URL now and capture immediate device smoke profile.',
      required: [],
      optional: ['deviceId', 'url', 'waitForReadyMs', 'packageName'],
    },
    {
      name: 'autopilot-lite',
      description: 'Queue a lightweight autopilot burst for selected device(s).',
      required: [],
      optional: ['deviceId', 'deviceIds', 'urls', 'waitForReadyMs', 'packageName'],
    },
  ];
}

function previewRunbook(body: JsonObject): JsonObject {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    throw new Error('runbook name is required');
  }
  const deviceId = extractDeviceId(body);
  const laneId = typeof body.laneId === 'string'
    ? body.laneId
    : (deviceId ? `device:${deviceId}` : 'device:default');
  const queueDepth = lanes[laneId]?.queue.length ?? 0;

  if (name === 'recover-lane') {
    return {
      ok: true,
      runbook: name,
      laneId,
      preview: [
        'resume lane if paused',
        `retry failed jobs (limit=${opsPolicy.autoRetryFailedLimit})`,
      ],
      expectedEffects: {
        queueDepthAfter: `>= ${queueDepth}`,
      },
    };
  }
  if (name === 'purge-lane') {
    return {
      ok: true,
      runbook: name,
      laneId,
      preview: [
        'cancel queued jobs for lane',
        'prune terminal jobs, keep recent history',
      ],
      expectedEffects: {
        queueDepthAfter: 0,
      },
    };
  }
  if (name === 'smoke-now') {
    return {
      ok: true,
      runbook: name,
      laneId,
      preview: [
        'open target URL on device',
        'capture radio/display/location/power/package profile summary',
      ],
      expectedEffects: {
        addsEvents: ['open-url', 'device-smoke'],
      },
    };
  }
  if (name === 'autopilot-lite') {
    return {
      ok: true,
      runbook: name,
      laneId,
      preview: [
        'enqueue lightweight autopilot bundle',
        'execute open_url + device_profile per target device',
      ],
      expectedEffects: {
        queueDepthIncrease: '>= 2',
      },
    };
  }
  throw new Error(`Unknown runbook '${name}'`);
}

function exportQueueState(): JsonObject {
  const lanesExport: JsonObject[] = [];
  for (const lane of Object.values(lanes).sort((a, b) => a.id.localeCompare(b.id))) {
    const queued = lane.queue
      .map(id => getJobById(id))
      .filter((job): job is JobRecord => Boolean(job && job.status === 'queued'))
      .map(job => ({
        id: job.id,
        type: job.type,
        input: job.input,
      }));
    lanesExport.push({
      laneId: lane.id,
      deviceId: lane.deviceId,
      paused: lane.paused,
      queueDepth: lane.queue.length,
      queued,
    });
  }
  return {
    ok: true,
    exportedAt: nowIso(),
    laneCount: lanesExport.length,
    lanes: lanesExport,
  };
}

function importQueueState(body: JsonObject): JsonObject {
  const clearExisting = body.clearExisting === true;
  const lanesRaw = Array.isArray(body.lanes) ? body.lanes : [];
  if (clearExisting) {
    cancelQueuedJobs({});
  }
  const created: JobRecord[] = [];
  for (const laneRaw of lanesRaw) {
    if (!laneRaw || typeof laneRaw !== 'object') {
      continue;
    }
    const laneItem = laneRaw as Record<string, unknown>;
    const queuedRaw = Array.isArray(laneItem.queued) ? laneItem.queued : [];
    const targetDeviceId = typeof laneItem.deviceId === 'string' && laneItem.deviceId.trim().length > 0
      ? laneItem.deviceId.trim()
      : undefined;
    for (const queuedItemRaw of queuedRaw) {
      if (!queuedItemRaw || typeof queuedItemRaw !== 'object') {
        continue;
      }
      const queuedItem = queuedItemRaw as Record<string, unknown>;
      const typeValue = typeof queuedItem.type === 'string' ? queuedItem.type : '';
      if (!isJobType(typeValue)) {
        continue;
      }
      const input = queuedItem.input && typeof queuedItem.input === 'object' && !Array.isArray(queuedItem.input)
        ? (queuedItem.input as JsonObject)
        : {};
      if (targetDeviceId && !input.deviceId) {
        input.deviceId = targetDeviceId;
      }
      created.push(createJob(typeValue, input));
    }
  }
  pushEvent('queue-imported', 'Queue state imported', {
    createdCount: created.length,
    clearExisting,
  });
  return {
    ok: true,
    clearExisting,
    createdCount: created.length,
    jobs: created,
  };
}

function schedulesList(): JsonObject[] {
  return Object.values(schedules)
    .sort((a, b) => a.id - b.id)
    .map(task => ({
      id: task.id,
      name: task.name,
      runbook: task.runbook,
      everyMs: task.everyMs,
      deviceId: task.deviceId,
      active: task.active,
      runs: task.runs,
      failures: task.failures,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      lastRunAt: task.lastRunAt,
      lastError: task.lastError,
    }));
}

function stopSchedule(id: number): ScheduleTask | undefined {
  const task = schedules[id];
  if (!task) {
    return undefined;
  }
  if (scheduleTimers[id]) {
    clearInterval(scheduleTimers[id]);
    delete scheduleTimers[id];
  }
  delete scheduleRunning[id];
  task.active = false;
  task.updatedAt = nowIso();
  saveSchedules();
  pushEvent('schedule-stopped', 'Schedule stopped', { id, name: task.name });
  return task;
}

async function executeSchedule(task: ScheduleTask): Promise<void> {
  if (scheduleRunning[task.id]) {
    return;
  }
  scheduleRunning[task.id] = true;
  try {
    runOpsRunbook({
      name: task.runbook,
      deviceId: task.deviceId,
      packageName: 'com.android.chrome',
      waitForReadyMs: 900,
      url: 'https://www.wikipedia.org',
      urls: ['https://www.wikipedia.org', 'https://news.ycombinator.com'],
    });
    task.runs += 1;
    task.lastRunAt = nowIso();
    task.updatedAt = nowIso();
    saveSchedules();
    pushEvent('schedule-run', 'Schedule tick executed', {
      id: task.id,
      name: task.name,
      runbook: task.runbook,
      runs: task.runs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    task.failures += 1;
    task.lastError = message;
    task.updatedAt = nowIso();
    saveSchedules();
    pushEvent('schedule-run-failed', 'Schedule tick failed', {
      id: task.id,
      name: task.name,
      error: message,
      failures: task.failures,
    });
  } finally {
    delete scheduleRunning[task.id];
  }
}

function startSchedule(id: number): ScheduleTask | undefined {
  const task = schedules[id];
  if (!task) {
    return undefined;
  }
  if (scheduleTimers[id]) {
    clearInterval(scheduleTimers[id]);
  }
  task.active = true;
  task.updatedAt = nowIso();
  saveSchedules();
  scheduleTimers[id] = setInterval(() => {
    void executeSchedule(task);
  }, task.everyMs);
  pushEvent('schedule-started', 'Schedule started', {
    id: task.id,
    name: task.name,
    everyMs: task.everyMs,
  });
  return task;
}

function createSchedule(body: JsonObject): ScheduleTask {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const runbook = typeof body.runbook === 'string' ? body.runbook.trim() : '';
  if (!name) {
    throw new Error('name is required');
  }
  if (!runbook) {
    throw new Error('runbook is required');
  }
  const everyMs = clampInt(body.everyMs, 30000, 1000, 24 * 60 * 60 * 1000);
  const task: ScheduleTask = {
    id: scheduleSeq++,
    name,
    runbook,
    everyMs,
    deviceId: typeof body.deviceId === 'string' && body.deviceId.trim().length > 0 ? body.deviceId.trim() : undefined,
    active: false,
    runs: 0,
    failures: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  schedules[task.id] = task;
  saveSchedules();
  pushEvent('schedule-created', 'Schedule created', {
    id: task.id,
    name: task.name,
    runbook: task.runbook,
    everyMs: task.everyMs,
  });
  if (body.active === true) {
    startSchedule(task.id);
  }
  return task;
}

function deleteSchedule(id: number): boolean {
  const task = schedules[id];
  if (!task) {
    return false;
  }
  stopSchedule(id);
  delete schedules[id];
  saveSchedules();
  pushEvent('schedule-deleted', 'Schedule deleted', {
    id,
    name: task.name,
  });
  return true;
}

function runDeviceSmokeScenario(body: JsonObject): JsonObject {
  const deviceId = extractDeviceId(body);
  const packageName = typeof body.packageName === 'string' ? body.packageName : 'com.android.chrome';
  const url = typeof body.url === 'string' && /^https?:\/\//i.test(body.url)
    ? body.url
    : 'https://www.wikipedia.org';
  const waitForReadyMs = clampInt(body.waitForReadyMs, 900, 200, 10000);
  const startedAt = Date.now();

  const openResult = openUrlInChrome(url, deviceId, {
    waitForReadyMs,
    fallbackToDefault: true,
  });
  const profile = buildDeviceProfile(openResult.deviceId, packageName);
  const healthScore = typeof profile.healthScore === 'number' ? profile.healthScore : 0;

  const result = {
    ok: true,
    scenario: 'device-smoke',
    deviceId: openResult.deviceId,
    url,
    packageName,
    durationMs: Date.now() - startedAt,
    healthScore,
    pass: healthScore >= 45,
    openResult,
    profile,
    updateHint: UPDATE_HINT,
  };

  pushEvent('device-smoke', 'Device smoke scenario executed', {
    deviceId: result.deviceId,
    url: result.url,
    healthScore: result.healthScore,
    pass: result.pass,
    durationMs: result.durationMs,
  });

  return result;
}

function runAutopilot(body: JsonObject): JsonObject {
  const devicesRaw = Array.isArray(body.deviceIds)
    ? body.deviceIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
  const fallbackDevices = getConnectedDevices().map(device => device.id);
  const deviceIds = devicesRaw.length > 0 ? devicesRaw : fallbackDevices;

  if (deviceIds.length === 0) {
    throw new Error('No connected devices for autopilot');
  }

  const loops = clampInt(body.loops, 2, 1, 8);
  const waitForReadyMs = clampInt(body.waitForReadyMs, 900, 200, 10000);
  const packageName = typeof body.packageName === 'string' ? body.packageName : 'com.android.chrome';
  const workflowNameRaw = typeof body.workflowName === 'string' ? body.workflowName.trim() : '';
  const workflowName = workflowNameRaw && workflows[workflowNameRaw] ? workflowNameRaw : undefined;
  const urlsRaw = Array.isArray(body.urls)
    ? body.urls.filter((entry): entry is string => typeof entry === 'string' && /^https?:\/\//i.test(entry))
    : [];
  const urls = urlsRaw.length > 0
    ? urlsRaw
    : ['https://www.wikipedia.org', 'https://news.ycombinator.com', 'https://developer.android.com'];

  const created: JobRecord[] = [];

  for (const deviceId of deviceIds) {
    for (let loop = 1; loop <= loops; loop += 1) {
      for (const url of urls) {
        created.push(
          createJob('open_url', {
            deviceId,
            url,
            waitForReadyMs,
            loop,
          })
        );
      }

      created.push(
        createJob('device_profile', {
          deviceId,
          packageName,
          loop,
        })
      );

      if (loop % 2 === 0) {
        created.push(
          createJob('snapshot_suite', {
            deviceId,
            packageName,
            loop,
          })
        );
      }

      if (workflowName) {
        created.push(
          createJob('workflow_run', {
            deviceId,
            name: workflowName,
            packageName,
            includeRaw: false,
            loop,
          })
        );
      }
    }
  }

  pushEvent('autopilot-run', 'Autopilot job bundle queued', {
    deviceCount: deviceIds.length,
    loops,
    workflowName: workflowName ?? null,
    createdCount: created.length,
  });

  return {
    ok: true,
    scenario: 'autopilot',
    deviceIds,
    loops,
    urls,
    workflowName: workflowName ?? null,
    createdCount: created.length,
    jobIds: created.map(job => job.id),
    updateHint: UPDATE_HINT,
  };
}

async function executeJob(job: JobRecord): Promise<unknown> {
  if (job.type === 'open_url') {
    const urlValue = typeof job.input.url === 'string' ? job.input.url : '';
    if (!urlValue || !/^https?:\/\//i.test(urlValue)) {
      throw new Error('open_url job requires valid url');
    }
    const waitForReadyMs = clampInt(job.input.waitForReadyMs, 1000, 200, 10000);
    return openUrlInChrome(urlValue, job.deviceId, {
      waitForReadyMs,
      fallbackToDefault: true,
    });
  }

  if (job.type === 'snapshot_suite') {
    return getSnapshotSuite(
      job.deviceId,
      typeof job.input.packageName === 'string' ? job.input.packageName : undefined
    );
  }

  if (job.type === 'stress_run') {
    const input: JsonObject = { ...job.input };
    if (!input.deviceId && job.deviceId) {
      input.deviceId = job.deviceId;
    }
    return runStressScenario(input);
  }

  if (job.type === 'workflow_run') {
    const workflowName = typeof job.input.name === 'string' ? job.input.name : '';
    if (!workflowName) {
      throw new Error('workflow_run job requires name');
    }
    return await runWorkflow(workflowName, {
      deviceId: job.deviceId,
      packageName: typeof job.input.packageName === 'string' ? job.input.packageName : undefined,
      includeRaw: job.input.includeRaw === true,
    });
  }

  return buildDeviceProfile(
    job.deviceId,
    typeof job.input.packageName === 'string' ? job.input.packageName : undefined
  );
}

async function processLane(lane: LaneState): Promise<void> {
  if (lane.active || lane.paused) {
    return;
  }
  lane.active = true;
  lane.updatedAt = nowIso();

  while (lane.queue.length > 0) {
    if (lane.paused) {
      break;
    }

    const jobId = lane.queue.shift();
    if (!jobId) {
      continue;
    }

    const job = getJobById(jobId);
    if (!job || job.status !== 'queued') {
      continue;
    }

    job.status = 'running';
    job.startedAt = nowIso();
    lane.updatedAt = nowIso();

    pushEvent('job-running', 'Job started', {
      id: job.id,
      type: job.type,
      laneId: lane.id,
    });

    const startedAtMs = Date.now();
    try {
      const result = await executeJob(job);
      job.result = result;
      job.status = 'completed';
      job.finishedAt = nowIso();
      job.durationMs = Date.now() - startedAtMs;
      lane.completed += 1;
      lane.updatedAt = nowIso();

      pushEvent('job-completed', 'Job completed', {
        id: job.id,
        type: job.type,
        laneId: lane.id,
        durationMs: job.durationMs,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      job.status = 'failed';
      job.error = message;
      job.finishedAt = nowIso();
      job.durationMs = Date.now() - startedAtMs;
      lane.failed += 1;
      lane.updatedAt = nowIso();

       if (opsPolicy.autoPauseOnFailure && lane.failed >= opsPolicy.failurePauseThreshold) {
        lane.paused = true;
        lane.updatedAt = nowIso();
        pushEvent('lane-auto-paused', 'Lane auto-paused after failure threshold', {
          laneId: lane.id,
          failed: lane.failed,
          threshold: opsPolicy.failurePauseThreshold,
        });
      }

      pushEvent('job-failed', 'Job failed', {
        id: job.id,
        type: job.type,
        laneId: lane.id,
        error: message,
      });
    }
  }

  lane.active = false;
  lane.updatedAt = nowIso();
}

let laneSchedulerRunning = false;
async function scheduleLanes(): Promise<void> {
  if (laneSchedulerRunning) {
    return;
  }
  laneSchedulerRunning = true;

  const promises: Promise<void>[] = [];
  for (const lane of Object.values(lanes)) {
    if (lane.queue.length > 0 && !lane.active && !lane.paused) {
      promises.push(processLane(lane));
    }
  }
  await Promise.all(promises);

  laneSchedulerRunning = false;

  const hasPending = Object.values(lanes).some(lane => lane.queue.length > 0 && !lane.active && !lane.paused);
  if (hasPending) {
    void scheduleLanes();
  }
}

function lanesSummary(): JsonObject[] {
  return Object.values(lanes)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(lane => ({
      id: lane.id,
      deviceId: lane.deviceId,
      paused: lane.paused,
      active: lane.active,
      queueDepth: lane.queue.length,
      completed: lane.completed,
      failed: lane.failed,
      cancelled: lane.cancelled,
      updatedAt: lane.updatedAt,
    }));
}

function buildQueueBoard(): JsonObject {
  const laneItems = Object.values(lanes)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(lane => {
      const queuedJobs = lane.queue
        .map(id => getJobById(id))
        .filter((job): job is JobRecord => Boolean(job && job.status === 'queued'))
        .map(job => ({
          id: job.id,
          type: job.type,
          createdAt: job.createdAt,
          input: job.input,
        }));
      const runningJob = jobs.find(job => job.laneId === lane.id && job.status === 'running');
      return {
        id: lane.id,
        deviceId: lane.deviceId,
        paused: lane.paused,
        active: lane.active,
        queueDepth: lane.queue.length,
        queuedJobs,
        runningJob: runningJob ? {
          id: runningJob.id,
          type: runningJob.type,
          startedAt: runningJob.startedAt,
          input: runningJob.input,
        } : null,
      };
    });

  return {
    generatedAt: nowIso(),
    laneCount: laneItems.length,
    lanes: laneItems,
    updateHint: UPDATE_HINT,
  };
}

function resetSession(options: { keepWorkflows?: boolean }): void {
  eventHistory.splice(0, eventHistory.length);
  dashboardTimeline.splice(0, dashboardTimeline.length);
  activeRecorder = null;
  for (const id of Object.keys(scheduleTimers)) {
    clearInterval(scheduleTimers[Number(id)]);
    delete scheduleTimers[Number(id)];
  }
  for (const id of Object.keys(scheduleRunning)) {
    delete scheduleRunning[Number(id)];
  }
  for (const id of Object.keys(schedules)) {
    delete schedules[Number(id)];
  }
  saveSchedules();
  for (const key of Object.keys(metrics)) {
    delete metrics[key];
  }
  for (const key of Object.keys(snapshotCache)) {
    delete snapshotCache[key as SnapshotKind];
  }
  jobs.splice(0, jobs.length);
  for (const key of Object.keys(lanes)) {
    delete lanes[key];
  }
  if (!options.keepWorkflows) {
    workflows = defaultWorkflows();
    saveWorkflows();
  }
  pushEvent('session-reset', 'Session state reset', { keepWorkflows: options.keepWorkflows !== false });
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
  const totals = laneTotals();
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
    queuePresetCount: Object.keys(queuePresets).length,
    recorderSessionCount: Object.keys(recorderSessions).length + (activeRecorder ? 1 : 0),
    scheduleCount: Object.keys(schedules).length,
    laneCount: totals.laneCount,
    pausedLaneCount: totals.pausedLaneCount,
    activeLaneCount: totals.activeLaneCount,
    queueDepth: totals.queueDepth,
    jobCount: jobs.length,
    wsClientCount: wsClients.size,
    snapshotKinds: SNAPSHOT_KINDS,
  };
}

function buildDashboardPayload(host: string, port: number): JsonObject {
  const latest = dashboardTimeline[dashboardTimeline.length - 1];
  return {
    generatedAt: nowIso(),
    state: buildStatePayload(host, port),
    devices: getConnectedDevices(),
    workflows: workflowsList(),
    queuePresets: queuePresetsList(),
    recorder: {
      active: activeRecorder ? {
        name: activeRecorder.name,
        startedAt: activeRecorder.startedAt,
        entries: activeRecorder.entries.length,
      } : null,
      sessions: recorderSessionsList(),
    },
    lanes: lanesSummary(),
    jobs: listJobSummaries(),
    metrics: buildMetricsPayload(),
    timelineLatest: latest,
    timelinePointCount: dashboardTimeline.length,
    recentEvents: eventHistory.slice(-50),
  };
}

function buildOpsBoard(host: string, port: number): JsonObject {
  const recentFailedJobs = jobs
    .filter(job => job.status === 'failed')
    .slice(0, 20)
    .map(job => ({
      id: job.id,
      type: job.type,
      laneId: job.laneId,
      finishedAt: job.finishedAt,
      error: job.error,
    }));

  return {
    generatedAt: nowIso(),
    state: buildStatePayload(host, port),
    policy: getPolicyPayload(),
    heatmap: buildLaneHeatmap(),
    timeline: dashboardTimeline.slice(-40),
    recentFailedJobs,
    recorder: {
      active: activeRecorder ? {
        name: activeRecorder.name,
        startedAt: activeRecorder.startedAt,
        entries: activeRecorder.entries.length,
      } : null,
      sessions: recorderSessionsList().slice(0, 20),
    },
    alerts: {
      rules: listAlertRules(),
      incidents: listAlertIncidents(40),
    },
    schedules: schedulesList(),
    updateHint: UPDATE_HINT,
  };
}

function buildMetricsPayload(): JsonObject {
  const entries = Object.values(metrics)
    .sort((a, b) => b.count - a.count)
    .map(entry => ({
      ...entry,
      avgDurationMs: entry.count > 0 ? Math.round((entry.totalDurationMs / entry.count) * 100) / 100 : 0,
      successRate: entry.count > 0 ? Math.round((entry.success / entry.count) * 10000) / 100 : 0,
    }));

  return {
    generatedAt: nowIso(),
    uptimeMs: Date.now() - serverStartedAt,
    totalActions: entries.reduce((sum, item) => sum + item.count, 0),
    errors: entries.reduce((sum, item) => sum + item.errors, 0),
    entries,
  };
}

function buildSessionExport(): JsonObject {
  return {
    exportedAt: nowIso(),
    state: {
      uptimeMs: Date.now() - serverStartedAt,
      workflowCount: Object.keys(workflows).length,
      jobCount: jobs.length,
      laneCount: Object.keys(lanes).length,
      eventCount: eventHistory.length,
    },
    workflows,
    queuePresets,
    recorder: {
      activeRecorder,
      sessions: recorderSessions,
    },
    schedules,
    alerts: {
      rules: alertRules,
      incidents: alertIncidents,
    },
    lanes: lanesSummary(),
    jobs,
    metrics: buildMetricsPayload(),
    timeline: dashboardTimeline,
    events: eventHistory,
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

  if (method === 'GET' && pathname === '/api/policy') {
    await withMetric('policy-get', () => {
      sendJson(response, 200, {
        ok: true,
        policy: getPolicyPayload(),
      });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/policy') {
    await withMetric('policy-update', async () => {
      const body = await readJsonBody(request);
      const policy = updatePolicy(body);
      sendJson(response, 200, {
        ok: true,
        policy,
      });
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/alerts/rules') {
    await withMetric('alerts-rules-list', () => {
      sendJson(response, 200, {
        ok: true,
        rules: listAlertRules(),
      });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/alerts/rules') {
    await withMetric('alerts-rules-save', async () => {
      const body = await readJsonBody(request);
      const idRaw = Number(body.id);
      const id = Number.isFinite(idRaw) && idRaw > 0 ? Math.trunc(idRaw) : alertRuleSeq++;
      const metric = typeof body.metric === 'string' ? body.metric : '';
      const operator = typeof body.operator === 'string' ? body.operator : '';
      if (metric !== 'queueDepth' && metric !== 'failedJobs' && metric !== 'pausedLanes') {
        sendJson(response, 400, { error: 'metric must be queueDepth, failedJobs, or pausedLanes' });
        return;
      }
      if (operator !== 'gte' && operator !== 'lte') {
        sendJson(response, 400, { error: 'operator must be gte or lte' });
        return;
      }
      const name = typeof body.name === 'string' && body.name.trim().length > 0 ? body.name.trim() : `rule-${id}`;
      const rule: AlertRule = {
        id,
        name,
        metric,
        operator,
        threshold: clampInt(body.threshold, 1, 0, 100000),
        cooldownMs: clampInt(body.cooldownMs, 120000, 1000, 86400000),
        enabled: body.enabled !== false,
        updatedAt: nowIso(),
        lastTriggeredAt: alertRules[id]?.lastTriggeredAt,
      };
      alertRules[id] = rule;
      saveAlertRules();
      pushEvent('alert-rule-saved', 'Alert rule saved', { id, name });
      sendJson(response, 200, { ok: true, rule });
    });
    return;
  }

  if (method === 'DELETE' && /^\/api\/alerts\/rules\/\d+$/.test(pathname)) {
    await withMetric('alerts-rules-delete', () => {
      const id = Number(pathname.split('/')[4]);
      if (!alertRules[id]) {
        sendJson(response, 404, { error: `alert rule ${id} not found` });
        return;
      }
      delete alertRules[id];
      saveAlertRules();
      pushEvent('alert-rule-deleted', 'Alert rule deleted', { id });
      sendJson(response, 200, { ok: true, id });
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/alerts/incidents') {
    await withMetric('alerts-incidents-list', () => {
      const limitRaw = Number(url.searchParams.get('limit') ?? '120');
      sendJson(response, 200, {
        ok: true,
        incidents: listAlertIncidents(limitRaw),
      });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/alerts/check') {
    await withMetric('alerts-check', () => {
      sendJson(response, 200, evaluateAlertRulesNow());
    });
    return;
  }

  if (method === 'POST' && /^\/api\/alerts\/incidents\/\d+\/ack$/.test(pathname)) {
    await withMetric('alerts-incidents-ack', () => {
      const id = Number(pathname.split('/')[4]);
      const incident = alertIncidents.find(item => item.id === id);
      if (!incident) {
        sendJson(response, 404, { error: `incident ${id} not found` });
        return;
      }
      incident.acknowledgedAt = nowIso();
      pushEvent('alert-incident-ack', 'Alert incident acknowledged', { id, ruleId: incident.ruleId });
      sendJson(response, 200, { ok: true, incident });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/alerts/incidents/ack-all') {
    await withMetric('alerts-incidents-ack-all', () => {
      let acknowledged = 0;
      for (const incident of alertIncidents) {
        if (!incident.acknowledgedAt) {
          incident.acknowledgedAt = nowIso();
          acknowledged += 1;
        }
      }
      pushEvent('alert-incidents-ack-all', 'All open alert incidents acknowledged', {
        acknowledged,
      });
      sendJson(response, 200, {
        ok: true,
        acknowledged,
      });
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/dashboard') {
    await withMetric('dashboard', () => {
      sendJson(response, 200, buildDashboardPayload(context.host, context.port));
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/ops/board') {
    await withMetric('ops-board', () => {
      sendJson(response, 200, buildOpsBoard(context.host, context.port));
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/diagnostics/report') {
    await withMetric('diagnostics-report', () => {
      sendJson(response, 200, buildDiagnosticsReport(context.host, context.port));
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/dashboard/timeline') {
    await withMetric('dashboard-timeline', () => {
      const limitRaw = Number(url.searchParams.get('limit') ?? '180');
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(MAX_TIMELINE_POINTS, Math.trunc(limitRaw))) : 180;
      sendJson(response, 200, {
        ok: true,
        count: Math.min(limit, dashboardTimeline.length),
        points: dashboardTimeline.slice(-limit),
      });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/dashboard/timeline/reset') {
    await withMetric('dashboard-timeline-reset', async () => {
      dashboardTimeline.splice(0, dashboardTimeline.length);
      const point = captureTimelinePoint('timeline-reset');
      sendJson(response, 200, {
        ok: true,
        point,
      });
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

  if (method === 'GET' && pathname === '/api/device/baselines') {
    await withMetric('device-baselines-list', () => {
      sendJson(response, 200, {
        ok: true,
        baselines: listDeviceBaselines(),
      });
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/queue-presets') {
    await withMetric('queue-presets-list', () => {
      sendJson(response, 200, {
        count: Object.keys(queuePresets).length,
        presets: queuePresetsList(),
      });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/queue-presets') {
    await withMetric('queue-presets-save', async () => {
      const body = await readJsonBody(request);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'name is required' });
        return;
      }
      const jobs = normalizePresetJobs(body.jobs);
      if (jobs.length === 0) {
        sendJson(response, 400, { error: 'jobs must be non-empty array of valid job specs' });
        return;
      }
      const preset: QueuePreset = {
        name,
        description: typeof body.description === 'string' ? body.description : undefined,
        updatedAt: nowIso(),
        jobs,
      };
      queuePresets[name] = preset;
      saveQueuePresets();
      pushEvent('queue-preset-saved', 'Queue preset saved', { name, jobs: jobs.length });
      sendJson(response, 200, { ok: true, preset });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/queue-presets/run') {
    await withMetric('queue-presets-run', async () => {
      const body = await readJsonBody(request);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        sendJson(response, 400, { error: 'name is required' });
        return;
      }
      let created: JobRecord[];
      try {
        created = runQueuePreset(name, {
          deviceId: extractDeviceId(body),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(response, 400, { error: message });
        return;
      }
      sendJson(response, 200, {
        ok: true,
        name,
        createdCount: created.length,
        jobs: created,
      });
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/recorder/sessions') {
    await withMetric('recorder-sessions', () => {
      sendJson(response, 200, {
        active: activeRecorder ? {
          name: activeRecorder.name,
          startedAt: activeRecorder.startedAt,
          entries: activeRecorder.entries.length,
        } : null,
        sessions: recorderSessionsList(),
      });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/recorder/start') {
    await withMetric('recorder-start', async () => {
      const body = await readJsonBody(request);
      const name = typeof body.name === 'string' ? body.name : '';
      let recorder: RecorderSession;
      try {
        recorder = startRecorder(name);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(response, 400, { error: message });
        return;
      }
      sendJson(response, 200, {
        ok: true,
        recorder: {
          name: recorder.name,
          startedAt: recorder.startedAt,
          entries: recorder.entries.length,
        },
      });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/recorder/stop') {
    await withMetric('recorder-stop', () => {
      if (!activeRecorder) {
        sendJson(response, 400, { error: 'no active recorder' });
        return;
      }
      const recorder = stopRecorder();
      sendJson(response, 200, {
        ok: true,
        session: recorder,
      });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/recorder/replay') {
    await withMetric('recorder-replay', async () => {
      const body = await readJsonBody(request);
      const name = typeof body.name === 'string' ? body.name : '';
      if (!name.trim()) {
        sendJson(response, 400, { error: 'name is required' });
        return;
      }
      let created: JobRecord[];
      try {
        created = replayRecorderSession(name, {
          deviceId: extractDeviceId(body),
          limit: typeof body.limit === 'number' ? body.limit : undefined,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(response, 400, { error: message });
        return;
      }
      sendJson(response, 200, {
        ok: true,
        name: name.trim(),
        createdCount: created.length,
        jobs: created,
      });
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/lanes') {
    await withMetric('lanes-list', () => {
      sendJson(response, 200, {
        lanes: lanesSummary(),
        count: Object.keys(lanes).length,
      });
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/lanes/heatmap') {
    await withMetric('lanes-heatmap', () => {
      sendJson(response, 200, buildLaneHeatmap());
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/board/queue') {
    await withMetric('board-queue', () => {
      sendJson(response, 200, buildQueueBoard());
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/queue/export') {
    await withMetric('queue-export', () => {
      sendJson(response, 200, exportQueueState());
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/queue/import') {
    await withMetric('queue-import', async () => {
      const body = await readJsonBody(request);
      sendJson(response, 200, importQueueState(body));
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/lanes/pause-all') {
    await withMetric('lanes-pause-all', () => {
      const changed = setAllLanesPaused(true);
      sendJson(response, 200, { ok: true, changed, lanes: lanesSummary() });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/lanes/resume-all') {
    await withMetric('lanes-resume-all', () => {
      const changed = setAllLanesPaused(false);
      sendJson(response, 200, { ok: true, changed, lanes: lanesSummary() });
    });
    return;
  }

  if (method === 'POST' && /^\/api\/lanes\/[^/]+\/pause$/.test(pathname)) {
    await withMetric('lanes-pause', () => {
      const laneId = decodeURIComponent(pathname.split('/')[3] || '');
      if (!laneId) {
        sendJson(response, 400, { error: 'lane id is required' });
        return;
      }
      const lane = setLanePaused(laneId, true);
      if (!lane) {
        sendJson(response, 404, { error: `lane '${laneId}' not found` });
        return;
      }
      sendJson(response, 200, { ok: true, lane });
    });
    return;
  }

  if (method === 'POST' && /^\/api\/lanes\/[^/]+\/resume$/.test(pathname)) {
    await withMetric('lanes-resume', () => {
      const laneId = decodeURIComponent(pathname.split('/')[3] || '');
      if (!laneId) {
        sendJson(response, 400, { error: 'lane id is required' });
        return;
      }
      const lane = setLanePaused(laneId, false);
      if (!lane) {
        sendJson(response, 404, { error: `lane '${laneId}' not found` });
        return;
      }
      sendJson(response, 200, { ok: true, lane });
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/jobs') {
    await withMetric('jobs-list', () => {
      sendJson(response, 200, {
        jobs: listJobSummaries(),
        queueDepth: Object.values(lanes).reduce((sum, lane) => sum + lane.queue.length, 0),
      });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/jobs') {
    await withMetric('jobs-create', async () => {
      const body = await readJsonBody(request);
      const typeValue = typeof body.type === 'string' ? body.type : '';
      if (!isJobType(typeValue)) {
        sendJson(response, 400, { error: 'type must be one of open_url, snapshot_suite, stress_run, workflow_run, device_profile' });
        return;
      }

      const input = body.input && typeof body.input === 'object' && !Array.isArray(body.input)
        ? (body.input as JsonObject)
        : {};

      const job = createJob(typeValue, input);
      sendJson(response, 200, {
        ok: true,
        job,
      });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/jobs/bulk') {
    await withMetric('jobs-bulk', async () => {
      const body = await readJsonBody(request);
      const itemsRaw = Array.isArray(body.jobs) ? body.jobs : [];
      if (itemsRaw.length === 0) {
        sendJson(response, 400, { error: 'jobs array is required' });
        return;
      }

      const created: JobRecord[] = [];
      for (const itemRaw of itemsRaw) {
        if (!itemRaw || typeof itemRaw !== 'object') {
          continue;
        }
        const item = itemRaw as Record<string, unknown>;
        const typeValue = typeof item.type === 'string' ? item.type : '';
        if (!isJobType(typeValue)) {
          continue;
        }
        const input = item.input && typeof item.input === 'object' && !Array.isArray(item.input)
          ? (item.input as JsonObject)
          : {};
        created.push(createJob(typeValue, input));
      }

      sendJson(response, 200, {
        ok: true,
        createdCount: created.length,
        jobs: created,
      });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/jobs/transaction') {
    await withMetric('jobs-transaction', async () => {
      const body = await readJsonBody(request);
      const result = runJobsTransaction(body);
      if (result.atomic && result.invalidCount > 0 && !result.dryRun) {
        sendJson(response, 400, {
          ok: false,
          error: 'atomic transaction has invalid jobs',
          ...result,
        });
        return;
      }
      sendJson(response, 200, {
        ok: true,
        ...result,
      });
    });
    return;
  }

  if (method === 'GET' && /^\/api\/jobs\/\d+$/.test(pathname)) {
    await withMetric('jobs-get', () => {
      const id = Number(pathname.slice('/api/jobs/'.length));
      const job = getJobById(id);
      if (!job) {
        sendJson(response, 404, { error: `job ${id} not found` });
        return;
      }
      sendJson(response, 200, { ok: true, job });
    });
    return;
  }

  if (method === 'POST' && /^\/api\/jobs\/\d+\/cancel$/.test(pathname)) {
    await withMetric('jobs-cancel', () => {
      const id = Number(pathname.split('/')[3]);
      const ok = cancelQueuedJob(id);
      if (!ok) {
        sendJson(response, 400, { error: `job ${id} cannot be cancelled` });
        return;
      }
      sendJson(response, 200, { ok: true, id });
    });
    return;
  }

  if (method === 'POST' && /^\/api\/jobs\/\d+\/retry$/.test(pathname)) {
    await withMetric('jobs-retry', () => {
      const id = Number(pathname.split('/')[3]);
      const retried = retryJob(id);
      if (!retried) {
        sendJson(response, 400, { error: `job ${id} cannot be retried` });
        return;
      }
      sendJson(response, 200, {
        ok: true,
        previousJobId: id,
        newJob: retried,
      });
    });
    return;
  }

  if (method === 'POST' && /^\/api\/jobs\/\d+\/promote$/.test(pathname)) {
    await withMetric('jobs-promote', () => {
      const id = Number(pathname.split('/')[3]);
      const promoted = promoteQueuedJob(id);
      if (!promoted.ok) {
        sendJson(response, 400, { error: promoted.reason || `job ${id} cannot be promoted` });
        return;
      }
      sendJson(response, 200, {
        ok: true,
        id,
        laneId: promoted.laneId,
        queueDepth: promoted.queueDepth,
      });
    });
    return;
  }

  if (method === 'POST' && /^\/api\/jobs\/\d+\/move$/.test(pathname)) {
    await withMetric('jobs-move', async () => {
      const id = Number(pathname.split('/')[3]);
      const body = await readJsonBody(request);
      try {
        const moved = moveQueuedJob(id, {
          targetLaneId: typeof body.targetLaneId === 'string' ? body.targetLaneId : undefined,
          targetDeviceId: typeof body.targetDeviceId === 'string' ? body.targetDeviceId : undefined,
        });
        sendJson(response, 200, { ok: true, job: moved });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(response, 400, { error: message });
      }
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/jobs/cancel-queued') {
    await withMetric('jobs-cancel-queued', async () => {
      const body = await readJsonBody(request);
      const ids = Array.isArray(body.ids)
        ? body.ids.map(value => Number(value)).filter(value => Number.isFinite(value))
        : undefined;
      const laneId = typeof body.laneId === 'string' ? body.laneId : undefined;
      const result = cancelQueuedJobs({ ids, laneId });
      sendJson(response, 200, {
        ok: true,
        ...result,
      });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/jobs/reorder') {
    await withMetric('jobs-reorder', async () => {
      const body = await readJsonBody(request);
      const laneId = typeof body.laneId === 'string' ? body.laneId : '';
      const jobIds = Array.isArray(body.jobIds)
        ? body.jobIds.map(value => Number(value)).filter(value => Number.isFinite(value))
        : [];
      try {
        const lane = reorderLaneQueue(laneId, jobIds);
        sendJson(response, 200, {
          ok: true,
          lane,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(response, 400, { error: message });
      }
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/jobs/retry-failed') {
    await withMetric('jobs-retry-failed', async () => {
      const body = await readJsonBody(request);
      const created = retryFailedJobs({
        laneId: typeof body.laneId === 'string' ? body.laneId : undefined,
        limit: typeof body.limit === 'number' ? body.limit : undefined,
      });
      sendJson(response, 200, {
        ok: true,
        createdCount: created.length,
        jobs: created,
      });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/jobs/prune') {
    await withMetric('jobs-prune', async () => {
      const body = await readJsonBody(request);
      const statuses = Array.isArray(body.statuses)
        ? body.statuses.filter((value): value is string => typeof value === 'string')
        : undefined;
      const result = pruneJobs({
        statuses,
        keepLatest: typeof body.keepLatest === 'number' ? body.keepLatest : undefined,
      });
      sendJson(response, 200, {
        ok: true,
        ...result,
      });
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

  if (method === 'GET' && pathname === '/api/workflows/export') {
    await withMetric('workflows-export', () => {
      sendJson(response, 200, {
        exportedAt: nowIso(),
        workflows,
      });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/workflows/import') {
    await withMetric('workflows-import', async () => {
      const body = await readJsonBody(request);
      const replace = body.replace === true;
      const payload = body.workflows;

      const imported: Record<string, WorkflowDefinition> = replace ? {} : { ...workflows };

      const consumeWorkflow = (value: unknown): void => {
        if (!value || typeof value !== 'object') {
          return;
        }
        const item = value as Record<string, unknown>;
        const name = typeof item.name === 'string' ? item.name.trim() : '';
        if (!name) {
          return;
        }
        const stepsRaw = Array.isArray(item.steps) ? item.steps : [];
        const steps: WorkflowStep[] = [];
        for (const stepRaw of stepsRaw) {
          steps.push(normalizeWorkflowStep(stepRaw));
        }
        if (steps.length === 0) {
          return;
        }
        imported[name] = {
          name,
          description: typeof item.description === 'string' ? item.description : undefined,
          updatedAt: nowIso(),
          steps,
        };
      };

      if (Array.isArray(payload)) {
        for (const value of payload) {
          consumeWorkflow(value);
        }
      } else if (payload && typeof payload === 'object') {
        for (const value of Object.values(payload as Record<string, unknown>)) {
          consumeWorkflow(value);
        }
      } else {
        sendJson(response, 400, { error: 'workflows must be array or object' });
        return;
      }

      workflows = imported;
      saveWorkflows();

      pushEvent('workflow-import', 'Workflows imported', {
        count: Object.keys(workflows).length,
        replace,
      });

      sendJson(response, 200, {
        ok: true,
        count: Object.keys(workflows).length,
        workflows: workflowsList(),
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
      workflows[name] = {
        name,
        description,
        updatedAt: nowIso(),
        steps,
      };
      saveWorkflows();

      pushEvent('workflow-saved', 'Workflow saved', {
        name,
        stepCount: steps.length,
      });

      sendJson(response, 200, {
        ok: true,
        workflow: workflows[name],
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

      const startedAt = Date.now();
      const result = openUrlInChrome(targetUrl, extractDeviceId(body), {
        waitForReadyMs: clampInt(body.waitForReadyMs, 1000, 200, 10000),
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

  if (method === 'POST' && pathname === '/api/device/profile') {
    await withMetric('device-profile', async () => {
      const body = await readJsonBody(request);
      const profile = buildDeviceProfile(
        extractDeviceId(body),
        typeof body.packageName === 'string' ? body.packageName : undefined
      );

      pushEvent('device-profile', 'Device profile captured', {
        deviceId: profile.deviceId,
        durationMs: profile.durationMs,
        healthScore: profile.healthScore,
      });

      sendJson(response, 200, {
        ok: true,
        profile,
        updateHint: UPDATE_HINT,
      });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/device/smoke') {
    await withMetric('device-smoke', async () => {
      const body = await readJsonBody(request);
      const result = runDeviceSmokeScenario(body);
      sendJson(response, 200, result);
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/device/baselines/save') {
    await withMetric('device-baselines-save', async () => {
      const body = await readJsonBody(request);
      const name = typeof body.name === 'string' ? body.name : '';
      try {
        const baseline = saveDeviceBaseline(name, body);
        sendJson(response, 200, {
          ok: true,
          baseline,
          updateHint: UPDATE_HINT,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(response, 400, { error: message });
      }
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/device/compare-baseline') {
    await withMetric('device-compare-baseline', async () => {
      const body = await readJsonBody(request);
      const name = typeof body.name === 'string' ? body.name : '';
      try {
        const result = compareWithDeviceBaseline(name, body);
        pushEvent('device-compare-baseline', 'Device compared with baseline', {
          name,
          healthScoreDelta: result.healthScoreDelta,
          changedCount: result.diff && typeof result.diff === 'object' ? (result.diff as Record<string, unknown>).changedCount : undefined,
        });
        sendJson(response, 200, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(response, 400, { error: message });
      }
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/device/profiles') {
    await withMetric('device-profiles', async () => {
      const body = await readJsonBody(request);
      const packageName = typeof body.packageName === 'string' ? body.packageName : undefined;
      const devicesRaw = Array.isArray(body.deviceIds) ? body.deviceIds : [];
      const requested = devicesRaw.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
      const fallback = getConnectedDevices().map(device => device.id);
      const targetDevices = requested.length > 0 ? requested : fallback;

      const profiles = buildProfilesForDevices(targetDevices, packageName);

      pushEvent('device-profiles', 'Multi-device profiles captured', {
        count: profiles.count,
        durationMs: profiles.durationMs,
      });

      sendJson(response, 200, {
        ok: true,
        ...profiles,
        updateHint: UPDATE_HINT,
      });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/device/wallboard') {
    await withMetric('device-wallboard', async () => {
      const body = await readJsonBody(request);
      const wallboard = buildDeviceWallboard(body);
      pushEvent('device-wallboard', 'Device wallboard generated', {
        deviceCount: wallboard.deviceCount,
        avgHealthScore: wallboard.avgHealthScore,
      });
      sendJson(response, 200, wallboard);
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

      const previous = snapshotCache[kindValue];
      const fresh = captureSnapshot(kindValue, {
        deviceId: extractDeviceId(body),
        packageName: typeof body.packageName === 'string' ? body.packageName : undefined,
        includeRaw: true,
      });
      const currentRaw = fresh.raw;
      snapshotCache[kindValue] = currentRaw;

      const diff = diffSnapshot(previous, currentRaw);

      pushEvent('snapshot-diff', 'Snapshot diff captured', {
        kind: kindValue,
        changedCount: diff.changedCount,
      });

      sendJson(response, 200, {
        ok: true,
        kind: kindValue,
        hadPrevious: Boolean(previous),
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

      pushEvent('snapshot', 'Snapshot captured', {
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

      pushEvent('stress-run', 'Stress run completed', {
        totalSteps: result.totalSteps,
        durationMs: result.durationMs,
      });

      sendJson(response, 200, result);
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/autopilot/run') {
    await withMetric('autopilot-run', async () => {
      const body = await readJsonBody(request);
      const result = runAutopilot(body);
      sendJson(response, 200, result);
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/runbook/run') {
    await withMetric('runbook-run', async () => {
      const body = await readJsonBody(request);
      try {
        const result = runOpsRunbook(body);
        sendJson(response, 200, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(response, 400, { error: message });
      }
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/runbook/catalog') {
    await withMetric('runbook-catalog', () => {
      sendJson(response, 200, {
        ok: true,
        items: runbookCatalog(),
      });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/runbook/preview') {
    await withMetric('runbook-preview', async () => {
      const body = await readJsonBody(request);
      try {
        const result = previewRunbook(body);
        sendJson(response, 200, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(response, 400, { error: message });
      }
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/schedules') {
    await withMetric('schedules-list', () => {
      sendJson(response, 200, {
        ok: true,
        schedules: schedulesList(),
      });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/schedules') {
    await withMetric('schedules-create', async () => {
      const body = await readJsonBody(request);
      try {
        const schedule = createSchedule(body);
        sendJson(response, 200, {
          ok: true,
          schedule,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(response, 400, { error: message });
      }
    });
    return;
  }

  if (method === 'POST' && /^\/api\/schedules\/\d+\/start$/.test(pathname)) {
    await withMetric('schedules-start', () => {
      const id = Number(pathname.split('/')[3]);
      const task = startSchedule(id);
      if (!task) {
        sendJson(response, 404, { error: `schedule ${id} not found` });
        return;
      }
      sendJson(response, 200, { ok: true, schedule: task });
    });
    return;
  }

  if (method === 'POST' && /^\/api\/schedules\/\d+\/stop$/.test(pathname)) {
    await withMetric('schedules-stop', () => {
      const id = Number(pathname.split('/')[3]);
      const task = stopSchedule(id);
      if (!task) {
        sendJson(response, 404, { error: `schedule ${id} not found` });
        return;
      }
      sendJson(response, 200, { ok: true, schedule: task });
    });
    return;
  }

  if (method === 'DELETE' && /^\/api\/schedules\/\d+$/.test(pathname)) {
    await withMetric('schedules-delete', () => {
      const id = Number(pathname.split('/')[3]);
      const ok = deleteSchedule(id);
      if (!ok) {
        sendJson(response, 404, { error: `schedule ${id} not found` });
        return;
      }
      sendJson(response, 200, { ok: true, id });
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/scenario/burst') {
    await withMetric('scenario-burst', async () => {
      const body = await readJsonBody(request);
      const result = enqueueBurstScenario(body);
      sendJson(response, 200, result);
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/history') {
    await withMetric('history', () => {
      const limitRaw = Number(url.searchParams.get('limit') ?? '120');
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(600, Math.trunc(limitRaw))) : 120;
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

  if (method === 'GET' && pathname === '/api/session/export') {
    await withMetric('session-export', () => {
      sendJson(response, 200, buildSessionExport());
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/session/reset') {
    await withMetric('session-reset', async () => {
      const body = await readJsonBody(request);
      const keepWorkflows = body.keepWorkflows !== false;
      resetSession({ keepWorkflows });
      sendJson(response, 200, {
        ok: true,
        keepWorkflows,
      });
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
    <title>the-android-mcp web ui v${pkg.version}</title>
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
      .app { max-width: 1560px; margin: 0 auto; display: grid; gap: 12px; }
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
        grid-template-columns: 1fr 1fr 1fr;
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
      textarea { min-height: 86px; resize: vertical; }
      button { cursor: pointer; font-weight: 700; transition: transform 120ms ease, filter 120ms ease; }
      button:hover { transform: translateY(-1px); filter: brightness(1.08); }
      .p { background: linear-gradient(130deg, #0d7666, #155f75); }
      .s { background: linear-gradient(130deg, #1d3348, #192b3c); }
      .w { background: linear-gradient(130deg, #7a5917, #61401f); }
      .events, .metrics, .jobs, .lanes {
        max-height: 300px;
        overflow: auto;
        border: 1px solid #2f4a61;
        border-radius: 10px;
        padding: 8px;
        background: #0b141d;
      }
      .item {
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
        max-height: 460px;
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
          <span class="pill" id="lane-pill">lanes: 0</span>
          <span class="pill" id="queue-pill">queue: 0</span>
          <span class="pill">port: 50000</span>
        </div>
        <h1 style="margin:0;font-size:1.45rem;">the-android-mcp v${pkg.version} command center</h1>
        <p class="muted">Multi-lane orchestration, queue maintenance, device smoke runs, autopilot bundles, and live timeline telemetry.</p>
      </section>

      <section class="grid">
        <article class="card stack">
          <h2>Device operations</h2>
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
          <div class="split">
            <button class="s" id="profile-btn">Device profile</button>
            <button class="s" id="profiles-btn">Profiles all</button>
          </div>
          <p class="muted">Update hint: <code>npm install -g the-android-mcp@latest</code></p>
        </article>

        <article class="card stack">
          <h2>Snapshot + stress</h2>
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
          <textarea id="stress-urls">https://www.wikipedia.org
https://news.ycombinator.com
https://developer.android.com</textarea>
          <div class="split">
            <input id="stress-loops" type="number" min="1" max="6" value="1" />
            <input id="stress-wait" type="number" min="200" max="7000" value="1000" />
          </div>
          <button class="w" id="stress-btn">Run stress</button>
        </article>

        <article class="card stack">
          <h2>Workflow engine</h2>
          <select id="workflow-select"></select>
          <input id="workflow-name" placeholder="workflow name" />
          <textarea id="workflow-steps">[
  {"type":"open_url","url":"https://www.wikipedia.org","waitForReadyMs":900},
  {"type":"snapshot","snapshot":"radio"},
  {"type":"snapshot_suite","packageName":"com.android.chrome"}
]</textarea>
          <div class="split">
            <button class="p" id="workflow-save-btn">Save</button>
            <button class="p" id="workflow-run-btn">Run</button>
          </div>
          <div class="split">
            <button class="s" id="workflow-delete-btn">Delete</button>
            <button class="s" id="workflow-export-btn">Export</button>
          </div>
          <button class="s" id="workflow-import-btn">Import from editor</button>
        </article>

        <article class="card stack">
          <h2>Job orchestrator</h2>
          <select id="job-type">
            <option value="open_url">open_url</option>
            <option value="snapshot_suite">snapshot_suite</option>
            <option value="stress_run">stress_run</option>
            <option value="workflow_run">workflow_run</option>
            <option value="device_profile">device_profile</option>
          </select>
          <input id="job-url" type="url" value="https://developer.android.com" />
          <select id="job-workflow"></select>
          <div class="split">
            <button class="p" id="job-enqueue-btn">Enqueue job</button>
            <button class="s" id="job-refresh-btn">Refresh jobs</button>
          </div>
          <textarea id="bulk-jobs">[
  {"type":"open_url","input":{"url":"https://www.wikipedia.org","waitForReadyMs":800}},
  {"type":"open_url","input":{"url":"https://news.ycombinator.com","waitForReadyMs":800}},
  {"type":"snapshot_suite","input":{"packageName":"com.android.chrome"}}
]</textarea>
          <button class="w" id="job-bulk-btn">Enqueue bulk JSON</button>
          <div id="jobs" class="jobs"></div>
        </article>

        <article class="card stack">
          <h2>Lanes + events</h2>
          <div id="lanes" class="lanes"></div>
          <div id="events" class="events"></div>
        </article>

        <article class="card stack">
          <h2>Queue control + autopilot</h2>
          <div class="split">
            <button class="w" id="pause-all-lanes-btn">Pause all lanes</button>
            <button class="p" id="resume-all-lanes-btn">Resume all lanes</button>
          </div>
          <div class="split">
            <button class="w" id="cancel-queued-btn">Cancel queued jobs</button>
            <button class="s" id="retry-failed-btn">Retry failed jobs</button>
          </div>
          <button class="s" id="prune-jobs-btn">Prune terminal jobs</button>
          <input id="smoke-url" type="url" value="https://www.wikipedia.org" />
          <button class="p" id="smoke-btn">Run device smoke</button>
          <input id="burst-loops" type="number" min="1" max="12" value="2" />
          <select id="burst-workflow"></select>
          <button class="p" id="burst-enqueue-btn">Enqueue burst scenario</button>
          <input id="autopilot-loops" type="number" min="1" max="8" value="2" />
          <button class="p" id="autopilot-btn">Run autopilot multi-lane</button>
          <button class="s" id="dashboard-btn">Load dashboard payload</button>
          <div class="split">
            <button class="s" id="timeline-btn">Load timeline</button>
            <button class="w" id="timeline-reset-btn">Reset timeline</button>
          </div>
          <canvas id="timeline-chart" width="640" height="140" style="width:100%;height:140px;border:1px solid #2f4a61;border-radius:10px;background:#0b141d;"></canvas>
          <div id="timeline" class="metrics"></div>
          <hr style="border:0;border-top:1px solid #2f4a61;" />
          <input id="recorder-name" placeholder="recorder session name" value="ops-session" />
          <div class="split">
            <button class="s" id="recorder-start-btn">Start recorder</button>
            <button class="w" id="recorder-stop-btn">Stop recorder</button>
          </div>
          <div class="split">
            <button class="p" id="recorder-replay-btn">Replay recorder</button>
            <button class="s" id="recorder-list-btn">List recorders</button>
          </div>
          <div id="recorder-sessions" class="metrics"></div>
          <hr style="border:0;border-top:1px solid #2f4a61;" />
          <input id="preset-name" placeholder="queue preset name" value="ops-preset" />
          <textarea id="preset-jobs">[
  {"type":"open_url","input":{"url":"https://www.wikipedia.org","waitForReadyMs":800}},
  {"type":"device_profile","input":{"packageName":"com.android.chrome"}}
]</textarea>
          <div class="split">
            <button class="s" id="preset-save-btn">Save preset</button>
            <button class="p" id="preset-run-btn">Run preset</button>
          </div>
          <button class="s" id="heatmap-btn">Load lane heatmap</button>
          <button class="s" id="wallboard-btn">Generate wallboard</button>
          <div id="heatmap" class="metrics"></div>
          <hr style="border:0;border-top:1px solid #2f4a61;" />
          <div class="split">
            <input id="policy-max-queue" type="number" min="5" max="500" value="60" />
            <input id="policy-fail-threshold" type="number" min="1" max="200" value="6" />
          </div>
          <div class="split">
            <input id="policy-retry-limit" type="number" min="1" max="300" value="15" />
            <select id="policy-auto-pause">
              <option value="true">auto pause on failure</option>
              <option value="false">no auto pause</option>
            </select>
          </div>
          <div class="split">
            <button class="s" id="policy-load-btn">Load policy</button>
            <button class="p" id="policy-save-btn">Save policy</button>
          </div>
          <select id="runbook-name">
            <option value="recover-lane">recover-lane</option>
            <option value="purge-lane">purge-lane</option>
            <option value="smoke-now">smoke-now</option>
            <option value="autopilot-lite">autopilot-lite</option>
          </select>
          <button class="p" id="runbook-btn">Run runbook</button>
          <textarea id="transaction-jobs">[
  {"type":"open_url","input":{"url":"https://www.wikipedia.org","waitForReadyMs":700}},
  {"type":"device_profile","input":{"packageName":"com.android.chrome"}}
]</textarea>
          <div class="split">
            <button class="s" id="tx-dry-btn">Dry-run transaction</button>
            <button class="p" id="tx-run-btn">Run transaction</button>
          </div>
          <button class="s" id="ops-board-btn">Load ops board</button>
          <div id="ops-board" class="metrics"></div>
          <hr style="border:0;border-top:1px solid #2f4a61;" />
          <div class="split">
            <input id="move-job-id" type="number" min="1" placeholder="queued job id" />
            <input id="move-target-device" placeholder="target device id (optional)" />
          </div>
          <div class="split">
            <button class="s" id="queue-board-btn">Load queue board</button>
            <button class="p" id="move-job-btn">Move queued job</button>
          </div>
          <textarea id="reorder-job-ids">[]</textarea>
          <button class="s" id="reorder-apply-btn">Apply reorder for selected lane</button>
          <div class="split">
            <input id="schedule-name" placeholder="schedule name" value="ops-watch" />
            <input id="schedule-every-ms" type="number" min="1000" value="30000" />
          </div>
          <div class="split">
            <select id="schedule-runbook">
              <option value="recover-lane">recover-lane</option>
              <option value="purge-lane">purge-lane</option>
              <option value="smoke-now">smoke-now</option>
              <option value="autopilot-lite">autopilot-lite</option>
            </select>
            <input id="schedule-id" type="number" min="1" placeholder="schedule id" />
          </div>
          <div class="split">
            <button class="s" id="schedule-create-btn">Create schedule</button>
            <button class="p" id="schedule-list-btn">List schedules</button>
          </div>
          <div class="split">
            <button class="p" id="schedule-start-btn">Start schedule</button>
            <button class="w" id="schedule-stop-btn">Stop schedule</button>
          </div>
          <button class="w" id="schedule-delete-btn">Delete schedule</button>
          <div id="schedules" class="metrics"></div>
          <hr style="border:0;border-top:1px solid #2f4a61;" />
          <input id="alert-name" placeholder="alert name" value="Queue spike" />
          <div class="split">
            <select id="alert-metric">
              <option value="queueDepth">queueDepth</option>
              <option value="failedJobs">failedJobs</option>
              <option value="pausedLanes">pausedLanes</option>
            </select>
            <select id="alert-operator">
              <option value="gte">gte</option>
              <option value="lte">lte</option>
            </select>
          </div>
          <div class="split">
            <input id="alert-threshold" type="number" min="0" value="10" />
            <input id="alert-cooldown" type="number" min="1000" value="120000" />
          </div>
          <div class="split">
            <button class="s" id="alert-save-btn">Save alert rule</button>
            <button class="p" id="alerts-check-btn">Check alerts now</button>
          </div>
          <button class="s" id="alerts-load-btn">Load alert incidents</button>
          <div id="alerts" class="metrics"></div>
          <hr style="border:0;border-top:1px solid #2f4a61;" />
          <div class="split">
            <button class="s" id="runbook-preview-btn">Preview runbook</button>
            <button class="s" id="runbook-catalog-btn">Runbook catalog</button>
          </div>
          <textarea id="queue-import-export">{"lanes":[]}</textarea>
          <div class="split">
            <button class="s" id="queue-export-btn">Export queue</button>
            <button class="p" id="queue-import-btn">Import queue</button>
          </div>
          <hr style="border:0;border-top:1px solid #2f4a61;" />
          <input id="baseline-name" placeholder="baseline name" value="primary-device" />
          <div class="split">
            <button class="s" id="baseline-save-btn">Save baseline</button>
            <button class="p" id="baseline-compare-btn">Compare baseline</button>
          </div>
          <button class="s" id="baseline-list-btn">List baselines</button>
          <div class="split">
            <button class="w" id="alerts-ack-all-btn">Ack all incidents</button>
            <button class="s" id="diagnostics-report-btn">Load diagnostics report</button>
          </div>
        </article>

        <article class="card stack">
          <h2>Metrics + session</h2>
          <div id="metrics" class="metrics"></div>
          <div class="split">
            <button class="s" id="refresh-state-btn">Refresh state</button>
            <button class="s" id="export-session-btn">Export session</button>
          </div>
          <button class="w" id="reset-session-btn">Reset session (keep workflows)</button>
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
        timelinePoints: [],
      };

      const $status = document.getElementById('status');
      const $versionPill = document.getElementById('version-pill');
      const $devicePill = document.getElementById('device-pill');
      const $workflowPill = document.getElementById('workflow-pill');
      const $lanePill = document.getElementById('lane-pill');
      const $queuePill = document.getElementById('queue-pill');
      const $deviceSelect = document.getElementById('device-select');
      const $urlInput = document.getElementById('url-input');
      const $message = document.getElementById('message');
      const $output = document.getElementById('output');
      const $events = document.getElementById('events');
      const $metrics = document.getElementById('metrics');
      const $jobs = document.getElementById('jobs');
      const $lanes = document.getElementById('lanes');
      const $snapshotKind = document.getElementById('snapshot-kind');
      const $stressUrls = document.getElementById('stress-urls');
      const $stressLoops = document.getElementById('stress-loops');
      const $stressWait = document.getElementById('stress-wait');
      const $workflowSelect = document.getElementById('workflow-select');
      const $workflowName = document.getElementById('workflow-name');
      const $workflowSteps = document.getElementById('workflow-steps');
      const $jobType = document.getElementById('job-type');
      const $jobUrl = document.getElementById('job-url');
      const $jobWorkflow = document.getElementById('job-workflow');
      const $bulkJobs = document.getElementById('bulk-jobs');
      const $burstLoops = document.getElementById('burst-loops');
      const $burstWorkflow = document.getElementById('burst-workflow');
      const $autopilotLoops = document.getElementById('autopilot-loops');
      const $smokeUrl = document.getElementById('smoke-url');
      const $timeline = document.getElementById('timeline');
      const $timelineChart = document.getElementById('timeline-chart');
      const $recorderName = document.getElementById('recorder-name');
      const $recorderSessions = document.getElementById('recorder-sessions');
      const $presetName = document.getElementById('preset-name');
      const $presetJobs = document.getElementById('preset-jobs');
      const $heatmap = document.getElementById('heatmap');
      const $policyMaxQueue = document.getElementById('policy-max-queue');
      const $policyFailThreshold = document.getElementById('policy-fail-threshold');
      const $policyRetryLimit = document.getElementById('policy-retry-limit');
      const $policyAutoPause = document.getElementById('policy-auto-pause');
      const $runbookName = document.getElementById('runbook-name');
      const $transactionJobs = document.getElementById('transaction-jobs');
      const $opsBoard = document.getElementById('ops-board');
      const $moveJobId = document.getElementById('move-job-id');
      const $moveTargetDevice = document.getElementById('move-target-device');
      const $reorderJobIds = document.getElementById('reorder-job-ids');
      const $scheduleName = document.getElementById('schedule-name');
      const $scheduleEveryMs = document.getElementById('schedule-every-ms');
      const $scheduleRunbook = document.getElementById('schedule-runbook');
      const $scheduleId = document.getElementById('schedule-id');
      const $schedules = document.getElementById('schedules');
      const $alertName = document.getElementById('alert-name');
      const $alertMetric = document.getElementById('alert-metric');
      const $alertOperator = document.getElementById('alert-operator');
      const $alertThreshold = document.getElementById('alert-threshold');
      const $alertCooldown = document.getElementById('alert-cooldown');
      const $alerts = document.getElementById('alerts');
      const $queueImportExport = document.getElementById('queue-import-export');
      const $baselineName = document.getElementById('baseline-name');

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
        item.className = 'item';
        item.innerHTML =
          '<div class="meta">[' + (event.at || new Date().toISOString()) + '] ' + event.type + '</div>' +
          '<div>' + (event.message || '') + '</div>' +
          (event.data ? '<div style="color:#a5c6db;margin-top:4px;">' + JSON.stringify(event.data) + '</div>' : '');
        $events.prepend(item);
        while ($events.children.length > 120) {
          $events.removeChild($events.lastChild);
        }
      }

      function renderMetrics(payload) {
        const entries = Array.isArray(payload.entries) ? payload.entries : [];
        $metrics.innerHTML = '';
        for (const entry of entries.slice(0, 25)) {
          const item = document.createElement('div');
          item.className = 'item';
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

      function renderTimeline(payload) {
        const points = Array.isArray(payload.points) ? payload.points : [];
        state.timelinePoints = points;
        $timeline.innerHTML = '';
        for (const point of points.slice(-60).reverse()) {
          const item = document.createElement('div');
          item.className = 'item';
          item.innerHTML =
            '<div class="meta">[' + point.at + '] ' + point.reason + '</div>' +
            '<div>queue=' + point.queueDepth + ' active=' + point.activeLaneCount + ' paused=' + point.pausedLaneCount + '</div>' +
            '<div>completed=' + point.completed + ' failed=' + point.failed + ' cancelled=' + point.cancelled + '</div>';
          $timeline.appendChild(item);
        }
        if (!points.length) {
          $timeline.textContent = 'No timeline points yet.';
        }
        renderTimelineChart(points);
      }

      function renderTimelineChart(points) {
        if (!$timelineChart || typeof $timelineChart.getContext !== 'function') {
          return;
        }
        const ctx = $timelineChart.getContext('2d');
        if (!ctx) {
          return;
        }
        const width = $timelineChart.width;
        const height = $timelineChart.height;
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#0b141d';
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = '#2f4a61';
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i += 1) {
          const y = Math.round((height / 4) * i);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }
        if (!Array.isArray(points) || points.length < 2) {
          return;
        }

        const sampled = points.slice(-80);
        const maxQueue = Math.max(1, ...sampled.map(item => Number(item.queueDepth || 0)));
        const maxFailed = Math.max(1, ...sampled.map(item => Number(item.failed || 0)));

        const drawLine = function (extractor, color, maxValue) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          sampled.forEach(function (item, index) {
            const x = Math.round((index / (sampled.length - 1)) * (width - 1));
            const value = Number(extractor(item) || 0);
            const normalized = Math.max(0, Math.min(1, value / maxValue));
            const y = Math.round(height - normalized * (height - 8) - 4);
            if (index === 0) {
              ctx.beginPath();
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          });
          ctx.stroke();
        };

        drawLine(function (item) { return item.queueDepth; }, '#14a7ff', maxQueue);
        drawLine(function (item) { return item.failed; }, '#ff7676', maxFailed);
      }

      function renderRecorderSessions(payload) {
        const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
        const active = payload.active;
        $recorderSessions.innerHTML = '';
        if (active) {
          const activeItem = document.createElement('div');
          activeItem.className = 'item';
          activeItem.innerHTML =
            '<div class="meta">active: ' + active.name + '</div>' +
            '<div>startedAt=' + active.startedAt + ' entries=' + active.entries + '</div>';
          $recorderSessions.appendChild(activeItem);
        }
        for (const session of sessions.slice(0, 20)) {
          const item = document.createElement('div');
          item.className = 'item';
          item.innerHTML =
            '<div class="meta">' + session.name + '</div>' +
            '<div>entries=' + ((session.entries && session.entries.length) || 0) + '</div>' +
            '<div>started=' + session.startedAt + '</div>' +
            '<div>stopped=' + (session.stoppedAt || '-') + '</div>';
          $recorderSessions.appendChild(item);
        }
        if (!sessions.length && !active) {
          $recorderSessions.textContent = 'No recorder sessions.';
        }
      }

      function renderHeatmap(payload) {
        const lanes = Array.isArray(payload.lanes) ? payload.lanes : [];
        $heatmap.innerHTML = '';
        for (const lane of lanes.slice(0, 20)) {
          const item = document.createElement('div');
          item.className = 'item';
          item.innerHTML =
            '<div class="meta">' + lane.id + '</div>' +
            '<div>load=' + lane.loadScore + ' queue=' + lane.queueDepth + ' success=' + lane.successRate + '%</div>' +
            '<div>completed=' + lane.completed + ' failed=' + lane.failed + ' cancelled=' + lane.cancelled + '</div>';
          $heatmap.appendChild(item);
        }
        if (!lanes.length) {
          $heatmap.textContent = 'No lanes available for heatmap.';
        }
      }

      function renderOpsBoard(payload) {
        if (!$opsBoard) {
          return;
        }
        const statePayload = payload.state || {};
        const policy = payload.policy || {};
        const failed = Array.isArray(payload.recentFailedJobs) ? payload.recentFailedJobs : [];
        $opsBoard.innerHTML = '';

        const top = document.createElement('div');
        top.className = 'item';
        top.innerHTML =
          '<div class="meta">state + policy</div>' +
          '<div>queue=' + (statePayload.queueDepth || 0) + ' lanes=' + (statePayload.laneCount || 0) + ' paused=' + (statePayload.pausedLaneCount || 0) + '</div>' +
          '<div>maxQueue=' + (policy.maxQueuePerLane || '-') + ' failPause=' + (policy.failurePauseThreshold || '-') + ' autoPause=' + String(policy.autoPauseOnFailure) + '</div>';
        $opsBoard.appendChild(top);

        for (const item of failed.slice(0, 12)) {
          const row = document.createElement('div');
          row.className = 'item';
          row.innerHTML =
            '<div class="meta">failed #' + item.id + ' ' + item.type + '</div>' +
            '<div>lane=' + item.laneId + '</div>' +
            '<div style="color:#ff8f8f;">' + (item.error || '') + '</div>';
          $opsBoard.appendChild(row);
        }

        if (!failed.length) {
          const okRow = document.createElement('div');
          okRow.className = 'item';
          okRow.innerHTML = '<div class="meta">No recent failed jobs</div>';
          $opsBoard.appendChild(okRow);
        }
      }

      function renderSchedules(payload) {
        const entries = Array.isArray(payload.schedules) ? payload.schedules : [];
        $schedules.innerHTML = '';
        for (const item of entries.slice(0, 25)) {
          const row = document.createElement('div');
          row.className = 'item';
          row.innerHTML =
            '<div class="meta">#' + item.id + ' ' + item.name + ' [' + (item.active ? 'active' : 'idle') + ']</div>' +
            '<div>runbook=' + item.runbook + ' everyMs=' + item.everyMs + ' device=' + (item.deviceId || '-') + '</div>' +
            '<div>runs=' + item.runs + ' failures=' + item.failures + '</div>';
          $schedules.appendChild(row);
        }
        if (!entries.length) {
          $schedules.textContent = 'No schedules.';
        }
      }

      function renderQueueBoard(payload) {
        const lanes = Array.isArray(payload.lanes) ? payload.lanes : [];
        if (!lanes.length) {
          $reorderJobIds.value = '[]';
          return;
        }
        const lane = lanes[0];
        const ids = Array.isArray(lane.queuedJobs) ? lane.queuedJobs.map(function (job) { return job.id; }) : [];
        $reorderJobIds.value = JSON.stringify(ids, null, 2);
      }

      function renderAlerts(payload) {
        const incidents = Array.isArray(payload.incidents) ? payload.incidents : [];
        const rules = Array.isArray(payload.rules) ? payload.rules : [];
        $alerts.innerHTML = '';
        const head = document.createElement('div');
        head.className = 'item';
        head.innerHTML = '<div class="meta">rules=' + rules.length + ' incidents=' + incidents.length + '</div>';
        $alerts.appendChild(head);
        for (const item of incidents.slice(0, 20)) {
          const row = document.createElement('div');
          row.className = 'item';
          row.innerHTML =
            '<div class="meta">incident #' + item.id + ' rule=' + item.ruleName + '</div>' +
            '<div>' + item.metric + ' value=' + item.value + ' threshold=' + item.threshold + '</div>' +
            '<div>at=' + item.at + ' ack=' + (item.acknowledgedAt || '-') + '</div>';
          $alerts.appendChild(row);
        }
      }

      function renderLanes(payload) {
        const lanes = Array.isArray(payload.lanes) ? payload.lanes : [];
        $lanes.innerHTML = '';
        for (const lane of lanes.slice(0, 30)) {
          const item = document.createElement('div');
          item.className = 'item';
          item.innerHTML =
            '<div class="meta">' + lane.id + (lane.active ? ' [active]' : '') + (lane.paused ? ' [paused]' : '') + '</div>' +
            '<div>queue=' + lane.queueDepth + ' completed=' + lane.completed + ' failed=' + lane.failed + ' cancelled=' + lane.cancelled + '</div>' +
            '<div>device=' + (lane.deviceId || 'default') + '</div>';

          const laneToggleBtn = document.createElement('button');
          laneToggleBtn.className = lane.paused ? 'p' : 'w';
          laneToggleBtn.textContent = lane.paused ? 'Resume lane' : 'Pause lane';
          laneToggleBtn.style.marginTop = '6px';
          laneToggleBtn.addEventListener('click', async function () {
            try {
              const route = '/api/lanes/' + encodeURIComponent(lane.id) + '/' + (lane.paused ? 'resume' : 'pause');
              const result = await api(route, 'POST', {});
              renderOutput(result);
              await refreshJobsAndLanes();
              setMessage('Lane updated', false);
            } catch (error) {
              setMessage(String(error), true);
            }
          });
          item.appendChild(laneToggleBtn);
          $lanes.appendChild(item);
        }
        if (!lanes.length) {
          $lanes.textContent = 'No lanes yet.';
        }
      }

      function renderJobs(payload) {
        const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
        $jobs.innerHTML = '';
        for (const job of jobs.slice(0, 40)) {
          const item = document.createElement('div');
          item.className = 'item';
          item.innerHTML =
            '<div class="meta">#' + job.id + ' ' + job.type + ' [' + job.status + ']</div>' +
            '<div>lane=' + (job.laneId || '-') + ' duration=' + (job.durationMs || 0) + 'ms</div>' +
            (job.error ? '<div style="color:#ff8f8f;">' + job.error + '</div>' : '');

          if (job.status === 'queued') {
            const promoteBtn = document.createElement('button');
            promoteBtn.className = 's';
            promoteBtn.textContent = 'Promote';
            promoteBtn.style.marginTop = '6px';
            promoteBtn.addEventListener('click', async function () {
              try {
                const result = await api('/api/jobs/' + job.id + '/promote', 'POST', {});
                renderOutput(result);
                await refreshJobsAndLanes();
                setMessage('Job promoted', false);
              } catch (error) {
                setMessage(String(error), true);
              }
            });
            item.appendChild(promoteBtn);

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'w';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.marginTop = '6px';
            cancelBtn.addEventListener('click', async function () {
              try {
                const result = await api('/api/jobs/' + job.id + '/cancel', 'POST', {});
                renderOutput(result);
                await refreshJobsAndLanes();
                setMessage('Job cancelled', false);
              } catch (error) {
                setMessage(String(error), true);
              }
            });
            item.appendChild(cancelBtn);
          }

          if (job.status === 'failed' || job.status === 'completed' || job.status === 'cancelled') {
            const retryBtn = document.createElement('button');
            retryBtn.className = 's';
            retryBtn.textContent = 'Retry';
            retryBtn.style.marginTop = '6px';
            retryBtn.addEventListener('click', async function () {
              try {
                const result = await api('/api/jobs/' + job.id + '/retry', 'POST', {});
                renderOutput(result);
                await refreshJobsAndLanes();
                setMessage('Job retried', false);
              } catch (error) {
                setMessage(String(error), true);
              }
            });
            item.appendChild(retryBtn);
          }

          $jobs.appendChild(item);
        }
        if (!jobs.length) {
          $jobs.textContent = 'No jobs yet.';
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

      function selectedWorkflowName() {
        const value = ($workflowSelect.value || '').trim();
        return value || undefined;
      }

      function stressConfig() {
        return {
          urls: $stressUrls.value
            .split('\n')
            .map(function (line) { return line.trim(); })
            .filter(function (line) { return line.length > 0; }),
          loops: Number($stressLoops.value || '1'),
          waitForReadyMs: Number($stressWait.value || '1000'),
          includeSnapshotAfterEach: true,
        };
      }

      async function refreshJobsAndLanes() {
        const jobsPayload = await api('/api/jobs');
        renderJobs(jobsPayload);

        const lanesPayload = await api('/api/lanes');
        renderLanes(lanesPayload);
      }

      async function refreshCore() {
        const statePayload = await api('/api/state');
        $status.textContent = statePayload.connectedDeviceCount > 0 ? 'online' : 'no-device';
        $versionPill.textContent = 'v' + statePayload.version;
        $workflowPill.textContent = 'workflows: ' + statePayload.workflowCount;
        $lanePill.textContent = 'lanes: ' + statePayload.laneCount;
        $queuePill.textContent = 'queue: ' + statePayload.queueDepth;

        const devicesPayload = await api('/api/devices');
        const devices = Array.isArray(devicesPayload.devices) ? devicesPayload.devices : [];
        const previousDevice = state.deviceId;

        $deviceSelect.innerHTML = '';
        for (const device of devices) {
          const option = document.createElement('option');
          option.value = device.id;
          option.textContent = device.id + ' (' + (device.model || 'unknown') + ')';
          $deviceSelect.appendChild(option);
        }

        if (previousDevice && devices.some(function (d) { return d.id === previousDevice; })) {
          state.deviceId = previousDevice;
        } else {
          state.deviceId = devices[0] ? devices[0].id : undefined;
        }

        if (state.deviceId) {
          $deviceSelect.value = state.deviceId;
          $devicePill.textContent = 'device: ' + state.deviceId;
        } else {
          $devicePill.textContent = 'device: none';
        }

        const workflowsPayload = await api('/api/workflows');
        const workflows = Array.isArray(workflowsPayload.workflows) ? workflowsPayload.workflows : [];
        state.workflows = workflows;
        const presetsPayload = await api('/api/queue-presets');
        const presets = Array.isArray(presetsPayload.presets) ? presetsPayload.presets : [];

        const fillWorkflowSelect = function (selectElement) {
          const prev = (selectElement.value || '').trim();
          selectElement.innerHTML = '';
          for (const wf of workflows) {
            const option = document.createElement('option');
            option.value = wf.name;
            option.textContent = wf.name;
            selectElement.appendChild(option);
          }
          if (prev && workflows.some(function (w) { return w.name === prev; })) {
            selectElement.value = prev;
          } else if (workflows[0]) {
            selectElement.value = workflows[0].name;
          }
        };

        fillWorkflowSelect($workflowSelect);
        fillWorkflowSelect($jobWorkflow);
        fillWorkflowSelect($burstWorkflow);

        if ($workflowSelect.value) {
          const selected = workflows.find(function (w) { return w.name === $workflowSelect.value; });
          if (selected) {
            $workflowName.value = selected.name;
            $workflowSteps.value = JSON.stringify(selected.steps || [], null, 2);
          }
        }

        if (presets.length > 0) {
          const selectedPreset = presets[0];
          $presetName.value = selectedPreset.name || 'ops-preset';
          $presetJobs.value = JSON.stringify(selectedPreset.jobs || [], null, 2);
        }

        const metricsPayload = await api('/api/metrics');
        renderMetrics(metricsPayload);
        await listRecorderSessionsUi();

        await refreshJobsAndLanes();
      }

      function connectRealtime() {
        const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const wsUrl = scheme + '://' + window.location.host + '/api/ws';
        let fallbackAttached = false;

        try {
          const ws = new WebSocket(wsUrl);
          ws.onmessage = function (event) {
            try {
              const parsed = JSON.parse(event.data);
              addEvent(parsed);
            } catch (error) {
              // ignore
            }
          };
          ws.onopen = function () {
            setMessage('Realtime connected (websocket)', false);
          };
          ws.onclose = function () {
            if (fallbackAttached) {
              return;
            }
            fallbackAttached = true;
            const es = new EventSource('/api/events');
            es.onmessage = function (event) {
              try {
                addEvent(JSON.parse(event.data));
              } catch (error) {
                // ignore
              }
            };
            setMessage('Realtime fallback to SSE', false);
          };
        } catch (error) {
          const es = new EventSource('/api/events');
          es.onmessage = function (event) {
            try {
              addEvent(JSON.parse(event.data));
            } catch (innerError) {
              // ignore
            }
          };
          setMessage('Realtime fallback to SSE', false);
        }
      }

      async function openUrl(url) {
        setMessage('Opening URL: ' + url, false);
        const result = await api('/api/open-url', 'POST', {
          deviceId: selectedDeviceId(),
          url,
          waitForReadyMs: 900,
        });
        renderOutput(result);
        setMessage('URL opened', false);
      }

      async function runSuite() {
        setMessage('Running suite', false);
        const result = await api('/api/snapshot-suite', 'POST', {
          deviceId: selectedDeviceId(),
          packageName: 'com.android.chrome',
        });
        renderOutput(result);
        setMessage('Suite completed', false);
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
          kind,
        });
        renderOutput(result);
        setMessage('Snapshot diff completed', false);
      }

      async function captureDeviceProfile() {
        setMessage('Capturing device profile', false);
        const result = await api('/api/device/profile', 'POST', {
          deviceId: selectedDeviceId(),
          packageName: 'com.android.chrome',
        });
        renderOutput(result);
        setMessage('Device profile completed', false);
      }

      async function captureAllProfiles() {
        setMessage('Capturing profiles for all devices', false);
        const result = await api('/api/device/profiles', 'POST', {
          packageName: 'com.android.chrome',
        });
        renderOutput(result);
        setMessage('Profiles matrix completed', false);
      }

      async function runStress() {
        setMessage('Running stress run', false);
        const cfg = stressConfig();
        const result = await api('/api/stress-run', 'POST', {
          deviceId: selectedDeviceId(),
          urls: cfg.urls,
          loops: cfg.loops,
          waitForReadyMs: cfg.waitForReadyMs,
          includeSnapshotAfterEach: true,
        });
        renderOutput(result);
        setMessage('Stress run completed', false);
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
          throw new Error('workflow steps must be valid JSON');
        }
        const result = await api('/api/workflows', 'POST', { name, steps });
        renderOutput(result);
        setMessage('Workflow saved', false);
        await refreshCore();
      }

      async function runWorkflow() {
        const name = selectedWorkflowName();
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
        setMessage('Workflow executed', false);
      }

      async function deleteWorkflow() {
        const name = selectedWorkflowName();
        if (!name) {
          throw new Error('select workflow first');
        }
        const result = await api('/api/workflows/' + encodeURIComponent(name), 'DELETE');
        renderOutput(result);
        setMessage('Workflow deleted', false);
        await refreshCore();
      }

      async function exportWorkflows() {
        const result = await api('/api/workflows/export');
        $workflowSteps.value = JSON.stringify(result.workflows || {}, null, 2);
        renderOutput(result);
        setMessage('Workflows exported to editor', false);
      }

      async function importWorkflows() {
        let parsed;
        try {
          parsed = JSON.parse($workflowSteps.value || '{}');
        } catch (error) {
          throw new Error('workflow editor must contain valid JSON');
        }
        const result = await api('/api/workflows/import', 'POST', {
          workflows: parsed,
          replace: false,
        });
        renderOutput(result);
        setMessage('Workflows imported', false);
        await refreshCore();
      }

      async function enqueueSingleJob() {
        const type = ($jobType.value || '').trim();
        const input = { deviceId: selectedDeviceId() };

        if (type === 'open_url') {
          input.url = $jobUrl.value || 'https://developer.android.com';
          input.waitForReadyMs = 900;
        } else if (type === 'snapshot_suite') {
          input.packageName = 'com.android.chrome';
        } else if (type === 'stress_run') {
          const cfg = stressConfig();
          input.urls = cfg.urls;
          input.loops = cfg.loops;
          input.waitForReadyMs = cfg.waitForReadyMs;
          input.includeSnapshotAfterEach = true;
        } else if (type === 'workflow_run') {
          const workflowName = ($jobWorkflow.value || '').trim();
          if (!workflowName) {
            throw new Error('select workflow for workflow_run job');
          }
          input.name = workflowName;
          input.packageName = 'com.android.chrome';
        } else if (type === 'device_profile') {
          input.packageName = 'com.android.chrome';
        }

        const result = await api('/api/jobs', 'POST', { type, input });
        renderOutput(result);
        setMessage('Job enqueued', false);
        await refreshJobsAndLanes();
      }

      async function enqueueBulkJobs() {
        let parsed;
        try {
          parsed = JSON.parse($bulkJobs.value || '[]');
        } catch (error) {
          throw new Error('bulk jobs must be valid JSON array');
        }

        if (!Array.isArray(parsed)) {
          throw new Error('bulk jobs must be array');
        }

        for (const item of parsed) {
          if (!item.input || typeof item.input !== 'object' || Array.isArray(item.input)) {
            item.input = {};
          }
          if (!item.input.deviceId) {
            item.input.deviceId = selectedDeviceId();
          }
        }

        const result = await api('/api/jobs/bulk', 'POST', { jobs: parsed });
        renderOutput(result);
        setMessage('Bulk jobs enqueued', false);
        await refreshJobsAndLanes();
      }

      async function exportSession() {
        const result = await api('/api/session/export');
        renderOutput(result);
        setMessage('Session exported to output', false);
      }

      async function resetSession() {
        const result = await api('/api/session/reset', 'POST', { keepWorkflows: true });
        renderOutput(result);
        setMessage('Session reset complete', false);
        await refreshCore();
      }

      async function pauseAllLanes() {
        const result = await api('/api/lanes/pause-all', 'POST', {});
        renderOutput(result);
        setMessage('All lanes paused', false);
        await refreshJobsAndLanes();
      }

      async function resumeAllLanes() {
        const result = await api('/api/lanes/resume-all', 'POST', {});
        renderOutput(result);
        setMessage('All lanes resumed', false);
        await refreshJobsAndLanes();
      }

      async function cancelQueued() {
        const result = await api('/api/jobs/cancel-queued', 'POST', {
          laneId: selectedDeviceId() ? 'device:' + selectedDeviceId() : undefined,
        });
        renderOutput(result);
        setMessage('Queued jobs cancelled', false);
        await refreshJobsAndLanes();
      }

      async function enqueueBurstScenario() {
        const workflowName = ($burstWorkflow.value || '').trim();
        const cfg = stressConfig();
        const result = await api('/api/scenario/burst', 'POST', {
          deviceId: selectedDeviceId(),
          loops: Number($burstLoops.value || '2'),
          waitForReadyMs: cfg.waitForReadyMs,
          urls: cfg.urls,
          workflowName: workflowName || undefined,
          packageName: 'com.android.chrome',
        });
        renderOutput(result);
        setMessage('Burst scenario enqueued', false);
        await refreshJobsAndLanes();
      }

      async function loadDashboardPayload() {
        const result = await api('/api/dashboard');
        renderOutput(result);
        setMessage('Dashboard payload loaded', false);
      }

      async function runDeviceSmoke() {
        const result = await api('/api/device/smoke', 'POST', {
          deviceId: selectedDeviceId(),
          packageName: 'com.android.chrome',
          url: $smokeUrl.value || 'https://www.wikipedia.org',
          waitForReadyMs: 900,
        });
        renderOutput(result);
        setMessage(result.pass ? 'Device smoke passed' : 'Device smoke finished with low score', !result.pass);
      }

      async function retryFailedJobsUi() {
        const result = await api('/api/jobs/retry-failed', 'POST', {
          laneId: selectedDeviceId() ? 'device:' + selectedDeviceId() : undefined,
          limit: 60,
        });
        renderOutput(result);
        setMessage('Failed jobs re-queued', false);
        await refreshJobsAndLanes();
      }

      async function pruneJobsUi() {
        const result = await api('/api/jobs/prune', 'POST', {
          statuses: ['completed', 'failed', 'cancelled'],
          keepLatest: 140,
        });
        renderOutput(result);
        setMessage('Terminal jobs pruned', false);
        await refreshJobsAndLanes();
      }

      async function runAutopilotUi() {
        const cfg = stressConfig();
        const workflowName = selectedWorkflowName();
        const result = await api('/api/autopilot/run', 'POST', {
          deviceIds: selectedDeviceId() ? [selectedDeviceId()] : undefined,
          loops: Number($autopilotLoops.value || '2'),
          waitForReadyMs: cfg.waitForReadyMs,
          urls: cfg.urls,
          workflowName: workflowName || undefined,
          packageName: 'com.android.chrome',
        });
        renderOutput(result);
        setMessage('Autopilot queued', false);
        await refreshJobsAndLanes();
      }

      async function loadTimeline() {
        const result = await api('/api/dashboard/timeline?limit=120');
        renderTimeline(result);
        setMessage('Timeline loaded', false);
      }

      async function resetTimeline() {
        const result = await api('/api/dashboard/timeline/reset', 'POST', {});
        renderOutput(result);
        await loadTimeline();
      }

      async function startRecorderUi() {
        const name = ($recorderName.value || '').trim();
        if (!name) {
          throw new Error('recorder name required');
        }
        const result = await api('/api/recorder/start', 'POST', { name });
        renderOutput(result);
        setMessage('Recorder started', false);
        await listRecorderSessionsUi();
      }

      async function stopRecorderUi() {
        const result = await api('/api/recorder/stop', 'POST', {});
        renderOutput(result);
        setMessage('Recorder stopped', false);
        await listRecorderSessionsUi();
      }

      async function listRecorderSessionsUi() {
        const result = await api('/api/recorder/sessions');
        renderRecorderSessions(result);
      }

      async function replayRecorderUi() {
        const name = ($recorderName.value || '').trim();
        if (!name) {
          throw new Error('recorder name required');
        }
        const result = await api('/api/recorder/replay', 'POST', {
          name,
          deviceId: selectedDeviceId(),
          limit: 200,
        });
        renderOutput(result);
        setMessage('Recorder replay queued', false);
        await refreshJobsAndLanes();
      }

      async function saveQueuePresetUi() {
        const name = ($presetName.value || '').trim();
        if (!name) {
          throw new Error('preset name required');
        }
        let jobs;
        try {
          jobs = JSON.parse($presetJobs.value || '[]');
        } catch (error) {
          throw new Error('preset jobs must be valid JSON');
        }
        const result = await api('/api/queue-presets', 'POST', {
          name,
          jobs,
        });
        renderOutput(result);
        setMessage('Queue preset saved', false);
      }

      async function runQueuePresetUi() {
        const name = ($presetName.value || '').trim();
        if (!name) {
          throw new Error('preset name required');
        }
        const result = await api('/api/queue-presets/run', 'POST', {
          name,
          deviceId: selectedDeviceId(),
        });
        renderOutput(result);
        setMessage('Queue preset queued', false);
        await refreshJobsAndLanes();
      }

      async function loadHeatmapUi() {
        const result = await api('/api/lanes/heatmap');
        renderHeatmap(result);
        renderOutput(result);
        setMessage('Lane heatmap loaded', false);
      }

      async function loadWallboardUi() {
        const result = await api('/api/device/wallboard', 'POST', {
          packageName: 'com.android.chrome',
        });
        renderOutput(result);
        setMessage('Device wallboard generated', false);
      }

      async function loadPolicyUi() {
        const result = await api('/api/policy');
        const policy = result.policy || {};
        $policyMaxQueue.value = String(policy.maxQueuePerLane || 60);
        $policyFailThreshold.value = String(policy.failurePauseThreshold || 6);
        $policyRetryLimit.value = String(policy.autoRetryFailedLimit || 15);
        $policyAutoPause.value = String(policy.autoPauseOnFailure === false ? false : true);
        renderOutput(result);
        setMessage('Policy loaded', false);
      }

      async function savePolicyUi() {
        const result = await api('/api/policy', 'POST', {
          maxQueuePerLane: Number($policyMaxQueue.value || '60'),
          failurePauseThreshold: Number($policyFailThreshold.value || '6'),
          autoRetryFailedLimit: Number($policyRetryLimit.value || '15'),
          autoPauseOnFailure: $policyAutoPause.value === 'true',
        });
        renderOutput(result);
        setMessage('Policy updated', false);
      }

      async function runRunbookUi() {
        const result = await api('/api/runbook/run', 'POST', {
          name: $runbookName.value || 'recover-lane',
          deviceId: selectedDeviceId(),
          packageName: 'com.android.chrome',
          waitForReadyMs: 900,
          url: $smokeUrl.value || 'https://www.wikipedia.org',
          urls: stressConfig().urls,
        });
        renderOutput(result);
        setMessage('Runbook executed', false);
        await refreshJobsAndLanes();
      }

      async function runTransactionUi(dryRun) {
        let jobs;
        try {
          jobs = JSON.parse($transactionJobs.value || '[]');
        } catch (error) {
          throw new Error('transaction jobs must be valid JSON');
        }
        const result = await api('/api/jobs/transaction', 'POST', {
          jobs,
          dryRun: !!dryRun,
          atomic: true,
          deviceId: selectedDeviceId(),
        });
        renderOutput(result);
        setMessage(dryRun ? 'Transaction dry-run complete' : 'Transaction queued', false);
        if (!dryRun) {
          await refreshJobsAndLanes();
        }
      }

      async function loadOpsBoardUi() {
        const result = await api('/api/ops/board');
        renderOpsBoard(result);
        renderOutput(result);
        setMessage('Ops board loaded', false);
      }

      async function loadQueueBoardUi() {
        const result = await api('/api/board/queue');
        renderQueueBoard(result);
        renderOutput(result);
        setMessage('Queue board loaded', false);
      }

      async function moveQueuedJobUi() {
        const id = Number($moveJobId.value || '0');
        if (!id) {
          throw new Error('job id required');
        }
        const targetDevice = ($moveTargetDevice.value || '').trim();
        const result = await api('/api/jobs/' + id + '/move', 'POST', {
          targetDeviceId: targetDevice || undefined,
        });
        renderOutput(result);
        setMessage('Queued job moved', false);
        await refreshJobsAndLanes();
      }

      async function applyReorderUi() {
        let ids;
        try {
          ids = JSON.parse($reorderJobIds.value || '[]');
        } catch (error) {
          throw new Error('reorder ids must be valid JSON array');
        }
        const laneId = selectedDeviceId() ? 'device:' + selectedDeviceId() : 'device:default';
        const result = await api('/api/jobs/reorder', 'POST', {
          laneId,
          jobIds: Array.isArray(ids) ? ids : [],
        });
        renderOutput(result);
        setMessage('Lane reorder applied', false);
        await refreshJobsAndLanes();
      }

      async function createScheduleUi() {
        const name = ($scheduleName.value || '').trim();
        if (!name) {
          throw new Error('schedule name required');
        }
        const result = await api('/api/schedules', 'POST', {
          name,
          runbook: $scheduleRunbook.value || 'recover-lane',
          everyMs: Number($scheduleEveryMs.value || '30000'),
          deviceId: selectedDeviceId(),
          active: false,
        });
        renderOutput(result);
        setMessage('Schedule created', false);
        if (result.schedule && result.schedule.id) {
          $scheduleId.value = String(result.schedule.id);
        }
        await listSchedulesUi();
      }

      async function listSchedulesUi() {
        const result = await api('/api/schedules');
        renderSchedules(result);
      }

      async function startScheduleUi() {
        const id = Number($scheduleId.value || '0');
        if (!id) {
          throw new Error('schedule id required');
        }
        const result = await api('/api/schedules/' + id + '/start', 'POST', {});
        renderOutput(result);
        setMessage('Schedule started', false);
        await listSchedulesUi();
      }

      async function stopScheduleUi() {
        const id = Number($scheduleId.value || '0');
        if (!id) {
          throw new Error('schedule id required');
        }
        const result = await api('/api/schedules/' + id + '/stop', 'POST', {});
        renderOutput(result);
        setMessage('Schedule stopped', false);
        await listSchedulesUi();
      }

      async function deleteScheduleUi() {
        const id = Number($scheduleId.value || '0');
        if (!id) {
          throw new Error('schedule id required');
        }
        const result = await api('/api/schedules/' + id, 'DELETE');
        renderOutput(result);
        setMessage('Schedule deleted', false);
        await listSchedulesUi();
      }

      async function saveAlertRuleUi() {
        const result = await api('/api/alerts/rules', 'POST', {
          name: $alertName.value || 'alert-rule',
          metric: $alertMetric.value || 'queueDepth',
          operator: $alertOperator.value || 'gte',
          threshold: Number($alertThreshold.value || '10'),
          cooldownMs: Number($alertCooldown.value || '120000'),
          enabled: true,
        });
        renderOutput(result);
        setMessage('Alert rule saved', false);
        await loadAlertsUi();
      }

      async function checkAlertsUi() {
        const result = await api('/api/alerts/check', 'POST', {});
        renderOutput(result);
        setMessage('Alert check completed', false);
        await loadAlertsUi();
      }

      async function loadAlertsUi() {
        const [rulesPayload, incidentsPayload] = await Promise.all([
          api('/api/alerts/rules'),
          api('/api/alerts/incidents?limit=80'),
        ]);
        renderAlerts({
          rules: rulesPayload.rules || [],
          incidents: incidentsPayload.incidents || [],
        });
      }

      async function previewRunbookUi() {
        const result = await api('/api/runbook/preview', 'POST', {
          name: $runbookName.value || 'recover-lane',
          deviceId: selectedDeviceId(),
          laneId: selectedDeviceId() ? 'device:' + selectedDeviceId() : 'device:default',
        });
        renderOutput(result);
        setMessage('Runbook preview loaded', false);
      }

      async function loadRunbookCatalogUi() {
        const result = await api('/api/runbook/catalog');
        renderOutput(result);
        setMessage('Runbook catalog loaded', false);
      }

      async function exportQueueUi() {
        const result = await api('/api/queue/export');
        $queueImportExport.value = JSON.stringify(result, null, 2);
        renderOutput(result);
        setMessage('Queue exported', false);
      }

      async function importQueueUi() {
        let parsed;
        try {
          parsed = JSON.parse($queueImportExport.value || '{}');
        } catch (error) {
          throw new Error('queue import payload must be valid JSON');
        }
        const result = await api('/api/queue/import', 'POST', {
          lanes: parsed.lanes || [],
          clearExisting: false,
        });
        renderOutput(result);
        setMessage('Queue imported', false);
        await refreshJobsAndLanes();
      }

      async function saveBaselineUi() {
        const name = ($baselineName.value || '').trim();
        if (!name) {
          throw new Error('baseline name required');
        }
        const result = await api('/api/device/baselines/save', 'POST', {
          name,
          deviceId: selectedDeviceId(),
          packageName: 'com.android.chrome',
        });
        renderOutput(result);
        setMessage('Baseline saved', false);
      }

      async function compareBaselineUi() {
        const name = ($baselineName.value || '').trim();
        if (!name) {
          throw new Error('baseline name required');
        }
        const result = await api('/api/device/compare-baseline', 'POST', {
          name,
          deviceId: selectedDeviceId(),
          packageName: 'com.android.chrome',
        });
        renderOutput(result);
        setMessage('Baseline compared', false);
      }

      async function listBaselinesUi() {
        const result = await api('/api/device/baselines');
        renderOutput(result);
        const baselines = Array.isArray(result.baselines) ? result.baselines : [];
        if (baselines.length > 0) {
          $baselineName.value = baselines[0].name;
        }
        setMessage('Baselines listed', false);
      }

      async function ackAllAlertsUi() {
        const result = await api('/api/alerts/incidents/ack-all', 'POST', {});
        renderOutput(result);
        setMessage('All incidents acknowledged', false);
        await loadAlertsUi();
      }

      async function loadDiagnosticsReportUi() {
        const result = await api('/api/diagnostics/report');
        renderOutput(result);
        setMessage('Diagnostics report loaded', false);
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
      document.getElementById('profile-btn').addEventListener('click', async function () {
        try { await captureDeviceProfile(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('profiles-btn').addEventListener('click', async function () {
        try { await captureAllProfiles(); } catch (error) { setMessage(String(error), true); }
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
      document.getElementById('workflow-export-btn').addEventListener('click', async function () {
        try { await exportWorkflows(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('workflow-import-btn').addEventListener('click', async function () {
        try { await importWorkflows(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('job-enqueue-btn').addEventListener('click', async function () {
        try { await enqueueSingleJob(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('job-bulk-btn').addEventListener('click', async function () {
        try { await enqueueBulkJobs(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('job-refresh-btn').addEventListener('click', async function () {
        try { await refreshJobsAndLanes(); setMessage('Jobs and lanes refreshed', false); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('refresh-state-btn').addEventListener('click', async function () {
        try { await refreshCore(); setMessage('State refreshed', false); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('export-session-btn').addEventListener('click', async function () {
        try { await exportSession(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('reset-session-btn').addEventListener('click', async function () {
        try { await resetSession(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('pause-all-lanes-btn').addEventListener('click', async function () {
        try { await pauseAllLanes(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('resume-all-lanes-btn').addEventListener('click', async function () {
        try { await resumeAllLanes(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('cancel-queued-btn').addEventListener('click', async function () {
        try { await cancelQueued(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('burst-enqueue-btn').addEventListener('click', async function () {
        try { await enqueueBurstScenario(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('dashboard-btn').addEventListener('click', async function () {
        try { await loadDashboardPayload(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('smoke-btn').addEventListener('click', async function () {
        try { await runDeviceSmoke(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('retry-failed-btn').addEventListener('click', async function () {
        try { await retryFailedJobsUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('prune-jobs-btn').addEventListener('click', async function () {
        try { await pruneJobsUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('autopilot-btn').addEventListener('click', async function () {
        try { await runAutopilotUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('timeline-btn').addEventListener('click', async function () {
        try { await loadTimeline(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('timeline-reset-btn').addEventListener('click', async function () {
        try { await resetTimeline(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('recorder-start-btn').addEventListener('click', async function () {
        try { await startRecorderUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('recorder-stop-btn').addEventListener('click', async function () {
        try { await stopRecorderUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('recorder-list-btn').addEventListener('click', async function () {
        try { await listRecorderSessionsUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('recorder-replay-btn').addEventListener('click', async function () {
        try { await replayRecorderUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('preset-save-btn').addEventListener('click', async function () {
        try { await saveQueuePresetUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('preset-run-btn').addEventListener('click', async function () {
        try { await runQueuePresetUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('heatmap-btn').addEventListener('click', async function () {
        try { await loadHeatmapUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('wallboard-btn').addEventListener('click', async function () {
        try { await loadWallboardUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('policy-load-btn').addEventListener('click', async function () {
        try { await loadPolicyUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('policy-save-btn').addEventListener('click', async function () {
        try { await savePolicyUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('runbook-btn').addEventListener('click', async function () {
        try { await runRunbookUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('tx-dry-btn').addEventListener('click', async function () {
        try { await runTransactionUi(true); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('tx-run-btn').addEventListener('click', async function () {
        try { await runTransactionUi(false); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('ops-board-btn').addEventListener('click', async function () {
        try { await loadOpsBoardUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('queue-board-btn').addEventListener('click', async function () {
        try { await loadQueueBoardUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('move-job-btn').addEventListener('click', async function () {
        try { await moveQueuedJobUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('reorder-apply-btn').addEventListener('click', async function () {
        try { await applyReorderUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('schedule-create-btn').addEventListener('click', async function () {
        try { await createScheduleUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('schedule-list-btn').addEventListener('click', async function () {
        try { await listSchedulesUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('schedule-start-btn').addEventListener('click', async function () {
        try { await startScheduleUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('schedule-stop-btn').addEventListener('click', async function () {
        try { await stopScheduleUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('schedule-delete-btn').addEventListener('click', async function () {
        try { await deleteScheduleUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('alert-save-btn').addEventListener('click', async function () {
        try { await saveAlertRuleUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('alerts-check-btn').addEventListener('click', async function () {
        try { await checkAlertsUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('alerts-load-btn').addEventListener('click', async function () {
        try { await loadAlertsUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('runbook-preview-btn').addEventListener('click', async function () {
        try { await previewRunbookUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('runbook-catalog-btn').addEventListener('click', async function () {
        try { await loadRunbookCatalogUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('queue-export-btn').addEventListener('click', async function () {
        try { await exportQueueUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('queue-import-btn').addEventListener('click', async function () {
        try { await importQueueUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('baseline-save-btn').addEventListener('click', async function () {
        try { await saveBaselineUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('baseline-compare-btn').addEventListener('click', async function () {
        try { await compareBaselineUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('baseline-list-btn').addEventListener('click', async function () {
        try { await listBaselinesUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('alerts-ack-all-btn').addEventListener('click', async function () {
        try { await ackAllAlertsUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('diagnostics-report-btn').addEventListener('click', async function () {
        try { await loadDiagnosticsReportUi(); } catch (error) { setMessage(String(error), true); }
      });
      document.getElementById('clear-output-btn').addEventListener('click', function () {
        renderOutput({});
      });

      $deviceSelect.addEventListener('change', function () {
        state.deviceId = $deviceSelect.value || undefined;
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
        const selected = state.workflows.find(function (w) { return w.name === $workflowSelect.value; });
        if (selected) {
          $workflowName.value = selected.name;
          $workflowSteps.value = JSON.stringify(selected.steps || [], null, 2);
        }
      });

      async function init() {
        try {
          await refreshCore();
          const history = await api('/api/history?limit=45');
          const events = Array.isArray(history.events) ? history.events : [];
          for (let i = events.length - 1; i >= 0; i -= 1) {
            addEvent(events[i]);
          }
          connectRealtime();
          await loadTimeline();
          await loadHeatmapUi();
          await loadPolicyUi();
          await loadOpsBoardUi();
          await loadQueueBoardUi();
          await listSchedulesUi();
          await loadAlertsUi();
          await listBaselinesUi();
          renderOutput({ ok: true, message: 'UI ready', updateHint: '${UPDATE_HINT}' });
          setMessage('Ready.', false);

          setInterval(async function () {
            try {
              const metricsPayload = await api('/api/metrics');
              renderMetrics(metricsPayload);
              await refreshJobsAndLanes();
              const timelinePayload = await api('/api/dashboard/timeline?limit=120');
              renderTimeline(timelinePayload);
              const recorderPayload = await api('/api/recorder/sessions');
              renderRecorderSessions(recorderPayload);
              const opsBoardPayload = await api('/api/ops/board');
              renderOpsBoard(opsBoardPayload);
              const schedulesPayload = await api('/api/schedules');
              renderSchedules(schedulesPayload);
              const queueBoardPayload = await api('/api/board/queue');
              renderQueueBoard(queueBoardPayload);
              const incidentsPayload = await api('/api/alerts/incidents?limit=80');
              const rulesPayload = await api('/api/alerts/rules');
              renderAlerts({
                rules: rulesPayload.rules || [],
                incidents: incidentsPayload.incidents || [],
              });
              const baselinesPayload = await api('/api/device/baselines');
              const baselines = Array.isArray(baselinesPayload.baselines) ? baselinesPayload.baselines : [];
              if (baselines.length > 0 && (!$baselineName.value || !$baselineName.value.trim())) {
                $baselineName.value = baselines[0].name;
              }
            } catch (error) {
              setMessage('Background refresh failed', true);
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
  ensureSchedulesInitialized();

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

  setupWebSocketUpgrade(server);

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
