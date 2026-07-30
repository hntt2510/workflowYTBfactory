import type { ChannelProfile, ChannelRouteDecision, CompetitorReference, FactoryProject, StageEligibility, WorkflowStageStatus } from "@lsf/domain";

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

export interface ProviderModelConfigurationInput {
  providerId?: "9router";
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

export interface AddCompetitorReferenceResult {
  status: "saved" | "duplicate";
  project: FactoryProject;
  existingReference?: CompetitorReference;
  message: string;
}

export interface ReferenceMutationInput {
  projectId: string;
  referenceId: string;
}

export interface RunTranscriptCleaningInput extends ReferenceMutationInput {}

export interface TranscriptCleaningArtifact {
  id: string;
  stageRunId?: string;
  status: "draft" | "needs_review" | "approved" | "rejected" | "stale";
  payloadJson: {
    referenceId: string;
    sourceTranscriptVersionId: string;
    cleanedTranscript: string;
    removedSegments: Array<{ text: string; reason: string }>;
    flaggedSegments: Array<{ text: string; reason: string }>;
    sourceCharacterCount: number;
    cleanedCharacterCount: number;
    warnings: Array<"excessive_content_loss" | "content_expansion">;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ReferenceSegmentationArtifact {
  id: string;
  stageRunId?: string;
  status: "draft" | "needs_review" | "approved" | "rejected" | "stale";
  payloadJson: {
    referenceId: string;
    segments: Array<{ id: string; order: number; startCharacter: number; endCharacter: number; type: string; text: string; function: string }>;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CompetitorDnaArtifact {
  id: string;
  stageRunId?: string;
  status: "draft" | "needs_review" | "approved" | "rejected" | "stale";
  payloadJson: { referenceId: string; hookPattern: { abstraction: string; evidenceSegmentIds: string[] }; promisePattern: { abstraction: string; evidenceSegmentIds: string[] }; reusablePrinciples: string[]; uncertainties: string[] };
  createdAt: string;
  updatedAt: string;
}
export interface OpportunityMapArtifact { id: string; stageRunId?: string; status: "draft" | "needs_review" | "approved" | "rejected" | "stale"; payloadJson: { recommendedContentSpaces: Array<{ text: string; confidence: "low" | "medium" | "high" }> }; createdAt: string; updatedAt: string; }
export interface OriginalityReviewArtifact { id: string; stageRunId?: string; status: "draft" | "needs_review" | "approved" | "rejected" | "stale"; payloadJson: { ideaId: string; reviewer: "local_deterministic"; phraseOverlapRisk: number; structuralOverlapRisk: number; thumbnailOverlapRisk: number; conceptOverlapRisk: number; flaggedMatches: string[]; requiredChanges: string[]; status: "pass" | "needs_changes" | "blocked"; competitorDnaArtifactIds: string[] }; createdAt: string; updatedAt: string; }
export interface ResearchSourcesArtifact { id: string; stageRunId?: string; status: "draft" | "needs_review" | "approved" | "rejected" | "stale"; payloadJson: { sources: Array<{ id: string; title: string; url: string; publisher: string; excerpt: string; sourceType: "primary" | "secondary"; publishedAt?: string; notes?: string; localSnapshotReference?: string }> }; createdAt: string; updatedAt: string; }
export interface ClaimMapArtifact { id: string; stageRunId?: string; status: "draft" | "needs_review" | "approved" | "rejected" | "stale"; payloadJson: { claims: Array<{ id: string; text: string; state: string; approvalState: "allowed" | "blocked"; sourceIds: string[] }> }; createdAt: string; updatedAt: string; }
export interface OutlineArtifact { id: string; stageRunId?: string; status: "draft" | "needs_review" | "approved" | "rejected" | "stale"; payloadJson: { sections: Array<{ id: string; purpose: string; keyPoint: string; linkedClaimIds: string[]; estimatedSeconds: number }> }; createdAt: string; updatedAt: string; }
export interface ScriptArtifact { id: string; stageRunId?: string; status: "draft" | "needs_review" | "approved" | "rejected" | "stale"; payloadJson: { sections: Array<{ id: string; outlineSectionId: string; purpose: string; narration: string; estimatedWords: number; estimatedSeconds: number; linkedClaimIds: string[]; dramaticFunction: string; visualOpportunities: string[]; proofObjects: string[]; retentionRisk: "low" | "medium" | "high" }> }; createdAt: string; updatedAt: string; }
export interface FactReviewArtifact { id: string; stageRunId?: string; status: "draft" | "needs_review" | "approved" | "rejected" | "stale"; payloadJson: { reviewer: "local_deterministic"; findings: Array<{ claimId: string; verdict: "supported" | "needs_qualification" | "blocked"; reason: string }> }; createdAt: string; updatedAt: string; }
export interface RetentionReviewArtifact { id: string; stageRunId?: string; status: "draft" | "needs_review" | "approved" | "rejected" | "stale"; payloadJson: { overallVerdict: "pass" | "needs_changes" | "blocked"; findings: Array<{ sectionId: string; severity: "low" | "medium" | "high"; reason: string; recommendedChange: string }> }; createdAt: string; updatedAt: string; }
export interface ScenePlanArtifact { id: string; stageRunId?: string; status: "draft" | "needs_review" | "approved" | "rejected" | "stale"; payloadJson: { fps: number; scenes: Array<{ id: string; scriptSectionId: string; narration: string; purpose: string; startFrame: number; durationFrames: number; visualMode: string; emotionalState: string; requiredAssets: string[]; continuityRefs: string[] }> }; createdAt: string; updatedAt: string; }
export interface ShotPlanArtifact { id: string; stageRunId?: string; status: "draft" | "needs_review" | "approved" | "rejected" | "stale"; payloadJson: { shots: Array<{ id: string; sceneId: string; order: number; startFrame: number; durationFrames: number; fps: number; purpose: string; visualMode: string; framing: string; cameraAngle: string; cameraMovement: string; subjectAction: string }> }; createdAt: string; updatedAt: string; }
export interface VisualRoutingArtifact { id: string; stageRunId?: string; status: "draft" | "needs_review" | "approved" | "rejected" | "stale"; payloadJson: { shots: Array<{ id: string; purpose: string; visualMode: string }> }; createdAt: string; updatedAt: string; }

export interface EditCompetitorReferenceInput extends ReferenceMutationInput {
  sourceUrl?: string;
  pastedTranscript: string;
  notes?: string;
}

export interface SetReferenceIncludedInput extends ReferenceMutationInput {
  included: boolean;
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

export type TextModelCertificationStatus = "not_tested" | "testing" | "verified" | "failed" | "stale";

export type TextCertificationErrorCategory =
  | "credential_missing"
  | "model_not_selected"
  | "invalid_base_url"
  | "unauthorized"
  | "endpoint_not_found"
  | "rate_limited"
  | "server_error"
  | "timeout"
  | "network_error"
  | "invalid_response_shape"
  | "exact_text_mismatch"
  | "invalid_json"
  | "json_schema_mismatch"
  | "unknown_error";

export interface TextCertificationTestResult {
  status: "passed" | "failed";
  latencyMs: number;
  errorCategory?: TextCertificationErrorCategory;
  skipped?: boolean;
  redactedPreview?: string;
}

export interface TextModelCertificationRecord {
  id: string;
  providerId: "9router";
  configuredModelId: string;
  returnedModelId?: string;
  baseUrlFingerprint: string;
  credentialVersionRef?: string;
  endpointStrategy: "responses";
  implementationVersion: "text-certification-v1";
  exactTextTest: TextCertificationTestResult;
  strictJsonTest: TextCertificationTestResult;
  overallStatus: "verified" | "failed" | "stale";
  testedAt: string;
}

export interface TextModelCertificationResponse {
  status: TextModelCertificationStatus;
  record?: TextModelCertificationRecord;
  message: string;
  errorCategory?: TextCertificationErrorCategory;
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
    competitorReference?: {
      sourceUrl?: string;
      pastedTranscript: string;
      notes?: string;
    };
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
  save9RouterModelConfiguration: (input: ProviderModelConfigurationInput) => Promise<ProviderCredentialSettings>;
  load9RouterTextCertification: () => Promise<TextModelCertificationResponse>;
  run9RouterTextCertification: (input: { providerId?: "9router"; confirmation: "Run 2 certification requests" }) => Promise<TextModelCertificationResponse>;
  loadLocalTtsSettings: () => Promise<LocalTtsSettings>;
  saveLocalTtsSettings: (input: Omit<LocalTtsSettings, "available" | "resolvedBinPath">) => Promise<LocalTtsSettings>;
  generateLocalTts: (input: GenerateLocalTtsInput) => Promise<LocalTtsGenerated>;
  addCompetitorReference: (input: AddCompetitorReferenceInput) => Promise<AddCompetitorReferenceResult>;
  replaceCompetitorReference: (input: ReferenceMutationInput & { pastedTranscript: string; notes?: string }) => Promise<FactoryProject>;
  editCompetitorReference: (input: EditCompetitorReferenceInput) => Promise<FactoryProject>;
  deleteCompetitorReference: (input: ReferenceMutationInput) => Promise<FactoryProject>;
  setReferenceIncluded: (input: SetReferenceIncludedInput) => Promise<FactoryProject>;
  validateReferenceSet: (input: { projectId: string }) => Promise<FactoryProject>;
  approveReferenceSet: (input: { projectId: string }) => Promise<FactoryProject>;
  runTranscriptCleaning: (input: RunTranscriptCleaningInput) => Promise<FactoryProject>;
  listTranscriptCleaningArtifacts: (input: RunTranscriptCleaningInput) => Promise<TranscriptCleaningArtifact[]>;
  approveTranscriptCleaning: (input: RunTranscriptCleaningInput) => Promise<FactoryProject>;
  runReferenceSegmentation: (input: RunTranscriptCleaningInput) => Promise<FactoryProject>;
  listReferenceSegmentationArtifacts: (input: RunTranscriptCleaningInput) => Promise<ReferenceSegmentationArtifact[]>;
  approveReferenceSegmentation: (input: RunTranscriptCleaningInput) => Promise<FactoryProject>;
  runCompetitorDna: (input: RunTranscriptCleaningInput) => Promise<FactoryProject>;
  listCompetitorDnaArtifacts: (input: RunTranscriptCleaningInput) => Promise<CompetitorDnaArtifact[]>;
  approveCompetitorDna: (input: RunTranscriptCleaningInput) => Promise<FactoryProject>;
  runOpportunityMap: (input: { projectId: string }) => Promise<FactoryProject>;
  listOpportunityMapArtifacts: (input: { projectId: string }) => Promise<OpportunityMapArtifact[]>;
  approveOpportunityMap: (input: { projectId: string }) => Promise<FactoryProject>;
  runIdeaLab: (input: { projectId: string }) => Promise<FactoryProject>;
  approveIdea: (input: { projectId: string; ideaId: string }) => Promise<FactoryProject>;
  runOriginalityReview: (input: { projectId: string }) => Promise<FactoryProject>;
  listOriginalityReviewArtifacts: (input: { projectId: string }) => Promise<OriginalityReviewArtifact[]>;
  approveOriginalityReview: (input: { projectId: string }) => Promise<FactoryProject>;
  saveResearchSources: (input: { projectId: string; sources: ResearchSourcesArtifact["payloadJson"]["sources"] }) => Promise<FactoryProject>;
  listResearchSourcesArtifacts: (input: { projectId: string }) => Promise<ResearchSourcesArtifact[]>;
  approveResearchSources: (input: { projectId: string }) => Promise<FactoryProject>;
  runClaimMap: (input: { projectId: string }) => Promise<FactoryProject>;
  listClaimMapArtifacts: (input: { projectId: string }) => Promise<ClaimMapArtifact[]>;
  approveClaimMap: (input: { projectId: string }) => Promise<FactoryProject>;
  runOutline: (input: { projectId: string }) => Promise<FactoryProject>;
  listOutlineArtifacts: (input: { projectId: string }) => Promise<OutlineArtifact[]>;
  approveOutline: (input: { projectId: string }) => Promise<FactoryProject>;
  runScript: (input: { projectId: string }) => Promise<FactoryProject>;
  listScriptArtifacts: (input: { projectId: string }) => Promise<ScriptArtifact[]>;
  approveScript: (input: { projectId: string }) => Promise<FactoryProject>;
  runFactReview: (input: { projectId: string }) => Promise<FactoryProject>;
  listFactReviewArtifacts: (input: { projectId: string }) => Promise<FactReviewArtifact[]>;
  approveFactReview: (input: { projectId: string }) => Promise<FactoryProject>;
  runRetentionReview: (input: { projectId: string }) => Promise<FactoryProject>;
  listRetentionReviewArtifacts: (input: { projectId: string }) => Promise<RetentionReviewArtifact[]>;
  approveRetentionReview: (input: { projectId: string }) => Promise<FactoryProject>;
  runScenePlan: (input: { projectId: string }) => Promise<FactoryProject>;
  listScenePlanArtifacts: (input: { projectId: string }) => Promise<ScenePlanArtifact[]>;
  approveScenePlan: (input: { projectId: string }) => Promise<FactoryProject>;
  runShotPlan: (input: { projectId: string }) => Promise<FactoryProject>;
  listShotPlanArtifacts: (input: { projectId: string }) => Promise<ShotPlanArtifact[]>;
  approveShotPlan: (input: { projectId: string }) => Promise<FactoryProject>;
  runVisualRouting: (input: { projectId: string }) => Promise<FactoryProject>;
  listVisualRoutingArtifacts: (input: { projectId: string }) => Promise<VisualRoutingArtifact[]>;
  approveVisualRouting: (input: { projectId: string }) => Promise<FactoryProject>;
  mockImageBatch: (projectId: string) => Promise<QueueSnapshot>;
}

export type { StageEligibility, WorkflowStageStatus };

declare global {
  interface Window {
    longShortFactory?: LongShortFactoryApi;
  }
}
