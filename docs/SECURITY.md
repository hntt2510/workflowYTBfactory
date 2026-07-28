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

