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

test('Typeless modifier chord tracks physical Ctrl and Shift on both sides', () => {
  assert.match(ahk, /global\s+typelessChordArmed\s*:=\s*false/);
  assert.match(ahk, /HandleTypelessModifierDown\([^)]*\)/);
  assert.match(ahk, /GetKeyState\("Ctrl",\s*"P"\)/);
  assert.match(ahk, /GetKeyState\("Shift",\s*"P"\)/);
  assert.match(ahk, /RegisterTypelessModifierHooks\(\)/);
  for (const key of ['LControl', 'RControl', 'LShift', 'RShift']) {
    assert.ok(ahk.includes(`"${key}"`), `Typeless chord must register ${key}`);
  }
  assert.doesNotMatch(ahk, /A_PriorKey/);
});

test('AHK log writes retry transient file locks', () => {
  assert.match(ahk, /AppendLogWithRetry\(logFile,\s*logLine\)/);
  assert.match(ahk, /Loop\s+\d+/);
  assert.match(ahk, /FileAppend\(logLine,\s*logFile,\s*"UTF-8"\)/);
  assert.match(ahk, /Sleep\(/);
});

test('AHK resolves one application root for interpreted and compiled modes', () => {
  assert.match(ahk, /GetParentDirectory\(path\)/);
  assert.match(ahk, /global\s+APP_ROOT\s*:=\s*A_IsCompiled\s*\?\s*A_ScriptDir\s*:\s*GetParentDirectory\(A_ScriptDir\)/);
  assert.match(ahk, /global\s+SERVER_SCRIPT\s*:=\s*APP_ROOT\s*\.\s*"\\server\\server\.js"/);
  assert.match(ahk, /global\s+LOG_FILE\s*:=\s*APP_ROOT\s*\.\s*"\\logs\\control\.log"/);
});

test('AHK owns a custom notification-area menu', () => {
  assert.match(ahk, /ConfigureTrayMenu\(\)/);
  assert.match(ahk, /A_TrayMenu\.Delete\(\)/);
  assert.match(ahk, /Status:/);
  assert.match(ahk, /Restart local bridge/);
  assert.match(ahk, /Reset dictation state/);
  assert.match(ahk, /Open log/);
  assert.match(ahk, /Start with Windows/);
  assert.match(ahk, /A_TrayMenu\.Add\("Exit"/);
});

test('AHK launches Node directly and hidden instead of opening a terminal', () => {
  const startFunction = ahk.match(/StartOwnedServer\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(startFunction, 'StartOwnedServer function must exist');
  assert.match(startFunction[1], /ResolveNodeExecutable\(\)/);
  assert.match(startFunction[1], /Run\([^\n]+SERVER_SCRIPT[^\n]+"Hide"[^\n]+&serverPid\)/);
  assert.doesNotMatch(startFunction[1], /cmd\.exe|wt\.exe|start-server\.bat/i);
});

test('AHK monitors bridge health with failure debounce and restart throttling', () => {
  assert.match(ahk, /global\s+HEALTH_CHECK_INTERVAL_MS\s*:=\s*5000/);
  assert.match(ahk, /global\s+HEALTH_FAILURE_THRESHOLD\s*:=\s*2/);
  assert.match(ahk, /MonitorServerHealth\(\)/);
  assert.match(ahk, /SetTimer\(MonitorServerHealth,\s*HEALTH_CHECK_INTERVAL_MS\)/);
  assert.match(ahk, /consecutiveHealthFailures\s*>=\s*HEALTH_FAILURE_THRESHOLD/);
  assert.match(ahk, /lastServerStartTick/);
  assert.match(ahk, /if\s*\(ownedServerPid\)\s*\{\s*StopOwnedServer\(\)/);
});

test('AHK stops only a verified server process it owns', () => {
  assert.match(ahk, /global\s+ownedServerPid\s*:=\s*0/);
  assert.match(ahk, /IsOwnedServerProcess\(pid\)/);
  const stopFunction = ahk.match(/StopOwnedServer\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(stopFunction, 'StopOwnedServer function must exist');
  assert.match(stopFunction[1], /IsOwnedServerProcess\(ownedServerPid\)/);
  assert.match(stopFunction[1], /ProcessClose\(ownedServerPid\)/);
});

test('AHK exit cleanup removes its PID and stops only its owned bridge', () => {
  assert.match(ahk, /HandleAppExit\(exitReason,\s*exitCode\)/);
  assert.match(ahk, /OnExit\(HandleAppExit\)/);
  const exitFunction = ahk.match(/HandleAppExit\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(exitFunction, 'HandleAppExit function must exist');
  assert.match(exitFunction[1], /DeletePidFile/);
  assert.match(exitFunction[1], /StopOwnedServer/);
});

test('AHK startup shortcut targets the compiled executable', () => {
  assert.match(ahk, /GetStartupShortcutPath\(\)/);
  assert.match(ahk, /ToggleStartupRegistration\(/);
  assert.match(ahk, /A_IsCompiled/);
  assert.match(ahk, /CreateShortcut/);
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

test('process cleanup finds orphaned source and compiled controller instances', () => {
  assert.match(stopScript, /Get-CimInstance\s+Win32_Process/i);
  assert.match(stopScript, /youtube-dictation-control\.ahk/i);
  assert.match(stopScript, /YouTubeDictationControl\.exe/i);
  assert.match(stopScript, /\$controllerScriptPath/);
  assert.match(stopScript, /ExpectedCommandLineFragments\s+@\(\$controllerScriptPath\)/);
  assert.match(stopScript, /ExpectedExecutablePaths\s+@\(\$controllerExePath\)/);
  assert.match(stopScript, /function\s+Stop-VerifiedProcess/i);
  assert.match(stopScript, /Get-Process\s+-Id\s+\$ProcessId/i);
  assert.match(stopScript, /Stop-VerifiedProcess\s+-ProcessId\s+\$process\.ProcessId/i);
});

test('manual startup prefers the compiled controller and keeps source fallback', () => {
  assert.match(startScript, /YouTubeDictationControl\.exe/i);
  assert.match(startScript, /youtube-dictation-control\.ahk/i);
});

test('background startup prefers the compiled controller and keeps source fallback', () => {
  assert.match(backgroundStartScript, /YouTubeDictationControl\.exe/i);
  assert.match(backgroundStartScript, /youtube-dictation-control\.ahk/i);
});

console.log(`AHK contract tests passed: ${caseCount} cases`);
