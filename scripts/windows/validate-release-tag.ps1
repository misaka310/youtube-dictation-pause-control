[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Tag
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Resolve-Path -LiteralPath (Join-Path $scriptDir '..\..')).Path
$packagePath = Join-Path $rootDir 'package.json'
$package = Get-Content -Raw -LiteralPath $packagePath | ConvertFrom-Json
$expectedTag = "v" + $package.version

if ($Tag -cne $expectedTag) {
    throw "Release tag '$Tag' does not match package.json version '$($package.version)'. Expected '$expectedTag'."
}

Write-Output "Release tag '$Tag' matches package.json version '$($package.version)'."
