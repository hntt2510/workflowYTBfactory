# JOB-G01-5-TEXT-PROVIDER-COCKPIT builder handoff

## Summary

- Added provider-neutral `TextProvider` and Cockpit OpenAI-compatible adapter for `/v1/models` and `/v1/responses`.
- Added Cockpit credential/model/capability IPC and creator-facing settings; secrets remain in the existing keychain store.
- Migrated active G01 text implementations: Transcript Cleaning, Reference Segmentation, Competitor DNA, Opportunity Map, Idea Lab, Outline, Script, Scene Plan, and Prompt Preparation.
- Kept 9Router code only for legacy image/TTS/asset/research compatibility paths outside the canonical G01 registry.

## Builder verification

- `corepack pnpm exec vitest run packages/providers/test/cockpitTextProvider.test.ts` — 15 passed.
- `corepack pnpm test:unit` — 63 files, 397 tests passed.
- `corepack pnpm typecheck` — passed.
- `corepack pnpm lint` — passed.
- `corepack pnpm --filter @lsf/desktop build` — passed; Vite reported only its bundle-size warning.
- `git diff --check` — passed.

## Review focus

- Verify no canonical G01 stage service imports `NineRouterClient`.
- Verify Cockpit credentials are never sent to renderer responses or logs.
- Verify legacy 9Router image/TTS references remain disconnected from the `preproduction` workflow contract.

## Remaining external work

- Independent reviewer and QA evidence are required before integration.
- Live Cockpit smoke was not run because no user credential was provided to the worktree.
