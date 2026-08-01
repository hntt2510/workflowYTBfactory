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
  devTestLabEnabled: boolean;
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
  voiceMode?: "voice-design" | "integrated-voices" | "voice-clone";
  ttsProvider?: "omnivoice-local" | "nine-router-tts" | "edge-tts" | "gtts" | "kokoro-vietnamese" | "capcut-experimental";
  ttsVoiceProvider?: "edge-tts" | "google-tts";
  ttsVoiceId?: string;
  ttsPythonPath?: string;
  ttsRate?: number;
  ttsFallbackEnabled?: boolean;
  ttsFallbackOrder?: Array<"edge-tts" | "kokoro-vietnamese" | "gtts" | "nine-router-tts" | "capcut-experimental">;
  modelPath?: string;
  language?: string;
  instruct?: string;
  referenceAudioPath?: string;
  referenceTranscript?: string;
  voiceGender?: "male" | "female";
  voiceAge?: "child" | "teenager" | "young adult" | "middle-aged" | "elderly";
  voicePitch?: "very low pitch" | "low pitch" | "moderate pitch" | "high pitch" | "very high pitch";
  voiceStyle?: "whisper";
  voiceEnglishAccent?: "american accent" | "british accent" | "australian accent" | "canadian accent" | "indian accent" | "chinese accent" | "korean accent" | "japanese accent" | "portuguese accent" | "russian accent";
  voiceChineseDialect?: "河南话" | "陕西话" | "四川话" | "贵州话" | "云南话" | "桂林话" | "济南话" | "石家庄话" | "甘肃话" | "宁夏话" | "青岛话" | "东北话";
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
  duplicate?: true;
  project: FactoryProject;
  existingReference?: CompetitorReference;
  existingReferenceId?: string;
  existingCurrentVersionId?: string;
  canonicalSourceId?: string;
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
export interface VisualRoutingArtifact { id: string; stageRunId?: string; status: "draft" | "needs_review" | "approved" | "rejected" | "stale"; payloadJson: ShotPlanArtifact["payloadJson"]; createdAt: string; updatedAt: string; }
export interface PromptPreparationArtifact { id: string; stageRunId?: string; status: "draft" | "needs_review" | "approved" | "rejected" | "stale"; payloadJson: { prompts: Array<{ shotId: string; promptVersionId: string; positivePrompt: string; negativePrompt: string; aspectRatio: "16:9" | "9:16"; continuityConstraints: string[]; prohibitedElements: string[] }> }; createdAt: string; updatedAt: string; }
export interface AssetAcquisitionArtifact { id: string; stageRunId?: string; status: "draft" | "needs_review" | "approved" | "rejected" | "stale"; payloadJson: { assets: Array<{ shotId: string; promptVersionId: string; relativeFilePath: string; sha256: string; mimeType: "image/png" | "image/jpeg" | "image/webp"; byteLength: number; width: number; height: number }> }; createdAt: string; updatedAt: string; }
export interface AssetReviewArtifact { id: string; stageRunId?: string; status: "draft" | "needs_review" | "approved" | "rejected" | "stale"; payloadJson: { acquisitionArtifactId: string; assets: Array<{ asset: AssetAcquisitionArtifact["payloadJson"]["assets"][number]; reviewStatus: "needs_review" | "approved" | "rejected"; assignedShotId?: string }> }; createdAt: string; updatedAt: string; }
export interface VoiceGenerationArtifact { id: string; stageRunId?: string; status: "draft" | "needs_review" | "approved" | "rejected" | "stale"; payloadJson: { ttsJobId?: string; requestedProvider?: TtsJobProviderId; mergedRelativeFilePath?: string; timingWarnings?: string[]; segments: Array<{ scriptSectionId: string; relativeFilePath: string; durationSeconds: number; codec: string; byteLength: number; sha256: string; startSeconds?: number; requestedProvider?: TtsJobProviderId; actualProvider?: TtsJobProviderId; voiceId?: string; attemptCount?: number; fallbackUsed?: boolean; fallbackReason?: string; timingOverflowSeconds?: number }> }; createdAt: string; updatedAt: string; }
export interface SubtitlePreparationArtifact { id: string; stageRunId?: string; status: "draft" | "needs_review" | "approved" | "rejected" | "stale"; payloadJson: { fps: number; cues: Array<{ id: string; scriptSectionId: string; startFrame: number; durationFrames: number; text: string }> }; createdAt: string; updatedAt: string; }
export interface TimelineAssemblyArtifact { id: string; stageRunId?: string; status: "draft" | "needs_review" | "approved" | "rejected" | "stale"; payloadJson: FactoryProject["timeline"]; createdAt: string; updatedAt: string; }
export interface PreviewRenderArtifact { id: string; stageRunId?: string; status: "draft" | "needs_review" | "approved" | "rejected" | "stale"; relativeFilePath: string; payloadJson: { relativeFilePath: string; durationSeconds: number; width: number; height: number; sha256?: string; inputArtifactIds: string[] }; createdAt: string; updatedAt: string; }
export interface QaArtifact { id: string; stageRunId?: string; status: "draft" | "needs_review" | "approved" | "rejected" | "stale"; payloadJson: { runner: "local_deterministic"; findings: Array<{ code: string; severity: "blocking" | "warning"; message: string; evidence: string }>; inputArtifactIds: string[] }; createdAt: string; updatedAt: string; }
export interface CapCutDraftArtifact { id: string; stageRunId?: string; status: "draft" | "needs_review" | "approved" | "rejected" | "stale"; payloadJson: { draftName: string; structurallyValidated: true; trackCounts: { video: number; audio: number; text: number }; inputArtifactIds: string[] }; createdAt: string; updatedAt: string; }
export interface PackagingExportArtifact { id: string; stageRunId?: string; status: "draft" | "needs_review" | "approved" | "rejected" | "stale"; relativeFilePath: string; payloadJson: { relativeFilePath: string; artifactIds: string[]; sha256: string }; createdAt: string; updatedAt: string; }

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
  provider: "omnivoice-local" | "nine-router-tts" | "edge-tts" | "gtts" | "kokoro-vietnamese";
}

export interface DevCapcutTestResult {
  draftDirectory: string;
  contentPath: string;
  fixtureDirectory: string;
  trackCounts: { video: number; audio: number; text: number };
}

export interface DevIdeaTestResult { model: string; responseText: string; relativeFilePath: string; }
export interface DevImageTestResult { relativeFilePath: string; sha256: string; mimeType: "image/png" | "image/jpeg" | "image/webp"; byteLength: number; width: number; height: number; }
export interface DevStockTestResult { mediaType: "image" | "video"; results: Array<{ id: string; url: string; previewUrl: string; creator?: string }>; }

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
export interface NineRouterTtsCatalogResult { models: Array<{ id: string }>; voices: Array<{ id: string; label: string }>; message: string; }
export type TtsProviderId = "edge-tts" | "kokoro-vietnamese" | "gtts" | "nine-router-tts" | "capcut-experimental";
export type TtsJobProviderId = TtsProviderId | "omnivoice-local";
export interface TtsVoiceDescriptor { key: string; provider: TtsProviderId; providerVoiceId: string; label: string; language: string; gender: "female" | "male" | "neutral" | "unknown"; description?: string; providerType: "local" | "cloud"; enabled: boolean; experimental: boolean; }
export interface TtsProviderStatus { id: TtsProviderId; displayName: string; providerType: "local" | "cloud"; health: "ready" | "degraded" | "unavailable" | "not_tested"; message: string; experimental: boolean; enabled: boolean; voiceCount: number; }
export interface TtsProviderCatalog { providers: TtsProviderStatus[]; voices: TtsVoiceDescriptor[]; }
export interface TtsPreviewResult { previewUrl: string; relativeFilePath: string; requestedProvider: TtsProviderId; actualProvider: TtsProviderId; voiceId: string; durationSeconds: number; codec: string; cached: boolean; fallbackUsed: boolean; message: string; }
export interface TtsJob { id: string; projectId?: string; state: "queued" | "running" | "success" | "partial" | "failed" | "cancelled"; provider: TtsJobProviderId; voiceId: string; language: string; mergedRelativeFilePath?: string; errorMessage?: string; segments: Array<{ segmentId: string; state: "queued" | "running" | "success" | "failed" | "cancelled"; requestedProvider: TtsJobProviderId; actualProvider?: TtsJobProviderId; voiceId: string; startSeconds: number; availableDurationSeconds?: number; originalDurationSeconds?: number; finalDurationSeconds?: number; appliedSpeed?: number; timingOverflowSeconds: number; relativeFilePath?: string; attemptCount: number; fallbackUsed: boolean; fallbackReason?: string; errorCode?: string; errorMessage?: string; }>; createdAt: string; updatedAt: string; }

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
export interface ImageModelCertificationResponse { status: "not_tested" | "verified" | "failed" | "stale"; record?: { id: string; configuredModelId: string; testedAt: string }; message: string; errorCategory?: string; }

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
  load9RouterImageCertification: () => Promise<ImageModelCertificationResponse>;
  run9RouterImageCertification: (input: { providerId?: "9router"; confirmation: "Run 1 image certification request" }) => Promise<ImageModelCertificationResponse>;
  loadLocalTtsSettings: () => Promise<LocalTtsSettings>;
  saveLocalTtsSettings: (input: Omit<LocalTtsSettings, "available" | "resolvedBinPath">) => Promise<LocalTtsSettings>;
  selectLocalTtsReferenceAudio: () => Promise<{ referenceAudioPath?: string }>;
  generateLocalTts: (input: GenerateLocalTtsInput) => Promise<LocalTtsGenerated>;
  listNineRouterTtsCatalog: (input: { provider: "edge-tts" | "google-tts"; language: string }) => Promise<NineRouterTtsCatalogResult>;
  listTtsProviders: (input?: { language?: string; refresh?: boolean }) => Promise<TtsProviderCatalog>;
  previewTtsProvider: (input: { provider: TtsProviderId; voiceId: string; language: string; text: string; rate?: number }) => Promise<TtsPreviewResult>;
  createTtsJob: (input: { projectId?: string; provider: TtsProviderId; voiceId: string; language: string; rate?: number; fallbackEnabled?: boolean; fallbackOrder?: TtsProviderId[]; segments: Array<{ id: string; text: string; startSeconds: number; endSeconds?: number; rate?: number }> }) => Promise<TtsJob>;
  getTtsJob: (input: { jobId: string }) => Promise<TtsJob>;
  getProjectTtsJob: (input: { projectId: string }) => Promise<TtsJob | null>;
  retryTtsJobSegment: (input: { jobId: string; segmentId: string }) => Promise<TtsJob>;
  cancelTtsJob: (input: { jobId: string }) => Promise<TtsJob>;
  runDevIdeaTest: (input: { topic: string; language?: string }) => Promise<DevIdeaTestResult>;
  runDevImageTest: (input: { prompt: string; aspectRatio: "16:9" | "9:16" }) => Promise<DevImageTestResult>;
  runDevStockTest: (input: { query: string; mediaType: "image" | "video" }) => Promise<DevStockTestResult>;
  addCompetitorReference: (input: AddCompetitorReferenceInput) => Promise<AddCompetitorReferenceResult>;
  replaceCompetitorReference: (input: ReferenceMutationInput & { pastedTranscript: string; notes?: string }) => Promise<FactoryProject>;
  editCompetitorReference: (input: EditCompetitorReferenceInput) => Promise<FactoryProject>;
  deleteCompetitorReference: (input: ReferenceMutationInput) => Promise<FactoryProject>;
  setReferenceIncluded: (input: SetReferenceIncludedInput) => Promise<FactoryProject>;
  getReferenceChangeImpact: () => Promise<{ stageIds: string[]; stageNames: string[] }>;
  validateReferenceSet: (input: { projectId: string }) => Promise<FactoryProject>;
  approveReferenceSet: (input: { projectId: string }) => Promise<FactoryProject>;
  rejectReferenceSet: (input: { projectId: string }) => Promise<FactoryProject>;
  revokeReferenceSetApproval: (input: { projectId: string }) => Promise<FactoryProject>;
  runTranscriptCleaning: (input: RunTranscriptCleaningInput) => Promise<FactoryProject>;
  listTranscriptCleaningArtifacts: (input: RunTranscriptCleaningInput) => Promise<TranscriptCleaningArtifact[]>;
  approveTranscriptCleaning: (input: RunTranscriptCleaningInput) => Promise<FactoryProject>;
  rejectTranscriptCleaning: (input: RunTranscriptCleaningInput) => Promise<FactoryProject>;
  runReferenceSegmentation: (input: RunTranscriptCleaningInput) => Promise<FactoryProject>;
  listReferenceSegmentationArtifacts: (input: RunTranscriptCleaningInput) => Promise<ReferenceSegmentationArtifact[]>;
  approveReferenceSegmentation: (input: RunTranscriptCleaningInput) => Promise<FactoryProject>;
  rejectReferenceSegmentation: (input: RunTranscriptCleaningInput) => Promise<FactoryProject>;
  runCompetitorDna: (input: RunTranscriptCleaningInput) => Promise<FactoryProject>;
  listCompetitorDnaArtifacts: (input: RunTranscriptCleaningInput) => Promise<CompetitorDnaArtifact[]>;
  approveCompetitorDna: (input: RunTranscriptCleaningInput) => Promise<FactoryProject>;
  rejectCompetitorDna: (input: RunTranscriptCleaningInput) => Promise<FactoryProject>;
  runOpportunityMap: (input: { projectId: string }) => Promise<FactoryProject>;
  listOpportunityMapArtifacts: (input: { projectId: string }) => Promise<OpportunityMapArtifact[]>;
  approveOpportunityMap: (input: { projectId: string }) => Promise<FactoryProject>;
  rejectOpportunityMap: (input: { projectId: string }) => Promise<FactoryProject>;
  runIdeaLab: (input: { projectId: string }) => Promise<FactoryProject>;
  approveIdea: (input: { projectId: string; ideaId: string }) => Promise<FactoryProject>;
  rejectIdeaLab: (input: { projectId: string }) => Promise<FactoryProject>;
  runOriginalityReview: (input: { projectId: string }) => Promise<FactoryProject>;
  listOriginalityReviewArtifacts: (input: { projectId: string }) => Promise<OriginalityReviewArtifact[]>;
  approveOriginalityReview: (input: { projectId: string }) => Promise<FactoryProject>;
  rejectOriginalityReview: (input: { projectId: string }) => Promise<FactoryProject>;
  saveResearchSources: (input: { projectId: string; sources: ResearchSourcesArtifact["payloadJson"]["sources"] }) => Promise<FactoryProject>;
  listResearchSourcesArtifacts: (input: { projectId: string }) => Promise<ResearchSourcesArtifact[]>;
  approveResearchSources: (input: { projectId: string }) => Promise<FactoryProject>;
  rejectResearchSources: (input: { projectId: string }) => Promise<FactoryProject>;
  runClaimMap: (input: { projectId: string }) => Promise<FactoryProject>;
  listClaimMapArtifacts: (input: { projectId: string }) => Promise<ClaimMapArtifact[]>;
  approveClaimMap: (input: { projectId: string }) => Promise<FactoryProject>;
  rejectClaimMap: (input: { projectId: string }) => Promise<FactoryProject>;
  runOutline: (input: { projectId: string }) => Promise<FactoryProject>;
  listOutlineArtifacts: (input: { projectId: string }) => Promise<OutlineArtifact[]>;
  approveOutline: (input: { projectId: string }) => Promise<FactoryProject>;
  rejectOutline: (input: { projectId: string }) => Promise<FactoryProject>;
  runScript: (input: { projectId: string }) => Promise<FactoryProject>;
  listScriptArtifacts: (input: { projectId: string }) => Promise<ScriptArtifact[]>;
  approveScript: (input: { projectId: string }) => Promise<FactoryProject>;
  rejectScript: (input: { projectId: string }) => Promise<FactoryProject>;
  runFactReview: (input: { projectId: string }) => Promise<FactoryProject>;
  listFactReviewArtifacts: (input: { projectId: string }) => Promise<FactReviewArtifact[]>;
  approveFactReview: (input: { projectId: string }) => Promise<FactoryProject>;
  rejectFactReview: (input: { projectId: string }) => Promise<FactoryProject>;
  runRetentionReview: (input: { projectId: string }) => Promise<FactoryProject>;
  listRetentionReviewArtifacts: (input: { projectId: string }) => Promise<RetentionReviewArtifact[]>;
  approveRetentionReview: (input: { projectId: string }) => Promise<FactoryProject>;
  rejectRetentionReview: (input: { projectId: string }) => Promise<FactoryProject>;
  runScenePlan: (input: { projectId: string }) => Promise<FactoryProject>;
  listScenePlanArtifacts: (input: { projectId: string }) => Promise<ScenePlanArtifact[]>;
  approveScenePlan: (input: { projectId: string }) => Promise<FactoryProject>;
  rejectScenePlan: (input: { projectId: string }) => Promise<FactoryProject>;
  runShotPlan: (input: { projectId: string }) => Promise<FactoryProject>;
  listShotPlanArtifacts: (input: { projectId: string }) => Promise<ShotPlanArtifact[]>;
  approveShotPlan: (input: { projectId: string }) => Promise<FactoryProject>;
  rejectShotPlan: (input: { projectId: string }) => Promise<FactoryProject>;
  runVisualRouting: (input: { projectId: string }) => Promise<FactoryProject>;
  listVisualRoutingArtifacts: (input: { projectId: string }) => Promise<VisualRoutingArtifact[]>;
  editVisualRouting: (input: { projectId: string; artifactId: string; shotId: string; visualMode: FactoryProject["shots"][number]["visualMode"] }) => Promise<FactoryProject>;
  approveVisualRouting: (input: { projectId: string }) => Promise<FactoryProject>;
  rejectVisualRouting: (input: { projectId: string }) => Promise<FactoryProject>;
  runPromptPreparation: (input: { projectId: string }) => Promise<FactoryProject>;
  listPromptPreparationArtifacts: (input: { projectId: string }) => Promise<PromptPreparationArtifact[]>;
  approvePromptPreparation: (input: { projectId: string }) => Promise<FactoryProject>;
  rejectPromptPreparation: (input: { projectId: string }) => Promise<FactoryProject>;
  runAssetAcquisition: (input: { projectId: string }) => Promise<FactoryProject>;
  listAssetAcquisitionArtifacts: (input: { projectId: string }) => Promise<AssetAcquisitionArtifact[]>;
  approveAssetAcquisition: (input: { projectId: string }) => Promise<FactoryProject>;
  rejectAssetAcquisition: (input: { projectId: string }) => Promise<FactoryProject>;
  runAssetReview: (input: { projectId: string }) => Promise<FactoryProject>;
  listAssetReviewArtifacts: (input: { projectId: string }) => Promise<AssetReviewArtifact[]>;
  reviseAssetReview: (input: { projectId: string; artifactId: string; assetSha256: string; action: "approve" | "reject" | "assign" | "unassign"; shotId?: string }) => Promise<FactoryProject>;
  selectManualAssetUpload: (input: { projectId: string; artifactId: string; shotId: string }) => Promise<FactoryProject>;
  approveAssetReview: (input: { projectId: string }) => Promise<FactoryProject>;
  rejectAssetReview: (input: { projectId: string }) => Promise<FactoryProject>;
  runVoiceGeneration: (input: { projectId: string }) => Promise<FactoryProject>;
  listVoiceGenerationArtifacts: (input: { projectId: string }) => Promise<VoiceGenerationArtifact[]>;
  approveVoiceGeneration: (input: { projectId: string }) => Promise<FactoryProject>;
  rejectVoiceGeneration: (input: { projectId: string }) => Promise<FactoryProject>;
  runSubtitlePreparation: (input: { projectId: string }) => Promise<FactoryProject>;
  listSubtitlePreparationArtifacts: (input: { projectId: string }) => Promise<SubtitlePreparationArtifact[]>;
  approveSubtitlePreparation: (input: { projectId: string }) => Promise<FactoryProject>;
  rejectSubtitlePreparation: (input: { projectId: string }) => Promise<FactoryProject>;
  runTimelineAssembly: (input: { projectId: string }) => Promise<FactoryProject>;
  listTimelineAssemblyArtifacts: (input: { projectId: string }) => Promise<TimelineAssemblyArtifact[]>;
  approveTimelineAssembly: (input: { projectId: string }) => Promise<FactoryProject>;
  rejectTimelineAssembly: (input: { projectId: string }) => Promise<FactoryProject>;
  runPreviewRender: (input: { projectId: string }) => Promise<FactoryProject>;
  listPreviewRenderArtifacts: (input: { projectId: string }) => Promise<PreviewRenderArtifact[]>;
  approvePreviewRender: (input: { projectId: string }) => Promise<FactoryProject>;
  rejectPreviewRender: (input: { projectId: string }) => Promise<FactoryProject>;
  runQa: (input: { projectId: string }) => Promise<FactoryProject>;
  listQaArtifacts: (input: { projectId: string }) => Promise<QaArtifact[]>;
  approveQa: (input: { projectId: string }) => Promise<FactoryProject>;
  rejectQa: (input: { projectId: string }) => Promise<FactoryProject>;
  runCapCutDraft: (input: { projectId: string }) => Promise<FactoryProject>;
  listCapCutDraftArtifacts: (input: { projectId: string }) => Promise<CapCutDraftArtifact[]>;
  approveCapCutDraft: (input: { projectId: string; confirmation: "I opened the draft in CapCut and verified editable tracks" }) => Promise<FactoryProject>;
  rejectCapCutDraft: (input: { projectId: string }) => Promise<FactoryProject>;
  runPackagingExport: (input: { projectId: string }) => Promise<FactoryProject>;
  listPackagingExportArtifacts: (input: { projectId: string }) => Promise<PackagingExportArtifact[]>;
  approvePackagingExport: (input: { projectId: string }) => Promise<FactoryProject>;
  rejectPackagingExport: (input: { projectId: string }) => Promise<FactoryProject>;
  mockImageBatch: (projectId: string) => Promise<QueueSnapshot>;
}

export type { StageEligibility, WorkflowStageStatus };

declare global {
  interface Window {
    longShortFactory?: LongShortFactoryApi;
  }
}
