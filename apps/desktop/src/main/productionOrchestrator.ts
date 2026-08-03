import type { FactoryProject } from "@lsf/domain";

export interface ProductionOrchestrator {
  startPreparation(projectId: string): Promise<FactoryProject>;
  continueAfterIdeaSelection(projectId: string, ideaId: string): Promise<FactoryProject>;
  startMediaGeneration(projectId: string): Promise<FactoryProject>;
  retryScene(projectId: string, sceneId: string): Promise<FactoryProject>;
  continueAfterSceneReview(projectId: string): Promise<FactoryProject>;
  renderPreview(projectId: string): Promise<FactoryProject>;
  continueAfterFinalApproval(projectId: string): Promise<FactoryProject>;
}

export interface ProductionOrchestratorDependencies {
  loadProject(projectId: string): Promise<FactoryProject | null>;
  invoke<T>(channel: string, input: Record<string, unknown>): Promise<T>;
}

export class ProductionOrchestratorError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ProductionOrchestratorError";
  }
}

export function createProductionOrchestrator(dependencies: ProductionOrchestratorDependencies): ProductionOrchestrator {
  const active = new Set<string>();

  async function current(projectId: string): Promise<FactoryProject> {
    const project = await dependencies.loadProject(projectId);
    if (!project) throw new ProductionOrchestratorError("project_not_found", "Project was not found.");
    return project;
  }

  async function withLock<T>(projectId: string, work: () => Promise<T>): Promise<T> {
    if (active.has(projectId)) throw new ProductionOrchestratorError("active_run", "Production is already running for this project.");
    active.add(projectId);
    try {
      return await work();
    } finally {
      active.delete(projectId);
    }
  }

  async function runStage(projectId: string, stageId: string, runChannel: string, approveChannel: string, runInput: Record<string, unknown> = {}, approveInput: Record<string, unknown> = {}, options: { force?: boolean; leaveForReview?: boolean } = {}): Promise<FactoryProject> {
    let project = await current(projectId);
    const status = project.stages.find((stage) => stage.id === stageId)?.status;
    if (status === "approved" && !options.force) return project;
    let generated = await dependencies.invoke<FactoryProject>(runChannel, { projectId, ...runInput });
    let generatedStatus = generated.stages.find((stage) => stage.id === stageId)?.status;
    for (let attempt = 0; (generatedStatus === "queued" || generatedStatus === "running") && attempt < 120; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      generated = await current(projectId);
      generatedStatus = generated.stages.find((stage) => stage.id === stageId)?.status;
    }
    if (generatedStatus === "failed" || generatedStatus === "needs_attention") {
      throw new ProductionOrchestratorError("stage_needs_attention", `${stageId} needs attention before production can continue.`);
    }
    if (generatedStatus === "approved") return generated;
    if (generatedStatus !== "needs_review") {
      throw new ProductionOrchestratorError("stage_not_reviewable", `${stageId} did not produce a reviewable result.`);
    }
    if (options.leaveForReview) return generated;
    return dependencies.invoke<FactoryProject>(approveChannel, { projectId, ...approveInput });
  }

  async function runPreparation(projectId: string): Promise<FactoryProject> {
    let project = await current(projectId);
    const isReference = project.setup.inputMode === "reference" || project.competitorReferences.length > 0;
    if (isReference) {
      await runStage(projectId, "reference-validation", "validate-reference-set", "approve-reference-set");
      project = await current(projectId);
      for (const reference of project.competitorReferences.filter((item) => item.included !== false && item.status === "approved")) {
        const referenceInput = { referenceId: reference.id };
        project = await runStage(projectId, "transcript-cleaning", "run-transcript-cleaning", "approve-transcript-cleaning", referenceInput, referenceInput);
        project = await runStage(projectId, "reference-segmentation", "run-reference-segmentation", "approve-reference-segmentation", referenceInput, referenceInput);
        project = await runStage(projectId, "competitor-dna", "run-competitor-dna", "approve-competitor-dna", referenceInput, referenceInput);
      }
      project = await runStage(projectId, "opportunity-map", "run-opportunity-map", "approve-opportunity-map");
    }
    if (project.setup.inputMode === "existing_script") {
      return dependencies.invoke<FactoryProject>("prepare-existing-script", { projectId });
    }
    if (project.stages.find((stage) => stage.id === "idea-lab")?.status !== "approved") {
      return dependencies.invoke<FactoryProject>("run-idea-lab", { projectId });
    }
    return project;
  }

  async function continueAfterIdeaSelection(projectId: string, ideaId: string): Promise<FactoryProject> {
    return withLock(projectId, async () => {
      let selected = await current(projectId);
      if (selected.setup.inputMode !== "existing_script" && (selected.approvedIdeaId !== ideaId || selected.stages.find((stage) => stage.id === "idea-lab")?.status !== "approved")) {
        await dependencies.invoke<FactoryProject>("approve-idea", { projectId, ideaId });
      }
      if (selected.setup.inputMode === "existing_script") {
        selected = await runStage(projectId, "fact-review", "run-fact-review", "approve-fact-review");
        selected = await runStage(projectId, "retention-review", "run-retention-review", "approve-retention-review");
        selected = await runStage(projectId, "scene-plan", "run-scene-plan", "approve-scene-plan");
        selected = await runStage(projectId, "shot-plan", "run-shot-plan", "approve-shot-plan");
        selected = await runStage(projectId, "visual-routing", "run-visual-routing", "approve-visual-routing");
        selected = await runStage(projectId, "prompt-preparation", "run-prompt-preparation", "approve-prompt-preparation");
        selected = await runStage(projectId, "asset-acquisition", "run-asset-acquisition", "approve-asset-acquisition");
        return dependencies.invoke<FactoryProject>("run-asset-review", { projectId });
      }
      let project = await runStage(projectId, "originality-review", "run-originality-review", "approve-originality-review");
      project = await runStage(projectId, "outline", "run-outline", "approve-outline");
      project = await runStage(projectId, "script", "run-script", "approve-script");
      project = await runStage(projectId, "fact-review", "run-fact-review", "approve-fact-review");
      project = await runStage(projectId, "retention-review", "run-retention-review", "approve-retention-review");
      project = await runStage(projectId, "scene-plan", "run-scene-plan", "approve-scene-plan");
      project = await runStage(projectId, "shot-plan", "run-shot-plan", "approve-shot-plan");
      project = await runStage(projectId, "visual-routing", "run-visual-routing", "approve-visual-routing");
      project = await runStage(projectId, "prompt-preparation", "run-prompt-preparation", "approve-prompt-preparation");
      project = await runStage(projectId, "asset-acquisition", "run-asset-acquisition", "approve-asset-acquisition");
      return dependencies.invoke<FactoryProject>("run-asset-review", { projectId });
    });
  }

  async function startMediaGeneration(projectId: string): Promise<FactoryProject> {
    return withLock(projectId, async () => {
      let project = await runStage(projectId, "voice-generation", "run-voice-generation", "approve-voice-generation");
      project = await runStage(projectId, "subtitle-preparation", "run-subtitle-preparation", "approve-subtitle-preparation");
      project = await runStage(projectId, "timeline-assembly", "run-timeline-assembly", "approve-timeline-assembly");
      return runStage(projectId, "preview-render", "run-preview-render", "approve-preview-render", {}, {}, { leaveForReview: true });
    });
  }

  return {
    startPreparation: (projectId) => withLock(projectId, () => runPreparation(projectId)),
    continueAfterIdeaSelection,
    startMediaGeneration,
    retryScene: (projectId, sceneId) => withLock(projectId, async () => {
      const project = await current(projectId);
      if (!project.scenes.some((scene) => scene.id === sceneId)) throw new ProductionOrchestratorError("scene_not_found", "The selected scene was not found.");
      if (!project.shots.some((shot) => shot.sceneId === sceneId && shot.visualMode === "ai_image")) throw new ProductionOrchestratorError("scene_has_no_regenerable_media", "The selected scene has no AI image media to regenerate.");
      await runStage(projectId, "asset-acquisition", "run-asset-acquisition", "approve-asset-acquisition", { sceneId }, {}, { force: true });
      return dependencies.invoke<FactoryProject>("run-asset-review", { projectId, sceneId });
    }),
    continueAfterSceneReview: startMediaGeneration,
    renderPreview: (projectId) => withLock(projectId, () => runStage(projectId, "preview-render", "run-preview-render", "approve-preview-render", { force: true }, {}, { force: true })),
    continueAfterFinalApproval: (projectId) => withLock(projectId, async () => {
      await runStage(projectId, "qa", "run-qa", "approve-qa");
      return runStage(projectId, "packaging-export", "run-packaging-export", "approve-packaging-export");
    })
  };
}
