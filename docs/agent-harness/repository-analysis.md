# Repository Analysis

## Confirmed Facts

- Repository: Long/Short Factory, a Windows-first local desktop MVP for AI-assisted YouTube project production.
- Primary implementation: TypeScript in a pnpm 9.15.4 workspace with Node.js 22+ documented as a prerequisite.
- Application framework: Electron main/preload processes, React 19 renderer, and Vite 6.
- Package manager: pnpm, declared by root `package.json` and `pnpm-lock.yaml`.
- Root commands: `pnpm dev`, `pnpm dev:web`, `pnpm test:unit`, `pnpm lint`, `pnpm typecheck`, and `pnpm --filter @lsf/desktop build`.
- Tests use Vitest; lint uses ESLint; TypeScript type checking uses `tsconfig.check.json`.
- CI configuration was not found under `.github/` during setup inspection.
- Major modules: `apps/desktop` (Electron/React), `packages/domain` (rules and schemas), `packages/db` (SQLite), `packages/providers` (9Router), `packages/generation-queue`, `packages/media`, `packages/capcut`, and `packages/prompts`.
- Data boundary: renderer uses preload APIs; main process validates IPC through shared Zod schemas. Provider secrets use the OS keychain and must not be stored in renderer state or SQLite.
- Python is present for `python/capcut_bridge`; `OmniVoice` is a separate Python package with its own `pyproject.toml` and lockfile.
- Current branch at inspection: `chore/setup-agent-harness`. The working tree contained an unrelated modification in `OmniVoice`; it is preserved.

## Assumptions

- `main` is the intended integration branch because it is the only named base branch besides the setup branch.
- Repository verification should use the root commands above; no distinct CI-only command is available.
- Harness jobs will target source areas inside this monorepo, while generated workspaces, virtual environments, `node_modules`, and `OmniVoice` remain out of normal product-job scope unless explicitly assigned.
