#!/usr/bin/env node

import { InteractiveConfigEditor } from '../config-editor';

async function main() {
  try {
    const editor = new InteractiveConfigEditor();
    await editor.run();
  } catch (error) {
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Goodbye!');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Goodbye!');
  process.exit(0);
});

main();