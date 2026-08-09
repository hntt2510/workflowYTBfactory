import type { FactoryProject, WorkflowStageDefinition, WorkflowStageStatus } from "./types";
import { workflowStageDefinitions } from "./workflowRegistry";

export type WorkflowProgressState = "complete" | "current" | "not_applicable" | "optional" | Exclude<WorkflowStageStatus, "approved">;
export interface WorkflowProgressStage { stageId: string; name: string; internalStatus: WorkflowStageStatus; state: WorkflowProgressState; applicable: boolean; optional: boolean; }
export interface WorkflowProgressPhase { id: string; name: string; stageIds: readonly string[]; state: WorkflowProgressState; currentStageId?: string; currentStageName?: string; completedCount: number; totalCount: number; }
export interface WorkflowProgress { stages: WorkflowProgressStage[]; phases: WorkflowProgressPhase[]; completedCount: number; totalCount: number; percent: number; currentStageId?: string; currentStageName?: string; currentPhaseName?: string; }

export const workflowProgressPhaseDefinitions = [
  { id: "brief-and-research", name: "Brief & Research", stageIds: ["project-setup", "reference-intake"] },
  { id: "story", name: "Story", stageIds: ["idea-lab", "story-architecture", "script", "timing"] },
  { id: "direction", name: "Direction", stageIds: ["director-analysis", "scene-plan", "shot-plan"] },
  { id: "images", name: "Images", stageIds: ["prompt-preparation", "batch-planner", "gglab-generation-gate", "asset-review"] },
  { id: "handoff", name: "Production Handoff", stageIds: ["production-handoff"] }
] as const;

const preserved = new Set<WorkflowStageStatus>(["queued", "running", "needs_review", "needs_attention", "rejected", "failed", "stale"]);
export function isWorkflowStageApplicable(project: FactoryProject, definition: WorkflowStageDefinition): boolean {
  const mode = project.setup.inputMode ?? "topic";
  if (definition.applicability === "reference") return mode === "reference" || project.competitorReferences.some((reference) => reference.included !== false);
  if (definition.applicability === "not_existing_script") return mode !== "existing_script";
  return true;
}
function stateFor(stage: WorkflowProgressStage, current: boolean): WorkflowProgressState {
  if (!stage.applicable) return preserved.has(stage.internalStatus) ? stage.internalStatus as Exclude<WorkflowStageStatus, "approved"> : "not_applicable";
  if (stage.optional && stage.internalStatus !== "approved") return preserved.has(stage.internalStatus) ? stage.internalStatus as Exclude<WorkflowStageStatus, "approved"> : "optional";
  if (stage.internalStatus === "approved") return "complete";
  return current && (stage.internalStatus === "not_started" || stage.internalStatus === "ready") ? "current" : stage.internalStatus;
}
function phaseState(stages: WorkflowProgressStage[]): WorkflowProgressState {
  const required = stages.filter((stage) => stage.applicable && !stage.optional);
  for (const state of ["needs_attention", "failed", "needs_review", "running", "queued", "blocked", "rejected", "stale"] as const) if (stages.some((stage) => stage.state === state)) return state;
  if (!required.length) return "not_applicable";
  if (required.every((stage) => stage.state === "complete")) return "complete";
  return required.some((stage) => stage.state === "current") ? "current" : "not_started";
}
export function workflowProgressStateLabel(state: WorkflowProgressState): string { return ({ complete: "Complete", current: "Current", not_applicable: "Not applicable", optional: "Optional", not_started: "Not started", blocked: "Blocked", ready: "Ready", queued: "Queued", running: "Running", needs_review: "Needs review", needs_attention: "Needs attention", rejected: "Rejected", failed: "Failed", stale: "Stale" })[state]; }
export function resolveWorkflowProgress(project: FactoryProject): WorkflowProgress {
  const raw = new Map(project.stages.map((stage) => [stage.id, stage]));
  const base = workflowStageDefinitions.map((definition) => ({ stageId: definition.id, name: definition.name, internalStatus: raw.get(definition.id)?.status ?? "not_started" as WorkflowStageStatus, state: "not_started" as WorkflowProgressState, applicable: isWorkflowStageApplicable(project, definition), optional: definition.optional === true }));
  const required = base.filter((stage) => stage.applicable && !stage.optional);
  const current = required.find((stage) => stage.internalStatus !== "approved");
  const stages = base.map((stage) => ({ ...stage, state: stateFor(stage, stage.stageId === current?.stageId) }));
  const phases = workflowProgressPhaseDefinitions.map((definition) => { const phaseStages = definition.stageIds.map((id) => stages.find((stage) => stage.stageId === id)).filter((stage): stage is WorkflowProgressStage => Boolean(stage)); const requiredStages = phaseStages.filter((stage) => stage.applicable && !stage.optional); const phaseCurrent = phaseStages.find((stage) => stage.stageId === current?.stageId); return { ...definition, state: phaseState(phaseStages), ...(phaseCurrent ? { currentStageId: phaseCurrent.stageId, currentStageName: phaseCurrent.name } : {}), completedCount: requiredStages.filter((stage) => stage.state === "complete").length, totalCount: requiredStages.length }; });
  const completedCount = stages.filter((stage) => stage.applicable && !stage.optional && stage.state === "complete").length;
  const currentPhase = current ? phases.find((phase) => phase.currentStageId === current.stageId) : undefined;
  return { stages, phases, completedCount, totalCount: required.length, percent: required.length ? Math.round(completedCount / required.length * 100) : 0, ...(current ? { currentStageId: current.stageId, currentStageName: current.name } : {}), ...(currentPhase ? { currentPhaseName: currentPhase.name } : {}) };
}
