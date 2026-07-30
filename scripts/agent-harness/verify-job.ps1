[CmdletBinding()]
param([Parameter(Mandatory)][ValidatePattern('^JOB-[A-Z0-9]+(?:-[A-Z0-9]+)*$')][string]$JobId)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$jobPath = Join-Path $repoRoot ".harness/jobs/$JobId.json"
if (-not (Test-Path -LiteralPath $jobPath)) { throw "Job does not exist: $jobPath" }
$job = Get-Content -Raw -LiteralPath $jobPath | ConvertFrom-Json
if (-not $job.verificationCommands -or $job.verificationCommands.Count -eq 0) { throw 'Job has no verification commands.' }
$results = @()
$failed = $false
foreach ($command in $job.verificationCommands) {
  $startedAt = (Get-Date).ToUniversalTime().ToString('o')
  $output = & powershell -NoProfile -NonInteractive -Command $command 2>&1 | Out-String
  $exitCode = $LASTEXITCODE
  $results += [ordered]@{ command = $command; startedAt = $startedAt; exitCode = $exitCode; output = $output }
  if ($exitCode -ne 0) { $failed = $true; break }
}
$evidence = [ordered]@{
  jobId = $JobId; qa = 'qa'; commitSha = (git -C $repoRoot rev-parse HEAD).Trim(); decision = if ($failed) { 'fail' } else { 'pass' }
  evaluatedAt = (Get-Date).ToUniversalTime().ToString('o'); commands = $results; baselineFailures = @()
}
$evaluationPath = Join-Path $repoRoot ".harness/evaluations/$JobId.qa.json"
$evidence | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $evaluationPath -Encoding utf8NoBOM
if ($failed) { Write-Error "Verification failed; evidence written to $evaluationPath"; exit 1 }
Write-Output "Verification passed; evidence written to $evaluationPath"
