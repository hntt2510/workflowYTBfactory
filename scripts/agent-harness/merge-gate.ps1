[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^JOB-[A-Z0-9]+(?:-[A-Z0-9]+)*$')][string]$JobId,
  [switch]$Merge
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$jobPath = Join-Path $repoRoot ".harness/jobs/$JobId.json"
$reviewPath = Join-Path $repoRoot ".harness/reviews/$JobId.review.json"
$qaPath = Join-Path $repoRoot ".harness/evaluations/$JobId.qa.json"
foreach ($path in @($jobPath, $reviewPath, $qaPath)) { if (-not (Test-Path -LiteralPath $path)) { throw "Required gate file is missing: $path" } }
$job = Get-Content -Raw -LiteralPath $jobPath | ConvertFrom-Json
$review = Get-Content -Raw -LiteralPath $reviewPath | ConvertFrom-Json
$qa = Get-Content -Raw -LiteralPath $qaPath | ConvertFrom-Json
if ($job.status -ne 'passed') { throw "Job status must be passed; found $($job.status)." }
if ($review.decision -ne 'approve') { throw "Reviewer decision must be approve; found $($review.decision)." }
if ($qa.decision -ne 'pass') { throw "QA decision must be pass; found $($qa.decision)." }
if (@($review.findings | Where-Object { $_.severity -eq 'critical' }).Count -gt 0) { throw 'Critical review findings remain.' }
$branch = "agent/$($JobId.ToLowerInvariant())"
if (-not (git -C $repoRoot show-ref --verify --quiet "refs/heads/$branch")) { throw "Builder branch does not exist: $branch" }
git -C $repoRoot merge-base --is-ancestor $job.targetBranch $branch
if ($LASTEXITCODE -ne 0) { throw "Builder branch is not up to date with $($job.targetBranch)." }
foreach ($command in @('pnpm lint', 'pnpm typecheck', 'pnpm test:unit', 'pnpm --filter @lsf/desktop build')) {
  Write-Output "Running full verification: $command"
  & powershell -NoProfile -NonInteractive -Command $command
  if ($LASTEXITCODE -ne 0) { throw "Full verification failed: $command" }
}
if ($Merge) {
  git -C $repoRoot checkout $job.targetBranch
  if ($LASTEXITCODE -ne 0) { throw 'Could not switch to the target branch.' }
  git -C $repoRoot merge --no-ff $branch -m "Merge $JobId"
  if ($LASTEXITCODE -ne 0) { throw "Merge failed for $branch." }
  Write-Output "Merged $branch into $($job.targetBranch)."
} else {
  Write-Output 'All merge gates passed. Re-run with -Merge to merge explicitly.'
}
