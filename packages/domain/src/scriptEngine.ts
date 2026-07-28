import { DEFAULT_FPS, secondsToFrames } from "./timecode";
import type { Claim, Scene, ScriptSection, Shot } from "./types";

export function createStarterClaims(topic: string, profileId: string): Claim[] {
  const isCase = profileId === "viral-case-files";
  const isBible = profileId === "bible-mysteries-revealed";
  return [
    {
      id: "claim-01",
      text: isCase
        ? `Public reporting and filings should be checked before any allegation about ${topic} is stated.`
        : isBible
          ? `Scripture, historical context, tradition, and interpretation must be separated when explaining ${topic}.`
          : `General education about ${topic} must not become personal financial advice.`,
      type: isCase ? "allegation" : isBible ? "interpretation" : "fact",
      sourceRequirement: isBible ? "either" : "primary",
      sourceIds: [],
      confidence: 0.35,
      state: "needs_qualification",
      approvalState: "blocked",
      qualification: "Starter fixture claim; attach sources before final approval."
    }
  ];
}

export function createStarterScript(topic: string, claimIds: string[]): ScriptSection[] {
  return [
    {
      id: "section-01",
      purpose: "Cold open and promise payoff",
      narration: `If ${topic} feels familiar, the important part is what most explanations leave out.`,
      estimatedWords: 15,
      estimatedSeconds: 7,
      dramaticFunction: "open a clear curiosity gap",
      openLoop: "what has been missed",
      linkedClaimIds: claimIds,
      visualOpportunities: ["symbolic opener", "title promise visual"],
      proofObjects: ["source card"],
      retentionRisk: "low"
    },
    {
      id: "section-02",
      purpose: "Context with relevance first",
      narration: `Before the details, we need one simple frame that keeps the story honest and useful.`,
      estimatedWords: 16,
      estimatedSeconds: 8,
      dramaticFunction: "define the lens",
      linkedClaimIds: claimIds,
      visualOpportunities: ["diagram", "timeline card"],
      proofObjects: ["reference note"],
      retentionRisk: "medium"
    },
    {
      id: "section-03",
      purpose: "Payoff and next action",
      narration: `By the end, the answer is less about memorizing facts and more about knowing what evidence can actually support.`,
      estimatedWords: 19,
      estimatedSeconds: 9,
      dramaticFunction: "resolve with qualification",
      linkedClaimIds: claimIds,
      visualOpportunities: ["summary card", "safe CTA"],
      proofObjects: ["claim map"],
      retentionRisk: "low"
    }
  ];
}

export function scenesFromScript(sections: ScriptSection[], fps = DEFAULT_FPS): Scene[] {
  let cursor = 0;
  return sections.map((section, index) => {
    const durationFrames = secondsToFrames(section.estimatedSeconds, fps);
    const proofObject = section.proofObjects[0];
    const scene: Scene = {
      id: `scene-${String(index + 1).padStart(2, "0")}`,
      scriptSectionId: section.id,
      narration: section.narration,
      purpose: section.purpose,
      startFrame: cursor,
      durationFrames,
      visualMode: index === 1 ? "diagram" : "ai_image",
      ...(proofObject ? { proofObject } : {}),
      emotionalState: index === 0 ? "curiosity" : "clarity",
      requiredAssets: [],
      continuityRefs: []
    };
    cursor += durationFrames;
    return scene;
  });
}

export function shotsFromScenes(scenes: Scene[], fps = DEFAULT_FPS): Shot[] {
  return scenes.map((scene, index) => ({
    id: `shot-${String(index + 1).padStart(2, "0")}`,
    sceneId: scene.id,
    order: index + 1,
    startFrame: scene.startFrame,
    durationFrames: scene.durationFrames,
    fps,
    purpose: scene.purpose,
    visualMode: scene.visualMode,
    framing: "clean centered composition",
    cameraAngle: "straight-on explainer view",
    cameraMovement: scene.visualMode === "ai_image" ? "slow push-in" : "static",
    subjectAction: "illustrate the narration without adding unsupported facts",
    startState: {},
    endState: {},
    continuityRefs: scene.continuityRefs,
    promptVersionId: scene.visualMode === "ai_image" ? "16_image_prompt_compiler.v1" : "15_visual_router.v1"
  }));
}
