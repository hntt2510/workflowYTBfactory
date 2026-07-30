# Batch 01B: 9Router Text Model Certification

## Scope

Batch 01B certifies exactly one selected 9Router text model by running two explicit, user-confirmed provider requests against `/v1/responses`.

Out of scope: Idea Lab, competitor analysis, transcript cleaning, script writing, image/video/TTS/STT execution, queues, assets, FFmpeg, CapCut, and workflow stage execution.

## Certification

- Test A sends `Reply exactly: MODEL_OK` and passes only when normalized output is exactly `MODEL_OK`.
- Test B requests `{"status":"MODEL_OK"}` and validates direct `JSON.parse` output with a strict Zod schema.
- Code fences, extra fields, wrong values, empty output, and explanatory text fail.
- Test B is skipped after credential, transport, HTTP, timeout, network, or unsupported response-shape failure in Test A.
- Endpoint strategy is fixed to `/v1/responses`.
- Timeout is fixed to 30 seconds per request.

## Security

- Raw API keys remain main-process-only.
- Renderer, preload, IPC responses, SQLite certification records, and logs receive only safe metadata.
- Certification records may include bounded redacted previews, maximum 2,000 characters.
- Failed certification does not delete credentials, selected model configuration, or certification history.
- Text certification does not verify Image, Video, TTS, or STT.

## Stale Rules

Text certification becomes stale when the selected text model, 9Router base URL, credential version, endpoint strategy, or certification implementation version changes. Image, Video, TTS, and STT model changes do not stale text certification.

## Automated Verification

Run after implementation:

- `corepack pnpm lint` - passed.
- `corepack pnpm typecheck` - passed.
- `corepack pnpm test` - passed, 10 files / 58 tests.
- `corepack pnpm --filter @lsf/desktop build` - passed.

## Manual Electron Evidence

Electron launch smoke was attempted with `LSF_DEV_MEMORY_KEYCHAIN=1` and a temporary workspace. The app launched, but the existing E2E flow stopped at setup gating because the temporary workspace had no saved 9Router/Pexels credentials.

Real certification acceptance is not captured yet. Electron must still be run with a real saved 9Router credential and selected text model `cx/gpt-5.5` to confirm the two real requests, restart persistence, stale behavior after text model change, and absence of API key leakage in UI, DevTools, IPC responses, logs, diagnostics, and SQLite.
