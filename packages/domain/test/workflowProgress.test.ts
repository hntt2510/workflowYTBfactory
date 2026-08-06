import { describe, expect, it } from "vitest";
import { createFixtureProject, resolveWorkflowProgress } from "../src";

describe("workflow progress", () => {
  it("does not count unused reference stages for a topic without references", () => {
    const project = createFixtureProject({ topic: "Oil in World War II", format: "short", targetLanguage: "Vietnamese", inputMode: "topic" });
    const progress = resolveWorkflowProgress(project);

    expect(progress.stages.filter((stage) => stage.state === "not_applicable").map((stage) => stage.stageId)).toEqual(expect.arrayContaining([
      "reference-intake",
      "reference-validation",
      "transcript-cleaning",
      "reference-segmentation",
      "competitor-dna",
      "opportunity-map",
      "research-source-intake",
      "claim-map"
    ]));
    expect(progress.currentStageId).toBe("idea-lab");
    expect(progress.totalCount).toBe(21);
    expect(progress.phases.find((phase) => phase.id === "scene-review")).toMatchObject({ totalCount: 6 });
  });

  it("keeps the reference branch in progress when a reference is supplied", () => {
    const project = createFixtureProject({
      topic: "Oil in World War II",
      format: "short",
      targetLanguage: "Vietnamese",
      inputMode: "reference",
      competitorReference: { pastedTranscript: "A sufficiently long reference transcript for this project." }
    });
    const progress = resolveWorkflowProgress(project);

    expect(progress.stages.find((stage) => stage.stageId === "reference-validation")?.state).toBe("current");
    expect(progress.stages.find((stage) => stage.stageId === "opportunity-map")?.state).toBe("not_started");
    expect(progress.phases.find((phase) => phase.id === "reference-analysis")?.state).toBe("current");
  });

  it("skips idea-generation stages for existing script projects", () => {
    const project = createFixtureProject({
      topic: "Supplied script",
      format: "short",
      targetLanguage: "Vietnamese",
      inputMode: "existing_script",
      sourceScript: "This is an existing script with enough content to prepare."
    });
    const progress = resolveWorkflowProgress(project);

    for (const stageId of ["idea-lab", "originality-review", "research-source-intake", "claim-map", "outline"]) {
      expect(progress.stages.find((stage) => stage.stageId === stageId)?.state).toBe("not_applicable");
    }
    expect(progress.currentStageId).toBe("script");
  });

  it("treats CapCut as optional after Packaging Export completes", () => {
    const project = createFixtureProject({ topic: "Complete project", format: "short", targetLanguage: "Vietnamese", inputMode: "topic" });
    const requiredTopicStages = new Set([
      "project-setup", "idea-lab", "originality-review", "outline", "script", "fact-review", "retention-review", "scene-plan", "shot-plan",
      "visual-routing", "character-preparation", "asset-concepts", "prompt-preparation", "asset-acquisition", "asset-review", "voice-generation", "subtitle-preparation", "timeline-assembly",
      "preview-render", "qa", "packaging-export"
    ]);
    const complete = { ...project, stages: project.stages.map((stage) => requiredTopicStages.has(stage.id) ? { ...stage, status: "approved" as const } : stage) };
    const progress = resolveWorkflowProgress(complete);

    expect(progress.percent).toBe(100);
    expect(progress.currentStageId).toBeUndefined();
    expect(progress.currentPhaseName).toBeUndefined();
    expect(progress.stages.find((stage) => stage.stageId === "capcut-draft")).toMatchObject({ state: "optional", internalStatus: "not_started" });
    expect(progress.phases.find((phase) => phase.id === "export")?.state).toBe("complete");
  });

  it("does not hide an actual CapCut failure behind its optional status", () => {
    const project = createFixtureProject({ topic: "CapCut failure", format: "short", targetLanguage: "Vietnamese", inputMode: "topic" });
    const failed = { ...project, stages: project.stages.map((stage) => stage.id === "capcut-draft" ? { ...stage, status: "needs_attention" as const } : stage) };
    const progress = resolveWorkflowProgress(failed);

    expect(progress.stages.find((stage) => stage.stageId === "capcut-draft")?.state).toBe("needs_attention");
    expect(progress.phases.find((phase) => phase.id === "export")?.state).toBe("needs_attention");
  });
});
