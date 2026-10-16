param([switch]$SkipTests)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
function Invoke-Check([string]$Folder, [string[]]$Arguments) {
  Push-Location (Join-Path $repoRoot $Folder)
  try {
    & npm.cmd @Arguments
    if ($LASTEXITCODE -ne 0) { throw ('Check failed in ' + $Folder + ': npm ' + ($Arguments -join ' ')) }
  } finally { Pop-Location }
}
Invoke-Check -Folder 'backend' -Arguments @('run', 'lint')
if (-not $SkipTests) { Invoke-Check -Folder 'backend' -Arguments @('test') }
Invoke-Check -Folder 'backend' -Arguments @('run', 'build')
Invoke-Check -Folder 'frontend' -Arguments @('run', 'lint')
Invoke-Check -Folder 'frontend' -Arguments @('run', 'build')
