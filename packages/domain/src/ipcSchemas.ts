import { z } from "zod";

const idSchema = z.string().min(1).max(160).regex(/^[A-Za-z0-9._:-]+$/);
const modelIdSchema = z.string().min(1).max(300);
const frameSchema = z.number().int().nonnegative();
const safePathSchema = z.string().min(1).refine((value) => !value.includes("..") && !/[<>|?*\u0000-\u001F]/.test(value) && !/^(?:[A-Za-z]:[\\/]|[\\/]|[A-Za-z][A-Za-z0-9+.-]*:)/.test(value), {
  message: "Path contains unsafe characters or traversal."
});
const localPathSchema = z.string().max(1000).refine((value) => !/[\u0000-\u001F]/.test(value), {
  message: "Path contains control characters."
});
const localTtsProviderSchema = z.enum(["omnivoice-local", "nine-router-tts", "edge-tts", "gtts", "kokoro-vietnamese", "capcut-experimental"]);
const localTtsVoiceModeSchema = z.enum(["voice-design", "integrated-voices", "voice-clone"]);
const nineRouterTtsVoiceProviderSchema = z.enum(["edge-tts", "google-tts"]);
const ttsProviderSchema = z.enum(["edge-tts", "kokoro-vietnamese", "gtts", "nine-router-tts", "capcut-experimental"]);
const ttsJobProviderSchema = z.union([ttsProviderSchema, z.literal("omnivoice-local")]);
const ttsRateSchema = z.number().min(0.5).max(1.8);
const characterReferenceViewSchema = z.enum(["hero", "half_body", "full_body", "teaching_gesture", "three_quarter", "profile"]);
const characterVersionStatusSchema = z.enum(["draft", "needs_review", "approved", "archived"]);
const characterCompositionBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1)
}).strict().refine((box) => box.x + box.width <= 1 && box.y + box.height <= 1, {
  message: "Composition boxes must stay within the normalized canvas."
});
const characterCompositionSchema = z.object({
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]),
  subjectAnchor: z.enum(["left", "center", "right"]),
  subjectBox: characterCompositionBoxSchema,
  cameraDistance: z.string().min(1).max(300),
  headroom: z.string().min(1).max(300),
  safeZone: characterCompositionBoxSchema
}).strict();
const characterReferenceSchema = z.object({
  id: idSchema,
  view: characterReferenceViewSchema,
  status: z.enum(["needs_review", "approved", "rejected"]),
  promptText: z.string().min(1).max(20000).optional(),
  relativeFilePath: safePathSchema.optional(),
  sha256: z.string().length(64).optional(),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional()
}).strict();
export const characterVersionSchema = z.object({
  id: idSchema,
  version: z.number().int().positive(),
  status: characterVersionStatusSchema,
  name: z.string().min(1).max(200),
  persona: z.object({
    role: z.string().min(1).max(500),
    ageRange: z.string().min(1).max(200),
    appearance: z.string().min(1).max(2000),
    wardrobe: z.string().min(1).max(1000),
    palette: z.string().min(1).max(500),
    props: z.array(z.string().min(1).max(300)).max(20),
    gestures: z.array(z.string().min(1).max(300)).max(20),
    tone: z.string().min(1).max(500)
  }).strict(),
  invariantTraits: z.array(z.string().min(1).max(1000)).max(50),
  prohibitedChanges: z.array(z.string().min(1).max(1000)).max(50),
  composition: characterCompositionSchema.optional(),
  references: z.array(characterReferenceSchema).min(4).max(6),
  createdAt: z.string(),
  updatedAt: z.string()
}).strict();
export const channelProfileResponseSchema = z.object({ id: idSchema, name: z.string().min(1) }).passthrough();
export const channelProfilesResponseSchema = z.array(channelProfileResponseSchema);
export const characterPackRequestSchema = z.object({
  profileId: idSchema,
  name: z.string().trim().min(1).max(200),
  persona: characterVersionSchema.shape.persona,
  invariantTraits: z.array(z.string().trim().min(1).max(1000)).max(50),
  prohibitedChanges: z.array(z.string().trim().min(1).max(1000)).max(50),
  viewCount: z.number().int().min(4).max(6).default(5)
}).strict();
export const characterVersionRequestSchema = z.object({ profileId: idSchema, versionId: idSchema }).strict();
export const characterReferenceRetryRequestSchema = characterVersionRequestSchema.extend({ view: characterReferenceViewSchema }).strict();
export const characterPreviewRequestSchema = characterVersionRequestSchema.extend({ view: characterReferenceViewSchema }).strict();
export const characterReferenceUploadRequestSchema = characterVersionRequestSchema.extend({ view: characterReferenceViewSchema }).strict();
const motionEffectSchema = z.enum(["none", "slide_up", "slide_down", "pan_left", "pan_right", "zoom_in", "zoom_out", "pop", "dissolve"]);
const motionPlanSchema = z.object({ effect: motionEffectSchema, intensity: z.enum(["subtle", "standard", "strong"]), rationale: z.string().min(1).max(1000), userOverride: z.boolean().optional() }).strict();

export const workflowStageStatusSchema = z.enum([
  "not_started",
  "blocked",
  "ready",
  "queued",
  "running",
  "needs_review",
  "needs_attention",
  "approved",
  "rejected",
  "failed",
  "stale"
]);

const workflowArtifactStatusSchema = z.enum(["draft", "needs_review", "needs_attention", "approved", "rejected", "stale"]);

export const referenceStatusSchema = z.enum(["draft", "duplicate", "invalid", "valid", "approved", "rejected", "stale"]);

export const channelRouteInputSchema = z.object({
  topic: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  format: z.enum(["long", "short"]),
  targetLanguage: z.string().min(1).max(80),
  selectedProfileId: idSchema.optional()
});

export const createProjectRequestSchema = z.object({
  topic: z.string().min(1).max(500),
  synthetic: z.boolean().optional(),
  format: z.enum(["long", "short"]).default("long"),
  targetLanguage: z.string().min(1).max(80).default("English"),
  selectedProfileId: idSchema.optional(),
  targetDuration: z.string().min(1).max(120).optional(),
  projectName: z.string().min(1).max(120).optional(),
  workflowMode: z.enum(["guided", "semi_automatic", "full_automatic"]).default("semi_automatic"),
  visualWorkflow: z.enum(["legacy", "character_first"]).optional(),
  characterVersionId: idSchema.optional(),
  inputMode: z.enum(["topic", "existing_script", "reference"]).default("topic"),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional(),
  visualStyle: z.literal("vox-documentary").default("vox-documentary"),
  voiceId: z.string().max(300).optional(),
  outputResolution: z.enum(["1080p", "720p"]).default("1080p"),
  sourceScript: z.string().max(200000).optional(),
  referenceUrl: z.string().max(1000).optional(),
  competitorReference: z.object({
    sourceUrl: z.string().max(1000).optional(),
    pastedTranscript: z.string().min(1).max(200000),
    notes: z.string().max(5000).optional()
  }).optional()
});

export const projectIdRequestSchema = z.object({
  projectId: idSchema
});

export const productionPreparationRequestSchema = projectIdRequestSchema;
export const productionIdeaSelectionRequestSchema = z.object({ projectId: idSchema, ideaId: idSchema }).strict();
export const productionSceneRetryRequestSchema = z.object({ projectId: idSchema, sceneId: idSchema }).strict();

export const saveProviderCredentialRequestSchema = z.object({
  providerId: idSchema,
  baseUrl: z.string().url().or(z.string().regex(/^http:\/\/127\.0\.0\.1:\d+\/v1$/)),
  textModel: z.string().max(160).optional(),
  imageModel: z.string().max(160).optional(),
  videoModel: z.string().max(160).optional(),
  ttsModel: z.string().max(160).optional(),
  sttModel: z.string().max(160).optional(),
  apiKey: z.string().min(1).max(4096)
});

export const providerIdRequestSchema = z.object({
  providerId: idSchema
});

export const modelListStatusSchema = z.enum([
  "not_tested",
  "testing",
  "models_discovered",
  "empty_model_list",
  "unauthorized",
  "endpoint_not_found",
  "rate_limited",
  "server_error",
  "timeout",
  "network_error"
]);

export const textModelCertificationStatusSchema = z.enum(["not_tested", "testing", "verified", "failed", "stale"]);

export const textCertificationErrorCategorySchema = z.enum([
  "credential_missing",
  "model_not_selected",
  "invalid_base_url",
  "unauthorized",
  "endpoint_not_found",
  "rate_limited",
  "server_error",
  "timeout",
  "network_error",
  "invalid_response_shape",
  "exact_text_mismatch",
  "invalid_json",
  "json_schema_mismatch",
  "unknown_error"
  , "provider_unavailable"
  , "authentication_failed"
  , "model_not_found"
  , "invalid_response"
  , "schema_validation_failed"
  , "request_failed"
]);

export const listNineRouterModelsRequestSchema = z.object({
  providerId: z.literal("9router").optional()
});

export const save9RouterModelConfigurationRequestSchema = z.object({
  providerId: z.literal("9router").optional(),
  textModel: modelIdSchema.optional(),
  imageModel: modelIdSchema.optional(),
  videoModel: modelIdSchema.optional(),
  ttsModel: modelIdSchema.optional(),
  sttModel: modelIdSchema.optional()
}).strict();

export const run9RouterTextCertificationRequestSchema = z.object({
  providerId: z.literal("9router").optional(),
  confirmation: z.literal("Run 2 certification requests")
}).strict();

export const listCockpitTextModelsRequestSchema = z.object({ providerId: z.literal("cockpit").optional() }).strict();

export const saveCockpitTextModelConfigurationRequestSchema = z.object({
  providerId: z.literal("cockpit").optional(),
  textModel: modelIdSchema
}).strict();

export const runCockpitTextCapabilityRequestSchema = z.object({
  providerId: z.literal("cockpit").optional(),
  confirmation: z.literal("Run 2 text capability requests")
}).strict();

export const localTtsSettingsSchema = z.object({
  omnivoiceBinPath: localPathSchema,
  outputDir: localPathSchema,
  voiceMode: localTtsVoiceModeSchema.optional(),
  ttsProvider: localTtsProviderSchema.optional(),
  ttsVoiceProvider: nineRouterTtsVoiceProviderSchema.optional(),
  ttsVoiceId: z.string().max(300).optional(),
  ttsPythonPath: localPathSchema.optional(),
  ttsRate: ttsRateSchema.optional(),
  ttsFallbackEnabled: z.boolean().optional(),
  ttsFallbackOrder: z.array(ttsProviderSchema).max(4).optional(),
  modelPath: z.string().max(1000).optional(),
  language: z.string().max(80).optional(),
  instruct: z.string().max(500).optional(),
  referenceAudioPath: localPathSchema.optional(),
  referenceTranscript: z.string().max(12000).optional(),
  voiceGender: z.enum(["male", "female"]).optional(),
  voiceAge: z.enum(["child", "teenager", "young adult", "middle-aged", "elderly"]).optional(),
  voicePitch: z.enum(["very low pitch", "low pitch", "moderate pitch", "high pitch", "very high pitch"]).optional(),
  voiceStyle: z.literal("whisper").optional(),
  voiceEnglishAccent: z.enum(["american accent", "british accent", "australian accent", "canadian accent", "indian accent", "chinese accent", "korean accent", "japanese accent", "portuguese accent", "russian accent"]).optional(),
  voiceChineseDialect: z.enum(["河南话", "陕西话", "四川话", "贵州话", "云南话", "桂林话", "济南话", "石家庄话", "甘肃话", "宁夏话", "青岛话", "东北话"]).optional()
});

export const localTtsReferenceAudioResponseSchema = z.object({
  referenceAudioPath: localPathSchema.optional()
}).strict();

export const generateLocalTtsRequestSchema = z.object({
  projectId: idSchema,
  text: z.string().min(1).max(12000),
  outputName: z.string().min(1).max(160).regex(/^[A-Za-z0-9._-]+$/).optional()
});

// Development-only probes never create workflow artifacts or approvals.
export const devVoiceTestRequestSchema = z.object({
  text: z.string().min(1).max(12000),
  provider: localTtsProviderSchema.optional(),
  voiceId: z.string().max(300).optional()
}).strict();

export const listNineRouterTtsCatalogRequestSchema = z.object({
  provider: nineRouterTtsVoiceProviderSchema,
  language: z.string().trim().min(2).max(16).regex(/^[A-Za-z-]+$/)
}).strict();

export const nineRouterTtsCatalogResponseSchema = z.object({
  models: z.array(z.object({ id: z.string().min(1).max(300) }).strict()).max(500),
  voices: z.array(z.object({ id: z.string().min(1).max(300), label: z.string().min(1).max(300) }).strict()).max(500),
  message: z.string().min(1).max(500)
}).strict();

export const ttsVoiceDescriptorSchema = z.object({
  key: z.string().min(1).max(300),
  provider: ttsProviderSchema,
  providerVoiceId: z.string().min(1).max(300),
  label: z.string().min(1).max(300),
  language: z.string().min(2).max(32),
  gender: z.enum(["female", "male", "neutral", "unknown"]),
  description: z.string().max(500).optional(),
  providerType: z.enum(["local", "cloud"]),
  enabled: z.boolean(),
  experimental: z.boolean()
}).strict();

export const ttsProviderStatusSchema = z.object({
  id: ttsProviderSchema,
  displayName: z.string().min(1).max(120),
  providerType: z.enum(["local", "cloud"]),
  health: z.enum(["ready", "degraded", "unavailable", "not_tested"]),
  message: z.string().min(1).max(500),
  experimental: z.boolean(),
  enabled: z.boolean(),
  voiceCount: z.number().int().nonnegative().max(1000)
}).strict();

export const listTtsProvidersRequestSchema = z.object({
  language: z.string().trim().min(2).max(16).regex(/^[A-Za-z-]+$/).optional(),
  refresh: z.boolean().optional()
}).strict();
export const listTtsProvidersResponseSchema = z.object({
  providers: z.array(ttsProviderStatusSchema).length(5),
  voices: z.array(ttsVoiceDescriptorSchema).max(1000)
}).strict();

export const runTtsProviderHealthCheckRequestSchema = z.object({
  provider: ttsProviderSchema
}).strict();
export const runTtsProviderHealthCheckResponseSchema = ttsProviderStatusSchema;

export const ttsPreviewRequestSchema = z.object({
  provider: ttsProviderSchema,
  voiceId: z.string().min(1).max(300),
  language: z.string().trim().min(2).max(16).regex(/^[A-Za-z-]+$/),
  text: z.string().min(1).max(12000),
  rate: ttsRateSchema.optional()
}).strict();
export const ttsPreviewResponseSchema = z.object({
  previewUrl: z.string().url(),
  relativeFilePath: z.string().min(1).max(1000),
  requestedProvider: ttsProviderSchema,
  actualProvider: ttsProviderSchema,
  voiceId: z.string().min(1).max(300),
  durationSeconds: z.number().positive(),
  codec: z.string().min(1).max(100),
  cached: z.boolean(),
  fallbackUsed: z.boolean(),
  message: z.string().min(1).max(500)
}).strict();

const ttsSegmentRequestSchema = z.object({
  id: idSchema,
  text: z.string().min(1).max(12000),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().positive().optional(),
  rate: ttsRateSchema.optional()
}).strict();
export const createTtsJobRequestSchema = z.object({
  projectId: idSchema.optional(),
  provider: ttsProviderSchema,
  voiceId: z.string().min(1).max(300),
  language: z.string().trim().min(2).max(16).regex(/^[A-Za-z-]+$/),
  rate: ttsRateSchema.optional(),
  fallbackEnabled: z.boolean().optional(),
  fallbackOrder: z.array(ttsProviderSchema).max(4).optional(),
  segments: z.array(ttsSegmentRequestSchema).min(1).max(200)
}).strict();
const ttsSegmentResultSchema = z.object({
  segmentId: idSchema,
  state: z.enum(["queued", "running", "success", "failed", "cancelled"]),
  requestedProvider: ttsJobProviderSchema,
  actualProvider: ttsJobProviderSchema.optional(),
  voiceId: z.string().min(1).max(300),
  startSeconds: z.number().nonnegative(),
  availableDurationSeconds: z.number().positive().optional(),
  originalDurationSeconds: z.number().positive().optional(),
  finalDurationSeconds: z.number().positive().optional(),
  appliedSpeed: ttsRateSchema.optional(),
  timingOverflowSeconds: z.number().nonnegative(),
  relativeFilePath: z.string().min(1).max(1000).optional(),
  attemptCount: z.number().int().nonnegative().max(10),
  fallbackUsed: z.boolean(),
  fallbackReason: z.string().max(500).optional(),
  errorCode: z.string().max(120).optional(),
  errorMessage: z.string().max(1000).optional()
}).strict();
export const ttsJobResponseSchema = z.object({
  id: idSchema,
  projectId: idSchema.optional(),
  state: z.enum(["queued", "running", "success", "partial", "failed", "cancelled"]),
  provider: ttsJobProviderSchema,
  voiceId: z.string().min(1).max(300),
  language: z.string().min(2).max(16),
  mergedRelativeFilePath: z.string().min(1).max(1000).optional(),
  errorMessage: z.string().min(1).max(1000).optional(),
  segments: z.array(ttsSegmentResultSchema).min(1).max(200),
  createdAt: z.string(),
  updatedAt: z.string()
}).strict();
export const ttsJobIdRequestSchema = z.object({ jobId: idSchema }).strict();
export const retryTtsJobSegmentRequestSchema = z.object({ jobId: idSchema, segmentId: idSchema }).strict();
export const nullableTtsJobResponseSchema = ttsJobResponseSchema.nullable();

export const devVoiceTestResponseSchema = z.object({
  provider: localTtsProviderSchema,
  previewUrl: z.string().url(),
  relativeFilePath: z.string().min(1).max(1000),
  durationSeconds: z.number().positive(),
  codec: z.string().min(1).max(100),
  byteLength: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();

export const devCapcutTestRequestSchema = z.object({
  subtitleText: z.string().min(1).max(500).optional()
}).strict();

export const devCapcutTestResponseSchema = z.object({
  draftDirectory: z.string().min(1).max(2000),
  contentPath: z.string().min(1).max(2000),
  fixtureDirectory: z.string().min(1).max(2000),
  trackCounts: z.object({ video: z.number().int().min(1), audio: z.number().int().min(1), text: z.number().int().min(1) }).strict()
}).strict();

export const devIdeaTestRequestSchema = z.object({
  topic: z.string().min(1).max(500),
  language: z.string().min(1).max(80).optional()
}).strict();

export const devIdeaTestResponseSchema = z.object({
  model: z.string().min(1).max(300),
  responseText: z.string().min(1).max(50000),
  relativeFilePath: z.string().min(1).max(1000)
}).strict();

export const devImageTestRequestSchema = z.object({
  prompt: z.string().min(1).max(4000),
  aspectRatio: z.enum(["16:9", "9:16"])
}).strict();

export const devImageTestResponseSchema = z.object({
  relativeFilePath: z.string().min(1).max(1000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  byteLength: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive()
}).strict();

export const devStockTestRequestSchema = z.object({
  query: z.string().min(1).max(250),
  mediaType: z.enum(["image", "video"])
}).strict();

export const devStockTestResponseSchema = z.object({
  mediaType: z.enum(["image", "video"]),
  results: z.array(z.object({ id: z.string().min(1).max(100), url: z.string().url(), previewUrl: z.string().url(), creator: z.string().max(300).optional() }).strict()).max(5)
}).strict();

export const addCompetitorReferenceRequestSchema = z.object({
  projectId: idSchema,
  sourceUrl: z.string().max(1000).optional(),
  pastedTranscript: z.string().min(1).max(200000),
  notes: z.string().max(5000).optional()
});

export const referenceIdRequestSchema = z.object({
  projectId: idSchema,
  referenceId: idSchema
}).strict();

export const editCompetitorReferenceRequestSchema = referenceIdRequestSchema.extend({
  sourceUrl: z.string().max(1000).optional(),
  pastedTranscript: z.string().min(1).max(200000),
  notes: z.string().max(5000).optional()
}).strict();

export const setReferenceIncludedRequestSchema = referenceIdRequestSchema.extend({
  included: z.boolean()
}).strict();

export const replaceCompetitorReferenceRequestSchema = referenceIdRequestSchema.extend({
  pastedTranscript: z.string().min(1).max(200000),
  notes: z.string().max(5000).optional()
}).strict();

export const referenceSetRequestSchema = z.object({
  projectId: idSchema
}).strict();
export const approveReferenceSetRequestSchema = referenceSetRequestSchema.extend({
  approvalMode: z.enum(["manual", "automatic"]).optional()
}).strict();

export const referenceChangeImpactResponseSchema = z.object({
  stageIds: z.array(idSchema),
  stageNames: z.array(z.string().min(1))
}).strict();

const referenceValidationReferenceSchema = z.object({
  id: idSchema,
  identityKey: z.string().max(300).optional(),
  sourceUrl: z.string().max(1000).optional(),
  pastedTranscript: z.string(),
  notes: z.string().optional(),
  status: referenceStatusSchema,
  included: z.boolean().optional(),
  validationMessage: z.string(),
  validationErrors: z.array(z.string().max(120)).optional(),
  validationWarnings: z.array(z.string().max(120)).optional(),
  validatedAt: z.string().optional(),
  validatorVersion: z.string().max(80).optional(),
  contentFingerprint: z.string().length(64).optional(),
  version: z.number().int().positive().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  parentReferenceId: idSchema.optional()
}).passthrough();

export const referenceValidationOutputSchema = z.object({
  referenceSet: z.object({
    status: z.literal("valid"),
    validationRunAt: z.string().optional(),
    currentFingerprint: z.string().optional(),
    includedCount: z.number().int().nonnegative().optional(),
    validCount: z.number().int().nonnegative().optional(),
    invalidCount: z.number().int().nonnegative().optional(),
    duplicateCount: z.number().int().nonnegative().optional(),
    draftCount: z.number().int().nonnegative().optional(),
    excludedCount: z.number().int().nonnegative().optional()
  }).passthrough(),
  references: z.array(referenceValidationReferenceSchema).min(1).max(1000)
}).strict();

export const referenceValidationArtifactResponseSchema = z.object({
  id: idSchema,
  stageRunId: idSchema.optional(),
  status: workflowArtifactStatusSchema,
  payloadJson: referenceValidationOutputSchema,
  createdAt: z.string(),
  updatedAt: z.string()
}).strict();

export const runTranscriptCleaningRequestSchema = z.object({
  projectId: idSchema,
  referenceId: idSchema
}).strict();

export const competitorWorkflowStageIdSchema = z.enum(["transcript-cleaning", "reference-segmentation", "competitor-dna"]);
export const workflowRunListRequestSchema = z.object({
  projectId: idSchema,
  stageId: competitorWorkflowStageIdSchema
}).strict();
export const workflowRunResponseSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  stageId: competitorWorkflowStageIdSchema,
  status: workflowStageStatusSchema,
  runnerId: z.string().min(1).max(300),
  runnerVersion: z.string().min(1).max(300),
  providerId: z.string().min(1).max(100).optional(),
  configuredModelId: modelIdSchema.optional(),
  returnedModelId: modelIdSchema.optional(),
  inputArtifactIds: z.array(idSchema).max(1000),
  inputFingerprint: z.string().min(1).max(200),
  outputArtifactIds: z.array(idSchema).max(1000),
  payloadJson: z.record(z.unknown()).optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  safeErrorCategory: z.string().min(1).max(100).optional(),
  safeErrorMessage: z.string().min(1).max(1000).optional()
}).strict();
export const workflowRunsResponseSchema = z.array(workflowRunResponseSchema);

export const stageAttentionRequestSchema = z.object({
  projectId: idSchema,
  stageId: idSchema,
  referenceId: idSchema.optional(),
  code: z.string().min(1).max(100),
  message: z.string().min(1).max(1000)
}).strict();

export const transcriptCleaningArtifactRequestSchema = runTranscriptCleaningRequestSchema;
export const runReferenceSegmentationRequestSchema = runTranscriptCleaningRequestSchema;
export const referenceSegmentationArtifactRequestSchema = runTranscriptCleaningRequestSchema;

const transcriptCleaningExecutionSchema = z.object({
  mode: z.enum(["single_request", "chunked"]),
  chunkCount: z.number().int().positive(),
  completedChunkCount: z.number().int().nonnegative(),
  estimatedInputTokens: z.number().int().nonnegative(),
  selectedModel: z.string().min(1).max(300),
  configuredTimeoutMs: z.number().int().positive(),
  removedNoise: z.number().int().nonnegative(),
  flaggedSegmentCount: z.number().int().nonnegative()
}).strict();

export const cleanedTranscriptOutputSchema = z.object({
  referenceId: idSchema,
  sourceTranscriptVersionId: idSchema,
  // Legacy artifacts predate rawTranscript; new Transcript Cleaning runs always persist it.
  rawTranscript: z.string().min(1).max(200000).optional(),
  cleanedTranscript: z.string().min(1).max(200000),
  removedSegments: z.array(z.object({
    text: z.string().min(1).max(20000),
    sourceStart: z.number().int().nonnegative().optional(),
    sourceEnd: z.number().int().nonnegative().optional(),
    reason: z.enum(["timestamp", "duplicate_caption", "formatting_noise", "empty_fragment"])
  })).max(10000),
  flaggedSegments: z.array(z.object({
    text: z.string().min(1).max(20000),
    sourceStart: z.number().int().nonnegative().optional(),
    sourceEnd: z.number().int().nonnegative().optional(),
    reason: z.enum(["unclear_transcription", "possible_name_error", "possible_term_error", "language_mismatch", "sponsor", "self_promotion", "affiliate", "disclaimer"]),
    suggestion: z.string().max(2000).optional()
  })).max(10000),
  sourceCharacterCount: z.number().int().nonnegative(),
  cleanedCharacterCount: z.number().int().nonnegative(),
  execution: transcriptCleaningExecutionSchema
}).strict();

export const segmentTypeSchema = z.enum([
  "hook", "promise", "context", "story", "problem", "conflict", "evidence", "example",
  "reveal", "payoff", "transition", "sponsor", "self_promotion", "affiliate", "disclaimer",
  "subscribe_cta", "engagement_cta", "outro", "other"
]);

const segmentExclusionReasonSchema = z.enum(["sponsor", "self_promotion", "affiliate", "disclaimer", "non_narrative_cta"]);
export const referenceSegmentationOutputSchema = z.object({
  referenceId: idSchema,
  cleanedTranscriptArtifactId: idSchema,
  segments: z.array(z.object({
    id: idSchema,
    order: z.number().int().nonnegative(),
    startCharacter: z.number().int().nonnegative(),
    endCharacter: z.number().int().nonnegative(),
    type: segmentTypeSchema,
    text: z.string().min(1).max(200000),
    function: z.string().min(1).max(2000),
    includedForDna: z.boolean(),
    exclusionReason: segmentExclusionReasonSchema.optional()
  })).min(1).max(10000),
  excludedSegmentIds: z.array(idSchema).max(10000)
}).strict();

export const transcriptCleaningArtifactResponseSchema = z.object({
  id: idSchema,
  stageRunId: idSchema.optional(),
  status: workflowArtifactStatusSchema,
  payloadJson: cleanedTranscriptOutputSchema.extend({
    warnings: z.array(z.enum(["excessive_content_loss", "content_expansion"]))
  }),
  createdAt: z.string(),
  updatedAt: z.string()
}).strict();

export const transcriptCleaningArtifactsResponseSchema = z.array(transcriptCleaningArtifactResponseSchema);

export const referenceSegmentationArtifactResponseSchema = z.object({
  id: idSchema,
  stageRunId: idSchema.optional(),
  status: workflowArtifactStatusSchema,
  payloadJson: referenceSegmentationOutputSchema,
  createdAt: z.string(),
  updatedAt: z.string()
}).strict();

export const referenceSegmentationArtifactsResponseSchema = z.array(referenceSegmentationArtifactResponseSchema);

const evidenceSegmentIdsSchema = z.array(idSchema).min(1).max(1000);
const dnaNarrativePatternSchema = z.object({
  phase: z.string().min(1).max(500),
  function: z.string().min(1).max(2000),
  evidenceSegmentIds: evidenceSegmentIdsSchema
}).strict();
export const competitorDnaOutputSchema = z.object({
  referenceId: idSchema,
  segmentationArtifactId: idSchema,
  hookPattern: z.object({ abstraction: z.string().min(1).max(2000), evidenceSegmentIds: evidenceSegmentIdsSchema }).strict(),
  promisePattern: z.object({ abstraction: z.string().min(1).max(2000), evidenceSegmentIds: evidenceSegmentIdsSchema }).strict(),
  narrativeStructure: z.array(dnaNarrativePatternSchema).min(1).max(100),
  pacingPattern: z.object({ description: z.string().min(1).max(2000), evidenceSegmentIds: evidenceSegmentIdsSchema }).strict(),
  conflictAndRevealPattern: z.object({ description: z.string().min(1).max(2000), evidenceSegmentIds: evidenceSegmentIdsSchema }).strict(),
  proofPattern: z.object({ description: z.string().min(1).max(2000), evidenceSegmentIds: evidenceSegmentIdsSchema }).strict(),
  emotionalArc: z.array(z.object({ phase: z.string().min(1).max(500), emotion: z.string().min(1).max(500), evidenceSegmentIds: evidenceSegmentIdsSchema }).strict()).max(100),
  retentionDevices: z.array(z.object({ abstraction: z.string().min(1).max(2000), evidenceSegmentIds: evidenceSegmentIdsSchema }).strict()).max(100),
  transitionPatterns: z.array(z.object({ abstraction: z.string().min(1).max(2000), evidenceSegmentIds: evidenceSegmentIdsSchema }).strict()).max(100),
  reusablePrinciples: z.array(z.object({ principle: z.string().min(1).max(1000), evidenceSegmentIds: evidenceSegmentIdsSchema }).strict()).max(100),
  forbiddenToCopy: z.array(z.object({ element: z.string().min(1).max(1000), reason: z.string().min(1).max(1000), evidenceSegmentIds: evidenceSegmentIdsSchema }).strict()).max(100),
  excludedContentSummary: z.object({
    sponsorSegmentCount: z.number().int().nonnegative(),
    selfPromotionSegmentCount: z.number().int().nonnegative(),
    excludedSegmentIds: z.array(idSchema).max(10000)
  }).strict(),
  uncertainties: z.array(z.string().min(1).max(1000)).max(100)
}).strict();

export const runCompetitorDnaRequestSchema = runTranscriptCleaningRequestSchema;
export const competitorDnaArtifactRequestSchema = runTranscriptCleaningRequestSchema;
export const competitorDnaArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: workflowArtifactStatusSchema, payloadJson: competitorDnaOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const competitorDnaArtifactsResponseSchema = z.array(competitorDnaArtifactResponseSchema);

const opportunityItemSchema = z.object({ text: z.string().min(1).max(2000), sourceReferenceIds: z.array(idSchema).min(1).max(100), sourceArtifactIds: z.array(idSchema).min(1).max(100), confidence: z.enum(["low", "medium", "high"]) }).strict();
export const opportunityMapOutputSchema = z.object({ sharedPatterns: z.array(opportunityItemSchema).max(100), overusedPatterns: z.array(opportunityItemSchema).max(100), underservedViewerQuestions: z.array(opportunityItemSchema).max(100), evidenceGaps: z.array(opportunityItemSchema).max(100), differentiationDirections: z.array(opportunityItemSchema).max(100), riskyDirections: z.array(opportunityItemSchema).max(100), recommendedContentSpaces: z.array(opportunityItemSchema).max(100) }).strict();
export const opportunityMapRequestSchema = z.object({ projectId: idSchema }).strict();
export const opportunityMapArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: workflowArtifactStatusSchema, payloadJson: opportunityMapOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const ideaCandidateOutputSchema = z.object({ id: idSchema, workingTitle: z.string().min(1).max(300), angle: z.string().min(1).max(2000), corePromise: z.string().min(1).max(1000), viewerProblem: z.string().min(1).max(1000), dramaticQuestion: z.string().min(1).max(1000), targetEmotion: z.string().min(1).max(300), trafficModel: z.enum(["browse", "suggested", "search", "mixed"]), thumbnailConcept: z.string().min(1).max(1000), noveltyExplanation: z.string().min(1).max(1000), noveltyScore: z.number().min(0).max(100), audienceFitScore: z.number().min(0).max(100), thumbnailPotentialScore: z.number().min(0).max(100), researchRisk: z.enum(["low", "medium", "high"]), productionDifficulty: z.enum(["low", "medium", "high"]), repurposePotential: z.array(z.string().min(1).max(300)).max(20), whyThisCanWin: z.string().min(1).max(1000) }).strict();
export const ideaLabOutputSchema = z.object({ candidates: z.array(ideaCandidateOutputSchema).length(6) }).strict().superRefine((value, context) => {
  const riskCounts = value.candidates.reduce<Record<string, number>>((counts, candidate) => ({ ...counts, [candidate.researchRisk]: (counts[candidate.researchRisk] ?? 0) + 1 }), {});
  if (riskCounts.low !== 2 || riskCounts.medium !== 2 || riskCounts.high !== 2) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Idea Lab requires two candidates in each research-risk bucket." });
  }
  if (new Set(value.candidates.map((candidate) => candidate.id)).size !== value.candidates.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Idea Lab candidates must have unique IDs." });
  }
});
export const ideaLabRequestSchema = z.object({ projectId: idSchema, force: z.boolean().optional() }).strict();
export const approveIdeaRequestSchema = z.object({ projectId: idSchema, ideaId: idSchema }).strict();
export const editIdeaRequestSchema = z.object({
  projectId: idSchema,
  ideaId: idSchema,
  changes: z.object({
    workingTitle: z.string().trim().min(1).max(300).optional(),
    angle: z.string().trim().min(1).max(2000).optional(),
    corePromise: z.string().trim().min(1).max(1000).optional(),
    viewerProblem: z.string().trim().min(1).max(1000).optional(),
    dramaticQuestion: z.string().trim().min(1).max(1000).optional(),
    targetEmotion: z.string().trim().min(1).max(300).optional(),
    thumbnailConcept: z.string().trim().min(1).max(1000).optional(),
    noveltyExplanation: z.string().trim().min(1).max(1000).optional(),
    productionDifficulty: z.enum(["low", "medium", "high"]).optional()
  }).strict().refine((changes) => Object.keys(changes).length > 0, "At least one idea field must be changed")
}).strict();
export const originalityReviewOutputSchema = z.object({
  ideaId: idSchema,
  reviewer: z.literal("local_deterministic"),
  phraseOverlapRisk: z.number().int().min(0).max(100),
  structuralOverlapRisk: z.number().int().min(0).max(100),
  thumbnailOverlapRisk: z.number().int().min(0).max(100),
  conceptOverlapRisk: z.number().int().min(0).max(100),
  flaggedMatches: z.array(z.string().min(1).max(1000)).max(100),
  requiredChanges: z.array(z.string().min(1).max(1000)).max(100),
  status: z.enum(["pass", "needs_changes", "blocked"]),
  competitorDnaArtifactIds: z.array(idSchema).max(100)
}).strict();
export const originalityReviewRequestSchema = z.object({ projectId: idSchema }).strict();
export const originalityReviewArtifactResponseSchema = z.object({
  id: idSchema,
  stageRunId: idSchema.optional(),
  status: workflowArtifactStatusSchema,
  payloadJson: originalityReviewOutputSchema,
  createdAt: z.string(),
  updatedAt: z.string()
}).strict();
export const originalityReviewArtifactsResponseSchema = z.array(originalityReviewArtifactResponseSchema);
export const researchSourceInputSchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(500),
  url: z.string().url().max(2000),
  publisher: z.string().min(1).max(500),
  excerpt: z.string().min(1).max(20000),
  sourceType: z.enum(["primary", "secondary"]),
  publishedAt: z.string().datetime().optional(),
  notes: z.string().max(5000).optional(),
  localSnapshotReference: z.string().max(1000).optional()
}).strict();
const researchSourcesArraySchema = z.array(researchSourceInputSchema).min(1).max(100);
export const researchSourcesOutputSchema = z.object({ sources: researchSourcesArraySchema }).strict().superRefine((value, context) => {
  if (new Set(value.sources.map((source) => source.id)).size !== value.sources.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Research source IDs must be unique." });
  if (new Set(value.sources.map((source) => source.url)).size !== value.sources.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Research source URLs must be unique." });
});
export const saveResearchSourcesRequestSchema = z.object({ projectId: idSchema, sources: researchSourcesArraySchema }).strict().superRefine((value, context) => {
  if (new Set(value.sources.map((source) => source.id)).size !== value.sources.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Research source IDs must be unique." });
  if (new Set(value.sources.map((source) => source.url)).size !== value.sources.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Research source URLs must be unique." });
});
export const researchSourcesRequestSchema = z.object({ projectId: idSchema }).strict();
export const researchSourceSearchRequestSchema = z.object({ projectId: idSchema }).strict();
export const researchSourcesArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: workflowArtifactStatusSchema, payloadJson: researchSourcesOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const researchSourcesArtifactsResponseSchema = z.array(researchSourcesArtifactResponseSchema);
export const claimMapClaimSchema = z.object({
  id: idSchema,
  text: z.string().min(1).max(5000),
  type: z.enum(["fact", "estimate", "opinion", "interpretation", "allegation"]),
  sourceRequirement: z.enum(["primary", "secondary", "either", "none"]),
  sourceIds: z.array(idSchema).min(1).max(20),
  evidenceNote: z.string().min(1).max(5000),
  confidence: z.number().min(0).max(1),
  qualification: z.string().max(2000).optional(),
  state: z.enum(["verified", "needs_qualification", "disputed", "unsupported", "interpretive"]),
  approvalState: z.enum(["allowed", "blocked"])
}).strict();
export const claimMapOutputSchema = z.object({ claims: z.array(claimMapClaimSchema).min(1).max(100) }).strict();
export const claimMapRequestSchema = z.object({ projectId: idSchema }).strict();
export const claimMapArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: workflowArtifactStatusSchema, payloadJson: claimMapOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const claimMapArtifactsResponseSchema = z.array(claimMapArtifactResponseSchema);
export const outlineSectionSchema = z.object({ id: idSchema, order: z.number().int().nonnegative(), purpose: z.string().min(1).max(1000), keyPoint: z.string().min(1).max(3000), linkedClaimIds: z.array(idSchema).max(100), dramaticFunction: z.string().min(1).max(1000), estimatedSeconds: z.number().int().positive().max(7200), openLoop: z.string().max(1000).optional(), proofObjects: z.array(z.string().min(1).max(1000)).max(50) }).strict();
export const outlineOutputSchema = z.object({ sections: z.array(outlineSectionSchema).min(1).max(100) }).strict();
export const outlineRequestSchema = z.object({ projectId: idSchema }).strict();
export const outlineArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: workflowArtifactStatusSchema, payloadJson: outlineOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const outlineArtifactsResponseSchema = z.array(outlineArtifactResponseSchema);
export const scriptSectionOutputSchema = z.object({ id: idSchema, outlineSectionId: idSchema, purpose: z.string().min(1).max(1000), narration: z.string().min(1).max(20000), estimatedWords: z.number().int().positive().max(10000), estimatedSeconds: z.number().int().positive().max(7200), linkedClaimIds: z.array(idSchema).max(100), dramaticFunction: z.string().min(1).max(1000), openLoop: z.string().max(1000).optional(), visualOpportunities: z.array(z.string().min(1).max(1000)).max(50), proofObjects: z.array(z.string().min(1).max(1000)).max(50), retentionRisk: z.enum(["low", "medium", "high"]) }).strict();
export const scriptOutputSchema = z.object({ sections: z.array(scriptSectionOutputSchema).min(1).max(100) }).strict();
export const scriptRequestSchema = z.object({ projectId: idSchema }).strict();
export const editScriptRequestSchema = z.object({ projectId: idSchema, artifactId: idSchema, sectionId: idSchema, narration: z.string().trim().min(1).max(20000) }).strict();
export const scriptArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: workflowArtifactStatusSchema, payloadJson: scriptOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const scriptArtifactsResponseSchema = z.array(scriptArtifactResponseSchema);
export const factReviewFindingSchema = z.object({ claimId: idSchema, verdict: z.enum(["supported", "needs_qualification", "blocked"]), reason: z.string().min(1).max(2000) }).strict();
export const factReviewOutputSchema = z.object({ reviewer: z.literal("local_deterministic"), findings: z.array(factReviewFindingSchema).max(100) }).strict();
export const factReviewRequestSchema = z.object({ projectId: idSchema }).strict();
export const factReviewArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: workflowArtifactStatusSchema, payloadJson: factReviewOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const factReviewArtifactsResponseSchema = z.array(factReviewArtifactResponseSchema);
export const retentionReviewFindingSchema = z.object({ sectionId: idSchema, severity: z.enum(["low", "medium", "high"]), reason: z.string().min(1).max(2000), recommendedChange: z.string().min(1).max(2000) }).strict();
export const retentionReviewOutputSchema = z.object({ overallVerdict: z.enum(["pass", "needs_changes", "blocked"]), findings: z.array(retentionReviewFindingSchema).max(100) }).strict();
export const retentionReviewRequestSchema = z.object({ projectId: idSchema }).strict();
export const retentionReviewArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: workflowArtifactStatusSchema, payloadJson: retentionReviewOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const retentionReviewArtifactsResponseSchema = z.array(retentionReviewArtifactResponseSchema);
export const scenePlanSceneSchema = z.object({ id: idSchema, scriptSectionId: idSchema, narration: z.string().min(1).max(20000), purpose: z.string().min(1).max(2000), startFrame: z.number().int().nonnegative(), durationFrames: z.number().int().positive(), visualMode: z.enum(["ai_image", "ai_video", "stock_image", "stock_video", "manual_upload", "uploaded", "document", "diagram", "text_card", "reuse"]), proofObject: z.string().min(1).max(1000).optional(), emotionalState: z.string().min(1).max(1000), requiredAssets: z.array(z.string().min(1).max(1000)).max(50), continuityRefs: z.array(z.string().min(1).max(1000)).max(50) }).strict();
export const scenePlanOutputSchema = z.object({ fps: z.number().int().positive().max(120), scenes: z.array(scenePlanSceneSchema).min(1).max(200) }).strict();
export const scenePlanRequestSchema = z.object({ projectId: idSchema }).strict();
export const scenePlanArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: workflowArtifactStatusSchema, payloadJson: scenePlanOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const scenePlanArtifactsResponseSchema = z.array(scenePlanArtifactResponseSchema);
export const shotPlanShotSchema = z.object({ id: idSchema, sceneId: idSchema, order: z.number().int().nonnegative(), startFrame: z.number().int().nonnegative(), durationFrames: z.number().int().positive(), fps: z.number().int().positive().max(120), purpose: z.string().min(1).max(2000), visualMode: z.enum(["ai_image", "ai_video", "stock_image", "stock_video", "manual_upload", "uploaded", "document", "diagram", "text_card", "reuse"]), framing: z.string().min(1).max(1000), cameraAngle: z.string().min(1).max(1000), cameraMovement: z.string().min(1).max(1000), subjectAction: z.string().min(1).max(2000), startState: z.record(z.string(), z.unknown()), endState: z.record(z.string(), z.unknown()), continuityRefs: z.array(z.string().min(1).max(1000)).max(50), semanticBeat: z.string().min(1).max(2000).optional(), assetConceptIds: z.array(idSchema).max(20).optional(), motion: motionPlanSchema.optional() }).strict();
const uniqueShotPlanShotsSchema = z.array(shotPlanShotSchema).min(1).max(500).refine((shots) => new Set(shots.map((shot) => shot.id)).size === shots.length, { message: "Shot IDs must be unique." });
export const shotPlanOutputSchema = z.object({ shots: uniqueShotPlanShotsSchema }).strict();
export const shotPlanRequestSchema = z.object({ projectId: idSchema }).strict();
export const shotPlanArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: workflowArtifactStatusSchema, payloadJson: shotPlanOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const shotPlanArtifactsResponseSchema = z.array(shotPlanArtifactResponseSchema);
export const visualRoutingOutputSchema = z.object({ shots: uniqueShotPlanShotsSchema }).strict();
export const visualRoutingRequestSchema = z.object({ projectId: idSchema }).strict();
export const visualRoutingArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: workflowArtifactStatusSchema, payloadJson: visualRoutingOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const visualRoutingArtifactsResponseSchema = z.array(visualRoutingArtifactResponseSchema);
export const editVisualRoutingRequestSchema = z.object({ projectId: idSchema, artifactId: idSchema, shotId: idSchema, visualMode: shotPlanShotSchema.shape.visualMode, motionEffect: motionPlanSchema.shape.effect.optional() }).strict();
export const visualPromptSchema = z.object({ shotId: idSchema, promptVersionId: idSchema, positivePrompt: z.string().min(1).max(10000), negativePrompt: z.string().min(1).max(5000), aspectRatio: z.enum(["16:9", "9:16"]), continuityConstraints: z.array(z.string().min(1).max(1000)).max(50), prohibitedElements: z.array(z.string().min(1).max(1000)).max(50), semanticBeat: z.string().min(1).max(2000).optional(), assetConceptIds: z.array(idSchema).max(20).optional(), motion: motionPlanSchema.optional() }).strict();
const storyboardFrameSpecSchema = z.object({
  shotId: idSchema,
  displayNumber: z.string().regex(/^\d{3}$/),
  assetId: idSchema.optional(),
  role: z.enum(["BASE", "EXPRESSION_CHANGE", "POSE_CHANGE", "ACTION_KEYFRAME", "CUTAWAY", "INSERT", "ENVIRONMENT", "GRAPHIC", "REUSE"]),
  assetStrategy: z.enum(["NEW_BASE", "REFERENCE_VARIATION", "EXPRESSION_VARIATION", "POSE_VARIATION", "BACKGROUND_VARIATION", "INSERT_DETAIL", "GRAPHIC_ASSET", "REUSE_EXISTING", "NO_NEW_ASSET"]).optional(),
  purpose: z.string().min(1).max(2000),
  durationFrames: z.number().int().positive(),
  delta: z.string().min(1).max(2000),
  continuityRefs: z.array(z.string().min(1).max(1000)).max(50),
  referenceInstructions: z.array(z.string().min(1).max(2000)).max(20).optional(),
  prohibitedChanges: z.array(z.string().min(1).max(1000)).max(30).optional(),
  expectedFilename: z.string().regex(/^\d{3}\.(png|jpg|jpeg|webp)$/).optional(),
  acceptanceChecklist: z.array(z.string().min(1).max(1000)).max(20).optional()
}).strict();
const scenePromptPackageSchema = z.object({
  sceneId: idSchema,
  promptVersionId: idSchema,
  targetTool: z.literal("GG Lab").optional(),
  compilationMode: z.literal("scene_prompt").optional(),
  promptText: z.string().min(1).max(30000),
  frameNumbers: z.array(z.string().regex(/^\d{3}$/)).min(1).max(20),
  generatedFrameNumbers: z.array(z.string().regex(/^\d{3}$/)).max(20).optional(),
  referenceInstructions: z.array(z.string().min(1).max(2000)).max(20),
  continuityLocks: z.array(z.string().min(1).max(2000)).max(50),
  prohibitedChanges: z.array(z.string().min(1).max(1000)).max(30).optional(),
  expectedAspectRatio: z.enum(["16:9", "9:16"]),
  frameManifest: z.array(storyboardFrameSpecSchema).min(1).max(20)
}).strict();
export const promptPreparationOutputSchema = z.object({ prompts: z.array(visualPromptSchema).max(500), scenePrompts: z.array(scenePromptPackageSchema).max(200).optional() }).strict();
export const promptPreparationRequestSchema = z.object({ projectId: idSchema }).strict();
export const promptPreparationArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: workflowArtifactStatusSchema, payloadJson: promptPreparationOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const promptPreparationArtifactsResponseSchema = z.array(promptPreparationArtifactResponseSchema);
const assetConceptSchema = z.object({
  id: idSchema,
  shotId: idSchema,
  semanticBeat: z.string().min(1).max(2000),
  kind: z.enum(["object", "diagram", "background", "teacher_gesture", "text_card"]),
  role: z.string().min(1).max(500),
  description: z.string().min(1).max(3000),
  visualConstraints: z.array(z.string().min(1).max(1000)).max(30),
  colorPalette: z.array(z.string().min(1).max(300)).max(20),
  motionIntent: z.string().min(1).max(1000),
  needsReferenceImage: z.boolean(),
  referenceAssetId: idSchema.optional(),
  motion: motionPlanSchema.optional()
}).strict();
export const assetConceptsOutputSchema = z.object({ concepts: z.array(assetConceptSchema).max(1000) }).strict();
export const assetConceptsRequestSchema = z.object({ projectId: idSchema }).strict();
export const assetConceptsArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: workflowArtifactStatusSchema, payloadJson: assetConceptsOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const assetConceptsArtifactsResponseSchema = z.array(assetConceptsArtifactResponseSchema);
export const acquiredImageAssetSchema = z.object({ shotId: idSchema, promptVersionId: idSchema, relativeFilePath: safePathSchema, sha256: z.string().length(64), mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]), byteLength: z.number().int().positive(), width: z.number().int().positive(), height: z.number().int().positive() }).strict();
export const assetAcquisitionOutputSchema = z.object({ assets: z.array(acquiredImageAssetSchema).min(1).max(500) }).strict();
export const assetAcquisitionRequestSchema = z.object({ projectId: idSchema, sceneId: idSchema.optional() }).strict();
export const assetAcquisitionArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: workflowArtifactStatusSchema, payloadJson: assetAcquisitionOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const assetAcquisitionArtifactsResponseSchema = z.array(assetAcquisitionArtifactResponseSchema);
export const assetReviewItemSchema = z.object({ asset: acquiredImageAssetSchema, reviewStatus: z.enum(["needs_review", "approved", "rejected"]), assignedShotId: idSchema.optional(), warnings: z.array(z.string().min(1).max(500)).max(10).optional() }).strict();
export const assetReviewOutputSchema = z.object({ acquisitionArtifactId: idSchema, assets: z.array(assetReviewItemSchema).min(1).max(500) }).strict()
  .refine((output) => {
    const assignedShotIds = output.assets.flatMap((item) => item.assignedShotId ? [item.assignedShotId] : []);
    return new Set(assignedShotIds).size === assignedShotIds.length;
  }, { message: "Each shot can have only one assigned reviewed asset." });
export const assetReviewRequestSchema = z.object({ projectId: idSchema, sceneId: idSchema.optional() }).strict();
export const assetReviewArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: workflowArtifactStatusSchema, payloadJson: assetReviewOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const assetReviewArtifactsResponseSchema = z.array(assetReviewArtifactResponseSchema);
export const reviseAssetReviewRequestSchema = z.object({ projectId: idSchema, artifactId: idSchema, assetSha256: z.string().length(64), action: z.enum(["approve", "reject", "assign", "unassign"]), shotId: idSchema.optional() }).strict();
export const manualAssetUploadRequestSchema = z.object({ projectId: idSchema, artifactId: idSchema.optional(), shotId: idSchema.optional(), sourcePaths: z.array(z.string().min(1).max(4000)).min(1).max(200).optional() }).strict();
export const sceneReviewRevisionRequestSchema = z.discriminatedUnion("action", [
  z.object({ projectId: idSchema, artifactId: idSchema, action: z.literal("edit_prompt"), shotId: idSchema, positivePrompt: z.string().trim().min(1).max(10000), negativePrompt: z.string().trim().min(1).max(5000) }).strict(),
  z.object({ projectId: idSchema, artifactId: idSchema, action: z.literal("edit_direction"), shotId: idSchema, framing: z.string().trim().min(1).max(1000), cameraAngle: z.string().trim().min(1).max(1000), cameraMovement: z.string().trim().min(1).max(1000), subjectAction: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ projectId: idSchema, artifactId: idSchema, action: z.literal("change_scene_type"), sceneId: idSchema, visualMode: shotPlanShotSchema.shape.visualMode }).strict(),
  z.object({ projectId: idSchema, artifactId: idSchema, action: z.literal("remove_scene"), sceneId: idSchema }).strict()
]);
export const assetPreviewMediaRequestSchema = z.object({ projectId: idSchema, artifactId: idSchema, assetSha256: z.string().length(64) }).strict();
export const voiceSegmentSchema = z.object({
  scriptSectionId: idSchema,
  relativeFilePath: safePathSchema,
  durationSeconds: z.number().positive().max(7200),
  codec: z.string().min(1).max(100),
  byteLength: z.number().int().positive(),
  sha256: z.string().length(64),
  startSeconds: z.number().nonnegative().optional(),
  requestedProvider: ttsJobProviderSchema.optional(),
  actualProvider: ttsJobProviderSchema.optional(),
  voiceId: z.string().min(1).max(300).optional(),
  attemptCount: z.number().int().positive().max(10).optional(),
  fallbackUsed: z.boolean().optional(),
  fallbackReason: z.string().max(500).optional(),
  timingOverflowSeconds: z.number().nonnegative().optional()
}).strict();
export const voiceGenerationOutputSchema = z.object({
  segments: z.array(voiceSegmentSchema).min(1).max(100),
  ttsJobId: idSchema.optional(),
  requestedProvider: ttsJobProviderSchema.optional(),
  mergedRelativeFilePath: safePathSchema.optional(),
  timingWarnings: z.array(z.string().min(1).max(500)).max(100).optional()
}).strict();
export const voiceGenerationRequestSchema = z.object({ projectId: idSchema, force: z.boolean().optional() }).strict();
export const voiceGenerationStartRequestSchema = voiceGenerationRequestSchema.extend({ voiceId: z.string().min(1).max(300) }).strict();
export const voiceGenerationArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: workflowArtifactStatusSchema, payloadJson: voiceGenerationOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const voiceGenerationArtifactsResponseSchema = z.array(voiceGenerationArtifactResponseSchema);
export const subtitleCueSchema = z.object({ id: idSchema, scriptSectionId: idSchema, startFrame: z.number().int().nonnegative(), durationFrames: z.number().int().positive(), text: z.string().min(1).max(1000) }).strict();
export const subtitlePreparationOutputSchema = z.object({ fps: z.number().int().positive().max(120), cues: z.array(subtitleCueSchema).min(1).max(2000) }).strict();
export const subtitlePreparationRequestSchema = z.object({ projectId: idSchema }).strict();
export const subtitlePreparationArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: workflowArtifactStatusSchema, payloadJson: subtitlePreparationOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const subtitlePreparationArtifactsResponseSchema = z.array(subtitlePreparationArtifactResponseSchema);
export const timelineItemOutputSchema = z.object({ id: idSchema, track: z.enum(["primary_visual", "overlay_visual", "narration", "music", "ambience", "sfx", "subtitles", "text", "markers"]), sourceId: z.string().min(1).max(1000), startFrame: z.number().int().nonnegative(), durationFrames: z.number().int().positive(), fps: z.number().int().positive().max(120), motion: motionPlanSchema.optional() }).strict();
export const timelineAssemblyOutputSchema = z.object({ fps: z.number().int().positive().max(120), items: z.array(timelineItemOutputSchema).min(1).max(2000) }).strict();
export const timelineAssemblyRequestSchema = z.object({ projectId: idSchema }).strict();
export const projectAudioKindSchema = z.enum(["music", "ambient", "sfx"]);
export const selectProjectAudioRequestSchema = z.object({ projectId: idSchema, kind: projectAudioKindSchema }).strict();
export const timelineAssemblyArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: workflowArtifactStatusSchema, payloadJson: timelineAssemblyOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const timelineAssemblyArtifactsResponseSchema = z.array(timelineAssemblyArtifactResponseSchema);

export const previewRenderOutputSchema = z.object({
  relativeFilePath: safePathSchema,
  subtitleRelativeFilePath: safePathSchema.optional(),
  subtitlePreset: z.enum(["vox-clean", "minimal", "high-contrast"]).default("vox-clean"),
  durationSeconds: z.number().positive().max(7200),
  width: z.number().int().positive().max(7680),
  height: z.number().int().positive().max(7680),
  sha256: z.string().length(64).optional(),
  inputArtifactIds: z.array(idSchema).min(3).max(4)
}).strict();
export const previewRenderRequestSchema = z.object({
  projectId: idSchema,
  force: z.boolean().optional(),
  subtitlePreset: z.enum(["vox-clean", "minimal", "high-contrast"]).optional(),
  resolution: z.enum(["1080p", "720p"]).optional(),
  includeSubtitles: z.boolean().default(true)
}).strict();
export const previewMediaRequestSchema = z.object({ projectId: idSchema, artifactId: idSchema }).strict();
export const previewMediaUrlResponseSchema = z.object({ url: z.string().url() }).strict();
export const downloadPreviewVideoRequestSchema = previewMediaRequestSchema;
export const downloadPreviewVideoResponseSchema = z.object({ canceled: z.boolean(), fileName: z.string().optional(), savedPath: localPathSchema.optional() }).strict();
export const previewRenderArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: workflowArtifactStatusSchema, payloadJson: previewRenderOutputSchema, relativeFilePath: safePathSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const previewRenderArtifactsResponseSchema = z.array(previewRenderArtifactResponseSchema);

export const qaFindingSchema = z.object({ code: z.enum(["stale_upstream", "missing_approval", "unsupported_claim", "missing_shot_asset", "rejected_asset", "duration_mismatch", "missing_audio", "subtitle_overflow", "continuity", "certification", "broken_path", "capcut_prerequisite"]), severity: z.enum(["blocking", "warning"]), message: z.string().min(1).max(500), evidence: z.string().min(1).max(1000) }).strict();
export const qaOutputSchema = z.object({ runner: z.literal("local_deterministic"), findings: z.array(qaFindingSchema).max(100), inputArtifactIds: z.array(idSchema).min(1).max(8) }).strict();
export const qaRequestSchema = z.object({ projectId: idSchema }).strict();
export const qaArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: workflowArtifactStatusSchema, payloadJson: qaOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const qaArtifactsResponseSchema = z.array(qaArtifactResponseSchema);

export const capcutDraftOutputSchema = z.object({
  draftName: z.string().min(1).max(160).regex(/^[A-Za-z0-9._-]+$/),
  structurallyValidated: z.literal(true),
  mediaValidated: z.boolean().default(false),
  visualClipCount: z.number().int().nonnegative().default(0),
  trackCounts: z.object({ video: z.number().int().min(1), audio: z.number().int().min(1), text: z.number().int().min(0) }).strict(),
  inputArtifactIds: z.array(idSchema).min(3).max(6),
  motionEffects: z.array(z.object({ sourceId: idSchema, effect: motionPlanSchema.shape.effect, intensity: motionPlanSchema.shape.intensity, rationale: z.string().min(1).max(1000) }).strict()).max(2000).default([])
}).strict();
export const capcutDraftRequestSchema = z.object({ projectId: idSchema }).strict();
export const capcutDraftApprovalRequestSchema = z.object({ projectId: idSchema, confirmation: z.literal("I opened the draft in CapCut and verified editable tracks") }).strict();
export const capcutDraftArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: workflowArtifactStatusSchema, payloadJson: capcutDraftOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const capcutDraftArtifactsResponseSchema = z.array(capcutDraftArtifactResponseSchema);

export const packagingExportOutputSchema = z.object({ relativeFilePath: safePathSchema, manifestRelativeFilePath: safePathSchema.optional(), subtitleRelativeFilePath: safePathSchema.optional(), artifactIds: z.array(idSchema).min(6).max(12).refine((ids) => new Set(ids).size === ids.length, { message: "Package artifact IDs must be unique." }), sha256: z.string().length(64), mp4RelativeFilePath: safePathSchema.optional() }).strict();
export const packagingExportRequestSchema = z.object({ projectId: idSchema, exportSubtitleFile: z.boolean().default(true), includeProjectManifest: z.boolean().default(true) }).strict();
export const packagingExportArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: workflowArtifactStatusSchema, payloadJson: packagingExportOutputSchema, relativeFilePath: safePathSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const packagingExportArtifactsResponseSchema = z.array(packagingExportArtifactResponseSchema);

export const imageCertificationErrorCategorySchema = z.enum(["credential_missing", "model_not_selected", "invalid_base_url", "unauthorized", "endpoint_not_found", "rate_limited", "server_error", "timeout", "network_error", "invalid_response_shape", "unsafe_asset", "unknown_error"]);
export const imageModelCertificationRecordSchema = z.object({
  id: idSchema,
  providerId: z.literal("9router"),
  configuredModelId: modelIdSchema,
  returnedModelId: modelIdSchema.optional(),
  baseUrlFingerprint: z.string().length(64),
  credentialVersionRef: z.string().min(1).optional(),
  endpointStrategy: z.literal("images-generations"),
  implementationVersion: z.literal("image-certification-v1"),
  imageResponseTest: z.object({ status: z.enum(["passed", "failed"]), latencyMs: z.number().int().nonnegative(), errorCategory: imageCertificationErrorCategorySchema.optional() }).strict(),
  overallStatus: z.enum(["verified", "failed", "stale"]),
  testedAt: z.string()
}).strict();
export const imageModelCertificationResponseSchema = z.object({ status: z.enum(["not_tested", "verified", "failed", "stale"]), record: imageModelCertificationRecordSchema.optional(), message: z.string(), errorCategory: imageCertificationErrorCategorySchema.optional() }).strict();
export const run9RouterImageCertificationRequestSchema = z.object({ providerId: z.literal("9router").optional(), confirmation: z.literal("Run 1 image certification request") }).strict();
export type ImageModelCertificationRecord = z.infer<typeof imageModelCertificationRecordSchema>;

export const workspacePathRequestSchema = z.object({
  relativePath: safePathSchema
});

export const channelRouteDecisionResponseSchema = z.object({
  selectedProfileId: idSchema,
  confidence: z.number().min(0).max(1),
  matchedSignals: z.array(z.string()),
  rejectedProfiles: z.array(z.object({ profileId: idSchema, score: z.number(), reason: z.string() })),
  requiresUserConfirmation: z.boolean()
});

export const projectSummaryResponseSchema = z.object({
  id: idSchema,
  topic: z.string(),
  profileId: idSchema,
  format: z.enum(["long", "short"]),
  projectName: z.string(),
  targetLanguage: z.string(),
  targetDuration: z.string(),
  updatedAt: z.string(),
  currentStageId: idSchema.optional(),
  currentStageStatus: z.string().optional(),
  progressPercent: z.number().int().min(0).max(100).optional()
});

const timelineItemResponseSchema = timelineItemOutputSchema;
const stageAttentionActionResponseSchema = z.object({ label: z.string().min(1), route: z.string().min(1).optional() }).strict();
const stageAttentionResponseSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  phase: z.string().min(1),
  safeReason: z.string().min(1),
  failedItem: z.string().min(1).optional(),
  recommendedAction: z.string().min(1),
  retryAction: z.string().min(1),
  settingsRoute: z.string().min(1).optional(),
  actions: z.array(stageAttentionActionResponseSchema)
}).strict();

export const factoryProjectResponseSchema = z.object({
  id: idSchema,
  topic: z.string(),
  format: z.enum(["long", "short"]),
  targetLanguage: z.string(),
  setup: z.object({ visualWorkflow: z.enum(["legacy", "character_first"]).optional(), characterVersionId: idSchema.optional() }).passthrough().optional(),
  profileId: idSchema,
  routeDecision: channelRouteDecisionResponseSchema,
  stages: z.array(z.object({ id: idSchema, name: z.string(), status: z.string(), dependsOn: z.array(idSchema), attention: stageAttentionResponseSchema.optional() })),
  ideas: z.array(z.object({ id: idSchema }).passthrough()),
  claims: z.array(z.object({ id: idSchema }).passthrough()),
  scriptSections: z.array(z.object({ id: idSchema }).passthrough()),
  scenes: z.array(
    z.object({
      id: idSchema,
      scriptSectionId: idSchema,
      startFrame: frameSchema,
      durationFrames: frameSchema
    }).passthrough()
  ),
  shots: z.array(
    z.object({
      id: idSchema,
      sceneId: idSchema,
      startFrame: frameSchema,
      durationFrames: frameSchema,
      fps: z.number().int().positive()
    }).passthrough()
  ),
  assetConcepts: z.array(assetConceptSchema).optional(),
  timeline: z.object({
    fps: z.number().int().positive(),
    items: z.array(timelineItemResponseSchema)
  })
}).passthrough();

export const projectListResponseSchema = z.array(projectSummaryResponseSchema);
export const nullableFactoryProjectResponseSchema = factoryProjectResponseSchema.nullable();
export const okResponseSchema = z.object({ ok: z.boolean() });
export const providerCredentialSavedResponseSchema = z.object({ providerId: idSchema, credentialRef: idSchema });
export const providerCredentialPresenceResponseSchema = z.object({ providerId: idSchema, hasCredential: z.boolean() });
export const providerCredentialDeletedResponseSchema = z.object({ providerId: idSchema, deleted: z.boolean() });
export const providerCredentialSettingsResponseSchema = z.object({
  providerId: idSchema,
  baseUrl: z.string(),
  textModel: z.string().optional(),
  imageModel: z.string().optional(),
  videoModel: z.string().optional(),
  ttsModel: z.string().optional(),
  sttModel: z.string().optional(),
  hasCredential: z.boolean()
});
export const localTtsSettingsResponseSchema = localTtsSettingsSchema.extend({
  available: z.boolean(),
  resolvedBinPath: z.string()
});
export const localTtsGeneratedResponseSchema = z.object({
  ok: z.boolean(),
  outputPath: z.string(),
  provider: localTtsProviderSchema
});
export const nineRouterModelListResponseSchema = z.object({
  status: modelListStatusSchema,
  models: z.array(z.object({ id: modelIdSchema })),
  message: z.string().max(500)
}).strict();

export const competitorReferenceResponseSchema = z.object({
  id: idSchema,
  identityKey: z.string().max(300).optional(),
  sourceUrl: z.string().max(1000).optional(),
  pastedTranscript: z.string(),
  notes: z.string().optional(),
  status: referenceStatusSchema.optional(),
  included: z.boolean().optional(),
  validationMessage: z.string().optional(),
  validationErrors: z.array(z.string()).optional(),
  validationWarnings: z.array(z.string()).optional(),
  validatedAt: z.string().optional(),
  validatorVersion: z.string().optional(),
  contentFingerprint: z.string().length(64).optional(),
  version: z.number().int().positive().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  parentReferenceId: idSchema.optional()
}).passthrough();

export const addCompetitorReferenceResponseSchema = z.object({
  status: z.enum(["saved", "duplicate"]),
  duplicate: z.literal(true).optional(),
  project: factoryProjectResponseSchema,
  existingReference: competitorReferenceResponseSchema.optional(),
  existingReferenceId: idSchema.optional(),
  existingCurrentVersionId: idSchema.optional(),
  canonicalSourceId: z.string().max(300).optional(),
  message: z.string().max(500)
}).strict();

export const textCertificationTestResultSchema = z.object({
  status: z.enum(["passed", "failed"]),
  latencyMs: z.number().int().nonnegative(),
  errorCategory: textCertificationErrorCategorySchema.optional(),
  skipped: z.boolean().optional(),
  redactedPreview: z.string().max(2000).optional()
}).strict();

export const textCertificationJsonPayloadSchema = z.object({
  status: z.literal("MODEL_OK")
}).strict();

export const textModelCertificationRecordSchema = z.object({
  id: idSchema,
  providerId: z.enum(["9router", "cockpit"]),
  configuredModelId: modelIdSchema,
  returnedModelId: modelIdSchema.optional(),
  baseUrlFingerprint: z.string().length(64).regex(/^[a-f0-9]+$/),
  credentialVersionRef: idSchema.optional(),
  endpointStrategy: z.literal("responses"),
  implementationVersion: z.enum(["text-certification-v1", "text-capability-v1"]),
  exactTextTest: textCertificationTestResultSchema,
  strictJsonTest: textCertificationTestResultSchema,
  overallStatus: z.enum(["verified", "failed", "stale"]),
  testedAt: z.string()
}).strict();

export const textModelCertificationResponseSchema = z.object({
  status: textModelCertificationStatusSchema,
  record: textModelCertificationRecordSchema.optional(),
  message: z.string().max(500),
  errorCategory: textCertificationErrorCategorySchema.optional()
}).strict();

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type SaveProviderCredentialRequest = z.infer<typeof saveProviderCredentialRequestSchema>;
export type LocalTtsSettings = z.infer<typeof localTtsSettingsSchema>;
export type GenerateLocalTtsRequest = z.infer<typeof generateLocalTtsRequestSchema>;
export type ModelListStatus = z.infer<typeof modelListStatusSchema>;
export type Save9RouterModelConfigurationRequest = z.infer<typeof save9RouterModelConfigurationRequestSchema>;
export type SaveCockpitTextModelConfigurationRequest = z.infer<typeof saveCockpitTextModelConfigurationRequestSchema>;
export type TextCertificationErrorCategory = z.infer<typeof textCertificationErrorCategorySchema>;
export type TextModelCertificationStatus = z.infer<typeof textModelCertificationStatusSchema>;
export type TextModelCertificationRecord = z.infer<typeof textModelCertificationRecordSchema>;
export type CleanedTranscriptOutput = z.infer<typeof cleanedTranscriptOutputSchema>;
export type ReferenceSegmentationOutput = z.infer<typeof referenceSegmentationOutputSchema>;
export type TranscriptCleaningArtifactResponse = z.infer<typeof transcriptCleaningArtifactResponseSchema>;
export type ReferenceSegmentationArtifactResponse = z.infer<typeof referenceSegmentationArtifactResponseSchema>;
export type CompetitorDnaOutput = z.infer<typeof competitorDnaOutputSchema>;
export type WorkflowRunResponse = z.infer<typeof workflowRunResponseSchema>;
