const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
for (const file of ['extension/manifest.json', 'config/settings.example.json']) {
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')), `${file} must be valid JSON`);
}

for (const file of ['extension/content.js', 'extension/background.js', 'server/server.js', 'tests/extension-content.js', 'tests/extension-background.js', 'tests/smoke-api.js']) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr || `${file} syntax check failed`);
}

console.log('JavaScript and JSON checks passed');
