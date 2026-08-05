# JOB-VOX-ASSET-PREFLIGHT-ATTENTION-V1 Handoff

- Status: `review_required`
- Changed implementation: `apps/desktop/src/main/main.ts`.
- Behavior: Asset Acquisition preflight failures now persist a failed StageRun, mark the project stage failed with safe attention metadata, and return a sanitized retryable error before the IPC call rejects.
- Safety: Provider and credential failures use safe categories/messages; raw provider exceptions and secrets are not persisted or returned.
- Successful behavior: Provider-backed generation and existing Asset Acquisition validation paths remain unchanged.
- Verification: `corepack pnpm exec vitest run apps/desktop/src/main/productionOrchestrator.test.ts` passed (4 tests); `corepack pnpm typecheck` passed; `git diff --check` passed.
- Reviewer/QA: not yet recorded; builder did not self-approve.
- Remaining: independent reviewer and QA evidence are required by the harness. The seeded VOX runtime still needs a verified asset-acquisition route before it can reach the later scene/voice/preview/export checkpoints.
