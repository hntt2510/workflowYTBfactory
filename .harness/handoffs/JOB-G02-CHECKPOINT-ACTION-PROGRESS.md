# Builder handoff: JOB-G02-CHECKPOINT-ACTION-PROGRESS

- Branch: `agent/job-g02-checkpoint-action-progress`
- Stacked base: `8f7f49f0fa26f53f221f5320071a6c55de207b05` verified as an ancestor.
- Scope: G02 checkpoints, centralized action runtime, persistence, progress, retry/invalidation, and creator-facing navigation only.

## Completion audit

- [x] Primary sidebar cleaned to app-level destinations; technical routes are compatibility/legacy only.
- [x] Single Project Workspace hosts all nine checkpoints; checkpoint clicks only change embedded content.
- [x] Registry-driven checkpoint state, dynamic applicability, and denominator-based project progress.
- [x] Central action registry includes prerequisites, expected output, retry policy, and invalidation contract.
- [x] Persistent ActionRun migration/store, interruption recovery, duplicate protection, active-runtime query, and reload visibility.
- [x] Command vs. navigation separation; direct embedded G02 commands and central commands both pass through ActionRun IPC tracking.
- [x] Global runtime bar/drawer and per-checkpoint runtime panel.
- [x] Transcript Cleaning uses real chunk progress; Prompt Preparation uses real batch progress; provider-only actions remain indeterminate.
- [x] No timer-derived or coarse production percentage in the G02 workspace.
- [x] Retry, preserved completed transcript chunks, changed-input fingerprints, and explicit downstream stale state are covered.
- [x] Topic, Existing Script, and Reference applicability are covered by domain/Electron workflow verification.
- [x] Primary workspace does not introduce TTS, FFmpeg, CapCut, MP4, Production Queue, or 9Router creator configuration.

## Verification

- `pnpm --filter @lsf/providers test` — pass
- `pnpm --filter @lsf/domain test` — pass
- `pnpm --filter @lsf/db test` — pass
- `pnpm --filter @lsf/desktop test` — pass
- `pnpm test:unit` — pass (65 files, 407 tests)
- `pnpm typecheck` — pass
- `pnpm lint` — pass
- `pnpm --filter @lsf/desktop build` — pass (existing Vite chunk-size warning only)
- `git diff --check` — pass
- `LSF_UI_MODES=g02-runtime,workflow-contract,reference-restart,verify node scripts/verify-electron-ui.cjs` — pass

The `g02-runtime` Electron fixture exercises checkpoint-only navigation, rapid double click duplicate blocking, determinate 2/3 progress, indeterminate waiting-user state, visible failure, UI retry, reload persistence, and no automatic rerun after reload.

No local Cockpit credential was available, so no paid live smoke request was sent. Deterministic Cockpit provider tests and indeterminate runtime behavior passed without exposing credentials.
