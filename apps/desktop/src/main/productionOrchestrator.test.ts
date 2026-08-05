import { describe, expect, it } from "vitest";
import { createFixtureProject } from "@lsf/domain";
import { createProductionOrchestrator } from "./productionOrchestrator";

function projectWithStatuses(statuses: Record<string, "approved" | "needs_review"> = {}) {
  const project = createFixtureProject({ topic: "Topic", format: "short", targetLanguage: "Vietnamese", workflowMode: "semi_automatic" });
  return { ...project, stages: project.stages.map((stage) => { const status = statuses[stage.id]; return status ? { ...stage, status } : stage; }) };
}

describe("production orchestrator", () => {
  it("runs topic preparation until idea selection", async () => {
    const project = projectWithStatuses();
    const calls: string[] = [];
    const orchestrator = createProductionOrchestrator({
      loadProject: async () => project,
      invoke: async (channel) => { calls.push(channel); return { ...project, stages: project.stages.map((stage) => stage.id === "idea-lab" ? { ...stage, status: "needs_review" as const } : stage) } as never; }
    });
    const result = await orchestrator.startPreparation(project.id);
    expect(result.stages.find((stage) => stage.id === "idea-lab")?.status).toBe("needs_review");
    expect(calls).toEqual(["run-idea-lab"]);
  });

  it("rejects duplicate active work", async () => {
    let release: (() => void) | undefined;
    const project = projectWithStatuses();
    const orchestrator = createProductionOrchestrator({
      loadProject: async () => project,
      invoke: async () => new Promise<import("@lsf/domain").FactoryProject>((resolve) => { release = () => resolve(project); }) as never
    });
    const first = orchestrator.startPreparation(project.id);
    await expect(orchestrator.startPreparation(project.id)).rejects.toMatchObject({ code: "active_run" });
    release?.();
    await first;
  });

  it("retries only the selected scene and rebuilds scene review", async () => {
    const base = projectWithStatuses({ "asset-acquisition": "approved" });
    const project = {
      ...base,
      scenes: [{ id: "scene-1", scriptSectionId: "section-1", narration: "Narration", purpose: "Explain", startFrame: 0, durationFrames: 30, visualMode: "ai_image" as const, emotionalState: "neutral", requiredAssets: [], continuityRefs: [] }],
      shots: [{ id: "shot-1", sceneId: "scene-1", order: 0, startFrame: 0, durationFrames: 30, fps: 30, purpose: "Explain", visualMode: "ai_image" as const, framing: "wide", cameraAngle: "front", cameraMovement: "static", subjectAction: "none", startState: {}, endState: {}, continuityRefs: [] }]
    };
    const calls: Array<{ channel: string; input: Record<string, unknown> }> = [];
    const orchestrator = createProductionOrchestrator({
      loadProject: async () => project,
      invoke: async (channel, input) => {
        calls.push({ channel, input });
        const stageStatus = channel === "run-asset-acquisition" ? "needs_review" : channel === "approve-asset-acquisition" ? "approved" : "needs_review";
        const stageId = channel === "run-asset-acquisition" || channel === "approve-asset-acquisition" ? "asset-acquisition" : "asset-review";
        return { ...project, stages: project.stages.map((stage) => stage.id === stageId ? { ...stage, status: stageStatus as "approved" | "needs_review" } : stage) } as never;
      }
    });
    await orchestrator.retryScene(project.id, project.scenes[0]!.id);
    expect(calls).toEqual([
      { channel: "run-asset-acquisition", input: { projectId: project.id, sceneId: project.scenes[0]!.id } },
      { channel: "approve-asset-acquisition", input: { projectId: project.id } },
      { channel: "run-asset-review", input: { projectId: project.id, sceneId: project.scenes[0]!.id } }
    ]);
  });

  it("runs packaging directly after QA without invoking CapCut", async () => {
    const project = projectWithStatuses({ qa: "approved" });
    const calls: Array<{ channel: string; input: Record<string, unknown> }> = [];
    const orchestrator = createProductionOrchestrator({
      loadProject: async () => project,
      invoke: async (channel, input) => {
        calls.push({ channel, input });
        const stageId = channel === "run-packaging-export" || channel === "approve-packaging-export" ? "packaging-export" : "qa";
        const status = channel.startsWith("approve-") ? "approved" as const : "needs_review" as const;
        return { ...project, stages: project.stages.map((stage) => stage.id === stageId ? { ...stage, status } : stage) } as never;
      }
    });
    const result = await orchestrator.continueAfterFinalApproval(project.id);
    expect(result.stages.find((stage) => stage.id === "packaging-export")?.status).toBe("approved");
    expect(calls).toEqual([
      { channel: "run-packaging-export", input: { projectId: project.id } },
      { channel: "approve-packaging-export", input: { projectId: project.id } }
    ]);
  });

  it("leaves preview render at the final review checkpoint", async () => {
    const project = projectWithStatuses({ "voice-generation": "approved", "subtitle-preparation": "approved", "timeline-assembly": "approved" });
    const calls: string[] = [];
    const orchestrator = createProductionOrchestrator({
      loadProject: async () => project,
      invoke: async (channel) => {
        calls.push(channel);
        return { ...project, stages: project.stages.map((stage) => stage.id === "preview-render" ? { ...stage, status: "needs_review" as const } : stage) } as never;
      }
    });
    const result = await orchestrator.startMediaGeneration(project.id);
    expect(result.stages.find((stage) => stage.id === "preview-render")?.status).toBe("needs_review");
    expect(calls).toEqual(["run-preview-render"]);
  });
});
