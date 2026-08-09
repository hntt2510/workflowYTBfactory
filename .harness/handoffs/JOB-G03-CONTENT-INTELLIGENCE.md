# Builder handoff: JOB-G03-CONTENT-INTELLIGENCE

- Branch: `agent/job-g03-content-intelligence`
- Stacked base: `0b4e8143ec76bb1f82e1254f8e059cca8e26f2c4` verified as an ancestor.
- Scope: G03 Content Intelligence only. No new Director, image, voice, FFmpeg, CapCut, crawler, or web-search behavior was added.

## Completion audit

- [x] Topic flow has explicit six-candidate Idea Lab selection, Story Architecture, duration-aware Outline, structured Script versions, Script Review/Revision, and explicit Approved Script.
- [x] Reference flow keeps user-supplied reference metadata/transcript, chunked Transcript Cleaning progress, deterministic segmentation, evidence-backed Competitor DNA, and traceable Opportunity Map in one Research checkpoint.
- [x] Existing Script import remains local, skips Research/Idea, persists an imported script draft, and can be reviewed and explicitly approved.
- [x] Story Architecture separates narrative strategy from script prose; Outline stores target seconds, target words, and profile narration-rate assumption.
- [x] Idea Lab returns exactly six differentiated candidates with score explanations and production feasibility; no candidate is auto-selected.
- [x] Script edits and explicit revisions create new artifacts, stale review/downstream state, preserve source/parent lineage, and require review of the current version.
- [x] `approvedScript` is persisted through SQLite reload. Script Review can approve the current reviewable user draft without requiring pre-approval of that draft.
- [x] Content actions are registered in the G02 ActionRun registry, including Transcript Cleaning, Segmentation, Competitor DNA, Opportunity Map, Idea selection, Revision, and Script approval. Chunk progress is determinate only for real chunks; provider calls are indeterminate.
- [x] Active G03 structured generation uses `TextProvider.generateStructured()` with schemas. Audit found no active local JSON parse path or active `NineRouterClient` dependency in the G03 content services.
- [x] Research is rendered as one checkpoint with intake plus progressive analysis cards; legacy route aliases do not create a competing creator flow.

## Verification

- `pnpm --filter @lsf/providers test` — pass
- `pnpm --filter @lsf/domain test` — pass
- `pnpm --filter @lsf/db test` — pass
- `pnpm --filter @lsf/desktop test` — pass
- `pnpm test:unit` — pass (68 files, 415 tests)
- `pnpm typecheck` — pass
- `pnpm lint` — pass
- `pnpm --filter @lsf/desktop build` — pass (existing Vite chunk-size warning only)
- `git diff --check` — pass
- `LSF_UI_MODES=g03-content-intelligence node scripts/verify-electron-ui.cjs` — pass

The Electron fixture uses only local persisted mock artifacts; Cockpit is not called and no credential is stored or exposed. It verifies Topic selection → fixture Story/Outline/Script → creator edit → review → explicit approval → reload persistence; Reference Research cards with determinate `22/22` transcript progress and Opportunity Map context; and Existing Script review/approval without forced Idea or Research.

No local Cockpit credential was available for a paid live smoke request, so that optional smoke was not executed. Deterministic provider tests, full unit tests, and the isolated Electron fixture passed.
