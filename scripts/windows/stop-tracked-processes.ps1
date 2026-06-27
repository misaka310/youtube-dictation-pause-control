param(
    [Parameter(Mandatory = $true)]
    [string]$RootDir
)

$ErrorActionPreference = 'Stop'

$runtimeDir = Join-Path $RootDir 'runtime'
$pidFiles = @(
    @{ Name = 'Node server'; Path = Join-Path $runtimeDir 'youtube-dictation-server.pid'; ExpectedNames = @('node', 'node.exe') },
    @{ Name = 'AutoHotkey script'; Path = Join-Path $runtimeDir 'youtube-dictation-ahk.pid'; ExpectedNames = @('AutoHotkey64', 'AutoHotkey64.exe', 'AutoHotkey32', 'AutoHotkey32.exe', 'AutoHotkey', 'AutoHotkey.exe') }
)

foreach ($entry in $pidFiles) {
    $pidFile = $entry.Path
    if (-not (Test-Path -LiteralPath $pidFile)) {
        Write-Host "[SKIP] $($entry.Name): PID file not found."
        continue
    }

    $rawPid = (Get-Content -LiteralPath $pidFile -ErrorAction Stop | Select-Object -First 1).Trim()
    $processId = 0
    if (-not [int]::TryParse($rawPid, [ref]$processId)) {
        Write-Host "[WARN] $($entry.Name): invalid PID file content: $rawPid"
        Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
        continue
    }

    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        Write-Host "[OK] $($entry.Name): process already stopped."
        Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
        continue
    }

    if ($entry.ExpectedNames -notcontains $process.ProcessName -and $entry.ExpectedNames -notcontains ($process.ProcessName + '.exe')) {
        Write-Host "[WARN] $($entry.Name): PID $processId belongs to $($process.ProcessName), so it was not stopped."
        continue
    }

    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    Write-Host "[OK] Stopped $($entry.Name) PID $processId."
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}
