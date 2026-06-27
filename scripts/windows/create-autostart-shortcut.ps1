$ErrorActionPreference = 'Stop'

$shortcutPath = $env:YDP_SHORTCUT_PATH
$targetPath = $env:YDP_TARGET_PATH
$workingDirectory = $env:YDP_WORKING_DIR

if ([string]::IsNullOrWhiteSpace($shortcutPath)) {
    throw 'YDP_SHORTCUT_PATH is not set.'
}
if ([string]::IsNullOrWhiteSpace($targetPath)) {
    throw 'YDP_TARGET_PATH is not set.'
}
if ([string]::IsNullOrWhiteSpace($workingDirectory)) {
    throw 'YDP_WORKING_DIR is not set.'
}

$shortcutDir = Split-Path -Parent $shortcutPath
if (-not (Test-Path -LiteralPath $shortcutDir)) {
    New-Item -ItemType Directory -Path $shortcutDir -Force | Out-Null
}

$wshShell = New-Object -ComObject WScript.Shell
$shortcut = $wshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $workingDirectory
$shortcut.Save()
