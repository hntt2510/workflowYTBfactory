import type { WorkflowStageDefinition } from "./types";

export const perReferenceArtifactStages: ReadonlySet<string> = new Set(["transcript-cleaning", "reference-segmentation", "competitor-dna"]);

export const workflowStageDefinitions = [
  {
    id: "project-setup",
    name: "Project Setup",
    order: 1,
    screenRoute: "project-overview",
    dependsOn: [],
    requiredInputTypes: ["project.setup"],
    outputArtifactTypes: ["project.setup"],
    runnerId: "script-9router",
    executionKind: "manual_input",
    approvalRequired: true,
    invalidates: ["reference-intake", "reference-validation"]
  },
  {
    id: "reference-intake",
    name: "Reference Intake",
    order: 2,
    screenRoute: "reference-intake",
    dependsOn: ["project-setup"],
    requiredInputTypes: ["project.setup"],
    outputArtifactTypes: ["reference.draft"],
    runnerId: null,
    executionKind: "manual_input",
    approvalRequired: false,
    invalidates: ["reference-validation"]
  },
  {
    id: "reference-validation",
    name: "Reference Validation",
    order: 3,
    screenRoute: "reference-intake",
    dependsOn: ["reference-intake"],
    requiredInputTypes: ["reference.draft"],
    outputArtifactTypes: ["reference-set.validated"],
    runnerId: "reference-validation-local",
    executionKind: "local_deterministic",
    approvalRequired: true,
    invalidates: ["transcript-cleaning"]
  },
  {
    id: "transcript-cleaning",
    name: "Transcript Cleaning",
    order: 4,
    screenRoute: "competitor-dna",
    dependsOn: ["reference-validation"],
    requiredInputTypes: ["reference-set.approved"],
    outputArtifactTypes: ["transcript.cleaned"],
    runnerId: "transcript-cleaning-9router",
    executionKind: "provider_text",
    requiredCapability: "text",
    approvalRequired: true,
    invalidates: ["reference-segmentation"]
  },
  {
    id: "reference-segmentation",
    name: "Reference Segmentation",
    order: 5,
    screenRoute: "competitor-dna",
    dependsOn: ["transcript-cleaning"],
    requiredInputTypes: ["transcript.cleaned.approved"],
    outputArtifactTypes: ["reference-segments"],
    runnerId: "reference-segmentation-9router",
    executionKind: "provider_text",
    requiredCapability: "text",
    approvalRequired: true,
    invalidates: ["competitor-dna"]
  },
  {
    id: "competitor-dna",
    name: "Competitor DNA",
    order: 6,
    screenRoute: "competitor-dna",
    dependsOn: ["reference-segmentation"],
    requiredInputTypes: ["reference-segments.approved"],
    outputArtifactTypes: ["competitor-dna-card"],
    runnerId: "competitor-dna-9router",
    executionKind: "provider_text",
    requiredCapability: "text",
    approvalRequired: true,
    invalidates: ["opportunity-map"]
  },
  {
    id: "opportunity-map",
    name: "Opportunity Map",
    order: 7,
    screenRoute: "idea-lab",
    dependsOn: ["competitor-dna"],
    requiredInputTypes: ["competitor-dna.approved"],
    outputArtifactTypes: ["opportunity-map"],
    runnerId: "opportunity-map-9router",
    executionKind: "provider_text",
    requiredCapability: "text",
    approvalRequired: true,
    invalidates: ["idea-lab"]
  },
  {
    id: "idea-lab",
    name: "Idea Lab",
    order: 8,
    screenRoute: "idea-lab",
    dependsOn: ["opportunity-map"],
    requiredInputTypes: ["opportunity-map.approved"],
    outputArtifactTypes: ["idea-candidates"],
    runnerId: "idea-lab-9router",
    executionKind: "provider_text",
    requiredCapability: "text",
    approvalRequired: true,
    invalidates: ["originality-review"]
  },
  {
    id: "originality-review",
    name: "Originality Review",
    order: 9,
    screenRoute: "idea-lab",
    dependsOn: ["idea-lab"],
    requiredInputTypes: ["idea.approved"],
    outputArtifactTypes: ["originality-review"],
    runnerId: "originality-review-local",
    executionKind: "local_deterministic",
    approvalRequired: true,
    invalidates: ["research-source-intake"]
  },
  {
    id: "research-source-intake",
    name: "Research Source Intake",
    order: 10,
    screenRoute: "research-claims",
    dependsOn: ["originality-review"],
    requiredInputTypes: ["idea.originality-approved"],
    outputArtifactTypes: ["research-sources"],
    runnerId: "research-source-intake-manual",
    executionKind: "manual_input",
    approvalRequired: true,
    invalidates: ["claim-map"]
  },
  {
    id: "claim-map",
    name: "Claim Map",
    order: 11,
    screenRoute: "research-claims",
    dependsOn: ["research-source-intake"],
    requiredInputTypes: ["research-sources.approved"],
    outputArtifactTypes: ["claim-map"],
    runnerId: "claim-map-9router",
    executionKind: "provider_text",
    requiredCapability: "text",
    approvalRequired: true,
    invalidates: ["outline"]
  },
  {
    id: "outline",
    name: "Outline",
    order: 12,
    screenRoute: "script",
    dependsOn: ["claim-map"],
    requiredInputTypes: ["claim-map.approved"],
    outputArtifactTypes: ["outline"],
    runnerId: "outline-9router",
    executionKind: "provider_text",
    requiredCapability: "text",
    approvalRequired: true,
    invalidates: ["script"]
  },
  {
    id: "script",
    name: "Script",
    order: 13,
    screenRoute: "script",
    dependsOn: ["outline"],
    requiredInputTypes: ["outline.approved"],
    outputArtifactTypes: ["script"],
    runnerId: "script-9router",
    executionKind: "provider_text",
    requiredCapability: "text",
    approvalRequired: true,
    invalidates: ["fact-review"]
  },
  {
    id: "fact-review",
    name: "Fact Review",
    order: 14,
    screenRoute: "script",
    dependsOn: ["script"],
    requiredInputTypes: ["script.approved"],
    outputArtifactTypes: ["fact-review"],
    runnerId: "fact-review-local",
    executionKind: "local_deterministic",
    approvalRequired: true,
    invalidates: ["retention-review"]
  },
  {
    id: "retention-review",
    name: "Retention Review",
    order: 15,
    screenRoute: "script",
    dependsOn: ["fact-review"],
    requiredInputTypes: ["script.fact-reviewed"],
    outputArtifactTypes: ["retention-review"],
    runnerId: "retention-review-9router",
    executionKind: "provider_text",
    requiredCapability: "text",
    approvalRequired: true,
    invalidates: ["scene-plan"]
  },
  {
    id: "scene-plan",
    name: "Scene Plan",
    order: 16,
    screenRoute: "scenes",
    dependsOn: ["retention-review"],
    requiredInputTypes: ["script.review-approved"],
    outputArtifactTypes: ["scene-plan"],
    runnerId: "scene-plan-9router",
    executionKind: "provider_text",
    requiredCapability: "text",
    approvalRequired: true,
    invalidates: ["shot-plan"]
  },
  {
    id: "shot-plan",
    name: "Shot Plan",
    order: 17,
    screenRoute: "shots",
    dependsOn: ["scene-plan"],
    requiredInputTypes: ["scene-plan.approved"],
    outputArtifactTypes: ["shot-plan"],
    runnerId: "shot-plan-9router",
    executionKind: "provider_text",
    requiredCapability: "text",
    approvalRequired: true,
    invalidates: ["visual-routing"]
  },
  {
    id: "visual-routing",
    name: "Visual Routing",
    order: 18,
    screenRoute: "visuals",
    dependsOn: ["shot-plan"],
    requiredInputTypes: ["shot-plan.approved"],
    outputArtifactTypes: ["visual-routing"],
    runnerId: "visual-routing-local",
    executionKind: "local_deterministic",
    approvalRequired: true,
    invalidates: ["prompt-preparation"]
  },
  {
    id: "prompt-preparation",
    name: "Prompt Preparation",
    order: 19,
    screenRoute: "visuals",
    dependsOn: ["visual-routing"],
    requiredInputTypes: ["visual-routing.approved"],
    outputArtifactTypes: ["visual-prompts"],
    runnerId: "prompt-preparation-9router",
    executionKind: "provider_text",
    requiredCapability: "text",
    approvalRequired: true,
    invalidates: ["asset-acquisition"]
  },
  {
    id: "asset-acquisition",
    name: "Asset Acquisition",
    order: 20,
    screenRoute: "visuals",
    dependsOn: ["prompt-preparation"],
    requiredInputTypes: ["visual-prompts.approved"],
    outputArtifactTypes: ["asset"],
    runnerId: "asset-acquisition-9router",
    executionKind: "provider_image",
    requiredCapability: "image",
    approvalRequired: true,
    invalidates: ["asset-review"]
  },
  {
    id: "asset-review",
    name: "Asset Review",
    order: 21,
    screenRoute: "visuals",
    dependsOn: ["asset-acquisition"],
    requiredInputTypes: ["asset.draft"],
    outputArtifactTypes: ["asset.approved"],
    runnerId: "asset-review-user-action",
    executionKind: "manual_input",
    approvalRequired: true,
    invalidates: ["voice-generation"]
  },
  {
    id: "voice-generation",
    name: "Voice Generation",
    order: 22,
    screenRoute: "voice",
    dependsOn: ["asset-review"],
    requiredInputTypes: ["script.approved", "asset.approved"],
    outputArtifactTypes: ["voice-segment"],
    runnerId: "edge-tts",
    executionKind: "provider_audio",
    requiredCapability: "audio",
    approvalRequired: true,
    invalidates: ["subtitle-preparation"]
  },
  {
    id: "subtitle-preparation",
    name: "Subtitle Preparation",
    order: 23,
    screenRoute: "timeline",
    dependsOn: ["voice-generation"],
    requiredInputTypes: ["script.approved", "voice.approved"],
    outputArtifactTypes: ["subtitles"],
    runnerId: "subtitle-preparation-local",
    executionKind: "local_deterministic",
    approvalRequired: true,
    invalidates: ["timeline-assembly"]
  },
  {
    id: "timeline-assembly",
    name: "Timeline Assembly",
    order: 24,
    screenRoute: "timeline",
    dependsOn: ["subtitle-preparation"],
    requiredInputTypes: ["voice.approved", "asset.approved", "subtitles.approved"],
    outputArtifactTypes: ["timeline"],
    runnerId: "timeline-assembly-local",
    executionKind: "local_deterministic",
    approvalRequired: true,
    invalidates: ["preview-render"]
  },
  {
    id: "preview-render",
    name: "Preview Render",
    order: 25,
    screenRoute: "timeline",
    dependsOn: ["timeline-assembly"],
    requiredInputTypes: ["timeline.approved"],
    outputArtifactTypes: ["preview-video"],
    runnerId: "ffmpeg-preview",
    executionKind: "media_process",
    approvalRequired: true,
    invalidates: ["qa"]
  },
  {
    id: "qa",
    name: "QA",
    order: 26,
    screenRoute: "qa",
    dependsOn: ["preview-render"],
    requiredInputTypes: ["preview-video.approved"],
    outputArtifactTypes: ["qa-report"],
    runnerId: "qa-local",
    executionKind: "local_deterministic",
    approvalRequired: true,
    invalidates: ["capcut-draft"]
  },
  {
    id: "capcut-draft",
    name: "CapCut Draft",
    order: 27,
    screenRoute: "export",
    dependsOn: ["qa"],
    requiredInputTypes: ["qa.approved", "timeline.approved"],
    outputArtifactTypes: ["capcut-draft"],
    runnerId: "pycapcut-bridge",
    executionKind: "export",
    approvalRequired: true,
    invalidates: ["packaging-export"]
  },
  {
    id: "packaging-export",
    name: "Packaging Export",
    order: 28,
    screenRoute: "export",
    dependsOn: ["capcut-draft"],
    requiredInputTypes: ["capcut-draft.approved"],
    outputArtifactTypes: ["package-export"],
    runnerId: "packaging-export-local",
    executionKind: "export",
    approvalRequired: true,
    invalidates: []
  }
] as const satisfies WorkflowStageDefinition[];

export type WorkflowStageId = (typeof workflowStageDefinitions)[number]["id"];

export function getWorkflowStageDefinition(stageId: string): WorkflowStageDefinition | undefined {
  return workflowStageDefinitions.find((stage) => stage.id === stageId);
}

export function getDownstreamWorkflowStageIds(stageId: string): ReadonlySet<string> {
  const downstreamStageIds = new Set<string>();
  const visited = new Set<string>();

  function visit(currentStageId: string): void {
    if (visited.has(currentStageId)) return;
    visited.add(currentStageId);
    for (const downstreamId of getWorkflowStageDefinition(currentStageId)?.invalidates ?? []) {
      downstreamStageIds.add(downstreamId);
      visit(downstreamId);
    }
  }

  visit(stageId);
  return downstreamStageIds;
}

export function getWorkflowStageImpactIds(stageId: string): ReadonlySet<string> {
  return new Set([stageId, ...getDownstreamWorkflowStageIds(stageId)]);
}

export function workflowStageIds(): string[] {
  return workflowStageDefinitions.map((stage) => stage.id);
}
