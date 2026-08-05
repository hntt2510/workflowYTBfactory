import { characterVersionIsApproved, semiAutomaticAutomaticStageIds, semiAutomaticCheckpointIds, type ChannelProfile, type FactoryProject, type WorkflowStageStatus } from "@lsf/domain";
import type { LongShortFactoryApi } from "./types";
import { safeRendererError } from "./utils";

export type SemiAutomaticClient = Pick<LongShortFactoryApi,
  | "loadProject"
  | "markStageAttention"
  | "runTranscriptCleaning" | "approveTranscriptCleaning"
  | "runReferenceSegmentation" | "approveReferenceSegmentation"
  | "runCompetitorDna" | "approveCompetitorDna"
  | "runOpportunityMap" | "approveOpportunityMap"
  | "runIdeaLab"
  | "runOriginalityReview" | "approveOriginalityReview"
  | "runOutline" | "approveOutline"
  | "runScript" | "approveScript"
  | "runFactReview" | "approveFactReview"
  | "runRetentionReview" | "approveRetentionReview"
  | "runScenePlan" | "approveScenePlan"
  | "runShotPlan" | "approveShotPlan"
  | "runVisualRouting" | "approveVisualRouting"
  | "runCharacterPreparation"
  | "runAssetConcepts"
  | "runPromptPreparation" | "approvePromptPreparation"
  | "runAssetAcquisition" | "approveAssetAcquisition"
  | "runAssetReview"
  | "runVoiceGeneration" | "listVoiceGenerationArtifacts" | "approveVoiceGeneration"
  | "runSubtitlePreparation" | "approveSubtitlePreparation"
  | "runTimelineAssembly" | "approveTimelineAssembly"
  | "runPreviewRender"
  | "runQa" | "approveQa"
  | "runCapCutDraft" | "approveCapCutDraft"
  | "runPackagingExport" | "approvePackagingExport"
>;

export type SemiAutomaticChain = "reference" | "idea" | "assets" | "preview";

export function hasSemiAutomaticAttention(project: FactoryProject): boolean {
  return project.stages.some((stage) => {
    if (stage.status !== "failed" && stage.status !== "needs_attention") return false;
    if (stage.id === "reference-validation") return true;
    return !semiAutomaticAutomaticStageIds.has(stage.id) && !semiAutomaticCheckpointIds.has(stage.id);
  });
}

export function characterVersionNeedsSetup(project: FactoryProject, profile: ChannelProfile | undefined): boolean {
  if (project.setup.visualWorkflow !== "character_first") return false;
  const boundCharacter = profile?.characterVersions?.find((version) => version.id === project.setup.characterVersionId);
  const activeCharacter = profile?.characterVersions?.find((version) => version.id === profile.activeCharacterVersionId);
  return !characterVersionIsApproved(boundCharacter) && !characterVersionIsApproved(activeCharacter);
}

/** Returns the next automatic segment without crossing a human checkpoint. */
export function nextSemiAutomaticChain(project: FactoryProject): SemiAutomaticChain | undefined {
  if (project.setup.workflowMode !== "semi_automatic") return undefined;
  if (hasSemiAutomaticAttention(project)) return undefined;
  const referenceValidation = statusOf(project, "reference-validation");
  const ideaLab = statusOf(project, "idea-lab");
  const assetReview = statusOf(project, "asset-review");
  const previewRender = statusOf(project, "preview-render");
  const capcutDraft = statusOf(project, "capcut-draft");
  const packagingExport = statusOf(project, "packaging-export");
  const needsReferenceAnalysis = project.setup.inputMode === "reference" || project.competitorReferences.length > 0;

  if (needsReferenceAnalysis && referenceValidation !== "approved") return "reference";
  if (project.setup.inputMode === "existing_script" && statusOf(project, "script") !== "approved") return "reference";
  if (project.setup.inputMode === "existing_script" && assetReview !== "approved") return "idea";
  if (ideaLab !== "approved") {
    return ideaLab === "needs_review" || ideaLab === "rejected" ? undefined : "reference";
  }
  if (project.setup.visualWorkflow === "character_first" && statusOf(project, "prompt-preparation") === "approved" && assetReview !== "approved") return undefined;
  if (assetReview !== "approved") {
    return assetReview === "needs_review" || assetReview === "rejected" ? undefined : "idea";
  }
  if (statusOf(project, "voice-generation") !== "approved") return undefined;
  if (previewRender !== "approved") {
    return previewRender === "needs_review" || previewRender === "rejected" ? undefined : "assets";
  }
  if (capcutDraft === "needs_review" || capcutDraft === "rejected") return undefined;
  if (packagingExport !== "approved") return packagingExport === "rejected" ? undefined : "preview";
  return undefined;
}

export interface SemiAutomaticProgress {
  chain: SemiAutomaticChain;
  completed: number;
  total: number;
  stageId: string;
  message: string;
}

export class SemiAutomaticAttentionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SemiAutomaticAttentionError";
  }
}

const referenceStages = ["Transcript Cleaning", "Reference Segmentation", "Competitor DNA", "Opportunity Map", "Idea Lab"];
const ideaStages = ["Originality Review", "Outline", "Script", "Fact Review", "Retention Review", "Scene Plan", "Shot Plan", "Character Preparation", "Visual Routing", "Asset Concepts", "Prompt Preparation", "Asset Acquisition", "Asset Review"];
const assetStages = ["Voice Generation", "Subtitle Preparation", "Timeline Assembly", "Preview Render"];
const previewStages = ["QA", "Packaging Export"];
const automaticRecoveryMaxAttempts = 2;
const automaticRecoveryBaseDelayMs = 250;

function statusOf(project: FactoryProject, stageId: string): WorkflowStageStatus | undefined {
  return project.stages.find((stage) => stage.id === stageId)?.status;
}

function isApproved(project: FactoryProject, stageId: string): boolean {
  return statusOf(project, stageId) === "approved";
}

function assertSemiAutomatic(project: FactoryProject): void {
  if (project.setup.workflowMode !== "semi_automatic") {
    throw new SemiAutomaticAttentionError("Semi-automatic execution is available only for projects using Semi-automatic mode. Guided mode remains manual and Full Automatic mode is not implemented.");
  }
}

function errorMessage(error: unknown): string {
  return safeRendererError(error);
}

async function waitForAutomaticRetry(attempt: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, automaticRecoveryBaseDelayMs * (2 ** (attempt - 1))));
}

function report(
  onProgress: ((progress: SemiAutomaticProgress) => void) | undefined,
  chain: SemiAutomaticChain,
  completed: number,
  total: number,
  stageId: string,
  message: string
): void {
  onProgress?.({ chain, completed, total, stageId, message });
}

async function runAndApprove(
  client: SemiAutomaticClient,
  project: FactoryProject,
  stageId: string,
  run: () => Promise<FactoryProject>,
  approve: (() => Promise<FactoryProject>) | undefined,
  chain: SemiAutomaticChain,
  completed: number,
  total: number,
  onProgress?: (progress: SemiAutomaticProgress) => void
): Promise<FactoryProject> {
  if (isApproved(project, stageId) && stageId !== "asset-concepts") return project;
  let lastMessage = `${stageId} did not complete.`;
  for (let attempt = 1; attempt <= automaticRecoveryMaxAttempts; attempt += 1) {
    report(onProgress, chain, completed, total, stageId, attempt === 1 ? `Running ${stageId}.` : `Retrying ${stageId} (attempt ${attempt}/${automaticRecoveryMaxAttempts}).`);
    let attentionCode = "AUTOMATIC_RUN_FAILED";
    try {
      const generated = await run();
      const status = statusOf(generated, stageId);
      if (status === "failed" || status === "needs_attention") throw new Error(`${stageId} stopped with status ${status}.`);
      if (status === "approved") return generated;
      if (status !== "needs_review") throw new Error(`${stageId} returned unexpected status ${status ?? "unknown"}.`);
      if (!approve) return generated;
      report(onProgress, chain, completed, total, stageId, `Validating ${stageId}.`);
      attentionCode = "AUTO_APPROVAL_BLOCKED";
      const approved = await approve();
      if (!isApproved(approved, stageId)) throw new Error(`${stageId} approval did not produce an approved stage.`);
      return approved;
    } catch (error) {
      lastMessage = errorMessage(error);
      await client.markStageAttention({ projectId: project.id, stageId, code: attentionCode, message: lastMessage }).catch(() => undefined);
      if (attempt < automaticRecoveryMaxAttempts) await waitForAutomaticRetry(attempt);
    }
  }
  throw new SemiAutomaticAttentionError(`${stageId} needs attention after ${automaticRecoveryMaxAttempts} attempts: ${lastMessage}`);
}

async function runPerReferenceStage(
  client: SemiAutomaticClient,
  project: FactoryProject,
  references: FactoryProject["competitorReferences"],
  stageId: "transcript-cleaning" | "reference-segmentation" | "competitor-dna",
  run: (referenceId: string) => Promise<FactoryProject>,
  approve: (referenceId: string) => Promise<FactoryProject>,
  chain: SemiAutomaticChain,
  completed: number,
  total: number,
  onProgress?: (progress: SemiAutomaticProgress) => void
): Promise<FactoryProject> {
  let current = project;
  for (const reference of references) {
    if (current.setup.workflowMode !== "semi_automatic") throw new SemiAutomaticAttentionError("Project mode changed while the Semi-automatic run was active.");
    let lastMessage = `${stageId} did not complete for reference ${reference.id}.`;
    let completedReference = false;
    for (let attempt = 1; attempt <= automaticRecoveryMaxAttempts; attempt += 1) {
      report(onProgress, chain, completed, total, stageId, attempt === 1 ? `Processing ${reference.id}.` : `Retrying ${stageId} for ${reference.id} (attempt ${attempt}/${automaticRecoveryMaxAttempts}).`);
      let attentionCode = "AUTOMATIC_RUN_FAILED";
      try {
        const generated = await run(reference.id);
        const status = statusOf(generated, stageId);
        if (status === "needs_attention" || status === "failed") throw new Error(`${stageId} stopped with status ${status}.`);
        if (status === "approved") {
          current = generated;
        } else {
          if (status !== "needs_review") throw new Error(`${stageId} returned unexpected status ${status ?? "unknown"}.`);
          attentionCode = "AUTO_APPROVAL_BLOCKED";
          const approved = await approve(reference.id);
          if (!isApproved(approved, stageId)) throw new Error(`${stageId} approval did not produce an approved stage.`);
          current = approved;
        }
        completedReference = true;
        break;
      } catch (error) {
        lastMessage = errorMessage(error);
        await client.markStageAttention({ projectId: project.id, stageId, referenceId: reference.id, code: attentionCode, message: lastMessage }).catch(() => undefined);
        if (attempt < automaticRecoveryMaxAttempts) await waitForAutomaticRetry(attempt);
      }
    }
    if (!completedReference) throw new SemiAutomaticAttentionError(`${stageId} needs attention for reference ${reference.id} after ${automaticRecoveryMaxAttempts} attempts: ${lastMessage}`);
  }
  return current;
}

async function runCheckpoint(
  client: SemiAutomaticClient,
  project: FactoryProject,
  stageId: string,
  run: () => Promise<FactoryProject>,
  chain: SemiAutomaticChain,
  completed: number,
  total: number,
  message: string,
  onProgress?: (progress: SemiAutomaticProgress) => void
): Promise<FactoryProject> {
  let lastMessage = `${stageId} did not complete.`;
  for (let attempt = 1; attempt <= automaticRecoveryMaxAttempts; attempt += 1) {
    report(onProgress, chain, completed, total, stageId, attempt === 1 ? message : `Retrying ${stageId} (attempt ${attempt}/${automaticRecoveryMaxAttempts}).`);
    try {
      const generated = await run();
      const status = statusOf(generated, stageId);
      if (status === "needs_review") return generated;
      if (status === "approved") return generated;
      throw new Error(`${stageId} returned status ${status ?? "unknown"}.`);
    } catch (error) {
      lastMessage = errorMessage(error);
      await client.markStageAttention({ projectId: project.id, stageId, code: "CHECKPOINT_GENERATION_FAILED", message: lastMessage }).catch(() => undefined);
      if (attempt < automaticRecoveryMaxAttempts) await waitForAutomaticRetry(attempt);
    }
  }
  throw new SemiAutomaticAttentionError(`${stageId} needs attention after ${automaticRecoveryMaxAttempts} attempts: ${lastMessage}`);
}

export async function runReferenceChain(
  client: SemiAutomaticClient,
  input: { project: FactoryProject; onProgress?: (progress: SemiAutomaticProgress) => void }
): Promise<FactoryProject> {
  assertSemiAutomatic(input.project);
  const references = input.project.competitorReferences.filter((reference) => reference.included !== false && reference.status === "approved");
  let current = input.project;
  if (!references.length) {
    if (current.setup.inputMode === "existing_script") throw new SemiAutomaticAttentionError("Existing Script preparation is not available through the reference chain.");
    if (!isApproved(current, "idea-lab")) {
      return runCheckpoint(client, current, "idea-lab", () => client.runIdeaLab({ projectId: current.id }), "reference", 0, referenceStages.length, "Generating original ideas; pause for user idea selection.", input.onProgress);
    }
    return current;
  }
  current = await runPerReferenceStage(client, current, references, "transcript-cleaning", (referenceId) => client.runTranscriptCleaning({ projectId: current.id, referenceId }), (referenceId) => client.approveTranscriptCleaning({ projectId: current.id, referenceId }), "reference", 0, referenceStages.length, input.onProgress);
  current = await runPerReferenceStage(client, current, references, "reference-segmentation", (referenceId) => client.runReferenceSegmentation({ projectId: current.id, referenceId }), (referenceId) => client.approveReferenceSegmentation({ projectId: current.id, referenceId }), "reference", 1, referenceStages.length, input.onProgress);
  current = await runPerReferenceStage(client, current, references, "competitor-dna", (referenceId) => client.runCompetitorDna({ projectId: current.id, referenceId }), (referenceId) => client.approveCompetitorDna({ projectId: current.id, referenceId }), "reference", 2, referenceStages.length, input.onProgress);
  current = await runAndApprove(client, current, "opportunity-map", () => client.runOpportunityMap({ projectId: current.id }), () => client.approveOpportunityMap({ projectId: current.id }), "reference", 3, referenceStages.length, input.onProgress);
  if (!isApproved(current, "idea-lab")) {
    current = await runCheckpoint(client, current, "idea-lab", () => client.runIdeaLab({ projectId: current.id }), "reference", 4, referenceStages.length, "Generating ideas; pause for user idea selection.", input.onProgress);
  }
  return current;
}

export async function runIdeaChain(
  client: SemiAutomaticClient,
  input: { project: FactoryProject; onProgress?: (progress: SemiAutomaticProgress) => void }
): Promise<FactoryProject> {
  assertSemiAutomatic(input.project);
  let current = input.project;
  const total = ideaStages.length;
  current = await runAndApprove(client, current, "originality-review", () => client.runOriginalityReview({ projectId: current.id }), () => client.approveOriginalityReview({ projectId: current.id }), "idea", 0, total, input.onProgress);
  current = await runAndApprove(client, current, "outline", () => client.runOutline({ projectId: current.id }), () => client.approveOutline({ projectId: current.id }), "idea", 1, total, input.onProgress);
  current = await runAndApprove(client, current, "script", () => client.runScript({ projectId: current.id }), () => client.approveScript({ projectId: current.id }), "idea", 2, total, input.onProgress);
  current = await runAndApprove(client, current, "fact-review", () => client.runFactReview({ projectId: current.id }), () => client.approveFactReview({ projectId: current.id }), "idea", 3, total, input.onProgress);
  current = await runAndApprove(client, current, "retention-review", () => client.runRetentionReview({ projectId: current.id }), () => client.approveRetentionReview({ projectId: current.id }), "idea", 4, total, input.onProgress);
  current = await runAndApprove(client, current, "scene-plan", () => client.runScenePlan({ projectId: current.id }), () => client.approveScenePlan({ projectId: current.id }), "idea", 5, total, input.onProgress);
  current = await runAndApprove(client, current, "shot-plan", () => client.runShotPlan({ projectId: current.id }), () => client.approveShotPlan({ projectId: current.id }), "idea", 6, total, input.onProgress);
  current = await runCheckpoint(client, current, "character-preparation", () => client.runCharacterPreparation({ projectId: current.id }), "idea", 7, total, "Character Pack is ready for the manual checkpoint before visual production.", input.onProgress);
  current = await runAndApprove(client, current, "visual-routing", () => client.runVisualRouting({ projectId: current.id }), () => client.approveVisualRouting({ projectId: current.id }), "idea", 8, total, input.onProgress);
  current = await runAndApprove(client, current, "asset-concepts", () => client.runAssetConcepts({ projectId: current.id }), undefined, "idea", 9, total, input.onProgress);
  current = await runAndApprove(client, current, "prompt-preparation", () => client.runPromptPreparation({ projectId: current.id }), () => client.approvePromptPreparation({ projectId: current.id }), "idea", 10, total, input.onProgress);
  if (current.setup.visualWorkflow === "character_first") return current;
  current = await runAndApprove(client, current, "asset-acquisition", () => client.runAssetAcquisition({ projectId: current.id }), () => client.approveAssetAcquisition({ projectId: current.id }), "idea", 11, total, input.onProgress);
  return runCheckpoint(client, current, "asset-review", () => client.runAssetReview({ projectId: current.id }), "idea", total, total, "Asset Review is ready for the manual checkpoint.", input.onProgress);
}

export async function runAssetChain(
  client: SemiAutomaticClient,
  input: { project: FactoryProject; onProgress?: (progress: SemiAutomaticProgress) => void }
): Promise<FactoryProject> {
  assertSemiAutomatic(input.project);
  let current = input.project;
  if (!isApproved(current, "voice-generation")) return current;
  current = await runAndApprove(client, current, "subtitle-preparation", () => client.runSubtitlePreparation({ projectId: current.id }), () => client.approveSubtitlePreparation({ projectId: current.id }), "assets", 1, assetStages.length, input.onProgress);
  current = await runAndApprove(client, current, "timeline-assembly", () => client.runTimelineAssembly({ projectId: current.id }), () => client.approveTimelineAssembly({ projectId: current.id }), "assets", 2, assetStages.length, input.onProgress);
  return runCheckpoint(client, current, "preview-render", () => client.runPreviewRender({ projectId: current.id }), "assets", 3, assetStages.length, "Preview Render is ready for the final human checkpoint.", input.onProgress);
}

export async function runPreviewChain(
  client: SemiAutomaticClient,
  input: { project: FactoryProject; onProgress?: (progress: SemiAutomaticProgress) => void }
): Promise<FactoryProject> {
  assertSemiAutomatic(input.project);
  let current = input.project;
  current = await runAndApprove(client, current, "qa", () => client.runQa({ projectId: current.id }), () => client.approveQa({ projectId: current.id }), "preview", 0, previewStages.length, input.onProgress);
  return runAndApprove(client, current, "packaging-export", () => client.runPackagingExport({ projectId: current.id }), () => client.approvePackagingExport({ projectId: current.id }), "preview", 1, previewStages.length, input.onProgress);
}
