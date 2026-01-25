#!/usr/bin/env node

const path = require('path');

const guiPath = path.join(__dirname, '..', 'dist', 'gui.js');

try {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  require(guiPath);
} catch (error) {
  // eslint-disable-next-line no-console
  console.error(
    '[the-android-mcp-gui] GUI entry not found. Did you run the build before packaging?'
  );
  // eslint-disable-next-line no-console
  console.error(error?.message || error);
  process.exit(1);
}
