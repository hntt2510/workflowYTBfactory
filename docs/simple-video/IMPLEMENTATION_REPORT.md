# VOX Simple Flow V1 Implementation Report

Date: 2026-08-03
Branch: `chore/setup-agent-harness`

## Changed architecture

- Kept the existing Electron main process, typed preload bridge, workflow stages, StageRuns, artifacts, SQLite project repository, FFmpeg renderer, voice services, and CapCut bridge.
- Restored Research Source Intake and Claim Map as persisted internal stages in the canonical 28-stage registry. They remain hidden from the default navigation and run through the trusted Semi-automatic orchestrator.
- Added a bounded Scene Review revision route in the main process. Prompt, direction, scene type, and scene removal actions create immutable stage artifacts and record user approval metadata.
- Added safe workspace media URLs for reviewable image assets. The renderer cannot choose arbitrary filesystem paths.
- Default production errors are reduced to safe, actionable messages, and persisted stage attention now identifies the failed phase and retry route.
- Shared stage-attention metadata now persists the affected phase, safe reason, failed item when applicable, recommended/retry actions, and provider Settings route when relevant; legacy attention payloads are upgraded on load.
- Renderer catches now route through the shared safe-error formatter, including advanced workflow screens, so raw IPC exception text is not shown to users.
- Semi-automatic persisted attention messages use the same safe formatter, and Existing Script orchestration is covered as a path that skips Idea Lab.
- Create preselects a trusted available voice when the configured catalog exposes one.
- Idea selection now uses candidate cards with the required creative fields, persisted edits, explicit choice, and forced regeneration.
- Production now shows the prepared script preview with optional `Edit Script`, `Regenerate Script`, and `Continue` actions; edits persist as new Script artifacts and invalidate only downstream work.
- Packaging now copies the approved preview into a workspace-relative final MP4 and records that path in the reviewed manifest.
- CapCut Draft is an explicit optional export action; approved QA and production artifacts are sufficient for Packaging Export.
- Reference Mode now auto-advances valid Reference Validation, Transcript Cleaning, Reference Segmentation, Competitor DNA, Opportunity Map, Research Source Intake, and Claim Map outputs; invalid or provider-failed stages still stop with `needs_attention`.

## Changed files by area

- Simplified shell and domain: `apps/desktop/src/renderer/App.tsx`, `apps/desktop/src/renderer/navigation.ts`, `packages/domain/src/productionStatus.ts`, `packages/domain/src/styleSkills.ts`, `packages/domain/src/workflowEligibility.ts`.
- Production and persistence: `apps/desktop/src/main/productionOrchestrator.ts`, `apps/desktop/src/main/main.ts`, `packages/db/src/projectRepository.ts`.
- VOX media and review: `apps/desktop/src/main/assetAcquisitionService.ts`, `apps/desktop/src/renderer/App.tsx`, `apps/desktop/index.html`.
- Runtime evidence: `scripts/verify-electron-ui.cjs` and the `.harness` job handoffs.

## Reused services

- `ProductionOrchestrator` for preparation, selective scene retry, voice, and preview sequencing.
- Existing research-source search and Claim Map handlers for automatic evidence preparation after idea selection in Reference Mode.
- `WorkflowRunStore` and `ProjectRepository` for immutable revisions, approval metadata, stale downstream artifacts, and restart persistence.
- Existing image acquisition, manual image import, voice generation, subtitle preparation, FFmpeg preview, deterministic QA, and CapCut bridge services.

## New simplified routes

- Primary `Scene Review` now exposes scene previews, narration, duration, VOX scene type, generation prompt, voice segment status, asset status, prompt editing, direction editing, scene regeneration, replacement upload, scene approval, and removal.
- Production exposes the prepared script before scene generation; section edits and regeneration create persisted Script revisions while preserving the existing outline and review history.
- Final Export exposes resolution, subtitle burn-in, subtitle-file, manifest, and optional CapCut draft controls. Packaging verifies the MP4 directly when no manifest is requested.
- Final Preview actions include direct Voice regeneration (then the detailed Voice screen), subtitle preset navigation, scene-review return, and repeat rendering.
- Existing detailed Visuals and internal workflow screens remain available as advanced controls; Research Source Intake and Claim Map route to the read-oriented Advanced Pipeline Details view.
- Settings now provides the hidden `Advanced Guided Wizard` entry point for guided-mode testing and recovery without adding it to the default navigation.
- Renderer-side Semi-automatic execution runs QA and Packaging Export after final-preview approval; CapCut Draft remains an optional manual export.

## Orchestrator behavior

- Scene regeneration sends only the selected `sceneId` to the trusted main-process route.
- Reference Mode runs Research Source Intake and Claim Map automatically after Originality Review; Topic Mode without included references skips both stages, and Existing Script Mode continues to skip idea and reference preparation.
- Script regeneration reuses the existing Script runner with an explicit forced revision path; editing a section records a user-authored StageRun and stales dependent fact review, scene, voice, preview, and export artifacts.
- Revisions keep unchanged scene assets in the acquisition artifact when the selected scene is regenerated.
- Prompt, direction, type, and removal revisions stale downstream media, preview, and export stages while preserving upstream content and idea artifacts.
- Voice, subtitles, and timeline continue automatically after scene approval; Preview Render remains `needs_review` for the explicit Final Preview checkpoint, then QA and Packaging Export continue after final approval.

## Dropdowns implemented

- Create uses stored channel profiles, available language values, existing configured voices, VOX Documentary, duration, aspect ratio, output resolution, and workflow choices without manual provider or model identifiers.
- Export options use controlled resolution and checkbox inputs for video subtitles, subtitle file, project manifest, and optional CapCut output.

## VOX style skill

- The existing `vox-documentary` style profile remains the only V1 style.
- Important Vietnamese text stays in the local subtitle/compositing path; generated visual prompts do not require models to draw Vietnamese typography.
- Simple Create derives its language picker from stored channel-profile and TTS configuration, including the configured voice locale when present.

## Voice integration

- Scene Review reads status from the existing persisted voice-generation segments.
- After Voice Generation is approved, Final Preview exposes `Regenerate voice`; the main process resets only Voice and downstream timing/render/export stages, rejects the prior voice review output, and preserves visual assets.
- No new provider or paid fallback was added. Existing configured voices remain the source of truth.

## Automated test result

- Focused checks: 117 targeted workflow-registry, eligibility, transitions, persistence, orchestrator, Semi-automatic, and packaging tests passed after the legacy-stage compatibility fix; the current default-flow regression set passed 55 tests and the Idea Lab service passed 3 tests.
- Idea Lab regeneration/edit schema coverage was added and passed with the IPC schema suite.
- Latest follow-up checks: 60 focused tests passed across IPC, production status, navigation, renderer safe errors, Existing Script orchestration, Semi-automatic flow, and Idea Lab; the voice regeneration request contract is covered.
- Attention metadata follow-up: 50 focused domain/DB tests passed, including legacy attention normalization and Settings/retry action contracts.
- Latest route and recovery regression check: 36 tests passed across visual routing, Asset Acquisition, Production Orchestrator, stage attention, Semi-automatic workflow, and renderer safe errors.
- `corepack pnpm typecheck`: passed.
- Production orchestrator regression: 8 tests passed after extending the asynchronous Voice Generation polling window.
- `git diff --check`: passed.
- `node --check scripts/verify-electron-ui.cjs`: passed.
- `node scripts/agent-harness/validate-harness-json.cjs`: passed.

## Runtime result

- Fresh configured-keychain smoke persisted the required Create configuration and available voice, then stopped truthfully at Idea Lab with `A verified text-model certification is required before Idea Lab can run.` No provider or media completion was claimed for that run.
- Fresh Electron Create-mode smoke passed after the Idea Lab UI changes.
- Fresh Electron Create-mode smoke passed after the Settings and voice regeneration UI changes.
- The certified persisted-media resume smoke reopened the existing project without duplicating it, preserved approved scenes, used the persisted voice/subtitle/timeline artifacts, displayed a real Final Preview, explicitly approved it, and completed QA and Packaging Export.
- Post-fix isolated configured-keychain VOX Simple Flow resume smoke completed the persisted Topic Mode project without Research Source Intake or Claim Map, approved Voice Generation, Subtitle Preparation, Timeline Assembly, Final Preview, QA, and Packaging Export, and recorded no runtime notes.
- Post-fix final MP4: verified at `exports\\project-e2bf227d-24ce-4134-b128-5543060dfa44\\stage-run-7f9bb470-87fb-4724-b4f0-994f952f4c11.mp4`; file size was 3,915,028 bytes and `ffprobe` reported H.264 video, AAC audio, 1920x1080, 30 fps, and 53.984 seconds.
- Final MP4: verified at `exports\\project-d0d31d1c-da95-4caf-88f1-3330b69efcb0\\stage-run-41a064c1-dac0-40d4-9a68-6d39ac4a2d13.mp4`; `ffprobe` reported H.264 video, AAC audio, 1920x1080, 30 fps, and 56.986 seconds.
- Legacy-stage compatibility smoke: an isolated full copy of the certified workspace reloaded the old project payload, inferred the restored Research Source Intake and Claim Map stages as already passed from its approved Outline, rerendered the real preview, approved Final Preview, and exported a new MP4 with no runtime notes.
- New final MP4: verified at `exports\\project-d0d31d1c-da95-4caf-88f1-3330b69efcb0\\stage-run-a51f22c4-70af-4360-afac-b96cc859451e.mp4`; `ffprobe` reported H.264 video, AAC audio, 1920x1080, 30 fps, and 56.986 seconds.
- CSP follow-up: an isolated persisted preview loaded through `lsf-media://`; Chromium emitted no CSP violation after `media-src 'self' blob: lsf-media:` was added.

## Known blockers

- A fresh clean workspace still requires a verified text-model certification before Topic Mode can generate ideas; the application fails closed rather than bypassing provider certification.
- Reference Mode still requires an existing configured 9Router web-search model for Research Source Intake; Topic Mode without included references does not enter that search path.
- Legacy projects whose approved shots require stock video or document acquisition without an existing validated local asset remain blocked because no production stock, video, or local compositor adapter exists; the route-aware Asset Acquisition path fails closed without placeholders or provider substitution.
- Independent Reviewer and QA harness gates remain pending; builder evidence does not self-approve the implementation.

## Manual user test

Pending: independently repeat the user-facing Create, scene-review, Final Preview, and Export clicks. The configured runtime evidence covers the automated UI path and real media, but it does not replace independent Reviewer/QA sign-off.

## Commits created

- `96a5f69d` supported VOX image routing.
- `74ec0958` resumed persisted VOX smoke state.
- `7b723e89` unblocked Scene Review and `lsf-media` previews.
- `be7229e4` preserved the Final Preview checkpoint.
- `f1469fed` verified persisted VOX final export.
