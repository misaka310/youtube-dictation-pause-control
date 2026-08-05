param(
  [int]$TimeoutSeconds = 90
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$extensionRoot = Join-Path $repoRoot 'extension'
$manifestPath = Join-Path $extensionRoot 'manifest.json'
$buildPath = Join-Path $extensionRoot 'agent-build.json'
$helperPath = 'C:\00_dev\.agents\skills\browser-extension-update-delivery\scripts\invoke_reload_server.ps1'

if (-not (Test-Path -LiteralPath $helperPath)) {
  throw "Shared extension reload helper is missing: $helperPath"
}

$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$originalBuild = if (Test-Path -LiteralPath $buildPath) { [IO.File]::ReadAllText($buildPath) } else { $null }
$buildId = [Guid]::NewGuid().ToString('N')
$exitCode = 1

try {
  $payload = [ordered]@{
    buildId = $buildId
    generatedAt = [DateTime]::UtcNow.ToString('o')
  } | ConvertTo-Json
  [IO.File]::WriteAllText($buildPath, $payload + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))

  & $helperPath `
    -Port 18793 `
    -Extension youtube-dictation-pause-control `
    -ExpectedVersion ([string]$manifest.version) `
    -ExpectedBuildId $buildId `
    -TimeoutSeconds ([Math]::Max(5, $TimeoutSeconds))
  $exitCode = $LASTEXITCODE
} finally {
  if ($null -eq $originalBuild) {
    Remove-Item -LiteralPath $buildPath -Force -ErrorAction SilentlyContinue
  } else {
    [IO.File]::WriteAllText($buildPath, $originalBuild, [Text.UTF8Encoding]::new($false))
  }
}

exit $exitCode
