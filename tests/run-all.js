#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const node = process.execPath;
const steps = [
  [node, ['tests/check.js']],
  [node, ['tests/smoke-api.js']],
  [node, ['tests/extension-content.js']],
  [node, ['tests/extension-background.js']],
  [node, ['tests/log-writer.js']],
  [node, ['tests/ahk-contract.js']],
  [node, ['tests/release-contract.js']],
];

for (const [command, args] of steps) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

console.log('YouTube Dictation Pause Control tests: PASS');
