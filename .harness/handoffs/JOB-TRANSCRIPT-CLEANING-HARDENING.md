# JOB-TRANSCRIPT-CLEANING-HARDENING

- Status: review_required
- Commit: not created; changes remain in the user's worktree for review.
- Changed implementation: `apps/desktop/src/main/transcriptCleaningService.ts`, `apps/desktop/src/renderer/App.tsx`.
- Changed tests: `apps/desktop/src/main/transcriptCleaningService.test.ts`.
- Verification: focused suite passed, 4 files / 98 tests; `corepack pnpm typecheck` passed; `git diff --check` passed.
- Behavior: locally removed formatting noise is persisted in `removedSegments`; materially unchanged long model output fails closed; run history displays `x/y chunks completed`.
- Remaining: independent reviewer and QA evidence are still required by the harness.
