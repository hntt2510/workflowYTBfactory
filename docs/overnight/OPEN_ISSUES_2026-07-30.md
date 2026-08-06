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
- Status: Fixed
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

Runtime probes use bounded asynchronous `execFile` calls; the Electron main process does not wait synchronously for Python or FFmpeg diagnostics.

### Evidence

- `rg -n execFileSync apps/desktop/src/main/main.ts` returns no source usage.
- Workspace typecheck passes after `bootstrap`, QA, and CapCut Draft callers await the probe.

### Root-cause analysis

Confirmed.

### Safety action taken

The long-running OmniVoice execution path now uses asynchronous `execFile` and verifies output creation.

### Suggested fix batch

Move diagnostics probes to an asynchronous service with bounded timeout and UI status.

### Acceptance criteria

- No long-running child process blocks Electron main.
- Failures are safe and visible without raw stderr leakage.

## ISSUE-003 - Independent Codex review worker cannot authenticate

- Severity: P2
- Status: Open
- Detected at: 2026-07-30T11:50:00+07:00
- Checkpoint: Visual Routing Review
- Project ID: null
- Stage ID: visual-routing
- StageRun ID: null
- Component: local Codex CLI provider configuration
- Related files: none
- Reproducible: Yes
- Blocks downstream: No
- Safe independent work remains: Yes

### Reproduction

1. Run `codex exec --ephemeral -s read-only` with the configured `nine_router` provider.
2. The CLI exits before worker execution because `NINE_ROUTER_API_KEY` is absent.

### Expected

An isolated reviewer can inspect local code without revealing or changing credentials.

### Actual

The configured CLI provider requires an unavailable environment credential, so no independent review artifact is produced.

### Evidence

- `codex exec` exit 1 at 2026-07-30T11:50:00+07:00: `Missing environment variable: NINE_ROUTER_API_KEY`.

### Root-cause analysis

Confirmed external configuration blocker; no credential was inspected or modified.

### Safety action taken

No retry was attempted. Local tests, typecheck, and strict IPC/schema checks remain the available evidence.

### Suggested fix batch

Configure an authenticated review provider outside this workflow, then rerun a read-only independent review.

### Acceptance criteria

- Reviewer worker starts with read-only filesystem access.
- No secret is displayed or committed.

## ISSUE-004 - CapCut editable draft cannot yet be verified in the installed application

- Severity: P1
- Status: Open
- Detected at: 2026-07-30T12:40:00+07:00
- Checkpoint: capcut-draft
- Project ID: null
- Stage ID: capcut-draft
- StageRun ID: null
- Component: `python/capcut_bridge/bridge.py`, pycapcut 0.0.3, local CapCut installation
- Related files: `python/capcut_bridge/bridge.py`, `packages/capcut/src/adapter.ts`
- Reproducible: Yes
- Blocks downstream: Yes
- Safe independent work remains: Yes

### Reproduction

1. Run the local pycapcut compatibility fixture.
2. Run the structural fixture with one approved-like visual, narration, and subtitle.
3. Observe the bridge writes structural tracks but does not prove that installed CapCut opens the draft.

### Expected

An editable draft opens in CapCut with visual, audio, and subtitle tracks preserved.

### Actual

The pycapcut bridge now creates structural video, audio, and subtitle tracks, but there is no verified CapCut-open evidence and the production stage remains disabled.

### Evidence

- `.tmp-capcut-compat/compatibility-fixture/draft_content.json`
- `.tmp-capcut-structural-20260730/LongShortFactoryStructural/draft_content.json`
- Local pycapcut 0.0.3 structural fixture: `tracks=3`, with one video, one audio, and one text segment.

### Root-cause analysis

Installed-app validation remains absent. The Python bridge now emits structural tracks, but the TypeScript adapter remains manifest-only and no draft is represented as a verified production output.

### Safety action taken

CapCut Draft remains unavailable. No manifest is represented as a verified draft and Packaging Export stays gated.

### Suggested fix batch

Wire the structurally validated bridge to a gated production stage and verify the created draft opens in the installed CapCut application before enabling approval.

### Acceptance criteria

- Draft uses real approved media and subtitle tracks.
- CapCut opens the draft and tracks remain editable.
- Existing drafts are backed up before replacement.

## ISSUE-005 - Electron create-project smoke no longer reaches wizard content

- Severity: P1
- Status: Fixed
- Detected at: 2026-07-30T12:49:00+07:00
- Checkpoint: runtime verification
- Project ID: null
- Stage ID: project-setup
- StageRun ID: null
- Component: Electron renderer startup
- Related files: `scripts/verify-electron-ui.cjs`, `apps/desktop/src/renderer/App.tsx`
- Reproducible: Yes
- Blocks downstream: Yes
- Safe independent work remains: Yes

### Evidence

- `node scripts/verify-electron-ui.cjs` failed in create mode: expected `Bible Mysteries Revealed`; page text was only `Long/Short Factory`.

### Safety action taken

No runtime workflow success is claimed from typecheck-only evidence. Investigate renderer startup before final completion audit.

### Fixed

- Fixed by: current worktree change
- Verification: `node scripts/verify-electron-ui.cjs` passed create and verify modes on 2026-07-30.

## ISSUE-006 - Local OmniVoice runner is unavailable

- Severity: P1
- Status: Open
- Detected at: 2026-07-30T13:01:00+07:00
- Checkpoint: voice-generation
- Project ID: null
- Stage ID: voice-generation
- StageRun ID: null
- Component: Local OmniVoice runtime
- Related files: `OmniVoice/.venv`, `apps/desktop/src/main/main.ts`
- Reproducible: Yes
- Blocks downstream: Yes
- Safe independent work remains: Yes

### Reproduction

1. Inspect `OmniVoice/.venv/Scripts`.
2. Search for `omnivoice-infer.exe`.

### Expected

The configured local checkout provides a runnable `omnivoice-infer` executable and its Python runtime.

### Actual

The checkout has deleted source files and no `.venv/Scripts/python.exe` or `omnivoice-infer.exe`, so Voice Generation stays gated without a provider fallback.

### Evidence

- `git -C OmniVoice status --short` reports deleted source paths.
- `Get-ChildItem OmniVoice/.venv` shows no `Scripts` directory.

### Root-cause analysis

Confirmed local runtime is incomplete; no recovery action was taken because restoring the separately dirty checkout would overwrite user work.

### Safety action taken

Voice Generation remains unavailable and downstream Subtitle, Timeline, Preview, QA, CapCut, and Export remain gated for real projects.

### Suggested fix batch

Restore or reinstall OmniVoice in its own checkout, configure the exact local executable, then run a single explicit audio generation and FFprobe validation.

### Acceptance criteria

- `omnivoice-infer --help` runs from the configured path.
- A manually initiated voice run produces FFprobe-valid audio inside the workspace.
- No alternate voice provider is used.

## ISSUE-007 - Competitor DNA provider output failed strict schema validation

- Severity: P1
- Status: Fixed
- Detected at: 2026-08-01T10:17:44Z
- Checkpoint: competitor-dna
- Project ID: `project-ae9df5f8-5d1c-426d-8bca-bd5957ff78cf`
- Stage ID: `competitor-dna`
- StageRun ID: `stage-run-41f8fb68-30a8-4148-b0b9-3c54f2bc640e`
- Component: Competitor DNA provider response validation
- Related files: `apps/desktop/src/main/competitorDnaService.ts`, `apps/desktop/src/main/main.ts`
- Reproducible: Yes
- Blocks downstream: Yes
- Safe independent work remains: Yes

### Reproduction

1. Use the approved synthetic runtime project with approved Transcript Cleaning and Reference Segmentation artifacts.
2. Invoke `window.longShortFactory.runCompetitorDna({ projectId, referenceId })` through the Electron IPC bridge.
3. Observe the provider response is rejected as invalid structured output.

### Expected

Competitor DNA returns the strict evidence-backed schema and enters `needs_review`.

### Actual

The configured 9Router model response did not match the Competitor DNA schema. The run was persisted as `failed` with safe error category `invalid_output`; Opportunity Map remains blocked.

### Evidence

- SQLite: `workflow_stage_runs` row `stage-run-41f8fb68-30a8-4148-b0b9-3c54f2bc640e`.
- Runtime error: `Competitor DNA returned an invalid structured output.`
- Reference Segmentation was approved before this run and remains approved.

### Root-cause analysis

Confirmed response-contract failure; the exact rejected provider payload is intentionally not written to the audit report.

### Safety action taken

The failed artifacts were not approved, no downstream stage was run during the failed attempts, and no retry reused an identical provider fingerprint.

### Fixed

- Fixed by: current worktree change (`competitor-dna-v5` prompt and validation contract).
- Verification: real Electron IPC/9Router run `stage-run-10de6c42-c715-4a33-9587-a2e4feea70a8` reached `needs_review`; sponsor exclusion and evidence checks passed; restart preserved the artifact.

### Suggested fix batch

Capture a redacted schema-diagnostic summary in a local development log, tighten the Competitor DNA prompt or parser only with evidence, then rerun once with a new implementation fingerprint.

### Acceptance criteria

- A real provider response passes the Competitor DNA schema and evidence checks.
- Every cited segment is included for DNA and excluded-content summary matches segmentation.
- The output reaches `needs_review` before explicit approval.

## ISSUE-008 - Asset Acquisition has no applicable AI-image input

- Severity: P1
- Status: Open
- Detected at: 2026-08-02T02:00:29+07:00
- Checkpoint: asset-acquisition
- Project ID: `project-09d4fcb0-0637-4bc3-95fe-1c83f19c6e9d`
- Stage ID: asset-acquisition
- StageRun ID: None; the handler failed before creating a run.
- Component: Visual Routing / Prompt Preparation / Asset Acquisition
- Related files: `apps/desktop/src/main/main.ts`, `apps/desktop/src/main/assetAcquisitionService.ts`
- Reproducible: Yes
- Blocks downstream: Yes
- Safe independent work remains: Yes

### Reproduction

1. Use the isolated project after approved Visual Routing and Prompt Preparation.
2. Inspect the seven routed shots: all are `stock_video` or `document`.
3. Invoke `window.longShortFactory.runAssetAcquisition({ projectId })`.

### Expected

The selected visual route has an applicable, reviewable asset acquisition path.

### Actual

The approved Prompt Preparation artifact contains zero AI-image prompts, so the handler fails closed with `Asset Acquisition requires at least one approved AI image prompt.` No run, artifact, or placeholder asset is created.

### Evidence

- SQLite: project shots and approved prompt artifact in `.tmp-main-flow-runtime/full-path-20260802/long-short-factory.sqlite`.
- Runtime error: `Asset Acquisition requires at least one approved AI image prompt.`
- Image certification table has no verified record.

### Root-cause analysis

Confirmed fixture/workflow coverage gap: Visual Routing can select `stock_video` or `document`, but the production Asset Acquisition handler only accepts `ai_image` prompts and no stock/document asset acquisition artifact exists.

### Safety action taken

The failed precondition was preserved; no synthetic image, raw placeholder, or unapproved artifact was inserted.

### Suggested fix batch

Provide a real AI-image route and verified image certification for this fixture, or implement a separate trusted stock/document acquisition path before Asset Review.
