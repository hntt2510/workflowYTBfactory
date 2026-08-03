# JOB-SIMPLE-CREATE-VOICE-RUNTIME-V1 Handoff

- Status: `review_required`
- Commits: `11f3778f` (`fix: bind simple create voice selection`), `ebc8b438` (`chore: release simple create job lock`)
- Change: Simple Create filters voices to the configured existing provider and stores the provider voice identifier; Voice Generation now prefers the project-selected voice.
- Runtime smoke: `$env:LSF_UI_MODES='create'; node scripts/verify-electron-ui.cjs` passed for `Why did oil matter so much in World War II?`, including Create, project persistence, Scene Review, Final Preview, Settings, and Diagnostics navigation.
- Other verification: `corepack pnpm typecheck`, navigation tests (3 passed), job JSON parse, and `git diff --check` passed.
- Known baseline blocker: the full default Electron smoke matrix stops in `workflow-contract` because its isolated setup has no text-model certification; this is unrelated to the simplified Create route.
- Reviewer/QA: not yet recorded; builder did not self-approve.
