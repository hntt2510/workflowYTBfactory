import { describe, expect, it } from "vitest";
import { createFixtureProject, resolveWorkflowProgress } from "../src";

describe("G01 workflow progress", () => {
  it("excludes optional reference work from a topic project", () => {
    const progress = resolveWorkflowProgress(createFixtureProject({ topic: "Topic", format: "short", targetLanguage: "Vietnamese", inputMode: "topic" }));
    expect(progress.stages.find((stage) => stage.stageId === "reference-intake")).toMatchObject({ state: "not_applicable", applicable: false });
    expect(progress.currentStageId).toBe("idea-lab");
    expect(progress.totalCount).toBe(13);
  });

  it("requires reference work before idea development in reference mode", () => {
    const progress = resolveWorkflowProgress(createFixtureProject({ topic: "Reference", format: "short", targetLanguage: "Vietnamese", inputMode: "reference", competitorReference: { pastedTranscript: "reference transcript" } }));
    expect(progress.stages.find((stage) => stage.stageId === "reference-intake")?.applicable).toBe(true);
    expect(progress.currentStageId).toBe("idea-lab");
  });

  it("does not count idea or story architecture for an existing script", () => {
    const progress = resolveWorkflowProgress(createFixtureProject({ topic: "Script", format: "short", targetLanguage: "Vietnamese", inputMode: "existing_script", sourceScript: "existing script" }));
    expect(progress.stages.filter((stage) => ["idea-lab", "story-architecture"].includes(stage.stageId)).every((stage) => stage.state === "not_applicable")).toBe(true);
    expect(progress.currentStageId).toBe("timing");
  });

  it("calculates completion from applicable required stages only", () => {
    const project = createFixtureProject({ topic: "Done", format: "short", targetLanguage: "Vietnamese", inputMode: "topic" });
    const complete = { ...project, stages: project.stages.map((stage) => ({ ...stage, status: "approved" as const })) };
    const progress = resolveWorkflowProgress(complete);
    expect(progress.percent).toBe(100);
    expect(progress.totalCount).toBe(13);
  });
});
