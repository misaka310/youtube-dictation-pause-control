param(
    [switch]$AhkOnly
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Resolve-Path -LiteralPath (Join-Path $scriptDir '..\..')).Path
$runtimeDir = Join-Path $rootDir 'runtime'

function Stop-VerifiedProcess {
    param(
        [Parameter(Mandatory = $true)]
        [int]$ProcessId,
        [Parameter(Mandatory = $true)]
        [string]$DisplayName
    )

    if ($null -eq (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
        return $true
    }

    try {
        Stop-Process -Id $ProcessId -Force -ErrorAction Stop
        Wait-Process -Id $ProcessId -Timeout 3 -ErrorAction SilentlyContinue
    } catch {
        Write-Host "[WARN] Failed to stop ${DisplayName} PID ${ProcessId}: $($_.Exception.Message)"
        return $false
    }

    if ($null -ne (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
        Write-Host "[WARN] ${DisplayName} PID ${ProcessId} is still running after stop request."
        return $false
    }

    Write-Host "[OK] Stopped ${DisplayName} PID ${ProcessId}."
    return $true
}

function Stop-ProcessFromPidFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$PidFile,
        [Parameter(Mandatory = $true)]
        [string[]]$ExpectedNames
    )

    if (-not (Test-Path -LiteralPath $PidFile)) {
        Write-Host "[SKIP] ${Name}: PID file not found."
        return $false
    }

    $rawPid = (Get-Content -LiteralPath $PidFile -ErrorAction Stop | Select-Object -First 1).Trim()
    $processId = 0
    if (-not [int]::TryParse($rawPid, [ref]$processId)) {
        Write-Host "[WARN] ${Name}: invalid PID file content: $rawPid"
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
        return $false
    }

    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        Write-Host "[WARN] ${Name}: stale PID file; checking fallback targets."
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
        return $false
    }

    if ($ExpectedNames -notcontains $process.ProcessName -and $ExpectedNames -notcontains ($process.ProcessName + '.exe')) {
        Write-Host "[WARN] ${Name}: PID $processId belongs to $($process.ProcessName), so it was not stopped."
        return $false
    }

    if (-not (Stop-VerifiedProcess -ProcessId $processId -DisplayName $Name)) {
        return $false
    }

    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    return $true
}

function Stop-ServerByVerifiedPort {
    $port = 17654

    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$port/health" -TimeoutSec 2 -ErrorAction Stop
        if ($null -eq $health -or $health.service -ne 'youtube-dictation-pause') {
            Write-Host "[SKIP] Node server fallback: port $port did not identify as this service."
            return
        }
    } catch {
        Write-Host "[SKIP] Node server fallback: health check failed."
        return
    }

    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($null -eq $connections) {
        Write-Host "[SKIP] Node server fallback: no listener on port $port."
        return
    }

    $ownerIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    $failedCount = 0
    foreach ($ownerId in $ownerIds) {
        $process = Get-Process -Id $ownerId -ErrorAction SilentlyContinue
        if ($null -eq $process) {
            continue
        }
        if ($process.ProcessName -ne 'node' -and $process.ProcessName -ne 'node.exe') {
            Write-Host "[WARN] Node server fallback: PID $ownerId belongs to $($process.ProcessName), so it was not stopped."
            $failedCount += 1
            continue
        }
        if (-not (Stop-VerifiedProcess -ProcessId $ownerId -DisplayName "verified Node server from port $port")) {
            $failedCount += 1
        }
    }

    if ($failedCount -gt 0) {
        throw "Failed to stop $failedCount verified Node server process(es)."
    }
}

function Stop-AhkByCommandLine {
    $scriptName = 'youtube-dictation-control.ahk'
    $expectedNames = @('AutoHotkey64.exe', 'AutoHotkey32.exe', 'AutoHotkey.exe')

    try {
        $processes = Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
            $expectedNames -contains $_.Name -and
            -not [string]::IsNullOrWhiteSpace($_.CommandLine) -and
            $_.CommandLine.IndexOf($scriptName, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
        }
    } catch {
        throw "AutoHotkey fallback scan failed: $($_.Exception.Message)"
    }

    $stoppedCount = 0
    $failedCount = 0
    foreach ($process in $processes) {
        if (Stop-VerifiedProcess -ProcessId $process.ProcessId -DisplayName 'matching AutoHotkey script') {
            $stoppedCount += 1
        } else {
            $failedCount += 1
        }
    }

    if ($failedCount -gt 0) {
        throw "Failed to stop $failedCount matching AutoHotkey process(es)."
    }

    return $stoppedCount
}

if (-not $AhkOnly) {
    $serverStopped = Stop-ProcessFromPidFile `
        -Name 'Node server' `
        -PidFile (Join-Path $runtimeDir 'youtube-dictation-server.pid') `
        -ExpectedNames @('node', 'node.exe')

    if (-not $serverStopped) {
        Stop-ServerByVerifiedPort
    }
}

Stop-ProcessFromPidFile `
    -Name 'AutoHotkey script' `
    -PidFile (Join-Path $runtimeDir 'youtube-dictation-ahk.pid') `
    -ExpectedNames @('AutoHotkey64', 'AutoHotkey64.exe', 'AutoHotkey32', 'AutoHotkey32.exe', 'AutoHotkey', 'AutoHotkey.exe') | Out-Null

Stop-AhkByCommandLine | Out-Null
Remove-Item -LiteralPath (Join-Path $runtimeDir 'youtube-dictation-ahk.pid') -Force -ErrorAction SilentlyContinue
