import { z } from "zod";

const idSchema = z.string().min(1).max(160).regex(/^[A-Za-z0-9._:-]+$/);
const modelIdSchema = z.string().min(1).max(300);
const frameSchema = z.number().int().nonnegative();
const safePathSchema = z.string().min(1).refine((value) => !value.includes("..") && !/[<>|?*\u0000-\u001F]/.test(value), {
  message: "Path contains unsafe characters or traversal."
});
const localPathSchema = z.string().max(1000).refine((value) => !/[\u0000-\u001F]/.test(value), {
  message: "Path contains control characters."
});

export const workflowStageStatusSchema = z.enum([
  "not_started",
  "blocked",
  "ready",
  "queued",
  "running",
  "needs_review",
  "approved",
  "rejected",
  "failed",
  "stale"
]);

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
  format: z.enum(["long", "short"]).default("long"),
  targetLanguage: z.string().min(1).max(80).default("English"),
  targetDuration: z.string().min(1).max(120).optional(),
  projectName: z.string().min(1).max(120).optional(),
  workflowMode: z.enum(["guided", "semi_automatic", "full_automatic"]).default("guided"),
  competitorReference: z.object({
    sourceUrl: z.string().max(1000).optional(),
    pastedTranscript: z.string().min(1).max(200000),
    notes: z.string().max(5000).optional()
  }).optional()
});

export const projectIdRequestSchema = z.object({
  projectId: idSchema
});

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

export const localTtsSettingsSchema = z.object({
  omnivoiceBinPath: localPathSchema,
  outputDir: localPathSchema,
  modelPath: z.string().max(1000).optional(),
  language: z.string().max(80).optional(),
  instruct: z.string().max(500).optional()
});

export const generateLocalTtsRequestSchema = z.object({
  projectId: idSchema,
  text: z.string().min(1).max(12000),
  outputName: z.string().min(1).max(160).regex(/^[A-Za-z0-9._-]+$/).optional()
});

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

export const runTranscriptCleaningRequestSchema = z.object({
  projectId: idSchema,
  referenceId: idSchema
}).strict();

export const transcriptCleaningArtifactRequestSchema = runTranscriptCleaningRequestSchema;
export const runReferenceSegmentationRequestSchema = runTranscriptCleaningRequestSchema;
export const referenceSegmentationArtifactRequestSchema = runTranscriptCleaningRequestSchema;

export const cleanedTranscriptOutputSchema = z.object({
  referenceId: idSchema,
  sourceTranscriptVersionId: idSchema,
  cleanedTranscript: z.string().min(1).max(200000),
  removedSegments: z.array(z.object({
    text: z.string().min(1).max(20000),
    reason: z.enum(["timestamp", "duplicate_caption", "formatting_noise", "empty_fragment"])
  })).max(10000),
  flaggedSegments: z.array(z.object({
    text: z.string().min(1).max(20000),
    reason: z.enum(["unclear_audio", "possible_transcription_error", "language_mismatch"])
  })).max(10000),
  sourceCharacterCount: z.number().int().nonnegative(),
  cleanedCharacterCount: z.number().int().nonnegative()
}).strict();

export const referenceSegmentationOutputSchema = z.object({
  referenceId: idSchema,
  segments: z.array(z.object({
    id: idSchema,
    order: z.number().int().nonnegative(),
    startCharacter: z.number().int().nonnegative(),
    endCharacter: z.number().int().nonnegative(),
    type: z.enum(["hook", "promise", "context", "problem", "conflict", "evidence", "example", "reveal", "payoff", "cta", "other"]),
    text: z.string().min(1).max(200000),
    function: z.string().min(1).max(2000)
  })).min(1).max(10000)
}).strict();

export const transcriptCleaningArtifactResponseSchema = z.object({
  id: idSchema,
  stageRunId: idSchema.optional(),
  status: z.enum(["draft", "needs_review", "approved", "rejected", "stale"]),
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
  status: z.enum(["draft", "needs_review", "approved", "rejected", "stale"]),
  payloadJson: referenceSegmentationOutputSchema,
  createdAt: z.string(),
  updatedAt: z.string()
}).strict();

export const referenceSegmentationArtifactsResponseSchema = z.array(referenceSegmentationArtifactResponseSchema);

const evidenceSegmentIdsSchema = z.array(idSchema).min(1).max(1000);
export const competitorDnaOutputSchema = z.object({
  referenceId: idSchema,
  hookPattern: z.object({ abstraction: z.string().min(1).max(2000), evidenceSegmentIds: evidenceSegmentIdsSchema }).strict(),
  promisePattern: z.object({ abstraction: z.string().min(1).max(2000), evidenceSegmentIds: evidenceSegmentIdsSchema }).strict(),
  pacingPattern: z.object({ description: z.string().min(1).max(2000), evidenceSegmentIds: evidenceSegmentIdsSchema }).strict(),
  proofPattern: z.object({ description: z.string().min(1).max(2000), evidenceSegmentIds: evidenceSegmentIdsSchema }).strict(),
  emotionalArc: z.array(z.object({ phase: z.string().min(1).max(500), emotion: z.string().min(1).max(500), evidenceSegmentIds: evidenceSegmentIdsSchema }).strict()).max(100),
  retentionDevices: z.array(z.object({ abstraction: z.string().min(1).max(2000), evidenceSegmentIds: evidenceSegmentIdsSchema }).strict()).max(100),
  visualOpportunities: z.array(z.object({ abstraction: z.string().min(1).max(2000), evidenceSegmentIds: evidenceSegmentIdsSchema }).strict()).max(100),
  reusablePrinciples: z.array(z.string().min(1).max(1000)).max(100),
  forbiddenToCopy: z.array(z.object({ element: z.string().min(1).max(1000), reason: z.string().min(1).max(1000) }).strict()).max(100),
  uncertainties: z.array(z.string().min(1).max(1000)).max(100)
}).strict();

export const runCompetitorDnaRequestSchema = runTranscriptCleaningRequestSchema;
export const competitorDnaArtifactRequestSchema = runTranscriptCleaningRequestSchema;
export const competitorDnaArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: z.enum(["draft", "needs_review", "approved", "rejected", "stale"]), payloadJson: competitorDnaOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const competitorDnaArtifactsResponseSchema = z.array(competitorDnaArtifactResponseSchema);

const opportunityItemSchema = z.object({ text: z.string().min(1).max(2000), sourceReferenceIds: z.array(idSchema).min(1).max(100), sourceArtifactIds: z.array(idSchema).min(1).max(100), confidence: z.enum(["low", "medium", "high"]) }).strict();
export const opportunityMapOutputSchema = z.object({ sharedPatterns: z.array(opportunityItemSchema).max(100), overusedPatterns: z.array(opportunityItemSchema).max(100), underservedViewerQuestions: z.array(opportunityItemSchema).max(100), evidenceGaps: z.array(opportunityItemSchema).max(100), differentiationDirections: z.array(opportunityItemSchema).max(100), riskyDirections: z.array(opportunityItemSchema).max(100), recommendedContentSpaces: z.array(opportunityItemSchema).max(100) }).strict();
export const opportunityMapRequestSchema = z.object({ projectId: idSchema }).strict();
export const opportunityMapArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: z.enum(["draft", "needs_review", "approved", "rejected", "stale"]), payloadJson: opportunityMapOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const ideaCandidateOutputSchema = z.object({ id: idSchema, workingTitle: z.string().min(1).max(300), angle: z.string().min(1).max(2000), corePromise: z.string().min(1).max(1000), viewerProblem: z.string().min(1).max(1000), dramaticQuestion: z.string().min(1).max(1000), targetEmotion: z.string().min(1).max(300), trafficModel: z.enum(["browse", "suggested", "search", "mixed"]), thumbnailConcept: z.string().min(1).max(1000), noveltyExplanation: z.string().min(1).max(1000), noveltyScore: z.number().min(0).max(100), audienceFitScore: z.number().min(0).max(100), thumbnailPotentialScore: z.number().min(0).max(100), researchRisk: z.enum(["low", "medium", "high"]), productionDifficulty: z.enum(["low", "medium", "high"]), repurposePotential: z.array(z.string().min(1).max(300)).max(20), whyThisCanWin: z.string().min(1).max(1000) }).strict();
export const ideaLabOutputSchema = z.object({ candidates: z.array(ideaCandidateOutputSchema).length(12) }).strict().superRefine((value, context) => {
  const riskCounts = value.candidates.reduce<Record<string, number>>((counts, candidate) => ({ ...counts, [candidate.researchRisk]: (counts[candidate.researchRisk] ?? 0) + 1 }), {});
  if (riskCounts.low !== 4 || riskCounts.medium !== 4 || riskCounts.high !== 4) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Idea Lab requires four candidates in each research-risk bucket." });
  }
  if (new Set(value.candidates.map((candidate) => candidate.id)).size !== value.candidates.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Idea Lab candidates must have unique IDs." });
  }
});
export const ideaLabRequestSchema = z.object({ projectId: idSchema }).strict();
export const approveIdeaRequestSchema = z.object({ projectId: idSchema, ideaId: idSchema }).strict();
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
  competitorDnaArtifactIds: z.array(idSchema).min(1).max(100)
}).strict();
export const originalityReviewRequestSchema = z.object({ projectId: idSchema }).strict();
export const originalityReviewArtifactResponseSchema = z.object({
  id: idSchema,
  stageRunId: idSchema.optional(),
  status: z.enum(["draft", "needs_review", "approved", "rejected", "stale"]),
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
export const researchSourcesArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: z.enum(["draft", "needs_review", "approved", "rejected", "stale"]), payloadJson: researchSourcesOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
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
export const claimMapArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: z.enum(["draft", "needs_review", "approved", "rejected", "stale"]), payloadJson: claimMapOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const claimMapArtifactsResponseSchema = z.array(claimMapArtifactResponseSchema);
export const outlineSectionSchema = z.object({ id: idSchema, order: z.number().int().nonnegative(), purpose: z.string().min(1).max(1000), keyPoint: z.string().min(1).max(3000), linkedClaimIds: z.array(idSchema).min(1).max(100), dramaticFunction: z.string().min(1).max(1000), estimatedSeconds: z.number().int().positive().max(7200), openLoop: z.string().max(1000).optional(), proofObjects: z.array(z.string().min(1).max(1000)).max(50) }).strict();
export const outlineOutputSchema = z.object({ sections: z.array(outlineSectionSchema).min(1).max(100) }).strict();
export const outlineRequestSchema = z.object({ projectId: idSchema }).strict();
export const outlineArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: z.enum(["draft", "needs_review", "approved", "rejected", "stale"]), payloadJson: outlineOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const outlineArtifactsResponseSchema = z.array(outlineArtifactResponseSchema);
export const scriptSectionOutputSchema = z.object({ id: idSchema, outlineSectionId: idSchema, purpose: z.string().min(1).max(1000), narration: z.string().min(1).max(20000), estimatedWords: z.number().int().positive().max(10000), estimatedSeconds: z.number().int().positive().max(7200), linkedClaimIds: z.array(idSchema).min(1).max(100), dramaticFunction: z.string().min(1).max(1000), openLoop: z.string().max(1000).optional(), visualOpportunities: z.array(z.string().min(1).max(1000)).max(50), proofObjects: z.array(z.string().min(1).max(1000)).max(50), retentionRisk: z.enum(["low", "medium", "high"]) }).strict();
export const scriptOutputSchema = z.object({ sections: z.array(scriptSectionOutputSchema).min(1).max(100) }).strict();
export const scriptRequestSchema = z.object({ projectId: idSchema }).strict();
export const scriptArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: z.enum(["draft", "needs_review", "approved", "rejected", "stale"]), payloadJson: scriptOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const scriptArtifactsResponseSchema = z.array(scriptArtifactResponseSchema);
export const factReviewFindingSchema = z.object({ claimId: idSchema, verdict: z.enum(["supported", "needs_qualification", "blocked"]), reason: z.string().min(1).max(2000) }).strict();
export const factReviewOutputSchema = z.object({ reviewer: z.literal("local_deterministic"), findings: z.array(factReviewFindingSchema).min(1).max(100) }).strict();
export const factReviewRequestSchema = z.object({ projectId: idSchema }).strict();
export const factReviewArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: z.enum(["draft", "needs_review", "approved", "rejected", "stale"]), payloadJson: factReviewOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const factReviewArtifactsResponseSchema = z.array(factReviewArtifactResponseSchema);
export const retentionReviewFindingSchema = z.object({ sectionId: idSchema, severity: z.enum(["low", "medium", "high"]), reason: z.string().min(1).max(2000), recommendedChange: z.string().min(1).max(2000) }).strict();
export const retentionReviewOutputSchema = z.object({ overallVerdict: z.enum(["pass", "needs_changes", "blocked"]), findings: z.array(retentionReviewFindingSchema).max(100) }).strict();
export const retentionReviewRequestSchema = z.object({ projectId: idSchema }).strict();
export const retentionReviewArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: z.enum(["draft", "needs_review", "approved", "rejected", "stale"]), payloadJson: retentionReviewOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const retentionReviewArtifactsResponseSchema = z.array(retentionReviewArtifactResponseSchema);
export const scenePlanSceneSchema = z.object({ id: idSchema, scriptSectionId: idSchema, narration: z.string().min(1).max(20000), purpose: z.string().min(1).max(2000), startFrame: z.number().int().nonnegative(), durationFrames: z.number().int().positive(), visualMode: z.enum(["ai_image", "ai_video", "stock_image", "stock_video", "uploaded", "document", "diagram", "text_card", "reuse"]), proofObject: z.string().min(1).max(1000).optional(), emotionalState: z.string().min(1).max(1000), requiredAssets: z.array(z.string().min(1).max(1000)).max(50), continuityRefs: z.array(z.string().min(1).max(1000)).max(50) }).strict();
export const scenePlanOutputSchema = z.object({ fps: z.number().int().positive().max(120), scenes: z.array(scenePlanSceneSchema).min(1).max(200) }).strict();
export const scenePlanRequestSchema = z.object({ projectId: idSchema }).strict();
export const scenePlanArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: z.enum(["draft", "needs_review", "approved", "rejected", "stale"]), payloadJson: scenePlanOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const scenePlanArtifactsResponseSchema = z.array(scenePlanArtifactResponseSchema);
export const shotPlanShotSchema = z.object({ id: idSchema, sceneId: idSchema, order: z.number().int().nonnegative(), startFrame: z.number().int().nonnegative(), durationFrames: z.number().int().positive(), fps: z.number().int().positive().max(120), purpose: z.string().min(1).max(2000), visualMode: z.enum(["ai_image", "ai_video", "stock_image", "stock_video", "uploaded", "document", "diagram", "text_card", "reuse"]), framing: z.string().min(1).max(1000), cameraAngle: z.string().min(1).max(1000), cameraMovement: z.string().min(1).max(1000), subjectAction: z.string().min(1).max(2000), startState: z.record(z.string(), z.unknown()), endState: z.record(z.string(), z.unknown()), continuityRefs: z.array(z.string().min(1).max(1000)).max(50) }).strict();
export const shotPlanOutputSchema = z.object({ shots: z.array(shotPlanShotSchema).min(1).max(500) }).strict();
export const shotPlanRequestSchema = z.object({ projectId: idSchema }).strict();
export const shotPlanArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: z.enum(["draft", "needs_review", "approved", "rejected", "stale"]), payloadJson: shotPlanOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const shotPlanArtifactsResponseSchema = z.array(shotPlanArtifactResponseSchema);
export const visualRoutingOutputSchema = z.object({ shots: z.array(shotPlanShotSchema).min(1).max(500) }).strict();
export const visualRoutingRequestSchema = z.object({ projectId: idSchema }).strict();
export const visualRoutingArtifactResponseSchema = z.object({ id: idSchema, stageRunId: idSchema.optional(), status: z.enum(["draft", "needs_review", "approved", "rejected", "stale"]), payloadJson: visualRoutingOutputSchema, createdAt: z.string(), updatedAt: z.string() }).strict();
export const visualRoutingArtifactsResponseSchema = z.array(visualRoutingArtifactResponseSchema);
export const editVisualRoutingRequestSchema = z.object({ projectId: idSchema, artifactId: idSchema, shotId: idSchema, visualMode: shotPlanShotSchema.shape.visualMode }).strict();

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
  updatedAt: z.string()
});

const timelineItemResponseSchema = z.object({
  id: idSchema,
  track: z.enum(["primary_visual", "overlay_visual", "narration", "music", "sfx", "subtitles", "text", "markers"]),
  sourceId: idSchema,
  startFrame: frameSchema,
  durationFrames: frameSchema,
  fps: z.number().int().positive()
});

export const factoryProjectResponseSchema = z.object({
  id: idSchema,
  topic: z.string(),
  format: z.enum(["long", "short"]),
  targetLanguage: z.string(),
  profileId: idSchema,
  routeDecision: channelRouteDecisionResponseSchema,
  stages: z.array(z.object({ id: idSchema, name: z.string(), status: z.string(), dependsOn: z.array(idSchema) })),
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
  provider: z.literal("omnivoice-local")
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
  version: z.number().int().positive().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  parentReferenceId: idSchema.optional()
}).passthrough();

export const addCompetitorReferenceResponseSchema = z.object({
  status: z.enum(["saved", "duplicate"]),
  project: factoryProjectResponseSchema,
  existingReference: competitorReferenceResponseSchema.optional(),
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
  providerId: z.literal("9router"),
  configuredModelId: modelIdSchema,
  returnedModelId: modelIdSchema.optional(),
  baseUrlFingerprint: z.string().length(64).regex(/^[a-f0-9]+$/),
  credentialVersionRef: idSchema.optional(),
  endpointStrategy: z.literal("responses"),
  implementationVersion: z.literal("text-certification-v1"),
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
export type TextCertificationErrorCategory = z.infer<typeof textCertificationErrorCategorySchema>;
export type TextModelCertificationStatus = z.infer<typeof textModelCertificationStatusSchema>;
export type TextModelCertificationRecord = z.infer<typeof textModelCertificationRecordSchema>;
export type CleanedTranscriptOutput = z.infer<typeof cleanedTranscriptOutputSchema>;
export type ReferenceSegmentationOutput = z.infer<typeof referenceSegmentationOutputSchema>;
export type TranscriptCleaningArtifactResponse = z.infer<typeof transcriptCleaningArtifactResponseSchema>;
export type ReferenceSegmentationArtifactResponse = z.infer<typeof referenceSegmentationArtifactResponseSchema>;
export type CompetitorDnaOutput = z.infer<typeof competitorDnaOutputSchema>;
