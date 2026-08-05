# JOB-TTS-ATTENTION-PROPAGATION-V1 Handoff

- Status: `review_required`
- Commit: `e3c4c08b` (`fix: surface interrupted TTS attention`)
- Changed implementation: `apps/desktop/src/main/main.ts`, `packages/db/src/ttsJobStore.ts`.
- Changed test: only the new `listFailed()` assertions in `packages/db/test/persistence.test.ts`.
- Behavior: recovered interrupted TTS jobs now surface project-level Voice Generation `needs_attention` with a safe reason and an explicit retry action; retry restores the stage to `running` before the existing failed-segment retry.
- Verification: focused persistence/TTS tests passed; `corepack pnpm typecheck` passed; job JSON validation passed; `git diff --check` passed.
- Reviewer/QA: not yet recorded; builder did not self-approve.
- Remaining: the exact `VOX Simple Flow Test` runtime path still needs to be rerun; independent review and QA evidence are required by the harness.
