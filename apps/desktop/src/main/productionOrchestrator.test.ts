import { describe, expect, it } from "vitest";
import { createFixtureProject, type FactoryProject } from "@lsf/domain";
import { createProductionOrchestrator } from "./productionOrchestrator";

function projectWithStatuses(statuses: Record<string, "approved" | "needs_review"> = {}) {
  const project = createFixtureProject({ topic: "Topic", format: "short", targetLanguage: "Vietnamese", workflowMode: "semi_automatic", visualWorkflow: "legacy" });
  return { ...project, stages: project.stages.map((stage) => { const status = statuses[stage.id]; return status ? { ...stage, status } : stage; }) };
}

function characterFirstProjectWithStatuses(statuses: Record<string, "approved" | "needs_review"> = {}) {
  const project = createFixtureProject({ topic: "Character topic", format: "short", targetLanguage: "Vietnamese", workflowMode: "semi_automatic", visualWorkflow: "character_first", characterVersionId: "character-test" });
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

  it("skips Idea Lab for Existing Script mode", async () => {
    let project: FactoryProject = createFixtureProject({
      topic: "Existing script",
      format: "short",
      targetLanguage: "Vietnamese",
      workflowMode: "semi_automatic",
      inputMode: "existing_script",
      sourceScript: "A complete script supplied by the user."
    });
    const calls: string[] = [];
    const orchestrator = createProductionOrchestrator({
      loadProject: async () => project,
      invoke: async (channel) => {
        calls.push(channel);
        if (channel === "prepare-existing-script") {
          project = { ...project, stages: project.stages.map((stage) => ["outline", "script"].includes(stage.id) ? { ...stage, status: "approved" as const } : stage) };
          return project as never;
        }
        const stageId = channel.replace(/^(run|approve)-/, "");
        project = { ...project, stages: project.stages.map((stage) => stage.id === stageId ? { ...stage, status: channel.startsWith("approve-") ? "approved" as const : "needs_review" as const } : stage) };
        return project as never;
      }
    });

    await orchestrator.startPreparation(project.id);
    const result = await orchestrator.continueAfterIdeaSelection(project.id, "existing-script");

    expect(calls[0]).toBe("prepare-existing-script");
    expect(calls).not.toContain("run-idea-lab");
    expect(calls).toContain("run-fact-review");
    expect(result.stages.find((stage) => stage.id === "prompt-preparation")?.status).toBe("approved");
    expect(calls).not.toContain("run-asset-acquisition");
  });

  it("auto-approves valid reference validation in Semi-automatic mode", async () => {
    const base = createFixtureProject({
      topic: "Reference topic",
      format: "short",
      targetLanguage: "Vietnamese",
      workflowMode: "semi_automatic",
      inputMode: "reference",
      competitorReference: { pastedTranscript: "A sufficiently long reference transcript for testing." }
    });
    let project: FactoryProject = {
      ...base,
      competitorReferences: base.competitorReferences.map((reference) => ({ ...reference, status: "draft" as const }))
    };
    const calls: Array<{ channel: string; input: Record<string, unknown> }> = [];
    const setStatus = (stageId: string, status: "approved" | "needs_review") => {
      project = { ...project, stages: project.stages.map((stage) => stage.id === stageId ? { ...stage, status } : stage) };
      return project;
    };
    const orchestrator = createProductionOrchestrator({
      loadProject: async () => project,
      invoke: async (channel, input) => {
        calls.push({ channel, input });
        if (channel === "validate-reference-set") return setStatus("reference-validation", "needs_review") as never;
        if (channel === "approve-reference-set") {
          project = { ...setStatus("reference-validation", "approved"), competitorReferences: project.competitorReferences.map((reference) => ({ ...reference, status: "approved" as const })) };
          return project as never;
        }
        if (channel === "run-idea-lab") return setStatus("idea-lab", "needs_review") as never;
        return setStatus(channel.startsWith("approve-") ? channel.slice("approve-".length) : channel.slice("run-".length), "approved") as never;
      }
    });

    await orchestrator.startPreparation(project.id);
    expect(calls[1]).toEqual({ channel: "approve-reference-set", input: { projectId: project.id, approvalMode: "automatic" } });
  });

  it("skips web search and Claim Map for Topic Mode", async () => {
    let project: FactoryProject = {
      ...projectWithStatuses({ "idea-lab": "approved" }),
      approvedIdeaId: "idea-1"
    };
    const calls: string[] = [];
    const stageForChannel: Record<string, string> = {
      "run-originality-review": "originality-review",
      "approve-originality-review": "originality-review",
      "run-outline": "outline",
      "approve-outline": "outline",
      "run-script": "script",
      "approve-script": "script",
      "run-fact-review": "fact-review",
      "approve-fact-review": "fact-review",
      "run-retention-review": "retention-review",
      "approve-retention-review": "retention-review",
      "run-scene-plan": "scene-plan",
      "approve-scene-plan": "scene-plan",
      "run-shot-plan": "shot-plan",
      "approve-shot-plan": "shot-plan",
      "run-visual-routing": "visual-routing",
      "approve-visual-routing": "visual-routing",
      "run-prompt-preparation": "prompt-preparation",
      "approve-prompt-preparation": "prompt-preparation",
      "run-asset-acquisition": "asset-acquisition",
      "approve-asset-acquisition": "asset-acquisition",
      "run-asset-review": "asset-review"
    };
    const orchestrator = createProductionOrchestrator({
      loadProject: async () => project,
      invoke: async (channel) => {
        calls.push(channel);
        const stageId = stageForChannel[channel];
        project = { ...project, stages: project.stages.map((stage) => stage.id === stageId ? { ...stage, status: channel.startsWith("approve-") ? "approved" as const : "needs_review" as const } : stage) };
        return project as never;
      }
    });

    await orchestrator.continueAfterIdeaSelection(project.id, "idea-1");

    expect(calls.slice(0, 8)).toEqual([
      "run-originality-review",
      "approve-originality-review",
      "run-outline",
      "approve-outline",
      "run-script",
      "approve-script",
      "run-fact-review",
      "approve-fact-review"
    ]);
    expect(calls).not.toContain("run-research-source-search");
    expect(calls).not.toContain("run-claim-map");
  });

  it("runs Character Preparation and Asset Concepts before prompts for character-first projects", async () => {
    let project: FactoryProject = {
      ...characterFirstProjectWithStatuses({ "idea-lab": "approved", "character-preparation": "approved" }),
      approvedIdeaId: "idea-1"
    };
    const calls: string[] = [];
    const stageForChannel: Record<string, string> = {
      "run-originality-review": "originality-review",
      "approve-originality-review": "originality-review",
      "run-outline": "outline",
      "approve-outline": "outline",
      "run-script": "script",
      "approve-script": "script",
      "run-fact-review": "fact-review",
      "approve-fact-review": "fact-review",
      "run-retention-review": "retention-review",
      "approve-retention-review": "retention-review",
      "run-scene-plan": "scene-plan",
      "approve-scene-plan": "scene-plan",
      "run-shot-plan": "shot-plan",
      "approve-shot-plan": "shot-plan",
      "run-character-preparation": "character-preparation",
      "approve-character-preparation": "character-preparation",
      "run-visual-routing": "visual-routing",
      "approve-visual-routing": "visual-routing",
      "run-asset-concepts": "asset-concepts",
      "run-prompt-preparation": "prompt-preparation",
      "approve-prompt-preparation": "prompt-preparation",
      "run-asset-acquisition": "asset-acquisition",
      "approve-asset-acquisition": "asset-acquisition"
    };
    const orchestrator = createProductionOrchestrator({
      loadProject: async () => project,
      invoke: async (channel) => {
        calls.push(channel);
        if (channel === "run-asset-review") {
          project = { ...project, stages: project.stages.map((stage) => stage.id === "asset-review" ? { ...stage, status: "approved" as const } : stage) };
          return project as never;
        }
        const stageId = stageForChannel[channel];
        const status = channel === "run-asset-concepts" || channel.startsWith("approve-") ? "approved" as const : "needs_review" as const;
        project = { ...project, stages: project.stages.map((stage) => stage.id === stageId ? { ...stage, status } : stage) };
        return project as never;
      }
    });

    await orchestrator.continueAfterIdeaSelection(project.id, "idea-1");

    const visualStart = calls.indexOf("run-character-preparation");
    expect(calls.slice(visualStart)).toEqual([
      "run-character-preparation",
      "approve-character-preparation",
      "run-visual-routing",
      "approve-visual-routing",
      "run-asset-concepts",
      "run-prompt-preparation",
      "approve-prompt-preparation"
    ]);
    expect(calls).not.toContain("approve-asset-concepts");
    expect(calls).not.toContain("run-asset-acquisition");
  });

  it("rechecks an approved Asset Concepts stage when resuming a character-first project", async () => {
    let project: FactoryProject = {
      ...characterFirstProjectWithStatuses({
        "idea-lab": "approved",
        "originality-review": "approved",
        "outline": "approved",
        "script": "approved",
        "fact-review": "approved",
        "retention-review": "approved",
        "scene-plan": "approved",
        "shot-plan": "approved",
        "character-preparation": "approved",
        "visual-routing": "approved",
        "asset-concepts": "approved"
      }),
      approvedIdeaId: "idea-1"
    };
    const calls: string[] = [];
    const orchestrator = createProductionOrchestrator({
      loadProject: async () => project,
      invoke: async (channel) => {
        calls.push(channel);
        const stageId = channel === "run-asset-review" ? "asset-review" : channel.replace(/^(run|approve)-/, "");
        const status = channel === "run-asset-concepts" || channel.startsWith("approve-") || channel === "run-asset-review"
          ? "approved" as const
          : "needs_review" as const;
        project = { ...project, stages: project.stages.map((stage) => stage.id === stageId ? { ...stage, status } : stage) };
        return project as never;
      }
    });

    await orchestrator.continueAfterIdeaSelection(project.id, "idea-1");

    expect(calls).toContain("run-asset-concepts");
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

  it("stops before Voice Generation until the project selects a voice", async () => {
    const project = projectWithStatuses({ "asset-review": "approved" });
    const calls: string[] = [];
    const orchestrator = createProductionOrchestrator({
      loadProject: async () => project,
      invoke: async (channel) => { calls.push(channel); return project as never; }
    });
    const result = await orchestrator.startMediaGeneration(project.id);
    expect(result).toBe(project);
    expect(calls).toEqual([]);
  });
});
