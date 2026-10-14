param([switch]$SkipDependencyInstall)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-NativeChecked {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [Parameter(Mandatory = $true)]
        [string[]]$ArgumentList,
        [Parameter(Mandatory = $true)]
        [string]$FailureMessage
    )

    $process = Start-Process -FilePath $FilePath `
        -ArgumentList $ArgumentList `
        -NoNewWindow `
        -Wait `
        -PassThru
    if ($process.ExitCode -ne 0) {
        throw "$FailureMessage Exit code: $($process.ExitCode)."
    }
}

function Remove-DirectoryBestEffort {
    param([Parameter(Mandatory = $true)][string]$Path)

    for ($attempt = 1; $attempt -le 5; $attempt++) {
        if (-not (Test-Path -LiteralPath $Path)) {
            return
        }
        try {
            Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
        } catch {
            if ($attempt -lt 5) {
                Start-Sleep -Milliseconds (250 * $attempt)
            }
        }
    }
}

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$package = Get-Content -Raw -LiteralPath (Join-Path $root 'package.json') | ConvertFrom-Json
$packageOutput = Join-Path $root ('.build-cache\gui-smoke-package-{0}' -f $PID)
$stage = Join-Path $packageOutput ("YouTubeDictationPauseControl-{0}" -f $package.version)
$exe = Join-Path $stage 'YouTubeDictationControl.exe'
$venv = Join-Path $root '.build-cache\gui-smoke-venv'
$python = Join-Path $venv 'Scripts\python.exe'
$requirements = Join-Path $root 'tests\windows\requirements-gui-smoke.txt'
$test = Join-Path $root 'tests\windows\tray_uia_smoke.py'

if (-not [Environment]::UserInteractive) {
    throw 'Windows GUI smoke requires a logged-in interactive desktop session.'
}

if (-not (Test-Path $python)) {
    $py = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($null -ne $py) {
        Invoke-NativeChecked `
            -FilePath $py.Source `
            -ArgumentList @('-3', '-m', 'venv', $venv) `
            -FailureMessage 'Failed to create the GUI smoke virtual environment.'
    } else {
        $systemPython = Get-Command python.exe -ErrorAction Stop
        Invoke-NativeChecked `
            -FilePath $systemPython.Source `
            -ArgumentList @('-m', 'venv', $venv) `
            -FailureMessage 'Failed to create the GUI smoke virtual environment.'
    }
}

if (-not $SkipDependencyInstall) {
    Invoke-NativeChecked `
        -FilePath $python `
        -ArgumentList @('-m', 'pip', 'install', '--disable-pip-version-check', '--upgrade', 'pip') `
        -FailureMessage 'Failed to update pip.'
    Invoke-NativeChecked `
        -FilePath $python `
        -ArgumentList @('-m', 'pip', 'install', '--disable-pip-version-check', '-r', $requirements) `
        -FailureMessage 'Failed to install GUI smoke dependencies.'
}

$testExitCode = 1
try {
    & (Join-Path $root 'scripts\windows\build-release.ps1') `
        -OutputDirectory $packageOutput `
        -KeepStaging
    if (-not (Test-Path $exe)) {
        throw 'The packaged YouTubeDictationControl.exe was not built.'
    }

    $env:GUI_SMOKE_EXE = $exe
    $testProcess = Start-Process -FilePath $python `
        -ArgumentList @($test) `
        -NoNewWindow `
        -Wait `
        -PassThru
    $testExitCode = [int]$testProcess.ExitCode
} finally {
    Remove-DirectoryBestEffort -Path $packageOutput
}

exit $testExitCode
