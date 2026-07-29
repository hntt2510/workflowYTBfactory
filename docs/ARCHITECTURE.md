# Architecture

Long/Short Factory is a local-first monorepo.

- `apps/desktop`: Electron, preload IPC, React/Vite renderer.
- `packages/domain`: channel profiles, routing, projects, pipeline stages, ideas, scripts, scenes, shots, timelines.
- `packages/providers`: 9Router gateway and safe response parsing.
- `packages/generation-queue`: persistent async jobs, five-worker image concurrency, retries.
- `packages/db`: SQLite connection, migrations, project repository, provider credential references, structured log redaction.
- `packages/prompts`: versioned prompt templates.
- `packages/media`: asset checks and FFmpeg preview command planning.
- `packages/capcut`: versioned CapCut adapter plus Python bridge protocol.

Renderer code only calls preload APIs. Electron main validates project and provider IPC payloads with shared Zod schemas from `packages/domain`.

On startup, the main process opens `<WORKSPACE_ROOT>/long-short-factory.sqlite`, enables WAL and foreign keys, runs migrations, seeds channel profiles, and wires `ProjectRepository` for create/load/list/update/delete. Project aggregates are persisted transactionally across project, idea, claim, script section, scene, shot, timeline, job, asset metadata, settings, approval, and credential-reference tables.

Provider secrets stay out of renderer state and SQLite. The main process uses `keytar` for OS keychain storage; `LSF_DEV_MEMORY_KEYCHAIN=1` is the explicit development fallback.

Still not production-ready in Batch 1: real 9Router image execution, asset download/decode/hash assignment, FFmpeg preview rendering, and editable CapCut draft generation.

The renderer now uses a dark admin shell with hash-backed route state, typed preload client functions, reusable UI primitives, and explicit unavailable/demo states. Active UI controls are limited to real preload APIs: bootstrap, route topic, create/load/list/delete project, provider credential save/presence/delete, and the labeled mock queue simulation.
