# Main Happy Path V1 Report

Date: 2026-08-02
Branch: `chore/setup-agent-harness`
Code baseline: `038121f297e135537b4c8ab3e2e68cf6f1fe6055` (working tree contains uncommitted changes)

## Overall Result

The isolated Main Happy Path V1 now reaches Packaging Export with all 28 stages persisted as approved after a final Electron restart. The run used real provider-backed text/image/TTS execution where configured, local media validation, FFmpeg/FFprobe, deterministic QA, and the pycapcut bridge; no raw or placeholder media was substituted for a failed provider result.

The verified path is:

`Reference Validation approved -> ... -> Prompt Preparation approved -> Asset Acquisition approved -> ... -> Packaging Export approved`

The generated draft was also opened in the installed CapCut UI and independently verified with visible video, audio, and subtitle timeline lanes.

## Stage Matrix

| # | Stage | Implementation | Runner | Real runtime | Approval | Restart | Unlock / limitation | Commit |
|---:|---|---|---|---|---|---|---|---|
| 1 | Project Setup | IMPLEMENTED | manual input | RUNTIME_VERIFIED | persisted | verified | unlocks Reference Intake | HEAD |
| 2 | Reference Intake | IMPLEMENTED | manual input | RUNTIME_VERIFIED | draft input | verified | unlocks Reference Validation | HEAD |
| 3 | Reference Validation | IMPLEMENTED | local deterministic | RUNTIME_VERIFIED | persisted | verified | unlocks Transcript Cleaning | HEAD |
| 4 | Transcript Cleaning | IMPLEMENTED | 9Router text, chunked | REAL_PROVIDER_VERIFIED | needs_review; approved in fixture | verified | unlocks Segmentation only after approval | HEAD |
| 5 | Reference Segmentation | IMPLEMENTED | 9Router text, chunked | REAL_PROVIDER_VERIFIED | needs_review; approved in fixture | verified | sponsor excluded from DNA | HEAD |
| 6 | Competitor DNA | IMPLEMENTED | 9Router text | REAL_PROVIDER_VERIFIED | synthetic-regression approval | verified | approved evidence-backed DNA | HEAD |
| 7 | Opportunity Map | IMPLEMENTED | 9Router text | REAL_PROVIDER_VERIFIED | synthetic-regression approval | verified | one-reference confidence is low | HEAD |
| 8 | Idea Lab | IMPLEMENTED | 9Router text | REAL_PROVIDER_VERIFIED | one selected candidate; synthetic-regression approval | verified | six candidates, two per risk bucket | HEAD |
| 9 | Originality Review | IMPLEMENTED | local deterministic | RUNTIME_VERIFIED | synthetic-regression approval | verified | no external web search | HEAD |
| 10 | Research Source Intake | IMPLEMENTED | manual input | RUNTIME_VERIFIED | public sources approved in fixture | verified | no automatic crawling | HEAD |
| 11 | Claim Map | IMPLEMENTED | 9Router text | REAL_PROVIDER_VERIFIED | synthetic-regression approval | verified | unsupported/allegation claims blocked | HEAD |
| 12 | Outline | IMPLEMENTED | 9Router text | REAL_PROVIDER_VERIFIED | synthetic-regression approval | verified | claim-linked review | HEAD |
| 13 | Script | IMPLEMENTED | 9Router text | REAL_PROVIDER_VERIFIED | explicit synthetic-regression approval; restart persisted | verified | 7 sections, 7,723 narration characters | HEAD |
| 14 | Fact Review | IMPLEMENTED | local deterministic | RUNTIME_VERIFIED | synthetic-regression approval | verified | no external fact-check | HEAD |
| 15 | Retention Review | IMPLEMENTED | 9Router text | REAL_PROVIDER_VERIFIED | synthetic-regression approval | verified | does not rewrite script | HEAD |
| 16 | Scene Plan | IMPLEMENTED | 9Router text | REAL_PROVIDER_VERIFIED | synthetic-regression approval | verified | 7 scenes | HEAD |
| 17 | Shot Plan | IMPLEMENTED | 9Router text | REAL_PROVIDER_VERIFIED | synthetic-regression approval | verified | 7 shots | HEAD |
| 18 | Visual Routing | IMPLEMENTED | local deterministic | RUNTIME_VERIFIED | synthetic-regression approval | verified | all routes are `stock_video` or `document` | HEAD |
| 19 | Prompt Preparation | IMPLEMENTED | 9Router text | REAL_PROVIDER_VERIFIED | synthetic-regression approval | verified | zero AI-image prompts for this fixture | HEAD |
| 20 | Asset Acquisition | IMPLEMENTED | 9Router image | REAL_RUNTIME_VERIFIED | approved 5-image batch | verified after restart | verified image capability; idempotent reuse completed shot-01 | HEAD |
| 21 | Asset Review | IMPLEMENTED | manual review lifecycle | REAL_RUNTIME_VERIFIED | approved and assigned 5/5 assets | verified after restart | rejected assets cannot feed timeline | HEAD |
| 22 | Voice Generation | IMPLEMENTED | Edge TTS job | REAL_RUNTIME_VERIFIED | approved 5 narration segments | verified after restart | no fallback used; real local files validated | HEAD |
| 23 | Subtitle Preparation | IMPLEMENTED | local deterministic | REAL_RUNTIME_VERIFIED | approved 24 cues | verified after restart | cue ranges remain frame-based and ordered | HEAD |
| 24 | Timeline Assembly | IMPLEMENTED | local deterministic | REAL_RUNTIME_VERIFIED | approved 35-item timeline | verified after restart | 5 visuals, 5 narration, 24 subtitle items | HEAD |
| 25 | Preview Render | IMPLEMENTED | FFmpeg + FFprobe | REAL_RUNTIME_VERIFIED | approved 1080x1920 preview | verified after restart | 30fps, 69.979s, SHA-256 persisted | HEAD |
| 26 | QA | IMPLEMENTED | local deterministic | REAL_RUNTIME_VERIFIED | approved, zero findings | verified after restart | no blocking findings | HEAD |
| 27 | CapCut Draft | IMPLEMENTED | pycapcut bridge | REAL_RUNTIME_VERIFIED | explicit CapCut desktop confirmation | verified after restart | opened in installed CapCut with video, audio, and subtitle lanes visible | HEAD |
| 28 | Packaging Export | IMPLEMENTED | local deterministic | REAL_RUNTIME_VERIFIED | approved manifest | verified after restart | workspace-relative path and SHA-256 revalidated | HEAD |

## Verification Evidence

- `corepack pnpm test:unit`: 272 tests passed in 43 files.
- `corepack pnpm typecheck`: passed.
- `corepack pnpm lint`: passed.
- `corepack pnpm --filter @lsf/desktop build`: passed.
- `git diff --check`: passed.
- Focused media regression: `packages/media/test/ffmpegPreview.test.ts` passed 2/2 after fixing FFmpeg padding and narration gap planning.
- Final runtime project: `project-6a1fc78d-1a19-43c5-98fb-a0b8a16ad944`; all 28 stage statuses were `approved` after restart.
- Packaging manifest SHA-256: `04346c5589ce8914f4ecc7787c1f6ef3cf54552a485847a316f02a89520787b7`.
- Installed CapCut evidence: `.tmp-main-flow-runtime/full-path-20260802/capcut-editable-text-selected.png` shows the generated draft open, with the subtitle Text editor active and video, audio, and subtitle lanes visible.
- Real Stage 4-6 evidence: `docs/manual-testing/COMPETITOR_WORKFLOW_RUNTIME_REPORT.md`.
- Electron smoke and restart/invalidation evidence are recorded in the manual runtime report and overnight checkpoints.

## Completion Decision

Complete for the isolated Main Happy Path V1 runtime, including independent installed CapCut opening/editability verification.
