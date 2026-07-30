import type { FactoryProject, PipelineStage, ReferenceSetState, StageEligibility, WorkflowStageDefinition, WorkflowStageStatus } from "./types";
import { workflowStageDefinitions } from "./workflowRegistry";

export interface ProviderCapabilitySnapshot {
  textVerified?: boolean;
  imageVerified?: boolean;
  videoVerified?: boolean;
  audioVerified?: boolean;
}

export interface WorkflowStateSnapshot {
  stages: PipelineStage[];
  referenceSetStatus?: ReferenceSetState["status"];
  includedReferenceCount: number;
  invalidIncludedReferenceCount: number;
  duplicateReferenceCount: number;
  providerCapabilities?: ProviderCapabilitySnapshot;
}

export function buildWorkflowStateSnapshot(project: FactoryProject, providerCapabilities: ProviderCapabilitySnapshot = {}): WorkflowStateSnapshot {
  return {
    stages: normalizeProjectStages(project.stages),
    ...(project.referenceSet?.status ? { referenceSetStatus: project.referenceSet.status } : {}),
    includedReferenceCount: project.competitorReferences.filter((reference) => reference.included !== false).length,
    invalidIncludedReferenceCount: project.competitorReferences.filter(
      (reference) => reference.included !== false && (reference.status === "invalid" || reference.status === "duplicate")
    ).length,
    duplicateReferenceCount: project.competitorReferences.filter((reference) => reference.status === "duplicate").length,
    providerCapabilities
  };
}

export function normalizeProjectStages(stages: PipelineStage[]): PipelineStage[] {
  const known = new Map(stages.map((stage) => [stage.id, stage]));
  return workflowStageDefinitions.map((definition, index) => {
    const existing = known.get(definition.id);
    if (existing) {
      return {
        ...existing,
        name: definition.name,
        dependsOn: definition.dependsOn
      };
    }
    return {
      id: definition.id,
      name: definition.name,
      status: index === 0 ? "approved" : "not_started",
      dependsOn: definition.dependsOn
    };
  });
}

export function resolveStageEligibilities(project: FactoryProject, providerCapabilities: ProviderCapabilitySnapshot = {}): StageEligibility[] {
  const snapshot = buildWorkflowStateSnapshot(project, providerCapabilities);
  return workflowStageDefinitions.map((definition) => resolveStageEligibility(definition, snapshot));
}

export function resolveStageEligibility(definition: WorkflowStageDefinition, snapshot: WorkflowStateSnapshot): StageEligibility {
  const explicitStatus = snapshot.stages.find((stage) => stage.id === definition.id)?.status;
  if (explicitStatus === "running" || explicitStatus === "queued") {
    return baseEligibility(definition.id, explicitStatus, false, false, false, []);
  }
  if (explicitStatus === "needs_review") {
    return baseEligibility(definition.id, "needs_review", false, true, true, []);
  }
  if (explicitStatus === "approved") {
    return baseEligibility(definition.id, "approved", false, false, false, []);
  }
  if (explicitStatus === "failed" || explicitStatus === "rejected" || explicitStatus === "stale") {
    return baseEligibility(definition.id, explicitStatus, true, false, false, []);
  }

  const blockingReasons = referenceBlockingReasons(definition, snapshot)
    .concat(dependencyBlockingReasons(definition, snapshot))
    .concat(providerBlockingReasons(definition, snapshot));
  if (blockingReasons.length) {
    return baseEligibility(definition.id, "blocked", false, false, false, blockingReasons);
  }
  return baseEligibility(definition.id, "ready", true, false, false, []);
}

export function firstActionableStage(project: FactoryProject, providerCapabilities: ProviderCapabilitySnapshot = {}): StageEligibility {
  const eligibilities = resolveStageEligibilities(project, providerCapabilities);
  return eligibilities.find((stage) => stage.runnable || stage.reviewable) ?? eligibilities[0]!;
}

function dependencyBlockingReasons(definition: WorkflowStageDefinition, snapshot: WorkflowStateSnapshot): StageEligibility["blockingReasons"] {
  return definition.dependsOn
    .filter((dependencyId) => snapshot.stages.find((stage) => stage.id === dependencyId)?.status !== "approved")
    .map((dependencyId) => {
      const dependencyDefinition = workflowStageDefinitions.find((stage) => stage.id === dependencyId);
      return {
        code: "DEPENDENCY_NOT_APPROVED",
        message: `Approve ${dependencyDefinition?.name ?? dependencyId} before running ${definition.name}.`,
        ...(dependencyDefinition?.screenRoute ? { actionRoute: dependencyDefinition.screenRoute } : {})
      };
    });
}

function referenceBlockingReasons(definition: WorkflowStageDefinition, snapshot: WorkflowStateSnapshot): StageEligibility["blockingReasons"] {
  if (definition.id === "reference-validation") {
    if (snapshot.includedReferenceCount === 0) {
      return [{
        code: "NO_INCLUDED_REFERENCES",
        message: "Add and include at least one competitor reference before validating the reference set.",
        actionRoute: "reference-intake"
      }];
    }
    if (snapshot.duplicateReferenceCount > 0) {
      return [{
        code: "UNRESOLVED_DUPLICATES",
        message: "Resolve duplicate references before approving the reference set.",
        actionRoute: "reference-intake"
      }];
    }
    if (snapshot.invalidIncludedReferenceCount > 0) {
      return [{
        code: "INVALID_INCLUDED_REFERENCES",
        message: "Fix or exclude invalid references before approving the reference set.",
        actionRoute: "reference-intake"
      }];
    }
  }
  if (definition.requiredInputTypes.includes("reference-set.approved") && snapshot.referenceSetStatus !== "approved") {
    return [{
      code: "REFERENCE_SET_NOT_APPROVED",
      message: "Approve the current reference set before running the competitor workflow.",
      actionRoute: "reference-intake"
    }];
  }
  return [];
}

function providerBlockingReasons(definition: WorkflowStageDefinition, snapshot: WorkflowStateSnapshot): StageEligibility["blockingReasons"] {
  if (definition.executionKind === "provider_text" && !snapshot.providerCapabilities?.textVerified) {
    return [{
      code: "TEXT_MODEL_NOT_VERIFIED",
      message: "Text model selected but not verified. Open Providers -> Text Model Certification.",
      actionRoute: "providers"
    }];
  }
  if (definition.executionKind === "provider_image" && !snapshot.providerCapabilities?.imageVerified) {
    return [{
      code: "IMAGE_MODEL_NOT_VERIFIED",
      message: "Image model capability is not verified.",
      actionRoute: "providers"
    }];
  }
  if (definition.executionKind === "provider_video" && !snapshot.providerCapabilities?.videoVerified) {
    return [{
      code: "VIDEO_MODEL_NOT_VERIFIED",
      message: "Video model capability is not verified.",
      actionRoute: "providers"
    }];
  }
  if (definition.executionKind === "provider_audio" && !snapshot.providerCapabilities?.audioVerified) {
    return [{
      code: "AUDIO_MODEL_NOT_VERIFIED",
      message: "Voice generation capability is not verified.",
      actionRoute: "providers"
    }];
  }
  return [];
}

function baseEligibility(
  stageId: string,
  status: WorkflowStageStatus,
  runnable: boolean,
  reviewable: boolean,
  approvable: boolean,
  blockingReasons: StageEligibility["blockingReasons"]
): StageEligibility {
  return { stageId, status, viewable: true, runnable, reviewable, approvable, blockingReasons };
}
