param([switch]$SkipDependencyInstall)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$package = Get-Content -Raw -LiteralPath (Join-Path $root 'package.json') | ConvertFrom-Json
$stage = Join-Path $root ("dist\YouTubeDictationPauseControl-{0}" -f $package.version)
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
        & $py.Source -3 -m venv $venv
    } else {
        $systemPython = Get-Command python.exe -ErrorAction Stop
        & $systemPython.Source -m venv $venv
    }
    if ($LASTEXITCODE -ne 0) { throw 'Failed to create the GUI smoke virtual environment.' }
}

if (-not $SkipDependencyInstall) {
    & $python -m pip install --disable-pip-version-check --upgrade pip
    if ($LASTEXITCODE -ne 0) { throw 'Failed to update pip.' }
    & $python -m pip install --disable-pip-version-check -r $requirements
    if ($LASTEXITCODE -ne 0) { throw 'Failed to install GUI smoke dependencies.' }
}

& (Join-Path $root 'scripts\windows\build-release.ps1') -KeepStaging
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $exe)) {
    throw 'The packaged YouTubeDictationControl.exe was not built.'
}

$env:GUI_SMOKE_EXE = $exe
& $python $test
exit $LASTEXITCODE
