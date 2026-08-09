import { describe, expect, it } from "vitest";
import { createFixtureProject, getActionState, resolveProjectCheckpoints } from "../src";

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
  });
});
