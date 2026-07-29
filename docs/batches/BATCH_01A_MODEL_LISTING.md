# Batch 01A: 9Router Model Listing

## Scope

Batch 01A implements saved credential presence, main-process-only credential resolution, `GET /models`, sanitized model IDs, and renderer model-list states.

Out of scope: selected model persistence, generation calls, capability inference, queues, assets, FFmpeg, CapCut, script generation, and Idea Lab generation.

## Security Guarantees

- Raw API keys are stored only in the OS keychain.
- SQLite stores provider config and credential references, not raw secrets.
- The raw 9Router key is resolved only in Electron main-process service logic.
- IPC, preload, renderer state, diagnostics, logs, and UI receive only sanitized status, message, and model IDs.
- Model listing calls only `GET <baseUrl>/models` with a 10 second timeout.

## Status Mapping

- `models_discovered`: HTTP 200 with at least one sanitized model ID.
- `empty_model_list`: HTTP 200 with no model IDs.
- `unauthorized`: missing credential, HTTP 401, or HTTP 403.
- `endpoint_not_found`: HTTP 404.
- `rate_limited`: HTTP 429.
- `server_error`: HTTP 500-599.
- `timeout`: aborted after 10 seconds.
- `network_error`: DNS, connection, TLS, malformed JSON, or unknown fetch failure.

## Verification

Automated checks:

- `corepack pnpm lint` - passed.
- `corepack pnpm typecheck` - passed.
- `corepack pnpm test` - passed, 9 files / 39 tests.
- `corepack pnpm --filter @lsf/desktop build` - passed.

Manual Electron runtime evidence required before claiming production completion:

1. Save the 9Router credential.
2. Restart Electron.
3. Confirm credential status remains saved.
4. Click Refresh models.
5. Confirm models appear or a precise model-list status appears.
6. Confirm no generation request is sent.
7. Confirm no API key appears in DevTools, logs, SQLite, diagnostics, UI, or IPC return values.

## Manual Evidence

Not captured in this document yet. Electron must still be run against the real saved 9Router credential to confirm restart persistence, Refresh models behavior, absence of generation calls, and absence of API key leakage in DevTools, logs, SQLite, diagnostics, UI, and IPC return values.
