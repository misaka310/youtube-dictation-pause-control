#Requires AutoHotkey v2.0
#SingleInstance Force
SendMode("Input")

GetParentDirectory(path) {
    SplitPath(path, &leafName, &parentDirectory)
    return parentDirectory
}

; Source mode runs from ahk/. The compiled release executable runs from the package root.
global APP_ROOT := A_IsCompiled ? A_ScriptDir : GetParentDirectory(A_ScriptDir)
global SETTINGS_FILE := APP_ROOT . "\config\settings.json"
global SERVER_SCRIPT := APP_ROOT . "\server\server.js"
global LOG_FILE := APP_ROOT . "\logs\control.log"
global RUNTIME_DIR := APP_ROOT . "\runtime"
global AHK_PID_FILE := RUNTIME_DIR . "\youtube-dictation-ahk.pid"
global STARTUP_SHORTCUT_NAME := "YouTube Dictation Pause Control.lnk"
global APP_ICON := APP_ROOT . "\assets\youtube-dictation.ico"

SetWorkingDir(APP_ROOT)

global PORT := 17654
global TYPELESS_HOTKEY_RAW := "RightCtrl+RightShift"
global WISPR_FLOW_HOTKEY_RAW := "Ctrl+]"
global RESET_HOTKEY_RAW := "Ctrl+Alt+R"
global AUTO_START_SERVER := true
global POLLING_INTERVAL_MS := 500
global DEBUG_MODE := false

global isTypelessActive := false
global isWisprFlowActive := false
global anyDictationActive := false
global lastTypelessTick := 0
global lastWisprFlowTick := 0
global DEBOUNCE_MS := 400

global HEALTH_CHECK_INTERVAL_MS := 5000
global HEALTH_FAILURE_THRESHOLD := 2
global SERVER_RESTART_MIN_INTERVAL_MS := 10000
global ownedServerPid := 0
global consecutiveHealthFailures := 0
global lastServerStartTick := 0
global bridgeStatus := "starting"
global trayStatusLabel := "Status: starting"

GetCurrentProcessId() {
    return DllCall("GetCurrentProcessId", "UInt")
}

WritePidFile() {
    global RUNTIME_DIR, AHK_PID_FILE
    try {
        if (!DirExist(RUNTIME_DIR)) {
            DirCreate(RUNTIME_DIR)
        }
        if (FileExist(AHK_PID_FILE)) {
            FileDelete(AHK_PID_FILE)
        }
        FileAppend(GetCurrentProcessId() . "`n", AHK_PID_FILE, "UTF-8")
    } catch as err {
        LogMessage("WARNING: Failed to write controller PID file: " . err.Message)
    }
}

DeletePidFile(exitReason := "", exitCode := 0) {
    global AHK_PID_FILE
    try {
        if (FileExist(AHK_PID_FILE)) {
            pid := Trim(FileRead(AHK_PID_FILE, "UTF-8"))
            if (pid = GetCurrentProcessId()) {
                FileDelete(AHK_PID_FILE)
            }
        }
    } catch {
        ; Cleanup errors must not block application exit.
    }
}

AppendLogWithRetry(logFile, logLine) {
    Loop 5 {
        try {
            FileAppend(logLine, logFile, "UTF-8")
            return true
        } catch {
            if (A_Index < 5) {
                Sleep(25 * A_Index)
            }
        }
    }
    return false
}

LogMessage(message) {
    global LOG_FILE, APP_ROOT
    try {
        logDir := APP_ROOT . "\logs"
        if (!DirExist(logDir)) {
            DirCreate(logDir)
        }
        timestamp := FormatTime(, "yyyy-MM-dd HH:mm:ss")
        logLine := timestamp . " [AHK] " . message . "`n"
        AppendLogWithRetry(LOG_FILE, logLine)
    } catch {
        ; Logging must never terminate the controller.
    }
}

OnError(ErrorHandler)
ErrorHandler(err, mode) {
    LogMessage("FATAL ERROR: " . err.Message . " (Line: " . err.Line . ", File: " . err.File . ")")
    return 1
}

ReadSettings() {
    global SETTINGS_FILE, PORT, TYPELESS_HOTKEY_RAW, WISPR_FLOW_HOTKEY_RAW
    global RESET_HOTKEY_RAW, AUTO_START_SERVER, POLLING_INTERVAL_MS, DEBUG_MODE

    if (FileExist(SETTINGS_FILE)) {
        try {
            content := FileRead(SETTINGS_FILE, "UTF-8")
            if (RegExMatch(content, '"port"\s*:\s*(\d+)', &match)) {
                PORT := Integer(match[1])
            }
            if (RegExMatch(content, '"typelessHotkey"\s*:\s*"([^"]+)"', &match)) {
                TYPELESS_HOTKEY_RAW := (match[1] = "Ctrl+Shift") ? "RightCtrl+RightShift" : match[1]
            }
            if (RegExMatch(content, '"wisprFlowHotkey"\s*:\s*"([^"]+)"', &match)) {
                WISPR_FLOW_HOTKEY_RAW := match[1]
            }
            if (RegExMatch(content, '"resetHotkey"\s*:\s*"([^"]+)"', &match)) {
                RESET_HOTKEY_RAW := match[1]
            }
            if (RegExMatch(content, '"autoStartServer"\s*:\s*(true|false)', &match)) {
                AUTO_START_SERVER := (match[1] = "true")
            }
            if (RegExMatch(content, '"pollingIntervalMs"\s*:\s*(\d+)', &match)) {
                POLLING_INTERVAL_MS := Integer(match[1])
            }
            if (RegExMatch(content, '"debugMode"\s*:\s*(true|false)', &match)) {
                DEBUG_MODE := (match[1] = "true")
            }
            LogMessage("Loaded settings successfully. Port: " . PORT . " DebugMode: " . (DEBUG_MODE ? "true" : "false"))
        } catch as err {
            LogMessage("WARNING: Failed to parse settings.json (" . err.Message . "). Using defaults.")
        }
    } else {
        LogMessage("settings.json not found. Using defaults.")
    }
}

ParseHotkey(keyStr) {
    if (keyStr = "RightCtrl+RightShift") {
        return "RightCtrl+RightShift"
    }

    res := keyStr
    res := StrReplace(res, "Ctrl+", "^")
    res := StrReplace(res, "Shift+", "+")
    res := StrReplace(res, "Alt+", "!")
    res := StrReplace(res, "Win+", "#")
    return res
}

IsSupportedNodeExecutable(nodeExe) {
    try {
        shell := ComObject("WScript.Shell")
        command := '"' . nodeExe . '" --version'
        exec := shell.Exec(command)
        versionText := Trim(exec.StdOut.ReadAll())
        if (!RegExMatch(versionText, "^v(\d+)\.", &match)) {
            return false
        }
        return Integer(match[1]) >= 22
    } catch as err {
        LogMessage("WARNING: Failed to validate Node.js executable " . nodeExe . ": " . err.Message)
        return false
    }
}

ResolveNodeExecutable() {
    global APP_ROOT

    bundledNode := APP_ROOT . "\vendor\node\node.exe"
    if (FileExist(bundledNode)) {
        return bundledNode
    }
    localAppData := EnvGet("LOCALAPPDATA")
    candidates := [
        A_ProgramFiles . "\nodejs\node.exe",
        localAppData . "\Programs\nodejs\node.exe"
    ]

    for candidate in candidates {
        if (FileExist(candidate) && IsSupportedNodeExecutable(candidate)) {
            return candidate
        }
    }

    pathValue := EnvGet("PATH")
    for pathPart in StrSplit(pathValue, ";") {
        cleanPart := StrReplace(Trim(pathPart), '"', "")
        if (cleanPart = "") {
            continue
        }
        candidate := cleanPart . "\node.exe"
        if (FileExist(candidate) && IsSupportedNodeExecutable(candidate)) {
            return candidate
        }
    }

    return ""
}

IsCompatibleBridgeHealthy() {
    global PORT
    url := "http://127.0.0.1:" . PORT . "/health"
    try {
        whr := ComObject("WinHttp.WinHttpRequest.5.1")
        whr.SetTimeouts(500, 500, 1000, 1000)
        whr.Open("GET", url, false)
        whr.Send()
        return whr.Status = 200
            && InStr(whr.ResponseText, '"ok":true')
            && InStr(whr.ResponseText, '"service":"youtube-dictation-pause"')
    } catch {
        return false
    }
}

IsOwnedServerProcess(pid) {
    global SERVER_SCRIPT
    if (!pid || !ProcessExist(pid)) {
        return false
    }

    try {
        query := "Select Name, CommandLine from Win32_Process where ProcessId=" . pid
        for process in ComObjGet("winmgmts:").ExecQuery(query) {
            processName := StrLower(process.Name . "")
            commandLine := StrLower(process.CommandLine . "")
            return processName = "node.exe" && InStr(commandLine, StrLower(SERVER_SCRIPT))
        }
    } catch as err {
        LogMessage("WARNING: Failed to verify owned server PID " . pid . ": " . err.Message)
    }
    return false
}

UpdateTrayStatus(status) {
    global trayStatusLabel, bridgeStatus
    bridgeStatus := status
    newLabel := "Status: " . status

    if (trayStatusLabel != newLabel) {
        try {
            A_TrayMenu.Rename(trayStatusLabel, newLabel)
            trayStatusLabel := newLabel
            A_TrayMenu.Disable(trayStatusLabel)
        } catch {
            ; The menu may not be initialized yet.
        }
    }
    A_IconTip := "YouTube Dictation Control`nBridge: " . status
}

StartOwnedServer() {
    global SERVER_SCRIPT, APP_ROOT, ownedServerPid, lastServerStartTick
    global consecutiveHealthFailures

    if (IsCompatibleBridgeHealthy()) {
        consecutiveHealthFailures := 0
        UpdateTrayStatus(ownedServerPid ? "running" : "running (existing bridge)")
        return true
    }

    if (!FileExist(SERVER_SCRIPT)) {
        LogMessage("ERROR: Node server script not found: " . SERVER_SCRIPT)
        UpdateTrayStatus("server files missing")
        return false
    }

    nodeExe := ResolveNodeExecutable()
    if (nodeExe = "") {
        LogMessage("ERROR: Node.js 22 or later was not found.")
        UpdateTrayStatus("Node.js missing")
        return false
    }

    serverPid := 0
    lastServerStartTick := A_TickCount
    try {
        Run('"' . nodeExe . '" "' . SERVER_SCRIPT . '"', APP_ROOT . "\server", "Hide", &serverPid)
    } catch as err {
        LogMessage("ERROR: Failed to start local bridge: " . err.Message)
        UpdateTrayStatus("start failed")
        return false
    }

    if (!serverPid) {
        LogMessage("ERROR: Node.js started without a trackable PID.")
        UpdateTrayStatus("start failed")
        return false
    }

    ownedServerPid := serverPid
    LogMessage("Started owned Node bridge PID " . ownedServerPid . " with hidden window.")
    UpdateTrayStatus("starting")

    Loop 10 {
        Sleep(250)
        if (IsCompatibleBridgeHealthy()) {
            consecutiveHealthFailures := 0
            UpdateTrayStatus("running")
            return true
        }
        if (!ProcessExist(ownedServerPid)) {
            break
        }
    }

    LogMessage("WARNING: Owned Node bridge did not become healthy after startup.")
    UpdateTrayStatus("unhealthy")
    return false
}

StopOwnedServer() {
    global ownedServerPid
    if (!ownedServerPid) {
        return true
    }

    pidToStop := ownedServerPid
    if (!IsOwnedServerProcess(ownedServerPid)) {
        LogMessage("WARNING: Refused to stop PID " . ownedServerPid . " because ownership verification failed.")
        ownedServerPid := 0
        return false
    }

    try {
        ProcessClose(ownedServerPid)
        try {
            ProcessWaitClose(ownedServerPid, 3)
        } catch {
            ; ProcessClose may complete before ProcessWaitClose starts.
        }
        LogMessage("Stopped owned Node bridge PID " . pidToStop . ".")
        ownedServerPid := 0
        return true
    } catch as err {
        LogMessage("WARNING: Failed to stop owned Node bridge PID " . pidToStop . ": " . err.Message)
        return false
    }
}

RestartOwnedServer(*) {
    global ownedServerPid
    if (!ownedServerPid && IsCompatibleBridgeHealthy()) {
        LogMessage("Restart requested, but the healthy bridge is not owned by this controller.")
        MsgBox("The running local bridge was started by another instance, so it was not stopped.", "YouTube Dictation Control", "Iconi")
        return
    }

    UpdateTrayStatus("restarting")
    StopOwnedServer()
    Sleep(300)
    StartOwnedServer()
}

CheckAndStartServer() {
    global AUTO_START_SERVER
    if (IsCompatibleBridgeHealthy()) {
        LogMessage("Compatible local bridge already running.")
        UpdateTrayStatus("running (existing bridge)")
        return true
    }

    if (!AUTO_START_SERVER) {
        LogMessage("WARNING: Local bridge is stopped and autoStartServer is false.")
        UpdateTrayStatus("stopped")
        return false
    }

    return StartOwnedServer()
}

MonitorServerHealth() {
    global ownedServerPid, consecutiveHealthFailures, HEALTH_FAILURE_THRESHOLD
    global AUTO_START_SERVER, lastServerStartTick, SERVER_RESTART_MIN_INTERVAL_MS

    if (IsCompatibleBridgeHealthy()) {
        consecutiveHealthFailures := 0
        UpdateTrayStatus(ownedServerPid ? "running" : "running (existing bridge)")
        return
    }

    if (ownedServerPid && !ProcessExist(ownedServerPid)) {
        LogMessage("Owned Node bridge PID " . ownedServerPid . " exited.")
        ownedServerPid := 0
    }

    consecutiveHealthFailures += 1
    UpdateTrayStatus("unhealthy")

    if (AUTO_START_SERVER
        && consecutiveHealthFailures >= HEALTH_FAILURE_THRESHOLD
        && A_TickCount - lastServerStartTick >= SERVER_RESTART_MIN_INTERVAL_MS) {
        LogMessage("Health monitor is restarting the local bridge after " . consecutiveHealthFailures . " failures.")
        if (ownedServerPid) {
            StopOwnedServer()
        }
        StartOwnedServer()
    }
}

GetStartupShortcutPath() {
    global STARTUP_SHORTCUT_NAME
    return A_Startup . "\" . STARTUP_SHORTCUT_NAME
}

IsStartupRegistered() {
    return FileExist(GetStartupShortcutPath())
}

UpdateStartupMenuCheck() {
    try {
        if (IsStartupRegistered()) {
            A_TrayMenu.Check("Start with Windows")
        } else {
            A_TrayMenu.Uncheck("Start with Windows")
        }
    }
}

ToggleStartupRegistration(*) {
    global APP_ROOT
    shortcutPath := GetStartupShortcutPath()

    if (!A_IsCompiled) {
        MsgBox("Startup registration from the tray is available in the compiled release. Use scripts\windows\setup-autostart.bat in source mode.", "YouTube Dictation Control", "Iconi")
        return
    }

    try {
        if (FileExist(shortcutPath)) {
            FileDelete(shortcutPath)
            LogMessage("Removed Windows startup shortcut.")
        } else {
            shell := ComObject("WScript.Shell")
            shortcut := shell.CreateShortcut(shortcutPath)
            shortcut.TargetPath := A_ScriptFullPath
            shortcut.WorkingDirectory := APP_ROOT
            shortcut.Description := "Start YouTube Dictation Control in the notification area"
            shortcut.IconLocation := A_ScriptFullPath . ",0"
            shortcut.Save()
            LogMessage("Created Windows startup shortcut.")
        }
        UpdateStartupMenuCheck()
    } catch as err {
        LogMessage("ERROR: Failed to update startup shortcut: " . err.Message)
        MsgBox("Could not update Windows startup registration. See logs\control.log.", "YouTube Dictation Control", "Iconx")
    }
}

OpenLog(*) {
    global LOG_FILE
    try {
        if (!FileExist(LOG_FILE)) {
            LogMessage("Log opened from tray.")
        }
        Run('notepad.exe "' . LOG_FILE . '"')
    } catch as err {
        MsgBox("Could not open the log file: " . err.Message, "YouTube Dictation Control", "Iconx")
    }
}

ExitApplication(*) {
    ExitApp()
}

ApplyAppIcon() {
    global APP_ICON
    A_IconTip := "YouTube Dictation Pause Control"

    try {
        if (A_IsCompiled) {
            TraySetIcon(A_ScriptFullPath, 1, true)
        } else if (FileExist(APP_ICON)) {
            TraySetIcon(APP_ICON, 1, true)
        }
    } catch as err {
        LogMessage("WARNING: Failed to apply application icon: " . err.Message)
    }
}

ConfigureTrayMenu() {
    global trayStatusLabel
    A_TrayMenu.Delete()
    trayStatusLabel := "Status: starting"
    A_TrayMenu.Add(trayStatusLabel, (*) => 0)
    A_TrayMenu.Disable(trayStatusLabel)
    A_TrayMenu.Add()
    A_TrayMenu.Add("Restart local bridge", RestartOwnedServer)
    A_TrayMenu.Add("Reset dictation state", ResetDictationState)
    A_TrayMenu.Add("Open log", OpenLog)
    A_TrayMenu.Add()
    A_TrayMenu.Add("Start with Windows", ToggleStartupRegistration)
    A_TrayMenu.Add()
    A_TrayMenu.Add("Exit", ExitApplication)
    UpdateStartupMenuCheck()
    UpdateTrayStatus("starting")
}

SendStateToServer(activeVal) {
    global PORT
    url := "http://127.0.0.1:" . PORT . "/state"
    body := '{"active": ' . (activeVal ? "true" : "false") . ', "source": "ahk"}'

    LogMessage("POST /state sending: " . (activeVal ? "active=true" : "active=false"))

    try {
        whr := ComObject("WinHttp.WinHttpRequest.5.1")
        whr.SetTimeouts(500, 500, 2000, 2000)
        whr.Open("POST", url, false)
        whr.SetRequestHeader("Content-Type", "application/json")
        whr.Send(body)
        if (whr.Status = 200) {
            LogMessage("POST /state succeeded")
            return true
        }
        LogMessage("POST /state failed. HTTP Status: " . whr.Status)
    } catch as err {
        LogMessage("POST /state failed. Error: " . err.Message)
    }
    return false
}

ResetServerState() {
    global PORT
    url := "http://127.0.0.1:" . PORT . "/state"
    body := '{"active": false, "source": "*"}'

    LogMessage("POST /state source=* active=false sending")

    try {
        whr := ComObject("WinHttp.WinHttpRequest.5.1")
        whr.SetTimeouts(500, 500, 2000, 2000)
        whr.Open("POST", url, false)
        whr.SetRequestHeader("Content-Type", "application/json")
        whr.Send(body)
        if (whr.Status = 200) {
            LogMessage("POST /state source=* active=false succeeded")
            return true
        }
        LogMessage("POST /state source=* active=false failed. HTTP Status: " . whr.Status)
    } catch as err {
        LogMessage("POST /state source=* active=false failed. Error: " . err.Message)
    }
    return false
}

UpdateDictationStatus() {
    global isTypelessActive, isWisprFlowActive, anyDictationActive
    global DEBUG_MODE, TYPELESS_HOTKEY_RAW, WISPR_FLOW_HOTKEY_RAW

    currentActiveState := isTypelessActive || isWisprFlowActive

    if (DEBUG_MODE) {
        statusText := "--- Dictation Status ---`n"
        statusText .= "Typeless (" . TYPELESS_HOTKEY_RAW . "): " . (isTypelessActive ? "ACTIVE" : "inactive") . "`n"
        statusText .= "Wispr Flow (" . WISPR_FLOW_HOTKEY_RAW . "): " . (isWisprFlowActive ? "ACTIVE" : "inactive") . "`n"
        statusText .= "Any Active: " . (currentActiveState ? "YES" : "NO")
        ToolTip(statusText)
        SetTimer(() => ToolTip(), -3000)
    }

    if (currentActiveState && !anyDictationActive) {
        anyDictationActive := true
        LogMessage("state changed: inactive -> active")
        SendStateToServer(true)
    } else if (!currentActiveState && anyDictationActive) {
        anyDictationActive := false
        LogMessage("state changed: active -> inactive")
        SendStateToServer(false)
    }
}

ResetDictationState(*) {
    global isTypelessActive, isWisprFlowActive, anyDictationActive
    global lastTypelessTick, lastWisprFlowTick, DEBUG_MODE

    isTypelessActive := false
    isWisprFlowActive := false
    anyDictationActive := false
    lastTypelessTick := 0
    lastWisprFlowTick := 0

    LogMessage("manual state reset: all dictation states -> inactive")
    ResetServerState()

    if (DEBUG_MODE) {
        ToolTip("Dictation state reset to inactive")
        SetTimer(() => ToolTip(), -2000)
    }
}

TriggerTypeless(*) {
    global isTypelessActive, lastTypelessTick, DEBOUNCE_MS
    currentTick := A_TickCount
    if (currentTick - lastTypelessTick < DEBOUNCE_MS) {
        LogMessage("hotkey triggered (Typeless) - BLOCKED BY DEBOUNCE")
        return
    }
    lastTypelessTick := currentTick

    isTypelessActive := !isTypelessActive
    LogMessage("hotkey triggered (Typeless). State: " . (isTypelessActive ? "ACTIVE" : "inactive"))
    UpdateDictationStatus()
}


HandleTypelessKey(*) {
    global isTypelessActive, lastTypelessTick, DEBOUNCE_MS
    currentTick := A_TickCount
    if (currentTick - lastTypelessTick < DEBOUNCE_MS) {
        LogMessage("hotkey triggered (Typeless custom) - BLOCKED BY DEBOUNCE")
        return
    }
    lastTypelessTick := currentTick

    isTypelessActive := !isTypelessActive
    LogMessage("hotkey triggered (Typeless custom). State: " . (isTypelessActive ? "ACTIVE" : "inactive"))
    UpdateDictationStatus()
}

HandleWisprFlowKey(*) {
    global isWisprFlowActive, lastWisprFlowTick, DEBOUNCE_MS
    currentTick := A_TickCount
    if (currentTick - lastWisprFlowTick < DEBOUNCE_MS) {
        LogMessage("hotkey triggered (Wispr Flow) - BLOCKED BY DEBOUNCE")
        return
    }
    lastWisprFlowTick := currentTick

    isWisprFlowActive := !isWisprFlowActive
    LogMessage("hotkey triggered (Wispr Flow). State: " . (isWisprFlowActive ? "ACTIVE" : "inactive"))
    UpdateDictationStatus()
}

HandleAppExit(exitReason, exitCode) {
    StopOwnedServer()
    DeletePidFile(exitReason, exitCode)
}

WritePidFile()
OnExit(HandleAppExit)
LogMessage("Controller started. Compiled=" . (A_IsCompiled ? "true" : "false"))
ReadSettings()
ApplyAppIcon()
ConfigureTrayMenu()
CheckAndStartServer()
SetTimer(MonitorServerHealth, HEALTH_CHECK_INTERVAL_MS)

parsedResetKey := ParseHotkey(RESET_HOTKEY_RAW)
try {
    Hotkey(parsedResetKey, ResetDictationState)
    LogMessage("Registered reset hotkey: " . parsedResetKey)
} catch as err {
    LogMessage("ERROR: Failed to register reset hotkey " . parsedResetKey . ": " . err.Message)
}

parsedWisprKey := ParseHotkey(WISPR_FLOW_HOTKEY_RAW)
passThroughWisprKey := "~" . parsedWisprKey
try {
    Hotkey(passThroughWisprKey, HandleWisprFlowKey)
    LogMessage("Registered Wispr Flow hotkey: " . passThroughWisprKey)
} catch as err {
    LogMessage("ERROR: Failed to register Wispr Flow hotkey " . passThroughWisprKey . ": " . err.Message)
}

if (TYPELESS_HOTKEY_RAW = "RightCtrl+RightShift") {
    passThroughTypelessKey := "~>^RShift"
    try {
        Hotkey(passThroughTypelessKey, TriggerTypeless)
        LogMessage("Registered Typeless hotkey: RightCtrl+RightShift via " . passThroughTypelessKey)
    } catch as err {
        LogMessage("ERROR: Failed to register Typeless hotkey " . passThroughTypelessKey . ": " . err.Message)
    }
} else {
    parsedTypelessKey := ParseHotkey(TYPELESS_HOTKEY_RAW)
    passThroughTypelessKey := "~" . parsedTypelessKey
    try {
        Hotkey(passThroughTypelessKey, HandleTypelessKey)
        LogMessage("Registered Typeless hotkey: " . passThroughTypelessKey)
    } catch as err {
        LogMessage("ERROR: Failed to register Typeless hotkey " . passThroughTypelessKey . ": " . err.Message)
    }
}

if (DEBUG_MODE) {
    ToolTip("YouTube Dictation Control Started`nDebug Mode: ON")
    SetTimer(() => ToolTip(), -3000)
}
