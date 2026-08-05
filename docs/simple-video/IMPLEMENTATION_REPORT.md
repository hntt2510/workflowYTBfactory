# VOX Simple Flow V1 Implementation Report

Date: 2026-08-03
Branch: `chore/setup-agent-harness`

## Changed architecture

- Kept the existing Electron main process, typed preload bridge, workflow stages, StageRuns, artifacts, SQLite project repository, FFmpeg renderer, voice services, and CapCut bridge.
- Added a bounded Scene Review revision route in the main process. Prompt, direction, scene type, and scene removal actions create immutable stage artifacts and record user approval metadata.
- Added safe workspace media URLs for reviewable image assets. The renderer cannot choose arbitrary filesystem paths.
- Packaging now copies the approved preview into a workspace-relative final MP4 and records that path in the reviewed manifest.
- CapCut Draft is an explicit optional export action; approved QA and production artifacts are sufficient for Packaging Export.

## Changed files by area

- Simplified shell and domain: `apps/desktop/src/renderer/App.tsx`, `apps/desktop/src/renderer/navigation.ts`, `packages/domain/src/productionStatus.ts`, `packages/domain/src/styleSkills.ts`.
- Production and persistence: `apps/desktop/src/main/productionOrchestrator.ts`, `apps/desktop/src/main/main.ts`, `packages/db/src/projectRepository.ts`.
- VOX media and review: `apps/desktop/src/main/assetAcquisitionService.ts`, `apps/desktop/src/renderer/App.tsx`, `apps/desktop/index.html`.
- Runtime evidence: `scripts/verify-electron-ui.cjs` and the `.harness` job handoffs.

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
- Voice, subtitles, and timeline continue automatically after scene approval; Preview Render remains `needs_review` for the explicit Final Preview checkpoint, then QA and Packaging Export continue after final approval.

## Dropdowns implemented

- Create uses stored channel profiles, available language values, existing configured voices, VOX Documentary, duration, aspect ratio, output resolution, and workflow choices without manual provider or model identifiers.

## VOX style skill

- The existing `vox-documentary` style profile remains the only V1 style.
- Important Vietnamese text stays in the local subtitle/compositing path; generated visual prompts do not require models to draw Vietnamese typography.
- Simple Create derives its language picker from stored channel-profile and TTS configuration, including the configured voice locale when present.

## Voice integration

- Scene Review reads status from the existing persisted voice-generation segments.
- No new provider or paid fallback was added. Existing configured voices remain the source of truth.

## Automated test result

- Focused checks: 49 earlier tests passed across IPC schemas, Semi-automatic flow, and packaging verifier suites; the production orchestrator checkpoint suite passed 5 tests.
- `corepack pnpm typecheck`: passed.
- `git diff --check`: passed.
- `node --check scripts/verify-electron-ui.cjs`: passed.

## Runtime result

- Fresh configured-keychain smoke persisted the required Create configuration and available voice, then stopped truthfully at Idea Lab with `A verified text-model certification is required before Idea Lab can run.` No provider or media completion was claimed for that run.
- The certified persisted-media resume smoke reopened the existing project without duplicating it, preserved approved scenes, used the persisted voice/subtitle/timeline artifacts, displayed a real Final Preview, explicitly approved it, and completed QA and Packaging Export.
- Final MP4: verified at `exports\\project-d0d31d1c-da95-4caf-88f1-3330b69efcb0\\stage-run-41a064c1-dac0-40d4-9a68-6d39ac4a2d13.mp4`; `ffprobe` reported H.264 video, AAC audio, 1920x1080, 30 fps, and 56.986 seconds.

## Known blockers

- A fresh clean workspace still requires a verified text-model certification before Topic Mode can generate ideas.
- Harness-wide JSON validation remains blocked by the pre-existing `.harness/jobs/JOB-SEMI-AUTOMATIC-STAGES.json` missing `businessContext`.
- Independent Reviewer and QA harness gates remain pending; builder evidence does not self-approve the implementation.

## Manual user test

Pending: independently repeat the user-facing Create, scene-review, Final Preview, and Export clicks. The configured runtime evidence covers the automated UI path and real media, but it does not replace independent Reviewer/QA sign-off.

## Commits created

- `96a5f69d` supported VOX image routing.
- `74ec0958` resumed persisted VOX smoke state.
- `7b723e89` unblocked Scene Review and `lsf-media` previews.
- `be7229e4` preserved the Final Preview checkpoint.
- `f1469fed` verified persisted VOX final export.
