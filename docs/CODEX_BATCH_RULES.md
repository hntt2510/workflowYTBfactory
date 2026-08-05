# Codex Batch Rules

Every future batch must reference:

- `docs/WORKFLOW_CONTRACT.md`
- `docs/WORKFLOW_STAGE_MATRIX.md`
- `docs/SCREEN_STATE_CONTRACT.md`
- `docs/CODEX_BATCH_RULES.md`

## Required Discipline

- One observable behavior per batch.
- Plan before code.
- Use one focused CodeGraph query.
- State explicit in-scope and out-of-scope.
- Avoid broad refactoring.
- Do not implement downstream stages opportunistically.
- Use mocked provider tests for provider integrations.
- Provide manual Electron verification.
- Use one commit per batch.
- Stop after acceptance evidence.

## Forbidden Shortcuts

- No one-click full project generation.
- No renderer-owned workflow dependency rules.
- No direct renderer status mutation.
- No provider call without explicit user confirmation.
- No capability inference from model names.
- No fake downstream output to make progress look complete.
