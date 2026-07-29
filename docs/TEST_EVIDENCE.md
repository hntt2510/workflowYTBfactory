# Test Evidence

## Environment

| Item | Evidence |
|---|---|
| OS | Microsoft Windows NT 10.0.26200.0 |
| Node | v22.21.0 |
| pnpm | 9.15.4 via `corepack pnpm` |
| Python | 3.14.0 |
| FFmpeg | 8.1.1 full build |
| Electron | 43.2.0 |
| CapCut | `C:\Users\LEGION\AppData\Local\CapCut` exists; version not verified |
| pycapcut | not installed |
| Git | commit `0f4b549 first commit`; working tree contains Batch 1 changes |
| CodeGraph | up to date, 54 files, 450 nodes, 1,137 edges |

## Commands

| Command | Exit | Result |
|---|---:|---|
| `codegraph status` | 0 | index up to date, 54 files, 450 nodes, 1,137 edges |
| `corepack pnpm install` | 0 | dependencies installed; keytar installed |
| `corepack pnpm lint` | 0 | passed |
| `corepack pnpm typecheck` | 0 | passed |
| `corepack pnpm test` | 0 | 8 files, 24 tests passed |
| `corepack pnpm --filter @lsf/desktop build` | 0 | Vite renderer build passed |
| `corepack pnpm --filter @lsf/desktop dev` | timeout after startup | dev script now pins Vite to port 5173 and quotes `NODE_OPTIONS="--import tsx"`; command stayed running until the verifier timeout/cleanup path |
| `node scripts/capture-ui-screenshots.cjs` | 0 | renderer workflow drove dashboard -> wizard -> route -> create demo project -> project overview -> shots -> queue -> providers and captured screenshots |
| `node scripts/verify-electron-ui.cjs` | 0 | Electron automation created a project, verified provider model/settings fields, saved a provider credential without rendering the raw key, restarted, reopened the SQLite project at temp workspace `lsf-electron-ui-TGc9Sx`, and verified routed screens |
| `python -m pip show pycapcut` | 1 | package not found |

## Runtime/Trace Evidence

| Check | Evidence |
|---|---|
| Router samples | TS probe routed insurance, bible, viral-case inputs to expected profiles |
| Fixture project | TS probe created 12 ideas, 1 claim, 3 script sections, 3 scenes, 3 shots, 3 timeline items |
| Timecode | TS probe verified frames 0/29/30/89/90 and reverse conversion; unit tests pass |
| Queue concurrency | unit test `runs five image workers concurrently` passed |
| Queue restart | unit test `recovers queued jobs after restart` passed |
| Queue rate limit | unit test `retries rate limits with retry-after` passed |
| 9Router parsing | unit test parses URL, base64, data URI |
| FFmpeg output | not generated; command planner only |
| CapCut draft | not generated/opened; manifest-only code not called |
| SQLite database | generated at `<WORKSPACE_ROOT>/long-short-factory.sqlite` by Electron main; integration tests create fresh temp DBs |
| SQLite migrations | `001_batch1_persistence` fresh run and re-run tested |
| Restart persistence | integration test save/close/reopen/load verifies IDs, frames, relationships, and timeline items |
| Transaction rollback | integration test verifies broken scene save rolls back |
| Credential storage | mock keychain test verifies secret is absent from SQLite |
| IPC/path validation | schema tests reject invalid provider IDs, empty API keys, and path traversal |
| Renderer navigation | unit test verifies required workspace/project route metadata |
| UI screenshots | captured Dashboard, New Project Wizard, Project Overview, Shot Board, Production Queue, Provider Settings under `docs/screenshots/`; refreshed July 29, 2026 at 12:23 PM local time |
| Renderer workflow | screenshot script verifies route navigation and demo project flow through the rendered app |
| Electron runtime | automated Electron DOM verifier passes create and restart/reopen modes against a temp workspace, including Provider and Settings screen assertions |
| Preview MP4 | not generated |
| Project ZIP | not generated |

## Not Verified

- Manual app close/reopen interaction outside the automated Electron verifier.
- Real 9Router calls; no explicit paid-call approval and no production caller.
- Real CapCut draft opening; pycapcut absent and adapter is manifest-only.
- Python venv/pytest; `requirements.txt` and pytest files are missing.
- End-to-end acceptance slice; required downstream stages are missing/disconnected.
