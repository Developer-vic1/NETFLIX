param([ValidateSet('layout', 'interactions', 'all')][string]$Scenario = 'all')
$ErrorActionPreference = 'Stop'
if (-not (Get-Command npx.cmd -ErrorAction SilentlyContinue)) { throw 'npx is required for optional browser QA.' }
if (-not (Test-Path -LiteralPath 'index.html')) { throw 'Run this script from the project root.' }
New-Item -ItemType Directory -Path 'output/playwright' -Force | Out-Null
$browserSession = 'netflix-qa'
$startOutput = & npx.cmd --yes --package '@playwright/cli' playwright-cli "-s=$browserSession" open 'http://127.0.0.1:4173/' 2>&1
if ($LASTEXITCODE -ne 0) { throw ($startOutput -join "`n") }
$scenarios = if ($Scenario -eq 'all') { @('layout', 'interactions') } else { @($Scenario) }
foreach ($item in $scenarios) {
  $scenarioOutput = & npx.cmd --yes --package '@playwright/cli' playwright-cli "-s=$browserSession" run-code --filename "scripts/qa-$item.cjs" 2>&1
  $scenarioOutput | Set-Content -LiteralPath "output/playwright/$item-run.log" -Encoding utf8
  if ($LASTEXITCODE -ne 0) { throw ($scenarioOutput -join "`n") }
  $resultLine = $scenarioOutput | Where-Object { $_ -is [string] -and $_.StartsWith('{"total":') } | Select-Object -First 1
  if (-not $resultLine) { throw 'Browser scenario returned no machine-readable result.' }
  $resultLine | Set-Content -LiteralPath "output/playwright/$item-results.json" -Encoding utf8
  $result = $resultLine | ConvertFrom-Json
  Write-Output "$item : $($result.passed)/$($result.total) PASS; errors=$($result.errors.Count); broken requests=$($result.failedRequests.Count)"
  if ($result.passed -ne $result.total -or $result.errors.Count -or $result.failedRequests.Count) { throw $resultLine }
}
