import { describe, expect, it } from "vitest";
import { actionDefinitions, createFixtureProject, getActionState, resolveProjectCheckpoints } from "../src";

describe("G02 checkpoint runtime", () => {
  it("uses only applicable checkpoints for topic and existing-script projects", () => {
    const topic = resolveProjectCheckpoints(createFixtureProject({ topic: "Topic", format: "short", targetLanguage: "Vietnamese", inputMode: "topic" }));
    expect(topic.checkpoints.find((item) => item.definition.id === "research")?.state).toBe("not_applicable");
    expect(topic.totalCount).toBeLessThan(9);

    const existing = resolveProjectCheckpoints(createFixtureProject({ topic: "Existing", format: "short", targetLanguage: "Vietnamese", inputMode: "existing_script", sourceScript: "Already written" }));
    expect(existing.checkpoints.find((item) => item.definition.id === "research")?.state).toBe("not_applicable");
    expect(existing.checkpoints.find((item) => item.definition.id === "idea")?.state).toBe("not_applicable");
    expect(existing.completedCount).toBe(1);
  });

  it("surfaces persistent action states over a checkpoint without changing navigation", () => {
    const project = createFixtureProject({ topic: "Reference", format: "short", targetLanguage: "Vietnamese", inputMode: "reference", competitorReference: { pastedTranscript: "Reference text" } });
    const runs = [{ actionId: "GENERATE_IDEAS" as const, state: "failed" as const, safeErrorMessage: "Cockpit unavailable" }];
    const checkpoints = resolveProjectCheckpoints(project, runs);
    expect(checkpoints.checkpoints.find((item) => item.definition.id === "idea")?.state).toBe("error");
    expect(getActionState(project, "GENERATE_IDEAS", runs)).toEqual({ state: "ERROR", reason: "Cockpit unavailable" });
    expect(checkpoints.checkpoints.find((item) => item.definition.id === "idea")?.definition.route).toBe("idea-lab");
  });

  it("reports a blocked action until prerequisite checkpoints are complete", () => {
    const project = createFixtureProject({ topic: "Topic", format: "short", targetLanguage: "Vietnamese", inputMode: "topic" });
    expect(getActionState(project, "GENERATE_SCRIPT").state).toBe("BLOCKED");
    expect(getActionState(project, "GENERATE_DIRECTOR_PLAN").reason).toContain("Câu chuyện");
  });

  it("keeps command metadata, retry policy, and downstream invalidation in one action registry", () => {
    const promptAction = actionDefinitions.find((action) => action.id === "PREPARE_GG_LAB_PROMPTS")!;
    expect(promptAction.prerequisites).toEqual(["storyboard"]);
    expect(promptAction.retryPolicy).toBe("retry_missing_units");
    expect(promptAction.invalidates).toEqual(["images", "handoff"]);
  });

  it("registers each reference-analysis command with its real stage and retry policy", () => {
    expect(actionDefinitions.filter((action) => ["RUN_TRANSCRIPT_CLEANING", "RUN_REFERENCE_SEGMENTATION", "GENERATE_COMPETITOR_DNA", "GENERATE_OPPORTUNITY_MAP"].includes(action.id)).map((action) => [action.id, action.stageId, action.retryPolicy])).toEqual([
      ["RUN_TRANSCRIPT_CLEANING", "transcript-cleaning", "retry_missing_units"],
      ["RUN_REFERENCE_SEGMENTATION", "reference-segmentation", "retry_failed"],
      ["GENERATE_COMPETITOR_DNA", "competitor-dna", "retry_failed"],
      ["GENERATE_OPPORTUNITY_MAP", "opportunity-map", "retry_failed"]
    ]);
  });

  it("requires approved Story Architecture before Outline generation", () => {
    const project = createFixtureProject({ topic: "Story", format: "short", targetLanguage: "Vietnamese", inputMode: "topic" });
    const withIdea = { ...project, stages: project.stages.map((stage) => stage.id === "project-setup" || stage.id === "idea-lab" ? { ...stage, status: "approved" as const } : stage) };
    expect(getActionState(withIdea, "GENERATE_OUTLINE")).toMatchObject({ state: "BLOCKED" });
    const withStory = { ...withIdea, stages: withIdea.stages.map((stage) => stage.id === "story-architecture" ? { ...stage, status: "approved" as const } : stage) };
    expect(getActionState(withStory, "GENERATE_OUTLINE").state).not.toBe("BLOCKED");
  });

  it("allows reviewing a Script draft but requires that review before explicit Script approval", () => {
    const project = createFixtureProject({ topic: "Existing", format: "short", targetLanguage: "Vietnamese", inputMode: "existing_script", sourceScript: "A draft" });
    const draft = { ...project, stages: project.stages.map((stage) => stage.id === "script" ? { ...stage, status: "needs_review" as const } : stage) };
    expect(getActionState(draft, "REVIEW_SCRIPT").state).toBe("READY");
    expect(getActionState(draft, "APPROVE_SCRIPT")).toMatchObject({ state: "BLOCKED" });
    const reviewed = { ...draft, stages: draft.stages.map((stage) => stage.id === "script-review" ? { ...stage, status: "approved" as const } : stage) };
    expect(getActionState(reviewed, "APPROVE_SCRIPT").state).toBe("READY");
  });

  it("lets the latest successful retry supersede an older failed action run", () => {
    const project = createFixtureProject({ topic: "Retry", format: "short", targetLanguage: "Vietnamese", inputMode: "topic" });
    const runs = [
      { actionId: "GENERATE_IDEAS" as const, state: "success" as const },
      { actionId: "GENERATE_IDEAS" as const, state: "failed" as const, safeErrorMessage: "old failure" }
    ];
    expect(getActionState(project, "GENERATE_IDEAS", runs).state).not.toBe("ERROR");
  });
});
