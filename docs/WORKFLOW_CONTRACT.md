# Long/Short Factory Workflow Contract

Long/Short Factory is a stage-gated local YouTube production workspace. It must never behave as a one-click full-project generator.

Required flow:

1. Create project.
2. Provide inputs.
3. Validate inputs.
4. Run exactly one stage.
5. Inspect generated output.
6. Edit if needed.
7. Approve or reject.
8. Unlock the next stage.

Every downstream output must be traceable to an approved upstream version.

## Status Vocabulary

All production stages use:

- `not_started`
- `blocked`
- `ready`
- `queued`
- `running`
- `needs_review`
- `approved`
- `rejected`
- `failed`
- `stale`

Renderer code must not invent ambiguous statuses like `Done`, `Complete`, or `Ready to go` unless they are explicitly mapped to this vocabulary.

## Stage Principle

Every stage follows:

Input -> Eligibility -> Explicit Run -> Running -> Output -> Validation -> Needs Review -> User Edit -> Approve or Reject -> Unlock Next Stage.

The only automatic operations allowed are deterministic local validations that do not consume provider quota and do not create editorial content.

## Provider Rules

Provider-backed stages require:

- credential saved
- endpoint reachable
- model selected
- required capability verified

Discovered or selected model IDs are not verified capabilities.

No provider-backed stage may run on navigation, project open, input save, restart, or approval.

## Approval Rules

Only `needs_review` output may be approved or rejected.

Allowed transitions:

- `running` -> `needs_review`
- `needs_review` -> `approved`
- `needs_review` -> `rejected`
- `approved` -> `stale`

Forbidden transitions:

- `running` -> `approved`
- `failed` -> `approved`
- `rejected` -> `approved`
- `stale` -> `approved` automatically

All transitions go through trusted main-process/domain services.

## Current Implementation Boundary

This contract establishes registry, eligibility, navigation state, reference validation, duplicate prevention, reference-set approval, and documentation.

It does not implement provider-backed production stages, FFmpeg, CapCut, queue execution, image/video/TTS/STT generation, or publishing.
