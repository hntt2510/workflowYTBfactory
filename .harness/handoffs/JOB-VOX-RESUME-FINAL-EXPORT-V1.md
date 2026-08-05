# JOB-VOX-RESUME-FINAL-EXPORT-V1 Handoff

- Status: `review_required`
- Change: Added an explicit `LSF_UI_RESUME_FROM_PREVIEW=1` smoke path. It reopens a persisted project whose preview is `approved` or `needs_review`, avoids rerunning scene/voice/subtitle/timeline work, uses the existing Final Preview controls, and verifies the existing QA/package/export path. Project-row selection was made resilient to rendered text nodes.
- Verification: `node --check scripts/verify-electron-ui.cjs`, `corepack pnpm typecheck`, and `git diff --check` passed.
- Runtime result: `$env:LSF_UI_USE_CONFIGURED_KEYCHAIN='1'; $env:LSF_UI_SEED_WORKSPACE='C:\Users\LEGION\AppData\Local\Temp\lsf-electron-ui-5lqluy'; $env:LSF_UI_USE_SEED_WORKSPACE='1'; $env:LSF_UI_RESUME_PROJECT='1'; $env:LSF_UI_RESUME_FROM_PREVIEW='1'; $env:LSF_UI_MODES='vox-simple-flow'; node scripts/verify-electron-ui.cjs` passed. It verified real preview visibility, explicit Final Preview approval, approved QA, approved Packaging Export, and final MP4 `exports\\project-d0d31d1c-da95-4caf-88f1-3330b69efcb0\\stage-run-41a064c1-dac0-40d4-9a68-6d39ac4a2d13.mp4`.
- Media evidence: `ffprobe` reported H.264 video 1920x1080 at 30 fps, AAC audio, and 56.986 seconds. The MP4 was non-empty and the approved packaging artifact references the same path.
- Reviewer/QA: not yet recorded; builder did not self-approve.
