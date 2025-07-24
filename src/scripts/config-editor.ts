#!/usr/bin/env node

import { InteractiveConfigEditor } from '../config-editor';
import Logger from '../utils/logger';

async function main() {
  try {
    const editor = new InteractiveConfigEditor();
    await editor.run();
  } catch (error) {
    Logger.error('Unexpected error in config editor script', { error });
    Logger.error('Unexpected error details', { error });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  Logger.info('Config editor interrupted by SIGINT');
  Logger.info('Config editor exiting - Goodbye! 👋');
  process.exit(0);
});

process.on('SIGTERM', () => {
  Logger.info('Config editor terminated by SIGTERM');
  Logger.info('Config editor exiting - Goodbye! 👋');
  process.exit(0);
});

main();