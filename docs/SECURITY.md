# Security

- Keep secrets out of renderer code.
- Store only credential references in SQLite.
- Redact authorization headers, API keys, cookies, OAuth tokens, and signed URLs in logs.
- Validate IPC payloads in the main process.
- Validate file paths and block traversal.
- Do not execute model-generated shell or Python code.
- Limit downloads by content type and size.
- Use MIME/signature checks before trusting extensions.
- Never commit `.env`, workspace media, exports, API keys, or `.codegraph/`.

## Batch 1 Status

- Electron keeps `contextIsolation = true` and `nodeIntegration = false`.
- Project/provider IPC requests are validated with shared Zod schemas in `packages/domain/src/ipcSchemas.ts`.
- No generic SQL, filesystem, or shell command IPC channel is exposed.
- 9Router credentials are stored through `keytar`; SQLite stores only `provider_credentials.credential_ref` and non-secret provider settings.
- `LSF_DEV_MEMORY_KEYCHAIN=1` is the only in-memory credential fallback and is labeled development-only.
- `JsonLogger` redacts authorization, API keys, token fields, cookies, and signed URL query parameters where practical.

Remaining risk: provider requests have not yet been wired to retrieve credentials in main because real image generation is deferred to Batch 2.
