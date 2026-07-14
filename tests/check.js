const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const jsonFiles = ['extension/manifest.json', 'config/settings.example.json'];
const javascriptFiles = ['extension/content.js', 'extension/background.js', 'server/server.js', 'tests/extension-content.js', 'tests/extension-background.js', 'tests/smoke-api.js'];

for (const file of jsonFiles) {
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')), `${file} must be valid JSON`);
}

for (const file of javascriptFiles) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr || `${file} syntax check failed`);
}

console.log(`Syntax/JSON checks passed: ${jsonFiles.length + javascriptFiles.length} cases (JSON: ${jsonFiles.length}, JavaScript: ${javascriptFiles.length})`);
