import type { ChannelProfile, ChannelRouteDecision, FactoryProject } from "@lsf/domain";

export interface ProjectSummary {
  id: string;
  topic: string;
  profileId: string;
  format: "long" | "short";
  projectName: string;
  targetLanguage: string;
  targetDuration: string;
  updatedAt: string;
}

export interface QueueJob {
  id: string;
  projectId: string;
  shotId: string;
  requestType: "image" | "video" | "tts" | "stt";
  provider: string;
  model: string;
  promptVersionId: string;
  priority: number;
  attemptCount: number;
  state: string;
  requestTimestamp?: string;
  outputAssetIds: string[];
  errorClassification?: string;
}

export interface QueueSnapshot {
  concurrency: number;
  running: number;
  jobs: QueueJob[];
}

export interface BootstrapData {
  profiles: ChannelProfile[];
  workspaceRoot: string;
  databasePath: string;
  projects: ProjectSummary[];
  queue: QueueSnapshot;
  runtime: RuntimeStatus;
}

export interface RuntimeStatus {
  sidecarPythonPath: string;
  pythonExists: boolean;
  pythonVersion: string;
  pycapcutStatus: string;
  capcutInstallPath: string;
  capcutInstalled: boolean;
  ffmpegPath: string;
  ffmpegAvailable: boolean;
  ffmpegStatus: string;
  capcutDraftDir: string;
  draftDirConfigured: boolean;
  capcutCompatibility: string;
}

export interface ProviderPresence {
  providerId: string;
  hasCredential: boolean;
}

export interface ProviderCredentialSettings {
  providerId: string;
  baseUrl: string;
  textModel?: string;
  imageModel?: string;
  videoModel?: string;
  ttsModel?: string;
  sttModel?: string;
  hasCredential: boolean;
}

export interface ProviderCredentialInput {
  providerId: string;
  baseUrl: string;
  apiKey: string;
  textModel?: string;
  imageModel?: string;
  videoModel?: string;
  ttsModel?: string;
  sttModel?: string;
}

export interface LocalTtsSettings {
  omnivoiceBinPath: string;
  outputDir: string;
  modelPath?: string;
  language?: string;
  instruct?: string;
  available: boolean;
  resolvedBinPath: string;
}

export interface GenerateLocalTtsInput {
  projectId: string;
  text: string;
  outputName?: string;
}

export interface AddCompetitorReferenceInput {
  projectId: string;
  sourceUrl?: string;
  pastedTranscript: string;
  notes?: string;
}

export interface LocalTtsGenerated {
  ok: boolean;
  outputPath: string;
  provider: "omnivoice-local";
}

export type ModelListStatus =
  | "not_tested"
  | "testing"
  | "models_discovered"
  | "empty_model_list"
  | "unauthorized"
  | "endpoint_not_found"
  | "rate_limited"
  | "server_error"
  | "timeout"
  | "network_error";

export interface NineRouterModelListResult {
  status: ModelListStatus;
  models: Array<{ id: string }>;
  message: string;
}

export interface LongShortFactoryApi {
  bootstrap: () => Promise<BootstrapData>;
  routeTopic: (input: {
    topic: string;
    description?: string;
    format: "long" | "short";
    targetLanguage: string;
    selectedProfileId?: string;
  }) => Promise<ChannelRouteDecision>;
  fixtureProject: (input: {
    topic: string;
    format: "long" | "short";
    targetLanguage: string;
    targetDuration?: string;
    projectName?: string;
    workflowMode?: "guided" | "semi_automatic" | "full_automatic";
  }) => Promise<FactoryProject>;
  listProjects: () => Promise<ProjectSummary[]>;
  loadProject: (projectId: string) => Promise<FactoryProject | null>;
  deleteProject: (projectId: string) => Promise<{ ok: boolean }>;
  saveProviderCredential: (input: ProviderCredentialInput) => Promise<{ providerId: string; credentialRef: string }>;
  loadProviderCredentialSettings: (providerId: string) => Promise<ProviderCredentialSettings>;
  hasProviderCredential: (providerId: string) => Promise<ProviderPresence>;
  testCredentialPresence: (providerId: string) => Promise<ProviderPresence>;
  deleteProviderCredential: (providerId: string) => Promise<{ providerId: string; deleted: boolean }>;
  list9RouterModels: () => Promise<NineRouterModelListResult>;
  loadLocalTtsSettings: () => Promise<LocalTtsSettings>;
  saveLocalTtsSettings: (input: Omit<LocalTtsSettings, "available" | "resolvedBinPath">) => Promise<LocalTtsSettings>;
  generateLocalTts: (input: GenerateLocalTtsInput) => Promise<LocalTtsGenerated>;
  addCompetitorReference: (input: AddCompetitorReferenceInput) => Promise<FactoryProject>;
  mockImageBatch: (projectId: string) => Promise<QueueSnapshot>;
}

declare global {
  interface Window {
    longShortFactory?: LongShortFactoryApi;
  }
}
