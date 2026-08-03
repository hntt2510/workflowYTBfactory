# JOB-VOX-FINAL-PREVIEW-CHECKPOINT-V1 Handoff

- Status: `review_required`
- Change: The production orchestrator now supports leaving a generated stage at `needs_review` and uses that mode for Preview Render. Voice Generation, Subtitle Preparation, and Timeline Assembly remain auto-approved; Preview Render is now the explicit Final Preview checkpoint.
- Verification: `corepack pnpm exec vitest run apps/desktop/src/main/productionOrchestrator.test.ts` passed 5 tests; `corepack pnpm typecheck` and `git diff --check` passed.
- Runtime context: The prior resumed runtime produced approved voice, subtitles, timeline, and a non-empty preview MP4 before timing out at the missing Final Preview checkpoint. This change addresses that persisted-status mismatch. A fresh end-to-end rerun and final export are still pending.
- Reviewer/QA: not yet recorded; builder did not self-approve.
