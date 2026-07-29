# Requirements Traceability

| Requirement | Implementation location | Runtime path | Test evidence | Status | Severity |
|---|---|---|---|---|---|
| Windows app runs | `apps/desktop`, Electron/Vite | build only verified | `pnpm --filter @lsf/desktop build` passed | PARTIALLY_WORKING | P2 |
| Create project | `App.tsx`, `main.ts`, `pipeline.ts` | UI button -> IPC -> in-memory object | TS probe created fixture | PARTIALLY_WORKING | P1 |
| Auto-route profile | `router.ts`, `seedProfiles.ts` | UI/IPCs call router | unit tests + TS probe | VERIFIED_WORKING | P2 |
| Explicit profile override | `router.ts` | router input only | unit test | VERIFIED_WORKING | P3 |
| Seed full profiles | `seedProfiles.ts` | bootstrap returns profiles | code inspection | PARTIALLY_WORKING | P2 |
| Profile edit/duplicate/import/export | none | none | none | MISSING | P1 |
| Idea Lab 12 ideas | `ideaLab.ts` | fixture project only | TS probe shows 12 | MOCK_ONLY | P2 |
| Originality gate | prompt file only | none | none | PLACEHOLDER | P1 |
| Claim mapping | starter claim only | fixture project only | TS probe shows 1 claim | MOCK_ONLY | P1 |
| Script generation | `scriptEngine.ts` | fixture project only | canned sections | MOCK_ONLY | P1 |
| Scene generation | `scenesFromScript` | fixture project | TS probe shows 3 scenes | PARTIALLY_WORKING | P2 |
| Shot generation | `shotsFromScenes` | fixture project | TS probe shows 3 shots | PARTIALLY_WORKING | P2 |
| Frame-accurate timecode | `timecode.ts` | domain utilities | unit tests + TS probe | VERIFIED_WORKING | P2 |
| Continuity engine | types only | none | none | MISSING | P1 |
| Visual routing | `visualRouter.ts` | no caller | codegraph no production caller | DISCONNECTED | P2 |
| Stock providers | none | none | none | MISSING | P2 |
| 9Router model discovery | `NineRouterClient.listModels` | no UI caller | code inspection only | DISCONNECTED | P2 |
| 9Router image generation | parser only | none | parser unit tests only | MISSING | P1 |
| Five-worker image queue | `PersistentGenerationQueue` | renderer queue screen -> labeled `mock-image-batch` IPC | unit test proves 5 concurrent jobs | PARTIALLY_WORKING | P1 |
| Queue survives restart | JSON restore only | queue constructor | unit test | PARTIALLY_WORKING | P2 |
| 429 retry | `RateLimitError` | queue worker abstraction | unit test | PARTIALLY_WORKING | P2 |
| Asset save/hash/assign | `asset.ts` utilities only | none | none | DISCONNECTED | P1 |
| TTS/manual audio | none | none | none | MISSING | P1 |
| Timeline assembly | `timeline.ts` | fixture project | TS probe shows 3 items | PARTIALLY_WORKING | P2 |
| FFmpeg preview | `ffmpegPreview.ts` | no caller | none | PLACEHOLDER | P1 |
| CapCut editable draft | `ManifestOnlyCapCutAdapter`, bridge | no caller; manifest only | pycapcut absent | PLACEHOLDER | P1 |
| API key security | docs/redact helper | no settings/keychain | redaction unit test only | PARTIALLY_WORKING | P2 |
| Project export/import ZIP | none | none | none | MISSING | P1 |
| README setup | README | docs only | install/type/test/build evidence | PARTIALLY_WORKING | P3 |
| Audit docs | docs generated in this audit | n/a | this file set | VERIFIED_WORKING | P3 |
