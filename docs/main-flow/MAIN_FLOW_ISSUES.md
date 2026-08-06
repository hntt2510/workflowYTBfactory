# Main Flow Issues

## ISSUE-MF-001 - Competitor DNA approval is pending

- Severity: P1
- Status: BLOCKED_PENDING_USER_REVIEW
- Stage: Competitor DNA -> Opportunity Map
- Evidence: real Stage 6 artifact reached `needs_review` in `docs/manual-testing/COMPETITOR_WORKFLOW_RUNTIME_REPORT.md`.
- Impact: Opportunity Map is correctly not runnable until the artifact is explicitly approved.
- Required action: user reviews and approves or rejects the artifact in the Electron UI.

## ISSUE-MF-002 - Voice runtime is not available

- Severity: P1
- Status: FIXED_FOR_ISOLATED_RUNTIME
- Stage: Voice Generation and downstream media stages
- Evidence: `docs/overnight/OPEN_ISSUES_2026-07-30.md` ISSUE-006.
- Impact: Subtitle, Timeline, Preview, QA, CapCut Draft, and Packaging cannot receive real approved audio.
- Resolution: configured Edge TTS generated and FFprobe-validated five approved narration segments for project `project-6a1fc78d-1a19-43c5-98fb-a0b8a16ad944`; no fallback was used.

## ISSUE-MF-003 - Installed CapCut editability is not independently verified

- Severity: P1
- Status: FIXED
- Stage: CapCut Draft
- Evidence: the generated draft `project-6a1fc78d-1a19-43c5-98fb-a0b8a16ad944-stage-run-8f10045f-bfa2-42f5-be95-e9a5c297ffe2` opened in installed CapCut; selecting a subtitle segment exposed the Text editing panel while video, audio, and subtitle timeline lanes remained visible. Capture: `.tmp-main-flow-runtime/full-path-20260802/capcut-editable-text-selected.png`.
- Impact: independent production sign-off is complete for the isolated runtime draft.

## ISSUE-MF-004 - Later stages lack real end-to-end provider evidence

- Severity: P1
- Status: FIXED_FOR_ISOLATED_RUNTIME
- Stage: Opportunity Map through Asset Acquisition and later provider-backed stages.
- Evidence: only Stages 4-6 have real-provider runtime evidence in the current manual report.
- Impact: implementation and unit tests must not be reported as real runtime completion for arbitrary projects; the isolated project now has runtime evidence through Packaging Export.

## ISSUE-MF-005 - Working tree is dirty

- Severity: P2
- Status: OPEN
- Impact: stage matrix records `HEAD` as the code baseline; no final commit SHA exists for the combined changes.
- Safety action: unrelated existing changes were preserved.

## ISSUE-MF-006 - Asset Acquisition has no applicable AI-image input

- Severity: P1
- Status: OPEN
- Stage: Asset Acquisition -> Asset Review -> Voice and media stages
- Project: `project-09d4fcb0-0637-4bc3-95fe-1c83f19c6e9d`
- Evidence: Stage 18 approved routing contains seven shots, all `stock_video` or `document`; the approved Prompt Preparation artifact contains zero prompts; image certification has no verified record.
- Impact: `run-asset-acquisition` fails closed with `Asset Acquisition requires at least one approved AI image prompt.` and does not create a run or artifact. Downstream stages remain blocked.
- Safety action: no synthetic image or raw placeholder was inserted. Resolve by providing a real applicable asset route/certification or implementing the missing stock/document acquisition path.

## ISSUE-MF-007 - FFmpeg preview planner emitted an invalid pad expression

- Severity: P1
- Status: FIXED
- Stage: Preview Render
- Evidence: FFmpeg rejected `pad=1080x1920`; focused media test passed 2/2 after the planner now emits `pad=1080:1920`.
- Resolution: separated the scale size from the pad width/height syntax.

## ISSUE-MF-008 - Preview and CapCut ranges lost media timing precision

- Severity: P1
- Status: FIXED
- Stage: Preview Render -> CapCut Draft
- Evidence: Preview now preserves narration start-frame gaps and validates at `69.979s`; CapCut bridge accepted 5 visuals, 5 audio segments, and 24 subtitle cues after frame-boundary microsecond calculation and audio-duration clamping.
- Resolution: delayed audio by timeline start frames, used approved source durations, and calculated duration from rounded end minus rounded start.
