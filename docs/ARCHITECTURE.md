# Architecture

Long/Short Factory is a local-first monorepo.

- `apps/desktop`: Electron, preload IPC, React/Vite renderer.
- `packages/domain`: channel profiles, routing, projects, pipeline stages, ideas, scripts, scenes, shots, timelines.
- `packages/providers`: 9Router gateway and safe response parsing.
- `packages/generation-queue`: persistent async jobs, five-worker image concurrency, retries.
- `packages/db`: SQLite schema source.
- `packages/prompts`: versioned prompt templates.
- `packages/media`: asset checks and FFmpeg preview command planning.
- `packages/capcut`: versioned CapCut adapter plus Python bridge protocol.

Renderer code only calls typed preload APIs. Provider credentials stay in main-process configuration or OS keychain integration points.

