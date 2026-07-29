# Domain Model

Structured objects are the source of truth:

- Channel profiles route every downstream stage.
- Projects contain stages with status and approval.
- Ideas, claims, scripts, scenes, shots, assets, jobs, and timeline items have stable IDs.
- Time is stored as integer frames. Human timecode is derived.
- Large media files live under `workspace/projects/<project-id>/`; SQLite stores metadata and relative paths.

The SQLite schema is declared in `packages/db/src/schema.ts`; migration `001_batch1_persistence` creates the Batch 1 persistence tables and `schema_migrations`.

`ProjectRepository` preserves project, scene, shot, and timeline item IDs across save/load. It does not rely on array positions as IDs. Scene and shot timing remains integer-frame based and is reloaded from persisted payloads and indexed columns.

Current persisted minimum:

- channel profiles, projects, project settings;
- ideas, claims, script versions, script sections;
- scenes, shots, timeline tracks, timeline items;
- approvals, generation jobs, job attempts;
- asset metadata, app settings, provider credential references.

Large media blobs are intentionally outside SQLite.
