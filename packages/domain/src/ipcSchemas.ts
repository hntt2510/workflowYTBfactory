import { z } from "zod";

const idSchema = z.string().min(1).max(160).regex(/^[A-Za-z0-9._:-]+$/);
const frameSchema = z.number().int().nonnegative();
const safePathSchema = z.string().min(1).refine((value) => !value.includes("..") && !/[<>|?*\u0000-\u001F]/.test(value), {
  message: "Path contains unsafe characters or traversal."
});
const localPathSchema = z.string().max(1000).refine((value) => !/[\u0000-\u001F]/.test(value), {
  message: "Path contains control characters."
});

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

export const listNineRouterModelsRequestSchema = z.object({
  providerId: z.literal("9router").optional()
});

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
  models: z.array(z.object({ id: z.string().min(1).max(300) })),
  message: z.string().max(500)
}).strict();

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export type SaveProviderCredentialRequest = z.infer<typeof saveProviderCredentialRequestSchema>;
export type LocalTtsSettings = z.infer<typeof localTtsSettingsSchema>;
export type GenerateLocalTtsRequest = z.infer<typeof generateLocalTtsRequestSchema>;
export type ModelListStatus = z.infer<typeof modelListStatusSchema>;
