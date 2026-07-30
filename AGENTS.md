# Agent Routing

## Project

Long/Short Factory is a Windows-first, local Electron desktop MVP for creating structured, AI-assisted YouTube projects. It is a pnpm TypeScript monorepo; the desktop app uses Electron, React, and Vite, with local SQLite persistence and a Python CapCut bridge.

## Start Here

1. Work from a job file in `.harness/jobs/`; only one coding job may be active per worktree.
2. Read `docs/agent-harness/workflow.md`, `docs/agent-harness/definition-of-done.md`, the assigned role file in `agents/`, and the job JSON.
3. Read applicable product and architecture documents before changing code.
4. Do not work directly on `main`; use `agent/<job-id>` in an isolated worktree.

## Commands

```powershell
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
pnpm dev
pnpm dev:web
pnpm test:unit
pnpm lint
pnpm typecheck
pnpm --filter @lsf/desktop build
```

## Boundaries

- `apps/desktop/src/renderer`: React UI; it calls only typed preload APIs.
- `apps/desktop/src/preload`: IPC bridge between renderer and main process.
- `apps/desktop/src/main`: Electron orchestration, IPC validation, and app services.
- `packages/domain`: shared domain objects, validation, workflow rules, and state transitions.
- `packages/db`: SQLite, migrations, repositories, credential references, and logging.
- `packages/providers`: 9Router gateway and response parsing; never log secrets.
- `packages/generation-queue`, `packages/media`, `packages/capcut`, and `packages/prompts`: queueing, media, bridge protocol, and versioned prompts.

## Required Rules

- Existing business rules and accepted criteria are authoritative. Record unknown requirements in `docs/product/open-questions.md`; never guess or weaken criteria.
- Do not change acceptance criteria to make implementation pass, remove failing tests, or modify unrelated files.
- Builder implements only assigned `allowedPaths` and cannot approve its own work. Reviewer does not modify implementation. QA reruns verification independently. Integrator does not silently repair failed code.
- A job is not complete from an explanation: it requires executable verification evidence. Agents may not skip `active` directly to `merged`.
- Session start: read state, lock the job, inspect status and relevant docs. Session end: update job/review/QA evidence and `.harness/state.json`, remove the lock, and hand off remaining risks.

## State And Escalation

- Jobs: `.harness/jobs/`; reviews: `.harness/reviews/`; QA evidence: `.harness/evaluations/`; handoffs: `.harness/handoffs/`; locks: `.harness/locks/`; state: `.harness/state.json`; progress: `PROGRESS.md`.
- Escalate to a human under the conditions in `docs/agent-harness/human-escalation.md`, including ambiguous requirements, security/privacy concerns, unavoidable scope expansion, failed baseline verification, or merge conflicts.
