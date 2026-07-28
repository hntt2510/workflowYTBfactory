import { generateIdeaLab } from "./ideaLab";
import { routeChannelProfile } from "./router";
import { seedChannelProfiles } from "./seedProfiles";
import { createStarterClaims, createStarterScript, scenesFromScript, shotsFromScenes } from "./scriptEngine";
import { assembleTimeline } from "./timeline";
import type { ChannelProfile, FactoryProject, PipelineStage, VideoFormat } from "./types";

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
  profiles?: ChannelProfile[];
}): FactoryProject {
  const profiles = input.profiles ?? seedChannelProfiles;
  const routeDecision = routeChannelProfile(profiles, input);
  const profile = profiles.find((item) => item.id === routeDecision.selectedProfileId) ?? profiles[0]!;
  const ideas = generateIdeaLab(input.topic, profile, 12);
  const claims = createStarterClaims(input.topic, profile.id);
  const scriptSections = createStarterScript(input.topic, claims.map((claim) => claim.id));
  const scenes = scenesFromScript(scriptSections);
  const shots = shotsFromScenes(scenes);
  const approvedIdeaId = ideas[0]?.id;
  return {
    id: `project-${Date.now()}`,
    topic: input.topic,
    format: input.format,
    targetLanguage: input.targetLanguage,
    profileId: profile.id,
    routeDecision,
    stages: createPipelineStages(4),
    ideas,
    ...(approvedIdeaId ? { approvedIdeaId } : {}),
    claims,
    scriptSections,
    scenes,
    shots,
    timeline: assembleTimeline(shots)
  };
}
