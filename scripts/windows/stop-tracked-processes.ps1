$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Resolve-Path -LiteralPath (Join-Path $scriptDir '..\..')).Path
$runtimeDir = Join-Path $rootDir 'runtime'

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
        Write-Host "[OK] ${Name}: process already stopped."
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
        return $true
    }

    if ($ExpectedNames -notcontains $process.ProcessName -and $ExpectedNames -notcontains ($process.ProcessName + '.exe')) {
        Write-Host "[WARN] ${Name}: PID $processId belongs to $($process.ProcessName), so it was not stopped."
        return $false
    }

    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    Write-Host "[OK] Stopped ${Name} PID $processId."
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
    foreach ($ownerId in $ownerIds) {
        $process = Get-Process -Id $ownerId -ErrorAction SilentlyContinue
        if ($null -eq $process) {
            continue
        }
        if ($process.ProcessName -ne 'node' -and $process.ProcessName -ne 'node.exe') {
            Write-Host "[WARN] Node server fallback: PID $ownerId belongs to $($process.ProcessName), so it was not stopped."
            continue
        }
        Stop-Process -Id $ownerId -Force -ErrorAction SilentlyContinue
        Write-Host "[OK] Stopped verified Node server PID $ownerId from port $port."
    }
}

$serverStopped = Stop-ProcessFromPidFile `
    -Name 'Node server' `
    -PidFile (Join-Path $runtimeDir 'youtube-dictation-server.pid') `
    -ExpectedNames @('node', 'node.exe')

if (-not $serverStopped) {
    Stop-ServerByVerifiedPort
}

Stop-ProcessFromPidFile `
    -Name 'AutoHotkey script' `
    -PidFile (Join-Path $runtimeDir 'youtube-dictation-ahk.pid') `
    -ExpectedNames @('AutoHotkey64', 'AutoHotkey64.exe', 'AutoHotkey32', 'AutoHotkey32.exe', 'AutoHotkey', 'AutoHotkey.exe') | Out-Null
