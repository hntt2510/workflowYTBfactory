import {
  createFixtureProject,
  routeChannelProfile,
  seedChannelProfiles,
  type ChannelRouteDecision,
  type FactoryProject
} from "@lsf/domain";
import type {
  BootstrapData,
  GenerateLocalTtsInput,
  DevCapcutTestResult,
  DevIdeaTestResult,
  DevImageTestResult,
  DevStockTestResult,
  LongShortFactoryApi,
  LocalTtsGenerated,
  LocalTtsSettings,
  ProjectSummary,
  ProviderCredentialInput,
  ProviderModelConfigurationInput,
  ProviderCredentialSettings,
  ProviderPresence,
  TextModelCertificationResponse
  , ImageModelCertificationResponse
} from "../types";

const emptyQueue = { concurrency: 5, running: 0, jobs: [] };
const browserRuntime = {
  sidecarPythonPath: "Electron main process unavailable",
  pythonExists: false,
  pythonVersion: "Unavailable",
  pycapcutStatus: "Unavailable",
  capcutInstallPath: "Electron main process unavailable",
  capcutInstalled: false,
  ffmpegPath: "Electron main process unavailable",
  ffmpegAvailable: false,
  ffmpegStatus: "Unavailable in browser preview",
  capcutDraftDir: "Not configured",
  draftDirConfigured: false,
  capcutCompatibility: "Unavailable in browser preview"
  , devTestLabEnabled: false
};

function webFallback(): LongShortFactoryApi {
  let projects: FactoryProject[] = [];
  let providerSettings: ProviderCredentialSettings = {
    providerId: "9router",
    baseUrl: "Electron main process unavailable",
    hasCredential: false
  };

  return {
    async bootstrap(): Promise<BootstrapData> {
      return {
        profiles: seedChannelProfiles,
        workspaceRoot: "Browser preview only",
        databasePath: "Electron main process unavailable",
        projects: projects.map(toSummary),
        queue: emptyQueue,
        runtime: browserRuntime
      };
    },
    async startProductionPreparation(): Promise<FactoryProject> { throw new Error("Production orchestration requires Electron main process."); },
    async continueAfterIdeaSelection(): Promise<FactoryProject> { throw new Error("Production orchestration requires Electron main process."); },
    async startMediaGeneration(): Promise<FactoryProject> { throw new Error("Production orchestration requires Electron main process."); },
    async retryScene(): Promise<FactoryProject> { throw new Error("Production orchestration requires Electron main process."); },
    async reviseSceneReview(): Promise<FactoryProject> { throw new Error("Production orchestration requires Electron main process."); },
    async continueAfterSceneReview(): Promise<FactoryProject> { throw new Error("Production orchestration requires Electron main process."); },
    async renderProductionPreview(): Promise<FactoryProject> { throw new Error("Production orchestration requires Electron main process."); },
    async continueAfterFinalApproval(): Promise<FactoryProject> { throw new Error("Production orchestration requires Electron main process."); },
    async routeTopic(input): Promise<ChannelRouteDecision> {
      return routeChannelProfile(seedChannelProfiles, input);
    },
    async fixtureProject(input): Promise<FactoryProject> {
      const project = createFixtureProject({ ...input, profiles: seedChannelProfiles });
      projects = [project, ...projects.filter((item) => item.id !== project.id)];
      return project;
    },
    async listProjects(): Promise<ProjectSummary[]> {
      return projects.map(toSummary);
    },
    async loadProject(projectId): Promise<FactoryProject | null> {
      return projects.find((project) => project.id === projectId) ?? null;
    },
    async deleteProject(projectId): Promise<{ ok: boolean }> {
      projects = projects.filter((project) => project.id !== projectId);
      return { ok: true };
    },
    async saveProviderCredential(_input: ProviderCredentialInput): Promise<{ providerId: string; credentialRef: string }> {
      return { providerId: "9router", credentialRef: "browser-preview" };
    },
    async loadProviderCredentialSettings(providerId: string): Promise<ProviderCredentialSettings> {
      return providerId === "9router" ? providerSettings : { providerId, baseUrl: "Electron main process unavailable", hasCredential: false };
    },
    async hasProviderCredential(providerId: string): Promise<ProviderPresence> {
      return { providerId, hasCredential: false };
    },
    async testCredentialPresence(providerId: string): Promise<ProviderPresence> {
      return { providerId, hasCredential: false };
    },
    async deleteProviderCredential(providerId: string): Promise<{ providerId: string; deleted: boolean }> {
      return { providerId, deleted: false };
    },
    async list9RouterModels() {
      return {
        status: "network_error" as const,
        models: [],
        message: "Electron main process unavailable."
      };
    },
    async save9RouterModelConfiguration(input: ProviderModelConfigurationInput): Promise<ProviderCredentialSettings> {
      providerSettings = {
        ...providerSettings,
        ...(input.textModel ? { textModel: input.textModel } : {}),
        ...(input.imageModel ? { imageModel: input.imageModel } : {}),
        ...(input.videoModel ? { videoModel: input.videoModel } : {}),
        ...(input.ttsModel ? { ttsModel: input.ttsModel } : {}),
        ...(input.sttModel ? { sttModel: input.sttModel } : {})
      };
      return providerSettings;
    },
    async load9RouterTextCertification(): Promise<TextModelCertificationResponse> {
      return {
        status: "not_tested",
        message: "Electron main process unavailable.",
        errorCategory: "credential_missing"
      };
    },
    async run9RouterTextCertification(): Promise<TextModelCertificationResponse> {
      return {
        status: "failed",
        message: "Electron main process unavailable.",
        errorCategory: "network_error"
      };
    },
    async load9RouterImageCertification(): Promise<ImageModelCertificationResponse> { return { status: "not_tested", message: "Electron main process unavailable." }; },
    async run9RouterImageCertification(): Promise<ImageModelCertificationResponse> { return { status: "failed", message: "Electron main process unavailable.", errorCategory: "credential_missing" }; },
    async loadLocalTtsSettings(): Promise<LocalTtsSettings> {
      return {
        omnivoiceBinPath: "",
        outputDir: "Electron main process unavailable",
        ttsProvider: "omnivoice-local",
        ttsVoiceProvider: "edge-tts",
        ttsVoiceId: "",
        ttsPythonPath: "",
        modelPath: "",
        language: "",
        instruct: "",
        referenceAudioPath: "",
        referenceTranscript: "",
        available: false,
        resolvedBinPath: ""
      };
    },
    async saveLocalTtsSettings(input: Omit<LocalTtsSettings, "available" | "resolvedBinPath">): Promise<LocalTtsSettings> {
      return { ...input, available: false, resolvedBinPath: input.omnivoiceBinPath };
    },
    async selectLocalTtsReferenceAudio(): Promise<{ referenceAudioPath?: string }> { throw new Error("Electron main process unavailable."); },
    async generateLocalTts(_input: GenerateLocalTtsInput): Promise<LocalTtsGenerated> {
      throw new Error("Electron main process unavailable.");
    },
    async listNineRouterTtsCatalog(_input: { provider: "edge-tts" | "google-tts"; language: string }): Promise<import("../types").NineRouterTtsCatalogResult> { throw new Error("Electron main process unavailable."); },
    async listTtsProviders(): Promise<import("../types").TtsProviderCatalog> { throw new Error("Electron main process unavailable."); },
    async previewTtsProvider(): Promise<import("../types").TtsPreviewResult> { throw new Error("Electron main process unavailable."); },
    async createTtsJob(): Promise<import("../types").TtsJob> { throw new Error("Electron main process unavailable."); },
    async getTtsJob(): Promise<import("../types").TtsJob> { throw new Error("Electron main process unavailable."); },
    async getProjectTtsJob(): Promise<import("../types").TtsJob | null> { throw new Error("Electron main process unavailable."); },
    async retryTtsJobSegment(): Promise<import("../types").TtsJob> { throw new Error("Electron main process unavailable."); },
    async cancelTtsJob(): Promise<import("../types").TtsJob> { throw new Error("Electron main process unavailable."); },
    async runDevIdeaTest(_input: { topic: string; language?: string }): Promise<DevIdeaTestResult> { throw new Error("Dev Test Lab requires Electron."); },
    async runDevImageTest(_input: { prompt: string; aspectRatio: "16:9" | "9:16" }): Promise<DevImageTestResult> { throw new Error("Dev Test Lab requires Electron."); },
    async runDevStockTest(_input: { query: string; mediaType: "image" | "video" }): Promise<DevStockTestResult> { throw new Error("Dev Test Lab requires Electron."); },
    async addCompetitorReference(input): Promise<{ status: "saved"; project: FactoryProject; message: string }> {
      const project = projects.find((item) => item.id === input.projectId);
      if (!project) throw new Error("Project not found.");
      const nextProject = {
        ...project,
        competitorReferences: [
          ...project.competitorReferences,
          {
            id: `competitor-${Date.now()}`,
            ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
            pastedTranscript: input.pastedTranscript,
            ...(input.notes ? { notes: input.notes } : {}),
            status: "draft" as const,
            included: true,
            version: 1,
            createdAt: new Date().toISOString()
          }
        ],
        referenceSet: { status: "needs_validation" as const }
      };
      projects = projects.map((item) => item.id === nextProject.id ? nextProject : item);
      return { status: "saved", project: nextProject, message: "Competitor reference saved as Draft." };
    },
    async replaceCompetitorReference(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async editCompetitorReference(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async deleteCompetitorReference(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async setReferenceIncluded(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async getReferenceChangeImpact(): Promise<{ stageIds: string[]; stageNames: string[] }> {
      return { stageIds: [], stageNames: [] };
    },
    async validateReferenceSet(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async approveReferenceSet(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async rejectReferenceSet(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async revokeReferenceSetApproval(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async runTranscriptCleaning(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async listCompetitorWorkflowRuns() {
      return [];
    },
    async markStageAttention(input): Promise<FactoryProject> {
      const project = projects.find((item) => item.id === input.projectId);
      if (!project) throw new Error("Project not found.");
      const updated = {
        ...project,
        stages: project.stages.map((stage) => stage.id === input.stageId ? {
          ...stage,
          status: "needs_attention" as const,
          attention: { code: input.code, message: input.message, actions: [] }
        } : stage)
      };
      projects = projects.map((item) => item.id === updated.id ? updated : item);
      return updated;
    },
    async listTranscriptCleaningArtifacts() {
      return [];
    },
    async approveTranscriptCleaning(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async rejectTranscriptCleaning(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async runReferenceSegmentation(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async listReferenceSegmentationArtifacts() {
      return [];
    },
    async approveReferenceSegmentation(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async rejectReferenceSegmentation(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async runCompetitorDna(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async listCompetitorDnaArtifacts() {
      return [];
    },
    async approveCompetitorDna(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async rejectCompetitorDna(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async runOpportunityMap(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async listOpportunityMapArtifacts() {
      return [];
    },
    async approveOpportunityMap(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async rejectOpportunityMap(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async runIdeaLab(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async approveIdea(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async rejectIdeaLab(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async runOriginalityReview(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async listOriginalityReviewArtifacts() {
      return [];
    },
    async approveOriginalityReview(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async rejectOriginalityReview(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async saveResearchSources(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runResearchSourceSearch(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listResearchSourcesArtifacts() { return []; },
    async approveResearchSources(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectResearchSources(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runClaimMap(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listClaimMapArtifacts() { return []; },
    async approveClaimMap(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectClaimMap(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runOutline(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listOutlineArtifacts() { return []; },
    async approveOutline(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectOutline(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runScript(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listScriptArtifacts() { return []; },
    async approveScript(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectScript(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runFactReview(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listFactReviewArtifacts() { return []; },
    async approveFactReview(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectFactReview(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runRetentionReview(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listRetentionReviewArtifacts() { return []; },
    async approveRetentionReview(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectRetentionReview(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runScenePlan(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listScenePlanArtifacts() { return []; },
    async approveScenePlan(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectScenePlan(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runShotPlan(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listShotPlanArtifacts() { return []; },
    async approveShotPlan(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectShotPlan(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runVisualRouting(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listVisualRoutingArtifacts() { return []; },
    async editVisualRouting(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async approveVisualRouting(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectVisualRouting(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runPromptPreparation(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listPromptPreparationArtifacts() { return []; },
    async approvePromptPreparation(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectPromptPreparation(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runAssetAcquisition(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listAssetAcquisitionArtifacts() { return []; },
    async approveAssetAcquisition(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectAssetAcquisition(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runAssetReview(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listAssetReviewArtifacts() { return []; },
    async reviseAssetReview(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async selectManualAssetUpload(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async approveAssetReview(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectAssetReview(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runVoiceGeneration(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listVoiceGenerationArtifacts() { return []; },
    async approveVoiceGeneration(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectVoiceGeneration(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runSubtitlePreparation(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listSubtitlePreparationArtifacts() { return []; },
    async approveSubtitlePreparation(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectSubtitlePreparation(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runTimelineAssembly(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listTimelineAssemblyArtifacts() { return []; },
    async approveTimelineAssembly(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectTimelineAssembly(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runPreviewRender(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listPreviewRenderArtifacts() { return []; },
    async getPreviewVideoUrl(): Promise<{ url: string }> { throw new Error("Electron main process unavailable."); },
    async getAssetPreviewUrl(): Promise<{ url: string }> { throw new Error("Electron main process unavailable."); },
    async approvePreviewRender(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectPreviewRender(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runQa(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listQaArtifacts() { return []; },
    async approveQa(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectQa(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runCapCutDraft(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listCapCutDraftArtifacts() { return []; },
    async approveCapCutDraft(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectCapCutDraft(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runPackagingExport(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listPackagingExportArtifacts() { return []; },
    async approvePackagingExport(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectPackagingExport(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async mockImageBatch() {
      return emptyQueue;
    }
  };
}

function toSummary(project: FactoryProject): ProjectSummary {
  return {
    id: project.id,
    topic: project.topic,
    profileId: project.profileId,
    format: project.format,
    projectName: project.setup.projectName,
    targetLanguage: project.setup.language,
    targetDuration: project.setup.targetDuration,
    updatedAt: new Date().toISOString()
  };
}

export const factoryClient: LongShortFactoryApi = window.longShortFactory ?? webFallback();
