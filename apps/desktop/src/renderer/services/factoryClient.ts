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
  ProviderCredentialSettings,
  ProviderPresence
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
      return { providerId, baseUrl: "Electron main process unavailable", hasCredential: false };
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
    async addCompetitorReference(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
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
