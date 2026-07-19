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

test('default settings use only right-side Typeless modifiers', () => {
  assert.strictEqual(settings.typelessHotkey, 'RightCtrl+RightShift');
  assert.match(ahk, /global\s+TYPELESS_HOTKEY_RAW\s*:=\s*"RightCtrl\+RightShift"/);
  assert.match(ahk, /match\[1\]\s*=\s*"Ctrl\+Shift"[^\n]+"RightCtrl\+RightShift"/);
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
  assert.match(body, /isVoiceBridgeActive\s*:=\s*false/);
  assert.match(body, /anyDictationActive\s*:=\s*false/);
  assert.match(body, /lastTypelessTick\s*:=\s*0/);
  assert.match(body, /lastWisprFlowTick\s*:=\s*0/);
  assert.match(body, /voiceBridgeChordWasDown\s*:=\s*false/);
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

test('Typeless uses one direct Right Ctrl + Right Shift hotkey event', () => {
  assert.match(ahk, /passThroughTypelessKey\s*:=\s*"~>\^RShift"/);
  assert.match(ahk, /Hotkey\(passThroughTypelessKey,\s*TriggerTypeless\)/);
  assert.match(ahk, /TriggerTypeless\(\*\)/);
  assert.doesNotMatch(ahk, /typelessChordArmed/);
  assert.doesNotMatch(ahk, /HandleTypelessModifierDown/);
  assert.doesNotMatch(ahk, /RegisterTypelessModifierHooks/);
});

test('Local Voice Bridge hold chord participates in aggregate dictation state', () => {
  assert.match(ahk, /global\s+PHYSICAL_HOTKEY_POLL_INTERVAL_MS\s*:=\s*20/);
  assert.match(ahk, /global\s+isVoiceBridgeActive\s*:=\s*false/);
  assert.match(ahk, /global\s+voiceBridgeChordWasDown\s*:=\s*false/);
  assert.match(ahk, /currentActiveState\s*:=\s*isTypelessActive\s*\|\|\s*isWisprFlowActive\s*\|\|\s*isVoiceBridgeActive/);
});

test('Local Voice Bridge monitors physical Right Ctrl and VK_OEM_102 while held', () => {
  assert.match(ahk, /PollPhysicalHotkeys\(\)/);
  assert.match(ahk, /GetAsyncKeyState[^\n]+0xA3/);
  assert.match(ahk, /GetAsyncKeyState[^\n]+0xE2/);
  assert.match(ahk, /isVoiceBridgeActive\s*:=\s*voiceBridgeChordDown/);
  assert.match(ahk, /SetTimer\(PollPhysicalHotkeys,\s*PHYSICAL_HOTKEY_POLL_INTERVAL_MS\)/);
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

test('AHK prefers the bundled Node runtime before system installations', () => {
  const resolver = ahk.match(/ResolveNodeExecutable\(\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(resolver, 'ResolveNodeExecutable function must exist');
  const body = resolver[1];
  assert.match(body, /APP_ROOT\s*\.\s*"\\vendor\\node\\node\.exe"/);
  assert.match(body, /FileExist\(bundledNode\)/);
  assert.match(body, /return bundledNode/);
  assert.ok(
    body.indexOf('vendor\\node\\node.exe') < body.indexOf('A_ProgramFiles'),
    'bundled Node must be checked before system installations'
  );
});

test('AHK accepts only Node.js 22 or later for system fallbacks', () => {
  assert.match(ahk, /IsSupportedNodeExecutable\(nodeExe\)/);
  assert.match(ahk, /RegExMatch\(versionText,\s*"\^v\(\\d\+\)\\\."/);
  assert.match(ahk, /Integer\(match\[1\]\)\s*>=\s*22/);
  assert.match(ahk, /FileExist\(candidate\)\s*&&\s*IsSupportedNodeExecutable\(candidate\)/);
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
