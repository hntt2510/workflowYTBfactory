# JOB-ROUTE-AWARE-ASSET-ACQUISITION-V1 Handoff

- Status: `review_required`
- Commits: `100e31ac` (`feat: make asset acquisition route-aware`), `accc01b0` (`fix: close route planner declaration`)
- Change: Asset Acquisition now plans selected shots by visual route, generates only exact approved AI-image prompts, preserves validated local assets for reusable/uploaded and locally-backed documentary routes, and fails closed for unavailable routes without placeholders or provider calls.
- Tests: `corepack pnpm exec vitest run apps/desktop/src/main/assetAcquisitionService.test.ts` passed (8 tests).
- Typecheck: `corepack pnpm typecheck` passed.
- Diff check: `git diff --check` passed.
- Known limitation: no verified stock, AI-video, or local compositor adapter exists in the repository; those routes remain actionable fail-closed unless an existing local asset is available.
- Review/QA: not yet recorded; builder did not self-approve.
