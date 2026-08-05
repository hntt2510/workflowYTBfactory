# Competitor Workflow Runtime Report

Date: 2026-08-01

## Scope

This report covers only Stage 4 Transcript Cleaning, Stage 5 Reference Segmentation, and Stage 6 Competitor DNA. Opportunity Map and later stages were not executed.

## Runtime Project

- Project: `Competitor Workflow Runtime Success Test 20260801`
- Project ID: `project-ae9df5f8-5d1c-426d-8bca-bd5957ff78cf`
- Reference ID: `competitor-2878b5c9-9fde-4fa6-aa53-716ef4a6b7bf`
- Workspace: isolated temporary workspace under the configured Long/Short Factory temp directory
- Provider: `9router`
- Configured model: `cx/gpt-5.6-sol`
- Returned model: `gpt-5.6-sol`
- Text certification: `verified`

## Timeout Audit

The original failure was a bounded provider-client timeout in the main-process 9Router request path. The old Transcript Cleaning path used a single approximately 60-second provider timeout for the whole request, which was too short for the long transcript.

The current path is:

`renderer action -> typed factoryClient -> preload IPC -> main-process StageRun -> credential/certification check -> NineRouterClient /v1/responses -> strict JSON parse -> artifact persistence`

The current limits are separate and bounded:

- Transcript Cleaning: sequential chunks, 120,000 ms per chunk, 15-minute aggregate deadline.
- Reference Segmentation: sequential 6,000-character chunks, 300,000 ms provider timeout per request.
- Competitor DNA: 300,000 ms provider timeout.

No renderer, IPC, or response-parsing timeout was found to be the source of the original long-transcript failure.

## Long-Transcript Strategy

Transcript Cleaning normalizes deterministic formatting locally, estimates tokens conservatively, chooses paragraph/line/sentence/whitespace boundaries, and processes chunks sequentially. Chunk fingerprints include reference/version, source range/hash, prompt version, model, provider configuration, and runner version. Completed chunks are persisted and reused on explicit retry.

Reference Segmentation uses sequential 6,000-character chunks. The validator requires exact source slices, then merges them with unique IDs and aggregate coverage validation.

## Real Request Counts

- Transcript Cleaning successful run `stage-run-3b34e9e9-0d23-4cb4-8a8c-46acdeaa8c3e`: 2 real 9Router requests for 2 chunks; final artifact approved.
- Reference Segmentation successful run `stage-run-fb172aab-0068-4413-8a88-aa89dbef4e58`: 3 real 9Router requests for 3 chunks; final artifact approved.
- Competitor DNA final successful run `stage-run-10de6c42-c715-4a33-9587-a2e4feea70a8`: 1 real 9Router request; final artifact reached `needs_review`.
- Competitor DNA also has 4 earlier real provider attempts while repairing the response contract: wrapper shape, `emotion` field shape, and excluded-summary mismatches were rejected safely. The credential-only attempt made no provider request.

## Stage Results

### Stage 4 - Transcript Cleaning

- Final status: `approved`.
- Source character count: 12,642.
- Cleaned character count: 12,076.
- Removed formatting/noise segments: 41.
- Chunk mode: 2 sequential chunks.
- No provider summary was accepted as cleaned transcript.

### Stage 5 - Reference Segmentation

- Final status: `approved`.
- Exact source ranges were validated against the cleaned transcript.
- Sponsor content remained visible in the cleaned audit text.
- Sponsor segment: `segment-0-segment-7`.
- Sponsor `includedForDna`: `false`.
- No gap or invented segment was accepted in the final artifact.

### Stage 6 - Competitor DNA

- Final status: `needs_review`.
- Artifact: `artifact-e1f70d6f-acbf-41c5-9d2b-ada92c1e0dcb`.
- Evidence IDs resolve to included narrative segments only.
- Sponsor segment `segment-0-segment-7` was not cited by any DNA finding.
- Excluded summary: 1 sponsor, 0 self-promotion, excluded ID `segment-0-segment-7`.
- Long-phrase copy validation passed; output describes abstractions rather than reproducing source wording.
- Opportunity Map runs: 0.

## Persistence and Recovery

After the final Competitor DNA run, Electron was restarted. The restarted process loaded the same workspace and preserved:

- approved Transcript Cleaning artifact;
- approved Reference Segmentation artifact;
- needs-review Competitor DNA artifact;
- StageRun history, including failed attempts and the final successful run.

No provider request was made by page load or restart. The failed attempts remain history and were not silently overwritten.

Stale invalidation was verified on a cloned copy of the runtime workspace. Editing the approved source changed the reference set and all three artifacts/stages to `stale`, preserved six Competitor DNA StageRuns, and did not start a new provider request.

## Security Checks

The runtime SQLite audit found no `Authorization`, `Bearer`, or `sk-` material in StageRun payloads, workflow artifacts, or provider credential metadata. Only credential references are persisted.

## Automated Verification

- Targeted Stage 4/5/6 tests: 40 passed.
- Competitor DNA service tests after the final prompt change: 3 passed.
- Domain typecheck: passed.
- Repository typecheck: passed.
- Whitespace check: passed.
- Full test suite: 252 tests in 43 files passed.
- Lint: passed.
- Desktop build: passed.
- Electron smoke: `workflow-contract`, `reference-restart`, and `reference-invalidation` passed. The default `create` mode remains fixture-blocked because it does not seed provider/model setup, so `Route channel profile` is correctly disabled.

## Known Limitations

- The final artifact still requires explicit human review/approval in the product UI.
- Runtime evidence uses an isolated synthetic project and does not approve or mutate a real user project.
- The provider response contract required several safe repair iterations; future model changes remain protected by strict schema and safe diagnostics.

## Manual User Test Steps

1. Open the existing manual-test project.
2. Click Run Transcript Cleaning once.
3. Observe the 9Router request count.
4. Review the cleaned transcript and comparison.
5. Approve Transcript Cleaning.
6. Run Reference Segmentation.
7. Confirm sponsor content is visible but excluded from DNA.
8. Approve Reference Segmentation.
9. Run Competitor DNA.
10. Review the evidence-backed output and approve or reject it.
11. Restart Electron and verify all three stage histories persist.
