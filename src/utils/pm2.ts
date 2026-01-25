import { execSync, ExecSyncOptions } from 'child_process';
import fs from 'fs';
import path from 'path';

const DEFAULT_TIMEOUT = 15000;

function escapeShellArg(value: string): string {
  if (process.platform === 'win32') {
    const escaped = value.replace(/"/g, '\\"');
    return /[\s"]/g.test(value) ? `"${escaped}"` : escaped;
  }

  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function resolveProjectRoot(projectRoot?: string): string {
  return projectRoot ? path.resolve(process.cwd(), projectRoot) : process.cwd();
}

function resolveHotModeConfigPath(configPath?: string, projectRoot?: string): string {
  if (configPath) {
    return path.resolve(resolveProjectRoot(projectRoot), configPath);
  }

  const root = resolveProjectRoot(projectRoot);
  const candidate = path.join(root, 'android_hot_mode.config.json');

  if (!fs.existsSync(candidate)) {
    throw new Error(`Hot mode config not found at ${candidate}`);
  }

  return candidate;
}

function ensurePm2Available(): void {
  try {
    execSync('pm2 -v', { stdio: 'pipe', timeout: DEFAULT_TIMEOUT });
  } catch (error: any) {
    throw new Error(`pm2 not available: ${error?.message ?? String(error)}`);
  }
}

export function startPm2HotMode(options: {
  configPath?: string;
  projectRoot?: string;
  appName?: string;
}): { configPath: string; appName?: string; output: string } {
  ensurePm2Available();
  const configPath = resolveHotModeConfigPath(options.configPath, options.projectRoot);
  const appName = options.appName;
  const args = ['start', escapeShellArg(configPath)];

  if (appName) {
    args.push('--only', escapeShellArg(appName));
  }

  const output = execSync(`pm2 ${args.join(' ')}`, {
    stdio: 'pipe',
    timeout: DEFAULT_TIMEOUT,
  } as ExecSyncOptions).toString('utf-8');

  return { configPath, appName, output: output.trim() };
}

export function stopPm2App(appName: string): { appName: string; output: string } {
  ensurePm2Available();
  const output = execSync(`pm2 stop ${escapeShellArg(appName)}`, {
    stdio: 'pipe',
    timeout: DEFAULT_TIMEOUT,
  } as ExecSyncOptions).toString('utf-8');

  return { appName, output: output.trim() };
}

export function listPm2Apps(): { processes: any[]; output: string } {
  ensurePm2Available();
  const output = execSync('pm2 jlist', {
    stdio: 'pipe',
    timeout: DEFAULT_TIMEOUT,
  } as ExecSyncOptions).toString('utf-8');

  let processes: any[] = [];
  try {
    processes = JSON.parse(output);
  } catch {
    processes = [];
  }

  return { processes, output: output.trim() };
}
