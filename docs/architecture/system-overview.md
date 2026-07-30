# System Overview

Long/Short Factory is a local-first pnpm monorepo. The Electron desktop app consists of a React/Vite renderer, a constrained preload IPC bridge, and an Electron main process. Main-process services use domain schemas and workflow rules, persist local state through SQLite repositories, access provider credentials through the OS keychain, and connect to 9Router through provider adapters. Supporting packages provide queueing, media planning, CapCut bridge protocol, and versioned prompts. See `docs/ARCHITECTURE.md` for the authoritative implementation detail.
