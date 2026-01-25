#!/usr/bin/env node

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

function getElectronPaths() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const electronPath = require('electron') as string;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const electronPkgPath = require.resolve('electron/package.json');
  const electronRoot = path.dirname(electronPkgPath);
  const chromeSandboxPath = path.join(electronRoot, 'dist', 'chrome-sandbox');
  return { electronPath, chromeSandboxPath };
}

function shouldDisableSandbox(chromeSandboxPath: string) {
  if (process.platform !== 'linux') return false;
  if (process.env.THE_ANDROID_MCP_FORCE_SANDBOX === '1') return false;
  if (
    process.env.THE_ANDROID_MCP_NO_SANDBOX === '1' ||
    process.env.ELECTRON_DISABLE_SANDBOX === '1' ||
    process.env.ELECTRON_NO_SANDBOX === '1'
  ) {
    return true;
  }

  try {
    const stat = fs.statSync(chromeSandboxPath);
    const mode = stat.mode & 0o7777;
    if (stat.uid !== 0 || mode !== 0o4755) {
      return true;
    }
  } catch (error) {
    return true;
  }

  return false;
}

function ensureGuiDir(guiDir: string) {
  if (!fs.existsSync(guiDir)) {
    // eslint-disable-next-line no-console
    console.error(
      `[the-android-mcp-gui] GUI assets not found at ${guiDir}. ` +
        'Make sure you installed the package with GUI assets.'
    );
    process.exit(1);
  }
}

function start() {
  const guiDir = path.join(__dirname, '..', 'apps', 'gui');
  ensureGuiDir(guiDir);

  let electronPath: string;
  let chromeSandboxPath: string;

  try {
    const resolved = getElectronPaths();
    electronPath = resolved.electronPath;
    chromeSandboxPath = resolved.chromeSandboxPath;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      '[the-android-mcp-gui] Electron not found. Reinstall with dependencies.'
    );
    process.exit(1);
    return;
  }

  const disableSandbox = shouldDisableSandbox(chromeSandboxPath);
  const args: string[] = [];

  if (disableSandbox) {
    args.push('--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu-sandbox');
  }

  args.push('.');

  const env = { ...process.env };
  if (disableSandbox) {
    env.ELECTRON_DISABLE_SANDBOX = env.ELECTRON_DISABLE_SANDBOX || '1';
    env.ELECTRON_NO_SANDBOX = env.ELECTRON_NO_SANDBOX || '1';
  }

  const child = spawn(electronPath, args, {
    cwd: guiDir,
    env,
    stdio: 'inherit',
  });

  child.on('exit', code => {
    process.exit(code ?? 0);
  });
}

start();
