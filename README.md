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

## CapCut And FFmpeg

Set `CAPCUT_DRAFT_DIR` to your CapCut drafts folder. The current MVP writes a versioned draft manifest through the Python bridge; `pycapcut` operations are isolated behind `CapCutDraftAdapter`.

Set `FFMPEG_PATH` and `FFPROBE_PATH` if they are not on PATH.

## Tests

```powershell
pnpm test:unit
pnpm typecheck
```

Targeted coverage currently includes profile routing, 30 FPS timecode conversion, queue concurrency/retry behavior, and 9Router response parsing.

## Windows Packaging

Packaging is not wired yet. The intended path is Electron Builder after the vertical slice stabilizes.

## Common Failures

- `pnpm` missing: run `corepack enable`.
- Model list fails: verify 9Router is running and the base URL ends in `/v1`.
- CapCut export fails: verify `CAPCUT_DRAFT_DIR` and Python 3.11.
- Preview fails: verify FFmpeg is installed and callable from PowerShell.

