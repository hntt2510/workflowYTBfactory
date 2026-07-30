# Agent Harness Workflow

1. Product Advocate records user stories, measurable acceptance criteria, risks, and unanswered questions.
2. Planner creates a schema-valid job in `.harness/jobs/` with bounded paths, dependencies, verification commands, and escalation conditions.
3. Builder creates `agent/<job-id>` through `scripts/agent-harness/create-worktree.ps1`, records an active lock, implements only the job, verifies it, and commits.
4. Reviewer independently compares the commit diff with the job and writes an approve/reject result in `.harness/reviews/` without changing code.
5. QA independently runs the required commands and writes pass/fail evidence in `.harness/evaluations/`.
6. Integrator runs `merge-gate.ps1`; only an explicit `-Merge` may merge after every gate passes.

Job statuses transition only as follows: `planned -> ready -> active -> review_required -> changes_requested -> active`; `review_required -> qa_required`; `qa_required -> passed`; `passed -> merged`. `planned`, `ready`, `active`, `review_required`, `changes_requested`, and `qa_required` may transition to `blocked`, `failed`, or `human_review` when supported by evidence. `blocked`, `failed`, and `human_review` return only to `planned` or `ready` after a documented human decision. No transition skips from `active` to `merged`.
