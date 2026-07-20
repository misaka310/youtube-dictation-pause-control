[CmdletBinding()]
param(
    [string]$OutputDirectory = '',
    [switch]$KeepStaging
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if ([string]::IsNullOrWhiteSpace($env:ComSpec)) {
    $env:ComSpec = Join-Path $env:SystemRoot 'System32\cmd.exe'
}

$AutoHotkeyVersion = '2.0.26'
$Ahk2ExeVersion = '1.1.37.02a2'
$NodeVersion = '24.18.0'
$NodeArchiveSha256 = '0AE68406B42D7725661DA979B1403EC9926DA205C6770827F33AAC9D8F26E821'
$AutoHotkeyArchiveSha256 = '43522AA3122A57784AC5DB30ABF85C2244475C36ACD7796E2C993355F9E926AE'
$Ahk2ExeArchiveSha256 = 'C29B8C3A5124850D79FC9E66E2CA79677C377D7F31631AD3022BA159C5D9E3BE'
$AutoHotkeySourceSha256 = '765ADA5AE0A543F470BCD30371A7B95438E59351B0A20508C516DF76A4F73CA4'

$NodeArchiveUrl = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip"
$AutoHotkeyArchiveUrl = "https://github.com/AutoHotkey/AutoHotkey/releases/download/v$AutoHotkeyVersion/AutoHotkey_$AutoHotkeyVersion.zip"
$Ahk2ExeArchiveUrl = "https://github.com/AutoHotkey/Ahk2Exe/releases/download/Ahk2Exe$Ahk2ExeVersion/Ahk2Exe$Ahk2ExeVersion.zip"
$AutoHotkeySourceUrl = "https://github.com/AutoHotkey/AutoHotkey/archive/refs/tags/v$AutoHotkeyVersion.zip"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Resolve-Path -LiteralPath (Join-Path $scriptDir '..\..')).Path
$package = Get-Content -Raw -LiteralPath (Join-Path $rootDir 'package.json') | ConvertFrom-Json
$projectVersion = [string]$package.version
$cacheDir = Join-Path $rootDir '.build-cache'
$distDir = if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    Join-Path $rootDir 'dist'
} else {
    [System.IO.Path]::GetFullPath($OutputDirectory)
}
$stageName = "YouTubeDictationPauseControl-$projectVersion"
$stageDir = Join-Path $distDir $stageName
$zipPath = Join-Path $distDir "$stageName-windows-x64.zip"

function Get-VerifiedDownload {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url,
        [Parameter(Mandatory = $true)]
        [string]$Destination,
        [Parameter(Mandatory = $true)]
        [string]$ExpectedSha256
    )

    if (Test-Path -LiteralPath $Destination) {
        $existingHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Destination).Hash
        if ($existingHash -ieq $ExpectedSha256) {
            return
        }
        Remove-Item -LiteralPath $Destination -Force
    }

    $temporaryPath = "$Destination.download"
    Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $temporaryPath
    $downloadHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $temporaryPath).Hash
    if ($downloadHash -ine $ExpectedSha256) {
        Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
        throw "SHA-256 mismatch for $Url. Expected $ExpectedSha256 but received $downloadHash."
    }
    Move-Item -LiteralPath $temporaryPath -Destination $Destination -Force
}

function Copy-DirectoryContents {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Source,
        [Parameter(Mandatory = $true)]
        [string]$Destination
    )

    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Get-ChildItem -LiteralPath $Source -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force
    }
}

New-Item -ItemType Directory -Force -Path $cacheDir, $distDir | Out-Null

$nodeArchive = Join-Path $cacheDir "node-v$NodeVersion-win-x64.zip"
$ahkArchive = Join-Path $cacheDir "AutoHotkey_$AutoHotkeyVersion.zip"
$ahk2ExeArchive = Join-Path $cacheDir "Ahk2Exe$Ahk2ExeVersion.zip"
$ahkSourceArchive = Join-Path $cacheDir "AutoHotkey-v$AutoHotkeyVersion-source.zip"
Get-VerifiedDownload -Url $NodeArchiveUrl -Destination $nodeArchive -ExpectedSha256 $NodeArchiveSha256
Get-VerifiedDownload -Url $AutoHotkeyArchiveUrl -Destination $ahkArchive -ExpectedSha256 $AutoHotkeyArchiveSha256
Get-VerifiedDownload -Url $Ahk2ExeArchiveUrl -Destination $ahk2ExeArchive -ExpectedSha256 $Ahk2ExeArchiveSha256
Get-VerifiedDownload -Url $AutoHotkeySourceUrl -Destination $ahkSourceArchive -ExpectedSha256 $AutoHotkeySourceSha256

$nodeToolsRoot = Join-Path $cacheDir "node-tools-$NodeVersion"
if (Test-Path -LiteralPath $nodeToolsRoot) {
    Remove-Item -LiteralPath $nodeToolsRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $nodeToolsRoot | Out-Null
Expand-Archive -LiteralPath $nodeArchive -DestinationPath $nodeToolsRoot -Force
$nodeExtractDir = Join-Path $nodeToolsRoot "node-v$NodeVersion-win-x64"
foreach ($requiredNodeFile in @('node.exe', 'LICENSE')) {
    if (-not (Test-Path -LiteralPath (Join-Path $nodeExtractDir $requiredNodeFile))) {
        throw "Required bundled Node.js file is missing: $requiredNodeFile"
    }
}

$toolsDir = Join-Path $cacheDir "tools-$AutoHotkeyVersion-$Ahk2ExeVersion"
if (Test-Path -LiteralPath $toolsDir) {
    Remove-Item -LiteralPath $toolsDir -Recurse -Force
}
$ahkToolsDir = Join-Path $toolsDir 'autohotkey'
$compilerDir = Join-Path $ahkToolsDir 'Compiler'
New-Item -ItemType Directory -Force -Path $ahkToolsDir, $compilerDir | Out-Null
Expand-Archive -LiteralPath $ahkArchive -DestinationPath $ahkToolsDir -Force
Expand-Archive -LiteralPath $ahk2ExeArchive -DestinationPath $compilerDir -Force

$baseExecutable = Join-Path $ahkToolsDir 'AutoHotkey64.exe'
$portableLauncher = Join-Path $ahkToolsDir 'AutoHotkey.exe'
Copy-Item -LiteralPath $baseExecutable -Destination $portableLauncher -Force
$ahk2ExePath = Join-Path $compilerDir 'Ahk2Exe.exe'
$inputScript = Join-Path $rootDir 'ahk\youtube-dictation-control.ahk'
$appIcon = Join-Path $rootDir 'assets\youtube-dictation.ico'
foreach ($requiredTool in @($baseExecutable, $ahk2ExePath, $inputScript, $appIcon)) {
    if (-not (Test-Path -LiteralPath $requiredTool)) {
        throw "Required build input is missing: $requiredTool"
    }
}

$validationProcess = Start-Process -FilePath $baseExecutable `
    -ArgumentList @('/ErrorStdOut', '/Validate', ('"{0}"' -f $inputScript)) `
    -WindowStyle Hidden -Wait -PassThru
if ($validationProcess.ExitCode -ne 0) {
    throw "AutoHotkey validation failed with exit code $($validationProcess.ExitCode)."
}

if (Test-Path -LiteralPath $stageDir) {
    Remove-Item -LiteralPath $stageDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null
$outputExecutable = Join-Path $stageDir 'YouTubeDictationControl.exe'

$compileArguments = @(
    '/in', ('"{0}"' -f $inputScript),
    '/out', ('"{0}"' -f $outputExecutable),
    '/base', ('"{0}"' -f $baseExecutable),
    '/ahk', ('"{0}"' -f $baseExecutable),
    '/icon', ('"{0}"' -f $appIcon),
    '/silent', 'verbose'
)
$compileStdout = Join-Path $cacheDir 'ahk2exe.stdout.log'
$compileStderr = Join-Path $cacheDir 'ahk2exe.stderr.log'
Remove-Item -LiteralPath $compileStdout, $compileStderr -Force -ErrorAction SilentlyContinue
$compileProcess = Start-Process -FilePath $ahk2ExePath -ArgumentList $compileArguments `
    -RedirectStandardOutput $compileStdout -RedirectStandardError $compileStderr -Wait -PassThru
if ($compileProcess.ExitCode -ne 0) {
    $compilerMessage = @(
        (Get-Content -Raw -LiteralPath $compileStdout -ErrorAction SilentlyContinue),
        (Get-Content -Raw -LiteralPath $compileStderr -ErrorAction SilentlyContinue)
    ) -join "`n"
    throw "Ahk2Exe failed with exit code $($compileProcess.ExitCode). $($compilerMessage.Trim())"
}
if (-not (Test-Path -LiteralPath $outputExecutable) -or (Get-Item -LiteralPath $outputExecutable).Length -le 0) {
    throw 'Ahk2Exe did not produce a non-empty YouTubeDictationControl.exe.'
}

$serverDestination = Join-Path $stageDir 'server'
New-Item -ItemType Directory -Force -Path $serverDestination | Out-Null
Copy-Item -LiteralPath (Join-Path $rootDir 'server\server.js') -Destination $serverDestination -Force
Copy-Item -LiteralPath (Join-Path $rootDir 'server\log-writer.js') -Destination $serverDestination -Force
Copy-DirectoryContents -Source (Join-Path $rootDir 'extension') -Destination (Join-Path $stageDir 'extension')
Copy-DirectoryContents -Source $nodeExtractDir -Destination (Join-Path $stageDir 'vendor\node')

$configDestination = Join-Path $stageDir 'config'
New-Item -ItemType Directory -Force -Path $configDestination | Out-Null
Copy-Item -LiteralPath (Join-Path $rootDir 'config\settings.example.json') -Destination $configDestination -Force

$docsDestination = Join-Path $stageDir 'docs'
New-Item -ItemType Directory -Force -Path $docsDestination | Out-Null
foreach ($docName in @('e2e-checklist.md', 'state-behavior.md')) {
    Copy-Item -LiteralPath (Join-Path $rootDir "docs\$docName") -Destination $docsDestination -Force
}

foreach ($rootFile in @('README.md', 'SECURITY.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md')) {
    Copy-Item -LiteralPath (Join-Path $rootDir $rootFile) -Destination $stageDir -Force
}

$licenseDestination = Join-Path $stageDir 'licenses'
New-Item -ItemType Directory -Force -Path $licenseDestination | Out-Null
Copy-Item -LiteralPath (Join-Path $rootDir 'licenses\AutoHotkey-GPL-2.0.txt') -Destination $licenseDestination -Force

$sourceDestination = Join-Path $stageDir 'third_party_sources'
New-Item -ItemType Directory -Force -Path $sourceDestination | Out-Null
Copy-Item -LiteralPath $ahkSourceArchive -Destination (Join-Path $sourceDestination "AutoHotkey-v$AutoHotkeyVersion-source.zip") -Force

$requiredEntries = @(
    'YouTubeDictationControl.exe',
    'server\server.js',
    'server\log-writer.js',
    'extension\manifest.json',
    'config\settings.example.json',
    'vendor\node\node.exe',
    'vendor\node\LICENSE',
    'THIRD_PARTY_NOTICES.md',
    'licenses\AutoHotkey-GPL-2.0.txt',
    "third_party_sources\AutoHotkey-v$AutoHotkeyVersion-source.zip"
)
foreach ($relativePath in $requiredEntries) {
    if (-not (Test-Path -LiteralPath (Join-Path $stageDir $relativePath))) {
        throw "Release staging is missing required entry: $relativePath"
    }
}

$prohibitedEntries = @(
    'config/settings.json',
    'runtime',
    'logs',
    '.git',
    '.build-cache',
    'tests',
    'scripts',
    'server\start-server.bat'
)
foreach ($relativePath in $prohibitedEntries) {
    if (Test-Path -LiteralPath (Join-Path $stageDir $relativePath)) {
        throw "Release staging contains prohibited entry: $relativePath"
    }
}

Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
Compress-Archive -LiteralPath $stageDir -DestinationPath $zipPath -CompressionLevel Optimal
if (-not (Test-Path -LiteralPath $zipPath) -or (Get-Item -LiteralPath $zipPath).Length -le 0) {
    throw 'Release ZIP was not created.'
}

Write-Host "Built executable: $outputExecutable"
Write-Host "Built release ZIP: $zipPath"

if (-not $KeepStaging) {
    Remove-Item -LiteralPath $stageDir -Recurse -Force
}
