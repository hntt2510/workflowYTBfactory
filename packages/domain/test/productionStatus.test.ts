import { describe, expect, it } from "vitest";
import { createFixtureProject, resolveProductionStatus, voxDocumentaryStyle } from "../src";

describe("production status", () => {
  it("keeps topic projects in draft before preparation", () => {
    const project = createFixtureProject({ topic: "Oil in World War II", format: "short", targetLanguage: "Vietnamese", inputMode: "topic" });
    expect(resolveProductionStatus(project)).toBe("preparing");
  });

  it("maps scene review and attention to user-facing states", () => {
    const project = createFixtureProject({ topic: "Topic", format: "short", targetLanguage: "Vietnamese" });
    const sceneReview = { ...project, stages: project.stages.map((stage) => stage.id === "asset-review" ? { ...stage, status: "needs_review" as const } : stage) };
    expect(resolveProductionStatus(sceneReview)).toBe("needs_scene_review");
    const attention = { ...project, stages: project.stages.map((stage) => stage.id === "script" ? { ...stage, status: "needs_attention" as const } : stage) };
    expect(resolveProductionStatus(attention)).toBe("needs_attention");
    const failed = { ...project, stages: project.stages.map((stage) => stage.id === "script" ? { ...stage, status: "failed" as const } : stage) };
    expect(resolveProductionStatus(failed)).toBe("needs_attention");
  });

});

describe("VOX Documentary style skill", () => {
  it("keeps important typography local", () => {
    expect(voxDocumentaryStyle.id).toBe("vox-documentary");
    expect(voxDocumentaryStyle.supportedSceneTypes).toContain("Map");
    expect(voxDocumentaryStyle.typographyRules.join(" ")).toMatch(/Vietnamese Unicode/);
    expect(voxDocumentaryStyle.negativePromptTemplate).toMatch(/text/);
  });
});
