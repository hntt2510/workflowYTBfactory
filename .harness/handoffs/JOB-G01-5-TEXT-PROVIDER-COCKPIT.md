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

## Review Round 2 completion

- Migrated all active G01 text implementations to `TextProvider.generateStructured()`: Idea Lab, Competitor DNA, Outline, Reference Segmentation, Opportunity Map, Script, Scene Plan, Prompt Preparation automatic batching, and Transcript Cleaning structured chunks.
- Prompt Preparation manual mode remains local and does not resolve or call a text provider.
- Transcript Cleaning retains its chunking, retries, resume behavior, progress callbacks, token/time limits, merge logic, warnings, and domain validation; only provider structured parsing moved to the shared abstraction.
- Centralized fenced JSON extraction, response-envelope normalization, JSON parsing, and schema validation in `@lsf/providers`; stage-specific normalization and content validation remain in the relevant domain service.
- Retained a test-only legacy text-client adapter that delegates parsing to the centralized provider parser, allowing existing response-text fixtures without reintroducing local service parsing.
- Full verification passed: `pnpm --filter @lsf/providers test`, `pnpm --filter @lsf/domain test`, `pnpm --filter @lsf/db test`, `pnpm --filter @lsf/desktop test`, `pnpm test:unit` (63 files, 398 tests), `pnpm typecheck`, `pnpm lint`, `pnpm --filter @lsf/desktop build`, and `git diff --check`. The desktop build has only Vite's existing bundle-size warning.
- Structured-output audit across all nine active G01 services found zero `JSON.parse`, `safeParse`, `generateText`, or `createResponseText` calls. Therefore `ACTIVE_STRUCTURED_LOCAL_PARSE = 0`.
- Live Cockpit smoke remains unrun because no Cockpit credential was provided to this worktree.

## Review focus

- Verify no canonical G01 stage service imports `NineRouterClient`.
- Verify Cockpit credentials are never sent to renderer responses or logs.
- Verify legacy 9Router image/TTS references remain disconnected from the `preproduction` workflow contract.

## Remaining external work

- Independent reviewer and QA evidence are required before integration.
- Live Cockpit smoke was not run because no user credential was provided to the worktree.
