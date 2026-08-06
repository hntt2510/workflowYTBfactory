# Main Flow Progress

Date: 2026-08-02

## Current Checkpoint

- Highest runtime checkpoint: Packaging Export approved (Stage 28).
- Current isolated project: `project-6a1fc78d-1a19-43c5-98fb-a0b8a16ad944`.
- Final persisted state: all 28 stages approved after an Electron restart.
- Packaging manifest: `exports/project-6a1fc78d-1a19-43c5-98fb-a0b8a16ad944/stage-run-131fd380-3cbb-426a-8517-4420c6d688ed.json`.

## Completed

- Stage 1-3 lifecycle and persistence.
- Stage 4 Transcript Cleaning with strict parsing, bounded chunking, retry, resume metadata, fail-closed output validation, and review gating.
- Stage 5 exact segmentation with sponsor exclusion.
- Stage 6 evidence-backed Competitor DNA with strict output validation.
- Stage 7-28 IPC handlers, typed preload surface, renderer controls, persistence, approval gates, and stale-input checks are present.
- Idea Lab contract aligned to Main Happy Path V1: six candidates, two per risk bucket.
- Stages 7-19 were runtime exercised on the isolated project with real 9Router text calls where applicable, restart persistence after Script, and synthetic-regression approvals.
- Stages 20-28 were runtime exercised with verified 9Router image capability, real workspace images, configured Edge TTS output, FFmpeg/FFprobe preview, deterministic QA, pycapcut bridge output, and a hash-verified packaging manifest.
- Preview runtime fixes preserve visual padding syntax, narration start-frame gaps, approved audio duration bounds, and adjacent CapCut frame ranges.
- Final verification rerun passed: 272 unit tests, typecheck, lint, desktop production build, and `git diff --check`.
- Runtime diagnostics now describe CapCut draft export as available; installed-app opening and editability were verified for the isolated draft.

## Residual Verification

- The generated isolated draft was opened in installed CapCut; selecting a subtitle segment opened the Text editor while the expected video, audio, and subtitle lanes remained visible. Evidence is captured in `.tmp-main-flow-runtime/full-path-20260802/capcut-editable-text-selected.png`.
- No downstream stage was auto-run; every stage transition used an explicit run and approval call.
