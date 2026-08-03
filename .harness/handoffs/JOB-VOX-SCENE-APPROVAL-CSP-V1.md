# JOB-VOX-SCENE-APPROVAL-CSP-V1 Handoff

- Status: `review_required`
- Change: Scene Review now accepts an already approved and fully assigned asset-review artifact, then invokes the existing `continueAfterSceneReview` orchestrator. The `Approve Scene` control no longer depends on pending voice status or `needs_review` artifact status. `lsf-media:` is allowed in `img-src` for real asset previews.
- Verification: `corepack pnpm typecheck` and `git diff --check` passed.
- Runtime result: The resumed configured-keychain run advanced past Scene Review, generated 11 non-empty voice files plus a merged voiceover, produced Vietnamese subtitle output, and rendered a non-empty 4,536,087-byte preview MP4 at `previews\\project-d0d31d1c-da95-4caf-88f1-3330b69efcb0\\stage-run-72c53204-fa47-4e5a-8072-35d85be0e39d.mp4`.
- Runtime blocker: The verifier timed out waiting for the `needs_review` Final Preview checkpoint because the persisted `preview-render` stage was already `approved`. No final preview approval or packaging/export evidence is claimed.
- Evidence: `C:\Users\LEGION\AppData\Local\Temp\lsf-electron-ui-5lqluy\assets\voice\jobs\tts-job-adbb862b-b5a4-414d-b7fe-8e0d85366087\voiceover.mp3`, `C:\Users\LEGION\AppData\Local\Temp\lsf-electron-ui-5lqluy\previews\project-d0d31d1c-da95-4caf-88f1-3330b69efcb0\stage-run-72c53204-fa47-4e5a-8072-35d85be0e39d.mp4`, and the SQLite stage/artifact query show approved voice, subtitle, timeline, and preview stages.
- Reviewer/QA: not yet recorded; builder did not self-approve.
