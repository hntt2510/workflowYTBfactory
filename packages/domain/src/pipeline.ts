import { routeChannelProfile } from "./router";
import { seedChannelProfiles } from "./seedProfiles";
import type { ChannelProfile, FactoryProject, PipelineStage, VideoFormat, VisualWorkflowMode, WorkflowMode } from "./types";
import { normalizeReferenceIdentity } from "./referenceIdentity";
import { characterVersionIsApproved, resolveApprovedCharacterVersion } from "./character";
import { workflowStageDefinitions } from "./workflowRegistry";
import { legacyWorkflowStageDefinitions } from "./legacyWorkflowRegistry";

function uniqueId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function defaultTargetDuration(format: VideoFormat): string {
  return format === "long" ? "8-12 minutes" : "45-60 seconds";
}

export function createPipelineStages(approvedThroughIndex = 0, workflowContract: "preproduction" | "legacy" = "legacy"): PipelineStage[] {
  const definitions = workflowContract === "legacy" ? [...workflowStageDefinitions, ...legacyWorkflowStageDefinitions] : workflowStageDefinitions;
  return definitions.map((definition, index) => ({
    id: definition.id,
    name: definition.name,
    status: index <= approvedThroughIndex ? "approved" : "not_started",
    dependsOn: definition.dependsOn
  }));
}

export function createFixtureProject(input: {
  topic: string;
  synthetic?: boolean;
  format: VideoFormat;
  targetLanguage: string;
  selectedProfileId?: string;
  targetDuration?: string;
  projectName?: string;
  workflowMode?: WorkflowMode;
  workflowContract?: "preproduction" | "legacy";
  visualWorkflow?: VisualWorkflowMode;
  characterVersionId?: string;
  inputMode?: "topic" | "existing_script" | "reference";
  aspectRatio?: "16:9" | "9:16" | "1:1";
  visualStyle?: "vox-documentary";
  voiceId?: string;
  outputResolution?: "1080p" | "720p";
  sourceScript?: string;
  referenceUrl?: string;
  competitorReference?: {
    sourceUrl?: string;
    pastedTranscript: string;
    notes?: string;
  };
  profiles?: ChannelProfile[];
}): FactoryProject {
  const profiles = input.profiles ?? seedChannelProfiles;
  const routeDecision = routeChannelProfile(profiles, input);
  const profile = profiles.find((item) => item.id === routeDecision.selectedProfileId) ?? profiles[0]!;
  const competitorReferences = input.competitorReference?.pastedTranscript.trim()
    ? (() => {
        const sourceUrl = input.competitorReference.sourceUrl?.trim();
        const identityKey = normalizeReferenceIdentity(sourceUrl);
        return [{
          id: uniqueId("competitor"),
          ...(identityKey ? { identityKey } : {}),
          ...(sourceUrl ? { sourceUrl } : {}),
          pastedTranscript: input.competitorReference.pastedTranscript,
          ...(input.competitorReference.notes?.trim() ? { notes: input.competitorReference.notes.trim() } : {}),
          status: "draft" as const,
          included: true,
          version: 1,
          createdAt: new Date().toISOString()
        }];
      })()
    : [];
  const selectedCharacterVersion = resolveApprovedCharacterVersion(profile, input.characterVersionId);
  const boundCharacterVersionId = selectedCharacterVersion?.id ?? input.characterVersionId;
  const stages = createPipelineStages(0, input.workflowContract).map((stage) => (
    competitorReferences.length && stage.id === "reference-intake"
      ? { ...stage, status: "approved" as const }
      : stage.id === "character-preparation" && input.visualWorkflow !== "legacy" && characterVersionIsApproved(selectedCharacterVersion)
        ? { ...stage, status: "approved" as const }
        : stage
  ));
  return {
    id: uniqueId("project"),
    ...(input.synthetic ? { synthetic: true } : {}),
    topic: input.topic,
    format: input.format,
    targetLanguage: input.targetLanguage,
    setup: {
      projectName: input.projectName?.trim() || input.topic,
      targetDuration: input.targetDuration?.trim() || defaultTargetDuration(input.format),
      language: input.targetLanguage,
      workflowMode: input.workflowMode ?? "semi_automatic",
      workflowContract: input.workflowContract ?? "legacy",
      visualWorkflow: input.visualWorkflow ?? (input.workflowMode === "guided" ? "legacy" : "character_first"),
      ...(boundCharacterVersionId ? { characterVersionId: boundCharacterVersionId } : {}),
      inputMode: input.inputMode ?? (input.competitorReference ? "reference" : "topic"),
      aspectRatio: input.aspectRatio ?? (input.format === "short" ? "9:16" : "16:9"),
      visualStyle: input.visualStyle ?? "vox-documentary",
      ...(input.voiceId ? { voiceId: input.voiceId } : {}),
      outputResolution: input.outputResolution ?? "1080p",
      ...(input.sourceScript?.trim() ? { sourceScript: input.sourceScript.trim() } : {}),
      ...(input.referenceUrl?.trim() ? { referenceUrl: input.referenceUrl.trim() } : {})
    },
    profileId: profile.id,
    routeDecision,
    stages,
    referenceSet: competitorReferences.length ? { status: "needs_validation" } : { status: "not_started" },
    ideas: [],
    claims: [],
    competitorReferences,
    scriptSections: [],
    scenes: [],
    shots: [],
    timeline: { fps: 30, items: [] }
  };
}
