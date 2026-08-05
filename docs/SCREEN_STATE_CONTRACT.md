# Screen State Contract

Production-stage screens must make blocked work understandable instead of hiding downstream stages.

## Required Anatomy

Each production-stage screen should expose:

1. Stage header
2. Stage status and eligibility
3. Current approved input
4. Run controls
5. Latest run
6. Output review
7. Approval controls
8. Run history
9. Downstream impact

## Blocked Screens

A blocked screen remains viewable, but must show:

- current stage status
- missing prerequisites
- exact upstream action required
- action route back to the required screen

Disabled buttons must include actionable reasons.

## Reference Intake

Reference Intake follows:

Add reference -> normalize source identity -> detect duplicate -> save as draft -> validate -> edit/remove invalid references -> approve reference set -> unlock competitor workflow.

The Continue button requires:

- at least one included reference
- no unresolved duplicates
- no invalid included references
- validation complete
- reference set approved

## Competitor Workflow

Competitor workflow begins with Transcript Cleaning. Competitor DNA must not run directly from raw pasted references.

Required order:

Approved reference set -> Transcript Cleaning -> approve cleaned transcript -> Reference Segmentation -> approve segments -> Competitor DNA -> approve DNA.

Current implementation shows these states and gates, but does not add provider-backed runs.
