[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^JOB-[A-Z0-9]+(?:-[A-Z0-9]+)*$')][string]$JobId,
  [string]$BaseBranch = 'main',
  [string]$DestinationRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$jobPath = Join-Path $repoRoot ".harness/jobs/$JobId.json"
if (-not (Test-Path -LiteralPath $jobPath)) { throw "Job does not exist: $jobPath" }
if ([string]::IsNullOrWhiteSpace($DestinationRoot)) {
  $parent = Split-Path -Parent $repoRoot
  $DestinationRoot = Join-Path $parent "$(Split-Path -Leaf $repoRoot)-worktrees"
}
$destinationRootFull = [System.IO.Path]::GetFullPath($DestinationRoot)
$destination = Join-Path $destinationRootFull $JobId
$branch = "agent/$($JobId.ToLowerInvariant())"
if (Test-Path -LiteralPath $destination) { throw "Worktree destination already exists: $destination" }
if (git -C $repoRoot show-ref --verify --quiet "refs/heads/$branch") { throw "Branch already exists: $branch" }
if (-not (git -C $repoRoot show-ref --verify --quiet "refs/heads/$BaseBranch")) { throw "Base branch does not exist: $BaseBranch" }

New-Item -ItemType Directory -Force -Path $destinationRootFull | Out-Null
git -C $repoRoot worktree add -b $branch $destination $BaseBranch
if ($LASTEXITCODE -ne 0) { throw "Failed to create worktree for $JobId." }
Write-Output "Created branch $branch in $destination"
