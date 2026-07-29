# Long/Short Factory Audit Report

## Executive Conclusion

**PROTOTYPE**

Evidence: the app builds and has a working fixture route from topic input to in-memory project objects. It does not have real project persistence, real 9Router generation, real asset storage, voice handling, FFmpeg rendering, project export/import, or editable CapCut draft generation.

## Summary Counts

| Status | Count |
|---|---:|
| VERIFIED_WORKING | 4 |
| PARTIALLY_WORKING | 7 |
| MOCK_ONLY | 3 |
| PLACEHOLDER | 5 |
| DISCONNECTED | 8 |
| BROKEN | 1 |
| MISSING | 14 |
| NOT_TESTED | 6 |

| Severity | Count |
|---|---:|
| P0 | 0 |
| P1 | 9 |
| P2 | 12 |
| P3 | 3 |

## Real Workflow

```text
App.tsx Route button
-> preload routeTopic
-> main.ts IPC route-topic
-> routeChannelProfile
```

```text
App.tsx "Tao vertical slice" button
-> preload fixtureProject
-> main.ts IPC fixture-project
-> createFixtureProject
-> routeChannelProfile
-> generateIdeaLab
-> createStarterClaims
-> createStarterScript
-> scenesFromScript
-> shotsFromScenes
-> assembleTimeline
-> in-memory FactoryProject returned to renderer
```

Disconnected paths:

```text
mockImageBatch preload API exists, renderer calls it only from the labeled queue simulation
NineRouterClient exists, no runtime caller
sqliteBootstrapSql exists, no runtime caller
hashFile/safeAssetFilename exist, no runtime caller
planFfmpegPreviewCommand exists, no runtime caller
ManifestOnlyCapCutAdapter exists, no runtime caller
python/capcut_bridge/bridge.py exists, no runtime caller
```

## Critical Findings

| ID | Sev | Finding | Evidence | User impact | Recommended fix | Blast radius |
|---|---|---|---|---|---|---|
| F-001 | P1 | No real project persistence | `createFixtureProject` returns object only; `sqliteBootstrapSql` has no callers | Projects vanish on restart | Add DB connection, migrations, project repository, IPC save/load | `packages/db`, `packages/domain`, `apps/desktop/src/main`, tests |
| F-002 | P1 | CapCut export is not an editable draft | `ManifestOnlyCapCutAdapter` only returns manifest; Python bridge only writes JSON | Acceptance criterion fails | Implement sidecar invocation and real pycapcut draft writer | `packages/capcut`, `python/capcut_bridge`, timeline/media validation |
| F-003 | P1 | 9Router image generation is not wired | `NineRouterClient` only lists/parses; no request submission or callers | No real images can be generated | Add provider execution methods and queue worker integration | `packages/providers`, `generation-queue`, settings UI, assets |
| F-004 | P1 | Asset pipeline missing | `hashFile`/`safeAssetFilename` uncalled; queue returns fake asset IDs | Generated media not saved or assigned | Implement download/decode/save/hash/DB/shot assignment | `packages/media`, `packages/db`, queue worker, UI |
| F-005 | P1 | FFmpeg preview is placeholder and disconnected | command planner generates black video only; no caller | No usable preview render | Build preview renderer with inputs/audio/subtitles and IPC | `packages/media`, timeline, main IPC, QA |
| F-006 | P1 | UI screens are mostly labels/buttons without handlers | Sidebar buttons map to static buttons only | User cannot access required workflows | Add routing/screens or remove claims | `App.tsx`, future UI state, IPC |
| F-007 | P1 | Script/scene/shot generation is canned | `createStarterScript`, `scenesFromScript`, `shotsFromScenes` use fixed templates | No production-quality generation | Wire prompt/provider pipeline and persisted review states | domain, prompts, providers, persistence |
| F-008 | P1 | Voice/audio pipeline missing | No voice package, provider, UI, or timeline audio path | Cannot produce narrated video | Add manual import first, then provider adapters | media, timeline, UI, DB |
| F-009 | P1 | Export/import missing | No project ZIP code or UI | Projects cannot be portable | Add manifest/asset zip import-export | DB, workspace layout, security |
| F-010 | P2 | Lint script is broken | `pnpm lint` scans `dist` and CJS preload without env config: 202 errors | CI/release gate unreliable | Ignore build outputs and configure Node/browser globals | eslint config |
| F-011 | P2 | Queue persistence is JSON file only | `PersistentGenerationQueue` writes `workspace/queue.json` | Partial recovery, no transaction safety | Move jobs/attempts to SQLite or durable journal | queue, DB, restart tests |
| F-012 | P2 | Queue recovery is shallow | running jobs reset to queued, no uncertain-submission reconciliation | Duplicate paid requests possible once real provider is wired | Add provider request IDs/idempotency reconciliation | queue, provider adapters |
| F-013 | P2 | Prompt templates are placeholders | one-line text files; no Zod schemas/repair/storage | AI output cannot be trusted | Add schemas, validation, prompt hash, repair attempt | prompts, providers, persistence |
| F-014 | P2 | Secrets are not stored securely | `.env` only documented; no keychain flow | Credential UX/security incomplete | Implement OS keychain references and redacted diagnostics | settings UI, main process, providers |
| F-015 | P2 | CapCut environment unavailable/incomplete | pycapcut not installed; CapCut folder found but not version-verified | CapCut cannot be verified | Add compatibility probe and fixture tests | capcut docs, sidecar, tests |

## Feature Status

| Feature | Status | Evidence |
|---|---|---|
| Channel profiles | PARTIALLY_WORKING | full seed objects in `seedProfiles.ts`; no import/export/edit UI |
| Router | VERIFIED_WORKING | acceptance samples route correctly via executed TS probe and unit tests |
| Projects | PLACEHOLDER | in-memory fixture only |
| References/transcripts | MISSING | no runtime code |
| Competitor DNA | PLACEHOLDER | prompt file only |
| Idea Lab | MOCK_ONLY | deterministic generated sample ideas |
| Research/claims | MOCK_ONLY | one starter claim with blocked state |
| Scripts | MOCK_ONLY | three canned script sections |
| Scenes | PARTIALLY_WORKING | derived from canned script, frame durations |
| Shots | PARTIALLY_WORKING | derived from scenes, stable IDs |
| Continuity | MISSING | fields exist only |
| Visual router | DISCONNECTED | functions exist; no production caller |
| Stock sourcing | MISSING | no providers |
| 9Router | PARTIALLY_WORKING | model listing/parser only; no image call |
| Queue | PARTIALLY_WORKING | real queue snapshot plus labeled mock simulation; tests cover 5 concurrent jobs, retry, restart JSON recovery |
| Assets | DISCONNECTED | utility functions only |
| Voice | MISSING | no implementation |
| Timeline | PARTIALLY_WORKING | primary visual only |
| FFmpeg | PLACEHOLDER | black-video command planner only |
| CapCut | PLACEHOLDER | manifest-only adapter; bridge writes JSON |
| QA | MISSING | no QA engine |
| Export/import | MISSING | no code |
| Security | PARTIALLY_WORKING | contextIsolation/nodeIntegration set; IPC unvalidated and no keychain |
| Logging | MISSING | no logging system |
| Cost tracking | MISSING | no implementation |

## Release Recommendation

**INTERNAL_TESTING_ONLY**

Conditions: use only as a local architecture prototype. Do not use for paid generation or real CapCut production until persistence, provider execution, asset storage, and CapCut export are implemented and tested.

## Prioritized Repair Plan

| Batch | Fix | Complexity |
|---|---|---|
| 1 - P0/P1 data integrity | Add real project persistence and migrations | medium |
| 1 - P0/P1 data integrity | Add validated IPC schemas and path validation | medium |
| 2 - End-to-end workflow | Save/load project, scripts, scenes, shots, timeline | medium |
| 2 - End-to-end workflow | Wire asset storage and shot assignment | large |
| 3 - Provider/queue | Implement real 9Router image requests and download parsing | medium |
| 3 - Provider/queue | Add provider/model semaphores and idempotency reconciliation | medium |
| 4 - Media/CapCut | Implement FFmpeg preview from actual assets/audio/subtitles | large |
| 4 - Media/CapCut | Implement pycapcut sidecar fixture export | large |
| 5 - UX/quality | Replace static sidebar with real workflow screens | large |
| 5 - UX/quality | Add prompt schemas, repair, source/claim QA | large |
