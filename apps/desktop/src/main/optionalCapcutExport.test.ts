import { describe, expect, it } from "vitest";
import { createFixtureProject, resolveStageEligibilities } from "@lsf/domain";
import { createProductionOrchestrator } from "./productionOrchestrator";

describe("optional CapCut final export", () => {
  it("runs packaging after QA without invoking CapCut", async () => {
    const base = createFixtureProject({ topic: "Topic", format: "short", targetLanguage: "Vietnamese", workflowMode: "semi_automatic" });
    const project = { ...base, stages: base.stages.map((stage) => stage.id === "qa" ? { ...stage, status: "approved" as const } : stage) };
    const calls: string[] = [];
    const orchestrator = createProductionOrchestrator({
      loadProject: async () => project,
      invoke: async (channel) => {
        calls.push(channel);
        return { ...project, stages: project.stages.map((stage) => stage.id === "packaging-export" ? { ...stage, status: "needs_review" as const } : stage) } as never;
      }
    });

    const result = await orchestrator.continueAfterFinalApproval(project.id);

    expect(result.stages.find((stage) => stage.id === "packaging-export")?.status).toBe("needs_review");
    expect(calls).toEqual(["run-packaging-export", "approve-packaging-export"]);

    const eligibilityProject = {
      ...project,
      referenceSet: { status: "approved" as const },
      stages: project.stages.map((stage) => stage.id === "capcut-draft" || stage.id === "packaging-export"
        ? { ...stage, status: "not_started" as const }
        : { ...stage, status: "approved" as const })
    };
    expect(resolveStageEligibilities(eligibilityProject).find((stage) => stage.stageId === "packaging-export")?.status).toBe("ready");
  });
});
