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
  LongShortFactoryApi,
  LocalTtsGenerated,
  LocalTtsSettings,
  ProjectSummary,
  ProviderCredentialInput,
  ProviderModelConfigurationInput,
  ProviderCredentialSettings,
  ProviderPresence,
  TextModelCertificationResponse
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
        providerId: providerSettings.providerId,
        baseUrl: providerSettings.baseUrl,
        hasCredential: providerSettings.hasCredential,
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
    async loadLocalTtsSettings(): Promise<LocalTtsSettings> {
      return {
        omnivoiceBinPath: "",
        outputDir: "Electron main process unavailable",
        modelPath: "",
        language: "",
        instruct: "",
        available: false,
        resolvedBinPath: ""
      };
    },
    async saveLocalTtsSettings(input: Omit<LocalTtsSettings, "available" | "resolvedBinPath">): Promise<LocalTtsSettings> {
      return { ...input, available: false, resolvedBinPath: input.omnivoiceBinPath };
    },
    async generateLocalTts(_input: GenerateLocalTtsInput): Promise<LocalTtsGenerated> {
      throw new Error("Electron main process unavailable.");
    },
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
    async validateReferenceSet(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async approveReferenceSet(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async runTranscriptCleaning(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async listTranscriptCleaningArtifacts() {
      return [];
    },
    async approveTranscriptCleaning(): Promise<FactoryProject> {
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
    async runCompetitorDna(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async listCompetitorDnaArtifacts() {
      return [];
    },
    async approveCompetitorDna(): Promise<FactoryProject> {
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
    async runIdeaLab(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async approveIdea(): Promise<FactoryProject> {
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
    async saveResearchSources(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listResearchSourcesArtifacts() { return []; },
    async approveResearchSources(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runClaimMap(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listClaimMapArtifacts() { return []; },
    async approveClaimMap(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runOutline(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listOutlineArtifacts() { return []; },
    async approveOutline(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runScript(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listScriptArtifacts() { return []; },
    async approveScript(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runFactReview(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listFactReviewArtifacts() { return []; },
    async approveFactReview(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runRetentionReview(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listRetentionReviewArtifacts() { return []; },
    async approveRetentionReview(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runScenePlan(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listScenePlanArtifacts() { return []; },
    async approveScenePlan(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runShotPlan(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listShotPlanArtifacts() { return []; },
    async approveShotPlan(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runVisualRouting(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listVisualRoutingArtifacts() { return []; },
    async approveVisualRouting(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
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
