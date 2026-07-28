# Domain Model

Structured objects are the source of truth:

- Channel profiles route every downstream stage.
- Projects contain stages with status and approval.
- Ideas, claims, scripts, scenes, shots, assets, jobs, and timeline items have stable IDs.
- Time is stored as integer frames. Human timecode is derived.
- Large media files live under `workspace/projects/<project-id>/`; SQLite stores metadata and relative paths.

The SQLite schema is declared in `packages/db/src/schema.ts`.

