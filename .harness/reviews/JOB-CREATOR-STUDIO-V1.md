# Review: JOB-CREATOR-STUDIO-V1

Result: reject
Reviewed target: current branch and working-tree changes against `origin/chore/setup-agent-harness`
Reviewer checks: defect-first source review, CodeGraph exploration, targeted renderer tests, `git diff --check`

## Findings

### [P1] Track the workspace modules before merging

`apps/desktop/src/renderer/routes/RouteScreen.tsx:29` imports `../features/workspace/ProjectStudioScreen`, but the entire `apps/desktop/src/renderer/features/workspace/` directory is ignored by the repository's existing `workspace/` rule in `.gitignore`. `git check-ignore` confirms the new modules are ignored and `git ls-tree HEAD` contains none of them, so a clean checkout or commit-based merge will not contain the modules even though local typecheck/build passes.

### [P1] Synchronize nested workspace tabs when the route changes

`apps/desktop/src/renderer/features/workspace/ContentWorkspace.tsx:11`, `DirectorWorkspace.tsx:10`, and `BuildWorkspace.tsx:13` read `initialTab` only during `useState` initialization. `RouteScreen.tsx` changes that prop for legacy routes, while same-workspace navigation remains mounted; consequently `Mở storyboard` (`DirectorScreens.tsx:40`) can leave the user on the Scenes tab, and voice completion's `setRoute("timeline")` (`VoiceScreen.tsx:122`) can leave the user on the Voice tab. The route changes visually but the requested destination does not open.

### [P1] Render the required five-phase production stepper

`apps/desktop/src/renderer/layouts/AppShell.tsx:164` maps `creatorWorkspaceDefinitions`, which contains only four entries (`content`, `director`, `assets`, `build`). The required Brief and Story phases are collapsed into one Content step even though `creatorPhaseDefinitions` defines the five-phase model. The primary project stepper therefore does not expose or track the required Brief, Story, Director, Assets, and Build phases.

### [P2] Derive each Home card's actual next action

`apps/desktop/src/renderer/features/home/HomeScreens.tsx:53-56` renders `Đã lưu` and `Nội dung` for every project regardless of its persisted stage state. Completed projects, blocked projects, and projects waiting for asset approval therefore all advertise the same incorrect next step, violating the Home requirement to show the current phase and exact next action.

## Verification

- `corepack pnpm exec vitest run apps/desktop/src/renderer/navigation.test.ts apps/desktop/src/renderer/creatorStudioCopy.test.ts` — passed, 2 files / 9 tests.
- `git diff --check` — passed; Git emitted only line-ending warnings.
- Full lint remains blocked by the pre-existing `.tmp-main-flow-runtime/cdp-call.mjs` unused-variable error per the builder handoff; targeted ESLint invocation produced no errors for the checked JavaScript file.

## Assessment

The implementation has useful creator-facing structure and the targeted renderer tests pass, but the clean-checkout packaging blocker and broken route-to-tab behavior require fixes before QA. No approval is recorded.
