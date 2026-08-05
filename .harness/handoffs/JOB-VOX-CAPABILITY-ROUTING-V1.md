# JOB-VOX-CAPABILITY-ROUTING-V1 Handoff

- Status: `review_required`
- Changed implementation: `packages/domain/src/visualRouter.ts`, `packages/domain/test/visualRouter.test.ts`, and `apps/desktop/src/main/main.ts`.
- Behavior: VOX Documentary routing preserves approved local assets and routes new shots to the existing `ai_image` pipeline. Legacy routing remains unchanged when no VOX style policy is supplied.
- Persistence: The visual-routing fingerprint now includes the selected visual style so a VOX route decision cannot reuse a legacy route artifact.
- Verification: `corepack pnpm exec vitest run packages/domain/test/visualRouter.test.ts apps/desktop/src/main/assetAcquisitionService.test.ts` passed (12 tests); `corepack pnpm typecheck` passed; `git diff --check` passed.
- Runtime: Configured-keychain seeded Electron smoke reached approved Visual Routing and Prompt Preparation, then persisted Asset Acquisition failure with safe category `capability_not_verified`; the prior unsupported `stock_video` route error no longer occurs.
- Reviewer/QA: not yet recorded; builder did not self-approve.
- Remaining: verify image capability in Settings, then continue the seeded project through Scene Review, voice, preview, and export. No final MP4 was produced by this smoke.
