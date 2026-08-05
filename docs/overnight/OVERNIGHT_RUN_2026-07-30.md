# Overnight Run - 2026-07-30

## 2026-07-30 baseline and reference-stage checkpoint

- Starting commit: `484da53`
- Branch: `main`
- Dirty worktree: present before this checkpoint; preserved without reset or commit.
- Node: `v22.21.0`; pnpm: `9.15.4`; Electron dependency: `43.2.0`.
- Workspace: `D:\HOCTAP\latvat\WorkFlowYTB`; SQLite uses the selected local workspace path.
- 9Router base URL, selected models, and credential values were not recorded because no real credential was inspected.

## Baseline gates

- `corepack pnpm lint`: passed.
- `corepack pnpm typecheck`: passed.

## Regression checkpoint

- `corepack pnpm test`: passed, 19 files and 86 tests.
- `git diff --check`: passed.
- `corepack pnpm test`: passed, 13 files and 71 tests.
- `corepack pnpm --filter @lsf/desktop build`: passed.

## Completed checkpoint evidence

- Reference URL validation rejects malformed, non-HTTP(S), and incomplete YouTube sources.
- Replacing a transcript preserves the old version, excludes it from current analysis, and prevents a version chain from becoming a duplicate source.
- Reference Validation now writes an immutable `workflow_stage_runs` record and an approved-reviewable artifact in the same SQLite transaction as project state.
- Reference-set approval updates the project, run, and artifact atomically.
- Transcript Cleaning now requires a currently verified text-model certification, runs one included approved reference at a time, validates strict JSON, persists review artifacts, and requires explicit approval.
- Electron workflow-contract smoke passed in `.tmp-workflow-contract/reference-stage-run-33888.json`.
- Electron workflow-contract smoke passed again after Transcript Cleaning UI changes in `.tmp-workflow-contract/post-cleaning-ui-rerun-12772.json`; no provider request occurred on screen load.
- Electron workflow-contract smoke passed after the CSP addition in `.tmp-workflow-contract/csp-ui-29580.json`.

## Current boundary

The highest runtime-verified workflow stage is Reference Validation and reference-set approval. Transcript Cleaning is runtime implemented and unit-tested, but has not been verified against a real configured provider. Every later production runner remains incomplete and blocked by design.

## Major checkpoint gate

- `corepack pnpm lint`: passed.
- `corepack pnpm typecheck`: passed.
- `corepack pnpm test`: passed, 15 files and 78 tests.
- `corepack pnpm --filter @lsf/desktop build`: passed.

## 2026-07-30 Reference Segmentation batch

- Reference Segmentation now consumes only an approved `transcript.cleaned` artifact per included reference.
- Each explicit provider call has a canonical input fingerprint, immutable StageRun, strict JSON validation, exact character-slice verification, review artifact, and explicit per-reference approval.
- Aggregate stage approval requires approved segment artifacts for every included approved reference; Competitor DNA remains blocked until then.
- `corepack pnpm exec vitest run apps/desktop/src/main/referenceSegmentationService.test.ts`: passed (2 tests).
- `corepack pnpm typecheck`: passed.
- `corepack pnpm --filter @lsf/desktop build`: passed.
- No 9Router credential or real provider request was used, so provider runtime remains unverified.

## 2026-07-30 Competitor DNA batch

- Competitor DNA now runs separately per reference and accepts only approved cleaned transcript and segmentation artifacts.
- Strict JSON output requires evidence segment IDs; invented IDs and copied long source phrases fail validation before review.
- Each run persists its fingerprint, StageRun, review artifact, safe failure metadata, and explicit approval gate.
- `corepack pnpm exec vitest run apps/desktop/src/main/competitorDnaService.test.ts`: passed (2 tests).
- `corepack pnpm typecheck` and `corepack pnpm --filter @lsf/desktop build`: passed.

## 2026-07-30 Opportunity Map batch

- Opportunity Map accepts only approved Competitor DNA artifacts for every included reference.
- It persists explicit runs and review artifacts, rejects unknown evidence IDs, and forces low confidence for single-reference findings.
- `corepack pnpm exec vitest run apps/desktop/src/main/opportunityMapService.test.ts`: passed (2 tests).
- `corepack pnpm typecheck`: passed.

## 2026-07-30 Idea Lab and Originality Review batch

- Idea Lab now rejects invalid 4/4/4 risk distributions and duplicate candidate IDs, prevents duplicate active runs, and persists failures transactionally.
- Originality Review persists an explicit local-deterministic review artifact derived from the approved idea and approved Competitor DNA evidence. It evaluates phrase, structural, thumbnail, and concept overlap; only a passing review can unlock Research Source Intake.
- Verification: `corepack pnpm exec vitest run packages/domain/test/originalityReview.test.ts packages/domain/test/ipcSchemas.test.ts packages/domain/test/workflowRegistry.test.ts apps/desktop/src/main/ideaLabService.test.ts` (17 tests passed).
- Limitation: no real provider call was made, and Originality Review does not claim external-web coverage.

## 2026-07-30 Research Source Intake batch

- Research Source Intake now accepts only explicit manual source title, URL, excerpt, and type. It stores a reviewable source artifact and requires approval before Claim Map becomes eligible.
- No source retrieval, search result, or source text is fabricated by the application.
- Verification: `corepack pnpm exec vitest run packages/domain/test/ipcSchemas.test.ts packages/domain/test/workflowRegistry.test.ts packages/domain/test/originalityReview.test.ts` (15 tests passed).

## 2026-07-30 Claim Map and Outline batch

- Claim Map now accepts only approved Research Source Intake artifacts, validates every source citation, blocks allegations and unsupported claims from approval, and requires human review before claims are written to the project.
- Outline now accepts only the approved idea and verified, allowed claims; every section must cite a claim and no visual/scene planning is generated at this stage.
- Both stages have persisted run/artifact histories and renderer review controls. No real provider call was made.
