# Handoff: Character-First Visual Production V1

## Implementation

- Character-first orchestration now runs `Character Preparation -> Visual Routing -> Asset Concepts -> Prompt Preparation -> Asset Acquisition` for new character-first projects.
- Legacy projects keep the existing visual path and do not invoke Character Preparation or Asset Concepts.
- Visual Routing is guarded by an approved, complete character version; character readiness checks require approved identity references.
- Character-first Asset Concepts and Asset Review remain automatic approvals; Scene Review can still be used for manual revisions.
- Added focused coverage for character packs, per-view retry, asset concept mapping, motion catalog/budget, FFmpeg motion approximation, persistence snapshots, and orchestration ordering.

## Verification Evidence

- `corepack pnpm exec vitest run packages/domain/test/character.test.ts packages/domain/test/assetConcepts.test.ts packages/domain/test/motion.test.ts packages/domain/test/ipcSchemas.test.ts packages/domain/test/workflowEligibility.test.ts` -> passed, 66 tests.
- `corepack pnpm exec vitest run apps/desktop/src/main/characterService.test.ts apps/desktop/src/main/assetConceptService.test.ts apps/desktop/src/main/promptPreparationService.test.ts apps/desktop/src/main/shotPlanService.test.ts apps/desktop/src/main/productionOrchestrator.test.ts apps/desktop/src/main/previewRenderService.test.ts packages/media/test/ffmpegPreview.test.ts` -> passed, 28 tests.
- `corepack pnpm exec vitest run packages/db/test/persistence.test.ts apps/desktop/src/renderer/semiAutomaticWorkflow.test.ts apps/desktop/src/renderer/navigation.test.ts` -> passed, 64 tests.
- `corepack pnpm typecheck` -> passed.
- `git diff --check` -> passed; Git only reported existing line-ending normalization warnings.

## Handoff Notes

- The worktree contains unrelated pre-existing dirty changes and no commit was created to avoid bundling them into this job.
- Reviewer should inspect the bounded job paths and decide whether to commit the complete job change set in an isolated review step.

## Repository Audit

- Current flow: character-first projects route through Character Preparation, Visual Routing, Asset Concepts, Prompt Preparation, manual Asset Intake/Review, then voice, subtitles, timeline, preview, QA, and export; legacy projects retain provider-based visual stages.
- Bottlenecks: the renderer still concentrates workflow screens in `App.tsx`; manual intake previously rendered only imported items, rejected duplicate hashes, and replaced the whole review set when a later upload was made.
- Migration risks: stage-level invalidation is global rather than scene-granular; old artifacts may lack character composition metadata; CapCut bridge changes remain outside this job.
- Implementation phases: domain and workflow contracts, character/prompt continuity, manual asset intake, media/audio rendering, renderer polish, targeted verification, and independent review/QA.

## Latest Incremental Update

- Manual Asset Intake now preserves prior approved items when replacing one frame, accepts duplicate hashes as review warnings, records aspect-ratio and resolution warnings, and stales downstream build stages when intake changes.
- Asset Intake now renders every required storyboard slot, supports per-slot upload/replace, shows missing/orphan/warning states, and keeps reassignment/removal controls for imported items.
- Targeted verification after this update: `corepack pnpm typecheck`, `git diff --check`, and 6 Vitest files / 66 tests passed.
