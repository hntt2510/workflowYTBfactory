import type { WorkflowStageStatus } from "./types";

const allowedTransitions: Readonly<Record<WorkflowStageStatus, readonly WorkflowStageStatus[]>> = {
  not_started: ["blocked", "ready", "queued"],
  blocked: ["ready"],
  ready: ["queued", "running"],
  queued: ["running"],
  running: ["needs_review", "failed"],
  needs_review: ["approved", "rejected"],
  approved: ["stale"],
  rejected: [],
  failed: [],
  stale: []
};

export function canTransitionWorkflowStage(from: WorkflowStageStatus, to: WorkflowStageStatus): boolean {
  return allowedTransitions[from].includes(to);
}

export function assertWorkflowStageTransition(from: WorkflowStageStatus, to: WorkflowStageStatus): void {
  if (!canTransitionWorkflowStage(from, to)) throw new Error(`Workflow stage transition is not allowed: ${from} -> ${to}`);
}
