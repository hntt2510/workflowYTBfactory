# JOB-G01-SCOPE-RESET QA evidence

QA branch: `qa/job-g01-scope-reset`

Evaluated builder commit: `d0b04dc6e5671a262f6dc516d1093d7adb13fa4b`

Result: PASS

- `corepack pnpm install --frozen-lockfile` — PASS.
- `corepack pnpm test:unit` — PASS: 62 files, 382 tests.
- `corepack pnpm typecheck` — PASS.
- `corepack pnpm lint` — PASS.
- `corepack pnpm --filter @lsf/desktop build` — PASS.
- `git diff --check` — PASS.
- `LSF_UI_MODES=workflow-contract,reference-restart,verify node scripts/verify-electron-ui.cjs` — PASS.

Electron reports passed for `workflow-contract`, `reference-restart`, and `verify` using an isolated temporary SQLite workspace. No QA regression found.
