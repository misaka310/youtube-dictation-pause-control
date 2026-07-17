[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$PackageDirectory,
    [int]$Port = 17654
)

$ErrorActionPreference = 'Stop'
$packageRoot = (Resolve-Path -LiteralPath $PackageDirectory).Path
$controllerPath = Join-Path $packageRoot 'YouTubeDictationControl.exe'
$serverPath = Join-Path $packageRoot 'server\server.js'
$healthUrl = "http://127.0.0.1:$Port/health"

if (-not (Test-Path -LiteralPath $controllerPath)) {
    throw "Controller executable not found: $controllerPath"
}
if (-not (Test-Path -LiteralPath $serverPath)) {
    throw "Server script not found: $serverPath"
}

Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class WindowCloser {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);
    public static int CloseAll(uint wantedProcessId) {
        var count = 0;
        EnumWindows((hWnd, lParam) => {
            uint processId;
            GetWindowThreadProcessId(hWnd, out processId);
            if (processId == wantedProcessId) {
                PostMessage(hWnd, 0x0010, IntPtr.Zero, IntPtr.Zero);
                count++;
            }
            return true;
        }, IntPtr.Zero);
        return count;
    }
}
'@

function Get-CompatibleHealth {
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2 -ErrorAction Stop
        if ($health.ok -eq $true -and $health.service -eq 'youtube-dictation-pause') {
            return $health
        }
    } catch {
        return $null
    }
    return $null
}

function Wait-CompatibleHealth {
    param(
        [int]$TimeoutSeconds = 20
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $health = Get-CompatibleHealth
        if ($null -ne $health) {
            return $health
        }
        Start-Sleep -Milliseconds 500
    }
    throw "Compatible bridge did not become healthy within $TimeoutSeconds seconds."
}

function Get-ListenerProcessId {
    $connection = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($null -eq $connection) {
        return 0
    }
    return [int]$connection.OwningProcess
}

function Wait-NewListenerProcessId {
    param(
        [int]$PreviousProcessId,
        [int]$TimeoutSeconds = 25
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $candidate = Get-ListenerProcessId
        if ($candidate -gt 0 -and $candidate -ne $PreviousProcessId -and $null -ne (Get-CompatibleHealth)) {
            return $candidate
        }
        Start-Sleep -Milliseconds 500
    }
    throw "Bridge did not recover with a new PID within $TimeoutSeconds seconds."
}

function Wait-ProcessExit {
    param(
        [int]$ProcessId,
        [int]$TimeoutSeconds = 10
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($null -eq (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
            return
        }
        Start-Sleep -Milliseconds 250
    }
    throw "Process $ProcessId did not exit within $TimeoutSeconds seconds."
}

$controller = $null
$initialServerPid = 0
$recoveredServerPid = 0
try {
    if ($null -ne (Get-CompatibleHealth)) {
        throw "Port $Port is already occupied by a compatible bridge. Stop it before runtime verification."
    }

    $controller = Start-Process -FilePath $controllerPath -WorkingDirectory $packageRoot -PassThru
    $health = Wait-CompatibleHealth
    $controller.Refresh()
    if ($controller.HasExited) {
        throw 'Controller exited during startup.'
    }

    $controllerMetadata = Get-CimInstance Win32_Process -Filter "ProcessId = $($controller.Id)"
    if ($null -eq $controllerMetadata -or $controllerMetadata.ExecutablePath -ine $controllerPath) {
        throw 'Running controller path does not match the packaged executable.'
    }

    $initialServerPid = Get-ListenerProcessId
    if ($initialServerPid -le 0) {
        throw 'Healthy bridge has no listener PID.'
    }
    $initialServer = Get-CimInstance Win32_Process -Filter "ProcessId = $initialServerPid"
    if ($null -eq $initialServer) {
        throw 'Could not inspect the initial Node bridge process.'
    }
    if ($initialServer.Name -ine 'node.exe') {
        throw "Bridge listener is not node.exe: $($initialServer.Name)"
    }
    if ([string]$initialServer.CommandLine -notlike "*$serverPath*") {
        throw 'Node bridge command line does not contain the packaged server path.'
    }
    if ([int]$initialServer.ParentProcessId -ne [int]$controller.Id) {
        throw 'Node bridge is not a direct child of the tray controller.'
    }

    Stop-Process -Id $initialServerPid -Force
    Wait-ProcessExit -ProcessId $initialServerPid
    $recoveredServerPid = Wait-NewListenerProcessId -PreviousProcessId $initialServerPid
    if ($recoveredServerPid -eq $initialServerPid) {
        throw 'Bridge recovery reused the terminated PID unexpectedly.'
    }

    $recoveredServer = Get-CimInstance Win32_Process -Filter "ProcessId = $recoveredServerPid"
    if ($null -eq $recoveredServer -or [int]$recoveredServer.ParentProcessId -ne [int]$controller.Id) {
        throw 'Recovered Node bridge is not owned by the tray controller.'
    }

    $closedWindows = [WindowCloser]::CloseAll([uint32]$controller.Id)
    if ($closedWindows -le 0) {
        throw 'No controller window was found for a normal WM_CLOSE shutdown.'
    }
    Wait-ProcessExit -ProcessId $controller.Id
    Wait-ProcessExit -ProcessId $recoveredServerPid

    if ($null -ne (Get-CompatibleHealth)) {
        throw 'Bridge remained healthy after normal controller exit.'
    }

    [pscustomobject]@{
        ok = $true
        service = $health.service
        version = $health.version
        controllerPid = $controller.Id
        initialServerPid = $initialServerPid
        recoveredServerPid = $recoveredServerPid
        recoveryVerified = $true
        ownedShutdownVerified = $true
    } | ConvertTo-Json -Compress
} finally {
    if ($null -ne $controller -and $null -ne (Get-Process -Id $controller.Id -ErrorAction SilentlyContinue)) {
        Stop-Process -Id $controller.Id -Force -ErrorAction SilentlyContinue
    }
    foreach ($pidToStop in @($initialServerPid, $recoveredServerPid)) {
        if ($pidToStop -gt 0 -and $null -ne (Get-Process -Id $pidToStop -ErrorAction SilentlyContinue)) {
            Stop-Process -Id $pidToStop -Force -ErrorAction SilentlyContinue
        }
    }
}
