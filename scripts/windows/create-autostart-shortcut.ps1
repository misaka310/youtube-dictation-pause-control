$ErrorActionPreference = 'Stop'

$shortcutPath = $env:YDP_SHORTCUT_PATH
$targetPath = $env:YDP_TARGET_PATH
$workingDirectory = $env:YDP_WORKING_DIR
$arguments = $env:YDP_ARGUMENTS

if ([string]::IsNullOrWhiteSpace($shortcutPath)) {
    throw 'YDP_SHORTCUT_PATH is not set.'
}
if ([string]::IsNullOrWhiteSpace($targetPath)) {
    throw 'YDP_TARGET_PATH is not set.'
}
if ([string]::IsNullOrWhiteSpace($workingDirectory)) {
    throw 'YDP_WORKING_DIR is not set.'
}
if (-not (Test-Path -LiteralPath $targetPath)) {
    throw "Startup target does not exist: $targetPath"
}

$shortcutDir = Split-Path -Parent $shortcutPath
if (-not (Test-Path -LiteralPath $shortcutDir)) {
    New-Item -ItemType Directory -Path $shortcutDir -Force | Out-Null
}

$wshShell = New-Object -ComObject WScript.Shell
$shortcut = $wshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $workingDirectory
$shortcut.Description = 'Start YouTube Dictation Control in the notification area'
if (-not [string]::IsNullOrWhiteSpace($arguments)) {
    $shortcut.Arguments = $arguments
}
if ([System.IO.Path]::GetExtension($targetPath) -ieq '.exe') {
    $shortcut.IconLocation = "$targetPath,0"
}
$shortcut.Save()
