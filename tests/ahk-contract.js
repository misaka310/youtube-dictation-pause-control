const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const ahk = fs.readFileSync(path.join(root, 'ahk', 'youtube-dictation-control.ahk'), 'utf8');
const settings = JSON.parse(fs.readFileSync(path.join(root, 'config', 'settings.example.json'), 'utf8'));
const stopScript = fs.readFileSync(path.join(root, 'scripts', 'windows', 'stop-tracked-processes.ps1'), 'utf8');
const startScript = fs.readFileSync(path.join(root, 'start.bat'), 'utf8');
const backgroundStartScript = fs.readFileSync(path.join(root, 'scripts', 'windows', 'start-background.bat'), 'utf8');

let caseCount = 0;

function test(name, fn) {
  try {
    fn();
    caseCount += 1;
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
}

test('default settings expose a dedicated reset hotkey', () => {
  assert.strictEqual(settings.resetHotkey, 'Ctrl+Alt+R');
});

test('AHK reads resetHotkey from settings.json', () => {
  assert.match(ahk, /global\s+RESET_HOTKEY_RAW\s*:=\s*"Ctrl\+Alt\+R"/);
  assert.match(ahk, /"resetHotkey"/);
  assert.match(ahk, /RESET_HOTKEY_RAW\s*:=\s*match\[1\]/);
});

test('reset clears both app states, aggregate state, and debounce timestamps', () => {
  const resetFunction = ahk.match(/ResetDictationState\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(resetFunction, 'ResetDictationState function must exist');
  const body = resetFunction[1];

  assert.match(body, /isTypelessActive\s*:=\s*false/);
  assert.match(body, /isWisprFlowActive\s*:=\s*false/);
  assert.match(body, /anyDictationActive\s*:=\s*false/);
  assert.match(body, /lastTypelessTick\s*:=\s*0/);
  assert.match(body, /lastWisprFlowTick\s*:=\s*0/);
});

test('reset synchronizes the server to inactive', () => {
  const resetFunction = ahk.match(/ResetDictationState\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(resetFunction, 'ResetDictationState function must exist');
  assert.match(resetFunction[1], /SendStateToServer\(false\)/);
});

test('AHK registers the configured reset hotkey', () => {
  assert.match(ahk, /parsedResetKey\s*:=\s*ParseHotkey\(RESET_HOTKEY_RAW\)/);
  assert.match(ahk, /Hotkey\(parsedResetKey,\s*ResetDictationState\)/);
});

test('AHK log writes retry transient file locks', () => {
  assert.match(ahk, /AppendLogWithRetry\(logFile,\s*logLine\)/);
  assert.match(ahk, /Loop\s+\d+/);
  assert.match(ahk, /FileAppend\(logLine,\s*logFile,\s*"UTF-8"\)/);
  assert.match(ahk, /Sleep\(/);
});

test('process cleanup supports an AHK-only mode', () => {
  assert.match(stopScript, /param\s*\(\s*\[switch\]\$AhkOnly\s*\)/i);
  assert.match(stopScript, /if\s*\(-not\s+\$AhkOnly\)/i);
});

test('a stale server PID triggers verified-port fallback and failed stops propagate', () => {
  const missingProcessBlock = stopScript.match(/if \(\$null -eq \$process\) \{([\s\S]*?)\n    \}/);
  assert.ok(missingProcessBlock, 'missing-process PID block must exist');
  assert.match(missingProcessBlock[1], /return \$false/);
  assert.match(stopScript, /if \(-not \(Stop-VerifiedProcess -ProcessId \$ownerId/);
  assert.match(stopScript, /throw "Failed to stop \$failedCount verified Node server process\(es\)\."/);
});

test('process cleanup finds orphaned instances and verifies termination', () => {
  assert.match(stopScript, /Get-CimInstance\s+Win32_Process/i);
  assert.match(stopScript, /youtube-dictation-control\.ahk/i);
  assert.match(stopScript, /function\s+Stop-VerifiedProcess/i);
  assert.match(stopScript, /Get-Process\s+-Id\s+\$ProcessId/i);
  assert.match(stopScript, /Stop-VerifiedProcess\s+-ProcessId\s+\$process\.ProcessId/i);
  assert.match(stopScript, /throw "AutoHotkey fallback scan failed:/i);
});

test('manual startup removes prior matching AHK instances before launch', () => {
  const cleanupIndex = startScript.indexOf('-AhkOnly');
  const launchIndex = startScript.indexOf('start "" "%AHK_EXE%" "ahk\\youtube-dictation-control.ahk"');
  assert.ok(cleanupIndex >= 0, 'start.bat must invoke AHK-only cleanup');
  assert.ok(launchIndex >= 0, 'start.bat must launch the AHK script');
  assert.ok(cleanupIndex < launchIndex, 'cleanup must run before the AHK launch');
});

test('background startup removes prior matching AHK instances before launch', () => {
  const cleanupIndex = backgroundStartScript.indexOf('-AhkOnly');
  const launchIndex = backgroundStartScript.indexOf('start "" "%AHK_EXE%" "ahk\\youtube-dictation-control.ahk"');
  assert.ok(cleanupIndex >= 0, 'start-background.bat must invoke AHK-only cleanup');
  assert.ok(launchIndex >= 0, 'start-background.bat must launch the AHK script');
  assert.ok(cleanupIndex < launchIndex, 'cleanup must run before the AHK launch');
});

console.log(`AHK contract tests passed: ${caseCount} cases`);
