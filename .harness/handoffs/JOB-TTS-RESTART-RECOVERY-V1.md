# JOB-TTS-RESTART-RECOVERY-V1 Handoff

- Status: `review_required`
- Commit: `18286c56` (`fix: make TTS restart recovery explicit`)
- Change: Running TTS jobs now recover as failed with safe interruption messages; unfinished segments remain explicitly retryable, successful segments remain intact, and retry clears the recovered job-level error.
- Startup behavior: Electron no longer runs queued TTS jobs during startup, so no provider-backed TTS call is made implicitly after restart.
- Verification: `corepack pnpm exec vitest run packages/db/test/persistence.test.ts apps/desktop/src/main/ttsJobService.test.ts` passed (50 tests); `corepack pnpm typecheck` passed; job JSON validation passed; startup auto-resume check passed; `git diff --check` passed.
- Runtime scope: No full Electron restart smoke or full repository gate was run; this was a bounded persistence/service fix per the job instructions.
- Reviewer/QA: not yet recorded; builder did not self-approve.
