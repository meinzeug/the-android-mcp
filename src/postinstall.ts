#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { DEFAULT_WEB_UI_PORT, ensureWebUiBackground } from './web-ui';

const CONFIG_PATH = path.join(os.homedir(), '.codex', 'config.toml');
const SERVER_BLOCK = [
  '[mcp_servers.the-android-mcp]',
  'command = "npx"',
  'args = ["-y", "the-android-mcp"]',
  'timeout = 10000',
  '',
].join('\n');

function shouldSkip(): boolean {
  const flag = process.env.THE_ANDROID_MCP_NO_CODEX_SETUP;
  return flag === '1' || flag === 'true';
}

function shouldSkipWebUiAutostart(): boolean {
  const flag = process.env.THE_ANDROID_MCP_NO_WEB_UI_AUTOSTART;
  const ci = process.env.CI;
  return flag === '1' || flag === 'true' || ci === '1' || ci === 'true';
}

function addCodexConfig(): void {
  if (!fs.existsSync(CONFIG_PATH)) {
    return;
  }

  const content = fs.readFileSync(CONFIG_PATH, 'utf8');
  if (content.includes('[mcp_servers.the-android-mcp]')) {
    return;
  }

  const trimmed = content.replace(/\s*$/, '');
  const updated = `${trimmed}\n\n${SERVER_BLOCK}\n`;
  fs.writeFileSync(CONFIG_PATH, updated, 'utf8');
  console.log('the-android-mcp: added Codex MCP config to ~/.codex/config.toml');
}

async function main(): Promise<void> {
  try {
    if (!shouldSkip()) {
      addCodexConfig();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`the-android-mcp: failed to update Codex config (${message})`);
  }

  try {
    if (!shouldSkipWebUiAutostart()) {
      const result = await ensureWebUiBackground({
        host: '127.0.0.1',
        port: DEFAULT_WEB_UI_PORT,
      });
      if (result.started) {
        console.log(`the-android-mcp: web ui started at ${result.url} (pid ${result.pid ?? 'n/a'})`);
      } else {
        console.log(`the-android-mcp: web ui already running at ${result.url}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`the-android-mcp: failed to start web ui (${message})`);
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`the-android-mcp: postinstall failed (${message})`);
});
