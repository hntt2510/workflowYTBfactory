# JOB-VOX-FULL-SIMPLE-FLOW-V1 Handoff

- Status: `review_required`
- Implemented: seeded Electron smoke support and a fail-closed exact-flow driver; the driver now selects an idea, retries one scene, approves assets/scenes, approves Final Preview, and verifies final MP4 when a seeded runtime is supplied.
- Focused verification: `node --check scripts/verify-electron-ui.cjs`, `corepack pnpm exec vitest run apps/desktop/src/main/productionOrchestrator.test.ts`, `corepack pnpm typecheck`, and `git diff --check` passed.
- Runtime result: seeded workspace reached six Topic-mode idea candidates, but the renderer disabled every `Approve this idea` control because eligibility incorrectly required an Opportunity Map in Topic Mode.
- Required follow-up: fix the mode-specific Idea Lab eligibility in a separate domain-scoped job, then rerun this exact smoke.
- Reviewer/QA: not yet recorded; builder did not self-approve.
