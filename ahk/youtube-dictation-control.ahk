#Requires AutoHotkey v2.0
#SingleInstance Force
SendMode("Input")
SetWorkingDir(A_ScriptDir)

; ==============================================================================
; YouTube Dictation Pause Control - Main Keyboard Monitoring Script (HTTP Bridge)
; ==============================================================================

; --- 設定のグローバル変数 ---
global PORT := 17654
global TYPELESS_HOTKEY_RAW := "Ctrl+Shift"
global WISPR_FLOW_HOTKEY_RAW := "Ctrl+]"
global AUTO_START_SERVER := true
global POLLING_INTERVAL_MS := 500

global RUNTIME_DIR := A_ScriptDir . "\..\runtime"
global AHK_PID_FILE := RUNTIME_DIR . "\youtube-dictation-ahk.pid"

; デバッグモード (true の場合、状態変更時に画面上にポップアップ通知（ToolTip）を表示します)
global DEBUG_MODE := false

; --- 内部状態管理変数 ---
global isTypelessActive := false
global isWisprFlowActive := false
global anyDictationActive := false
global lastTypelessTick := 0
global lastWisprFlowTick := 0
global DEBOUNCE_MS := 400

; --- PID管理 ---
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
    } catch {
        ; PID書き込みエラー時は無視
    }
}

DeletePidFile(exitReason, exitCode) {
    global AHK_PID_FILE
    try {
        if (FileExist(AHK_PID_FILE)) {
            pid := Trim(FileRead(AHK_PID_FILE, "UTF-8"))
            if (pid = GetCurrentProcessId()) {
                FileDelete(AHK_PID_FILE)
            }
        }
    } catch {
        ; PID削除エラー時は無視
    }
}

; --- ログ出力用関数 ---
LogMessage(message) {
    try {
        logDir := A_ScriptDir . "\..\logs"
        if (!DirExist(logDir)) {
            DirCreate(logDir)
        }
        logFile := logDir . "\control.log"
        timestamp := FormatTime(, "yyyy-MM-dd HH:mm:ss")
        FileAppend(timestamp . " [AHK] " . message . "`n", logFile, "UTF-8")
    } catch {
        ; ログ書き込みエラー時は無視
    }
}

; --- グローバル例外ハンドラ ---
OnError(ErrorHandler)
ErrorHandler(err, mode) {
    LogMessage("FATAL ERROR: " . err.Message . " (Line: " . err.Line . ", File: " . err.File . ")")
    return 1 ; エラーダイアログのポップアップを抑制してハングを防止
}

; --- 設定読み込み ---
ReadSettings() {
    global PORT, TYPELESS_HOTKEY_RAW, WISPR_FLOW_HOTKEY_RAW, AUTO_START_SERVER, POLLING_INTERVAL_MS, DEBUG_MODE
    settingsPath := A_ScriptDir . "\..\config\settings.json"
    if (FileExist(settingsPath)) {
        try {
            content := FileRead(settingsPath, "UTF-8")
            if (RegExMatch(content, '"port"\s*:\s*(\d+)', &match)) {
                PORT := Integer(match[1])
            }
            if (RegExMatch(content, '"typelessHotkey"\s*:\s*"([^"]+)"', &match)) {
                TYPELESS_HOTKEY_RAW := match[1]
            }
            if (RegExMatch(content, '"wisprFlowHotkey"\s*:\s*"([^"]+)"', &match)) {
                WISPR_FLOW_HOTKEY_RAW := match[1]
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
            LogMessage("Loaded settings successfully from settings.json. Port: " . PORT . " DebugMode: " . (DEBUG_MODE ? "true" : "false"))
        } catch as err {
            LogMessage("WARNING: Failed to parse settings.json (" . err.Message . "). Using defaults.")
        }
    } else {
        LogMessage("settings.json not found. Using defaults.")
    }
}

; --- ホットキー変換関数 ---
ParseHotkey(keyStr) {
    if (keyStr = "Ctrl+Shift") {
        return "Ctrl+Shift"
    }
    
    res := keyStr
    res := StrReplace(res, "Ctrl+", "^")
    res := StrReplace(res, "Shift+", "+")
    res := StrReplace(res, "Alt+", "!")
    res := StrReplace(res, "Win+", "#")
    return res
}

; --- サーバーヘルスチェック＆自動起動 ---
CheckAndStartServer() {
    global PORT, AUTO_START_SERVER
    url := "http://127.0.0.1:" . PORT . "/health"
    
    isServerOk := false
    try {
        whr := ComObject("WinHttp.WinHttpRequest.5.1")
        whr.Open("GET", url, false)
        whr.Send()
        whr.WaitForResponse(1)
        if (whr.Status = 200 && InStr(whr.ResponseText, '"ok":true')) {
            isServerOk := true
            LogMessage("server health ok")
        }
    } catch {
        isServerOk := false
    }
    
    if (!isServerOk) {
        LogMessage("server health failed")
        if (AUTO_START_SERVER) {
            LogMessage("server auto-start attempted")
            batPath := A_ScriptDir . "\..\server\start-server.bat"
            if (FileExist(batPath)) {
                ; 最小化したコマンドウィンドウとしてバッチを実行
                Run('cmd.exe /c start "YouTube Dictation Server" /min "' . batPath . '"',, "Hide")
                ; サーバーの起動待ち
                Sleep(2000)
                
                ; 起動後の再確認
                try {
                    whr2 := ComObject("WinHttp.WinHttpRequest.5.1")
                    whr2.Open("GET", url, false)
                    whr2.Send()
                    whr2.WaitForResponse(1)
                    if (whr2.Status = 200 && InStr(whr2.ResponseText, '"ok":true')) {
                        LogMessage("server health ok after auto-start")
                        return
                    }
                } catch {
                    ; ignore
                }
                LogMessage("WARNING: Server auto-start triggered but health check still failed.")
            } else {
                LogMessage("ERROR: start-server.bat not found at " . batPath)
            }
        } else {
            LogMessage("WARNING: Server is not running and autoStartServer is false.")
        }
    }
}

; --- HTTP送信関数 ---
SendStateToServer(activeVal) {
    global PORT
    url := "http://127.0.0.1:" . PORT . "/state"
    body := '{"active": ' . (activeVal ? "true" : "false") . ', "source": "ahk"}'
    
    LogMessage("POST /state sending: " . (activeVal ? "active=true" : "active=false"))
    
    try {
        whr := ComObject("WinHttp.WinHttpRequest.5.1")
        whr.Open("POST", url, false)
        whr.SetRequestHeader("Content-Type", "application/json")
        whr.Send(body)
        whr.WaitForResponse(2)
        
        status := whr.Status
        responseText := whr.ResponseText
        
        if (status = 200) {
            LogMessage("POST /state succeeded")
            return true
        } else {
            LogMessage("POST /state failed. HTTP Status: " . status)
            return false
        }
    } catch as err {
        LogMessage("POST /state failed. Error: " . err.Message)
        return false
    }
}

; --- 状態更新と送信判定 ---
UpdateDictationStatus() {
    global isTypelessActive, isWisprFlowActive, anyDictationActive
    
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

; ==============================================================================
; ホットキーイベントハンドラ
; ==============================================================================

; --- Typeless の処理 ---
TriggerTypeless() {
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

; --- Wispr Flow の処理 ---
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

; --- スクリプト初期設定・開始 ---
WritePidFile()
OnExit(DeletePidFile)
LogMessage("AHK script started.")

; 1. 設定読み込み
ReadSettings()

; 2. サーバー生存確認と自動起動
CheckAndStartServer()

; 3. Wispr Flow ホットキーの登録
parsedWisprKey := ParseHotkey(WISPR_FLOW_HOTKEY_RAW)
; 音声入力アプリにキーを通すため pass-through プレフィックス "~" を付与します
passThroughWisprKey := "~" . parsedWisprKey
try {
    Hotkey(passThroughWisprKey, HandleWisprFlowKey)
    LogMessage("Registered Wispr Flow hotkey: " . passThroughWisprKey)
} catch as err {
    LogMessage("ERROR: Failed to register Wispr Flow hotkey " . passThroughWisprKey . ": " . err.Message)
}

; 4. Typeless ホットキーの登録
if (TYPELESS_HOTKEY_RAW = "Ctrl+Shift") {
    ; デフォルトの Ctrl+Shift は修飾キー単体のため、LControl/LShiftのリリースフックを使用します。
    ; ~ (pass-through) が付いているため、元のOSやTypelessの挙動を全く阻害しません。
    ~LControl Up:: {
        if (TYPELESS_HOTKEY_RAW = "Ctrl+Shift") {
            if (A_PriorKey = "LShift" || A_PriorKey = "RShift") {
                TriggerTypeless()
            }
        }
    }

    ~LShift Up:: {
        if (TYPELESS_HOTKEY_RAW = "Ctrl+Shift") {
            if (A_PriorKey = "LControl" || A_PriorKey = "RControl") {
                TriggerTypeless()
            }
        }
    }
    LogMessage("Registered Typeless modifier hook: Ctrl+Shift")
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
    ToolTip("YouTube Dictation Control Started`nDebug Mode: ON`n(HTTP Bridge Mode)")
    SetTimer(() => ToolTip(), -3000)
}
