# Reference Intake Fix Report

Date: 2026-08-01

## Root causes

- YouTube identity normalization handled watch URLs but not Shorts or embed URLs.
- Reference-set fingerprints included unstable/all-reference data instead of the current included versions and validator version.
- Editing a reference did not reject a source identity already owned by another reference.
- Draft/valid reference changes could incorrectly stale the whole downstream workflow.
- Validation metadata and reference-set summary data were not persisted or visible.
- The renderer exposed only Edit/Delete and a checkbox, with no View, Validate, Replace transcript, or Versions controls.

## Changed files

- `packages/domain/src/referenceIdentity.ts`
- `packages/domain/src/types.ts`
- `packages/domain/src/workflowEligibility.ts`
- `packages/domain/src/ipcSchemas.ts`
- `packages/domain/test/referenceIdentity.test.ts`
- `packages/domain/test/workflowEligibility.test.ts`
- `packages/domain/test/ipcSchemas.test.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/preload/preload.cjs`
- `apps/desktop/src/renderer/types.ts`
- `apps/desktop/src/renderer/services/factoryClient.ts`
- `apps/desktop/src/renderer/App.tsx`
- `scripts/verify-electron-ui.cjs`

## Migrations

- None. Reference state remains in the existing project payload JSON; no SQLite schema change was required.

## Tests added

- Shorts and embed URL identity normalization.
- Missing YouTube video IDs.
- Reference validation metadata and reference-set counters.
- Explicit Reference Intake Electron workflow mode.

## Automated results

- `corepack pnpm typecheck` — PASS.
- `corepack pnpm lint` — PASS.
- `corepack pnpm test` — PASS (43 files, 242 tests).
- `corepack pnpm --filter @lsf/desktop build` — PASS.
- Focused domain/schema/navigation tests — 35 passed.
- `git diff --check` — PASS.

## Electron smoke result

- `LSF_UI_MODES=workflow-contract,reference-restart,reference-invalidation node scripts/verify-electron-ui.cjs` — PASS.
- The smoke covered save-as-draft, View, Versions, immutable transcript replacement, equivalent-URL duplicate detection, validation, approval, restart persistence, approved-reference edit confirmation, stale invalidation, and navigation to Transcript Cleaning.
- The default `node scripts/verify-electron-ui.cjs` reaches the Reference Intake modes, then remains blocked in the unrelated Project Overview create mode because its isolated workspace has no configured 9Router credential/model certification.

## Remaining manual checks

- Open the isolated project in the desktop app and inspect View, Versions, Include/Exclude, Replace transcript, and impact-confirmation wording visually.
- Confirm the impact list wording for a real approved reference edit/replacement in the user’s configured workspace.

## Known limitations

- The current persisted model represents transcript versions as immutable reference rows linked by `parentReferenceId`; the existing repository does not yet have separate normalized reference/version tables.
- The default transcript policy remains: non-whitespace transcript content of at least 20 characters is required; URL-only and notes-only references are invalid.

## Final verification update

- Added current-version-aware duplicate resolution after immutable transcript replacement.
- Added canonical duplicate metadata and an `Open existing` duplicate action.
- Duplicate IPC responses now expose `duplicate`, `existingReferenceId`, `existingCurrentVersionId`, and `canonicalSourceId`.
- Derived stale-impact stages from the trusted workflow registry, including `Reference Validation` itself.
- Focused domain/schema/workflow checks: 65 passed.
- Full test suite: 43 files, 245 tests passed.
- Electron Reference Intake modes: `workflow-contract`, `reference-restart`, and `reference-invalidation` passed with exit code 0.
