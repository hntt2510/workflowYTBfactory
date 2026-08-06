import type { ChannelProfile, IdeaCandidate } from "./types";

const buckets = [
  { label: "low-risk evergreen", researchRisk: "low", productionDifficulty: "low" },
  { label: "medium-difficulty", researchRisk: "medium", productionDifficulty: "medium" },
  { label: "stretch", researchRisk: "high", productionDifficulty: "high" }
] as const;

export function generateIdeaLab(topic: string, profile: ChannelProfile, count = 6): IdeaCandidate[] {
  return Array.from({ length: count }, (_, index) => {
    const bucket = buckets[Math.min(Math.floor(index / Math.ceil(count / buckets.length)), buckets.length - 1)] ?? buckets[2];
    const ordinal = index + 1;
    return {
      id: `idea-${ordinal.toString().padStart(2, "0")}`,
      workingTitle: `${topic}: The ${bucket.label} angle ${ordinal}`,
      angle: `Use ${profile.name} channel memory to frame the topic around a fresh viewer problem, not a competitor wording reuse.`,
      corePromise: `The viewer understands the most important answer behind "${topic}" without overclaiming.`,
      viewerProblem: `The audience wants clarity but has seen repeated shallow explanations.`,
      dramaticQuestion: `What changes once the viewer sees "${topic}" through this new frame?`,
      targetEmotion: profile.id === "viral-case-files" ? "curious tension" : "calm curiosity",
      trafficModel: profile.id === "insurance-made-simple" ? "search" : "mixed",
      thumbnailConcept: `One clean symbolic image tied to ${profile.mainKeyword}, with no copied competitor layout.`,
      noveltyExplanation: "New frame, new evidence base, and changed proof sequence are required before approval.",
      noveltyScore: bucket.label === "stretch" ? 86 : bucket.label === "medium-difficulty" ? 78 : 70,
      audienceFitScore: 82,
      thumbnailPotentialScore: bucket.label === "low-risk evergreen" ? 72 : 84,
      researchRisk: bucket.researchRisk,
      productionDifficulty: bucket.productionDifficulty,
      estimatedValidationCost: bucket.label === "stretch" ? 0.42 : bucket.label === "medium-difficulty" ? 0.28 : 0.18,
      repurposePotential: ["short hook", "thumbnail test", "community poll"],
      whyThisCanWin: "It combines a specific promise, safe originality constraints, and channel-specific tone rules."
    };
  });
}
