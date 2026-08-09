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

## Final UI discoverability and provider cleanup

- Replaced the disconnected navigation arrays with one `routeRegistry`. It registers all 30 reachable `RouteId` values, their Vietnamese audit label, sidebar group, project requirement, visibility, and legacy flag. The sidebar is derived exclusively from this registry and scrolls while preserving collapsed mode.
- Every route is visible during the audit. Project-required routes remain visible while disabled and explain that a project must be opened first. The `new-project` advanced wizard is now separately addressable instead of being silently canonicalized to `create`.
- Added direct `Text Provider / Cockpit` sidebar navigation and an `AI / Text Provider` Settings card with Cockpit state plus `Mở cài đặt Text Provider` navigation.
- Providers now exposes only actionable Cockpit text configuration. The old image certification/action and provider setup cards are removed from creator UI; manual GG Lab image work is described as the active path. CapCut and FFmpeg Settings cards are marked legacy/not used by the current pre-production workflow.
- Added a browser-preview warning that secure provider configuration, credential persistence, and connection testing require Electron.
- Made Export an explicit RouteScreen branch and added a clear safe unavailable screen rather than using Export as a catch-all. A preproduction Idea Lab view now tolerates legacy-only stage absence.
- Renderer-facing audit of `app`, `features`, `layouts`, and `routes`: zero `9Router`/`NineRouter` occurrences. Remaining names in `services/factoryClient.ts` and renderer API types are browser-fallback/type compatibility only and do not render creator-facing text or controls.
- Electron click-through executed against the local dev app: audited all 30 sidebar routes with and without a selected project, confirmed every enabled item changed to its matching hash and no click left a blank app; opened Cockpit from both sidebar and Settings; returned Home and reloaded with all 30 sidebar items still present. Browser control used an Electron remote-debug session; no Cockpit credential was entered or tested.
- Final verification passed: all job commands; `pnpm test:unit` reported 63 files / 396 tests. Desktop build emitted only Vite's bundle-size warning.

## Remaining external work

- Independent reviewer and QA evidence are required before integration.
- Live Cockpit smoke was not run because no user credential was provided to the worktree.
