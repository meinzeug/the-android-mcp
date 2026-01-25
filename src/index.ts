#!/usr/bin/env node

import pkg from '../package.json';
import { AndroidMcpServer } from './server';

async function main() {
  try {
    const args = process.argv.slice(2);
    if (args.includes('--version') || args.includes('-v') || args.includes('-V')) {
      console.log(pkg.version);
      return;
    }

    const server = new AndroidMcpServer();
    await server.run();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
