$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$localNode = Join-Path $PSScriptRoot '.tools\node-v24.22.0-win-x64'
if (Test-Path -LiteralPath (Join-Path $localNode 'node.exe')) { $env:PATH = "$localNode;$env:PATH" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Please install Node.js 22.12+ or 24 LTS, then run this script again.' }
if (-not (Test-Path -LiteralPath 'node_modules')) { & npm.cmd install; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
& npm.cmd run dev
