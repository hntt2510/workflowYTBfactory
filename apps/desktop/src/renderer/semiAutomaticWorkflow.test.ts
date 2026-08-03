import { describe, expect, it } from "vitest";
import { createFixtureProject, type FactoryProject } from "@lsf/domain";
import { hasSemiAutomaticAttention, nextSemiAutomaticChain, runAssetChain, runIdeaChain, runPreviewChain, runReferenceChain, type SemiAutomaticClient } from "./semiAutomaticWorkflow";

function projectWithApprovedReferences(): FactoryProject {
  const project = createFixtureProject({
    topic: "Semi automatic test",
    format: "short",
    targetLanguage: "English",
    workflowMode: "semi_automatic",
    competitorReference: { pastedTranscript: "First transcript" }
  });
  return {
    ...project,
    referenceSet: { status: "approved" },
    competitorReferences: project.competitorReferences.map((reference) => ({ ...reference, status: "approved" as const })),
    stages: project.stages.map((stage) => stage.id === "reference-validation" ? { ...stage, status: "approved" as const } : stage)
  };
}

function setStatus(project: FactoryProject, stageId: string, status: FactoryProject["stages"][number]["status"]): FactoryProject {
  return { ...project, stages: project.stages.map((stage) => stage.id === stageId ? { ...stage, status } : stage) };
}

function referenceClient(project: FactoryProject, events: string[], failAt?: string, failOnceAt?: string): SemiAutomaticClient {
  const attempts = new Map<string, number>();
  const runReference = (stageId: string) => async ({ referenceId }: { projectId: string; referenceId: string }) => {
    events.push(`run:${stageId}:${referenceId}`);
    const attempt = attempts.get(stageId) ?? 0;
    attempts.set(stageId, attempt + 1);
    if (failAt === stageId || (failOnceAt === stageId && attempt === 0)) throw new Error(`${stageId} failed`);
    project = setStatus(project, stageId, "needs_review");
    return project;
  };
  const approveReference = (stageId: string) => async ({ referenceId }: { projectId: string; referenceId: string }) => {
    events.push(`approve:${stageId}:${referenceId}`);
    project = setStatus(project, stageId, "approved");
    return project;
  };
  const runWhole = (stageId: string) => async ({ projectId }: { projectId: string }) => {
    events.push(`run:${stageId}`);
    project = setStatus(project, stageId, "needs_review");
    return project;
  };
  const approveWhole = (stageId: string) => async ({ projectId }: { projectId: string }) => {
    events.push(`approve:${stageId}`);
    project = setStatus(project, stageId, "approved");
    return project;
  };
  return {
    loadProject: async () => project,
    markStageAttention: async ({ message }: { projectId: string; stageId: string; referenceId?: string; code: string; message: string }) => {
      events.push(`attention:${message}`);
      return project;
    },
    runTranscriptCleaning: runReference("transcript-cleaning"),
    approveTranscriptCleaning: approveReference("transcript-cleaning"),
    runReferenceSegmentation: runReference("reference-segmentation"),
    approveReferenceSegmentation: approveReference("reference-segmentation"),
    runCompetitorDna: runReference("competitor-dna"),
    approveCompetitorDna: approveReference("competitor-dna"),
    runOpportunityMap: runWhole("opportunity-map"),
    approveOpportunityMap: approveWhole("opportunity-map"),
    runIdeaLab: runWhole("idea-lab"),
    runOriginalityReview: runWhole("originality-review"), approveOriginalityReview: approveWhole("originality-review"),
    runOutline: runWhole("outline"), approveOutline: approveWhole("outline"),
    runScript: runWhole("script"), approveScript: approveWhole("script"),
    runFactReview: runWhole("fact-review"), approveFactReview: approveWhole("fact-review"),
    runRetentionReview: runWhole("retention-review"), approveRetentionReview: approveWhole("retention-review"),
    runScenePlan: runWhole("scene-plan"), approveScenePlan: approveWhole("scene-plan"),
    runShotPlan: runWhole("shot-plan"), approveShotPlan: approveWhole("shot-plan"),
    runVisualRouting: runWhole("visual-routing"), approveVisualRouting: approveWhole("visual-routing"),
    runPromptPreparation: runWhole("prompt-preparation"), approvePromptPreparation: approveWhole("prompt-preparation"),
    runAssetAcquisition: runWhole("asset-acquisition"), approveAssetAcquisition: approveWhole("asset-acquisition"),
    runAssetReview: runWhole("asset-review"),
    runVoiceGeneration: runWhole("voice-generation"), listVoiceGenerationArtifacts: async () => [], approveVoiceGeneration: approveWhole("voice-generation"),
    runSubtitlePreparation: runWhole("subtitle-preparation"), approveSubtitlePreparation: approveWhole("subtitle-preparation"),
    runTimelineAssembly: runWhole("timeline-assembly"), approveTimelineAssembly: approveWhole("timeline-assembly"),
    runPreviewRender: runWhole("preview-render"),
    runQa: runWhole("qa"), approveQa: approveWhole("qa"),
    runCapCutDraft: runWhole("capcut-draft"), approveCapCutDraft: approveWhole("capcut-draft"),
    runPackagingExport: runWhole("packaging-export"), approvePackagingExport: approveWhole("packaging-export")
  } as SemiAutomaticClient;
}

describe("semi-automatic reference chain", () => {
  it("selects the next chain after restart without crossing checkpoints", () => {
    const project = projectWithApprovedReferences();
    expect(nextSemiAutomaticChain(project)).toBe("reference");
    const ideaReview = setStatus(project, "idea-lab", "needs_review");
    expect(nextSemiAutomaticChain(ideaReview)).toBeUndefined();
    const ideaApproved = setStatus(project, "idea-lab", "approved");
    expect(nextSemiAutomaticChain(ideaApproved)).toBe("idea");
    const assetReview = setStatus(ideaApproved, "asset-review", "needs_review");
    expect(nextSemiAutomaticChain(assetReview)).toBeUndefined();
    const assetsApproved = setStatus(ideaApproved, "asset-review", "approved");
    expect(nextSemiAutomaticChain(assetsApproved)).toBe("assets");
    const previewApproved = setStatus(assetsApproved, "preview-render", "approved");
    expect(nextSemiAutomaticChain(previewApproved)).toBe("preview");
  });

  it("does not treat an automatic stage failure as a human checkpoint", () => {
    const project = setStatus(projectWithApprovedReferences(), "competitor-dna", "failed");
    expect(hasSemiAutomaticAttention(project)).toBe(false);
    expect(nextSemiAutomaticChain(project)).toBe("reference");
  });

  it("retries a failed automatic stage before stopping the chain", async () => {
    const project = projectWithApprovedReferences();
    const events: string[] = [];
    const result = await runReferenceChain(referenceClient(project, events, undefined, "reference-segmentation"), { project });
    expect(events.filter((event) => event.startsWith("run:reference-segmentation")).length).toBe(2);
    expect(events).toContain("approve:reference-segmentation:" + project.competitorReferences[0]!.id);
    expect(result.stages.find((stage) => stage.id === "idea-lab")?.status).toBe("needs_review");
  });

  it("keeps the reference validation checkpoint human-actionable", () => {
    const project = setStatus(projectWithApprovedReferences(), "reference-validation", "needs_attention");
    expect(hasSemiAutomaticAttention(project)).toBe(true);
    expect(nextSemiAutomaticChain(project)).toBeUndefined();
  });

  it("resumes the correct automatic chain for failures in every segment", () => {
    const base = projectWithApprovedReferences();
    const ideaApproved = setStatus(base, "idea-lab", "approved");
    const assetsApproved = setStatus(ideaApproved, "asset-review", "approved");
    const previewApproved = setStatus(assetsApproved, "preview-render", "approved");
    const cases: Array<[FactoryProject, "reference" | "idea" | "assets" | "preview"]> = [
      [setStatus(base, "transcript-cleaning", "needs_attention"), "reference"],
      [setStatus(ideaApproved, "outline", "needs_attention"), "idea"],
      [setStatus(assetsApproved, "scene-plan", "needs_attention"), "assets"],
      [setStatus(previewApproved, "qa", "needs_attention"), "preview"]
    ];
    for (const [project, chain] of cases) {
      expect(hasSemiAutomaticAttention(project)).toBe(false);
      expect(nextSemiAutomaticChain(project)).toBe(chain);
    }
  });

  it("runs references sequentially, approves intermediate stages, and pauses at Idea Lab", async () => {
    const project = projectWithApprovedReferences();
    const events: string[] = [];
    const result = await runReferenceChain(referenceClient(project, events), { project });
    expect(events).toEqual([
      `run:transcript-cleaning:${project.competitorReferences[0]!.id}`,
      `approve:transcript-cleaning:${project.competitorReferences[0]!.id}`,
      `run:reference-segmentation:${project.competitorReferences[0]!.id}`,
      `approve:reference-segmentation:${project.competitorReferences[0]!.id}`,
      `run:competitor-dna:${project.competitorReferences[0]!.id}`,
      `approve:competitor-dna:${project.competitorReferences[0]!.id}`,
      "run:opportunity-map",
      "approve:opportunity-map",
      "run:idea-lab"
    ]);
    expect(result.stages.find((stage) => stage.id === "idea-lab")?.status).toBe("needs_review");
  });

  it("stops before downstream stages when an intermediate stage fails", async () => {
    const project = projectWithApprovedReferences();
    const events: string[] = [];
    await expect(runReferenceChain(referenceClient(project, events, "reference-segmentation"), { project })).rejects.toThrow("reference-segmentation failed");
    expect(events.some((event) => event.startsWith("run:competitor-dna"))).toBe(false);
    expect(events.includes("run:opportunity-map")).toBe(false);
    expect(events.some((event) => event.startsWith("attention:"))).toBe(true);
  });

  it("pauses at the final preview checkpoint before QA", async () => {
    const project = projectWithApprovedReferences();
    const ideaApproved = setStatus(project, "idea-lab", "approved");
    const assetReviewApproved = setStatus(ideaApproved, "asset-review", "approved");
    const events: string[] = [];
    const result = await runAssetChain(referenceClient(assetReviewApproved, events), { project: assetReviewApproved });
    expect(events).toEqual([
      "run:voice-generation", "approve:voice-generation",
      "run:subtitle-preparation", "approve:subtitle-preparation",
      "run:timeline-assembly", "approve:timeline-assembly",
      "run:preview-render"
    ]);
    expect(result.stages.find((stage) => stage.id === "preview-render")?.status).toBe("needs_review");
  });

  it("runs packaging directly after QA without invoking CapCut", async () => {
    const project = projectWithApprovedReferences();
    const checkpointed = ["idea-lab", "asset-review", "preview-render", "qa"].reduce(
      (current, stageId) => setStatus(current, stageId, "approved"),
      project
    );
    const events: string[] = [];
    const result = await runPreviewChain(referenceClient(checkpointed, events), { project: checkpointed });
    expect(result.stages.find((stage) => stage.id === "packaging-export")?.status).toBe("approved");
    expect(events).toEqual(["run:packaging-export", "approve:packaging-export"]);
  });

  it("continues to packaging only after CapCut is already approved", async () => {
    const project = projectWithApprovedReferences();
    const checkpointed = ["idea-lab", "asset-review", "preview-render", "qa", "capcut-draft"].reduce(
      (current, stageId) => setStatus(current, stageId, "approved"),
      project
    );
    const events: string[] = [];
    await runPreviewChain(referenceClient(checkpointed, events), { project: checkpointed });
    expect(events).toEqual(["run:packaging-export", "approve:packaging-export"]);
  });

  it("does not run Guided or Full Automatic projects", async () => {
    const guided = { ...projectWithApprovedReferences(), setup: { ...projectWithApprovedReferences().setup, workflowMode: "guided" as const } };
    const full = { ...projectWithApprovedReferences(), setup: { ...projectWithApprovedReferences().setup, workflowMode: "full_automatic" as const } };
    await expect(runReferenceChain(referenceClient(guided, []), { project: guided })).rejects.toThrow("Semi-automatic mode");
    await expect(runReferenceChain(referenceClient(full, []), { project: full })).rejects.toThrow("Full Automatic mode is not implemented");
  });

  it("runs Outline directly after Originality Review without research or claim stages", async () => {
    const project = setStatus(projectWithApprovedReferences(), "originality-review", "approved");
    const events: string[] = [];
    const result = await runIdeaChain(referenceClient(project, events), { project });
    expect(events.some((event) => event.includes("research-source"))).toBe(false);
    expect(events).toContain("run:outline");
    expect(events).toContain("approve:outline");
    expect(result.stages.find((stage) => stage.id === "claim-map")).toBeUndefined();
  });

});
