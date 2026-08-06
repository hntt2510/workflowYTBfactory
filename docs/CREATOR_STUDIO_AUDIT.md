# Creator Studio Repository Audit

## Current flow

New semi-automatic projects follow `Brief -> Story -> Director -> Assets -> Build`. The manual-first path prepares an approved character, scene-level GG Lab prompts, manual multi-image intake, voice/subtitles/audio, FFmpeg preview, QA, MP4 export, and optional CapCut handoff. Legacy projects retain their provider-based visual pipeline.

## Current architecture

- `apps/desktop/src/renderer/features/studio` owns the creator shell and phase workspaces; renderer code reaches main only through typed preload APIs.
- `packages/domain` owns project, character, scene, shot, asset, timeline, eligibility, and backward-compatible parsing rules.
- `apps/desktop/src/main` owns orchestration, SQLite artifact persistence, safe workspace paths, FFmpeg/FFprobe validation, and optional CapCut preparation.
- `packages/media` plans contiguous visual/audio timelines, motion approximation, subtitle burn-in, H.264 encoding, and `yuv420p` output.
- `fixtures/creator-studio-v1` proves three scenes, ten storyboard frames, character continuity metadata, motion, voice, subtitles, optional audio, and a real playable MP4.

## Verified hardening

- FFmpeg preview output explicitly requests `libx264` and `yuv420p`.
- FFprobe rejects preview artifacts unless they contain the expected canvas/FPS/duration, an audio stream, H.264 video, and `yuv420p` pixels.
- Prompt Preparation uses the selected project vertical ratio when supported and keeps the legacy long-form default for existing projects.
- CapCut receives validated intermediate MP4 clips rather than source PNGs.

## Known limitations

- Face-level identity consistency still depends on the image provider; V1 uses approved prompt locks and reference metadata rather than a provider-specific binary identity API.
- The browser screenshot fallback is presentation-only; real filesystem intake and final media actions require Electron main.
- CapCut export remains a manual action inside CapCut after the app creates a render-safe draft.

## Verification evidence

```powershell
corepack pnpm exec vitest run packages/media/test apps/desktop/src/main/previewRenderService.test.ts apps/desktop/src/main/promptPreparationService.test.ts
corepack pnpm typecheck
node scripts/verify-electron-ui.cjs
node fixtures/creator-studio-v1/verify.mjs
node scripts/capture-ui-screenshots.cjs
git diff --check
```

The committed fixture verifies a 1080x1920, 30 FPS H.264/yuv420p video with AAC audio and ten seconds of duration. Screenshot artifacts are under `docs/screenshots`.
