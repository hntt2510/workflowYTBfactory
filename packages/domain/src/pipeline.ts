import { routeChannelProfile } from "./router";
import { seedChannelProfiles } from "./seedProfiles";
import type { ChannelProfile, FactoryProject, PipelineStage, VideoFormat, WorkflowMode } from "./types";

function uniqueId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function defaultTargetDuration(format: VideoFormat): string {
  return format === "long" ? "8-12 minutes" : "45-60 seconds";
}

const stageNames = [
  "Channel/Profile",
  "Reference Intake",
  "Competitor DNA",
  "Opportunity Map",
  "Idea Lab",
  "Originality Gate",
  "Research and Claim Map",
  "Outline",
  "Script",
  "Retention and Fact Review",
  "Scene Plan",
  "Shot Plan",
  "Visual Routing",
  "Asset Acquisition",
  "Voice Generation",
  "Timeline Assembly",
  "QA",
  "CapCut Draft",
  "Preview Render",
  "Packaging Export"
];

export function createPipelineStages(approvedThroughIndex = 0): PipelineStage[] {
  return stageNames.map((name, index) => ({
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    name,
    status: index <= approvedThroughIndex ? "approved" : "not_started",
    dependsOn: index === 0 ? [] : [stageNames[index - 1]!.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")]
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
    ? [{
        id: uniqueId("competitor"),
        ...(input.competitorReference.sourceUrl?.trim() ? { sourceUrl: input.competitorReference.sourceUrl.trim() } : {}),
        pastedTranscript: input.competitorReference.pastedTranscript,
        ...(input.competitorReference.notes?.trim() ? { notes: input.competitorReference.notes.trim() } : {}),
        createdAt: new Date().toISOString()
      }]
    : [];
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
    stages: createPipelineStages(0),
    ideas: [],
    claims: [],
    competitorReferences,
    scriptSections: [],
    scenes: [],
    shots: [],
    timeline: { fps: 30, items: [] }
  };
}
