const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function needsNoSandbox() {
  if (process.platform !== 'linux') return false;
  if (process.env.THE_ANDROID_MCP_FORCE_SANDBOX === '1') return false;
  if (
    process.env.THE_ANDROID_MCP_NO_SANDBOX === '1' ||
    process.env.ELECTRON_DISABLE_SANDBOX === '1' ||
    process.env.ELECTRON_NO_SANDBOX === '1'
  ) {
    return true;
  }

  const sandboxPath = path.join(
    __dirname,
    '..',
    'node_modules',
    'electron',
    'dist',
    'chrome-sandbox'
  );

  try {
    const stat = fs.statSync(sandboxPath);
    const mode = stat.mode & 0o7777;
    if (stat.uid !== 0 || mode !== 0o4755) {
      return true;
    }
  } catch (error) {
    return true;
  }

  return false;
}

function start() {
  const electronPath = require('electron');
  const appDir = path.join(__dirname, '..');
  const disableSandbox = needsNoSandbox();
  const args = [];

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
    cwd: appDir,
    env,
    stdio: 'inherit',
  });

  child.on('exit', code => {
    process.exit(code ?? 0);
  });
}

start();
