# VOX Simple Flow V1 Implementation Report

Date: 2026-08-03
Branch: `chore/setup-agent-harness`

## Changed architecture

- Kept the existing Electron main process, typed preload bridge, workflow stages, StageRuns, artifacts, SQLite project repository, FFmpeg renderer, voice services, and CapCut bridge.
- Added a bounded Scene Review revision route in the main process. Prompt, direction, scene type, and scene removal actions create immutable stage artifacts and record user approval metadata.
- Added safe workspace media URLs for reviewable image assets. The renderer cannot choose arbitrary filesystem paths.
- Packaging now copies the approved preview into a workspace-relative final MP4 and records that path in the reviewed manifest.

## Reused services

- `ProductionOrchestrator` for preparation, selective scene retry, voice, and preview sequencing.
- `WorkflowRunStore` and `ProjectRepository` for immutable revisions, approval metadata, stale downstream artifacts, and restart persistence.
- Existing image acquisition, manual image import, voice generation, subtitle preparation, FFmpeg preview, deterministic QA, and CapCut bridge services.

## New simplified routes

- Primary `Scene Review` now exposes scene previews, narration, duration, VOX scene type, generation prompt, voice segment status, asset status, prompt editing, direction editing, scene regeneration, replacement upload, scene approval, and removal.
- Existing detailed Visuals and internal workflow screens remain available as advanced controls.
- Renderer-side Semi-automatic execution stops at CapCut Draft until the user confirms the desktop review.

## Orchestrator behavior

- Scene regeneration sends only the selected `sceneId` to the trusted main-process route.
- Revisions keep unchanged scene assets in the acquisition artifact when the selected scene is regenerated.
- Prompt, direction, type, and removal revisions stale downstream media, preview, and export stages while preserving upstream content and idea artifacts.

## VOX style skill

- The existing `vox-documentary` style profile remains the only V1 style.
- Important Vietnamese text stays in the local subtitle/compositing path; generated visual prompts do not require models to draw Vietnamese typography.

## Voice integration

- Scene Review reads status from the existing persisted voice-generation segments.
- No new provider or paid fallback was added. Existing configured voices remain the source of truth.

## Automated test result

- Focused checks: 49 tests passed across IPC schemas, Semi-automatic flow, and packaging verifier suites.
- `corepack pnpm typecheck`: passed.
- `git diff --check`: passed.

## Runtime result

- Existing Main Happy Path evidence is recorded in `docs/main-flow/MAIN_HAPPY_PATH_REPORT.md` and `.tmp-main-flow-runtime/full-path-20260802/`.
- The exact isolated `VOX Simple Flow Test` path was not rerun in this bounded change.
- The repository Electron smoke helper is currently stale: it expects the removed `New Project` route, while the simplified shell exposes `Create`. The compatible smoke therefore remains a blocker for independent runtime confirmation.

## Known blockers

- Add or update an Electron smoke mode for `VOX Simple Flow Test` and rerun the complete Topic -> idea -> scene retry -> voice -> Vietnamese subtitles -> preview -> final MP4 path.
- Run independent Reviewer and QA harness gates after the builder commit.

## Manual user test

Pending: create `VOX Simple Flow Test`, edit one prompt/direction, regenerate exactly one scene, approve the scene set, review the real preview, and approve the exported final MP4.
