const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const buildScriptPath = path.join(root, 'scripts', 'windows', 'build-release.ps1');
const runtimeVerifierPath = path.join(root, 'scripts', 'windows', 'verify-release-runtime.ps1');
const releaseTagValidatorPath = path.join(root, 'scripts', 'windows', 'validate-release-tag.ps1');
const noticesPath = path.join(root, 'THIRD_PARTY_NOTICES.md');
const gplPath = path.join(root, 'licenses', 'AutoHotkey-GPL-2.0.txt');
const ciPath = path.join(root, '.github', 'workflows', 'ci.yml');
const releaseWorkflowPath = path.join(root, '.github', 'workflows', 'release.yml');
const readmePath = path.join(root, 'README.md');
const releasingGuidePath = path.join(root, 'docs', 'releasing.md');
const publicReleaseChecklistPath = path.join(root, 'docs', 'public-release-checklist.md');
const packagePath = path.join(root, 'package.json');
const extensionManifestPath = path.join(root, 'extension', 'manifest.json');
const serverPath = path.join(root, 'server', 'server.js');

for (const [filePath, message] of [
  [buildScriptPath, 'build-release.ps1 must exist'],
  [runtimeVerifierPath, 'verify-release-runtime.ps1 must exist'],
  [releaseTagValidatorPath, 'validate-release-tag.ps1 must exist'],
  [noticesPath, 'THIRD_PARTY_NOTICES.md must exist'],
  [gplPath, 'AutoHotkey GPL-2.0 license text must exist'],
  [ciPath, 'CI workflow must exist'],
  [releaseWorkflowPath, 'Release workflow must exist'],
  [readmePath, 'README.md must exist'],
  [releasingGuidePath, 'release guide must exist'],
  [publicReleaseChecklistPath, 'public release checklist must exist'],
  [packagePath, 'package.json must exist'],
  [extensionManifestPath, 'extension manifest must exist'],
  [serverPath, 'server.js must exist']
]) {
  assert.ok(fs.existsSync(filePath), message);
}

const buildScript = fs.readFileSync(buildScriptPath, 'utf8');
const runtimeVerifier = fs.readFileSync(runtimeVerifierPath, 'utf8');
const releaseTagValidator = fs.readFileSync(releaseTagValidatorPath, 'utf8');
const notices = fs.readFileSync(noticesPath, 'utf8');
const gpl = fs.readFileSync(gplPath, 'utf8');
const ci = fs.readFileSync(ciPath, 'utf8');
const releaseWorkflow = fs.readFileSync(releaseWorkflowPath, 'utf8');
const readme = fs.readFileSync(readmePath, 'utf8');
const releasingGuide = fs.readFileSync(releasingGuidePath, 'utf8');
const publicReleaseChecklist = fs.readFileSync(publicReleaseChecklistPath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const extensionManifest = JSON.parse(fs.readFileSync(extensionManifestPath, 'utf8'));
const server = fs.readFileSync(serverPath, 'utf8');

assert.match(buildScript, /\$AutoHotkeyVersion\s*=\s*'2\.0\.\d+'/);
assert.match(buildScript, /\$Ahk2ExeVersion\s*=\s*'[^']+'/);
assert.match(buildScript, /\$NodeVersion\s*=\s*'24\.18\.0'/);
assert.match(buildScript, /\$NodeArchiveSha256\s*=\s*'0AE68406B42D7725661DA979B1403EC9926DA205C6770827F33AAC9D8F26E821'/);
assert.match(buildScript, /nodejs\.org\/dist\/v\$NodeVersion\/node-v\$NodeVersion-win-x64\.zip/);
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
  'vendor\\node\\node.exe',
  'vendor\\node\\LICENSE',
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
assert.match(runtimeVerifier, /vendor\\node\\node\.exe/);
assert.match(runtimeVerifier, /ExecutablePath\s+-ine\s+\$bundledNodePath/);
assert.match(runtimeVerifier, /Start-Process\s+-FilePath\s+\$bundledNodePath/);
assert.match(runtimeVerifier, /RedirectStandardOutput/);
assert.match(runtimeVerifier, /bundledNodeVersionProcess\.ExitCode/);
assert.match(runtimeVerifier, /ParentProcessId/);
assert.match(runtimeVerifier, /Wait-NewListenerProcessId/);
assert.match(runtimeVerifier, /Stop-Process\s+-Id\s+\$initialServerPid\s+-Force/);
assert.match(runtimeVerifier, /ownedShutdownVerified\s*=\s*\$true/);
assert.match(runtimeVerifier, /WindowCloser/);

assert.match(ci, /npm test/);
assert.match(ci, /build-release\.ps1/);
assert.match(ci, /branches:\s*\r?\n\s*- ['"]?\*\*['"]?/);

assert.match(releaseWorkflow, /tags:\s*\r?\n\s*- ['"]v\*['"]/);
assert.match(releaseWorkflow, /permissions:\s*\r?\n\s*contents:\s*write/);
assert.match(releaseWorkflow, /runs-on:\s*windows-latest/);
assert.match(releaseWorkflow, /node-version:\s*22/);
assert.match(releaseWorkflow, /validate-release-tag\.ps1/);
assert.match(releaseWorkflow, /npm test/);
assert.match(releaseWorkflow, /build-release\.ps1/);
assert.match(releaseWorkflow, /Get-FileHash[^\r\n]+SHA256/i);
assert.match(releaseWorkflow, /SHA256SUMS\.txt/);
assert.match(releaseWorkflow, /Get-Command\s+gh\.exe/);
assert.match(releaseWorkflow, /Start-Process[^\r\n]+-FilePath\s+\$ghPath/);
assert.match(releaseWorkflow, /RedirectStandardError/);
assert.match(releaseWorkflow, /\$releaseProbe\.ExitCode\s*-eq\s*0/);
assert.doesNotMatch(releaseWorkflow, /^\s*gh release view \$tag \*> \$null\s*$/m);
assert.match(releaseWorkflow, /gh release upload[^\r\n]+--clobber/);
assert.match(releaseWorkflow, /gh release create/);
assert.match(releaseWorkflow, /--generate-notes/);
assert.match(releaseWorkflow, /GH_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}/);

assert.match(releaseTagValidator, /package\.json/);
assert.match(releaseTagValidator, /"v"\s*\+\s*\$package\.version/);
assert.match(releaseTagValidator, /throw/);

assert.match(readme, /releases\/latest/);
assert.match(readme, /Node\.jsとAutoHotkeyのインストールは不要/);
assert.doesNotMatch(readme, /Node\.js 22以上は別途必要|Node\.js自体はEXEに同梱していません/);
assert.match(readme, /vX\.Y\.Z/);
assert.match(readme, /SHA256SUMS\.txt/);
assert.match(readme, /docs\/releasing\.md/);
assert.match(releasingGuide, /package\.json/);
assert.match(releasingGuide, /vX\.Y\.Z/);
assert.match(releasingGuide, /自動/);
assert.match(publicReleaseChecklist, /GitHub Actions/i);
assert.match(publicReleaseChecklist, /SHA256SUMS\.txt/);

assert.strictEqual(extensionManifest.version, packageJson.version, 'extension manifest version must match package.json');
const serverVersionMatch = server.match(/const VERSION = '([^']+)'/);
assert.ok(serverVersionMatch, 'server version constant must exist');
assert.strictEqual(serverVersionMatch[1], packageJson.version, 'server version must match package.json');

assert.match(notices, /AutoHotkey/i);
assert.match(notices, /Node\.js/i);
assert.match(notices, /24\.18\.0/);
assert.match(notices, /vendor\/node\/LICENSE/);
assert.match(notices, /GNU General Public License version 2|GPL-2\.0/i);
assert.match(notices, /corresponding source/i);
assert.match(notices, /2\.0\.\d+/);
assert.match(gpl, /GNU GENERAL PUBLIC LICENSE/);
assert.match(gpl, /Version 2, June 1991/);

console.log('Release contract tests passed');
