# Long/Short Factory

Windows-first local desktop MVP for building faceless AI-assisted YouTube projects from topic to structured script, shot plan, image queue, timeline, and CapCut draft manifest.

## Prerequisites

- Windows 10/11
- Node.js 22+
- pnpm via Corepack: `corepack enable`
- Python 3.11 for the CapCut bridge
- FFmpeg/FFprobe on PATH
- Optional: CapCut desktop and a tested `pycapcut` install

## Setup

```powershell
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
pnpm dev
```

The desktop dev script pins Vite to `127.0.0.1:5173` and launches Electron with `NODE_OPTIONS="--import tsx"`. For local credential testing without the OS keychain, run it with `LSF_DEV_MEMORY_KEYCHAIN=1`.

Web-only development:

```powershell
pnpm dev:web
```

## CodeGraph

```powershell
irm https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.ps1 | iex
codegraph install
codegraph init
codegraph status
```

`.codegraph/` is ignored and is only for development intelligence.

## 9Router

Copy `.env.example` to `.env`, then set:

```env
NINE_ROUTER_BASE_URL=http://127.0.0.1:20128/v1
NINE_ROUTER_API_KEY=...
NINE_ROUTER_TEXT_MODEL=...
NINE_ROUTER_IMAGE_MODEL=...
```

The app treats 9Router as an OpenAI-compatible gateway. It discovers models with `GET /v1/models` when available and never logs secrets.

Provider API keys are saved through the OS keychain via `keytar`; SQLite stores only the provider id, credential reference, base URL, model ids, and non-secret settings. Set `LSF_DEV_MEMORY_KEYCHAIN=1` only for explicit local development fallback.

## Database, Migrations, And Recovery

The desktop main process creates a SQLite database at:

```text
<WORKSPACE_ROOT>/long-short-factory.sqlite
```

If `WORKSPACE_ROOT` is unset, it uses `workspace/` under the current process directory. Startup enables WAL mode and foreign keys, then runs migrations from `packages/db/src/schema.ts`. Current migration list:

- `001_batch1_persistence`

Project saves are transactional. If a save fails, the transaction rolls back and the prior project state remains unchanged. For recovery, close the app, copy the SQLite file plus any `-wal`/`-shm` sidecars, and restore them together. Deleting a project removes database rows only; it does not delete unrelated workspace files.

## CapCut And FFmpeg

Set `CAPCUT_DRAFT_DIR` to your CapCut drafts folder. The current MVP writes a versioned draft manifest through the Python bridge; `pycapcut` operations are isolated behind `CapCutDraftAdapter`.

Set `FFMPEG_PATH` and `FFPROBE_PATH` if they are not on PATH.

## Tests

```powershell
pnpm test:unit
pnpm typecheck
```

Targeted coverage currently includes profile routing, 30 FPS timecode conversion, queue concurrency/retry behavior, 9Router response parsing, SQLite restart persistence, IPC schema validation, keychain-reference storage, log redaction, and renderer navigation metadata.

## UI

The desktop renderer is a dark admin interface with hash-backed routes, a persistent shell, project dashboard, new project wizard, project workflow screens, queue monitor, provider settings, settings, and diagnostics. See `docs/UI_DESIGN_SYSTEM.md` and `docs/UI_WORKFLOWS.md`.

## Windows Packaging

Packaging is not wired yet. The intended path is Electron Builder after the vertical slice stabilizes.

## Common Failures

- `pnpm` missing: run `corepack enable`.
- Model list fails: verify 9Router is running and the base URL ends in `/v1`.
- CapCut export fails: verify `CAPCUT_DRAFT_DIR` and Python 3.11.
- Preview fails: verify FFmpeg is installed and callable from PowerShell.
