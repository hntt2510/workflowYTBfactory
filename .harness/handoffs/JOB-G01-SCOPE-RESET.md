# G01 builder handoff

Branch: `agent/job-g01-scope-reset`

Implemented:

- Canonical 14-stage registry for the pre-production workflow with applicability, dependency, artifact, route, interaction, optional, and invalidation metadata.
- Topic, Existing Script, and Reference applicability and dynamic progress denominator/current-stage resolution.
- `preproduction` contract for IPC-created projects; missing contract loads as `legacy`.
- Separate legacy registry/normalization path preserving old stages and old production tests.
- Registry-driven primary routing with explicit legacy route compatibility.
- Creator overview stage-by-stage journey display and removal of default final preview/export actions.
- Focused G01 JSON fixtures and domain/database/routing tests.

Verification evidence:

- `corepack pnpm test:unit` — PASS, 62 files / 382 tests.
- `corepack pnpm typecheck` — PASS.
- `corepack pnpm lint` — PASS.
- `corepack pnpm --filter @lsf/desktop build` — PASS.
- `git diff --check` — PASS.
- `LSF_UI_MODES=workflow-contract,reference-restart,verify node scripts/verify-electron-ui.cjs` — PASS, exit 0.

Remaining gate: independent reviewer approval and independent QA pass. No G02 work started.
