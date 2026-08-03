# VOX Simple Flow V1 Implementation Report

Date: 2026-08-03
Branch: `chore/setup-agent-harness`

## Changed architecture

- Kept the existing Electron main process, typed preload bridge, workflow stages, StageRuns, artifacts, SQLite project repository, FFmpeg renderer, voice services, and CapCut bridge.
- Added a bounded Scene Review revision route in the main process. Prompt, direction, scene type, and scene removal actions create immutable stage artifacts and record user approval metadata.
- Added safe workspace media URLs for reviewable image assets. The renderer cannot choose arbitrary filesystem paths.
- Packaging now copies the approved preview into a workspace-relative final MP4 and records that path in the reviewed manifest.
- CapCut Draft is an explicit optional export action; approved QA and production artifacts are sufficient for Packaging Export.

## Reused services

- `ProductionOrchestrator` for preparation, selective scene retry, voice, and preview sequencing.
- `WorkflowRunStore` and `ProjectRepository` for immutable revisions, approval metadata, stale downstream artifacts, and restart persistence.
- Existing image acquisition, manual image import, voice generation, subtitle preparation, FFmpeg preview, deterministic QA, and CapCut bridge services.

## New simplified routes

- Primary `Scene Review` now exposes scene previews, narration, duration, VOX scene type, generation prompt, voice segment status, asset status, prompt editing, direction editing, scene regeneration, replacement upload, scene approval, and removal.
- Existing detailed Visuals and internal workflow screens remain available as advanced controls.
- Renderer-side Semi-automatic execution runs QA and Packaging Export after final-preview approval; CapCut Draft remains an optional manual export.

## Orchestrator behavior

- Scene regeneration sends only the selected `sceneId` to the trusted main-process route.
- Revisions keep unchanged scene assets in the acquisition artifact when the selected scene is regenerated.
- Prompt, direction, type, and removal revisions stale downstream media, preview, and export stages while preserving upstream content and idea artifacts.

## VOX style skill

- The existing `vox-documentary` style profile remains the only V1 style.
- Important Vietnamese text stays in the local subtitle/compositing path; generated visual prompts do not require models to draw Vietnamese typography.
- Simple Create derives its language picker from stored channel-profile and TTS configuration, including the configured voice locale when present.

## Voice integration

- Scene Review reads status from the existing persisted voice-generation segments.
- No new provider or paid fallback was added. Existing configured voices remain the source of truth.

## Automated test result

- Focused checks: 49 tests passed across IPC schemas, Semi-automatic flow, and packaging verifier suites.
- `corepack pnpm typecheck`: passed.
- `git diff --check`: passed.
- `node --check scripts/verify-electron-ui.cjs`: passed.

## Runtime result

- Existing Main Happy Path evidence is recorded in `docs/main-flow/MAIN_HAPPY_PATH_REPORT.md` and `.tmp-main-flow-runtime/full-path-20260802/`.
- `$env:LSF_UI_MODES='vox-simple-flow'; node scripts/verify-electron-ui.cjs` passed and created `VOX Simple Flow Test` configuration with Topic, Vietnamese, `45-60 seconds`, `16:9`, `vox-documentary`, `vi-VN-HoaiMyNeural`, and `1080p` persisted in SQLite.
- The isolated runtime reached the Scene Review, Final Preview, and Export screens, but preparation stopped at `idea-lab` with the safe reason `A verified text-model certification is required before Idea Lab can run.` Scene and preview artifacts were therefore empty.
- Final MP4 verification: not reached; no final export completion is claimed.

## Known blockers

- Complete the provider-certified runtime path from Idea Lab through scene media, voice, subtitles, preview, and final MP4 export.
- Harness-wide JSON validation remains blocked by the pre-existing `.harness/jobs/JOB-SEMI-AUTOMATIC-STAGES.json` missing `businessContext`.
- Run independent Reviewer and QA harness gates after the builder commit.

## Manual user test

Pending: create `VOX Simple Flow Test`, edit one prompt/direction, regenerate exactly one scene, approve the scene set, review the real preview, and approve the exported final MP4.
