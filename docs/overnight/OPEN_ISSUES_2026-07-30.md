# Open Issues - 2026-07-30

## ISSUE-001 - Downstream production stages do not yet have trusted runners

- Severity: P1
- Status: Open
- Detected at: 2026-07-30
- Checkpoint: workflow stage engine
- Project ID: null
- Stage ID: reference-segmentation through packaging-export
- StageRun ID: null
- Component: domain registry, main-process stage services, renderer stage screens
- Related files: `packages/domain/src/workflowRegistry.ts`, `apps/desktop/src/main/main.ts`
- Reproducible: Yes
- Blocks downstream: Yes
- Safe independent work remains: Yes

### Reproduction

1. Create and approve a valid reference set.
2. Open Competitor DNA.
3. Observe Transcript Cleaning is deliberately unavailable because no provider-backed runner exists.

### Expected

Each canonical stage has a trusted runner, persistent StageRun/artifact history, validation, review, approval, and stale invalidation.

### Actual

Reference Validation through Script now have runtime behavior. Fact Review and later stages remain unavailable.

### Evidence

- Electron smoke: `.tmp-workflow-contract/reference-stage-run-33888.json`
- Stage matrix: `docs/WORKFLOW_STAGE_MATRIX.md`

### Root-cause analysis

Confirmed. The registry now preserves the complete 28-stage production contract, but trusted runners and per-stage review flows are still missing.

### Safety action taken

Downstream stages remain blocked; no fixtures or automatic provider fallback were introduced.

### Suggested fix batch

Implement Fact Review using approved Script and cited claims.

### Acceptance criteria

- Each run is explicit, idempotent, persisted, Zod-validated, reviewable, and approvable.
- Failed, rejected, and stale artifacts cannot unlock downstream work.

### Update - 2026-07-30 Reference Segmentation batch

- Status: Open
- Reference Segmentation now creates per-reference, provider-gated `StageRun` and `reference-segments` artifacts.
- Exact segment text/range/non-overlap validation, review, per-reference approval, and aggregate unlock are implemented.
- Verification: `corepack pnpm exec vitest run apps/desktop/src/main/referenceSegmentationService.test.ts`; `corepack pnpm --filter @lsf/desktop build`.

## ISSUE-002 - Runtime environment probes still use synchronous child processes

- Severity: P2
- Status: Open
- Detected at: 2026-07-30
- Checkpoint: security audit
- Project ID: null
- Stage ID: capcut-draft / preview-render
- StageRun ID: null
- Component: Electron main process
- Related files: `apps/desktop/src/main/main.ts`
- Reproducible: Yes
- Blocks downstream: No
- Safe independent work remains: Yes

### Reproduction

1. Open the runtime environment diagnostics path while a probe is slow.
2. The synchronous Python/FFmpeg probes can block the Electron main process.

### Expected

All potentially slow process execution is asynchronous, cancellable, and reports safe progress.

### Actual

OmniVoice generation is asynchronous after this checkpoint, but environment probes remain synchronous.

### Evidence

- Static audit found `execFileSync` in the environment-probe code.

### Root-cause analysis

Confirmed.

### Safety action taken

The long-running OmniVoice execution path now uses asynchronous `execFile` and verifies output creation.

### Suggested fix batch

Move diagnostics probes to an asynchronous service with bounded timeout and UI status.

### Acceptance criteria

- No long-running child process blocks Electron main.
- Failures are safe and visible without raw stderr leakage.
