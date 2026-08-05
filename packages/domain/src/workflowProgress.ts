import type { FactoryProject, WorkflowStageStatus } from "./types";
import { workflowStageDefinitions } from "./workflowRegistry";

export type WorkflowProgressState =
  | "complete"
  | "current"
  | "not_applicable"
  | "optional"
  | Exclude<WorkflowStageStatus, "approved">;

export interface WorkflowProgressStage {
  stageId: string;
  name: string;
  internalStatus: WorkflowStageStatus;
  state: WorkflowProgressState;
  applicable: boolean;
  optional: boolean;
}

export interface WorkflowProgressPhase {
  id: string;
  name: string;
  stageIds: readonly string[];
  state: WorkflowProgressState;
  currentStageId?: string;
  currentStageName?: string;
  completedCount: number;
  totalCount: number;
}

export interface WorkflowProgress {
  stages: WorkflowProgressStage[];
  phases: WorkflowProgressPhase[];
  completedCount: number;
  totalCount: number;
  percent: number;
  currentStageId?: string;
  currentStageName?: string;
  currentPhaseName?: string;
}

export const workflowProgressPhaseDefinitions = [
  {
    id: "reference-analysis",
    name: "Reference analysis",
    stageIds: ["reference-intake", "reference-validation", "transcript-cleaning", "reference-segmentation", "competitor-dna", "opportunity-map"]
  },
  {
    id: "content-preparation",
    name: "Preparing content",
    stageIds: ["idea-lab", "originality-review", "research-source-intake", "claim-map", "outline", "script", "fact-review", "retention-review", "scene-plan", "shot-plan"]
  },
  {
    id: "scene-review",
    name: "Scene review",
    stageIds: ["visual-routing", "prompt-preparation", "asset-acquisition", "asset-review"]
  },
  {
    id: "voice-and-captions",
    name: "Voice and captions",
    stageIds: ["voice-generation", "subtitle-preparation", "timeline-assembly"]
  },
  {
    id: "final-preview",
    name: "Final preview",
    stageIds: ["preview-render", "qa"]
  },
  {
    id: "export",
    name: "Export",
    stageIds: ["capcut-draft", "packaging-export"]
  }
] as const;

const referenceStageIds = new Set([
  "reference-intake",
  "reference-validation",
  "transcript-cleaning",
  "reference-segmentation",
  "competitor-dna",
  "opportunity-map"
]);

const noReferenceTopicStageIds = new Set(["research-source-intake", "claim-map"]);
const existingScriptSkippedStageIds = new Set(["idea-lab", "originality-review", "research-source-intake", "claim-map", "outline"]);
type PreservedInactiveStatus = "queued" | "running" | "needs_review" | "needs_attention" | "rejected" | "failed" | "stale";
const inactiveStatusesToPreserve = new Set<PreservedInactiveStatus>(["queued", "running", "needs_review", "needs_attention", "rejected", "failed", "stale"]);

function isPreservedInactiveStatus(status: WorkflowStageStatus): status is PreservedInactiveStatus {
  return inactiveStatusesToPreserve.has(status as PreservedInactiveStatus);
}

function hasIncludedReferences(project: FactoryProject): boolean {
  return project.competitorReferences.some((reference) => reference.included !== false);
}

function isReferenceWorkflow(project: FactoryProject): boolean {
  return (project.setup.inputMode ?? "topic") === "reference" || hasIncludedReferences(project);
}

function isStageApplicable(project: FactoryProject, stageId: string): boolean {
  const inputMode = project.setup.inputMode ?? "topic";
  if (referenceStageIds.has(stageId)) return isReferenceWorkflow(project);
  if (inputMode === "existing_script" && existingScriptSkippedStageIds.has(stageId)) return false;
  if (inputMode === "topic" && !isReferenceWorkflow(project) && noReferenceTopicStageIds.has(stageId)) return false;
  return true;
}

function stageState(stage: WorkflowProgressStage, isCurrent: boolean): WorkflowProgressState {
  if (!stage.applicable) return isPreservedInactiveStatus(stage.internalStatus) ? stage.internalStatus : "not_applicable";
  if (stage.optional) {
    if (stage.internalStatus === "approved") return "complete";
    return isPreservedInactiveStatus(stage.internalStatus) ? stage.internalStatus : "optional";
  }
  if (stage.internalStatus === "approved") return "complete";
  if (isCurrent && (stage.internalStatus === "not_started" || stage.internalStatus === "ready")) return "current";
  return stage.internalStatus;
}

function phaseState(stages: WorkflowProgressStage[]): WorkflowProgressState {
  const required = stages.filter((stage) => stage.applicable && !stage.optional);
  for (const state of ["needs_attention", "failed", "needs_review", "running", "queued", "blocked", "rejected", "stale"] as const) {
    if (stages.some((stage) => stage.state === state)) return state;
  }
  if (!required.length) {
    return "not_applicable";
  }
  if (required.every((stage) => stage.state === "complete")) return "complete";
  if (required.some((stage) => stage.state === "current")) return "current";
  return "not_started";
}

export function workflowProgressStateLabel(state: WorkflowProgressState): string {
  const labels: Record<WorkflowProgressState, string> = {
    complete: "Complete",
    current: "Current",
    not_applicable: "Not applicable",
    optional: "Optional",
    not_started: "Not started",
    blocked: "Blocked",
    ready: "Ready",
    queued: "Queued",
    running: "Running",
    needs_review: "Needs review",
    needs_attention: "Needs attention",
    rejected: "Rejected",
    failed: "Failed",
    stale: "Stale"
  };
  return labels[state];
}

export function resolveWorkflowProgress(project: FactoryProject): WorkflowProgress {
  const rawStages = new Map(project.stages.map((stage) => [stage.id, stage]));
  const baseStages: WorkflowProgressStage[] = workflowStageDefinitions.map((definition) => {
    const raw = rawStages.get(definition.id);
    return {
      stageId: definition.id,
      name: definition.name,
      internalStatus: raw?.status ?? "not_started",
      state: "not_started",
      applicable: isStageApplicable(project, definition.id),
      optional: definition.id === "capcut-draft"
    };
  });
  const required = baseStages.filter((stage) => stage.applicable && !stage.optional);
  const current = required.find((stage) => stage.internalStatus !== "approved");
  const stages = baseStages.map((stage) => ({ ...stage, state: stageState(stage, stage.stageId === current?.stageId) }));
  const completed = stages.filter((stage) => stage.applicable && !stage.optional && stage.state === "complete");
  const phases = workflowProgressPhaseDefinitions.map((definition) => {
    const phaseStages = definition.stageIds
      .map((stageId) => stages.find((stage) => stage.stageId === stageId))
      .filter((stage): stage is WorkflowProgressStage => Boolean(stage));
    const phaseRequired = phaseStages.filter((stage) => stage.applicable && !stage.optional);
    const phaseCurrent = phaseRequired.find((stage) => stage.stageId === current?.stageId);
    return {
      ...definition,
      state: phaseState(phaseStages),
      ...(phaseCurrent ? { currentStageId: phaseCurrent.stageId, currentStageName: phaseCurrent.name } : {}),
      completedCount: phaseRequired.filter((stage) => stage.state === "complete").length,
      totalCount: phaseRequired.length
    };
  });
  const currentPhase = current ? phases.find((phase) => phase.currentStageId === current.stageId) : undefined;
  const totalCount = required.length;
  return {
    stages,
    phases,
    completedCount: completed.length,
    totalCount,
    percent: totalCount ? Math.round((completed.length / totalCount) * 100) : 0,
    ...(current ? { currentStageId: current.stageId, currentStageName: current.name } : {}),
    ...(currentPhase ? { currentPhaseName: currentPhase.name } : {})
  };
}
