const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const buildScriptPath = path.join(root, 'scripts', 'windows', 'build-release.ps1');
const runtimeVerifierPath = path.join(root, 'scripts', 'windows', 'verify-release-runtime.ps1');
const noticesPath = path.join(root, 'THIRD_PARTY_NOTICES.md');
const gplPath = path.join(root, 'licenses', 'AutoHotkey-GPL-2.0.txt');
const ciPath = path.join(root, '.github', 'workflows', 'ci.yml');

for (const [filePath, message] of [
  [buildScriptPath, 'build-release.ps1 must exist'],
  [runtimeVerifierPath, 'verify-release-runtime.ps1 must exist'],
  [noticesPath, 'THIRD_PARTY_NOTICES.md must exist'],
  [gplPath, 'AutoHotkey GPL-2.0 license text must exist'],
  [ciPath, 'CI workflow must exist']
]) {
  assert.ok(fs.existsSync(filePath), message);
}

const buildScript = fs.readFileSync(buildScriptPath, 'utf8');
const runtimeVerifier = fs.readFileSync(runtimeVerifierPath, 'utf8');
const notices = fs.readFileSync(noticesPath, 'utf8');
const gpl = fs.readFileSync(gplPath, 'utf8');
const ci = fs.readFileSync(ciPath, 'utf8');

assert.match(buildScript, /\$AutoHotkeyVersion\s*=\s*'2\.0\.\d+'/);
assert.match(buildScript, /\$Ahk2ExeVersion\s*=\s*'[^']+'/);
assert.match(buildScript, /\$AutoHotkeyArchiveSha256\s*=\s*'[A-Fa-f0-9]{64}'/);
assert.match(buildScript, /github\.com\/AutoHotkey\/AutoHotkey\/releases\/download\/v\$AutoHotkeyVersion\/AutoHotkey_\$AutoHotkeyVersion\.zip/);
assert.doesNotMatch(buildScript, /www\.autohotkey\.com\/download/);
assert.match(buildScript, /\$Ahk2ExeArchiveSha256\s*=\s*'[A-Fa-f0-9]{64}'/);
assert.match(buildScript, /\$AutoHotkeySourceSha256\s*=\s*'[A-Fa-f0-9]{64}'/);
assert.match(buildScript, /Get-FileHash\s+-Algorithm\s+SHA256/i);
assert.match(buildScript, /\$env:ComSpec/);
assert.match(buildScript, /Ahk2Exe\.exe/);
assert.match(buildScript, /\/in/i);
assert.match(buildScript, /\/out/i);
assert.match(buildScript, /\/base/i);
assert.match(buildScript, /\/ahk/i);
assert.match(buildScript, /\/silent/i);
assert.match(buildScript, /AutoHotkey64\.exe/);
assert.match(buildScript, /Compress-Archive/);

for (const requiredEntry of [
  'YouTubeDictationControl.exe',
  'server',
  'extension',
  'settings.example.json',
  'THIRD_PARTY_NOTICES.md',
  'AutoHotkey-GPL-2.0.txt',
  'AutoHotkey-v$AutoHotkeyVersion-source.zip'
]) {
  assert.ok(buildScript.includes(requiredEntry), `release staging must include ${requiredEntry}`);
}

for (const prohibitedEntry of [
  'config/settings.json',
  'runtime',
  'logs',
  '.git',
  '.build-cache',
  'tests',
  'scripts'
]) {
  assert.ok(buildScript.includes(prohibitedEntry), `release validation must reject ${prohibitedEntry}`);
}

assert.match(runtimeVerifier, /YouTubeDictationControl\.exe/);
assert.match(runtimeVerifier, /ParentProcessId/);
assert.match(runtimeVerifier, /Wait-NewListenerProcessId/);
assert.match(runtimeVerifier, /Stop-Process\s+-Id\s+\$initialServerPid\s+-Force/);
assert.match(runtimeVerifier, /ownedShutdownVerified\s*=\s*\$true/);
assert.match(runtimeVerifier, /WindowCloser/);

assert.match(ci, /npm test/);
assert.match(ci, /build-release\.ps1/);

assert.match(notices, /AutoHotkey/i);
assert.match(notices, /GNU General Public License version 2|GPL-2\.0/i);
assert.match(notices, /corresponding source/i);
assert.match(notices, /2\.0\.\d+/);
assert.match(gpl, /GNU GENERAL PUBLIC LICENSE/);
assert.match(gpl, /Version 2, June 1991/);

console.log('Release contract tests passed');
