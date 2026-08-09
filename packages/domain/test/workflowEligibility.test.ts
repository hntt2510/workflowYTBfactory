import { describe, expect, it } from "vitest";
import { createFixtureProject, normalizeProjectStages, resolveStageEligibilities } from "../src";

describe("G01 workflow eligibility", () => {
  it("does not make non-applicable stages runnable or countable", () => {
    const project = createFixtureProject({ topic: "Topic", format: "short", targetLanguage: "Vietnamese", inputMode: "topic" });
    const reference = resolveStageEligibilities(project).find((stage) => stage.stageId === "reference-intake");
    expect(reference).toMatchObject({ status: "blocked", runnable: false, approvable: false });
  });

  it("does not require image/video/audio capabilities in the default image handoff path", () => {
    const project = createFixtureProject({ topic: "Topic", format: "short", targetLanguage: "Vietnamese", inputMode: "topic" });
    const stages = project.stages.map((stage) => ({ ...stage, status: ["project-setup", "idea-lab", "story-architecture", "outline", "script", "timing", "director-analysis", "scene-plan", "shot-plan", "prompt-preparation", "batch-planner", "gglab-generation-gate"].includes(stage.id) ? "approved" as const : stage.status }));
    const imageReview = resolveStageEligibilities({ ...project, stages }).find((stage) => stage.stageId === "asset-review");
    expect(imageReview).toMatchObject({ status: "ready", runnable: true, blockingReasons: [] });
  });

  it("allows an existing script to bypass idea and story architecture", () => {
    const project = createFixtureProject({ topic: "Script", format: "short", targetLanguage: "Vietnamese", inputMode: "existing_script", sourceScript: "existing script" });
    const eligibilities = resolveStageEligibilities(project, { textVerified: false });
    expect(eligibilities.find((stage) => stage.stageId === "idea-lab")).toMatchObject({ status: "blocked", runnable: false });
    expect(eligibilities.find((stage) => stage.stageId === "story-architecture")).toMatchObject({ status: "blocked", runnable: false });
    expect(eligibilities.find((stage) => stage.stageId === "script")?.status).toBe("ready");
    expect(eligibilities.find((stage) => stage.stageId === "timing")?.status).toBe("blocked");
  });

  it("preserves unknown legacy stages while adding missing canonical stages", () => {
    const normalized = normalizeProjectStages([{ id: "legacy-stage", name: "Legacy", status: "approved", dependsOn: [] }]);
    expect(normalized.find((stage) => stage.id === "legacy-stage")?.status).toBe("approved");
    expect(normalized.find((stage) => stage.id === "production-handoff")?.status).toBe("not_started");
  });
});
