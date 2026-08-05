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
