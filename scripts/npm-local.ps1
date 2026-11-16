param(
  [ValidateSet('api', 'webapp', 'mobileapp')][string]$App = 'api',
  [string[]]$NpmArgs = @()
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localNode = Join-Path $projectRoot '.local-preserved/runtime/node-v22.23.4-win-x64/node.exe'
$nodeExecutable = if (Test-Path -LiteralPath $localNode) { $localNode } else { (Get-Command node -ErrorAction Stop).Source }
$nodeVersion = [version]((& $nodeExecutable --version).Trim().TrimStart('v'))
$floors = @{22=[version]'22.23.4'; 24=[version]'24.22.1'; 26=[version]'26.12.1'}
if (!$floors.ContainsKey($nodeVersion.Major) -or $nodeVersion -lt $floors[$nodeVersion.Major]) {
  throw 'Installez une version Node.js corrigée : 22.23.4+, 24.22.1+ ou 26.12.1+ dans la même branche majeure.'
}
$npmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
$npmCli = Join-Path (Split-Path -Parent $npmCommand) 'node_modules/npm/bin/npm-cli.js'
if (!(Test-Path -LiteralPath $npmCli)) { throw 'CLI npm introuvable à côté de npm.cmd.' }
if ($NpmArgs.Count -eq 0) { $NpmArgs = if ($App -eq 'mobileapp') { @('start') } else { @('run', 'dev') } }
$savedPath = $env:PATH
Push-Location (Join-Path $projectRoot $App)
try {
  $env:PATH = (Split-Path -Parent $nodeExecutable) + [IO.Path]::PathSeparator + $savedPath
  & $nodeExecutable $npmCli @NpmArgs
  $result = $LASTEXITCODE
} finally { Pop-Location; $env:PATH = $savedPath }
exit $result
