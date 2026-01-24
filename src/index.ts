#!/usr/bin/env node

import { AndroidMcpServer } from './server';

async function main() {
  try {
    const server = new AndroidMcpServer();
    await server.run();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
