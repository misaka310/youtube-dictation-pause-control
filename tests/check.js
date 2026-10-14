const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const jsonFiles = ['extension/manifest.json', 'config/settings.example.json'];
const javascriptFiles = [
  'extension/content.js',
  'extension/background.js',
  'server/server.js',
  'server/log-writer.js',
  'tests/extension-content.js',
  'tests/extension-background.js',
  'tests/smoke-api.js',
  'tests/log-writer.js',
  'tests/ahk-contract.js'
];

for (const file of jsonFiles) {
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')), `${file} must be valid JSON`);
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
assert.deepStrictEqual(manifest.icons, {
  16: 'icons/icon16.png',
  32: 'icons/icon32.png',
  48: 'icons/icon48.png',
  128: 'icons/icon128.png'
});

for (const iconPath of Object.values(manifest.icons)) {
  assert.strictEqual(
    fs.existsSync(path.join(root, 'extension', iconPath)),
    true,
    `${iconPath} must exist`
  );
}

for (const file of javascriptFiles) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr || `${file} syntax check failed`);
}

console.log(`Syntax/JSON checks passed: ${jsonFiles.length + javascriptFiles.length} cases (JSON: ${jsonFiles.length}, JavaScript: ${javascriptFiles.length})`);
