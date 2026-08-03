# JOB-SCENE-REVIEW-CONTROLS-V1 Handoff

- Status: `review_required`
- Commit: `fbe2e7c8` (`feat: complete primary scene review controls`)
- Builder verification: 49 focused tests passed (IPC schemas, Semi-automatic workflow, packaging verifier); `corepack pnpm typecheck` and `git diff --cached --check` passed.
- Change: Primary Scene Review now supports safe previews, scene approval, selective regeneration, prompt/direction/type revisions, replacement upload, removal, voice status, and final MP4 packaging.
- Automatic handoff: Semi-automatic execution runs CapCut Draft but stops for the explicit desktop review confirmation.
- Runtime blocker: Existing Electron smoke helper expects the removed `New Project` route; the simplified shell exposes `Create`. The exact isolated `VOX Simple Flow Test` path remains pending.
- Reviewer/QA: not yet recorded; builder did not self-approve.
