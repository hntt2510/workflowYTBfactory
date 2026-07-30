import { routeChannelProfile } from "./router";
import { seedChannelProfiles } from "./seedProfiles";
import type { ChannelProfile, FactoryProject, PipelineStage, VideoFormat, WorkflowMode } from "./types";
import { normalizeReferenceIdentity } from "./referenceIdentity";
import { workflowStageDefinitions } from "./workflowRegistry";

function uniqueId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function defaultTargetDuration(format: VideoFormat): string {
  return format === "long" ? "8-12 minutes" : "45-60 seconds";
}

export function createPipelineStages(approvedThroughIndex = 0): PipelineStage[] {
  return workflowStageDefinitions.map((definition, index) => ({
    id: definition.id,
    name: definition.name,
    status: index <= approvedThroughIndex ? "approved" : "not_started",
    dependsOn: definition.dependsOn
  }));
}

export function createFixtureProject(input: {
  topic: string;
  format: VideoFormat;
  targetLanguage: string;
  targetDuration?: string;
  projectName?: string;
  workflowMode?: WorkflowMode;
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
  const stages = createPipelineStages(0).map((stage) => (
    competitorReferences.length && stage.id === "reference-intake" ? { ...stage, status: "approved" as const } : stage
  ));
  return {
    id: uniqueId("project"),
    topic: input.topic,
    format: input.format,
    targetLanguage: input.targetLanguage,
    setup: {
      projectName: input.projectName?.trim() || input.topic,
      targetDuration: input.targetDuration?.trim() || defaultTargetDuration(input.format),
      language: input.targetLanguage,
      workflowMode: input.workflowMode ?? "guided"
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
