import { describe, expect, it } from "vitest";
import { getDownstreamWorkflowStageIds, getWorkflowStageImpactIds, workflowStageDefinitions } from "../src";

describe("G01 workflow registry", () => {
  it("contains the canonical ordered pre-production journey without a UI total", () => {
    expect(workflowStageDefinitions.map((stage) => stage.name)).toEqual([
      "Project Brief", "Reference / Research", "Idea Lab", "Story Architecture", "Outline", "Script", "Script Review", "Timing", "Director Analysis",
      "Scene Map", "Storyboard / Keyframes", "Prompt Compiler", "Batch Planner", "GG Lab Generation Gate", "Image Review", "Production Handoff"
    ]);
    expect(workflowStageDefinitions.map((stage) => stage.order)).toEqual(workflowStageDefinitions.map((_, index) => index + 1));
  });

  it("declares complete metadata and valid graph links", () => {
    const ids = new Set(workflowStageDefinitions.map((stage) => stage.id));
    for (const stage of workflowStageDefinitions) {
      expect(stage.screenRoute).toBeTruthy();
      expect(stage.requiredInputTypes.length).toBeGreaterThan(0);
      expect(stage.outputArtifactTypes.length).toBeGreaterThan(0);
      for (const dependency of stage.dependsOn) expect(ids.has(dependency)).toBe(true);
      for (const invalidated of stage.invalidates) expect(ids.has(invalidated)).toBe(true);
    }
  });

  it("tracks transitive downstream invalidation", () => {
    expect([...getDownstreamWorkflowStageIds("scene-plan")]).toEqual(["shot-plan", "prompt-preparation", "batch-planner", "gglab-generation-gate", "asset-review", "production-handoff"]);
    expect([...getWorkflowStageImpactIds("reference-intake")]).toContain("reference-intake");
    expect([...getDownstreamWorkflowStageIds("idea-lab")]).toEqual(expect.arrayContaining(["story-architecture", "outline", "script", "script-review", "timing"]));
    expect([...getDownstreamWorkflowStageIds("script-review")]).not.toContain("script");
  });
});
