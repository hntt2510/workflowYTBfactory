[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^JOB-[A-Z0-9]+(?:-[A-Z0-9]+)*$')][string]$JobId,
  [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$Title,
  [Parameter(Mandatory)][ValidateSet('short', 'long')][string]$Type
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$jobsDirectory = Join-Path $repoRoot '.harness/jobs'
$targetPath = Join-Path $jobsDirectory "$JobId.json"
if (Test-Path -LiteralPath $targetPath) { throw "Job already exists: $targetPath" }

$job = [ordered]@{
  jobId = $JobId; type = $Type; title = $Title; status = 'planned'; targetBranch = 'main'; assignedRole = 'builder'
  description = 'Describe the bounded implementation work.'; businessContext = 'Describe the user or business need.'
  allowedPaths = @('TODO/replace-with-an-allowed-path'); forbiddenPaths = @(); dependencies = @(); acceptanceCriteria = @('TODO: replace with a measurable acceptance criterion.'); verificationCommands = @('pnpm test:unit')
  requiredReviewers = @('reviewer', 'qa'); maxReviewRounds = 3; humanEscalationConditions = @('Requirements are ambiguous or scope exceeds allowed paths.')
}

foreach ($field in @('jobId', 'type', 'title', 'status', 'targetBranch', 'assignedRole', 'description', 'businessContext', 'allowedPaths', 'forbiddenPaths', 'dependencies', 'acceptanceCriteria', 'verificationCommands', 'requiredReviewers', 'maxReviewRounds', 'humanEscalationConditions')) {
  if (-not $job.Contains($field)) { throw "Required field is missing: $field" }
}
if ($job.allowedPaths.Count -eq 0 -or [string]::IsNullOrWhiteSpace($job.allowedPaths[0]) -or $job.acceptanceCriteria.Count -eq 0 -or [string]::IsNullOrWhiteSpace($job.acceptanceCriteria[0])) {
  throw 'A new job template must include non-empty allowedPaths and acceptanceCriteria.'
}

New-Item -ItemType Directory -Force -Path $jobsDirectory | Out-Null
$job | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $targetPath -Encoding utf8NoBOM
Write-Output "Created $targetPath. Fill in the placeholder fields before changing status to ready."
