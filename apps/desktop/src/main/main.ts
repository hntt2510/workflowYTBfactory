import { app, BrowserWindow, dialog, ipcMain as electronIpcMain, protocol } from "electron";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  AppSettingsStore,
  createKeytarKeychain,
  MemoryKeychain,
  ProjectRepository,
  ProviderCredentialStore,
  TextCertificationStore,
  ImageCertificationStore,
  GenerationJobStore,
  TtsJobStore,
  WorkflowRunStore,
  JsonLogger,
  openFactoryDatabase
} from "@lsf/db";
import {
  createProjectRequestSchema,
  createFixtureProject,
  addCompetitorReferenceRequestSchema,
  addCompetitorReferenceResponseSchema,
  factoryProjectResponseSchema,
  channelRouteDecisionResponseSchema,
  editCompetitorReferenceRequestSchema,
  evaluateReferenceSet,
  findDuplicateReference,
  normalizeProjectStages,
  normalizeReferenceIdentity,
  referenceValidationVersion,
  nullableFactoryProjectResponseSchema,
  okResponseSchema,
  generateLocalTtsRequestSchema,
  devVoiceTestRequestSchema,
  devVoiceTestResponseSchema,
  listNineRouterTtsCatalogRequestSchema,
  nineRouterTtsCatalogResponseSchema,
  listTtsProvidersRequestSchema,
  listTtsProvidersResponseSchema,
  runTtsProviderHealthCheckRequestSchema,
  runTtsProviderHealthCheckResponseSchema,
  ttsPreviewRequestSchema,
  ttsPreviewResponseSchema,
  createTtsJobRequestSchema,
  ttsJobResponseSchema,
  nullableTtsJobResponseSchema,
  ttsJobIdRequestSchema,
  retryTtsJobSegmentRequestSchema,
  devCapcutTestRequestSchema,
  devCapcutTestResponseSchema,
  devIdeaTestRequestSchema,
  devIdeaTestResponseSchema,
  devImageTestRequestSchema,
  devImageTestResponseSchema,
  devStockTestRequestSchema,
  devStockTestResponseSchema,
  listNineRouterModelsRequestSchema,
  localTtsGeneratedResponseSchema,
  localTtsSettingsResponseSchema,
  localTtsSettingsSchema,
  localTtsReferenceAudioResponseSchema,
  nineRouterModelListResponseSchema,
  projectIdRequestSchema,
  productionPreparationRequestSchema,
  productionIdeaSelectionRequestSchema,
  productionSceneRetryRequestSchema,
  projectListResponseSchema,
  providerCredentialDeletedResponseSchema,
  providerCredentialPresenceResponseSchema,
  providerCredentialSettingsResponseSchema,
  providerCredentialSavedResponseSchema,
  referenceIdRequestSchema,
  referenceValidationArtifactResponseSchema,
  referenceSetRequestSchema,
  referenceChangeImpactResponseSchema,
  runTranscriptCleaningRequestSchema,
  workflowRunListRequestSchema,
  workflowRunsResponseSchema,
  stageAttentionRequestSchema,
  transcriptCleaningArtifactRequestSchema,
  transcriptCleaningArtifactResponseSchema,
  transcriptCleaningArtifactsResponseSchema,
  runReferenceSegmentationRequestSchema,
  cleanedTranscriptOutputSchema,
  referenceSegmentationOutputSchema,
  referenceSegmentationArtifactRequestSchema,
  referenceSegmentationArtifactsResponseSchema,
  runCompetitorDnaRequestSchema,
  competitorDnaArtifactRequestSchema,
  competitorDnaArtifactsResponseSchema,
  opportunityMapRequestSchema,
  opportunityMapOutputSchema,
  opportunityMapArtifactResponseSchema,
  ideaLabOutputSchema,
  ideaLabRequestSchema,
  approveIdeaRequestSchema,
  originalityReviewRequestSchema,
  originalityReviewOutputSchema,
  originalityReviewArtifactResponseSchema,
  originalityReviewArtifactsResponseSchema,
  competitorDnaOutputSchema,
  saveResearchSourcesRequestSchema,
  researchSourceSearchRequestSchema,
  researchSourcesRequestSchema,
  researchSourcesArtifactsResponseSchema,
  claimMapRequestSchema,
  claimMapArtifactResponseSchema,
  claimMapArtifactsResponseSchema,
  researchSourcesOutputSchema,
  claimMapOutputSchema,
  outlineRequestSchema,
  outlineOutputSchema,
  outlineArtifactsResponseSchema,
  scriptRequestSchema,
  scriptOutputSchema,
  scriptArtifactsResponseSchema,
  factReviewRequestSchema,
  factReviewOutputSchema,
  factReviewArtifactsResponseSchema,
  retentionReviewRequestSchema,
  retentionReviewOutputSchema,
  retentionReviewArtifactsResponseSchema,
  scenePlanRequestSchema,
  scenePlanOutputSchema,
  scenePlanArtifactsResponseSchema,
  shotPlanRequestSchema,
  shotPlanOutputSchema,
  shotPlanArtifactsResponseSchema,
  visualRoutingRequestSchema,
  visualRoutingOutputSchema,
  visualRoutingArtifactsResponseSchema,
  editVisualRoutingRequestSchema,
  sceneReviewRevisionRequestSchema,
  assetPreviewMediaRequestSchema,
  promptPreparationRequestSchema,
  promptPreparationOutputSchema,
  promptPreparationArtifactsResponseSchema,
  assetAcquisitionRequestSchema,
  assetAcquisitionOutputSchema,
  assetAcquisitionArtifactsResponseSchema,
  acquiredImageAssetSchema,
  assetReviewRequestSchema,
  assetReviewOutputSchema,
  assetReviewArtifactsResponseSchema,
  reviseAssetReviewRequestSchema, manualAssetUploadRequestSchema,
  voiceGenerationRequestSchema,
  voiceGenerationOutputSchema,
  voiceGenerationArtifactsResponseSchema,
  subtitlePreparationRequestSchema,
  subtitlePreparationOutputSchema,
  subtitlePreparationArtifactsResponseSchema,
  timelineAssemblyRequestSchema,
  timelineAssemblyOutputSchema,
  timelineAssemblyArtifactsResponseSchema,
  previewRenderRequestSchema,
  previewMediaRequestSchema,
  previewMediaUrlResponseSchema,
  previewRenderOutputSchema,
  previewRenderArtifactsResponseSchema,
  qaRequestSchema,
  qaOutputSchema,
  qaArtifactsResponseSchema,
  capcutDraftRequestSchema,
  capcutDraftApprovalRequestSchema,
  capcutDraftOutputSchema,
  capcutDraftArtifactsResponseSchema,
  packagingExportRequestSchema,
  packagingExportOutputSchema,
  packagingExportArtifactsResponseSchema,
  applyVisualRouting,
  replaceCompetitorReferenceRequestSchema,
  providerIdRequestSchema,
  routeChannelProfile,
  getWorkflowStageDefinition,
  getDownstreamWorkflowStageIds,
  getWorkflowStageImpactIds,
  perReferenceArtifactStages,
  run9RouterTextCertificationRequestSchema,
  run9RouterImageCertificationRequestSchema,
  save9RouterModelConfigurationRequestSchema,
  saveProviderCredentialRequestSchema,
  setReferenceIncludedRequestSchema,
  seedChannelProfiles,
  textModelCertificationResponseSchema,
  validateReference,
  assertWorkflowStageTransition,
  reviewOriginality,
  reviewFacts,
  channelRouteInputSchema,
  prepareExistingScript
} from "@lsf/domain";
import type { CompetitorReference, FactoryProject, ReferenceSetState, StageAttention, WorkflowArtifact, WorkflowStageStatus } from "@lsf/domain";
import { PersistentGenerationQueue } from "@lsf/generation-queue";
import { NineRouterClient } from "@lsf/providers";
import { listNineRouterModels } from "./nineRouterModelService";
import { loadNineRouterTextCertification, runNineRouterTextCertification } from "./nineRouterTextCertificationService";
import { defaultPerChunkTimeoutMs, runTranscriptCleaning, TranscriptCleaningError, transcriptCleaningPromptTemplateId, transcriptCleaningPromptVersion, transcriptCleaningRunnerVersion } from "./transcriptCleaningService";
import { runReferenceSegmentation, ReferenceSegmentationError } from "./referenceSegmentationService";
import { competitorDnaRunnerVersion, runCompetitorDna, CompetitorDnaError } from "./competitorDnaService";
import { runOpportunityMap, OpportunityMapError } from "./opportunityMapService";
import { runIdeaLab, IdeaLabError } from "./ideaLabService";
import { namespaceClaimMapOutput, runClaimMap, ClaimMapError } from "./claimMapService";
import { runOutline, OutlineError } from "./outlineService";
import { runScript, ScriptError } from "./scriptService";
import { runRetentionReview, RetentionReviewError } from "./retentionReviewService";
import { runScenePlan, ScenePlanError } from "./scenePlanService";
import { runPromptPreparation, PromptPreparationError } from "./promptPreparationService";
import { runShotPlan, ShotPlanError } from "./shotPlanService";
import { acquireImageAsset, AssetAcquisitionError, importLocalImageAsset, planAssetAcquisition, type AcquiredImageAsset } from "./assetAcquisitionService";
import { loadNineRouterImageCertification, runNineRouterImageCertification } from "./nineRouterImageCertificationService";
import { buildResearchSearchQuery, ResearchSourceSearchError, runResearchSourceSearch } from "./researchSourceSearchService";
import { getPreviewFileSha256, PreviewRenderError, renderPreview } from "./previewRenderService";
import { CapCutDraftError, runCapCutDraftBridge } from "./capcutDraftService";
import { packagingExportRequiredStageIds, verifyPackagingManifest } from "./packagingExportService";
import { selectCurrentBackedApprovedArtifacts } from "./workflowArtifactSelection";
import { qaFindingsBlockApproval } from "./qaApprovalGate";
import { factReviewFindingsBlockApproval, retentionReviewBlocksApproval } from "./reviewApprovalGate";
import { listNineRouterTtsCatalog as discoverNineRouterTtsCatalog } from "./nineRouterTtsService";
import { TtsJobService, type TtsJobView } from "./ttsJobService";
import { TtsManager, type TtsProviderId } from "./ttsManager";
import { TtsWorkerClient } from "./ttsWorkerService";
import { createProductionOrchestrator } from "./productionOrchestrator";

type InternalIpcHandler = (...args: never[]) => unknown;
const internalIpcHandlers = new Map<string, InternalIpcHandler>();
const ipcMain = {
  handle(channel: string, listener: InternalIpcHandler) {
    internalIpcHandlers.set(channel, listener);
    return electronIpcMain.handle(channel, listener as never);
  }
};

protocol.registerSchemesAsPrivileged([
  { scheme: "lsf-audio", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  { scheme: "lsf-media", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

if (process.env.ELECTRON_REMOTE_DEBUGGING_PORT) {
  app.commandLine.appendSwitch("remote-debugging-port", process.env.ELECTRON_REMOTE_DEBUGGING_PORT);
}

const workspaceRoot = process.env.WORKSPACE_ROOT ?? join(process.cwd(), "workspace");
const currentDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(currentDir, "../../../..");
const databasePath = join(workspaceRoot, "long-short-factory.sqlite");
if (process.env.LSF_E2E_UI_REPORT_PATH) {
  writeFileSync(
    process.env.LSF_E2E_UI_REPORT_PATH,
    JSON.stringify({ ok: false, mode: process.env.LSF_E2E_UI_MODE ?? "create", phase: "main_loaded", workspaceRoot, databasePath }, null, 2)
  );
}
const db = openFactoryDatabase(databasePath);
const projectRepository = new ProjectRepository(db);
const appSettingsStore = new AppSettingsStore(db);
const textCertificationStore = new TextCertificationStore(db);
const imageCertificationStore = new ImageCertificationStore(db);
const workflowRunStore = new WorkflowRunStore(db);
const productionOrchestrator = createProductionOrchestrator({
  loadProject: async (projectId) => projectRepository.loadProject(projectId) ?? null,
  invoke: async <T>(channel: string, input: Record<string, unknown>) => {
    const handler = internalIpcHandlers.get(channel);
    if (!handler) throw new Error(`Production stage handler is unavailable: ${channel}`);
    return await (handler as (event: unknown, input?: unknown) => unknown)(undefined, input) as T;
  }
});
const generationJobStore = new GenerationJobStore(db);
const ttsJobStore = new TtsJobStore(db);
const interruptedRuns = workflowRunStore.recoverInterruptedRuns();
for (const run of interruptedRuns) {
  const project = projectRepository.loadProject(run.projectId);
  const stage = project?.stages.find((item) => item.id === run.stageId);
  if (project && stage && (stage.status === "queued" || stage.status === "running")) {
    const route = getWorkflowStageDefinition(run.stageId)?.screenRoute;
    projectRepository.saveProject(updateProjectStage(project, run.stageId, "failed", {
      code: run.safeErrorCategory ?? "INTERRUPTED",
      message: run.safeErrorMessage ?? "The previous application session ended before this run completed.",
      actions: [{ label: "Review stage", ...(route ? { route } : {}) }]
    }));
  }
}
generationJobStore.recoverInterruptedJobs();
const logger = new JsonLogger();
const uiVerificationEvents: string[] = [];
let credentialStore: ProviderCredentialStore;
let ttsManager: TtsManager;
let ttsJobs: TtsJobService;
projectRepository.seedProfiles();
const queue = new PersistentGenerationQueue({
  storagePath: join(workspaceRoot, "queue.json"),
  defaultConcurrency: 5
});
const localTtsSettingsId = "local-tts";
const execFileAsync = promisify(execFile);
const devTestLabEnabled = Boolean(process.env.VITE_DEV_SERVER_URL) || process.env.LSF_DEV_TEST_LAB === "1";

function defaultOmniVoiceBinPath(): string {
  const envPath = process.env.OMNIVOICE_INFER_PATH;
  if (envPath) return envPath;
  const candidates = [
    join(process.env.OMNIVOICE_HOME ?? "", ".venv", "Scripts", "omnivoice-infer.exe"),
    resolve(repoRoot, "..", "tts", "OmniVoice", ".venv", "Scripts", "omnivoice-infer.exe"),
    join(app.getPath("home"), "OmniVoice", ".venv", "Scripts", "omnivoice-infer.exe"),
    join(app.getPath("home"), "tts", "OmniVoice", ".venv", "Scripts", "omnivoice-infer.exe")
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? "";
}

function defaultTtsPythonPath(): string {
  if (process.env.TTS_PYTHON_PATH) return process.env.TTS_PYTHON_PATH;
  const integratedTtsPython = join(repoRoot, "python", "tts_bridge", ".venv", "Scripts", "python.exe");
  if (existsSync(integratedTtsPython)) return integratedTtsPython;
  return process.env.CAPCUT_PYTHON_PATH ?? join(repoRoot, "python", "capcut_bridge", ".venv", "Scripts", "python.exe");
}

type LocalTtsProvider = "omnivoice-local" | TtsProviderId;
type LocalTtsVoiceMode = "voice-design" | "integrated-voices" | "voice-clone";
type LoadedLocalTtsSettings = ReturnType<typeof localTtsSettingsResponseSchema.parse>;

function configuredTtsVoiceMode(settings: Pick<LoadedLocalTtsSettings, "voiceMode" | "ttsProvider">): LocalTtsVoiceMode {
  return settings.voiceMode ?? (settings.ttsProvider && settings.ttsProvider !== "omnivoice-local" ? "integrated-voices" : "voice-design");
}

function configuredTtsProvider(settings: Pick<LoadedLocalTtsSettings, "voiceMode" | "ttsProvider">): LocalTtsProvider {
  return configuredTtsVoiceMode(settings) === "integrated-voices" ? settings.ttsProvider ?? "edge-tts" : "omnivoice-local";
}

function loadLocalTtsSettings(): LoadedLocalTtsSettings {
  const fallback = {
    omnivoiceBinPath: defaultOmniVoiceBinPath(),
    outputDir: process.env.OMNIVOICE_OUTPUT_DIR ?? join(workspaceRoot, "assets", "tts"),
    voiceMode: "integrated-voices" as const,
    ttsProvider: "edge-tts" as const,
    ttsVoiceId: "vi-VN-HoaiMyNeural",
    ttsRate: 1,
    ttsFallbackEnabled: false,
    ttsFallbackOrder: [] as TtsProviderId[],
    modelPath: process.env.OMNIVOICE_MODEL_PATH ?? "",
    language: "",
    instruct: "",
    referenceAudioPath: "",
    referenceTranscript: "",
    voiceGender: undefined,
    voiceAge: undefined,
    voicePitch: undefined,
    voiceStyle: undefined,
    voiceEnglishAccent: undefined,
    voiceChineseDialect: undefined
  };
  const storedSettings = appSettingsStore.load(localTtsSettingsId, fallback);
  const legacyCapcutPython = join(repoRoot, "python", "capcut_bridge", ".venv", "Scripts", "python.exe");
  const parsedStoredSettings = localTtsSettingsSchema.partial().parse(storedSettings);
  const configuredPython = parsedStoredSettings.ttsPythonPath;
  const ttsPythonPath = configuredPython === legacyCapcutPython ? defaultTtsPythonPath() : configuredPython ?? defaultTtsPythonPath();
  const legacyNineRouterEdgeVoice = parsedStoredSettings.ttsProvider === "nine-router-tts"
    && parsedStoredSettings.ttsVoiceProvider === "edge-tts"
    && Boolean(parsedStoredSettings.ttsVoiceId?.replace(/^edge-tts\//, "").startsWith("vi-VN-"));
  const settings = localTtsSettingsSchema.parse({
    ...fallback,
    ...parsedStoredSettings,
    ...(legacyNineRouterEdgeVoice ? {
      voiceMode: "integrated-voices",
      ttsProvider: "edge-tts" as const,
      ttsVoiceId: parsedStoredSettings.ttsVoiceId?.replace(/^edge-tts\//, "") ?? fallback.ttsVoiceId,
      language: parsedStoredSettings.language || "vi"
    } : {}),
    ttsPythonPath
  });
  const resolvedBinPath = settings.omnivoiceBinPath;
  const provider = settings.ttsProvider ?? "omnivoice-local";
  const integratedVoices = configuredTtsVoiceMode(settings) === "integrated-voices";
  const nineRouterSettings = integratedVoices && provider === "nine-router-tts"
    ? credentialStore.loadProviderCredentialSettings("9router")
    : undefined;
  return localTtsSettingsResponseSchema.parse({
    ...settings,
    resolvedBinPath,
    available: integratedVoices
      ? provider === "nine-router-tts"
        ? Boolean(nineRouterSettings?.hasCredential)
        : provider !== "capcut-experimental" && Boolean(settings.ttsPythonPath && existsSync(settings.ttsPythonPath) && existsSync(join(repoRoot, "python", "tts_bridge", "worker.py")))
      : Boolean(resolvedBinPath && existsSync(resolvedBinPath))
  });
}

async function runOmniVoiceTts(input: { projectId: string; text: string; outputName?: string; outputDir?: string; outputPath?: string }) {
  const settings = loadLocalTtsSettings();
  if (!settings.available) {
    throw new Error("OmniVoice binary is not configured or does not exist.");
  }
  if (configuredTtsVoiceMode(settings) === "voice-clone" && !settings.referenceAudioPath) {
    throw new Error("Voice clone mode requires a reference audio file.");
  }
  const outputDir = input.outputPath ? dirname(input.outputPath) : input.outputDir ?? settings.outputDir;
  mkdirSync(outputDir, { recursive: true });
  const outputName = input.outputName ?? `${input.projectId}-tts-${Date.now()}.wav`;
  const outputPath = input.outputPath ?? join(outputDir, outputName.endsWith(".wav") ? outputName : `${outputName}.wav`);
  const args = ["--text", input.text, "--output", outputPath];
  if (settings.modelPath) args.push("--model", settings.modelPath);
  if (settings.language) args.push("--language", settings.language);
  if (configuredTtsVoiceMode(settings) === "voice-design") {
    const designAttributes = [settings.voiceGender, settings.voiceAge, settings.voicePitch, settings.voiceStyle, settings.voiceEnglishAccent, settings.voiceChineseDialect, settings.instruct].filter((value): value is string => Boolean(value?.trim()));
    if (designAttributes.length > 0) args.push("--instruct", designAttributes.join(", "));
  }
  if (configuredTtsVoiceMode(settings) === "voice-clone" && settings.referenceAudioPath) {
    if (!existsSync(settings.referenceAudioPath)) throw new Error("Configured OmniVoice reference audio file does not exist.");
    args.push("--ref_audio", settings.referenceAudioPath);
    if (settings.referenceTranscript) args.push("--ref_text", settings.referenceTranscript);
  }
  await execFileAsync(settings.resolvedBinPath, args, { encoding: "utf8", timeout: 30 * 60_000 });
  if (!existsSync(outputPath)) throw new Error("OmniVoice completed without creating an audio file.");
  return localTtsGeneratedResponseSchema.parse({ ok: true, outputPath, provider: "omnivoice-local" });
}

async function runConfiguredTts(input: { projectId: string; text: string; outputName?: string; outputDir?: string; provider?: LocalTtsProvider; voiceId?: string }) {
  const settings = loadLocalTtsSettings();
  const provider = input.provider ?? configuredTtsProvider(settings);
  if (provider === "omnivoice-local") return runOmniVoiceTts(input);
  const outputDir = input.outputDir ?? settings.outputDir;
  mkdirSync(outputDir, { recursive: true });
  const requestedName = input.outputName ?? `${input.projectId}-tts-${Date.now()}`;
  const outputPath = join(outputDir, `${requestedName.replace(/\.[A-Za-z0-9]+$/, "")}.mp3`);
  const voiceId = input.voiceId ?? settings.ttsVoiceId ?? defaultVoiceForProvider(provider, settings.language ?? "vi");
  if (!voiceId) throw new Error("Select a voice before generating audio.");
  const generated = await ttsManager.synthesize({
    provider,
    voiceId,
    language: normalizeTtsLanguage(settings.language),
    text: input.text,
    rate: settings.ttsRate ?? 1,
    outputPath,
    fallbackEnabled: settings.ttsFallbackEnabled ?? false,
    fallbackOrder: settings.ttsFallbackOrder ?? []
  });
  if (!existsSync(generated.outputPath)) throw new Error("Selected TTS provider completed without creating an audio file.");
  return localTtsGeneratedResponseSchema.parse({ ok: true, outputPath: generated.outputPath, provider: generated.actualProvider });
}

function normalizeTtsLanguage(value: string | undefined): string {
  const aliases: Record<string, string> = { vietnamese: "vi", english: "en", japanese: "ja", korean: "ko", chinese: "zh" };
  const normalized = value?.trim() ?? "";
  return aliases[normalized.toLowerCase()] ?? (normalized || "vi");
}

function defaultVoiceForProvider(provider: TtsProviderId, language: string): string | undefined {
  if (provider === "edge-tts" && normalizeTtsLanguage(language) === "vi") return "vi-VN-HoaiMyNeural";
  if (provider === "gtts") return normalizeTtsLanguage(language);
  if (provider === "kokoro-vietnamese" && normalizeTtsLanguage(language) === "vi") return "diem_trinh";
  return undefined;
}

async function probeVoiceFile(outputPath: string): Promise<{ durationSeconds: number; codec: string; byteLength: number; sha256: string }> {
  const ffprobePath = process.env.FFPROBE_PATH ?? (process.env.FFMPEG_PATH ? join(resolve(process.env.FFMPEG_PATH, ".."), "ffprobe.exe") : "ffprobe");
  try {
    const { stdout } = await execFileAsync(ffprobePath, ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name:format=duration", "-of", "json", outputPath], { encoding: "utf8", timeout: 30_000 });
    const payload = JSON.parse(stdout) as { streams?: Array<{ codec_name?: string }>; format?: { duration?: string } };
    const codec = payload.streams?.[0]?.codec_name; const durationSeconds = Number(payload.format?.duration);
    if (!codec || !Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("missing audio stream or duration");
    const file = await import("node:fs/promises"); const bytes = await file.readFile(outputPath); if (bytes.length === 0) throw new Error("empty audio file");
    return { durationSeconds, codec, byteLength: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  } catch { throw new Error("Voice output failed FFprobe validation."); }
}

function ffmpegExecutable(): string {
  return process.env.FFMPEG_PATH ?? "ffmpeg";
}

async function fitVoiceAudio(inputPath: string, outputPath: string, speed: number): Promise<void> {
  if (!Number.isFinite(speed) || speed < 0.5 || speed > 1.8) throw new Error("Voice timing speed must be between 0.5x and 1.8x.");
  await execFileAsync(ffmpegExecutable(), ["-y", "-i", inputPath, "-filter:a", `atempo=${speed.toFixed(6)}`, "-vn", "-c:a", "libmp3lame", outputPath], { encoding: "utf8", timeout: 120_000, windowsHide: true });
  await probeVoiceFile(outputPath);
}

async function mixVoiceInputs(items: Array<{ inputPath: string; startSeconds: number }>, outputPath: string): Promise<void> {
  if (!items.length) throw new Error("Voice merge requires at least one completed segment.");
  const args = ["-y", ...items.flatMap((item) => ["-i", item.inputPath])];
  const filters = items.map((item, index) => `[${index}:a]adelay=${Math.max(0, Math.round(item.startSeconds * 1000))}:all=1,aresample=48000[a${index}]`);
  filters.push(`${items.map((_, index) => `[a${index}]`).join("")}amix=inputs=${items.length}:duration=longest:dropout_transition=0,alimiter=limit=0.95[mixed]`);
  await execFileAsync(ffmpegExecutable(), [...args, "-filter_complex", filters.join(";"), "-map", "[mixed]", "-c:a", "libmp3lame", outputPath], { encoding: "utf8", timeout: 5 * 60_000, windowsHide: true });
  await probeVoiceFile(outputPath);
}

async function mergeVoiceAudio(items: Array<{ inputPath: string; startSeconds: number }>, outputPath: string): Promise<void> {
  const { rm } = await import("node:fs/promises");
  const batchSize = 16;
  if (items.length <= batchSize) return mixVoiceInputs(items, outputPath);
  const batchPaths: string[] = [];
  try {
    for (let index = 0; index < items.length; index += batchSize) {
      const batchPath = outputPath.replace(/\.mp3$/, `-batch-${index / batchSize}.mp3`);
      await mixVoiceInputs(items.slice(index, index + batchSize), batchPath);
      batchPaths.push(batchPath);
    }
    await mixVoiceInputs(batchPaths.map((inputPath) => ({ inputPath, startSeconds: 0 })), outputPath);
  } finally {
    await Promise.all(batchPaths.map((batchPath) => rm(batchPath, { force: true })));
  }
}

const previewAudioFiles = new Map<string, string>();
const previewMediaFiles = new Map<string, { projectId: string; artifactId: string; outputPath: string }>();
const assetPreviewMediaFiles = new Map<string, { projectId: string; artifactId: string; assetSha256: string; outputPath: string; mimeType: string }>();

function audioPreviewUrl(outputPath: string): string {
  const token = randomUUID();
  previewAudioFiles.set(token, resolve(outputPath));
  return `lsf-audio://preview/${token}`;
}

function registerDevAudioProtocol(): void {
  protocol.handle("lsf-audio", (request) => {
    const requestUrl = new URL(request.url);
    const token = requestUrl.pathname.slice(1);
    const outputPath = previewAudioFiles.get(token);
    if (requestUrl.hostname !== "preview" || !token || !outputPath || !existsSync(outputPath)) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(readFileSync(outputPath), { headers: { "Content-Type": outputPath.endsWith(".wav") ? "audio/wav" : "audio/mpeg" } });
  });
}

function assertDevTestLabEnabled(): void {
  if (!devTestLabEnabled) throw new Error("Dev Test Lab is only available in a development build.");
}

async function runDevVoiceTest(input: unknown) {
  assertDevTestLabEnabled();
  const { text, provider, voiceId } = devVoiceTestRequestSchema.parse(input);
  const outputDir = join(workspaceRoot, "dev-test-lab", "voice");
  const outputName = `voice-${Date.now()}-${randomUUID()}`;
  const generated = await runConfiguredTts({ projectId: "dev-test", text, outputName, outputDir, ...(provider ? { provider } : {}), ...(voiceId ? { voiceId } : {}) });
  const metadata = await probeVoiceFile(generated.outputPath);
  return devVoiceTestResponseSchema.parse({
    provider: generated.provider,
    previewUrl: audioPreviewUrl(generated.outputPath),
    relativeFilePath: relative(workspaceRoot, generated.outputPath),
    ...metadata
  });
}

async function runDevCapcutTest(input: unknown) {
  assertDevTestLabEnabled();
  const { subtitleText = "CapCut development test" } = devCapcutTestRequestSchema.parse(input ?? {});
  const runtime = await probeRuntimeEnvironment();
  if (!runtime.pythonExists || !runtime.capcutInstalled || runtime.pycapcutStatus !== "Installed" || !runtime.draftDirConfigured) {
    throw new Error("CapCut Test requires the installed app, pycapcut, and a configured draft directory.");
  }
  if (!runtime.ffmpegAvailable) throw new Error("CapCut Test requires FFmpeg to create isolated fixture media.");

  const testId = `capcut-${Date.now()}-${randomUUID()}`;
  const fixtureDirectory = join(workspaceRoot, "dev-test-lab", "capcut", testId);
  const videoPath = join(fixtureDirectory, "video.mp4");
  const audioPath = join(fixtureDirectory, "audio.wav");
  mkdirSync(fixtureDirectory, { recursive: true });
  try {
    await execFileAsync(runtime.ffmpegPath, ["-y", "-f", "lavfi", "-i", "color=c=0x20232a:s=1080x1920:r=30", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", videoPath], { encoding: "utf8", timeout: 30_000, windowsHide: true });
    await execFileAsync(runtime.ffmpegPath, ["-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "2", "-c:a", "pcm_s16le", audioPath], { encoding: "utf8", timeout: 30_000, windowsHide: true });
  } catch {
    throw new Error("FFmpeg could not create isolated CapCut test media.");
  }
  if (!existsSync(videoPath) || !existsSync(audioPath)) throw new Error("CapCut test fixture media was not created.");
  const bridge = await runCapCutDraftBridge({
    pythonPath: runtime.sidecarPythonPath,
    bridgePath: join(repoRoot, "python", "capcut_bridge", "bridge.py"),
    payload: {
      draftDirectory: join(runtime.capcutDraftDir, `LSF-DEV-${testId}`),
      canvas: { width: 1080, height: 1920, fps: 30 },
      timeline: {
        visuals: [{ filePath: videoPath, startUs: 0, durationUs: 2_000_000 }],
        audio: [{ filePath: audioPath, startUs: 0, durationUs: 2_000_000 }],
        subtitles: [{ text: subtitleText, startUs: 0, durationUs: 2_000_000 }]
      }
    }
  });
  return devCapcutTestResponseSchema.parse({ ...bridge, fixtureDirectory, trackCounts: bridge.trackCounts });
}

async function runDevIdeaTest(input: unknown) {
  assertDevTestLabEnabled();
  const { topic, language = "Vietnamese" } = devIdeaTestRequestSchema.parse(input);
  const settings = credentialStore.loadProviderCredentialSettings("9router");
  const apiKey = await credentialStore.resolveProviderSecret("9router");
  if (!settings?.textModel || !apiKey) throw new Error("Idea Test requires a saved 9Router credential and selected text model.");
  const response = await new NineRouterClient({ baseUrl: settings.baseUrl, apiKey, timeoutMs: 60_000 }).createChatCompletionText({
    model: settings.textModel,
    prompt: `Generate five distinct YouTube video ideas about ${JSON.stringify(topic)} for a ${language} audience. Return concise numbered ideas only. Do not claim facts, copy titles, or auto-select an idea.`
  });
  const outputDir = join(workspaceRoot, "dev-test-lab", "ideas");
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, `idea-${Date.now()}-${randomUUID()}.json`);
  writeFileSync(outputPath, JSON.stringify({ topic, language, model: response.returnedModelId ?? settings.textModel, responseText: response.text }, null, 2), "utf8");
  return devIdeaTestResponseSchema.parse({ model: response.returnedModelId ?? settings.textModel, responseText: response.text, relativeFilePath: relative(workspaceRoot, outputPath) });
}

async function runDevImageTest(input: unknown) {
  assertDevTestLabEnabled();
  const { prompt, aspectRatio } = devImageTestRequestSchema.parse(input);
  const settings = credentialStore.loadProviderCredentialSettings("9router");
  const apiKey = await credentialStore.resolveProviderSecret("9router");
  if (!settings?.imageModel || !apiKey) throw new Error("Image Test requires a saved 9Router credential and selected image model.");
  const imageClient = new NineRouterClient({ baseUrl: settings.baseUrl, apiKey, timeoutMs: 60_000 });
  const advertisedModels = await imageClient.listImageModels();
  if (!advertisedModels.some((model) => model.id === settings.imageModel)) {
    throw new Error(`Configured image model '${settings.imageModel}' is not advertised by 9Router /v1/models/image. Refresh models and select an image model.`);
  }
  const testId = `image-${Date.now()}-${randomUUID()}`;
  const asset = await acquireImageAsset({
    projectId: "dev-test",
    shotId: testId,
    promptVersionId: "dev-test-v1",
    idempotencyKey: testId,
    positivePrompt: prompt,
    aspectRatio,
    imageModel: settings.imageModel,
    apiKey,
    baseUrl: settings.baseUrl,
    imageCapabilityVerified: true,
    providerTimeoutMs: 5 * 60_000,
    workspaceRoot: join(workspaceRoot, "dev-test-lab")
  });
  return devImageTestResponseSchema.parse({
    relativeFilePath: asset.relativeFilePath,
    sha256: asset.sha256,
    mimeType: asset.mimeType,
    byteLength: asset.byteLength,
    width: asset.width,
    height: asset.height
  });
}

async function runDevStockTest(input: unknown) {
  assertDevTestLabEnabled();
  const { query, mediaType } = devStockTestRequestSchema.parse(input);
  const settings = credentialStore.loadProviderCredentialSettings("pexels");
  const apiKey = await credentialStore.resolveProviderSecret("pexels");
  if (!settings || !apiKey) throw new Error("Stock Test requires a saved Pexels API key.");
  const base = new URL(settings.baseUrl);
  const endpoint = new URL(mediaType === "video" ? "/videos/search" : "/v1/search", base.origin);
  endpoint.searchParams.set("query", query);
  endpoint.searchParams.set("per_page", "5");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let response: Response;
  try {
    response = await fetch(endpoint, { headers: { Authorization: apiKey }, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Pexels stock search timed out.");
    throw new Error("Pexels stock search network error.");
  } finally { clearTimeout(timeout); }
  if (!response.ok) throw new Error(`Pexels stock search failed: ${response.status}.`);
  const payload = await response.json() as { photos?: Array<{ id?: number; url?: string; photographer?: string; src?: { medium?: string; landscape?: string } }>; videos?: Array<{ id?: number; url?: string; image?: string; user?: { name?: string } }> };
  const source = mediaType === "video" ? payload.videos ?? [] : payload.photos ?? [];
  const results = source.flatMap((item) => {
    const id = typeof item.id === "number" ? String(item.id) : "";
    const url = typeof item.url === "string" ? item.url : "";
    const previewUrl = mediaType === "video" ? (typeof (item as { image?: unknown }).image === "string" ? (item as { image: string }).image : "") : ((item as { src?: { landscape?: unknown; medium?: unknown } }).src?.landscape ?? (item as { src?: { medium?: unknown } }).src?.medium ?? "");
    const creator = mediaType === "video" ? (item as { user?: { name?: unknown } }).user?.name : (item as { photographer?: unknown }).photographer;
    return id && url && previewUrl ? [{ id, url, previewUrl, ...(typeof creator === "string" ? { creator } : {}) }] : [];
  });
  return devStockTestResponseSchema.parse({ mediaType, results });
}

async function probeRuntimeEnvironment() {
  const sidecarPythonPath =
    process.env.CAPCUT_PYTHON_PATH ?? join(repoRoot, "python", "capcut_bridge", ".venv", "Scripts", "python.exe");
  const capcutInstallPath = process.env.CAPCUT_INSTALL_DIR ?? join(app.getPath("home"), "AppData", "Local", "CapCut");
  const detectedCapcutDraftDir = join(capcutInstallPath, "User Data", "Projects", "com.lveditor.draft");
  const capcutDraftDir = process.env.CAPCUT_DRAFT_DIR ?? (existsSync(detectedCapcutDraftDir) ? detectedCapcutDraftDir : "");
  const pythonExists = existsSync(sidecarPythonPath);
  let pythonVersion = "Not found";
  let pycapcutStatus = "Not installed";
  if (pythonExists) {
    try {
      pythonVersion = (await execFileAsync(sidecarPythonPath, ["--version"], { encoding: "utf8", timeout: 5_000, windowsHide: true })).stdout.trim();
      await execFileAsync(sidecarPythonPath, ["-c", "import pycapcut"], { encoding: "utf8", timeout: 5_000, windowsHide: true });
      pycapcutStatus = "Installed";
    } catch (error) {
      pycapcutStatus = error instanceof Error ? `Not available: ${error.message.split("\n")[0]}` : "Not available";
    }
  }
  const capcutInstalled = existsSync(capcutInstallPath);
  const ffmpegPath = process.env.FFMPEG_PATH ?? "ffmpeg";
  let ffmpegStatus = "Not configured";
  let ffmpegAvailable = false;
  try {
    const output = await execFileAsync(ffmpegPath, ["-version"], { encoding: "utf8", timeout: 5_000, windowsHide: true });
    ffmpegStatus = output.stdout.split("\n")[0]?.trim() || "Detected";
    ffmpegAvailable = true;
  } catch (error) {
    ffmpegStatus = error instanceof Error ? `Not available: ${error.message.split("\n")[0]}` : "Not available";
  }
  const draftDirConfigured = Boolean(capcutDraftDir);
  return {
    sidecarPythonPath,
    pythonExists,
    pythonVersion,
    pycapcutStatus,
    capcutInstallPath,
    capcutInstalled,
    ffmpegPath,
    ffmpegAvailable,
    ffmpegStatus,
    capcutDraftDir: capcutDraftDir || "Not configured",
    draftDirConfigured,
    capcutCompatibility:
      capcutInstalled && pythonExists && pycapcutStatus === "Installed" && draftDirConfigured
      ? "Environment ready; editable draft export available; installed-app editability review remains manual"
        : "Needs setup",
    devTestLabEnabled
  };
}

async function createCredentialStore(): Promise<ProviderCredentialStore> {
  if (process.env.LSF_DEV_MEMORY_KEYCHAIN === "1") {
    logger.warn("dev_memory_keychain_enabled", { providerId: "9router" });
    return new ProviderCredentialStore(db, new MemoryKeychain());
  }
  const keychain = await createKeytarKeychain();
  return new ProviderCredentialStore(db, keychain);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    webPreferences: {
      preload: join(currentDir, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.LSF_E2E_UI_REPORT_PATH) {
    win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      uiVerificationEvents.push(`console:${level}:${sourceId}:${line}:${message}`);
    });
    win.webContents.on("render-process-gone", (_event, details) => {
      uiVerificationEvents.push(`render-process-gone:${details.reason}:${details.exitCode}`);
    });
    win.webContents.on("unresponsive", () => {
      uiVerificationEvents.push("unresponsive");
    });
  }

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) {
    void win.loadURL(devServer);
  } else {
    void win.loadFile(join(currentDir, "../../dist/renderer/index.html"));
  }
  return win;
}

app.whenReady().then(async () => {
  mkdirSync(workspaceRoot, { recursive: true });
  registerDevAudioProtocol();
  registerPreviewMediaProtocol();
  credentialStore = await createCredentialStore();
  const worker = new TtsWorkerClient({
    pythonPath: defaultTtsPythonPath(),
    workerPath: join(repoRoot, "python", "tts_bridge", "worker.py")
  });
  ttsManager = new TtsManager({
    workspaceRoot,
    credentialStore,
    worker,
    probeAudio: async (outputPath) => probeVoiceFile(outputPath),
    previewUrl: audioPreviewUrl,
    previewOutputDir: () => loadLocalTtsSettings().outputDir,
    normalizeAudio: async (inputPath, outputPath) => fitVoiceAudio(inputPath, outputPath, 1)
  });
  ttsJobs = new TtsJobService({
    store: ttsJobStore,
    manager: {
      synthesize: async (input) => {
        const { provider, ...request } = input;
        if (provider !== "omnivoice-local") return ttsManager.synthesize({ ...request, provider });
        const temporaryOutputPath = input.outputPath.replace(/\.[A-Za-z0-9]+$/, ".omnivoice.wav");
        try {
          await runOmniVoiceTts({ projectId: "tts-job", text: input.text, outputPath: temporaryOutputPath });
          await fitVoiceAudio(temporaryOutputPath, input.outputPath, 1);
        } finally {
          const { rm } = await import("node:fs/promises");
          await rm(temporaryOutputPath, { force: true });
        }
        return { requestedProvider: "omnivoice-local", actualProvider: "omnivoice-local", voiceId: input.voiceId, outputPath: input.outputPath, attemptCount: 1, fallbackUsed: false };
      }
    },
    workspaceRoot,
    outputPathFor: (jobId, segmentId) => join(workspaceRoot, "assets", "voice", "jobs", jobId, `${segmentId}.mp3`),
    probeAudio: async (outputPath) => probeVoiceFile(outputPath),
    fitAudio: fitVoiceAudio,
    mergeAudio: mergeVoiceAudio,
    mergedOutputPathFor: (jobId) => join(workspaceRoot, "assets", "voice", "jobs", jobId, "voiceover.mp3")
  });
  ttsJobStore.recoverInterruptedJobs();
  for (const storedJob of ttsJobStore.listFailed()) {
    if (storedJob.payload.errorCode !== "interrupted") continue;
    const recovered = ttsJobs.get(storedJob.id);
    if (recovered) void completeManagedVoiceGeneration(recovered).catch((error) => logger.error("tts_job_recovery_attention_failed", { jobId: recovered.id, message: error instanceof Error ? error.message : String(error) }));
  }
  // Interrupted and queued jobs remain available for explicit user retry; startup never calls a TTS provider.
  if (process.env.LSF_E2E_UI_MODE === "workflow-contract") {
    const topic = "Workflow contract verification project";
    if (!projectRepository.listProjects().some((project) => project.topic === topic)) {
      projectRepository.createProject(createFixtureProject({
        topic,
        format: "long",
        targetLanguage: "English",
        projectName: topic,
        profiles: seedChannelProfiles
      }));
    }
  } else if (process.env.LSF_E2E_UI_MODE === "semi-automatic-resume") {
    const topic = "Semi-automatic resume verification project";
    if (!projectRepository.listProjects().some((project) => project.topic === topic)) {
      const fixture = createFixtureProject({
        topic,
        format: "long",
        targetLanguage: "English",
        workflowMode: "semi_automatic",
        projectName: topic,
        competitorReference: { pastedTranscript: "A persisted reference used to verify automatic resume after a stage attention state." },
        profiles: seedChannelProfiles
      });
      projectRepository.createProject({
        ...fixture,
        referenceSet: { status: "approved" },
        competitorReferences: fixture.competitorReferences.map((reference) => ({ ...reference, status: "approved" as const })),
        stages: normalizeProjectStages(fixture.stages).map((stage) => stage.id === "reference-validation"
          ? { ...stage, status: "approved" as const }
          : stage.id === "transcript-cleaning"
            ? { ...stage, status: "needs_attention" as const, attention: { code: "E2E_PROVIDER_FAILURE", message: "Provider is unavailable for this verification run.", actions: [{ label: "Retry automatic workflow", route: "project-overview" }] } }
            : stage)
      });
    }
  }
  const win = createWindow();
  if (process.env.LSF_E2E_UI_REPORT_PATH) {
    void runUiVerification(win, process.env.LSF_E2E_UI_REPORT_PATH, process.env.LSF_E2E_UI_MODE ?? "create");
  }
});

app.on("before-quit", () => ttsManager?.dispose());

async function runUiVerification(win: BrowserWindow, reportPath: string, mode: string): Promise<void> {
  const topic = mode === "workflow-contract" || mode === "reference-restart" || mode === "reference-invalidation" ? "Workflow contract verification project" : mode === "semi-automatic-resume" ? "Semi-automatic resume verification project" : "Why did oil matter so much in World War II?";
  try {
    writeUiVerificationReport(reportPath, { ok: false, mode, phase: "started", workspaceRoot, databasePath });
    await waitForRenderer(win);
    await win.webContents.executeJavaScript("window.confirm = () => true; true", true);
    writeUiVerificationReport(reportPath, { ok: false, mode, phase: "renderer_loaded", workspaceRoot, databasePath });
    if (mode === "workflow-contract") {
      await assertText(win, "Long/Short Factory");
      await clickText(win, "Projects");
      await assertText(win, topic);
      await clickProjectOpen(win, topic);
      await assertText(win, "Project command center");
      await clickText(win, "Reference Intake");
      await assertText(win, "Reference Validation");
      await setInputValue(win, "#idea-competitor-url", "https://www.youtube.com/watch?v=3GKC4kC3iQ0");
      await setInputValue(win, "#idea-competitor-script", "This is a long enough competitor transcript for local reference validation.");
      await clickText(win, "Save competitor reference");
      await assertText(win, "Competitor reference saved as Draft.");
      await clickText(win, "View");
      await assertText(win, "This is a long enough competitor transcript for local reference validation.");
      await clickText(win, "Hide");
      await clickText(win, "Versions");
      await assertText(win, "v1");
      await clickText(win, "Hide versions");
      await clickText(win, "Replace transcript");
      await setInputValue(win, "#idea-competitor-script", "Replacement transcript saved as a new immutable version for this source.");
      await clickText(win, "Create transcript version");
      await assertText(win, "Transcript version created. Validate the reference set again.");
      await setInputValue(win, "#idea-competitor-url", "http://youtube.com/watch?v=3GKC4kC3iQ0");
      await setInputValue(win, "#idea-competitor-script", "Replacement transcript for the same normalized YouTube source.");
      await clickText(win, "Save competitor reference");
      await assertText(win, "This video already exists in the project.");
      await clickText(win, "Open existing");
      await assertText(win, "Current transcript");
      await clickText(win, "Hide");
      await clickText(win, "Validate reference set");
      await assertText(win, "Reference set validated. Review and approve it to continue.");
      await clickText(win, "Approve reference set");
      await assertText(win, "Reference set approved. Competitor Workflow is now available.");
      await clickText(win, "Continue to Competitor Workflow");
      await assertText(win, "Transcript Cleaning");
      await assertText(win, "eligible chain starts automatically");
    } else if (mode === "reference-restart") {
      await clickText(win, "Projects");
      await assertText(win, topic);
      await clickProjectOpen(win, topic);
      await assertText(win, "Project command center");
      await clickText(win, "Reference Intake");
      await assertText(win, "approved");
      await clickText(win, "Versions");
      await assertText(win, "v2");
    } else if (mode === "reference-invalidation") {
      await clickText(win, "Projects");
      await assertText(win, topic);
      await clickProjectOpen(win, topic);
      await assertText(win, "Project command center");
      await clickText(win, "Reference Intake");
      await clickText(win, "Edit");
      await setInputValue(win, "#idea-competitor-script", "Approved reference edited to verify trusted downstream stale invalidation.");
      await clickText(win, "Save reference edits");
      await assertText(win, "Reference edited. Validate the reference set again.");
      await assertText(win, "stale");
    } else if (mode === "semi-automatic-resume") {
      await clickText(win, "Projects");
      await assertText(win, topic);
      await clickProjectOpen(win, topic);
      await assertText(win, "Project command center");
      await assertText(win, "Retry automatic workflow");
    } else if (mode === "vox-simple-flow") {
      const evidence = await runVoxSimpleFlowVerification(win, topic);
      writeUiVerificationReport(reportPath, { ok: true, mode, workspaceRoot, databasePath, ...evidence });
      app.quit();
      return;
    } else if (mode === "verify") {
      await clickText(win, "Projects");
      await assertText(win, topic);
      await clickProjectOpen(win, topic);
      await assertText(win, "Project command center");
      await clickText(win, "Idea Lab");
      await assertText(win, "Idea Lab");
      await clickText(win, "Script");
      await assertText(win, "Narration editor");
      await clickText(win, "Settings");
      await assertText(win, workspaceRoot);
      await assertText(win, "Security");
      await assertText(win, "Generation");
    } else {
      await assertText(win, "Long/Short Factory");
      await clickText(win, "Create");
      await assertText(win, "Create Video Project");
      await assertText(win, "VOX Documentary");
      await setInputValue(win, "#simple-topic", topic);
      await clickText(win, "Create Video Project");
      await assertText(win, "Preparing your video");
      await clickText(win, "Projects");
      await assertText(win, topic);
      await clickProjectOpen(win, topic);
      await assertOneOfText(win, ["Preparing your video", "Project command center"]);
      await clickText(win, "Scene Review");
      await assertText(win, "Scenes are not ready yet");
      await clickText(win, "Final Preview");
      await assertText(win, "No reviewable preview yet");
      await clickText(win, "Settings");
      await assertText(win, "Generation");
      await clickText(win, "Diagnostics");
      await assertText(win, "Diagnostics");
    }
    writeUiVerificationReport(reportPath, { ok: true, mode, workspaceRoot, databasePath });
    app.quit();
  } catch (error) {
    writeUiVerificationReport(reportPath, {
      ok: false,
      mode,
      error: error instanceof Error ? error.message : String(error),
      pageText: await pageText(win).catch((reason) => `unavailable:${String(reason)}`),
      bodyHtml: await bodyHtml(win).catch((reason) => `unavailable:${String(reason)}`),
      events: uiVerificationEvents.slice(-40)
    });
    app.exit(1);
  }
}

async function runVoxSimpleFlowVerification(win: BrowserWindow, topic: string): Promise<Record<string, unknown>> {
  const phases: Record<string, string> = {
    createScreen: "not_reached",
    persistedConfiguration: "not_reached",
    ideaSelection: "not_reached",
    sceneReview: "not_reached",
    sceneRegeneration: "not_reached",
    voiceGeneration: "not_reached",
    subtitles: "not_reached",
    previewApproval: "not_reached",
    packagingExport: "not_reached",
    finalPreview: "not_reached",
    export: "not_reached"
  };
  const runtimeNotes: string[] = [];
  const requireFullFlow = process.env.LSF_UI_REQUIRE_FULL_FLOW === "1" || Boolean(process.env.LSF_UI_SEED_WORKSPACE);

  await assertText(win, "Long/Short Factory");
  await clickText(win, "Create");
  await assertText(win, "Create Video Project");
  phases.createScreen = "reached";
  await setInputValue(win, "#simple-topic", topic);
  await setSelectValue(win, "#simple-language", "Vietnamese");
  await setSelectValue(win, "#simple-duration", "45-60 seconds");
  await setSelectValue(win, "#simple-aspect-ratio", "16:9");
  await setSelectValue(win, "#simple-resolution", "1080p");
  const selectedVoice = await selectFirstAvailableOption(win, "#simple-voice");
  if (!selectedVoice) throw new Error("The simplified Create screen did not expose an available voice.");
  const selectedStyle = await readSelectValue(win, "#simple-visual-style");
  if (selectedStyle !== "vox-documentary") throw new Error(`Unexpected visual style: ${selectedStyle}`);
  await clickText(win, "Create Video Project");
  await assertText(win, "Preparing your video");

  const summary = await waitForPersistedProject(topic);
  const persisted = projectRepository.loadProject(summary.id);
  if (!persisted) throw new Error("Created project was not loadable from SQLite.");
  const setup = persisted.setup;
  const selectedVoiceId = selectedVoice.startsWith("configured:") ? selectedVoice.slice("configured:".length) : selectedVoice;
  const configuration = {
    projectName: setup.projectName,
    inputMode: setup.inputMode,
    language: setup.language,
    targetDuration: setup.targetDuration,
    aspectRatio: setup.aspectRatio,
    visualStyle: setup.visualStyle,
    voiceId: setup.voiceId,
    outputResolution: setup.outputResolution,
    workflowMode: setup.workflowMode
  };
  const configurationMismatches = [
    persisted.topic !== topic ? `topic=${persisted.topic}` : "",
    setup.inputMode !== "topic" ? `inputMode=${setup.inputMode}` : "",
    setup.language !== "Vietnamese" ? `language=${setup.language}` : "",
    setup.targetDuration !== "45-60 seconds" ? `targetDuration=${setup.targetDuration}` : "",
    setup.aspectRatio !== "16:9" ? `aspectRatio=${setup.aspectRatio}` : "",
    setup.visualStyle !== "vox-documentary" ? `visualStyle=${setup.visualStyle}` : "",
    setup.voiceId !== selectedVoiceId ? `voiceId=${setup.voiceId};selectedVoice=${selectedVoiceId}` : "",
    setup.outputResolution !== "1080p" ? `outputResolution=${setup.outputResolution}` : ""
  ].filter(Boolean);
  if (configurationMismatches.length) {
    throw new Error(`Persisted VOX configuration did not match the selected Create values (${configurationMismatches.join(", ")}): ${JSON.stringify(configuration)}`);
  }
  phases.persistedConfiguration = "verified";

  try {
    await clickText(win, "Projects");
    await assertText(win, topic);
    await clickProjectOpen(win, topic);
    let checkpointText = await waitForOneOfPageText(
      win,
      requireFullFlow
        ? ["Idea candidates", "Idea Lab", "Open next step", "Retry automatic workflow", "needs attention"]
        : ["Idea candidates", "Project command center", "Retry automatic workflow", "Preparing your video"],
      requireFullFlow ? 900_000 : 20_000
    );
    if (checkpointText.includes("Open next step")) {
      await clickText(win, "Open next step");
      checkpointText = await waitForOneOfPageText(win, ["Idea candidates", "Idea Lab", "Retry automatic workflow", "needs attention"], requireFullFlow ? 900_000 : 20_000);
    }
    if (checkpointText.includes("Idea candidates")) {
      phases.ideaSelection = "reached";
      if (checkpointText.includes("Approve this idea")) {
        await clickText(win, "Approve this idea");
        phases.ideaSelection = "approved";
      } else if (checkpointText.includes("Generate ideas")) {
        await clickText(win, "Generate ideas");
        const generatedText = await waitForOneOfPageText(win, ["Approve this idea", "Idea generation failed", "needs attention"], 900_000);
        if (generatedText.includes("Approve this idea")) {
          await clickText(win, "Approve this idea");
          phases.ideaSelection = "approved";
        } else {
          runtimeNotes.push(`Idea checkpoint was reached but generation did not produce a selectable candidate: ${generatedText.slice(0, 300)}`);
        }
      }
    } else {
      phases.ideaSelection = "blocked_or_not_reached";
      runtimeNotes.push("Preparation stopped before the Idea Lab checkpoint; the persisted stage status and safe reason are recorded below.");
    }

    if (requireFullFlow && phases.ideaSelection !== "approved") {
      throw new Error(`VOX Simple Flow did not reach an approved idea. Page: ${(await pageText(win)).slice(0, 600)}`);
    }

    if (phases.ideaSelection === "approved") {
      const prepared = await waitForProjectStageStatus(summary.id, "asset-review", ["needs_review"], 900_000);
      if (!prepared.scenes.length) throw new Error("VOX Simple Flow produced no scenes for Scene Review.");
      const retryScene = prepared.scenes[0]!;
      const acquisitionRunsBefore = workflowRunStore.listRuns(summary.id, "asset-acquisition").length;

      await clickText(win, "Scene Review");
      await waitForText(win, "Scene Review", 15_000);
      await waitForEnabledControl(win, "Regenerate Scene", 30_000);
      await clickText(win, "Regenerate Scene");
      await waitForText(win, "Scene regeneration is ready for review.", 900_000);
      await waitForProjectStageStatus(summary.id, "asset-review", ["needs_review"], 900_000);
      const acquisitionRunsAfter = workflowRunStore.listRuns(summary.id, "asset-acquisition").length;
      if (acquisitionRunsAfter - acquisitionRunsBefore !== 1) {
        throw new Error(`Expected exactly one scene regeneration run, observed ${acquisitionRunsAfter - acquisitionRunsBefore}.`);
      }
      phases.sceneRegeneration = `approved-scene-retry:${retryScene.id}`;

      let safety = 0;
      while (true) {
        const reviewArtifact = workflowRunStore.listArtifacts(summary.id, "asset-review").find((artifact) => artifact.status === "needs_review");
        if (!reviewArtifact?.payloadJson) throw new Error("Scene Review lost its reviewable asset artifact.");
        const pending = assetReviewOutputSchema.parse(reviewArtifact.payloadJson).assets.filter((item) => item.reviewStatus === "needs_review");
        if (!pending.length) break;
        await waitForEnabledControl(win, "Approve Asset", 30_000);
        await clickText(win, "Approve Asset");
        if (++safety > 500) throw new Error("Scene Review asset approval did not converge.");
      }

      safety = 0;
      while (true) {
        const reviewArtifact = workflowRunStore.listArtifacts(summary.id, "asset-review").find((artifact) => artifact.status === "needs_review");
        if (!reviewArtifact?.payloadJson) throw new Error("Scene Review lost its reviewable assignment artifact.");
        const unassigned = assetReviewOutputSchema.parse(reviewArtifact.payloadJson).assets.filter((item) => item.reviewStatus === "approved" && !item.assignedShotId);
        if (!unassigned.length) break;
        await waitForEnabledControl(win, "Assign Asset", 30_000);
        await clickText(win, "Assign Asset");
        if (++safety > 500) throw new Error("Scene Review asset assignment did not converge.");
      }

      const sceneCount = prepared.scenes.length;
      for (let index = 0; index < sceneCount; index += 1) {
        await waitForEnabledControl(win, "Approve Scene", 30_000);
        await clickText(win, "Approve Scene");
      }
      await waitForProjectStageStatus(summary.id, "asset-review", ["approved"], 60_000);
      phases.sceneReview = `approved:${sceneCount}`;

      const mediaProject = await waitForProjectStageStatus(summary.id, "preview-render", ["needs_review"], 900_000);
      phases.voiceGeneration = mediaProject.stages.find((stage) => stage.id === "voice-generation")?.status === "approved" ? "approved" : "not_approved";
      phases.subtitles = mediaProject.stages.find((stage) => stage.id === "subtitle-preparation")?.status === "approved" ? "approved" : "not_approved";
      if (requireFullFlow && (phases.voiceGeneration !== "approved" || phases.subtitles !== "approved")) {
        throw new Error(`Automatic media generation did not approve Voice and Subtitles (${phases.voiceGeneration}, ${phases.subtitles}).`);
      }

      await waitForText(win, "Final Preview", 900_000);
      await waitForText(win, "Approve Final Video", 900_000);
      const previewText = await pageText(win);
      phases.finalPreview = previewText.includes("No reviewable preview yet") ? "screen_reached_empty" : "real_preview_visible";
      if (requireFullFlow && phases.finalPreview !== "real_preview_visible") throw new Error("Final Preview did not contain a real reviewable video.");
      await clickText(win, "Approve Final Video");
      await waitForProjectStageStatus(summary.id, "packaging-export", ["approved"], 900_000);
      phases.previewApproval = "approved";
      phases.packagingExport = "approved";
      await clickText(win, "Export");
      await waitForText(win, "Final MP4", 30_000);
      phases.export = "verified";
    }
  } catch (error) {
    if (requireFullFlow) throw error;
    phases.ideaSelection = "blocked_or_not_reached";
    runtimeNotes.push("Preparation checkpoint was unavailable; the persisted stage status and safe reason are recorded below.");
  }

  if (phases.export !== "verified") {
    for (const route of ["Scene Review", "Final Preview", "Export"] as const) {
      try {
        await clickText(win, route);
        await assertText(win, route);
        const routeText = await pageText(win);
        if (route === "Scene Review") phases.sceneReview = routeText.includes("Scenes are not ready yet") ? "screen_reached_empty" : "reviewable_assets_visible";
        if (route === "Final Preview") phases.finalPreview = routeText.includes("No reviewable preview yet") ? "screen_reached_empty" : "reviewable_preview_visible";
        if (route === "Export") phases.export = "screen_reached";
      } catch (error) {
        runtimeNotes.push(`${route} screen unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  const finalProject = projectRepository.loadProject(summary.id);
  const stageStatuses = Object.fromEntries((finalProject?.stages ?? []).map((stage) => [stage.id, stage.status]));
  const ideaStage = finalProject?.stages.find((stage) => stage.id === "idea-lab");
  const safeBlocker = ideaStage?.attention?.message;
  if (safeBlocker) runtimeNotes.push(`Idea Lab blocker: ${safeBlocker}`);
  const exportArtifact = workflowRunStore.listArtifacts(summary.id, "packaging-export").find((artifact) => artifact.status === "approved");
  const mp4RelativeFilePath = typeof exportArtifact?.payloadJson?.mp4RelativeFilePath === "string" ? exportArtifact.payloadJson.mp4RelativeFilePath : undefined;
  let finalMp4Verified = false;
  if (mp4RelativeFilePath) {
    try {
      const absolutePath = resolve(workspaceRoot, mp4RelativeFilePath);
      finalMp4Verified = statSync(absolutePath).isFile() && statSync(absolutePath).size > 0;
    } catch {
      finalMp4Verified = false;
    }
  }
  if (!finalMp4Verified) runtimeNotes.push("Final MP4 was not verified in the isolated runtime; no export completion is claimed.");
  if (requireFullFlow && !finalMp4Verified) throw new Error("VOX Simple Flow did not produce a verified final MP4.");

  return {
    phase: "runtime_evidence_recorded",
    configuration,
    selectedVoice: selectedVoiceId,
    phases,
    stageStatuses,
    finalMp4: { verified: finalMp4Verified, ...(mp4RelativeFilePath ? { relativeFilePath: mp4RelativeFilePath } : {}) },
    runtimeNotes
  };
}

async function waitForProjectStageStatus(
  projectId: string,
  stageId: string,
  expected: WorkflowStageStatus[],
  timeoutMs: number
): Promise<FactoryProject> {
  const started = Date.now();
  let latest: FactoryProject | undefined;
  while (Date.now() - started < timeoutMs) {
    latest = projectRepository.loadProject(projectId) ?? undefined;
    const stage = latest?.stages.find((item) => item.id === stageId);
    if (stage && expected.includes(stage.status)) return latest!;
    const failedStage = latest?.stages.find((item) => item.status === "failed" || item.status === "needs_attention");
    if (failedStage) {
      throw new Error(`${failedStage.id} stopped with status ${failedStage.status}: ${failedStage.attention?.message ?? "no safe reason recorded"}`);
    }
    await delay(500);
  }
  const stage = latest?.stages.find((item) => item.id === stageId);
  throw new Error(`Timed out waiting for ${stageId} to reach ${expected.join(" or ")}; current status ${stage?.status ?? "missing"}.`);
}

async function waitForEnabledControl(win: BrowserWindow, label: string, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const count = await win.webContents.executeJavaScript(
      `(() => Array.from(document.querySelectorAll("button,a")).filter((element) => {
        const text = [element.innerText, element.textContent, element.getAttribute("aria-label"), element.getAttribute("title")].filter(Boolean).join(" ").replace(/\\s+/g, " ").trim();
        return !element.disabled && (text === ${JSON.stringify(label)} || text.includes(${JSON.stringify(label)}));
      }).length)()`,
      true
    ) as number;
    if (count > 0) return;
    await delay(500);
  }
  throw new Error(`Timed out waiting for enabled control: ${label}`);
}

async function waitForPersistedProject(topic: string): Promise<ReturnType<ProjectRepository["listProjects"]>[number]> {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    const project = projectRepository.listProjects().find((item) => item.topic === topic);
    if (project) return project;
    await delay(250);
  }
  throw new Error(`Timed out waiting for persisted project: ${topic}`);
}

async function waitForOneOfPageText(win: BrowserWindow, expected: string[], timeoutMs: number): Promise<string> {
  const started = Date.now();
  let text = "";
  while (Date.now() - started < timeoutMs) {
    text = await pageText(win).catch(() => "");
    if (expected.some((value) => text.includes(value))) return text;
    await delay(250);
  }
  throw new Error(`Timed out waiting for one of: ${expected.join(", ")}. Page text: ${text.slice(0, 600)}`);
}

async function waitForRenderer(win: BrowserWindow): Promise<void> {
  await Promise.race([
    new Promise<void>((resolve, reject) => {
      if (!win.webContents.isLoading()) {
        resolve();
        return;
      }
      win.webContents.once("did-finish-load", () => resolve());
      win.webContents.once("did-fail-load", (_event, errorCode, errorDescription) => {
        reject(new Error(`Renderer load failed (${errorCode}): ${errorDescription}`));
      });
    }),
    delay(15_000).then(() => {
      throw new Error("Renderer load timed out.");
    })
  ]);
  await waitForText(win, "Long/Short Factory", 15_000);
}

async function waitForText(win: BrowserWindow, expected: string, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const text = await pageText(win).catch(() => "");
    if (text.includes(expected)) return;
    await delay(250);
  }
  throw new Error(`Timed out waiting for page text: ${expected}`);
}

function writeUiVerificationReport(reportPath: string, data: Record<string, unknown>): void {
  writeFileSync(reportPath, JSON.stringify(data, null, 2));
}

function updateProjectStage(project: FactoryProject, stageId: string, status: WorkflowStageStatus, attention?: StageAttention): FactoryProject {
  return {
    ...project,
    stages: normalizeProjectStages(project.stages).map((stage) => {
      if (stage.id !== stageId) return stage;
      const nextStage = { ...stage, status };
      if (attention) nextStage.attention = attention;
      else if (status !== "failed" && status !== "needs_attention") delete nextStage.attention;
      return nextStage;
    })
  };
}

function transitionProjectStage(project: FactoryProject, stageId: string, status: WorkflowStageStatus): FactoryProject {
  const current = normalizeProjectStages(project.stages).find((stage) => stage.id === stageId);
  if (!current) throw new Error(`Unknown workflow stage: ${stageId}`);
  if (current.status !== status) assertWorkflowStageTransition(current.status, status);
  const updated = updateProjectStage(project, stageId, status);
  return status === "approved" ? markDownstreamStagesStale(updated, stageId) : updated;
}

function stageDependencyChainApproved(
  stages: ReturnType<typeof normalizeProjectStages>,
  stageId: string,
  referenceSetStatus: ReferenceSetState["status"] | undefined,
  topicModeWithoutReferences = false,
  visited = new Set<string>()
): boolean {
  if (visited.has(stageId)) return false;
  const nextVisited = new Set(visited);
  nextVisited.add(stageId);
  const definition = getWorkflowStageDefinition(stageId);
  if (definition?.requiredInputTypes.includes("reference-set.approved") && referenceSetStatus !== "approved") return false;
  const dependencies = topicModeWithoutReferences && stageId === "idea-lab" ? [] : definition?.dependsOn ?? [];
  return !definition || dependencies.every((dependencyId) =>
    stages.find((item) => item.id === dependencyId)?.status === "approved"
    && stageDependencyChainApproved(stages, dependencyId, referenceSetStatus, topicModeWithoutReferences, nextVisited)
  );
}

function currentApprovedArtifacts(project: FactoryProject, stageId: string): WorkflowArtifact[] {
  const stages = normalizeProjectStages(project.stages);
  const stage = stages.find((item) => item.id === stageId);
  if (stage?.status !== "approved") return [];
  const definition = getWorkflowStageDefinition(stageId);
  if (definition?.requiredInputTypes.includes("reference-set.approved") && project.referenceSet?.status !== "approved") return [];
  const topicModeWithoutReferences = project.setup.inputMode === "topic"
    && project.competitorReferences.every((reference) => reference.included === false);
  if (!stageDependencyChainApproved(stages, stageId, project.referenceSet?.status, topicModeWithoutReferences)) return [];
  return backedApprovedArtifacts(project.id, stageId, topicModeWithoutReferences);
}

type ClaimMapSource = {
  id: string;
  sourceType: "primary" | "secondary";
  excerpt: string;
  title: string;
};

function buildClaimMapReferenceSources(project: FactoryProject): { sources: ClaimMapSource[]; inputArtifactIds: string[] } {
  const originalityArtifact = currentApprovedArtifacts(project, "originality-review").find((artifact) => artifact.payloadJson);
  if (!originalityArtifact?.payloadJson) throw new Error("Claim Map requires an approved Originality Review artifact.");
  const references = project.competitorReferences.filter((reference) => reference.included !== false && reference.status === "approved");
  if (!references.length) throw new Error("Claim Map requires at least one approved competitor reference.");
  const cleanedArtifacts = currentApprovedArtifacts(project, "transcript-cleaning");
  const cleanedByReference = new Map<string, { transcript: string; artifactId: string }>(cleanedArtifacts.flatMap((artifact) => {
    if (!artifact.payloadJson) return [];
    const payload = cleanedTranscriptOutputSchema.safeParse(artifact.payloadJson);
    return payload.success ? [[payload.data.referenceId, { transcript: payload.data.cleanedTranscript, artifactId: artifact.id }] as const] : [];
  }));
  const sources = references.map((reference, index) => {
    const cleaned = cleanedByReference.get(reference.id);
    return {
      id: `reference-source-${reference.id}`,
      sourceType: "secondary" as const,
      title: reference.sourceUrl?.trim() || `Competitor reference ${index + 1}`,
      excerpt: (cleaned?.transcript ?? reference.pastedTranscript).trim()
    };
  });
  return {
    sources,
    inputArtifactIds: [originalityArtifact.id, ...cleanedArtifacts.filter((artifact) => artifact.payloadJson).map((artifact) => artifact.id)]
  };
}

function backedApprovedArtifacts(projectId: string, stageId: string, allowTopicIdeaWithoutReferences = false): WorkflowArtifact[] {
  return selectCurrentBackedApprovedArtifacts(projectId, stageId, workflowRunStore, {
    perReferenceStages: perReferenceArtifactStages,
    ...(allowTopicIdeaWithoutReferences ? { allowTopicIdeaWithoutReferences: true } : {})
  });
}

function markReferenceChangeStale(project: FactoryProject): FactoryProject {
  const staleStages = getWorkflowStageImpactIds("reference-validation");
  return {
    ...project,
    referenceSet: { ...(project.referenceSet ?? { status: "not_started" }), status: "stale" },
    stages: normalizeProjectStages(project.stages).map((stage) => (
      staleStages.has(stage.id) && (stage.status === "queued" || stage.status === "running" || stage.status === "needs_review" || stage.status === "approved" || stage.status === "ready")
        ? { ...stage, status: "stale" }
        : stage
    ))
  };
}

function currentReviewableArtifacts(project: FactoryProject, stageId: string): WorkflowArtifact[] {
  const runs = new Map(workflowRunStore.listRuns(project.id, stageId).map((run) => [run.id, run]));
  return workflowRunStore.listArtifacts(project.id, stageId).filter((artifact) => {
    if (artifact.status !== "needs_review" || !artifact.stageRunId) return false;
    const run = runs.get(artifact.stageRunId);
    return run?.status === "needs_review" && run.outputArtifactIds.includes(artifact.id);
  });
}

function registerPreviewMediaProtocol(): void {
  protocol.handle("lsf-media", (request) => {
    const requestUrl = new URL(request.url);
    const token = requestUrl.pathname.slice(1);
    const assetMedia = assetPreviewMediaFiles.get(token);
    if (requestUrl.hostname !== "preview" || !token) return new Response("Not found", { status: 404 });
    if (assetMedia) {
      if (!existsSync(assetMedia.outputPath)) return new Response("Not found", { status: 404 });
      const artifact = workflowRunStore.getArtifact(assetMedia.projectId, assetMedia.artifactId);
      const parsed = artifact?.payloadJson ? assetReviewOutputSchema.safeParse(artifact.payloadJson) : null;
      const asset = parsed?.success ? parsed.data.assets.find((item) => item.asset.sha256 === assetMedia.assetSha256) : undefined;
      if (!artifact || (artifact.status !== "needs_review" && artifact.status !== "approved") || !asset || asset.asset.relativeFilePath !== relative(workspaceRoot, assetMedia.outputPath)) return new Response("Not found", { status: 404 });
      const bytes = readFileSync(assetMedia.outputPath);
      return new Response(request.method === "HEAD" ? null : bytes, { status: 200, headers: { "Cache-Control": "no-store", "Content-Length": String(bytes.length), "Content-Type": assetMedia.mimeType } });
    }
    const media = previewMediaFiles.get(token);
    if (!media || !existsSync(media.outputPath)) {
      return new Response("Not found", { status: 404 });
    }
    const artifact = workflowRunStore.getArtifact(media.projectId, media.artifactId);
    const parsed = artifact?.payloadJson ? previewRenderOutputSchema.safeParse(artifact.payloadJson) : null;
    if (!artifact || (artifact.status !== "needs_review" && artifact.status !== "approved") || !parsed || !parsed.success || artifact.relativeFilePath !== parsed.data.relativeFilePath || parsed.data.relativeFilePath !== relative(workspaceRoot, media.outputPath)) {
      return new Response("Not found", { status: 404 });
    }
    const bytes = readFileSync(media.outputPath);
    const range = request.headers.get("range");
    let body = bytes;
    let status = 200;
    const headers: Record<string, string> = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      "Content-Length": String(bytes.length),
      "Content-Type": "video/mp4"
    };
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      const start = match?.[1] ? Number(match[1]) : 0;
      const end = match?.[2] ? Number(match[2]) : bytes.length - 1;
      if (!match || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= bytes.length) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.length}` } });
      }
      const boundedEnd = Math.min(end, bytes.length - 1);
      body = bytes.subarray(start, boundedEnd + 1);
      status = 206;
      headers["Content-Length"] = String(body.length);
      headers["Content-Range"] = `bytes ${start}-${boundedEnd}/${bytes.length}`;
    }
    return new Response(request.method === "HEAD" ? null : body, { status, headers });
  });
}

function markReferenceInputChanged(project: FactoryProject): FactoryProject {
  if (project.referenceSet?.status === "approved") return markReferenceChangeStale(project);
  const referenceSet = project.referenceSet?.status && project.referenceSet.status !== "not_started"
    ? { status: "needs_validation" as const }
    : project.referenceSet;
  return {
    ...project,
    ...(referenceSet ? { referenceSet } : {}),
    stages: normalizeProjectStages(project.stages).map((stage) => (
      stage.id === "reference-validation" && (stage.status === "queued" || stage.status === "running" || stage.status === "needs_review" || stage.status === "approved" || stage.status === "ready")
        ? { ...stage, status: "stale" }
        : stage
    ))
  };
}

function markDownstreamStagesStale(project: FactoryProject, stageId: string): FactoryProject {
  const staleStageIds = getDownstreamWorkflowStageIds(stageId);
  if (!staleStageIds.size) return project;
  return {
    ...project,
    stages: normalizeProjectStages(project.stages).map((stage) => (
      staleStageIds.has(stage.id) && (stage.status === "queued" || stage.status === "running" || stage.status === "needs_review" || stage.status === "approved" || stage.status === "ready")
        ? { ...stage, status: "stale" }
        : stage
    ))
  };
}

function saveProjectWithWorkflowInvalidation(project: FactoryProject, options: { invalidateArtifacts?: boolean; withinTransaction?: boolean } = {}): FactoryProject {
  const normalized = { ...project, stages: normalizeProjectStages(project.stages) };
  const staleStageIds = normalized.stages.filter((stage) => stage.status === "stale").map((stage) => stage.id);
  if (!options.withinTransaction) db.exec("BEGIN IMMEDIATE;");
  try {
    projectRepository.saveProject(normalized, { withinTransaction: true });
    if (options.invalidateArtifacts || normalized.referenceSet?.status === "stale") workflowRunStore.markProjectArtifactsStale(normalized.id);
    else workflowRunStore.markStageArtifactsStale(normalized.id, staleStageIds);
    if (!options.withinTransaction) db.exec("COMMIT;");
    return normalized;
  } catch (error) {
    if (!options.withinTransaction) db.exec("ROLLBACK;");
    throw error;
  }
}

function saveAndReturnProject(project: FactoryProject, options: { invalidateArtifacts?: boolean } = {}): FactoryProject {
  let normalized: FactoryProject;
  db.exec("BEGIN IMMEDIATE;");
  try {
    normalized = saveProjectWithWorkflowInvalidation(project, { ...options, withinTransaction: true });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  return normalized;
}

function canonicalSha256(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(Object.entries(input as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, normalize(item)]));
    }
    return input;
  };
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}

function isPendingOrAcceptedRun(run: { status: WorkflowStageStatus } | null | undefined): boolean {
  return run?.status === "queued" || run?.status === "running" || run?.status === "needs_review" || run?.status === "approved";
}

function isDeterministicAttentionCategory(category: string): boolean {
  return category === "invalid_output" || category === "output_content_invalid" || category === "invalid_json" || category === "json_schema_mismatch";
}

function currentApprovalActor(project: FactoryProject): string {
  return project.synthetic === true && process.env.LSF_MAIN_FLOW_SYNTHETIC_APPROVALS === "1"
    ? "main-flow-test-agent"
    : "user";
}

function referenceValidationInputFingerprint(projectId: string, references: CompetitorReference[]): string {
  return canonicalSha256({
    projectId,
    validatorVersion: referenceValidationVersion,
    references: references
      .filter((reference) => reference.included !== false)
      .map((reference) => ({
        id: reference.id,
        identityKey: reference.identityKey ?? normalizeReferenceIdentity(reference.sourceUrl) ?? `manual:${reference.id}`,
        currentVersionId: reference.id,
        included: true,
        version: reference.version ?? 1,
        contentFingerprint: reference.contentFingerprint ?? canonicalSha256(reference.pastedTranscript.trim())
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
  });
}

function currentTextProviderExecution(): { providerId: "9router"; configuredModelId: string; providerConfigurationFingerprint: string } {
  const settings = credentialStore.loadProviderCredentialSettings("9router");
  const configuredModelId = settings?.textModel ?? "";
  return {
    providerId: "9router",
    configuredModelId,
    providerConfigurationFingerprint: canonicalSha256({
      providerId: "9router",
      baseUrl: settings?.baseUrl ?? "",
      configuredModelId,
      credentialVersionRef: credentialStore.loadProviderCredentialVersionRef("9router") ?? null
    })
  };
}

function referenceValidationPayloadFingerprint(projectId: string, references: Array<{
  id: string;
  identityKey?: string | undefined;
  included?: boolean | undefined;
  sourceUrl?: string | undefined;
  pastedTranscript: string;
  contentFingerprint?: string | undefined;
  version?: number | undefined;
}>): string {
  return canonicalSha256({
    projectId,
    validatorVersion: referenceValidationVersion,
    references: references
      .filter((reference) => reference.included !== false)
      .map((reference) => ({
        id: reference.id,
        identityKey: reference.identityKey ?? normalizeReferenceIdentity(reference.sourceUrl) ?? `manual:${reference.id}`,
        currentVersionId: reference.id,
        included: true,
        version: reference.version ?? 1,
        contentFingerprint: reference.contentFingerprint ?? canonicalSha256(reference.pastedTranscript.trim())
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
  });
}

function referenceVersionRootId(reference: CompetitorReference, references: CompetitorReference[]): string {
  const byId = new Map(references.map((item) => [item.id, item]));
  const visited = new Set<string>();
  let current = reference;
  while (current.parentReferenceId && !visited.has(current.id)) {
    visited.add(current.id);
    const parent = byId.get(current.parentReferenceId);
    if (!parent) break;
    current = parent;
  }
  return current.id;
}

async function pageText(win: BrowserWindow): Promise<string> {
  return win.webContents.executeJavaScript("document.body.innerText", true) as Promise<string>;
}

async function bodyHtml(win: BrowserWindow): Promise<string> {
  const html = await win.webContents.executeJavaScript("document.body.innerHTML", true) as string;
  return html.slice(0, 3000);
}

async function assertText(win: BrowserWindow, expected: string): Promise<void> {
  const started = Date.now();
  let text = "";
  while (Date.now() - started < 5_000) {
    text = await pageText(win);
    if (text.includes(expected)) return;
    await delay(250);
  }
  throw new Error(`Expected page text to include: ${expected}. Page text: ${text.slice(0, 600)}`);
}

async function assertOneOfText(win: BrowserWindow, expected: string[]): Promise<void> {
  const started = Date.now();
  let text = "";
  while (Date.now() - started < 5_000) {
    text = await pageText(win);
    if (expected.some((value) => text.includes(value))) return;
    await delay(250);
  }
  throw new Error(`Expected page text to include one of: ${expected.join(", ")}. Page text: ${text.slice(0, 600)}`);
}

async function assertNoText(win: BrowserWindow, forbidden: string): Promise<void> {
  const text = await pageText(win);
  if (text.includes(forbidden)) {
    throw new Error(`Forbidden text was rendered: ${forbidden}`);
  }
}

async function clickText(win: BrowserWindow, label: string): Promise<void> {
  const result = await win.webContents.executeJavaScript(
    `(() => {
      const elements = Array.from(document.querySelectorAll("button,a"));
      const normalize = (value) => (value || "").replace(/\\s+/g, " ").trim();
      const textOf = (el) => normalize([el.innerText, el.textContent, el.getAttribute("aria-label"), el.getAttribute("title")].filter(Boolean).join(" "));
      const exact = elements.filter((el) => textOf(el) === ${JSON.stringify(label)});
      const partial = elements.filter((el) => textOf(el).includes(${JSON.stringify(label)}));
      const target = exact.find((el) => !el.disabled) || partial.find((el) => !el.disabled);
      if (!target) {
        return { clicked: false, controls: elements.map((el) => ({ text: textOf(el), disabled: Boolean(el.disabled) })).slice(0, 80) };
      }
      target.click();
      return { clicked: true, controls: [] };
    })()`,
    true
  ) as { clicked: boolean; controls: Array<{ text: string; disabled: boolean }> };
  if (!result.clicked) {
    throw new Error(`Could not click enabled control: ${label}. Controls: ${JSON.stringify(result.controls).slice(0, 1200)}`);
  }
  await delay(500);
}

async function clickProjectOpen(win: BrowserWindow, topic: string): Promise<void> {
  const clicked = await win.webContents.executeJavaScript(
    `(() => {
      const rows = Array.from(document.querySelectorAll("tr"));
      const row = rows.find((item) => (item.innerText || "").includes(${JSON.stringify(topic)}));
      const button = row && Array.from(row.querySelectorAll("button")).find((item) => (item.innerText || "").includes("Open"));
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()`,
    true
  );
  if (!clicked) {
    throw new Error(`Could not open project row: ${topic}`);
  }
  await delay(700);
}

async function setInputValue(win: BrowserWindow, selector: string, value: string): Promise<void> {
  const updated = await win.webContents.executeJavaScript(
    `(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input) return false;
      const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
      descriptor.set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`,
    true
  );
  if (!updated) {
    throw new Error(`Could not set input: ${selector}`);
  }
  await delay(200);
}

async function setSelectValue(win: BrowserWindow, selector: string, value: string): Promise<string> {
  const selected = await win.webContents.executeJavaScript(
    `(() => {
      const select = document.querySelector(${JSON.stringify(selector)});
      if (!(select instanceof HTMLSelectElement)) return "";
      const option = Array.from(select.options).find((item) => item.value === ${JSON.stringify(value)} && !item.disabled);
      if (!option) return "";
      const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
      descriptor?.set?.call(select, option.value);
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return select.value;
    })()`,
    true
  ) as string;
  if (selected !== value) throw new Error(`Could not set select ${selector} to ${value}.`);
  await delay(300);
  return selected;
}

async function selectFirstAvailableOption(win: BrowserWindow, selector: string): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    const selected = await win.webContents.executeJavaScript(
      `(() => {
        const select = document.querySelector(${JSON.stringify(selector)});
        if (!(select instanceof HTMLSelectElement)) return "";
        const option = Array.from(select.options).find((item) => item.value && !item.disabled);
        if (!option) return "";
        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
        descriptor?.set?.call(select, option.value);
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return select.value;
      })()`,
      true
    ) as string;
    if (selected) {
      await delay(300);
      return selected;
    }
    await delay(250);
  }
  return "";
}

async function readSelectValue(win: BrowserWindow, selector: string): Promise<string> {
  return await win.webContents.executeJavaScript(
    `(() => {
      const select = document.querySelector(${JSON.stringify(selector)});
      return select instanceof HTMLSelectElement ? select.value : "";
    })()`,
    true
  ) as string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

ipcMain.handle("bootstrap", async () => ({
  profiles: seedChannelProfiles,
  workspaceRoot,
  databasePath,
  projects: projectRepository.listProjects(),
  queue: queue.snapshotWorkers(),
  runtime: await probeRuntimeEnvironment()
}));

ipcMain.handle("route-topic", (_event, input: unknown) => {
  const parsed = channelRouteInputSchema.parse(input);
  return channelRouteDecisionResponseSchema.parse(routeChannelProfile(seedChannelProfiles, {
    topic: parsed.topic,
    format: parsed.format,
    targetLanguage: parsed.targetLanguage,
    ...(parsed.description ? { description: parsed.description } : {}),
    ...(parsed.selectedProfileId ? { selectedProfileId: parsed.selectedProfileId } : {})
  }));
});

ipcMain.handle("fixture-project", (_event, input: unknown) => {
  const parsed = typeof input === "string" ? { topic: input, format: "long", targetLanguage: "English" } : input;
  const request = createProjectRequestSchema.parse(parsed);
  const competitorReference = request.competitorReference
    ? {
        ...(request.competitorReference.sourceUrl ? { sourceUrl: request.competitorReference.sourceUrl } : {}),
        pastedTranscript: request.competitorReference.pastedTranscript,
        ...(request.competitorReference.notes ? { notes: request.competitorReference.notes } : {})
      }
    : undefined;
  const project = createFixtureProject({
    topic: request.topic,
    ...(request.synthetic && process.env.LSF_MAIN_FLOW_SYNTHETIC === "1" ? { synthetic: true } : {}),
    format: request.format,
    targetLanguage: request.targetLanguage,
    ...(request.selectedProfileId ? { selectedProfileId: request.selectedProfileId } : {}),
    profiles: seedChannelProfiles,
    ...(request.targetDuration ? { targetDuration: request.targetDuration } : {}),
    ...(request.projectName ? { projectName: request.projectName } : {}),
    ...(request.workflowMode ? { workflowMode: request.workflowMode } : {}),
    inputMode: request.inputMode === "topic" && competitorReference ? "reference" : request.inputMode,
    ...(request.aspectRatio ? { aspectRatio: request.aspectRatio } : {}),
    visualStyle: request.visualStyle,
    ...(request.voiceId ? { voiceId: request.voiceId } : {}),
    outputResolution: request.outputResolution,
    ...(request.sourceScript ? { sourceScript: request.sourceScript } : {}),
    ...(request.referenceUrl ? { referenceUrl: request.referenceUrl } : {}),
    ...(competitorReference ? { competitorReference } : {})
  });
  projectRepository.createProject(project);
  logger.info("project_created", { projectId: project.id, topic: project.topic });
  return factoryProjectResponseSchema.parse(project);
});

ipcMain.handle("add-competitor-reference", (_event, input: unknown) => {
  const request = addCompetitorReferenceRequestSchema.parse(input);
  db.exec("BEGIN IMMEDIATE;");
  try {
    const project = projectRepository.loadProject(request.projectId);
    if (!project) throw new Error(`Project not found: ${request.projectId}`);
    const identityKey = normalizeReferenceIdentity(request.sourceUrl);
    const existingReference = findDuplicateReference(project.competitorReferences, identityKey);
    if (existingReference) {
      db.exec("COMMIT;");
      logger.info("competitor_reference_duplicate_detected", { projectId: request.projectId, referenceId: existingReference.id });
      return addCompetitorReferenceResponseSchema.parse({
        status: "duplicate",
        duplicate: true,
        project,
        existingReference,
        existingReferenceId: existingReference.id,
        existingCurrentVersionId: existingReference.id,
        ...(identityKey ? { canonicalSourceId: identityKey } : {}),
        message: "This video already exists in the project."
      });
    }
    const now = new Date().toISOString();
    const referenceChangeProject = project.referenceSet?.status === "approved" || project.referenceSet?.status === "valid" ? markReferenceInputChanged(project) : project;
    const nextProject = updateProjectStage({
      ...referenceChangeProject,
      referenceSet: { status: "needs_validation" },
      competitorReferences: [
        ...project.competitorReferences,
        {
          id: `competitor-${randomUUID()}`,
          ...(identityKey ? { identityKey } : {}),
          ...(request.sourceUrl ? { sourceUrl: request.sourceUrl.trim() } : {}),
          pastedTranscript: request.pastedTranscript,
          ...(request.notes ? { notes: request.notes.trim() } : {}),
          status: "draft" as const,
          included: true,
          version: 1,
          createdAt: now,
          updatedAt: now
        }
      ]
    }, "reference-intake", "approved");
    const savedProject = saveProjectWithWorkflowInvalidation(nextProject, { withinTransaction: true, invalidateArtifacts: project.referenceSet?.status === "approved" });
    db.exec("COMMIT;");
    logger.info("competitor_reference_added", { projectId: request.projectId });
    return addCompetitorReferenceResponseSchema.parse({
      status: "saved",
      project: savedProject,
      message: "Competitor reference saved as Draft."
    });
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
});

ipcMain.handle("replace-competitor-reference", (_event, input: unknown) => {
  const request = replaceCompetitorReferenceRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const existingReference = project.competitorReferences.find((reference) => reference.id === request.referenceId);
  if (!existingReference) throw new Error(`Reference not found: ${request.referenceId}`);
  const now = new Date().toISOString();
  const {
    validationErrors: _validationErrors,
    validationWarnings: _validationWarnings,
    validatedAt: _validatedAt,
    validatorVersion: _validatorVersion,
    contentFingerprint: _contentFingerprint,
    ...referenceVersionBase
  } = existingReference;
  const nextReference: CompetitorReference = {
    ...referenceVersionBase,
    id: `competitor-${randomUUID()}`,
    pastedTranscript: request.pastedTranscript,
    ...(request.notes ? { notes: request.notes.trim() } : {}),
    status: "draft",
    included: true,
    version: (existingReference.version ?? 1) + 1,
    parentReferenceId: existingReference.id,
    createdAt: now,
    updatedAt: now
  };
  const nextProject = markReferenceInputChanged({
    ...project,
    competitorReferences: project.competitorReferences.map((reference) =>
      reference.id === existingReference.id ? { ...reference, included: false, updatedAt: now } : reference
    ).concat(nextReference)
  });
  const savedProject = saveAndReturnProject(transitionProjectStage(nextProject, "reference-intake", "approved"));
  logger.info("competitor_reference_replaced", { projectId: request.projectId, referenceId: existingReference.id });
  return factoryProjectResponseSchema.parse(savedProject);
});

ipcMain.handle("edit-competitor-reference", (_event, input: unknown) => {
  const request = editCompetitorReferenceRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const now = new Date().toISOString();
  const existingReference = project.competitorReferences.find((reference) => reference.id === request.referenceId);
  if (!existingReference) throw new Error(`Reference not found: ${request.referenceId}`);
  const identityKey = normalizeReferenceIdentity(request.sourceUrl ?? existingReference.sourceUrl);
  const duplicate = findDuplicateReference(project.competitorReferences, identityKey);
  if (duplicate && referenceVersionRootId(duplicate, project.competitorReferences) !== referenceVersionRootId(existingReference, project.competitorReferences)) {
    throw new Error("Another reference already uses this source identity.");
  }
  const nextProject = markReferenceInputChanged({
    ...project,
    competitorReferences: project.competitorReferences.map((reference) => {
      if (reference.id !== request.referenceId) return reference;
      const {
        identityKey: previousIdentityKey,
        sourceUrl: previousSourceUrl,
        notes: previousNotes,
        validationErrors: _validationErrors,
        validationWarnings: _validationWarnings,
        validatedAt: _validatedAt,
        validatorVersion: _validatorVersion,
        contentFingerprint: _contentFingerprint,
        ...editableReference
      } = reference;
      return {
        ...editableReference,
        ...(request.sourceUrl !== undefined
          ? (request.sourceUrl.trim() ? { ...(identityKey ? { identityKey } : {}), sourceUrl: request.sourceUrl.trim() } : {})
          : {
              ...(previousIdentityKey ? { identityKey: previousIdentityKey } : {}),
              ...(previousSourceUrl ? { sourceUrl: previousSourceUrl } : {})
            }),
        pastedTranscript: request.pastedTranscript,
        ...(request.notes !== undefined
          ? (request.notes.trim() ? { notes: request.notes.trim() } : {})
          : (previousNotes ? { notes: previousNotes } : {})),
        status: "draft",
        validationMessage: "Reference was edited and must be validated again.",
        updatedAt: now
      };
    })
  });
  const savedProject = saveAndReturnProject(transitionProjectStage(nextProject, "reference-intake", "approved"));
  logger.info("competitor_reference_edited", { projectId: request.projectId, referenceId: request.referenceId });
  return factoryProjectResponseSchema.parse(savedProject);
});

ipcMain.handle("delete-competitor-reference", (_event, input: unknown) => {
  const request = referenceIdRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const reference = project.competitorReferences.find((item) => item.id === request.referenceId);
  if (!reference) throw new Error(`Reference not found: ${request.referenceId}`);
  const nextProject = markReferenceInputChanged({
    ...project,
    competitorReferences: project.competitorReferences.filter((reference) => reference.id !== request.referenceId)
  });
  const savedProject = saveAndReturnProject(nextProject);
  logger.info("competitor_reference_deleted", { projectId: request.projectId, referenceId: request.referenceId });
  return factoryProjectResponseSchema.parse(savedProject);
});

ipcMain.handle("set-reference-included", (_event, input: unknown) => {
  const request = setReferenceIncludedRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const reference = project.competitorReferences.find((item) => item.id === request.referenceId);
  if (!reference) throw new Error(`Reference not found: ${request.referenceId}`);
  const nextProject = markReferenceInputChanged({
    ...project,
    competitorReferences: project.competitorReferences.map((reference) =>
      reference.id === request.referenceId ? { ...reference, included: request.included, updatedAt: new Date().toISOString() } : reference
    )
  });
  const savedProject = saveAndReturnProject(nextProject);
  logger.info("competitor_reference_include_changed", { projectId: request.projectId, referenceId: request.referenceId, included: request.included });
  return factoryProjectResponseSchema.parse(savedProject);
});

ipcMain.handle("get-reference-change-impact", () => referenceChangeImpactResponseSchema.parse({
  stageIds: [...getWorkflowStageImpactIds("reference-validation")],
  stageNames: [...getWorkflowStageImpactIds("reference-validation")]
    .map((stageId) => getWorkflowStageDefinition(stageId)?.name ?? stageId)
}));

ipcMain.handle("start-production-preparation", async (_event, input: unknown) => {
  const { projectId } = productionPreparationRequestSchema.parse(input);
  return factoryProjectResponseSchema.parse(await productionOrchestrator.startPreparation(projectId));
});

ipcMain.handle("continue-after-idea-selection", async (_event, input: unknown) => {
  const request = productionIdeaSelectionRequestSchema.parse(input);
  return factoryProjectResponseSchema.parse(await productionOrchestrator.continueAfterIdeaSelection(request.projectId, request.ideaId));
});

ipcMain.handle("start-media-generation", async (_event, input: unknown) => {
  const { projectId } = productionPreparationRequestSchema.parse(input);
  return factoryProjectResponseSchema.parse(await productionOrchestrator.startMediaGeneration(projectId));
});

ipcMain.handle("retry-scene", async (_event, input: unknown) => {
  const request = productionSceneRetryRequestSchema.parse(input);
  return factoryProjectResponseSchema.parse(await productionOrchestrator.retryScene(request.projectId, request.sceneId));
});

ipcMain.handle("continue-after-scene-review", async (_event, input: unknown) => {
  const { projectId } = productionPreparationRequestSchema.parse(input);
  return factoryProjectResponseSchema.parse(await productionOrchestrator.continueAfterSceneReview(projectId));
});

ipcMain.handle("render-production-preview", async (_event, input: unknown) => {
  const { projectId } = productionPreparationRequestSchema.parse(input);
  return factoryProjectResponseSchema.parse(await productionOrchestrator.renderPreview(projectId));
});

ipcMain.handle("continue-after-final-approval", async (_event, input: unknown) => {
  const { projectId } = productionPreparationRequestSchema.parse(input);
  return factoryProjectResponseSchema.parse(await productionOrchestrator.continueAfterFinalApproval(projectId));
});

ipcMain.handle("prepare-existing-script", async (_event, input: unknown) => {
  const { projectId } = productionPreparationRequestSchema.parse(input);
  const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error("Project not found.");
  if (project.setup.inputMode !== "existing_script") throw new Error("Existing Script preparation is only available for Existing Script mode.");
  if (project.stages.find((stage) => stage.id === "script")?.status === "approved") return factoryProjectResponseSchema.parse(project);
  const sourceScript = project.setup.sourceScript?.trim();
  if (!sourceScript) throw new Error("Existing Script input is empty.");
  const prepared = prepareExistingScript(sourceScript);
  const outlineOutput = outlineOutputSchema.parse({ sections: prepared.sections.map((section) => ({ id: `existing-outline-${section.id}`, purpose: section.purpose, keyPoint: section.narration.slice(0, 500), linkedClaimIds: [], estimatedSeconds: section.estimatedSeconds })) });
  const output = scriptOutputSchema.parse({ sections: prepared.sections.map((section, index) => ({ ...section, outlineSectionId: outlineOutput.sections[index]!.id })) });
  const inputFingerprint = canonicalSha256({ stageId: "script", sourceScript, targetDuration: project.setup.targetDuration, language: project.targetLanguage, runnerVersion: "existing-script-preparation-v1" });
  const existing = workflowRunStore.findLatestByInput(projectId, "script", inputFingerprint);
  if (isPendingOrAcceptedRun(existing)) return factoryProjectResponseSchema.parse(project);
  const outlineRunId = `stage-run-${randomUUID()}`;
  const outlineArtifactId = `artifact-${randomUUID()}`;
  const runId = `stage-run-${randomUUID()}`;
  const outlineRunning = transitionProjectStage(transitionProjectStage(project, "outline", "queued"), "outline", "running");
  const outlineReview = transitionProjectStage(outlineRunning, "outline", "needs_review");
  const outlineApproved = transitionProjectStage(outlineReview, "outline", "approved");
  const running = transitionProjectStage(transitionProjectStage(outlineApproved, "script", "queued"), "script", "running");
  const preparedSections = output.sections.map(({ openLoop, ...section }) => ({ ...section, ...(openLoop ? { openLoop } : {}) }));
  const review = transitionProjectStage({ ...running, scriptSections: preparedSections }, "script", "needs_review");
  const approved = transitionProjectStage(review, "script", "approved");
  const artifactId = `artifact-${randomUUID()}`;
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE;");
  try {
    saveProjectWithWorkflowInvalidation(approved, { withinTransaction: true });
    workflowRunStore.createRun({ id: outlineRunId, projectId, stageId: "outline", status: "running", runnerId: "existing-script-preparation-local", runnerVersion: "existing-script-preparation-v1", inputArtifactIds: [], inputFingerprint, outputArtifactIds: [], startedAt: now });
    workflowRunStore.finishRun({ id: outlineRunId, projectId, stageId: "outline", status: "approved", runnerId: "existing-script-preparation-local", runnerVersion: "existing-script-preparation-v1", inputArtifactIds: [], inputFingerprint, outputArtifactIds: [outlineArtifactId], finishedAt: now }, { id: outlineArtifactId, projectId, stageId: "outline", stageRunId: outlineRunId, type: "outline", version: workflowRunStore.listArtifacts(projectId, "outline").length + 1, status: "approved", payloadJson: outlineOutput, createdAt: now, updatedAt: now }, { withinTransaction: true });
    workflowRunStore.createRun({ id: runId, projectId, stageId: "script", status: "running", runnerId: "existing-script-preparation-local", runnerVersion: "existing-script-preparation-v1", inputArtifactIds: [outlineArtifactId], inputFingerprint, outputArtifactIds: [], startedAt: now });
    workflowRunStore.finishRun({ id: runId, projectId, stageId: "script", status: "needs_review", runnerId: "existing-script-preparation-local", runnerVersion: "existing-script-preparation-v1", inputArtifactIds: [outlineArtifactId], inputFingerprint, outputArtifactIds: [artifactId], finishedAt: now }, { id: artifactId, projectId, stageId: "script", stageRunId: runId, type: "script", version: workflowRunStore.listArtifacts(projectId, "script").length + 1, status: "needs_review", payloadJson: output, createdAt: now, updatedAt: now }, { withinTransaction: true });
    workflowRunStore.approveReviewRun(runId, { approvalMode: "automatic", withinTransaction: true });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  return factoryProjectResponseSchema.parse(approved);
});

ipcMain.handle("validate-reference-set", async (_event, input: unknown) => {
  const request = referenceSetRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const seenIdentityOwners = new Map<string, string>();
  const validatedAt = new Date().toISOString();
  const validatedReferences = project.competitorReferences.map((reference) => {
    const validation = validateReference(reference);
    const identityKey = validation.identityKey ?? reference.identityKey;
    const versionRootId = referenceVersionRootId(reference, project.competitorReferences);
    const existingOwner = identityKey ? seenIdentityOwners.get(identityKey) : undefined;
    const duplicate = Boolean(existingOwner && existingOwner !== versionRootId);
    if (identityKey && !existingOwner) seenIdentityOwners.set(identityKey, versionRootId);
    return {
      ...reference,
      ...(identityKey ? { identityKey } : {}),
      status: duplicate ? "duplicate" as const : validation.status,
      validationMessage: duplicate ? "This video already exists in the project." : validation.validationMessage,
      validationErrors: duplicate ? ["duplicate_source"] : validation.errors,
      validationWarnings: validation.warnings,
      validatedAt,
      validatorVersion: referenceValidationVersion,
      contentFingerprint: canonicalSha256(reference.pastedTranscript.trim()),
      included: reference.included !== false,
      updatedAt: validatedAt
    };
  });
  const referenceSet = await evaluateReferenceSet(validatedReferences, { projectId: project.id });
  const validationStatus = referenceSet.status === "valid" ? "needs_review" : "failed";
  const inputFingerprint = referenceValidationInputFingerprint(project.id, validatedReferences);
  const existingRun = workflowRunStore.findLatestByInput(project.id, "reference-validation", inputFingerprint);
  if (isPendingOrAcceptedRun(existingRun)) {
    return factoryProjectResponseSchema.parse(project);
  }
  const runnableProject = {
    ...project,
    competitorReferences: validatedReferences,
    referenceSet
  };
  const nextProject = transitionProjectStage(
    transitionProjectStage(
      transitionProjectStage(runnableProject, "reference-validation", "queued"),
      "reference-validation",
      "running"
    ),
    "reference-validation",
    validationStatus
  );
  const now = new Date().toISOString();
  const runId = `stage-run-${randomUUID()}`;
  const artifacts = workflowRunStore.listArtifacts(project.id, "reference-validation");
  const artifactId = `artifact-${randomUUID()}`;
  db.exec("BEGIN IMMEDIATE;");
  try {
    saveProjectWithWorkflowInvalidation(nextProject, { withinTransaction: true });
    const run = {
      id: runId,
      projectId: project.id,
      stageId: "reference-validation",
      status: validationStatus,
      runnerId: "reference-validation-local",
      runnerVersion: "reference-validation-v1",
      inputArtifactIds: validatedReferences.filter((reference) => reference.included !== false).map((reference) => reference.id),
      inputFingerprint,
      outputArtifactIds: validationStatus === "needs_review" ? [artifactId] : [],
      startedAt: now,
      finishedAt: now,
      ...(validationStatus === "failed" ? { safeErrorCategory: "validation_failed", safeErrorMessage: "Reference set validation found blocking issues." } : {})
    } as const;
    if (validationStatus === "needs_review") {
      workflowRunStore.completeRun(run, {
      id: artifactId,
      projectId: project.id,
      stageId: "reference-validation",
      stageRunId: runId,
      type: "reference-set.validated",
      version: artifacts.length + 1,
      status: "needs_review",
      payloadJson: { referenceSet, references: validatedReferences },
      createdAt: now,
      updatedAt: now
      }, { withinTransaction: true });
    } else {
      workflowRunStore.createRun(run);
    }
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  const savedProject = nextProject;
  logger.info("reference_set_validated", { projectId: request.projectId, status: referenceSet.status });
  return factoryProjectResponseSchema.parse(savedProject);
});

ipcMain.handle("approve-reference-set", (_event, input: unknown) => {
  const request = referenceSetRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const included = project.competitorReferences.filter((reference) => reference.included !== false);
  const hasInvalid = included.some((reference) => reference.status !== "valid" && reference.status !== "approved");
  const inputFingerprint = referenceValidationInputFingerprint(project.id, project.competitorReferences);
  const reviewRun = workflowRunStore.findLatestByInput(project.id, "reference-validation", inputFingerprint);
  if (!included.length || hasInvalid || project.referenceSet?.status !== "valid" || reviewRun?.status !== "needs_review") {
    throw new Error("Reference set must be valid before approval.");
  }
  const reviewArtifact = workflowRunStore.listArtifacts(project.id, "reference-validation")
    .find((artifact) => artifact.stageRunId === reviewRun.id && artifact.status === "needs_review" && reviewRun.outputArtifactIds.includes(artifact.id));
  if (!reviewArtifact) throw new Error("Reference validation review artifact is missing.");
  const validationPayload = referenceValidationArtifactResponseSchema.parse({
    id: reviewArtifact.id,
    stageRunId: reviewArtifact.stageRunId,
    status: reviewArtifact.status,
    payloadJson: reviewArtifact.payloadJson,
    createdAt: reviewArtifact.createdAt,
    updatedAt: reviewArtifact.updatedAt
  }).payloadJson;
  if (validationPayload.referenceSet.currentFingerprint !== project.referenceSet.currentFingerprint || referenceValidationPayloadFingerprint(project.id, validationPayload.references) !== inputFingerprint) {
    throw new Error("Reference validation artifact is stale.");
  }
  const now = new Date().toISOString();
  const approvedProject = transitionProjectStage({
    ...project,
    referenceSet: {
      ...(project.referenceSet ?? { status: "valid" }),
      status: "approved",
      approvedAt: now,
      approvalActor: currentApprovalActor(project)
    },
    competitorReferences: project.competitorReferences.map((reference) =>
      reference.included === false ? reference : { ...reference, status: "approved", updatedAt: now }
    )
  }, "reference-validation", "approved");
  db.exec("BEGIN IMMEDIATE;");
  try {
    saveProjectWithWorkflowInvalidation(approvedProject, { withinTransaction: true });
    workflowRunStore.approveReviewRun(reviewRun.id, { withinTransaction: true });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  const savedProject = approvedProject;
  logger.info("reference_set_approved", { projectId: request.projectId, includedCount: included.length });
  return factoryProjectResponseSchema.parse(savedProject);
});

ipcMain.handle("reject-reference-set", (_event, input: unknown) => {
  const request = referenceSetRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const inputFingerprint = referenceValidationInputFingerprint(project.id, project.competitorReferences);
  const reviewRun = workflowRunStore.findLatestByInput(project.id, "reference-validation", inputFingerprint);
  if (project.referenceSet?.status !== "valid" || reviewRun?.status !== "needs_review") {
    throw new Error("Reference set must be awaiting review before rejection.");
  }
  const rejectedProject = transitionProjectStage({
    ...project,
    referenceSet: {
      ...(project.referenceSet ?? { status: "valid" }),
      status: "rejected"
    }
  }, "reference-validation", "rejected");
  db.exec("BEGIN IMMEDIATE;");
  try {
    saveProjectWithWorkflowInvalidation(rejectedProject, { withinTransaction: true });
    workflowRunStore.rejectReviewRun(reviewRun.id, { withinTransaction: true });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  logger.info("reference_set_rejected", { projectId: request.projectId });
  return factoryProjectResponseSchema.parse(rejectedProject);
});

ipcMain.handle("revoke-reference-set-approval", (_event, input: unknown) => {
  const request = referenceSetRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  if (project.referenceSet?.status !== "approved") throw new Error("Reference set is not approved.");
  const savedProject = saveAndReturnProject(markReferenceChangeStale(project), { invalidateArtifacts: true });
  logger.info("reference_set_approval_revoked", { projectId: request.projectId });
  return factoryProjectResponseSchema.parse(savedProject);
});

ipcMain.handle("run-transcript-cleaning", async (_event, input: unknown) => {
  const request = runTranscriptCleaningRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const reference = project.competitorReferences.find((item) => item.id === request.referenceId);
  if (!reference || reference.included === false || reference.status !== "approved") {
    throw new Error("Transcript Cleaning requires an included, approved reference.");
  }
  const referenceSetArtifact = currentApprovedArtifacts(project, "reference-validation")
    .find((artifact) => Array.isArray(artifact.payloadJson?.references) && artifact.payloadJson.references.some((item) =>
      typeof item === "object" && item !== null && "id" in item && item.id === reference.id
    ));
  if (!referenceSetArtifact) {
    throw new Error("Transcript Cleaning requires an approved Reference Validation artifact for this reference.");
  }
  const textProviderExecution = currentTextProviderExecution();
  const inputFingerprint = canonicalSha256({
    stageId: "transcript-cleaning",
    referenceId: reference.id,
    referenceSetArtifactId: referenceSetArtifact.id,
    transcript: reference.pastedTranscript,
    version: reference.version ?? 1,
    providerConfigurationFingerprint: textProviderExecution.providerConfigurationFingerprint,
    selectedModel: textProviderExecution.configuredModelId,
    promptVersion: transcriptCleaningPromptVersion,
    runnerVersion: transcriptCleaningRunnerVersion
  });
  const existingRun = workflowRunStore.findLatestByInput(project.id, "transcript-cleaning", inputFingerprint);
  const activeReferenceRun = workflowRunStore.listRuns(project.id, "transcript-cleaning")
    .find((run) => isPendingOrAcceptedRun(run) && run.payloadJson?.referenceId === reference.id);
  if (isPendingOrAcceptedRun(existingRun) || activeReferenceRun) {
    return factoryProjectResponseSchema.parse(project);
  }

  const now = new Date().toISOString();
  const runId = `stage-run-${randomUUID()}`;
  const configuredModel = textProviderExecution.configuredModelId;
  let persistedChunks: unknown[] = Array.isArray(existingRun?.payloadJson?.chunks) ? existingRun.payloadJson.chunks : [];
  const queuedProject = transitionProjectStage(project, "transcript-cleaning", "queued");
  const runningProject = transitionProjectStage(queuedProject, "transcript-cleaning", "running");
  db.exec("BEGIN IMMEDIATE;");
  try {
    saveProjectWithWorkflowInvalidation(runningProject, { withinTransaction: true });
    workflowRunStore.createRun({
      id: runId,
      projectId: project.id,
      stageId: "transcript-cleaning",
      status: "running",
      runnerId: "transcript-cleaning-9router",
      runnerVersion: transcriptCleaningRunnerVersion,
      promptTemplateId: transcriptCleaningPromptTemplateId,
      promptVersion: transcriptCleaningPromptVersion,
      inputArtifactIds: [referenceSetArtifact.id],
      inputFingerprint,
      outputArtifactIds: [],
      providerId: "9router",
      ...(configuredModel ? { configuredModelId: configuredModel } : {}),
      payloadJson: { referenceId: reference.id, chunks: persistedChunks, chunkCount: null, completedChunkCount: persistedChunks.filter((item) => typeof item === "object" && item !== null && "status" in item && item.status === "completed").length },
      startedAt: now
    });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }

  try {
    const cleaned = await runTranscriptCleaning({
      referenceId: reference.id,
      sourceTranscriptVersionId: reference.id,
      transcript: reference.pastedTranscript,
      model: configuredModel,
      configuredTimeoutMs: defaultPerChunkTimeoutMs,
      credentialStore,
      certificationStore: textCertificationStore,
      ...(existingRun?.status === "failed" || existingRun?.status === "needs_attention" ? { resumeChunks: persistedChunks as never } : {}),
      onChunkProgress: (progress) => {
        const index = persistedChunks.findIndex((item) => typeof item === "object" && item !== null && "chunkIndex" in item && item.chunkIndex === progress.chunkIndex);
        if (index >= 0) persistedChunks[index] = progress;
        else persistedChunks.push(progress);
        workflowRunStore.updateRunPayload(runId, {
          chunks: persistedChunks,
          chunkCount: progress.totalChunks,
          completedChunkCount: persistedChunks.filter((item) => typeof item === "object" && item !== null && "status" in item && item.status === "completed").length
        });
      }
    });
    const artifactId = `artifact-${randomUUID()}`;
    const artifacts = workflowRunStore.listArtifacts(project.id, "transcript-cleaning");
    const finishedAt = new Date().toISOString();
    const reviewProject = transitionProjectStage(runningProject, "transcript-cleaning", "needs_review");
    db.exec("BEGIN IMMEDIATE;");
    try {
      saveProjectWithWorkflowInvalidation(reviewProject, { withinTransaction: true });
      workflowRunStore.finishRun({
        id: runId,
        projectId: project.id,
        stageId: "transcript-cleaning",
        status: "needs_review",
        runnerId: "transcript-cleaning-9router",
        runnerVersion: transcriptCleaningRunnerVersion,
        promptTemplateId: transcriptCleaningPromptTemplateId,
        promptVersion: transcriptCleaningPromptVersion,
        inputArtifactIds: [referenceSetArtifact.id],
        inputFingerprint,
        outputArtifactIds: [artifactId],
        finishedAt,
        ...(cleaned.returnedModelId ? { returnedModelId: cleaned.returnedModelId } : {}),
        providerId: "9router",
        ...(configuredModel ? { configuredModelId: configuredModel } : {}),
        payloadJson: { referenceId: reference.id, execution: cleaned.execution, chunks: cleaned.chunks, chunkCount: cleaned.execution.chunkCount, completedChunkCount: cleaned.execution.completedChunkCount }
      }, {
        id: artifactId,
        projectId: project.id,
        stageId: "transcript-cleaning",
        stageRunId: runId,
        type: "transcript.cleaned",
        version: artifacts.length + 1,
        status: "needs_review",
        payloadJson: { ...cleaned.output, warnings: cleaned.warnings },
        createdAt: finishedAt,
        updatedAt: finishedAt
      }, { withinTransaction: true });
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
    return factoryProjectResponseSchema.parse(reviewProject);
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const safeCategory = error instanceof TranscriptCleaningError ? error.category : "unexpected_failure";
    const safeMessage = error instanceof TranscriptCleaningError ? error.message : "Transcript Cleaning failed.";
    const attention = isDeterministicAttentionCategory(safeCategory);
    const failedProject = transitionProjectStage(runningProject, "transcript-cleaning", attention ? "needs_attention" : "failed");
    db.exec("BEGIN IMMEDIATE;");
    try {
      saveProjectWithWorkflowInvalidation(failedProject, { withinTransaction: true });
      workflowRunStore.finishRun({
        id: runId,
        projectId: project.id,
        stageId: "transcript-cleaning",
        status: attention ? "needs_attention" : "failed",
        runnerId: "transcript-cleaning-9router",
        runnerVersion: transcriptCleaningRunnerVersion,
        promptTemplateId: transcriptCleaningPromptTemplateId,
        promptVersion: transcriptCleaningPromptVersion,
        inputArtifactIds: [referenceSetArtifact.id],
        inputFingerprint,
        outputArtifactIds: [],
        finishedAt,
        safeErrorCategory: safeCategory,
        safeErrorMessage: safeMessage,
        payloadJson: {
          referenceId: reference.id,
          chunks: persistedChunks,
          chunkCount: (() => {
            const chunk = persistedChunks.find((item) => typeof item === "object" && item !== null && "totalChunks" in item) as { totalChunks?: unknown } | undefined;
            return typeof chunk?.totalChunks === "number" ? chunk.totalChunks : null;
          })(),
          completedChunkCount: persistedChunks.filter((item) => typeof item === "object" && item !== null && "status" in item && item.status === "completed").length
        }
      }, undefined, { withinTransaction: true });
      db.exec("COMMIT;");
    } catch (persistenceError) {
      db.exec("ROLLBACK;");
      throw persistenceError;
    }
    logger.warn("transcript_cleaning_failed", { projectId: project.id, referenceId: reference.id, category: safeCategory });
    throw new Error(safeMessage);
  }
});

ipcMain.handle("list-competitor-workflow-runs", (_event, input: unknown) => {
  const request = workflowRunListRequestSchema.parse(input);
  const runs = workflowRunStore.listRuns(request.projectId, request.stageId).map((run) => ({
    id: run.id,
    projectId: run.projectId,
    stageId: run.stageId,
    status: run.status,
    runnerId: run.runnerId,
    runnerVersion: run.runnerVersion,
    ...(run.providerId ? { providerId: run.providerId } : {}),
    ...(run.configuredModelId ? { configuredModelId: run.configuredModelId } : {}),
    ...(run.returnedModelId ? { returnedModelId: run.returnedModelId } : {}),
    inputArtifactIds: run.inputArtifactIds,
    inputFingerprint: run.inputFingerprint,
    outputArtifactIds: run.outputArtifactIds,
    ...(run.payloadJson ? { payloadJson: run.payloadJson } : {}),
    ...(run.startedAt ? { startedAt: run.startedAt } : {}),
    ...(run.finishedAt ? { finishedAt: run.finishedAt } : {}),
    ...(run.safeErrorCategory ? { safeErrorCategory: run.safeErrorCategory } : {}),
    ...(run.safeErrorMessage ? { safeErrorMessage: run.safeErrorMessage } : {})
  }));
  return workflowRunsResponseSchema.parse(runs);
});

ipcMain.handle("mark-stage-attention", (_event, input: unknown) => {
  const request = stageAttentionRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const definition = getWorkflowStageDefinition(request.stageId);
  if (!definition) throw new Error(`Unknown workflow stage: ${request.stageId}`);
  const runs = workflowRunStore.listRuns(request.projectId, request.stageId)
    .filter((run) => run.status === "needs_review" || run.status === "failed")
    .filter((run) => !request.referenceId || run.payloadJson?.referenceId === request.referenceId);
  // Prefer the failed run so a late error cannot mark a concurrent review run attention.
  const run = request.code === "AUTOMATIC_RUN_FAILED"
    ? runs.find((candidate) => candidate.status === "failed") ?? runs[0]
    : runs.find((candidate) => candidate.status === "needs_review") ?? runs[0];
  if (run) {
    workflowRunStore.markReviewAttention(run.id, request.code, request.message);
  } else {
    const route = definition.screenRoute;
    projectRepository.saveProject(updateProjectStage(project, request.stageId, "needs_attention", {
      code: request.code,
      message: request.message,
      actions: [{ label: "Review stage", ...(route ? { route } : {}) }]
    }));
  }
  const updated = projectRepository.loadProject(request.projectId);
  if (!updated) throw new Error(`Project not found: ${request.projectId}`);
  return factoryProjectResponseSchema.parse(updated);
});

ipcMain.handle("list-transcript-cleaning-artifacts", (_event, input: unknown) => {
  const request = transcriptCleaningArtifactRequestSchema.parse(input);
  const artifacts = workflowRunStore
    .listArtifacts(request.projectId, "transcript-cleaning")
    .filter((artifact) => artifact.payloadJson?.referenceId === request.referenceId)
    .map((artifact) => ({
      id: artifact.id,
      ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}),
      status: artifact.status,
      payloadJson: artifact.payloadJson,
      createdAt: artifact.createdAt,
      updatedAt: artifact.updatedAt
    }));
  return transcriptCleaningArtifactsResponseSchema.parse(artifacts);
});

ipcMain.handle("approve-transcript-cleaning", (_event, input: unknown) => {
  const request = transcriptCleaningArtifactRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const artifacts = workflowRunStore.listArtifacts(project.id, "transcript-cleaning");
  const artifact = artifacts.find((item) => item.status === "needs_review" && item.payloadJson?.referenceId === request.referenceId);
  if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable cleaned transcript exists for this reference.");
  transcriptCleaningArtifactResponseSchema.parse({ id: artifact.id, stageRunId: artifact.stageRunId, status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt });
  const approvedReferences = project.competitorReferences.filter((reference) => reference.included !== false && reference.status === "approved");
  const nextArtifacts = artifacts.map((item) => item.id === artifact.id ? { ...item, status: "approved" as const } : item);
  const backedArtifacts = backedApprovedArtifacts(project.id, "transcript-cleaning");
  const allApproved = approvedReferences.every((reference) =>
    nextArtifacts.some((item) =>
      item.status === "approved"
      && item.payloadJson?.referenceId === reference.id
      && (item.id === artifact.id || backedArtifacts.some((backed) => backed.id === item.id))
    )
  );
  const nextProject = allApproved
    ? transitionProjectStage(project, "transcript-cleaning", "approved")
    : updateProjectStage(project, "transcript-cleaning", "needs_review");
  db.exec("BEGIN IMMEDIATE;");
  try {
    saveProjectWithWorkflowInvalidation(nextProject, { withinTransaction: true });
    workflowRunStore.approveReviewRun(artifact.stageRunId, { withinTransaction: true });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  return factoryProjectResponseSchema.parse(nextProject);
});

ipcMain.handle("reject-transcript-cleaning", (_event, input: unknown) => {
  const request = transcriptCleaningArtifactRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const artifact = workflowRunStore.listArtifacts(project.id, "transcript-cleaning").find((item) => item.status === "needs_review" && item.payloadJson?.referenceId === request.referenceId);
  if (!artifact?.stageRunId) throw new Error("No reviewable cleaned transcript exists for this reference.");
  const rejected = transitionProjectStage(project, "transcript-cleaning", "rejected");
  db.exec("BEGIN IMMEDIATE;");
  try {
    saveProjectWithWorkflowInvalidation(rejected, { withinTransaction: true });
    workflowRunStore.rejectReviewRun(artifact.stageRunId, { withinTransaction: true });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  return factoryProjectResponseSchema.parse(rejected);
});

ipcMain.handle("run-reference-segmentation", async (_event, input: unknown) => {
  const request = runReferenceSegmentationRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  if (project.stages.find((stage) => stage.id === "transcript-cleaning")?.status !== "approved") {
    throw new Error("Reference Segmentation requires approved cleaned transcripts for every included reference.");
  }
  const reference = project.competitorReferences.find((item) => item.id === request.referenceId);
  if (!reference || reference.included === false || reference.status !== "approved") {
    throw new Error("Reference Segmentation requires an included, approved reference.");
  }
  const cleanedArtifact = currentApprovedArtifacts(project, "transcript-cleaning")
    .find((artifact) => artifact.payloadJson?.referenceId === reference.id);
  if (!cleanedArtifact || typeof cleanedArtifact.payloadJson?.cleanedTranscript !== "string") {
    throw new Error("No approved cleaned transcript exists for this reference.");
  }
  const cleanedTranscript = cleanedArtifact.payloadJson.cleanedTranscript;
  const textProviderExecution = currentTextProviderExecution();
  const inputFingerprint = canonicalSha256({ stageId: "reference-segmentation", referenceId: reference.id, cleanedArtifactId: cleanedArtifact.id, cleanedTranscript, providerConfigurationFingerprint: textProviderExecution.providerConfigurationFingerprint, selectedModel: textProviderExecution.configuredModelId, runnerVersion: "reference-segmentation-v1" });
  const existingRun = workflowRunStore.findLatestByInput(project.id, "reference-segmentation", inputFingerprint);
  if (isPendingOrAcceptedRun(existingRun)) return factoryProjectResponseSchema.parse(project);

  const now = new Date().toISOString();
  const runId = `stage-run-${randomUUID()}`;
  const currentStatus = project.stages.find((stage) => stage.id === "reference-segmentation")?.status ?? "not_started";
  const runningProject = currentStatus === "needs_review"
    ? project
    : transitionProjectStage(transitionProjectStage(project, "reference-segmentation", "queued"), "reference-segmentation", "running");
  db.exec("BEGIN IMMEDIATE;");
  try {
    saveProjectWithWorkflowInvalidation(runningProject, { withinTransaction: true });
    workflowRunStore.createRun({
      id: runId, projectId: project.id, stageId: "reference-segmentation", status: "running",
      runnerId: "reference-segmentation-9router", runnerVersion: "reference-segmentation-v1",
      providerId: textProviderExecution.providerId,
      ...(textProviderExecution.configuredModelId ? { configuredModelId: textProviderExecution.configuredModelId } : {}),
      inputArtifactIds: [cleanedArtifact.id], inputFingerprint, outputArtifactIds: [], startedAt: now
    });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }

  try {
    const segmented = await runReferenceSegmentation({ referenceId: reference.id, cleanedTranscriptArtifactId: cleanedArtifact.id, cleanedTranscript, credentialStore, certificationStore: textCertificationStore });
    const artifactId = `artifact-${randomUUID()}`;
    const artifacts = workflowRunStore.listArtifacts(project.id, "reference-segmentation");
    const finishedAt = new Date().toISOString();
    const reviewProject = currentStatus === "needs_review" ? project : transitionProjectStage(runningProject, "reference-segmentation", "needs_review");
    db.exec("BEGIN IMMEDIATE;");
    try {
      saveProjectWithWorkflowInvalidation(reviewProject, { withinTransaction: true });
      workflowRunStore.finishRun({
        id: runId, projectId: project.id, stageId: "reference-segmentation", status: "needs_review",
        runnerId: "reference-segmentation-9router", runnerVersion: "reference-segmentation-v1",
        providerId: textProviderExecution.providerId,
        ...(textProviderExecution.configuredModelId ? { configuredModelId: textProviderExecution.configuredModelId } : {}),
        inputArtifactIds: [cleanedArtifact.id], inputFingerprint, outputArtifactIds: [artifactId], finishedAt,
        ...(segmented.returnedModelId ? { returnedModelId: segmented.returnedModelId } : {})
      }, {
        id: artifactId, projectId: project.id, stageId: "reference-segmentation", stageRunId: runId,
        type: "reference-segments", version: artifacts.length + 1, status: "needs_review", payloadJson: segmented.output,
        createdAt: finishedAt, updatedAt: finishedAt
      }, { withinTransaction: true });
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
    return factoryProjectResponseSchema.parse(reviewProject);
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const safeCategory = error instanceof ReferenceSegmentationError ? error.category : "unexpected_failure";
    const safeMessage = error instanceof ReferenceSegmentationError ? error.message : "Reference Segmentation failed.";
    const failedProject = currentStatus === "needs_review" ? project : transitionProjectStage(runningProject, "reference-segmentation", "failed");
    db.exec("BEGIN IMMEDIATE;");
    try {
      saveProjectWithWorkflowInvalidation(failedProject, { withinTransaction: true });
      workflowRunStore.finishRun({
        id: runId, projectId: project.id, stageId: "reference-segmentation", status: "failed",
        runnerId: "reference-segmentation-9router", runnerVersion: "reference-segmentation-v1",
        providerId: textProviderExecution.providerId,
        ...(textProviderExecution.configuredModelId ? { configuredModelId: textProviderExecution.configuredModelId } : {}),
        inputArtifactIds: [cleanedArtifact.id], inputFingerprint, outputArtifactIds: [], finishedAt,
        safeErrorCategory: safeCategory, safeErrorMessage: safeMessage
      }, undefined, { withinTransaction: true });
      db.exec("COMMIT;");
    } catch (persistenceError) {
      db.exec("ROLLBACK;");
      throw persistenceError;
    }
    logger.warn("reference_segmentation_failed", { projectId: project.id, referenceId: reference.id, category: safeCategory });
    throw new Error(safeMessage);
  }
});

ipcMain.handle("list-reference-segmentation-artifacts", (_event, input: unknown) => {
  const request = referenceSegmentationArtifactRequestSchema.parse(input);
  const artifacts = workflowRunStore.listArtifacts(request.projectId, "reference-segmentation")
    .filter((artifact) => artifact.payloadJson?.referenceId === request.referenceId)
    .map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }));
  return referenceSegmentationArtifactsResponseSchema.parse(artifacts);
});

ipcMain.handle("approve-reference-segmentation", (_event, input: unknown) => {
  const request = referenceSegmentationArtifactRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const artifacts = workflowRunStore.listArtifacts(project.id, "reference-segmentation");
  const artifact = artifacts.find((item) => item.status === "needs_review" && item.payloadJson?.referenceId === request.referenceId);
  if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable segmentation exists for this reference.");
  referenceSegmentationOutputSchema.parse(artifact.payloadJson);
  const approvedReferences = project.competitorReferences.filter((reference) => reference.included !== false && reference.status === "approved");
  const nextArtifacts = artifacts.map((item) => item.id === artifact.id ? { ...item, status: "approved" as const } : item);
  const backedArtifacts = backedApprovedArtifacts(project.id, "reference-segmentation");
  const allApproved = approvedReferences.every((reference) => nextArtifacts.some((item) =>
    item.status === "approved"
    && item.payloadJson?.referenceId === reference.id
    && (item.id === artifact.id || backedArtifacts.some((backed) => backed.id === item.id))
  ));
  const nextProject = allApproved ? transitionProjectStage(project, "reference-segmentation", "approved") : project;
  db.exec("BEGIN IMMEDIATE;");
  try {
    saveProjectWithWorkflowInvalidation(nextProject, { withinTransaction: true });
    workflowRunStore.approveReviewRun(artifact.stageRunId, { withinTransaction: true });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  return factoryProjectResponseSchema.parse(nextProject);
});

ipcMain.handle("reject-reference-segmentation", (_event, input: unknown) => {
  const request = referenceSegmentationArtifactRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const artifact = workflowRunStore.listArtifacts(project.id, "reference-segmentation").find((item) => item.status === "needs_review" && item.payloadJson?.referenceId === request.referenceId);
  if (!artifact?.stageRunId) throw new Error("No reviewable segmentation exists for this reference.");
  const rejected = transitionProjectStage(project, "reference-segmentation", "rejected");
  db.exec("BEGIN IMMEDIATE;");
  try {
    saveProjectWithWorkflowInvalidation(rejected, { withinTransaction: true });
    workflowRunStore.rejectReviewRun(artifact.stageRunId, { withinTransaction: true });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  return factoryProjectResponseSchema.parse(rejected);
});

ipcMain.handle("run-competitor-dna", async (_event, input: unknown) => {
  const request = runCompetitorDnaRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const reference = project.competitorReferences.find((item) => item.id === request.referenceId);
  if (!reference || reference.included === false || reference.status !== "approved") throw new Error("Competitor DNA requires an included, approved reference.");
  const cleaned = currentApprovedArtifacts(project, "transcript-cleaning").find((artifact) => artifact.payloadJson?.referenceId === reference.id);
  const segmentation = currentApprovedArtifacts(project, "reference-segmentation").find((artifact) => artifact.payloadJson?.referenceId === reference.id);
  if (!cleaned || typeof cleaned.payloadJson?.cleanedTranscript !== "string" || !segmentation || !Array.isArray(segmentation.payloadJson?.segments)) throw new Error("Competitor DNA requires approved cleaned transcript and segmentation artifacts for this reference.");
  const profile = seedChannelProfiles.find((item) => item.id === project.profileId);
  if (!profile) throw new Error("Competitor DNA requires an active channel profile.");
  const channelProfile = { id: profile.id, name: profile.name, niche: profile.niche, tone: profile.tone, avoidList: profile.avoidList, safetyRules: profile.safetyRules };
  const originalityRules = [...profile.avoidList, ...profile.safetyRules];
  const textProviderExecution = currentTextProviderExecution();
  const inputFingerprint = canonicalSha256({ stageId: "competitor-dna", referenceId: reference.id, cleanedArtifactId: cleaned.id, segmentationArtifactId: segmentation.id, channelProfile, originalityRules, providerConfigurationFingerprint: textProviderExecution.providerConfigurationFingerprint, selectedModel: textProviderExecution.configuredModelId, runnerVersion: competitorDnaRunnerVersion });
  const existing = workflowRunStore.findLatestByInput(project.id, "competitor-dna", inputFingerprint);
  if (isPendingOrAcceptedRun(existing)) return factoryProjectResponseSchema.parse(project);
  const now = new Date().toISOString();
  const runId = `stage-run-${randomUUID()}`;
  const currentStatus = project.stages.find((stage) => stage.id === "competitor-dna")?.status ?? "not_started";
  const runningProject = currentStatus === "needs_review" ? project : transitionProjectStage(transitionProjectStage(project, "competitor-dna", "queued"), "competitor-dna", "running");
  db.exec("BEGIN IMMEDIATE;");
  try {
    saveProjectWithWorkflowInvalidation(runningProject, { withinTransaction: true });
      workflowRunStore.createRun({ id: runId, projectId: project.id, stageId: "competitor-dna", status: "running", runnerId: "competitor-dna-9router", providerId: textProviderExecution.providerId, ...(textProviderExecution.configuredModelId ? { configuredModelId: textProviderExecution.configuredModelId } : {}), promptTemplateId: "04_competitor_dna", promptVersion: "v5", runnerVersion: competitorDnaRunnerVersion, inputArtifactIds: [cleaned.id, segmentation.id], inputFingerprint, outputArtifactIds: [], startedAt: now });
    db.exec("COMMIT;");
  } catch (error) { db.exec("ROLLBACK;"); throw error; }
  try {
    const result = await runCompetitorDna({ referenceId: reference.id, segmentationArtifactId: segmentation.id, cleanedTranscript: cleaned.payloadJson.cleanedTranscript, segments: segmentation.payloadJson.segments as never, channelProfile, originalityRules, credentialStore, certificationStore: textCertificationStore });
    const artifactId = `artifact-${randomUUID()}`;
    const finishedAt = new Date().toISOString();
    const artifacts = workflowRunStore.listArtifacts(project.id, "competitor-dna");
    const reviewProject = currentStatus === "needs_review" ? project : transitionProjectStage(runningProject, "competitor-dna", "needs_review");
    db.exec("BEGIN IMMEDIATE;");
    try {
      saveProjectWithWorkflowInvalidation(reviewProject, { withinTransaction: true });
      workflowRunStore.finishRun({ id: runId, projectId: project.id, stageId: "competitor-dna", status: "needs_review", runnerId: "competitor-dna-9router", runnerVersion: competitorDnaRunnerVersion, providerId: textProviderExecution.providerId, ...(textProviderExecution.configuredModelId ? { configuredModelId: textProviderExecution.configuredModelId } : {}), promptTemplateId: "04_competitor_dna", promptVersion: "v5", inputArtifactIds: [cleaned.id, segmentation.id], inputFingerprint, outputArtifactIds: [artifactId], finishedAt, ...(result.returnedModelId ? { returnedModelId: result.returnedModelId } : {}) }, { id: artifactId, projectId: project.id, stageId: "competitor-dna", stageRunId: runId, type: "competitor-dna-card", version: artifacts.length + 1, status: "needs_review", payloadJson: result.output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true });
      db.exec("COMMIT;");
    } catch (error) { db.exec("ROLLBACK;"); throw error; }
    return factoryProjectResponseSchema.parse(reviewProject);
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const safeCategory = error instanceof CompetitorDnaError ? error.category : "unexpected_failure";
    const safeMessage = error instanceof CompetitorDnaError ? error.message : "Competitor DNA failed.";
    const failedProject = currentStatus === "needs_review" ? project : transitionProjectStage(runningProject, "competitor-dna", "failed");
    db.exec("BEGIN IMMEDIATE;");
    try { saveProjectWithWorkflowInvalidation(failedProject, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId: project.id, stageId: "competitor-dna", status: "failed", runnerId: "competitor-dna-9router", runnerVersion: competitorDnaRunnerVersion, providerId: textProviderExecution.providerId, ...(textProviderExecution.configuredModelId ? { configuredModelId: textProviderExecution.configuredModelId } : {}), promptTemplateId: "04_competitor_dna", promptVersion: "v5", inputArtifactIds: [cleaned.id, segmentation.id], inputFingerprint, outputArtifactIds: [], finishedAt, safeErrorCategory: safeCategory, safeErrorMessage: safeMessage }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); }
    catch (persistenceError) { db.exec("ROLLBACK;"); throw persistenceError; }
    logger.warn("competitor_dna_failed", { projectId: project.id, referenceId: reference.id, category: safeCategory });
    throw new Error(safeMessage);
  }
});

ipcMain.handle("list-competitor-dna-artifacts", (_event, input: unknown) => {
  const request = competitorDnaArtifactRequestSchema.parse(input);
  return competitorDnaArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(request.projectId, "competitor-dna").filter((artifact) => artifact.payloadJson?.referenceId === request.referenceId).map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt })));
});

ipcMain.handle("approve-competitor-dna", (_event, input: unknown) => {
  const request = competitorDnaArtifactRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const artifacts = workflowRunStore.listArtifacts(project.id, "competitor-dna");
  const artifact = artifacts.find((item) => item.status === "needs_review" && item.payloadJson?.referenceId === request.referenceId);
  if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Competitor DNA output exists for this reference.");
  competitorDnaOutputSchema.parse(artifact.payloadJson);
  const approvedReferences = project.competitorReferences.filter((reference) => reference.included !== false && reference.status === "approved");
  const nextArtifacts = artifacts.map((item) => item.id === artifact.id ? { ...item, status: "approved" as const } : item);
  const backedArtifacts = backedApprovedArtifacts(project.id, "competitor-dna");
  const allApproved = approvedReferences.every((reference) => nextArtifacts.some((item) =>
    item.status === "approved"
    && item.payloadJson?.referenceId === reference.id
    && (item.id === artifact.id || backedArtifacts.some((backed) => backed.id === item.id))
  ));
  const nextProject = allApproved ? transitionProjectStage(project, "competitor-dna", "approved") : project;
  db.exec("BEGIN IMMEDIATE;");
  try { saveProjectWithWorkflowInvalidation(nextProject, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); }
  catch (error) { db.exec("ROLLBACK;"); throw error; }
  return factoryProjectResponseSchema.parse(nextProject);
});

ipcMain.handle("reject-competitor-dna", (_event, input: unknown) => {
  const request = competitorDnaArtifactRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const artifact = workflowRunStore.listArtifacts(project.id, "competitor-dna").find((item) => item.status === "needs_review" && item.payloadJson?.referenceId === request.referenceId);
  if (!artifact?.stageRunId) throw new Error("No reviewable Competitor DNA output exists for this reference.");
  const rejected = transitionProjectStage(project, "competitor-dna", "rejected");
  db.exec("BEGIN IMMEDIATE;");
  try { saveProjectWithWorkflowInvalidation(rejected, { withinTransaction: true }); workflowRunStore.rejectReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); }
  catch (error) { db.exec("ROLLBACK;"); throw error; }
  return factoryProjectResponseSchema.parse(rejected);
});

ipcMain.handle("run-opportunity-map", async (_event, input: unknown) => {
  const { projectId } = opportunityMapRequestSchema.parse(input); const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const dna = currentApprovedArtifacts(project, "competitor-dna");
  const refs = project.competitorReferences.filter((reference) => reference.included !== false && reference.status === "approved");
  if (dna.length !== refs.length || dna.length === 0) throw new Error("Opportunity Map requires approved Competitor DNA for every included reference.");
  const fingerprint = canonicalSha256({ stageId: "opportunity-map", artifactIds: dna.map((artifact) => artifact.id).sort() }); const existing = workflowRunStore.findLatestByInput(projectId, "opportunity-map", fingerprint);
  if (isPendingOrAcceptedRun(existing)) return factoryProjectResponseSchema.parse(project);
  const runId = `stage-run-${randomUUID()}`; const now = new Date().toISOString(); const running = transitionProjectStage(transitionProjectStage(project, "opportunity-map", "queued"), "opportunity-map", "running");
  db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(running, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "opportunity-map", status: "running", runnerId: "opportunity-map-9router", runnerVersion: "opportunity-map-v1", inputArtifactIds: dna.map((artifact) => artifact.id), inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
  try { const result = await runOpportunityMap({ dnaArtifacts: dna.map((artifact) => ({ id: artifact.id, payload: artifact.payloadJson ?? {} })), credentialStore, certificationStore: textCertificationStore }); const artifactId = `artifact-${randomUUID()}`; const finishedAt = new Date().toISOString(); const review = transitionProjectStage(running, "opportunity-map", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(review, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "opportunity-map", status: "needs_review", runnerId: "opportunity-map-9router", runnerVersion: "opportunity-map-v1", inputArtifactIds: dna.map((artifact) => artifact.id), inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt, ...(result.returnedModelId ? { returnedModelId: result.returnedModelId } : {}) }, { id: artifactId, projectId, stageId: "opportunity-map", stageRunId: runId, type: "opportunity-map", version: workflowRunStore.listArtifacts(projectId, "opportunity-map").length + 1, status: "needs_review", payloadJson: result.output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); }
  catch (error) { const failed = transitionProjectStage(running, "opportunity-map", "failed"); const message = error instanceof OpportunityMapError ? error.message : "Opportunity Map failed."; db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(failed, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "opportunity-map", status: "failed", runnerId: "opportunity-map-9router", runnerVersion: "opportunity-map-v1", inputArtifactIds: dna.map((artifact) => artifact.id), inputFingerprint: fingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof OpportunityMapError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); } catch (persistError) { db.exec("ROLLBACK;"); throw persistError; } throw new Error(message); }
});

ipcMain.handle("list-opportunity-map-artifacts", (_event, input: unknown) => { const { projectId } = opportunityMapRequestSchema.parse(input); return workflowRunStore.listArtifacts(projectId, "opportunity-map").map((artifact) => opportunityMapArtifactResponseSchema.parse({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt })); });

ipcMain.handle("approve-opportunity-map", (_event, input: unknown) => {
  const { projectId } = opportunityMapRequestSchema.parse(input); const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const artifact = workflowRunStore.listArtifacts(projectId, "opportunity-map").find((item) => item.status === "needs_review");
  if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Opportunity Map exists.");
  opportunityMapOutputSchema.parse(artifact.payloadJson);
  const approved = transitionProjectStage(project, "opportunity-map", "approved");
  db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
  return factoryProjectResponseSchema.parse(approved);
});

ipcMain.handle("reject-opportunity-map", (_event, input: unknown) => {
  const { projectId } = opportunityMapRequestSchema.parse(input); const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const artifact = workflowRunStore.listArtifacts(projectId, "opportunity-map").find((item) => item.status === "needs_review");
  if (!artifact?.stageRunId) throw new Error("No reviewable Opportunity Map exists.");
  const rejected = transitionProjectStage(project, "opportunity-map", "rejected");
  db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(rejected, { withinTransaction: true }); workflowRunStore.rejectReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
  return factoryProjectResponseSchema.parse(rejected);
});

ipcMain.handle("run-idea-lab", async (_event, input: unknown) => {
  const { projectId } = ideaLabRequestSchema.parse(input); const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const opportunity = currentApprovedArtifacts(project, "opportunity-map")[0];
  const topicOpportunityMap = project.setup.inputMode === "topic" && project.competitorReferences.every((reference) => reference.included === false)
    ? {
        recommendedContentSpaces: [{ text: `Original explanatory video about ${project.topic}`, sourceReferenceIds: [], sourceArtifactIds: [], confidence: "low" }],
        sharedPatterns: [],
        overusedPatterns: [],
        underservedViewerQuestions: [],
        evidenceGaps: [],
        differentiationDirections: [],
        riskyDirections: []
      }
    : undefined;
  if (!opportunity?.payloadJson && !topicOpportunityMap) throw new Error("Idea Lab requires an approved Opportunity Map.");
  const profile = seedChannelProfiles.find((item) => item.id === project.profileId); if (!profile) throw new Error("Active channel profile is unavailable.");
  const inputArtifactIds = opportunity ? [opportunity.id] : [];
  const fingerprint = canonicalSha256({ stageId: "idea-lab", opportunityId: opportunity?.id ?? "topic-opportunity", topic: project.topic, profileId: profile.id, format: project.format, language: project.targetLanguage, targetDuration: project.setup.targetDuration });
  const existingRun = workflowRunStore.findLatestByInput(projectId, "idea-lab", fingerprint);
  if (isPendingOrAcceptedRun(existingRun)) return factoryProjectResponseSchema.parse(project);
  const runId = `stage-run-${randomUUID()}`; const running = transitionProjectStage(transitionProjectStage(project, "idea-lab", "queued"), "idea-lab", "running"); const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(running, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "idea-lab", status: "running", runnerId: "idea-lab-9router", runnerVersion: "idea-lab-v1", inputArtifactIds, inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
  try { const result = await runIdeaLab({ opportunityMap: opportunity?.payloadJson ?? topicOpportunityMap!, topic: project.topic, profile: profile as unknown as Record<string, unknown>, format: project.format, language: project.targetLanguage, targetDuration: project.setup.targetDuration, credentialStore, certificationStore: textCertificationStore }); const artifactId = `artifact-${randomUUID()}`; const finishedAt = new Date().toISOString(); const review = transitionProjectStage(running, "idea-lab", "needs_review"); const withIdeas = { ...review, ideas: result.output.candidates }; db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(withIdeas, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "idea-lab", status: "needs_review", runnerId: "idea-lab-9router", runnerVersion: "idea-lab-v1", inputArtifactIds, inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt }, { id: artifactId, projectId, stageId: "idea-lab", stageRunId: runId, type: "idea-candidates", version: workflowRunStore.listArtifacts(projectId, "idea-lab").length + 1, status: "needs_review", payloadJson: result.output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(withIdeas); }
  catch (error) { const failed = transitionProjectStage(running, "idea-lab", "failed"); const message = error instanceof IdeaLabError ? error.message : "Idea Lab failed."; db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(failed, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "idea-lab", status: "failed", runnerId: "idea-lab-9router", runnerVersion: "idea-lab-v1", inputArtifactIds, inputFingerprint: fingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof IdeaLabError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); } catch (persistenceError) { db.exec("ROLLBACK;"); throw persistenceError; } throw new Error(message); }
});

ipcMain.handle("approve-idea", (_event, input: unknown) => {
  const { projectId, ideaId } = approveIdeaRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "idea-lab").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId) throw new Error("No reviewable Idea Lab output exists."); const candidateSet = ideaLabOutputSchema.parse(artifact.payloadJson); if (!candidateSet.candidates.some((idea) => idea.id === ideaId)) throw new Error("Idea candidate does not belong to the reviewable Idea Lab output."); const approved = transitionProjectStage({ ...project, ideas: candidateSet.candidates, approvedIdeaId: ideaId }, "idea-lab", "approved"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved);
});
ipcMain.handle("reject-idea-lab", (_event, input: unknown) => {
  const { projectId } = ideaLabRequestSchema.parse(input);
  const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const artifact = workflowRunStore.listArtifacts(projectId, "idea-lab").find((item) => item.status === "needs_review");
  if (!artifact?.stageRunId) throw new Error("No reviewable Idea Lab output exists.");
  const { approvedIdeaId: _approvedIdeaId, ...projectWithoutApproval } = project;
  const rejected = transitionProjectStage(projectWithoutApproval, "idea-lab", "rejected");
  db.exec("BEGIN IMMEDIATE;");
  try {
    saveProjectWithWorkflowInvalidation(rejected, { withinTransaction: true });
    workflowRunStore.rejectReviewRun(artifact.stageRunId, { withinTransaction: true });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  return factoryProjectResponseSchema.parse(rejected);
});

ipcMain.handle("run-originality-review", (_event, input: unknown) => {
  const { projectId } = originalityReviewRequestSchema.parse(input);
  const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  if (!project.approvedIdeaId) throw new Error("Originality Review requires an approved Idea Lab candidate.");
  const ideaArtifact = currentApprovedArtifacts(project, "idea-lab")[0];
  if (!ideaArtifact?.payloadJson) throw new Error("Originality Review requires an approved Idea Lab artifact.");
  const idea = ideaLabOutputSchema.parse(ideaArtifact.payloadJson).candidates.find((candidate) => candidate.id === project.approvedIdeaId);
  if (!idea) throw new Error("The approved idea is not present in the approved Idea Lab artifact.");
  const dnaArtifacts = currentApprovedArtifacts(project, "competitor-dna").filter((artifact) => artifact.payloadJson);
  if (!dnaArtifacts.length && project.setup.inputMode !== "topic") throw new Error("Originality Review requires approved Competitor DNA artifacts.");
  const inputFingerprint = canonicalSha256({ stageId: "originality-review", ideaArtifactId: ideaArtifact.id, ideaId: idea.id, dnaArtifactIds: dnaArtifacts.map((artifact) => artifact.id) });
  const existingRun = workflowRunStore.findLatestByInput(projectId, "originality-review", inputFingerprint);
  if (isPendingOrAcceptedRun(existingRun)) return factoryProjectResponseSchema.parse(project);
  const runId = `stage-run-${randomUUID()}`;
  const running = transitionProjectStage(transitionProjectStage(project, "originality-review", "queued"), "originality-review", "running");
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE;");
  try {
    saveProjectWithWorkflowInvalidation(running, { withinTransaction: true });
    workflowRunStore.createRun({ id: runId, projectId, stageId: "originality-review", status: "running", runnerId: "originality-review-local", runnerVersion: "originality-review-v1", inputArtifactIds: [ideaArtifact.id, ...dnaArtifacts.map((artifact) => artifact.id)], inputFingerprint, outputArtifactIds: [], startedAt: now });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  try {
    const patterns = dnaArtifacts.map((artifact) => {
      const dna = competitorDnaOutputSchema.parse(artifact.payloadJson);
      return { hookPattern: dna.hookPattern.abstraction, promisePattern: dna.promisePattern.abstraction, pacingPattern: dna.pacingPattern.description, proofPattern: dna.proofPattern.description, visualOpportunities: [], forbiddenToCopy: dna.forbiddenToCopy.map((item) => item.element) };
    });
    const result = reviewOriginality({ idea, patterns });
    const output = originalityReviewOutputSchema.parse({ ideaId: idea.id, ...result, competitorDnaArtifactIds: dnaArtifacts.map((artifact) => artifact.id) });
    const artifactId = `artifact-${randomUUID()}`;
    const finishedAt = new Date().toISOString();
    const review = transitionProjectStage(running, "originality-review", "needs_review");
    db.exec("BEGIN IMMEDIATE;");
    try {
      saveProjectWithWorkflowInvalidation(review, { withinTransaction: true });
      workflowRunStore.finishRun({ id: runId, projectId, stageId: "originality-review", status: "needs_review", runnerId: "originality-review-local", runnerVersion: "originality-review-v1", inputArtifactIds: [ideaArtifact.id, ...dnaArtifacts.map((artifact) => artifact.id)], inputFingerprint, outputArtifactIds: [artifactId], finishedAt }, { id: artifactId, projectId, stageId: "originality-review", stageRunId: runId, type: "originality-review", version: workflowRunStore.listArtifacts(projectId, "originality-review").length + 1, status: "needs_review", payloadJson: output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true });
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
    return factoryProjectResponseSchema.parse(review);
  } catch (error) {
    const failed = transitionProjectStage(running, "originality-review", "failed");
    db.exec("BEGIN IMMEDIATE;");
    try {
      saveProjectWithWorkflowInvalidation(failed, { withinTransaction: true });
      workflowRunStore.finishRun({ id: runId, projectId, stageId: "originality-review", status: "failed", runnerId: "originality-review-local", runnerVersion: "originality-review-v1", inputArtifactIds: [ideaArtifact.id, ...dnaArtifacts.map((artifact) => artifact.id)], inputFingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: "invalid_output", safeErrorMessage: "Originality Review failed validation." }, undefined, { withinTransaction: true });
      db.exec("COMMIT;");
    } catch (persistenceError) {
      db.exec("ROLLBACK;");
      throw persistenceError;
    }
    throw new Error("Originality Review failed validation.");
  }
});

ipcMain.handle("list-originality-review-artifacts", (_event, input: unknown) => {
  const { projectId } = originalityReviewRequestSchema.parse(input);
  return originalityReviewArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "originality-review").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt })));
});

ipcMain.handle("approve-originality-review", (_event, input: unknown) => {
  const { projectId } = originalityReviewRequestSchema.parse(input);
  const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const artifact = workflowRunStore.listArtifacts(projectId, "originality-review").find((item) => item.status === "needs_review");
  if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Originality Review exists.");
  const output = originalityReviewOutputSchema.parse(artifact.payloadJson);
  if (output.status !== "pass") throw new Error("Originality Review must pass before Research Source Intake can be approved.");
  const approved = transitionProjectStage(project, "originality-review", "approved");
  db.exec("BEGIN IMMEDIATE;");
  try {
    saveProjectWithWorkflowInvalidation(approved, { withinTransaction: true });
    workflowRunStore.approveReviewRun(artifact.stageRunId, { withinTransaction: true });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  return factoryProjectResponseSchema.parse(approved);
});

ipcMain.handle("reject-originality-review", (_event, input: unknown) => {
  const { projectId } = originalityReviewRequestSchema.parse(input);
  const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const artifact = workflowRunStore.listArtifacts(projectId, "originality-review").find((item) => item.status === "needs_review");
  if (!artifact?.stageRunId) throw new Error("No reviewable Originality Review exists.");
  const rejected = transitionProjectStage(project, "originality-review", "rejected");
  db.exec("BEGIN IMMEDIATE;");
  try {
    saveProjectWithWorkflowInvalidation(rejected, { withinTransaction: true });
    workflowRunStore.rejectReviewRun(artifact.stageRunId, { withinTransaction: true });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  return factoryProjectResponseSchema.parse(rejected);
});

ipcMain.handle("save-research-sources", (_event, input: unknown) => {
  const request = saveResearchSourcesRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const originalityArtifact = currentApprovedArtifacts(project, "originality-review").find((artifact) => artifact.payloadJson);
  if (!originalityArtifact?.payloadJson) throw new Error("Research Source Intake requires an approved Originality Review artifact.");
  const inputFingerprint = canonicalSha256({ stageId: "research-source-intake", originalityArtifactId: originalityArtifact.id, sources: request.sources });
  const existingRun = workflowRunStore.findLatestByInput(project.id, "research-source-intake", inputFingerprint);
  if (isPendingOrAcceptedRun(existingRun)) return factoryProjectResponseSchema.parse(project);
  const runId = `stage-run-${randomUUID()}`;
  const artifactId = `artifact-${randomUUID()}`;
  const now = new Date().toISOString();
  const currentStatus = project.stages.find((stage) => stage.id === "research-source-intake")?.status ?? "not_started";
  const resetProject = currentStatus === "approved"
    ? transitionProjectStage(project, "research-source-intake", "stale")
    : project;
  const running = transitionProjectStage(transitionProjectStage(resetProject, "research-source-intake", "queued"), "research-source-intake", "running");
  const review = transitionProjectStage(running, "research-source-intake", "needs_review");
  db.exec("BEGIN IMMEDIATE;");
  try {
    saveProjectWithWorkflowInvalidation(review, { withinTransaction: true });
    workflowRunStore.createRun({ id: runId, projectId: project.id, stageId: "research-source-intake", status: "running", runnerId: "research-source-intake-manual", runnerVersion: "research-source-intake-v1", inputArtifactIds: [originalityArtifact.id], inputFingerprint, outputArtifactIds: [], startedAt: now });
    workflowRunStore.finishRun({ id: runId, projectId: project.id, stageId: "research-source-intake", status: "needs_review", runnerId: "research-source-intake-manual", runnerVersion: "research-source-intake-v1", inputArtifactIds: [originalityArtifact.id], inputFingerprint, outputArtifactIds: [artifactId], finishedAt: now }, { id: artifactId, projectId: project.id, stageId: "research-source-intake", stageRunId: runId, type: "research-sources", version: workflowRunStore.listArtifacts(project.id, "research-source-intake").length + 1, status: "needs_review", payloadJson: { sources: request.sources }, createdAt: now, updatedAt: now }, { withinTransaction: true });
    db.exec("COMMIT;");
  } catch (error) { db.exec("ROLLBACK;"); throw error; }
  return factoryProjectResponseSchema.parse(review);
});

ipcMain.handle("run-research-source-search", async (_event, input: unknown) => {
  const { projectId } = researchSourceSearchRequestSchema.parse(input);
  const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const originalityArtifact = currentApprovedArtifacts(project, "originality-review").find((artifact) => artifact.payloadJson);
  if (!originalityArtifact?.payloadJson) throw new Error("Automatic Research Source Intake requires an approved Originality Review artifact.");
  const settings = credentialStore.loadProviderCredentialSettings("9router");
  const query = buildResearchSearchQuery(project);
  const inputFingerprint = canonicalSha256({ stageId: "research-source-intake", originalityArtifactId: originalityArtifact.id, query, textModel: settings?.textModel, runnerVersion: "research-source-search-v1" });
  const existingRun = workflowRunStore.findLatestByInput(project.id, "research-source-intake", inputFingerprint);
  if (isPendingOrAcceptedRun(existingRun)) return factoryProjectResponseSchema.parse(project);
  const existingArtifact = workflowRunStore.listArtifacts(project.id, "research-source-intake").find((artifact) => artifact.status === "needs_review" || artifact.status === "approved");
  if (existingArtifact) return factoryProjectResponseSchema.parse(project);
  const runId = `stage-run-${randomUUID()}`;
  const currentStatus = project.stages.find((stage) => stage.id === "research-source-intake")?.status ?? "not_started";
  const resetProject = currentStatus === "approved" ? transitionProjectStage(project, "research-source-intake", "stale") : project;
  const running = transitionProjectStage(transitionProjectStage(resetProject, "research-source-intake", "queued"), "research-source-intake", "running");
  const runBase = { id: runId, projectId, stageId: "research-source-intake" as const, status: "running" as const, runnerId: "research-source-search-9router", runnerVersion: "research-source-search-v1", providerId: "9router" as const, ...(settings?.textModel ? { configuredModelId: settings.textModel } : {}), promptTemplateId: "research-source-search-v1", promptVersion: "v1", inputArtifactIds: [originalityArtifact.id], inputFingerprint, outputArtifactIds: [], startedAt: new Date().toISOString() };
  db.exec("BEGIN IMMEDIATE;");
  try {
    saveProjectWithWorkflowInvalidation(running, { withinTransaction: true });
    workflowRunStore.createRun(runBase);
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  try {
    const result = await runResearchSourceSearch({ project, credentialStore, certificationStore: textCertificationStore });
    const artifactId = `artifact-${randomUUID()}`;
    const finishedAt = new Date().toISOString();
    const review = transitionProjectStage(running, "research-source-intake", "needs_review");
    db.exec("BEGIN IMMEDIATE;");
    try {
      saveProjectWithWorkflowInvalidation(review, { withinTransaction: true });
      workflowRunStore.finishRun({ ...runBase, status: "needs_review", outputArtifactIds: [artifactId], finishedAt, ...(result.returnedModelId ? { returnedModelId: result.returnedModelId } : {}) }, { id: artifactId, projectId, stageId: "research-source-intake", stageRunId: runId, type: "research-sources", version: workflowRunStore.listArtifacts(projectId, "research-source-intake").length + 1, status: "needs_review", payloadJson: result.output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true });
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
    return factoryProjectResponseSchema.parse(review);
  } catch (error) {
    const failed = transitionProjectStage(running, "research-source-intake", "failed");
    const message = error instanceof ResearchSourceSearchError ? error.message : "Automatic Research Source Intake failed.";
    db.exec("BEGIN IMMEDIATE;");
    try {
      saveProjectWithWorkflowInvalidation(failed, { withinTransaction: true });
      workflowRunStore.finishRun({ ...runBase, status: "failed", finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof ResearchSourceSearchError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true });
      db.exec("COMMIT;");
    } catch (persistenceError) {
      db.exec("ROLLBACK;");
      throw persistenceError;
    }
    throw new Error(message);
  }
});

ipcMain.handle("list-research-sources-artifacts", (_event, input: unknown) => {
  const { projectId } = researchSourcesRequestSchema.parse(input);
  return researchSourcesArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "research-source-intake").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt })));
});

ipcMain.handle("approve-research-sources", (_event, input: unknown) => {
  const { projectId } = researchSourcesRequestSchema.parse(input);
  const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const artifact = workflowRunStore.listArtifacts(projectId, "research-source-intake").find((item) => item.status === "needs_review");
  if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Research Source Intake exists.");
  researchSourcesOutputSchema.parse(artifact.payloadJson);
  const approved = transitionProjectStage(project, "research-source-intake", "approved");
  db.exec("BEGIN IMMEDIATE;");
  try { saveProjectWithWorkflowInvalidation(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
  return factoryProjectResponseSchema.parse(approved);
});

ipcMain.handle("reject-research-sources", (_event, input: unknown) => {
  const { projectId } = researchSourcesRequestSchema.parse(input);
  const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const artifact = workflowRunStore.listArtifacts(projectId, "research-source-intake").find((item) => item.status === "needs_review");
  if (!artifact?.stageRunId) throw new Error("No reviewable Research Source Intake exists.");
  const rejected = transitionProjectStage(project, "research-source-intake", "rejected");
  db.exec("BEGIN IMMEDIATE;");
  try { saveProjectWithWorkflowInvalidation(rejected, { withinTransaction: true }); workflowRunStore.rejectReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
  return factoryProjectResponseSchema.parse(rejected);
});

ipcMain.handle("run-claim-map", async (_event, input: unknown) => {
  const { projectId } = claimMapRequestSchema.parse(input); const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const claimMapInput = buildClaimMapReferenceSources(project);
  const { sources, inputArtifactIds } = claimMapInput;
  const fingerprint = canonicalSha256({ stageId: "claim-map", inputArtifactIds, sources });
  const existingRun = workflowRunStore.findLatestByInput(projectId, "claim-map", fingerprint);
  if (isPendingOrAcceptedRun(existingRun)) return factoryProjectResponseSchema.parse(project);
  const runId = `stage-run-${randomUUID()}`; const now = new Date().toISOString(); const running = transitionProjectStage(transitionProjectStage(project, "claim-map", "queued"), "claim-map", "running");
  db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(running, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "claim-map", status: "running", runnerId: "claim-map-9router", runnerVersion: "claim-map-v1", providerId: "9router", inputArtifactIds, inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
  try {
    const result = await runClaimMap({ sources, credentialStore, certificationStore: textCertificationStore });
    const output = namespaceClaimMapOutput(result.output, projectId);
    const artifactId = `artifact-${randomUUID()}`; const finishedAt = new Date().toISOString(); const review = transitionProjectStage(running, "claim-map", "needs_review");
    db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(review, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "claim-map", status: "needs_review", runnerId: "claim-map-9router", runnerVersion: "claim-map-v1", providerId: "9router", inputArtifactIds, inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt, ...(result.returnedModelId ? { returnedModelId: result.returnedModelId } : {}) }, { id: artifactId, projectId, stageId: "claim-map", stageRunId: runId, type: "claim-map", version: workflowRunStore.listArtifacts(projectId, "claim-map").length + 1, status: "needs_review", payloadJson: output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
    return factoryProjectResponseSchema.parse(review);
  } catch (error) {
    const failed = transitionProjectStage(running, "claim-map", "failed"); const message = error instanceof ClaimMapError ? error.message : "Claim Map failed.";
    db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(failed, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "claim-map", status: "failed", runnerId: "claim-map-9router", runnerVersion: "claim-map-v1", providerId: "9router", inputArtifactIds, inputFingerprint: fingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof ClaimMapError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); } catch (persistenceError) { db.exec("ROLLBACK;"); throw persistenceError; }
    throw new Error(message);
  }
});

ipcMain.handle("list-claim-map-artifacts", (_event, input: unknown) => { const { projectId } = claimMapRequestSchema.parse(input); return claimMapArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "claim-map").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });

ipcMain.handle("approve-claim-map", (_event, input: unknown) => {
  const { projectId } = claimMapRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "claim-map").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Claim Map exists."); const claims = claimMapOutputSchema.parse(artifact.payloadJson).claims.map(({ qualification, ...claim }) => ({ ...claim, ...(qualification ? { qualification } : {}) })); const approved = transitionProjectStage({ ...project, claims }, "claim-map", "approved"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved);
});
ipcMain.handle("reject-claim-map", (_event, input: unknown) => { const { projectId } = claimMapRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "claim-map").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId) throw new Error("No reviewable Claim Map exists."); const rejected = transitionProjectStage(project, "claim-map", "rejected"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(rejected, { withinTransaction: true }); workflowRunStore.rejectReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(rejected); });

ipcMain.handle("run-outline", async (_event, input: unknown) => {
  const { projectId } = outlineRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); if (!project.approvedIdeaId) throw new Error("Outline requires an approved idea.");
  const ideaArtifact = currentApprovedArtifacts(project, "idea-lab").find((artifact) => artifact.payloadJson); const profile = seedChannelProfiles.find((item) => item.id === project.profileId); if (!ideaArtifact?.payloadJson || !profile) throw new Error("Outline requires an approved idea and channel profile.");
  const idea = ideaLabOutputSchema.parse(ideaArtifact.payloadJson).candidates.find((candidate) => candidate.id === project.approvedIdeaId); const claims: Array<{ id: string; state: string; approvalState: string }> = []; if (!idea) throw new Error("Outline requires an approved idea.");
  const fingerprint = canonicalSha256({ stageId: "outline", ideaArtifactId: ideaArtifact.id, profileId: profile.id, duration: project.setup.targetDuration }); const existing = workflowRunStore.findLatestByInput(projectId, "outline", fingerprint); if (isPendingOrAcceptedRun(existing)) return factoryProjectResponseSchema.parse(project);
  const runId = `stage-run-${randomUUID()}`; const now = new Date().toISOString(); const running = transitionProjectStage(transitionProjectStage(project, "outline", "queued"), "outline", "running"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(running, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "outline", status: "running", runnerId: "outline-9router", runnerVersion: "outline-v1", providerId: "9router", inputArtifactIds: [ideaArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
  try { const result = await runOutline({ idea, claims, profile: profile as unknown as Record<string, unknown>, targetDuration: project.setup.targetDuration, credentialStore, certificationStore: textCertificationStore }); const artifactId = `artifact-${randomUUID()}`; const finishedAt = new Date().toISOString(); const review = transitionProjectStage(running, "outline", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(review, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "outline", status: "needs_review", runnerId: "outline-9router", runnerVersion: "outline-v1", providerId: "9router", inputArtifactIds: [ideaArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt }, { id: artifactId, projectId, stageId: "outline", stageRunId: runId, type: "outline", version: workflowRunStore.listArtifacts(projectId, "outline").length + 1, status: "needs_review", payloadJson: result.output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); } catch (error) { const failed = transitionProjectStage(running, "outline", "failed"); const message = error instanceof OutlineError ? error.message : "Outline failed."; db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(failed, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "outline", status: "failed", runnerId: "outline-9router", runnerVersion: "outline-v1", providerId: "9router", inputArtifactIds: [ideaArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof OutlineError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); } catch (persistenceError) { db.exec("ROLLBACK;"); throw persistenceError; } throw new Error(message); }
});

ipcMain.handle("list-outline-artifacts", (_event, input: unknown) => { const { projectId } = outlineRequestSchema.parse(input); return outlineArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "outline").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });

ipcMain.handle("approve-outline", (_event, input: unknown) => { const { projectId } = outlineRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "outline").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Outline exists."); outlineOutputSchema.parse(artifact.payloadJson); const approved = transitionProjectStage(project, "outline", "approved"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });
ipcMain.handle("reject-outline", (_event, input: unknown) => { const { projectId } = outlineRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "outline").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId) throw new Error("No reviewable Outline exists."); const rejected = transitionProjectStage(project, "outline", "rejected"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(rejected, { withinTransaction: true }); workflowRunStore.rejectReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(rejected); });

ipcMain.handle("run-script", async (_event, input: unknown) => {
  const { projectId } = scriptRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const outlineArtifact = currentApprovedArtifacts(project, "outline").find((item) => item.payloadJson); if (!outlineArtifact?.payloadJson) throw new Error("Script requires an approved Outline."); const outline = outlineOutputSchema.parse(outlineArtifact.payloadJson); const claims = project.claims; const fingerprint = canonicalSha256({ stageId: "script", outlineArtifactId: outlineArtifact.id, claims }); const existing = workflowRunStore.findLatestByInput(projectId, "script", fingerprint); if (isPendingOrAcceptedRun(existing)) return factoryProjectResponseSchema.parse(project); const runId = `stage-run-${randomUUID()}`; const now = new Date().toISOString(); const running = transitionProjectStage(transitionProjectStage(project, "script", "queued"), "script", "running"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(running, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "script", status: "running", runnerId: "script-9router", runnerVersion: "script-v1", providerId: "9router", inputArtifactIds: [outlineArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } try { const result = await runScript({ outline, claims, credentialStore, certificationStore: textCertificationStore }); const artifactId = `artifact-${randomUUID()}`; const finishedAt = new Date().toISOString(); const review = transitionProjectStage(running, "script", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(review, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "script", status: "needs_review", runnerId: "script-9router", runnerVersion: "script-v1", providerId: "9router", inputArtifactIds: [outlineArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt }, { id: artifactId, projectId, stageId: "script", stageRunId: runId, type: "script", version: workflowRunStore.listArtifacts(projectId, "script").length + 1, status: "needs_review", payloadJson: result.output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); } catch (error) { const failed = transitionProjectStage(running, "script", "failed"); const message = error instanceof ScriptError ? error.message : "Script failed."; db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(failed, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "script", status: "failed", runnerId: "script-9router", runnerVersion: "script-v1", providerId: "9router", inputArtifactIds: [outlineArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof ScriptError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); } catch (persistenceError) { db.exec("ROLLBACK;" ); throw persistenceError; } throw new Error(message); }
});

ipcMain.handle("approve-script", (_event, input: unknown) => { const { projectId } = scriptRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "script").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Script exists."); const sections = scriptOutputSchema.parse(artifact.payloadJson).sections.map(({ openLoop, ...section }) => ({ ...section, ...(openLoop ? { openLoop } : {}) })); const approved = transitionProjectStage({ ...project, scriptSections: sections }, "script", "approved"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });
ipcMain.handle("reject-script", (_event, input: unknown) => { const { projectId } = scriptRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "script").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId) throw new Error("No reviewable Script exists."); const rejected = transitionProjectStage(project, "script", "rejected"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(rejected, { withinTransaction: true }); workflowRunStore.rejectReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(rejected); });

ipcMain.handle("list-script-artifacts", (_event, input: unknown) => { const { projectId } = scriptRequestSchema.parse(input); return scriptArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "script").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });

ipcMain.handle("run-fact-review", (_event, input: unknown) => { const { projectId } = factReviewRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const scriptArtifact = currentApprovedArtifacts(project, "script").find((item) => item.payloadJson); if (!scriptArtifact?.payloadJson) throw new Error("Fact Review requires an approved Script."); const usedClaimIds = new Set(scriptOutputSchema.parse(scriptArtifact.payloadJson).sections.flatMap((section) => section.linkedClaimIds)); const claims = project.claims.filter((claim) => usedClaimIds.has(claim.id)); const fingerprint = canonicalSha256({ stageId: "fact-review", scriptArtifactId: scriptArtifact.id, claims }); const existing = workflowRunStore.findLatestByInput(projectId, "fact-review", fingerprint); if (isPendingOrAcceptedRun(existing)) return factoryProjectResponseSchema.parse(project); const runId = `stage-run-${randomUUID()}`; const artifactId = `artifact-${randomUUID()}`; const now = new Date().toISOString(); const findings = reviewFacts(claims); const output = factReviewOutputSchema.parse({ reviewer: "local_deterministic", findings }); const review = transitionProjectStage(transitionProjectStage(transitionProjectStage(project, "fact-review", "queued"), "fact-review", "running"), "fact-review", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(review, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "fact-review", status: "running", runnerId: "fact-review-local", runnerVersion: "fact-review-v1", inputArtifactIds: [scriptArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "fact-review", status: "needs_review", runnerId: "fact-review-local", runnerVersion: "fact-review-v1", inputArtifactIds: [scriptArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt: now }, { id: artifactId, projectId, stageId: "fact-review", stageRunId: runId, type: "fact-review", version: workflowRunStore.listArtifacts(projectId, "fact-review").length + 1, status: "needs_review", payloadJson: output, createdAt: now, updatedAt: now }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); });

ipcMain.handle("list-fact-review-artifacts", (_event, input: unknown) => { const { projectId } = factReviewRequestSchema.parse(input); return factReviewArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "fact-review").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });

ipcMain.handle("approve-fact-review", (_event, input: unknown) => { const { projectId } = factReviewRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "fact-review").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Fact Review exists."); const output = factReviewOutputSchema.parse(artifact.payloadJson); if (factReviewFindingsBlockApproval(output.findings)) throw new Error("Blocked fact-review findings must be resolved before approval."); const approved = transitionProjectStage(project, "fact-review", "approved"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });
ipcMain.handle("reject-fact-review", (_event, input: unknown) => { const { projectId } = factReviewRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "fact-review").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId) throw new Error("No reviewable Fact Review exists."); const rejected = transitionProjectStage(project, "fact-review", "rejected"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(rejected, { withinTransaction: true }); workflowRunStore.rejectReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(rejected); });

ipcMain.handle("run-retention-review", async (_event, input: unknown) => { const { projectId } = retentionReviewRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const scriptArtifact = currentApprovedArtifacts(project, "script").find((item) => item.payloadJson); const factArtifact = currentApprovedArtifacts(project, "fact-review").find((item) => item.payloadJson); if (!scriptArtifact?.payloadJson || !factArtifact?.payloadJson) throw new Error("Retention Review requires approved Script and Fact Review."); const script = scriptOutputSchema.parse(scriptArtifact.payloadJson); const fingerprint = canonicalSha256({ stageId: "retention-review", scriptArtifactId: scriptArtifact.id, factArtifactId: factArtifact.id }); const existing = workflowRunStore.findLatestByInput(projectId, "retention-review", fingerprint); if (isPendingOrAcceptedRun(existing)) return factoryProjectResponseSchema.parse(project); const runId = `stage-run-${randomUUID()}`; const now = new Date().toISOString(); const running = transitionProjectStage(transitionProjectStage(project, "retention-review", "queued"), "retention-review", "running"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(running, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "retention-review", status: "running", runnerId: "retention-review-9router", runnerVersion: "retention-review-v1", providerId: "9router", inputArtifactIds: [scriptArtifact.id, factArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } try { const result = await runRetentionReview({ script, credentialStore, certificationStore: textCertificationStore }); const artifactId = `artifact-${randomUUID()}`; const finishedAt = new Date().toISOString(); const review = transitionProjectStage(running, "retention-review", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(review, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "retention-review", status: "needs_review", runnerId: "retention-review-9router", runnerVersion: "retention-review-v1", providerId: "9router", inputArtifactIds: [scriptArtifact.id, factArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt }, { id: artifactId, projectId, stageId: "retention-review", stageRunId: runId, type: "retention-review", version: workflowRunStore.listArtifacts(projectId, "retention-review").length + 1, status: "needs_review", payloadJson: result.output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); } catch (error) { const failed = transitionProjectStage(running, "retention-review", "failed"); const message = error instanceof RetentionReviewError ? error.message : "Retention Review failed."; db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(failed, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "retention-review", status: "failed", runnerId: "retention-review-9router", runnerVersion: "retention-review-v1", providerId: "9router", inputArtifactIds: [scriptArtifact.id, factArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof RetentionReviewError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); } catch (persistenceError) { db.exec("ROLLBACK;"); throw persistenceError; } throw new Error(message); } });

ipcMain.handle("list-retention-review-artifacts", (_event, input: unknown) => { const { projectId } = retentionReviewRequestSchema.parse(input); return retentionReviewArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "retention-review").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });

ipcMain.handle("approve-retention-review", (_event, input: unknown) => { const { projectId } = retentionReviewRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "retention-review").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Retention Review exists."); const output = retentionReviewOutputSchema.parse(artifact.payloadJson); if (retentionReviewBlocksApproval(output)) throw new Error("Blocked Retention Review findings must be resolved before approval."); const approved = transitionProjectStage(project, "retention-review", "approved"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });
ipcMain.handle("reject-retention-review", (_event, input: unknown) => { const { projectId } = retentionReviewRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "retention-review").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId) throw new Error("No reviewable Retention Review exists."); const rejected = transitionProjectStage(project, "retention-review", "rejected"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(rejected, { withinTransaction: true }); workflowRunStore.rejectReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(rejected); });

ipcMain.handle("run-scene-plan", async (_event, input: unknown) => { const { projectId } = scenePlanRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const scriptArtifact = currentApprovedArtifacts(project, "script").find((item) => item.payloadJson); const retentionArtifact = currentApprovedArtifacts(project, "retention-review").find((item) => item.payloadJson); if (!scriptArtifact?.payloadJson || !retentionArtifact?.payloadJson) throw new Error("Scene Plan requires approved Script and Retention Review."); const script = scriptOutputSchema.parse(scriptArtifact.payloadJson); const fingerprint = canonicalSha256({ stageId: "scene-plan", scriptArtifactId: scriptArtifact.id, retentionArtifactId: retentionArtifact.id, fps: project.timeline.fps }); const existing = workflowRunStore.findLatestByInput(projectId, "scene-plan", fingerprint); if (isPendingOrAcceptedRun(existing)) return factoryProjectResponseSchema.parse(project); const runId = `stage-run-${randomUUID()}`; const running = transitionProjectStage(transitionProjectStage(project, "scene-plan", "queued"), "scene-plan", "running"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(running, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "scene-plan", status: "running", runnerId: "scene-plan-9router", runnerVersion: "scene-plan-v1", providerId: "9router", inputArtifactIds: [scriptArtifact.id, retentionArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: new Date().toISOString() }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } try { const result = await runScenePlan({ script, fps: project.timeline.fps, credentialStore, certificationStore: textCertificationStore }); const artifactId = `artifact-${randomUUID()}`; const finishedAt = new Date().toISOString(); const review = transitionProjectStage(running, "scene-plan", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(review, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "scene-plan", status: "needs_review", runnerId: "scene-plan-9router", runnerVersion: "scene-plan-v1", providerId: "9router", inputArtifactIds: [scriptArtifact.id, retentionArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt }, { id: artifactId, projectId, stageId: "scene-plan", stageRunId: runId, type: "scene-plan", version: workflowRunStore.listArtifacts(projectId, "scene-plan").length + 1, status: "needs_review", payloadJson: result.output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); } catch (error) { const failed = transitionProjectStage(running, "scene-plan", "failed"); const message = error instanceof ScenePlanError ? error.message : "Scene Plan failed."; db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(failed, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "scene-plan", status: "failed", runnerId: "scene-plan-9router", runnerVersion: "scene-plan-v1", providerId: "9router", inputArtifactIds: [scriptArtifact.id, retentionArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof ScenePlanError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); } catch (persistenceError) { db.exec("ROLLBACK;"); throw persistenceError; } throw new Error(message); } });

ipcMain.handle("list-scene-plan-artifacts", (_event, input: unknown) => { const { projectId } = scenePlanRequestSchema.parse(input); return scenePlanArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "scene-plan").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });
ipcMain.handle("approve-scene-plan", (_event, input: unknown) => { const { projectId } = scenePlanRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "scene-plan").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Scene Plan exists."); const scenes = scenePlanOutputSchema.parse(artifact.payloadJson).scenes.map(({ proofObject, ...scene }) => ({ ...scene, ...(proofObject ? { proofObject } : {}) })); const approved = transitionProjectStage(markDownstreamStagesStale({ ...project, scenes }, "scene-plan"), "scene-plan", "approved"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });
ipcMain.handle("reject-scene-plan", (_event, input: unknown) => { const { projectId } = scenePlanRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "scene-plan").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId) throw new Error("No reviewable Scene Plan exists."); const rejected = transitionProjectStage(project, "scene-plan", "rejected"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(rejected, { withinTransaction: true }); workflowRunStore.rejectReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(rejected); });

ipcMain.handle("run-shot-plan", async (_event, input: unknown) => { const { projectId } = shotPlanRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const sceneArtifact = currentApprovedArtifacts(project, "scene-plan").find((item) => item.payloadJson); if (!sceneArtifact?.payloadJson) throw new Error("Shot Plan requires an approved Scene Plan."); const scenePlan = scenePlanOutputSchema.parse(sceneArtifact.payloadJson); const fingerprint = canonicalSha256({ stageId: "shot-plan", sceneArtifactId: sceneArtifact.id, fps: project.timeline.fps }); const existing = workflowRunStore.findLatestByInput(projectId, "shot-plan", fingerprint); if (isPendingOrAcceptedRun(existing)) return factoryProjectResponseSchema.parse(project); const runId = `stage-run-${randomUUID()}`; const running = transitionProjectStage(transitionProjectStage(project, "shot-plan", "queued"), "shot-plan", "running"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(running, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "shot-plan", status: "running", runnerId: "shot-plan-9router", runnerVersion: "shot-plan-v1", providerId: "9router", inputArtifactIds: [sceneArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: new Date().toISOString() }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } try { const result = await runShotPlan({ scenes: scenePlan.scenes, fps: project.timeline.fps, credentialStore, certificationStore: textCertificationStore }); const artifactId = `artifact-${randomUUID()}`; const finishedAt = new Date().toISOString(); const review = transitionProjectStage(running, "shot-plan", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(review, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "shot-plan", status: "needs_review", runnerId: "shot-plan-9router", runnerVersion: "shot-plan-v1", providerId: "9router", inputArtifactIds: [sceneArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt }, { id: artifactId, projectId, stageId: "shot-plan", stageRunId: runId, type: "shot-plan", version: workflowRunStore.listArtifacts(projectId, "shot-plan").length + 1, status: "needs_review", payloadJson: result.output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); } catch (error) { const failed = transitionProjectStage(running, "shot-plan", "failed"); const message = error instanceof ShotPlanError ? error.message : "Shot Plan failed."; db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(failed, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "shot-plan", status: "failed", runnerId: "shot-plan-9router", runnerVersion: "shot-plan-v1", providerId: "9router", inputArtifactIds: [sceneArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof ShotPlanError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); } catch (persistenceError) { db.exec("ROLLBACK;"); throw persistenceError; } throw new Error(message); } });

ipcMain.handle("list-shot-plan-artifacts", (_event, input: unknown) => { const { projectId } = shotPlanRequestSchema.parse(input); return shotPlanArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "shot-plan").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });
ipcMain.handle("approve-shot-plan", (_event, input: unknown) => { const { projectId } = shotPlanRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "shot-plan").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Shot Plan exists."); const shots = shotPlanOutputSchema.parse(artifact.payloadJson).shots; const approved = transitionProjectStage(markDownstreamStagesStale({ ...project, shots }, "shot-plan"), "shot-plan", "approved"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });
ipcMain.handle("reject-shot-plan", (_event, input: unknown) => { const { projectId } = shotPlanRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "shot-plan").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId) throw new Error("No reviewable Shot Plan exists."); const rejected = transitionProjectStage(project, "shot-plan", "rejected"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(rejected, { withinTransaction: true }); workflowRunStore.rejectReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(rejected); });

ipcMain.handle("run-visual-routing", (_event, input: unknown) => { const { projectId } = visualRoutingRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const shotArtifact = currentApprovedArtifacts(project, "shot-plan").find((item) => item.payloadJson); if (!shotArtifact?.payloadJson) throw new Error("Visual Routing requires an approved Shot Plan."); const shots = shotPlanOutputSchema.parse(shotArtifact.payloadJson).shots; const fingerprint = canonicalSha256({ stageId: "visual-routing", shotArtifactId: shotArtifact.id }); const existing = workflowRunStore.findLatestByInput(projectId, "visual-routing", fingerprint); if (isPendingOrAcceptedRun(existing)) return factoryProjectResponseSchema.parse(project); const runId = `stage-run-${randomUUID()}`; const artifactId = `artifact-${randomUUID()}`; const now = new Date().toISOString(); const output = visualRoutingOutputSchema.parse({ shots: applyVisualRouting(shots) }); const review = transitionProjectStage(transitionProjectStage(transitionProjectStage(project, "visual-routing", "queued"), "visual-routing", "running"), "visual-routing", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(review, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "visual-routing", status: "running", runnerId: "visual-routing-local", runnerVersion: "visual-routing-v1", inputArtifactIds: [shotArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "visual-routing", status: "needs_review", runnerId: "visual-routing-local", runnerVersion: "visual-routing-v1", inputArtifactIds: [shotArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt: now }, { id: artifactId, projectId, stageId: "visual-routing", stageRunId: runId, type: "visual-routing", version: workflowRunStore.listArtifacts(projectId, "visual-routing").length + 1, status: "needs_review", payloadJson: output, createdAt: now, updatedAt: now }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); });
ipcMain.handle("list-visual-routing-artifacts", (_event, input: unknown) => { const { projectId } = visualRoutingRequestSchema.parse(input); return visualRoutingArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "visual-routing").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });
ipcMain.handle("edit-visual-routing", (_event, input: unknown) => {
  const { projectId, artifactId, shotId, visualMode } = editVisualRoutingRequestSchema.parse(input);
  const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const source = workflowRunStore.listArtifacts(projectId, "visual-routing").find((item) => item.id === artifactId && (item.status === "needs_review" || item.status === "approved"));
  if (!source?.stageRunId || !source.payloadJson) throw new Error("Visual Routing revision must start from a reviewable artifact.");
  const shotArtifact = currentApprovedArtifacts(project, "shot-plan").find((item) => item.payloadJson);
  if (!shotArtifact) throw new Error("Visual Routing revision requires an approved Shot Plan.");
  const current = visualRoutingOutputSchema.parse(source.payloadJson);
  if (!current.shots.some((shot) => shot.id === shotId)) throw new Error("Shot is not present in the Visual Routing artifact.");
  const output = visualRoutingOutputSchema.parse({ shots: current.shots.map((shot) => shot.id === shotId ? { ...shot, visualMode } : shot) });
  const fingerprint = canonicalSha256({ stageId: "visual-routing", shotArtifactId: shotArtifact.id, sourceArtifactId: source.id, shotId, visualMode });
  const existing = workflowRunStore.findLatestByInput(projectId, "visual-routing", fingerprint);
  if (isPendingOrAcceptedRun(existing)) return factoryProjectResponseSchema.parse(project);
  const runId = `stage-run-${randomUUID()}`;
  const nextArtifactId = `artifact-${randomUUID()}`;
  const now = new Date().toISOString();
  const nextProject = source.status === "approved"
    ? transitionProjectStage(
      transitionProjectStage(
        transitionProjectStage(markDownstreamStagesStale(project, "visual-routing"), "visual-routing", "stale"),
        "visual-routing",
        "queued"
      ),
      "visual-routing",
      "running"
    )
    : markDownstreamStagesStale(project, "visual-routing");
  db.exec("BEGIN IMMEDIATE;");
  try {
    if (source.status === "approved") workflowRunStore.markStageArtifactsStale(projectId, ["visual-routing"]);
    else workflowRunStore.rejectReviewRun(source.stageRunId, { withinTransaction: true });
    const reviewProject = source.status === "approved" ? transitionProjectStage(nextProject, "visual-routing", "needs_review") : nextProject;
    saveProjectWithWorkflowInvalidation(reviewProject, { withinTransaction: true });
    workflowRunStore.createRun({ id: runId, projectId, stageId: "visual-routing", status: "running", runnerId: "visual-routing-user-edit", runnerVersion: "visual-routing-v1", inputArtifactIds: [shotArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now });
    workflowRunStore.finishRun({ id: runId, projectId, stageId: "visual-routing", status: "needs_review", runnerId: "visual-routing-user-edit", runnerVersion: "visual-routing-v1", inputArtifactIds: [shotArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [nextArtifactId], finishedAt: now }, { id: nextArtifactId, projectId, stageId: "visual-routing", stageRunId: runId, type: "visual-routing", version: workflowRunStore.listArtifacts(projectId, "visual-routing").length + 1, status: "needs_review", payloadJson: output, createdAt: now, updatedAt: now }, { withinTransaction: true });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  return factoryProjectResponseSchema.parse(source.status === "approved" ? transitionProjectStage(nextProject, "visual-routing", "needs_review") : nextProject);
});

function persistSceneReviewRevision(input: {
  project: FactoryProject;
  stageId: "scene-plan" | "visual-routing" | "prompt-preparation";
  source: WorkflowArtifact;
  inputArtifactIds: string[];
  output: unknown;
  type: string;
  projectUpdate: FactoryProject;
}): FactoryProject {
  if (!input.source.stageRunId) throw new Error("Scene Review revision has no source run.");
  const outputArtifact = input.stageId === "scene-plan"
    ? scenePlanOutputSchema.parse(input.output)
    : input.stageId === "visual-routing"
      ? visualRoutingOutputSchema.parse(input.output)
      : promptPreparationOutputSchema.parse(input.output);
  const now = new Date().toISOString();
  const runId = `stage-run-${randomUUID()}`;
  const artifactId = `artifact-${randomUUID()}`;
  const staleProject = markDownstreamStagesStale(input.project, input.stageId);
  const runningProject = input.source.status === "approved"
    ? transitionProjectStage(
      transitionProjectStage(
        transitionProjectStage(staleProject, input.stageId, "stale"),
        input.stageId,
        "queued"
      ),
      input.stageId,
      "running"
    )
    : staleProject;
  const reviewProject = input.source.status === "approved" ? transitionProjectStage(runningProject, input.stageId, "needs_review") : runningProject;
  const reviewOutput = {
    ...input.projectUpdate,
    stages: reviewProject.stages
  };
  db.exec("BEGIN IMMEDIATE;");
  try {
    if (input.source.status === "approved") workflowRunStore.markStageArtifactsStale(input.project.id, [input.stageId]);
    else workflowRunStore.rejectReviewRun(input.source.stageRunId, { withinTransaction: true });
    saveProjectWithWorkflowInvalidation(reviewOutput, { withinTransaction: true });
    workflowRunStore.createRun({ id: runId, projectId: input.project.id, stageId: input.stageId, status: "running", runnerId: "scene-review-user-action", runnerVersion: "scene-review-v1", inputArtifactIds: input.inputArtifactIds, inputFingerprint: canonicalSha256({ stageId: input.stageId, sourceArtifactId: input.source.id, output: outputArtifact }), outputArtifactIds: [], startedAt: now });
    workflowRunStore.finishRun({ id: runId, projectId: input.project.id, stageId: input.stageId, status: "needs_review", runnerId: "scene-review-user-action", runnerVersion: "scene-review-v1", inputArtifactIds: input.inputArtifactIds, inputFingerprint: canonicalSha256({ stageId: input.stageId, sourceArtifactId: input.source.id, output: outputArtifact }), outputArtifactIds: [artifactId], finishedAt: now }, { id: artifactId, projectId: input.project.id, stageId: input.stageId, stageRunId: runId, type: input.type, version: workflowRunStore.listArtifacts(input.project.id, input.stageId).length + 1, status: "needs_review", payloadJson: outputArtifact, createdAt: now, updatedAt: now }, { withinTransaction: true });
    workflowRunStore.approveReviewRun(runId, { withinTransaction: true });
    const approvedProject = transitionProjectStage({ ...input.projectUpdate, stages: reviewProject.stages }, input.stageId, "approved");
    saveProjectWithWorkflowInvalidation(approvedProject, { withinTransaction: true });
    db.exec("COMMIT;");
    factoryProjectResponseSchema.parse(approvedProject);
    return approvedProject;
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

ipcMain.handle("revise-scene-review", (_event, input: unknown) => {
  const request = sceneReviewRevisionRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const source = workflowRunStore.listArtifacts(request.projectId, request.action === "edit_prompt" ? "prompt-preparation" : request.action === "remove_scene" ? "scene-plan" : "visual-routing")
    .find((artifact) => artifact.id === request.artifactId && (artifact.status === "needs_review" || artifact.status === "approved"));
  if (!source?.payloadJson) throw new Error("Scene Review revision must start from a reviewable artifact.");

  if (request.action === "edit_prompt") {
    const current = promptPreparationOutputSchema.parse(source.payloadJson);
    const prompt = current.prompts.find((item) => item.shotId === request.shotId);
    if (!prompt) throw new Error("The selected shot has no generation prompt.");
    const nextPrompt = { ...prompt, promptVersionId: `prompt-${randomUUID()}`, positivePrompt: request.positivePrompt, negativePrompt: request.negativePrompt };
    const output = { prompts: current.prompts.map((item) => item.shotId === request.shotId ? nextPrompt : item) };
    const visualArtifact = currentApprovedArtifacts(project, "visual-routing").find((item) => item.payloadJson);
    if (!visualArtifact) throw new Error("Prompt editing requires approved Visual Routing.");
    return persistSceneReviewRevision({ project, stageId: "prompt-preparation", source, inputArtifactIds: [visualArtifact.id], output, type: "visual-prompts", projectUpdate: { ...project, shots: project.shots.map((shot) => shot.id === request.shotId ? { ...shot, promptVersionId: nextPrompt.promptVersionId } : shot) } });
  }

  if (request.action === "edit_direction") {
    const current = visualRoutingOutputSchema.parse(source.payloadJson);
    if (!current.shots.some((shot) => shot.id === request.shotId)) throw new Error("The selected shot is not present in Visual Routing.");
    const output = { shots: current.shots.map((shot) => shot.id === request.shotId ? { ...shot, framing: request.framing, cameraAngle: request.cameraAngle, cameraMovement: request.cameraMovement, subjectAction: request.subjectAction } : shot) };
    const shotArtifact = currentApprovedArtifacts(project, "shot-plan").find((item) => item.payloadJson);
    if (!shotArtifact) throw new Error("Direction editing requires approved Shot Plan.");
    return persistSceneReviewRevision({ project, stageId: "visual-routing", source, inputArtifactIds: [shotArtifact.id], output, type: "visual-routing", projectUpdate: { ...project, shots: project.shots.map((shot) => shot.id === request.shotId ? { ...shot, framing: request.framing, cameraAngle: request.cameraAngle, cameraMovement: request.cameraMovement, subjectAction: request.subjectAction } : shot) } });
  }

  if (request.action === "change_scene_type") {
    const current = visualRoutingOutputSchema.parse(source.payloadJson);
    const sceneShotIds = new Set(project.shots.filter((shot) => shot.sceneId === request.sceneId).map((shot) => shot.id));
    if (!project.scenes.some((scene) => scene.id === request.sceneId) || !sceneShotIds.size) throw new Error("The selected scene is not editable.");
    const output = { shots: current.shots.map((shot) => sceneShotIds.has(shot.id) ? { ...shot, visualMode: request.visualMode } : shot) };
    const shotArtifact = currentApprovedArtifacts(project, "shot-plan").find((item) => item.payloadJson);
    if (!shotArtifact) throw new Error("Scene type editing requires approved Shot Plan.");
    return persistSceneReviewRevision({ project, stageId: "visual-routing", source, inputArtifactIds: [shotArtifact.id], output, type: "visual-routing", projectUpdate: { ...project, scenes: project.scenes.map((scene) => scene.id === request.sceneId ? { ...scene, visualMode: request.visualMode } : scene), shots: project.shots.map((shot) => sceneShotIds.has(shot.id) ? { ...shot, visualMode: request.visualMode } : shot) } });
  }

  const current = scenePlanOutputSchema.parse(source.payloadJson);
  if (current.scenes.length <= 1) throw new Error("A project must keep at least one scene.");
  if (!current.scenes.some((scene) => scene.id === request.sceneId)) throw new Error("The selected scene is not present in Scene Plan.");
  const output = { ...current, scenes: current.scenes.filter((scene) => scene.id !== request.sceneId) };
  const scriptArtifact = currentApprovedArtifacts(project, "script").find((item) => item.payloadJson);
  const retentionArtifact = currentApprovedArtifacts(project, "retention-review").find((item) => item.payloadJson);
  if (!scriptArtifact || !retentionArtifact) throw new Error("Removing a scene requires approved Script and Retention Review.");
  return persistSceneReviewRevision({ project, stageId: "scene-plan", source, inputArtifactIds: [scriptArtifact.id, retentionArtifact.id], output, type: "scene-plan", projectUpdate: { ...project, scenes: project.scenes.filter((scene) => scene.id !== request.sceneId), shots: project.shots.filter((shot) => shot.sceneId !== request.sceneId) } });
});

ipcMain.handle("approve-visual-routing", (_event, input: unknown) => { const { projectId } = visualRoutingRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "visual-routing").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Visual Routing exists."); const shots = visualRoutingOutputSchema.parse(artifact.payloadJson).shots; const approved = transitionProjectStage(markDownstreamStagesStale({ ...project, shots }, "visual-routing"), "visual-routing", "approved"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });
ipcMain.handle("reject-visual-routing", (_event, input: unknown) => { const { projectId } = visualRoutingRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "visual-routing").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId) throw new Error("No reviewable Visual Routing exists."); const rejected = transitionProjectStage(project, "visual-routing", "rejected"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(rejected, { withinTransaction: true }); workflowRunStore.rejectReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(rejected); });

ipcMain.handle("run-prompt-preparation", async (_event, input: unknown) => { const { projectId } = promptPreparationRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const routingArtifact = currentApprovedArtifacts(project, "visual-routing").find((item) => item.payloadJson); if (!routingArtifact?.payloadJson) throw new Error("Prompt Preparation requires approved Visual Routing."); const routing = visualRoutingOutputSchema.parse(routingArtifact.payloadJson); const aspectRatio = project.format === "short" ? "9:16" : "16:9" as const; const fingerprint = canonicalSha256({ stageId: "prompt-preparation", visualRoutingArtifactId: routingArtifact.id, aspectRatio }); const existing = workflowRunStore.findLatestByInput(projectId, "prompt-preparation", fingerprint); if (isPendingOrAcceptedRun(existing)) return factoryProjectResponseSchema.parse(project); const runId = `stage-run-${randomUUID()}`; const running = transitionProjectStage(transitionProjectStage(project, "prompt-preparation", "queued"), "prompt-preparation", "running"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(running, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "prompt-preparation", status: "running", runnerId: "prompt-preparation-9router", runnerVersion: "prompt-preparation-v1", providerId: "9router", promptTemplateId: "visual-prompt-v1", promptVersion: "v1", inputArtifactIds: [routingArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: new Date().toISOString() }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } try { const result = await runPromptPreparation({ shots: routing.shots, aspectRatio, credentialStore, certificationStore: textCertificationStore }); const artifactId = `artifact-${randomUUID()}`; const finishedAt = new Date().toISOString(); const review = transitionProjectStage(running, "prompt-preparation", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(review, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "prompt-preparation", status: "needs_review", runnerId: "prompt-preparation-9router", runnerVersion: "prompt-preparation-v1", providerId: "9router", promptTemplateId: "visual-prompt-v1", promptVersion: "v1", inputArtifactIds: [routingArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt, ...(result.returnedModelId ? { returnedModelId: result.returnedModelId } : {}) }, { id: artifactId, projectId, stageId: "prompt-preparation", stageRunId: runId, type: "visual-prompts", version: workflowRunStore.listArtifacts(projectId, "prompt-preparation").length + 1, status: "needs_review", payloadJson: result.output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); } catch (error) { const failed = transitionProjectStage(running, "prompt-preparation", "failed"); const message = error instanceof PromptPreparationError ? error.message : "Prompt Preparation failed."; db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(failed, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "prompt-preparation", status: "failed", runnerId: "prompt-preparation-9router", runnerVersion: "prompt-preparation-v1", providerId: "9router", inputArtifactIds: [routingArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof PromptPreparationError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); } catch (persistenceError) { db.exec("ROLLBACK;"); throw persistenceError; } throw new Error(message); } });
ipcMain.handle("list-prompt-preparation-artifacts", (_event, input: unknown) => { const { projectId } = promptPreparationRequestSchema.parse(input); return promptPreparationArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "prompt-preparation").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });
ipcMain.handle("approve-prompt-preparation", (_event, input: unknown) => { const { projectId } = promptPreparationRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "prompt-preparation").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Prompt Preparation exists."); const prompts = promptPreparationOutputSchema.parse(artifact.payloadJson).prompts; const promptVersions = new Map(prompts.map((prompt) => [prompt.shotId, prompt.promptVersionId])); const approved = transitionProjectStage(markDownstreamStagesStale({ ...project, shots: project.shots.map((shot) => promptVersions.has(shot.id) ? { ...shot, promptVersionId: promptVersions.get(shot.id)! } : shot) }, "prompt-preparation"), "prompt-preparation", "approved"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });
ipcMain.handle("reject-prompt-preparation", (_event, input: unknown) => { const { projectId } = promptPreparationRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "prompt-preparation").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId) throw new Error("No reviewable Prompt Preparation exists."); const rejected = transitionProjectStage(project, "prompt-preparation", "rejected"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(rejected, { withinTransaction: true }); workflowRunStore.rejectReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(rejected); });

ipcMain.handle("load-9router-image-certification", async () => loadNineRouterImageCertification({ credentialStore, certificationStore: imageCertificationStore }));
ipcMain.handle("run-9router-image-certification", async (_event, input: unknown) => {
  const { confirmation } = run9RouterImageCertificationRequestSchema.parse(input);
  if (confirmation !== "Run 1 image certification request") throw new Error("Image certification requires explicit confirmation.");
  return runNineRouterImageCertification({ credentialStore, certificationStore: imageCertificationStore, logger });
});
ipcMain.handle("run-asset-acquisition", async (_event, input: unknown) => {
  const { projectId, sceneId } = assetAcquisitionRequestSchema.parse(input);
  const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  if (sceneId && !project.scenes.some((scene) => scene.id === sceneId)) throw new Error("The selected scene was not found.");
  const promptArtifact = currentApprovedArtifacts(project, "prompt-preparation").find((item) => item.payloadJson);
  if (!promptArtifact?.payloadJson) throw new Error("Asset Acquisition requires approved Prompt Preparation.");
  const prompts = promptPreparationOutputSchema.parse(promptArtifact.payloadJson).prompts;
  const targetShots = project.shots.filter((shot) => !sceneId || shot.sceneId === sceneId);
  const priorAssetIds = new Set<string>();
  const priorAssets: AcquiredImageAsset[] = [];
  for (const artifact of [
    ...currentApprovedArtifacts(project, "asset-acquisition"),
    ...currentApprovedArtifacts(project, "asset-review"),
    ...workflowRunStore.listArtifacts(projectId, "asset-acquisition").filter((item) => (item.status === "approved" || item.status === "stale") && item.payloadJson),
    ...workflowRunStore.listArtifacts(projectId, "asset-review").filter((item) => (item.status === "approved" || item.status === "stale") && item.payloadJson)
  ]) {
    const acquisition = assetAcquisitionOutputSchema.safeParse(artifact.payloadJson);
    if (acquisition.success) for (const asset of acquisition.data.assets) if (!priorAssetIds.has(`asset-${asset.sha256}`)) {
      priorAssetIds.add(`asset-${asset.sha256}`);
      priorAssets.push(asset);
    }
    const review = assetReviewOutputSchema.safeParse(artifact.payloadJson);
    if (review.success) for (const item of review.data.assets) if (!priorAssetIds.has(`asset-${item.asset.sha256}`)) {
      priorAssetIds.add(`asset-${item.asset.sha256}`);
      priorAssets.push(item.asset);
    }
  }
  const routePlan = planAssetAcquisition({ shots: targetShots, prompts, priorAssets });
  for (const asset of routePlan.preservedAssets) {
    if (!existsSync(resolveWorkspaceArtifactPath(asset.relativeFilePath))) throw new AssetAcquisitionError("unsafe_asset", `The approved local asset for shot ${asset.shotId} is missing from the workspace.`);
  }
  const certification = routePlan.imagePrompts.length
    ? await loadNineRouterImageCertification({ credentialStore, certificationStore: imageCertificationStore })
    : undefined;
  if (routePlan.imagePrompts.length && certification?.status !== "verified") throw new Error("A verified image-model certification is required before Asset Acquisition can run.");
  const settings = routePlan.imagePrompts.length ? credentialStore.loadProviderCredentialSettings("9router") : undefined;
  const apiKey = routePlan.imagePrompts.length ? await credentialStore.resolveProviderSecret("9router") : null;
  if (routePlan.imagePrompts.length && (!settings?.imageModel || !apiKey)) throw new Error("The selected image model or credential is unavailable.");
  const providerConfig = routePlan.imagePrompts.length
    ? { imageModel: settings!.imageModel!, apiKey: apiKey!, baseUrl: settings!.baseUrl, imageCapabilityVerified: true }
    : undefined;
  const providerRunMetadata = providerConfig ? { providerId: "9router" as const, configuredModelId: providerConfig.imageModel } : {};
  const retryGenerationVersion = sceneId ? workflowRunStore.listArtifacts(projectId, "asset-acquisition").length : 0;
  const fingerprint = canonicalSha256({
    stageId: "asset-acquisition",
    promptArtifactId: promptArtifact.id,
    ...(certification?.record?.id ? { imageCertificationId: certification.record.id } : {}),
    sceneId,
    retryGenerationVersion,
    routes: targetShots.map((shot) => ({ shotId: shot.id, visualMode: shot.visualMode, promptVersionId: shot.promptVersionId, approvedAssetId: shot.approvedAssetId })),
    promptIds: routePlan.imagePrompts.map((prompt) => prompt.promptVersionId),
    preservedAssetIds: routePlan.preservedAssets.map((asset) => asset.sha256)
  });
  const existing = workflowRunStore.findLatestByInput(projectId, "asset-acquisition", fingerprint);
  if (isPendingOrAcceptedRun(existing)) return factoryProjectResponseSchema.parse(project);
  const runId = `stage-run-${randomUUID()}`;
  const runnerId = routePlan.imagePrompts.length ? "asset-acquisition-9router" : "asset-acquisition-local";
  const retryBase = sceneId ? markDownstreamStagesStale(project, "asset-acquisition") : project;
  const rerunBase = sceneId && project.stages.find((stage) => stage.id === "asset-acquisition")?.status === "approved" ? transitionProjectStage(retryBase, "asset-acquisition", "stale") : retryBase;
  const running = transitionProjectStage(transitionProjectStage(rerunBase, "asset-acquisition", "queued"), "asset-acquisition", "running");
  db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(running, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "asset-acquisition", status: "running", runnerId, runnerVersion: "asset-acquisition-v1", ...providerRunMetadata, inputArtifactIds: [promptArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: new Date().toISOString() }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
  try {
    const targetShotIds = new Set(targetShots.map((shot) => shot.id));
    const assetsByShot = new Map<string, AcquiredImageAsset>();
    if (sceneId) for (const asset of priorAssets) if (!targetShotIds.has(asset.shotId)) assetsByShot.set(asset.shotId, asset);
    for (const asset of routePlan.preservedAssets) assetsByShot.set(asset.shotId, asset);
    const assets = [...assetsByShot.values()];
    for (const prompt of routePlan.imagePrompts) {
      if (!providerConfig) throw new AssetAcquisitionError("credential_missing", "The selected image model or credential is unavailable.");
      const jobKey = canonicalSha256({ stageId: "asset-acquisition", projectId, sceneId, retryGenerationVersion, shotId: prompt.shotId, promptVersionId: prompt.promptVersionId, imageModel: providerConfig.imageModel, aspectRatio: prompt.aspectRatio });
      const savedJob = generationJobStore.findByIdempotencyKey(jobKey);
      const priorAsset = savedJob?.state === "succeeded" ? acquiredImageAssetSchema.safeParse(savedJob.payload.asset) : null;
      if (priorAsset?.success) { assets.push(priorAsset.data); continue; }
      const jobId = savedJob?.id ?? `generation-job-${randomUUID()}`;
      const jobPayload = { stageRunId: runId, promptVersionId: prompt.promptVersionId, model: providerConfig.imageModel, shotId: prompt.shotId };
      if (savedJob) generationJobStore.restart(jobId, jobPayload); else generationJobStore.create({ id: jobId, projectId, shotId: prompt.shotId, idempotencyKey: jobKey, state: "running", payload: jobPayload });
      try {
        const asset = await acquireImageAsset({ projectId, shotId: prompt.shotId, promptVersionId: prompt.promptVersionId, idempotencyKey: jobKey, positivePrompt: prompt.positivePrompt, aspectRatio: prompt.aspectRatio, ...providerConfig, workspaceRoot });
        generationJobStore.finish(jobId, "succeeded", { ...jobPayload, asset }); assets.push(asset);
      } catch (error) {
        generationJobStore.finish(jobId, "failed", { ...jobPayload, errorCategory: error instanceof AssetAcquisitionError ? error.category : "unexpected_failure" }); throw error;
      }
    }
    const output = assetAcquisitionOutputSchema.parse({ assets }); const artifactId = `artifact-${randomUUID()}`; const finishedAt = new Date().toISOString(); const review = transitionProjectStage(running, "asset-acquisition", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(review, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "asset-acquisition", status: "needs_review", runnerId, runnerVersion: "asset-acquisition-v1", ...providerRunMetadata, inputArtifactIds: [promptArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt }, { id: artifactId, projectId, stageId: "asset-acquisition", stageRunId: runId, type: "asset", version: workflowRunStore.listArtifacts(projectId, "asset-acquisition").length + 1, status: "needs_review", payloadJson: output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); } catch (error) { const failed = transitionProjectStage(running, "asset-acquisition", "failed"); const message = error instanceof AssetAcquisitionError ? error.message : "Asset Acquisition failed."; db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(failed, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "asset-acquisition", status: "failed", runnerId, runnerVersion: "asset-acquisition-v1", ...providerRunMetadata, inputArtifactIds: [promptArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof AssetAcquisitionError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); } catch (persistenceError) { db.exec("ROLLBACK;"); throw persistenceError; } throw new Error(message); }
});
ipcMain.handle("list-asset-acquisition-artifacts", (_event, input: unknown) => { const { projectId } = assetAcquisitionRequestSchema.parse(input); return assetAcquisitionArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "asset-acquisition").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });
ipcMain.handle("approve-asset-acquisition", (_event, input: unknown) => { const { projectId } = assetAcquisitionRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "asset-acquisition").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Asset Acquisition output exists."); assetAcquisitionOutputSchema.parse(artifact.payloadJson); const approved = transitionProjectStage(markDownstreamStagesStale(project, "asset-acquisition"), "asset-acquisition", "approved"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });
ipcMain.handle("reject-asset-acquisition", (_event, input: unknown) => { const { projectId } = assetAcquisitionRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "asset-acquisition").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId) throw new Error("No reviewable Asset Acquisition output exists."); const rejected = transitionProjectStage(project, "asset-acquisition", "rejected"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(rejected, { withinTransaction: true }); workflowRunStore.rejectReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(rejected); });

ipcMain.handle("run-asset-review", (_event, input: unknown) => {
  const { projectId, sceneId } = assetReviewRequestSchema.parse(input);
  const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const acquisition = currentApprovedArtifacts(project, "asset-acquisition").find((item) => item.payloadJson);
  if (!acquisition?.payloadJson) throw new Error("Asset Review requires approved Asset Acquisition.");
  const assets = assetAcquisitionOutputSchema.parse(acquisition.payloadJson).assets;
  const previous = sceneId ? workflowRunStore.listArtifacts(projectId, "asset-review").find((item) => (item.status === "approved" || item.status === "stale") && item.payloadJson) : undefined;
  const previousItems = previous?.payloadJson ? assetReviewOutputSchema.parse(previous.payloadJson).assets : [];
  const previousByShot = new Map(previousItems.map((item) => [item.asset.shotId, item]));
  const currentShotIds = new Set(assets.map((asset) => asset.shotId));
  const reviewItems = sceneId
    ? [...assets.map((asset) => {
        const prior = previousByShot.get(asset.shotId);
        return prior?.asset.sha256 === asset.sha256 ? prior : { asset, reviewStatus: "needs_review" as const };
      }), ...previousItems.filter((item) => !currentShotIds.has(item.asset.shotId))]
    : assets.map((asset) => ({ asset, reviewStatus: "needs_review" as const }));
  const fingerprint = canonicalSha256({ stageId: "asset-review", acquisitionArtifactId: acquisition.id, previousArtifactId: previous?.id, sceneId });
  const existing = workflowRunStore.findLatestByInput(projectId, "asset-review", fingerprint);
  if (isPendingOrAcceptedRun(existing)) return factoryProjectResponseSchema.parse(project);
  const runId = `stage-run-${randomUUID()}`;
  const artifactId = `artifact-${randomUUID()}`;
  const now = new Date().toISOString();
  const output = assetReviewOutputSchema.parse({ acquisitionArtifactId: acquisition.id, assets: reviewItems });
  const review = transitionProjectStage(transitionProjectStage(transitionProjectStage(project, "asset-review", "queued"), "asset-review", "running"), "asset-review", "needs_review");
  db.exec("BEGIN IMMEDIATE;");
  try {
    saveProjectWithWorkflowInvalidation(review, { withinTransaction: true });
    workflowRunStore.createRun({ id: runId, projectId, stageId: "asset-review", status: "running", runnerId: "asset-review-local", runnerVersion: "asset-review-v1", inputArtifactIds: [acquisition.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now });
    workflowRunStore.finishRun({ id: runId, projectId, stageId: "asset-review", status: "needs_review", runnerId: "asset-review-local", runnerVersion: "asset-review-v1", inputArtifactIds: [acquisition.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt: now }, { id: artifactId, projectId, stageId: "asset-review", stageRunId: runId, type: "asset-review", version: workflowRunStore.listArtifacts(projectId, "asset-review").length + 1, status: "needs_review", payloadJson: output, createdAt: now, updatedAt: now }, { withinTransaction: true });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  return factoryProjectResponseSchema.parse(review);
});
ipcMain.handle("list-asset-review-artifacts", (_event, input: unknown) => { const { projectId } = assetReviewRequestSchema.parse(input); return assetReviewArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "asset-review").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });
ipcMain.handle("revise-asset-review", (_event, input: unknown) => { const request = reviseAssetReviewRequestSchema.parse(input); const project = projectRepository.loadProject(request.projectId); if (!project) throw new Error(`Project not found: ${request.projectId}`); const source = workflowRunStore.listArtifacts(request.projectId, "asset-review").find((item) => item.id === request.artifactId && item.status === "needs_review"); if (!source?.stageRunId || !source.payloadJson) throw new Error("Asset Review revision must start from a reviewable artifact."); const current = assetReviewOutputSchema.parse(source.payloadJson); const inputArtifactIds = [current.acquisitionArtifactId]; const selected = current.assets.find((item) => item.asset.sha256 === request.assetSha256); if (!selected) throw new Error("Asset is not present in the review artifact."); if (request.action === "assign" && (!request.shotId || request.shotId !== selected.asset.shotId)) throw new Error("An asset can only be assigned to its explicitly mapped shot."); if (request.action === "assign" && selected.reviewStatus !== "approved") throw new Error("Approve an asset before assigning it."); const assets = current.assets.map((item) => { if (item.asset.sha256 !== request.assetSha256) return item; if (request.action === "approve") return { ...item, reviewStatus: "approved" as const }; if (request.action === "reject") return { ...item, reviewStatus: "rejected" as const, assignedShotId: undefined }; if (request.action === "assign") return { ...item, assignedShotId: request.shotId! }; return { ...item, assignedShotId: undefined }; }); const output = assetReviewOutputSchema.parse({ ...current, assets }); const fingerprint = canonicalSha256({ stageId: "asset-review", sourceArtifactId: source.id, assetSha256: request.assetSha256, action: request.action, ...(request.shotId ? { shotId: request.shotId } : {}) }); const runId = `stage-run-${randomUUID()}`; const artifactId = `artifact-${randomUUID()}`; const now = new Date().toISOString(); db.exec("BEGIN IMMEDIATE;"); try { workflowRunStore.rejectReviewRun(source.stageRunId, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId: request.projectId, stageId: "asset-review", status: "running", runnerId: "asset-review-user-action", runnerVersion: "asset-review-v1", inputArtifactIds, inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); workflowRunStore.finishRun({ id: runId, projectId: request.projectId, stageId: "asset-review", status: "needs_review", runnerId: "asset-review-user-action", runnerVersion: "asset-review-v1", inputArtifactIds, inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt: now }, { id: artifactId, projectId: request.projectId, stageId: "asset-review", stageRunId: runId, type: "asset-review", version: workflowRunStore.listArtifacts(request.projectId, "asset-review").length + 1, status: "needs_review", payloadJson: output, createdAt: now, updatedAt: now }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(project); });
ipcMain.handle("approve-asset-review", (_event, input: unknown) => { const { projectId } = assetReviewRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "asset-review").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Asset Review exists."); const output = assetReviewOutputSchema.parse(artifact.payloadJson); if (output.assets.some((item) => item.reviewStatus !== "approved" || !item.assignedShotId)) throw new Error("Approve and explicitly assign every generated asset before completing Asset Review."); const shotIds = new Set(project.shots.map((shot) => shot.id)); if (output.assets.some((item) => !shotIds.has(item.assignedShotId!))) throw new Error("Assigned asset shot does not exist in the current project."); const assignments = new Map(output.assets.map((item) => [item.assignedShotId!, `asset-${item.asset.sha256}`])); const approved = transitionProjectStage(markDownstreamStagesStale({ ...project, shots: project.shots.map((shot) => assignments.has(shot.id) ? { ...shot, approvedAssetId: assignments.get(shot.id)! } : shot) }, "asset-review"), "asset-review", "approved"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });
ipcMain.handle("reject-asset-review", (_event, input: unknown) => { const { projectId } = assetReviewRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "asset-review").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId) throw new Error("No reviewable Asset Review exists."); const rejected = transitionProjectStage(project, "asset-review", "rejected"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(rejected, { withinTransaction: true }); workflowRunStore.rejectReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(rejected); });

ipcMain.handle("select-manual-asset-upload", async (_event, input: unknown) => {
  const request = manualAssetUploadRequestSchema.parse(input); const project = projectRepository.loadProject(request.projectId); if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const source = workflowRunStore.listArtifacts(request.projectId, "asset-review").find((item) => item.id === request.artifactId && item.status === "needs_review"); if (!source?.stageRunId || !source.payloadJson) throw new Error("Manual Upload must start from a reviewable Asset Review artifact.");
  const shot = project.shots.find((item) => item.id === request.shotId); if (!shot) throw new Error("The selected shot was not found.");
  const selected = await dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }] }); if (selected.canceled || !selected.filePaths[0]) return factoryProjectResponseSchema.parse(project);
  const asset = await importLocalImageAsset({ projectId: request.projectId, shotId: request.shotId, workspaceRoot, sourcePath: selected.filePaths[0] }); const current = assetReviewOutputSchema.parse(source.payloadJson); if (current.assets.some((item) => item.asset.sha256 === asset.sha256)) throw new Error("That image is already present in this review.");
  const output = assetReviewOutputSchema.parse({ ...current, assets: [...current.assets.filter((item) => item.asset.shotId !== request.shotId), { asset, reviewStatus: "needs_review" }] }); const inputArtifactIds = [current.acquisitionArtifactId]; const runId = `stage-run-${randomUUID()}`; const artifactId = `artifact-${randomUUID()}`; const now = new Date().toISOString();
  const nextProject = markDownstreamStagesStale({ ...project, shots: project.shots.map((item) => item.id === request.shotId ? { ...item, visualMode: "uploaded" as const } : item) }, "asset-review");
  db.exec("BEGIN IMMEDIATE;"); try { workflowRunStore.rejectReviewRun(source.stageRunId, { withinTransaction: true }); saveProjectWithWorkflowInvalidation(nextProject, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId: request.projectId, stageId: "asset-review", status: "running", runnerId: "asset-review-manual-upload", runnerVersion: "asset-review-v1", inputArtifactIds, inputFingerprint: canonicalSha256({ stageId: "asset-review", sourceArtifactId: source.id, manualUploadSha256: asset.sha256, shotId: request.shotId }), outputArtifactIds: [], startedAt: now }); workflowRunStore.finishRun({ id: runId, projectId: request.projectId, stageId: "asset-review", status: "needs_review", runnerId: "asset-review-manual-upload", runnerVersion: "asset-review-v1", inputArtifactIds, inputFingerprint: canonicalSha256({ stageId: "asset-review", sourceArtifactId: source.id, manualUploadSha256: asset.sha256, shotId: request.shotId }), outputArtifactIds: [artifactId], finishedAt: now }, { id: artifactId, projectId: request.projectId, stageId: "asset-review", stageRunId: runId, type: "asset-review", version: workflowRunStore.listArtifacts(request.projectId, "asset-review").length + 1, status: "needs_review", payloadJson: output, createdAt: now, updatedAt: now }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
  return factoryProjectResponseSchema.parse(nextProject);
});

async function completeManagedVoiceGeneration(job: TtsJobView): Promise<void> {
  if (!job.projectId || job.state === "queued" || job.state === "running") return;
  const run = workflowRunStore.listRuns(job.projectId, "voice-generation")
    .find((candidate) => candidate.status === "running" && candidate.runnerVersion === `voice-generation-tts-job-v1:${job.id}`);
  if (!run) return;
  const project = projectRepository.loadProject(job.projectId);
  if (!project) return;

  if (job.state === "cancelled") {
    const failed = transitionProjectStage(project, "voice-generation", "failed");
    db.exec("BEGIN IMMEDIATE;");
    try {
      saveProjectWithWorkflowInvalidation(failed, { withinTransaction: true });
      workflowRunStore.finishRun({ ...run, status: "failed", outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: "tts_cancelled", safeErrorMessage: "Voice Generation was cancelled." }, undefined, { withinTransaction: true });
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
    return;
  }

  const failedSegments = job.segments.filter((segment) => segment.state === "failed");
  if (failedSegments.length) {
    if (job.errorMessage?.includes("previous application session")) {
      const currentStage = project.stages.find((stage) => stage.id === "voice-generation");
      if (currentStage && (currentStage.status === "queued" || currentStage.status === "running" || currentStage.status === "needs_attention")) {
        const attention = {
          code: "TTS_INTERRUPTED",
          message: job.errorMessage,
          actions: [{ label: "Retry failed voice segments", route: "voice" }]
        };
        const attentionProject = currentStage.status === "needs_attention"
          ? updateProjectStage(project, "voice-generation", "needs_attention", attention)
          : currentStage.status === "queued"
            ? updateProjectStage(transitionProjectStage(transitionProjectStage(project, "voice-generation", "running"), "voice-generation", "needs_attention"), "voice-generation", "needs_attention", attention)
            : updateProjectStage(transitionProjectStage(project, "voice-generation", "needs_attention"), "voice-generation", "needs_attention", attention);
        db.exec("BEGIN IMMEDIATE;");
        try {
          saveProjectWithWorkflowInvalidation(attentionProject, { withinTransaction: true });
          db.exec("COMMIT;");
        } catch (error) {
          db.exec("ROLLBACK;");
          throw error;
        }
      }
    }
    return;
  }
  const completedSegments = job.segments.filter((segment) => segment.state === "success");
  if (completedSegments.length !== job.segments.length) return;

  try {
    const segments = await Promise.all(completedSegments.map(async (segment) => {
      if (!segment.relativeFilePath || !segment.actualProvider || !segment.finalDurationSeconds) throw new Error(`TTS result is incomplete for ${segment.segmentId}.`);
      const outputPath = resolveWorkspaceArtifactPath(segment.relativeFilePath);
      const metadata = await probeVoiceFile(outputPath);
      return {
        scriptSectionId: segment.segmentId,
        relativeFilePath: segment.relativeFilePath,
        durationSeconds: metadata.durationSeconds,
        codec: metadata.codec,
        byteLength: metadata.byteLength,
        sha256: metadata.sha256,
        startSeconds: segment.startSeconds,
        requestedProvider: segment.requestedProvider,
        actualProvider: segment.actualProvider,
        voiceId: segment.voiceId,
        attemptCount: segment.attemptCount,
        fallbackUsed: segment.fallbackUsed,
        ...(segment.fallbackReason ? { fallbackReason: segment.fallbackReason } : {}),
        timingOverflowSeconds: segment.timingOverflowSeconds
      };
    }));
    const timingWarnings = segments
      .filter((segment) => segment.timingOverflowSeconds > 0)
      .map((segment) => `${segment.scriptSectionId} exceeds its planned timing by ${segment.timingOverflowSeconds.toFixed(2)} seconds.`);
    if (job.errorMessage) timingWarnings.push(job.errorMessage);
    const output = voiceGenerationOutputSchema.parse({
      ttsJobId: job.id,
      requestedProvider: job.provider,
      ...(job.mergedRelativeFilePath ? { mergedRelativeFilePath: job.mergedRelativeFilePath } : {}),
      ...(timingWarnings.length ? { timingWarnings } : {}),
      segments
    });
    const artifactId = `artifact-${randomUUID()}`;
    const finishedAt = new Date().toISOString();
    const review = transitionProjectStage(project, "voice-generation", "needs_review");
    db.exec("BEGIN IMMEDIATE;");
    try {
      saveProjectWithWorkflowInvalidation(review, { withinTransaction: true });
      workflowRunStore.finishRun({ ...run, status: "needs_review", outputArtifactIds: [artifactId], finishedAt }, { id: artifactId, projectId: job.projectId, stageId: "voice-generation", stageRunId: run.id, type: "voice-segment", version: workflowRunStore.listArtifacts(job.projectId, "voice-generation").length + 1, status: "needs_review", payloadJson: output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true });
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  } catch (error) {
    const failed = transitionProjectStage(project, "voice-generation", "failed");
    const message = error instanceof Error ? error.message : "Voice Generation could not persist TTS results.";
    db.exec("BEGIN IMMEDIATE;");
    try {
      saveProjectWithWorkflowInvalidation(failed, { withinTransaction: true });
      workflowRunStore.finishRun({ ...run, status: "failed", outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: "voice_generation_failed", safeErrorMessage: message }, undefined, { withinTransaction: true });
      db.exec("COMMIT;");
    } catch (persistenceError) {
      db.exec("ROLLBACK;");
      throw persistenceError;
    }
  }
}

ipcMain.handle("run-voice-generation", async (_event, input: unknown) => {
  const { projectId } = voiceGenerationRequestSchema.parse(input);
  const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const scriptArtifact = currentApprovedArtifacts(project, "script").find((item) => item.payloadJson);
  if (!scriptArtifact?.payloadJson) throw new Error("Voice Generation requires an approved Script.");
  const assetReviewArtifact = currentApprovedArtifacts(project, "asset-review")[0];
  if (!assetReviewArtifact || project.shots.some((shot) => shot.visualMode === "ai_image" && !shot.approvedAssetId)) throw new Error("Voice Generation requires approved, assigned assets.");

  const settings = loadLocalTtsSettings();
  const provider = configuredTtsProvider(settings);
  if (!settings.available) throw new Error(`Selected TTS provider (${provider}) is not configured or available. No fallback voice provider will be used.`);
  const voiceId = provider === "omnivoice-local" ? "omnivoice-local" : project.setup.voiceId ?? settings.ttsVoiceId ?? defaultVoiceForProvider(provider, settings.language ?? "vi");
  if (!voiceId) throw new Error("Select a voice before starting Voice Generation.");
  const script = scriptOutputSchema.parse(scriptArtifact.payloadJson);
  const fingerprint = canonicalSha256({ stageId: "voice-generation", scriptArtifactId: scriptArtifact.id, assetReviewArtifactId: assetReviewArtifact.id, provider, voiceId, rate: settings.ttsRate ?? 1, fallbackEnabled: settings.ttsFallbackEnabled ?? false, fallbackOrder: settings.ttsFallbackOrder ?? [], sections: script.sections.map((section) => section.id) });
  const existing = workflowRunStore.findLatestByInput(projectId, "voice-generation", fingerprint);
  if (isPendingOrAcceptedRun(existing)) return factoryProjectResponseSchema.parse(project);

  let startSeconds = 0;
  const segments = script.sections.map((section) => {
    const durationSeconds = Math.max(0.01, section.estimatedSeconds);
    const segment = { id: section.id, text: section.narration, startSeconds, endSeconds: startSeconds + durationSeconds };
    startSeconds += durationSeconds;
    return segment;
  });
  const job = ttsJobs.create({
    projectId,
    provider,
    voiceId,
    language: normalizeTtsLanguage(settings.language),
    rate: settings.ttsRate ?? 1,
    fallbackEnabled: settings.ttsFallbackEnabled ?? false,
    fallbackOrder: settings.ttsFallbackOrder ?? [],
    segments
  });
  const runId = `stage-run-${randomUUID()}`;
  const running = transitionProjectStage(transitionProjectStage(project, "voice-generation", "queued"), "voice-generation", "running");
  db.exec("BEGIN IMMEDIATE;");
  try {
    saveProjectWithWorkflowInvalidation(running, { withinTransaction: true });
    workflowRunStore.createRun({ id: runId, projectId, stageId: "voice-generation", status: "running", runnerId: provider, runnerVersion: `voice-generation-tts-job-v1:${job.id}`, providerId: provider, inputArtifactIds: [scriptArtifact.id, assetReviewArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: new Date().toISOString() });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    ttsJobs.cancel(job.id);
    throw error;
  }
  void ttsJobs.run(job.id)
    .then((completed) => completeManagedVoiceGeneration(completed))
    .catch((error) => logger.error("voice_generation_tts_job_failed", { projectId, jobId: job.id, message: error instanceof Error ? error.message : String(error) }));
  return factoryProjectResponseSchema.parse(running);
});
ipcMain.handle("list-voice-generation-artifacts", (_event, input: unknown) => { const { projectId } = voiceGenerationRequestSchema.parse(input); return voiceGenerationArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "voice-generation").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });
ipcMain.handle("approve-voice-generation", (_event, input: unknown) => { const { projectId } = voiceGenerationRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "voice-generation").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Voice Generation output exists."); voiceGenerationOutputSchema.parse(artifact.payloadJson); const approved = transitionProjectStage(project, "voice-generation", "approved"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });
ipcMain.handle("reject-voice-generation", (_event, input: unknown) => { const { projectId } = voiceGenerationRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "voice-generation").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId) throw new Error("No reviewable Voice Generation output exists."); const rejected = transitionProjectStage(project, "voice-generation", "rejected"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(rejected, { withinTransaction: true }); workflowRunStore.rejectReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(rejected); });

ipcMain.handle("run-subtitle-preparation", (_event, input: unknown) => {
  const { projectId } = subtitlePreparationRequestSchema.parse(input);
  const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const scriptArtifact = currentApprovedArtifacts(project, "script").find((item) => item.payloadJson);
  const voiceArtifact = currentApprovedArtifacts(project, "voice-generation").find((item) => item.payloadJson);
  if (!scriptArtifact?.payloadJson || !voiceArtifact?.payloadJson) throw new Error("Subtitle Preparation requires approved Script and Voice Generation.");
  const script = scriptOutputSchema.parse(scriptArtifact.payloadJson);
  const voice = voiceGenerationOutputSchema.parse(voiceArtifact.payloadJson);
  const fps = project.timeline.fps;
  const fingerprint = canonicalSha256({ stageId: "subtitle-preparation", scriptArtifactId: scriptArtifact.id, voiceArtifactId: voiceArtifact.id, fps });
  const existing = workflowRunStore.findLatestByInput(projectId, "subtitle-preparation", fingerprint);
  if (isPendingOrAcceptedRun(existing)) return factoryProjectResponseSchema.parse(project);

  const voiceBySection = new Map(voice.segments.map((segment) => [segment.scriptSectionId, segment]));
  let sequentialStartSeconds = 0;
  const cues: Array<{ id: string; scriptSectionId: string; startFrame: number; durationFrames: number; text: string }> = [];
  for (const section of script.sections) {
    const segment = voiceBySection.get(section.id);
    if (!segment) throw new Error("Voice output is missing a script section.");
    const startSeconds = segment.startSeconds ?? sequentialStartSeconds;
    const chunks = section.narration.match(/.{1,42}(?:\s+|$)/g)?.map((text) => text.trim()).filter(Boolean) ?? [];
    if (!chunks.length) throw new Error("Script section has no subtitle text.");
    const sectionFrames = Math.max(1, Math.round(segment.durationSeconds * fps));
    const startFrame = Math.max(0, Math.round(startSeconds * fps));
    let used = 0;
    for (let index = 0; index < chunks.length; index += 1) {
      const remaining = sectionFrames - used;
      const durationFrames = index === chunks.length - 1 ? remaining : Math.max(1, Math.round(sectionFrames * (chunks[index]!.length / section.narration.length)));
      if (durationFrames <= 0 || used + durationFrames > sectionFrames) throw new Error("Subtitle timing could not be created safely.");
      cues.push({ id: `cue-${section.id}-${index + 1}`, scriptSectionId: section.id, startFrame: startFrame + used, durationFrames, text: chunks[index]! });
      used += durationFrames;
    }
    sequentialStartSeconds = Math.max(sequentialStartSeconds, startSeconds + segment.durationSeconds);
  }
  const output = subtitlePreparationOutputSchema.parse({ fps, cues });
  const runId = `stage-run-${randomUUID()}`;
  const artifactId = `artifact-${randomUUID()}`;
  const now = new Date().toISOString();
  const review = transitionProjectStage(transitionProjectStage(transitionProjectStage(project, "subtitle-preparation", "queued"), "subtitle-preparation", "running"), "subtitle-preparation", "needs_review");
  db.exec("BEGIN IMMEDIATE;");
  try {
    saveProjectWithWorkflowInvalidation(review, { withinTransaction: true });
    workflowRunStore.createRun({ id: runId, projectId, stageId: "subtitle-preparation", status: "running", runnerId: "subtitle-preparation-local", runnerVersion: "subtitle-preparation-v2", inputArtifactIds: [scriptArtifact.id, voiceArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now });
    workflowRunStore.finishRun({ id: runId, projectId, stageId: "subtitle-preparation", status: "needs_review", runnerId: "subtitle-preparation-local", runnerVersion: "subtitle-preparation-v2", inputArtifactIds: [scriptArtifact.id, voiceArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt: now }, { id: artifactId, projectId, stageId: "subtitle-preparation", stageRunId: runId, type: "subtitles", version: workflowRunStore.listArtifacts(projectId, "subtitle-preparation").length + 1, status: "needs_review", payloadJson: output, createdAt: now, updatedAt: now }, { withinTransaction: true });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  return factoryProjectResponseSchema.parse(review);
});
ipcMain.handle("list-subtitle-preparation-artifacts", (_event, input: unknown) => { const { projectId } = subtitlePreparationRequestSchema.parse(input); return subtitlePreparationArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "subtitle-preparation").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });
ipcMain.handle("approve-subtitle-preparation", (_event, input: unknown) => { const { projectId } = subtitlePreparationRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "subtitle-preparation").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Subtitle Preparation output exists."); subtitlePreparationOutputSchema.parse(artifact.payloadJson); const approved = transitionProjectStage(project, "subtitle-preparation", "approved"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });
ipcMain.handle("reject-subtitle-preparation", (_event, input: unknown) => { const { projectId } = subtitlePreparationRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "subtitle-preparation").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId) throw new Error("No reviewable Subtitle Preparation output exists."); const rejected = transitionProjectStage(project, "subtitle-preparation", "rejected"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(rejected, { withinTransaction: true }); workflowRunStore.rejectReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(rejected); });

ipcMain.handle("run-timeline-assembly", (_event, input: unknown) => {
  const { projectId } = timelineAssemblyRequestSchema.parse(input);
  const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const assetReview = currentApprovedArtifacts(project, "asset-review").find((item) => item.payloadJson);
  const voice = currentApprovedArtifacts(project, "voice-generation").find((item) => item.payloadJson);
  const subtitles = currentApprovedArtifacts(project, "subtitle-preparation").find((item) => item.payloadJson);
  if (!assetReview?.payloadJson || !voice?.payloadJson || !subtitles?.payloadJson) throw new Error("Timeline Assembly requires approved Asset Review, Voice Generation, and Subtitle Preparation.");
  const reviewed = assetReviewOutputSchema.parse(assetReview.payloadJson);
  const voiceOutput = voiceGenerationOutputSchema.parse(voice.payloadJson);
  const subtitleOutput = subtitlePreparationOutputSchema.parse(subtitles.payloadJson);
  const fps = project.timeline.fps;
  if (subtitleOutput.fps !== fps) throw new Error("Subtitle timing FPS does not match the project timeline.");

  const approvedAssets = new Map(reviewed.assets.filter((item) => item.reviewStatus === "approved" && item.assignedShotId).map((item) => [item.assignedShotId!, item.asset]));
  const visuals = [...project.shots].sort((a, b) => a.startFrame - b.startFrame).map((shot) => {
    const asset = approvedAssets.get(shot.id);
    if (!asset || !shot.approvedAssetId || shot.approvedAssetId !== `asset-${asset.sha256}` || !existsSync(join(workspaceRoot, asset.relativeFilePath))) throw new Error(`Approved asset is missing for shot ${shot.id}.`);
    return { id: `visual-${shot.id}`, track: "primary_visual" as const, sourceId: shot.approvedAssetId, startFrame: shot.startFrame, durationFrames: shot.durationFrames, fps };
  });
  const visualEnd = visuals.reduce((end, item) => Math.max(end, item.startFrame + item.durationFrames), 0);
  for (let index = 1; index < visuals.length; index += 1) if (visuals[index - 1]!.startFrame + visuals[index - 1]!.durationFrames !== visuals[index]!.startFrame) throw new Error("Primary visual track contains a gap or overlap.");

  let sequentialVoiceFrame = 0;
  let voiceEndFrame = 0;
  const narration = voiceOutput.segments.map((segment) => {
    if (!existsSync(join(workspaceRoot, segment.relativeFilePath))) throw new Error(`Voice file is missing for ${segment.scriptSectionId}.`);
    const durationFrames = Math.max(1, Math.round(segment.durationSeconds * fps));
    const startFrame = segment.startSeconds === undefined ? sequentialVoiceFrame : Math.max(0, Math.round(segment.startSeconds * fps));
    sequentialVoiceFrame = Math.max(sequentialVoiceFrame, startFrame + durationFrames);
    voiceEndFrame = Math.max(voiceEndFrame, startFrame + durationFrames);
    return { id: `voice-${segment.scriptSectionId}`, track: "narration" as const, sourceId: segment.relativeFilePath, startFrame, durationFrames, fps };
  });
  if (voiceEndFrame > visualEnd) throw new Error("Approved voice duration exceeds the visual timeline.");
  const subtitleItems = subtitleOutput.cues.map((cue) => {
    if (cue.startFrame + cue.durationFrames > voiceEndFrame) throw new Error("Subtitle cue extends beyond approved voice timing.");
    return { id: `subtitle-${cue.id}`, track: "subtitles" as const, sourceId: cue.id, startFrame: cue.startFrame, durationFrames: cue.durationFrames, fps };
  });
  const output = timelineAssemblyOutputSchema.parse({ fps, items: [...visuals, ...narration, ...subtitleItems] });
  const fingerprint = canonicalSha256({ stageId: "timeline-assembly", assetReviewArtifactId: assetReview.id, voiceArtifactId: voice.id, subtitleArtifactId: subtitles.id, fps });
  const existing = workflowRunStore.findLatestByInput(projectId, "timeline-assembly", fingerprint);
  if (isPendingOrAcceptedRun(existing)) return factoryProjectResponseSchema.parse(project);
  const runId = `stage-run-${randomUUID()}`;
  const artifactId = `artifact-${randomUUID()}`;
  const now = new Date().toISOString();
  const review = transitionProjectStage(transitionProjectStage(transitionProjectStage(project, "timeline-assembly", "queued"), "timeline-assembly", "running"), "timeline-assembly", "needs_review");
  db.exec("BEGIN IMMEDIATE;");
  try {
    saveProjectWithWorkflowInvalidation(review, { withinTransaction: true });
    workflowRunStore.createRun({ id: runId, projectId, stageId: "timeline-assembly", status: "running", runnerId: "timeline-assembly-local", runnerVersion: "timeline-assembly-v2", inputArtifactIds: [assetReview.id, voice.id, subtitles.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now });
    workflowRunStore.finishRun({ id: runId, projectId, stageId: "timeline-assembly", status: "needs_review", runnerId: "timeline-assembly-local", runnerVersion: "timeline-assembly-v2", inputArtifactIds: [assetReview.id, voice.id, subtitles.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt: now }, { id: artifactId, projectId, stageId: "timeline-assembly", stageRunId: runId, type: "timeline", version: workflowRunStore.listArtifacts(projectId, "timeline-assembly").length + 1, status: "needs_review", payloadJson: output, createdAt: now, updatedAt: now }, { withinTransaction: true });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  return factoryProjectResponseSchema.parse(review);
});
ipcMain.handle("list-timeline-assembly-artifacts", (_event, input: unknown) => { const { projectId } = timelineAssemblyRequestSchema.parse(input); return timelineAssemblyArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "timeline-assembly").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });
ipcMain.handle("approve-timeline-assembly", (_event, input: unknown) => { const { projectId } = timelineAssemblyRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "timeline-assembly").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Timeline Assembly exists."); const timeline = timelineAssemblyOutputSchema.parse(artifact.payloadJson); const approved = transitionProjectStage({ ...project, timeline }, "timeline-assembly", "approved"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });
ipcMain.handle("reject-timeline-assembly", (_event, input: unknown) => { const { projectId } = timelineAssemblyRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "timeline-assembly").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId) throw new Error("No reviewable Timeline Assembly exists."); const rejected = transitionProjectStage(project, "timeline-assembly", "rejected"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(rejected, { withinTransaction: true }); workflowRunStore.rejectReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(rejected); });

function resolveWorkspaceArtifactPath(relativeFilePath: string): string {
  const resolvedPath = resolve(workspaceRoot, relativeFilePath);
  const pathFromWorkspace = relative(workspaceRoot, resolvedPath);
  if (!pathFromWorkspace || pathFromWorkspace.startsWith("..") || resolve(workspaceRoot) === resolvedPath) {
    throw new Error("Approved media path is outside the workspace.");
  }
  return resolvedPath;
}

function frameRangeToMicroseconds(startFrame: number, durationFrames: number, fps: number): { startUs: number; durationUs: number } {
  const startUs = Math.round(startFrame * 1_000_000 / fps);
  const endUs = Math.round((startFrame + durationFrames) * 1_000_000 / fps);
  return { startUs, durationUs: Math.max(1, endUs - startUs) };
}

function subtitleTimestamp(frame: number, fps: number): string {
  const milliseconds = Math.max(0, Math.round(frame * 1000 / fps));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const remainder = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(remainder).padStart(3, "0")}`;
}

function writeSubtitleFile(outputPath: string, output: { fps: number; cues: Array<{ startFrame: number; durationFrames: number; text: string }> }): void {
  const content = output.cues.map((cue, index) => [
    String(index + 1),
    `${subtitleTimestamp(cue.startFrame, output.fps)} --> ${subtitleTimestamp(cue.startFrame + cue.durationFrames, output.fps)}`,
    cue.text.trim(),
    ""
  ].join("\r\n")).join("\r\n");
  writeFileSync(outputPath, content, "utf8");
}

function invalidatePreviewAndDownstream(project: FactoryProject): FactoryProject {
  const downstream = markDownstreamStagesStale(project, "preview-render");
  return {
    ...downstream,
    stages: normalizeProjectStages(downstream.stages).map((stage) => (
      stage.id === "preview-render" && (stage.status === "queued" || stage.status === "running" || stage.status === "needs_review" || stage.status === "needs_attention" || stage.status === "approved" || stage.status === "ready")
        ? { ...stage, status: "stale" }
        : stage
    ))
  };
}

ipcMain.handle("run-preview-render", async (_event, input: unknown) => {
  const { projectId, force = false } = previewRenderRequestSchema.parse(input);
  const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const timelineArtifact = currentApprovedArtifacts(project, "timeline-assembly").find((item) => item.payloadJson);
  const assetReviewArtifact = currentApprovedArtifacts(project, "asset-review").find((item) => item.payloadJson);
  const voiceArtifact = currentApprovedArtifacts(project, "voice-generation").find((item) => item.payloadJson);
  const subtitleArtifact = currentApprovedArtifacts(project, "subtitle-preparation").find((item) => item.payloadJson);
  if (!timelineArtifact?.payloadJson || !assetReviewArtifact?.payloadJson || !voiceArtifact?.payloadJson || !subtitleArtifact?.payloadJson) {
    throw new Error("Preview Render requires approved Timeline Assembly, Asset Review, Voice Generation, and Subtitle Preparation.");
  }

  const timeline = timelineAssemblyOutputSchema.parse(timelineArtifact.payloadJson);
  const reviewedAssets = assetReviewOutputSchema.parse(assetReviewArtifact.payloadJson);
  const voiceOutput = voiceGenerationOutputSchema.parse(voiceArtifact.payloadJson);
  const subtitleOutput = subtitlePreparationOutputSchema.parse(subtitleArtifact.payloadJson);
  const assetsByShot = new Map(reviewedAssets.assets
    .filter((item) => item.reviewStatus === "approved" && item.assignedShotId)
    .map((item) => [item.assignedShotId!, item.asset]));
  const visualInputs = timeline.items
    .filter((item) => item.track === "primary_visual")
    .sort((a, b) => a.startFrame - b.startFrame)
    .map((item) => {
      const shot = project.shots.find((candidate) => `visual-${candidate.id}` === item.id && candidate.approvedAssetId === item.sourceId);
      const asset = shot ? assetsByShot.get(shot.id) : undefined;
      if (!asset) throw new Error("The approved timeline has a visual without its approved Asset Review source.");
      return { filePath: resolveWorkspaceArtifactPath(asset.relativeFilePath), startFrame: item.startFrame, durationFrames: item.durationFrames };
    });
  const voicesByPath = new Map(voiceOutput.segments.map((segment) => [segment.relativeFilePath, segment]));
  const audioInputs = timeline.items
    .filter((item) => item.track === "narration")
    .sort((a, b) => a.startFrame - b.startFrame)
    .map((item) => {
      if (!voicesByPath.has(item.sourceId)) throw new Error("The approved timeline has narration outside the approved Voice Generation artifact.");
      return { filePath: resolveWorkspaceArtifactPath(item.sourceId), startFrame: item.startFrame };
    });
  if (!visualInputs.length || !audioInputs.length) throw new Error("Preview Render requires approved visual and narration media.");

  const inputArtifactIds = [timelineArtifact.id, assetReviewArtifact.id, voiceArtifact.id, subtitleArtifact.id];
  const inputFingerprint = canonicalSha256({ stageId: "preview-render", inputArtifactIds, timeline, subtitles: subtitleOutput });
  const runId = `stage-run-${randomUUID()}`;
  const now = new Date().toISOString();
  let running: FactoryProject;
  db.exec("BEGIN IMMEDIATE;");
  try {
    // Recheck while holding the write lock so concurrent IPC requests cannot start duplicate renders.
    const existingRun = workflowRunStore.findLatestByInput(projectId, "preview-render", inputFingerprint);
    if (existingRun && (existingRun.status === "queued" || existingRun.status === "running" || (!force && (existingRun.status === "needs_review" || existingRun.status === "approved")))) {
      db.exec("COMMIT;");
      const currentProject = projectRepository.loadProject(projectId);
      if (!currentProject) throw new Error(`Project not found: ${projectId}`);
      return factoryProjectResponseSchema.parse(currentProject);
    }
    const renderBase = force ? invalidatePreviewAndDownstream(project) : project;
    if (force) saveProjectWithWorkflowInvalidation(renderBase, { withinTransaction: true });
    running = transitionProjectStage(transitionProjectStage(renderBase, "preview-render", "queued"), "preview-render", "running");
    saveProjectWithWorkflowInvalidation(running, { withinTransaction: true });
    workflowRunStore.createRun({ id: runId, projectId, stageId: "preview-render", status: "running", runnerId: "ffmpeg-preview", runnerVersion: "preview-render-v1", inputArtifactIds, inputFingerprint, outputArtifactIds: [], startedAt: now });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }

  const relativeFilePath = join("previews", projectId, `${runId}.mp4`);
  const subtitleRelativeFilePath = join("previews", projectId, `${runId}.srt`);
  const outputPath = resolveWorkspaceArtifactPath(relativeFilePath);
  const subtitlePath = resolveWorkspaceArtifactPath(subtitleRelativeFilePath);
  mkdirSync(dirname(outputPath), { recursive: true });
  try {
    writeSubtitleFile(subtitlePath, subtitleOutput);
    const result = await renderPreview({ timeline, outputPath, resolution: project.format === "short" ? "1080p-vertical" : "1080p-horizontal", visualInputs, audioInputs, subtitleFilePath: subtitlePath, ...(process.env.FFMPEG_PATH ? { ffmpegPath: process.env.FFMPEG_PATH } : {}), ...(process.env.FFPROBE_PATH ? { ffprobePath: process.env.FFPROBE_PATH } : {}) });
    const artifactId = `artifact-${randomUUID()}`;
    const finishedAt = new Date().toISOString();
    const output = previewRenderOutputSchema.parse({ relativeFilePath, subtitleRelativeFilePath, durationSeconds: result.durationSeconds, width: result.width, height: result.height, sha256: result.sha256, inputArtifactIds });
    const review = transitionProjectStage(running, "preview-render", "needs_review");
    db.exec("BEGIN IMMEDIATE;");
    try {
      saveProjectWithWorkflowInvalidation(review, { withinTransaction: true });
      workflowRunStore.finishRun({ id: runId, projectId, stageId: "preview-render", status: "needs_review", runnerId: "ffmpeg-preview", runnerVersion: "preview-render-v1", inputArtifactIds, inputFingerprint, outputArtifactIds: [artifactId], finishedAt }, { id: artifactId, projectId, stageId: "preview-render", stageRunId: runId, type: "preview-video", version: workflowRunStore.listArtifacts(projectId, "preview-render").length + 1, status: "needs_review", payloadJson: output, relativeFilePath, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true });
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
    return factoryProjectResponseSchema.parse(review);
  } catch (error) {
    const safeCategory = error instanceof PreviewRenderError ? error.category : "unexpected_failure";
    const safeMessage = error instanceof PreviewRenderError ? error.message : "Preview Render failed.";
    const failed = transitionProjectStage(running, "preview-render", "failed");
    db.exec("BEGIN IMMEDIATE;");
    try {
      saveProjectWithWorkflowInvalidation(failed, { withinTransaction: true });
      workflowRunStore.finishRun({ id: runId, projectId, stageId: "preview-render", status: "failed", runnerId: "ffmpeg-preview", runnerVersion: "preview-render-v1", inputArtifactIds, inputFingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: safeCategory, safeErrorMessage: safeMessage }, undefined, { withinTransaction: true });
      db.exec("COMMIT;");
    } catch (persistenceError) {
      db.exec("ROLLBACK;");
      throw persistenceError;
    }
    throw new Error(safeMessage);
  }
});

ipcMain.handle("list-preview-render-artifacts", (_event, input: unknown) => {
  const { projectId } = previewRenderRequestSchema.parse(input);
  return previewRenderArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "preview-render").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, relativeFilePath: artifact.relativeFilePath, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt })));
});

ipcMain.handle("get-preview-video-url", (_event, input: unknown) => {
  const { projectId, artifactId } = previewMediaRequestSchema.parse(input);
  const artifact = workflowRunStore.getArtifact(projectId, artifactId);
  if (!artifact?.payloadJson || (artifact.status !== "needs_review" && artifact.status !== "approved")) throw new Error("Preview artifact is not reviewable.");
  const output = previewRenderOutputSchema.parse(artifact.payloadJson);
  if (artifact.relativeFilePath !== output.relativeFilePath) throw new Error("Preview artifact path is invalid.");
  const outputPath = resolveWorkspaceArtifactPath(output.relativeFilePath);
  if (!existsSync(outputPath)) throw new Error("Preview output is missing.");
  const token = randomUUID();
  previewMediaFiles.set(token, { projectId, artifactId, outputPath });
  return previewMediaUrlResponseSchema.parse({ url: `lsf-media://preview/${token}` });
});

ipcMain.handle("get-asset-preview-url", (_event, input: unknown) => {
  const request = assetPreviewMediaRequestSchema.parse(input);
  const artifact = workflowRunStore.getArtifact(request.projectId, request.artifactId);
  if (!artifact?.payloadJson || (artifact.status !== "needs_review" && artifact.status !== "approved")) throw new Error("Scene asset is not reviewable.");
  const output = assetReviewOutputSchema.parse(artifact.payloadJson);
  const item = output.assets.find((candidate) => candidate.asset.sha256 === request.assetSha256);
  if (!item) throw new Error("Scene asset is not present in the review artifact.");
  const outputPath = resolveWorkspaceArtifactPath(item.asset.relativeFilePath);
  if (!existsSync(outputPath)) throw new Error("Scene asset is missing from the workspace.");
  const actualSha256 = createHash("sha256").update(readFileSync(outputPath)).digest("hex");
  if (actualSha256 !== item.asset.sha256) throw new Error("Scene asset changed after validation and must be regenerated.");
  const token = randomUUID();
  assetPreviewMediaFiles.set(token, { projectId: request.projectId, artifactId: request.artifactId, assetSha256: request.assetSha256, outputPath, mimeType: item.asset.mimeType });
  return previewMediaUrlResponseSchema.parse({ url: `lsf-media://preview/${token}` });
});

ipcMain.handle("approve-preview-render", async (_event, input: unknown) => {
  const { projectId } = previewRenderRequestSchema.parse(input);
  const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const artifact = workflowRunStore.listArtifacts(projectId, "preview-render").find((item) => item.status === "needs_review");
  if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Preview Render exists.");
  const output = previewRenderOutputSchema.parse(artifact.payloadJson);
  const previewPath = resolveWorkspaceArtifactPath(output.relativeFilePath);
  if (artifact.relativeFilePath !== output.relativeFilePath || !existsSync(previewPath)) throw new Error("Preview output is missing or invalid.");
  if (!output.sha256 || await getPreviewFileSha256(previewPath) !== output.sha256) throw new Error("Preview output changed after validation and must be rendered again.");
  // Preview approval is the final human checkpoint. QA already validated this
  // exact render, so approving it must not invalidate the approved QA report.
  const currentStage = project.stages.find((stage) => stage.id === "preview-render");
  if (!currentStage) throw new Error("Preview Render stage is missing.");
  assertWorkflowStageTransition(currentStage.status, "approved");
  const approved = updateProjectStage(project, "preview-render", "approved");
  db.exec("BEGIN IMMEDIATE;");
  try {
    saveProjectWithWorkflowInvalidation(approved, { withinTransaction: true });
    workflowRunStore.approveReviewRun(artifact.stageRunId, { withinTransaction: true });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  return factoryProjectResponseSchema.parse(approved);
});

ipcMain.handle("reject-preview-render", (_event, input: unknown) => {
  const { projectId } = previewRenderRequestSchema.parse(input);
  const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const artifact = workflowRunStore.listArtifacts(projectId, "preview-render").find((item) => item.status === "needs_review");
  if (!artifact?.stageRunId) throw new Error("No reviewable Preview Render exists.");
  const rejected = transitionProjectStage(project, "preview-render", "rejected");
  db.exec("BEGIN IMMEDIATE;");
  try {
    saveProjectWithWorkflowInvalidation(rejected, { withinTransaction: true });
    workflowRunStore.rejectReviewRun(artifact.stageRunId, { withinTransaction: true });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  return factoryProjectResponseSchema.parse(rejected);
});

ipcMain.handle("run-qa", async (_event, input: unknown) => {
  const { projectId } = qaRequestSchema.parse(input);
  const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const preview = currentApprovedArtifacts(project, "preview-render").find((item) => item.payloadJson)
    ?? currentReviewableArtifacts(project, "preview-render").find((item) => item.payloadJson);
  const timeline = currentApprovedArtifacts(project, "timeline-assembly").find((item) => item.payloadJson);
  if (!preview?.payloadJson || !timeline?.payloadJson) throw new Error("QA requires a current Preview Render and approved Timeline Assembly.");
  const assets = currentApprovedArtifacts(project, "asset-review").find((item) => item.payloadJson);
  const voice = currentApprovedArtifacts(project, "voice-generation").find((item) => item.payloadJson);
  const subtitles = currentApprovedArtifacts(project, "subtitle-preparation").find((item) => item.payloadJson);
  const script = currentApprovedArtifacts(project, "script").find((item) => item.payloadJson);
  if (!assets?.payloadJson || !voice?.payloadJson || !subtitles?.payloadJson || !script?.payloadJson) {
    throw new Error("QA requires approved Script, Asset Review, Voice Generation, and Subtitle Preparation.");
  }
  const inputArtifactIds = [preview.id, timeline.id, assets.id, voice.id, subtitles.id, script.id];
  const fingerprint = canonicalSha256({ stageId: "qa", inputArtifactIds, timeline: timeline.payloadJson, projectStages: project.stages });
  const existing = workflowRunStore.findLatestByInput(projectId, "qa", fingerprint);
  if (isPendingOrAcceptedRun(existing)) return factoryProjectResponseSchema.parse(project);
  const findings: Array<{ code: "stale_upstream" | "missing_approval" | "unsupported_claim" | "missing_shot_asset" | "rejected_asset" | "duration_mismatch" | "missing_audio" | "subtitle_overflow" | "continuity" | "certification" | "broken_path" | "capcut_prerequisite"; severity: "blocking" | "warning"; message: string; evidence: string }> = [];
  const add = (code: typeof findings[number]["code"], severity: typeof findings[number]["severity"], message: string, evidence: string) => findings.push({ code, severity, message, evidence });
  const previewOutput = previewRenderOutputSchema.parse(preview.payloadJson);
  if (!existsSync(resolveWorkspaceArtifactPath(previewOutput.relativeFilePath))) add("broken_path", "blocking", "Approved preview file is missing.", previewOutput.relativeFilePath);
  const timelineOutput = timelineAssemblyOutputSchema.parse(timeline.payloadJson);
  const visuals = timelineOutput.items.filter((item) => item.track === "primary_visual").sort((a, b) => a.startFrame - b.startFrame);
  for (let index = 0; index < visuals.length; index += 1) if (index === 0 ? visuals[index]!.startFrame !== 0 : visuals[index - 1]!.startFrame + visuals[index - 1]!.durationFrames !== visuals[index]!.startFrame) add("continuity", "blocking", "Primary visual timeline is not contiguous.", visuals[index]!.id);
  const narrationEnd = timelineOutput.items.filter((item) => item.track === "narration").reduce((end, item) => Math.max(end, item.startFrame + item.durationFrames), 0);
  if (!narrationEnd) add("missing_audio", "blocking", "Timeline contains no narration.", "timeline-assembly");
  if (Math.abs(previewOutput.durationSeconds - narrationEnd / timelineOutput.fps) > 0.5) add("duration_mismatch", "blocking", "Preview duration differs from narration timing.", `preview=${previewOutput.durationSeconds}; narrationFrames=${narrationEnd}`);
  if (timelineOutput.items.filter((item) => item.track === "subtitles").some((item) => item.startFrame + item.durationFrames > narrationEnd)) add("subtitle_overflow", "blocking", "A subtitle cue extends beyond narration.", "timeline-assembly");
  for (const shot of project.shots) if (shot.visualMode === "ai_image" && !shot.approvedAssetId) add("missing_shot_asset", "blocking", "An AI-image shot has no approved asset.", shot.id);
  for (const item of timelineOutput.items.filter((item) => item.track === "narration")) if (!existsSync(resolveWorkspaceArtifactPath(item.sourceId))) add("missing_audio", "blocking", "A narration file is missing.", item.sourceId);
  if (project.claims.some((claim) => claim.state === "unsupported" || claim.approvalState === "blocked")) add("unsupported_claim", "blocking", "Project contains unsupported or blocked claims.", "claim-map");
  const imageCertification = await loadNineRouterImageCertification({ credentialStore, certificationStore: imageCertificationStore });
  if (imageCertification.status !== "verified") add("certification", "warning", "The current image capability certification is not verified.", "image-certification");
  const runtime = await probeRuntimeEnvironment();
  if (!runtime.pythonExists || !runtime.capcutInstalled || runtime.pycapcutStatus !== "Installed" || !runtime.draftDirConfigured) add("capcut_prerequisite", "warning", "CapCut Draft prerequisites are not fully configured.", "runtime-environment");
  const output = qaOutputSchema.parse({ runner: "local_deterministic", findings, inputArtifactIds });
  const runId = `stage-run-${randomUUID()}`; const artifactId = `artifact-${randomUUID()}`; const now = new Date().toISOString();
  const review = transitionProjectStage(transitionProjectStage(transitionProjectStage(project, "qa", "queued"), "qa", "running"), "qa", "needs_review");
  db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(review, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "qa", status: "running", runnerId: "qa-local", runnerVersion: "qa-v1", inputArtifactIds, inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "qa", status: "needs_review", runnerId: "qa-local", runnerVersion: "qa-v1", inputArtifactIds, inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt: now }, { id: artifactId, projectId, stageId: "qa", stageRunId: runId, type: "qa-report", version: workflowRunStore.listArtifacts(projectId, "qa").length + 1, status: "needs_review", payloadJson: output, createdAt: now, updatedAt: now }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
  return factoryProjectResponseSchema.parse(review);
});
ipcMain.handle("list-qa-artifacts", (_event, input: unknown) => { const { projectId } = qaRequestSchema.parse(input); return qaArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "qa").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });
ipcMain.handle("approve-qa", (_event, input: unknown) => { const { projectId } = qaRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "qa").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable QA report exists."); if (qaFindingsBlockApproval(qaOutputSchema.parse(artifact.payloadJson).findings)) throw new Error("Resolve blocking QA findings before approval."); const approved = transitionProjectStage(project, "qa", "approved"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });
ipcMain.handle("reject-qa", (_event, input: unknown) => { const { projectId } = qaRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "qa").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId) throw new Error("No reviewable QA report exists."); const rejected = transitionProjectStage(project, "qa", "rejected"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(rejected, { withinTransaction: true }); workflowRunStore.rejectReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(rejected); });

ipcMain.handle("run-capcut-draft", async (_event, input: unknown) => {
  const { projectId } = capcutDraftRequestSchema.parse(input);
  const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const qa = currentApprovedArtifacts(project, "qa").find((item) => item.payloadJson);
  const timelineArtifact = currentApprovedArtifacts(project, "timeline-assembly").find((item) => item.payloadJson);
  const assets = currentApprovedArtifacts(project, "asset-review").find((item) => item.payloadJson);
  const voice = currentApprovedArtifacts(project, "voice-generation").find((item) => item.payloadJson);
  const subtitles = currentApprovedArtifacts(project, "subtitle-preparation").find((item) => item.payloadJson);
  if (!qa?.payloadJson || !timelineArtifact?.payloadJson || !assets?.payloadJson || !voice?.payloadJson || !subtitles?.payloadJson) throw new Error("CapCut Draft requires approved QA, Timeline Assembly, Asset Review, Voice Generation, and Subtitle Preparation.");
  const runtime = await probeRuntimeEnvironment();
  if (!runtime.pythonExists || !runtime.capcutInstalled || runtime.pycapcutStatus !== "Installed" || !runtime.draftDirConfigured) throw new Error("CapCut Draft prerequisites are not configured.");
  const timeline = timelineAssemblyOutputSchema.parse(timelineArtifact.payloadJson);
  const reviewed = assetReviewOutputSchema.parse(assets.payloadJson);
  const voiceOutput = voiceGenerationOutputSchema.parse(voice.payloadJson);
  const subtitleOutput = subtitlePreparationOutputSchema.parse(subtitles.payloadJson);
  const assetsById = new Map(reviewed.assets.filter((item) => item.reviewStatus === "approved" && item.assignedShotId).map((item) => [item.asset.sha256, item.asset]));
  const visuals = timeline.items.filter((item) => item.track === "primary_visual").map((item) => {
    const asset = [...assetsById.values()].find((candidate) => project.shots.some((shot) => shot.approvedAssetId === item.sourceId && shot.id === candidate.shotId));
    if (!asset) throw new Error("Timeline visual is not backed by an approved assigned asset.");
     return { filePath: resolveWorkspaceArtifactPath(asset.relativeFilePath), ...frameRangeToMicroseconds(item.startFrame, item.durationFrames, item.fps) };
   });
  const voiceByPath = new Map(voiceOutput.segments.map((segment) => [segment.relativeFilePath, segment]));
  const audio = timeline.items.filter((item) => item.track === "narration").map((item) => {
    const segment = voiceByPath.get(item.sourceId);
    if (!segment) throw new Error("Timeline narration is not backed by approved Voice Generation output.");
    const timelineRange = frameRangeToMicroseconds(item.startFrame, item.durationFrames, item.fps);
    const sourceDurationUs = Math.floor(segment.durationSeconds * 1_000_000);
    return { filePath: resolveWorkspaceArtifactPath(item.sourceId), startUs: timelineRange.startUs, durationUs: Math.max(1, Math.min(timelineRange.durationUs, sourceDurationUs)) };
  });
  const inputArtifactIds = [qa.id, timelineArtifact.id, assets.id, voice.id, subtitles.id];
  const fingerprint = canonicalSha256({ stageId: "capcut-draft", inputArtifactIds, timeline });
  const existing = workflowRunStore.findLatestByInput(projectId, "capcut-draft", fingerprint);
  if (isPendingOrAcceptedRun(existing)) return factoryProjectResponseSchema.parse(project);
  const runId = `stage-run-${randomUUID()}`;
  const draftName = `${projectId}-${runId}`;
  const running = transitionProjectStage(transitionProjectStage(project, "capcut-draft", "queued"), "capcut-draft", "running");
  db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(running, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "capcut-draft", status: "running", runnerId: "pycapcut-bridge", runnerVersion: "capcut-bridge-v2", inputArtifactIds, inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: new Date().toISOString() }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
  try {
     const bridge = await runCapCutDraftBridge({ pythonPath: runtime.sidecarPythonPath, bridgePath: join(repoRoot, "python", "capcut_bridge", "bridge.py"), payload: { draftDirectory: join(runtime.capcutDraftDir, draftName), canvas: { width: project.format === "short" ? 1080 : 1920, height: project.format === "short" ? 1920 : 1080, fps: timeline.fps }, timeline: { visuals, audio, subtitles: subtitleOutput.cues.map((cue) => ({ text: cue.text, ...frameRangeToMicroseconds(cue.startFrame, cue.durationFrames, subtitleOutput.fps) })) } } });
    const output = capcutDraftOutputSchema.parse({ draftName, structurallyValidated: true, trackCounts: bridge.trackCounts, inputArtifactIds }); const artifactId = `artifact-${randomUUID()}`; const review = transitionProjectStage(running, "capcut-draft", "needs_review"); const now = new Date().toISOString();
    db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(review, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "capcut-draft", status: "needs_review", runnerId: "pycapcut-bridge", runnerVersion: "capcut-bridge-v2", inputArtifactIds, inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt: now }, { id: artifactId, projectId, stageId: "capcut-draft", stageRunId: runId, type: "capcut-draft", version: workflowRunStore.listArtifacts(projectId, "capcut-draft").length + 1, status: "needs_review", payloadJson: output, createdAt: now, updatedAt: now }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
    return factoryProjectResponseSchema.parse(review);
  } catch (error) {
    const failed = transitionProjectStage(running, "capcut-draft", "failed"); const message = error instanceof CapCutDraftError ? error.message : "CapCut Draft failed.";
    db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(failed, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "capcut-draft", status: "failed", runnerId: "pycapcut-bridge", runnerVersion: "capcut-bridge-v2", inputArtifactIds, inputFingerprint: fingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof CapCutDraftError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); } catch (persistenceError) { db.exec("ROLLBACK;"); throw persistenceError; }
    throw new Error(message);
  }
});
ipcMain.handle("list-capcut-draft-artifacts", (_event, input: unknown) => { const { projectId } = capcutDraftRequestSchema.parse(input); return capcutDraftArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "capcut-draft").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });
ipcMain.handle("approve-capcut-draft", (_event, input: unknown) => { const { projectId } = capcutDraftApprovalRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "capcut-draft").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable CapCut Draft exists."); capcutDraftOutputSchema.parse(artifact.payloadJson); const approved = transitionProjectStage(project, "capcut-draft", "approved"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });
ipcMain.handle("reject-capcut-draft", (_event, input: unknown) => { const { projectId } = capcutDraftRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "capcut-draft").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId) throw new Error("No reviewable CapCut Draft exists."); const rejected = transitionProjectStage(project, "capcut-draft", "rejected"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(rejected, { withinTransaction: true }); workflowRunStore.rejectReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(rejected); });

ipcMain.handle("run-packaging-export", (_event, input: unknown) => {
  const { projectId } = packagingExportRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`);
  const artifacts = packagingExportRequiredStageIds.map((stageId) => currentApprovedArtifacts(project, stageId).find((item) => item.payloadJson));
  if (artifacts.some((artifact) => !artifact)) throw new Error("Packaging Export requires approved QA, preview, timeline, script, and asset artifacts.");
  const approved = artifacts as NonNullable<(typeof artifacts)[number]>[]; const artifactIds = approved.map((artifact) => artifact.id);
  const previewArtifact = approved.find((artifact) => artifact.stageId === "preview-render");
  if (!previewArtifact?.payloadJson) throw new Error("Packaging Export requires an approved preview MP4.");
  const previewOutput = previewRenderOutputSchema.parse(previewArtifact.payloadJson);
  const previewPath = resolveWorkspaceArtifactPath(previewOutput.relativeFilePath);
  if (!existsSync(previewPath)) throw new Error("Approved preview MP4 is missing.");
  const fingerprint = canonicalSha256({ stageId: "packaging-export", artifactIds }); const existing = workflowRunStore.findLatestByInput(projectId, "packaging-export", fingerprint); if (isPendingOrAcceptedRun(existing)) return factoryProjectResponseSchema.parse(project);
  const runId = `stage-run-${randomUUID()}`; const artifactId = `artifact-${randomUUID()}`; const now = new Date().toISOString(); const relativeFilePath = join("exports", projectId, `${runId}.json`); const mp4RelativeFilePath = join("exports", projectId, `${runId}.mp4`); const outputPath = resolveWorkspaceArtifactPath(relativeFilePath); const mp4OutputPath = resolveWorkspaceArtifactPath(mp4RelativeFilePath); mkdirSync(dirname(outputPath), { recursive: true }); copyFileSync(previewPath, mp4OutputPath); const manifest = { schemaVersion: 1, project: { id: project.id, topic: project.topic, format: project.format, targetLanguage: project.targetLanguage }, artifactIds, media: { mp4RelativeFilePath } }; const text = JSON.stringify(manifest, null, 2); if (/(?:api[_-]?key|authorization|credential|https?:\/\/|[A-Za-z]:[\\/]|\.\.)/i.test(text)) throw new Error("Packaging manifest failed secret or path safety validation."); writeFileSync(outputPath, text, "utf8"); const sha256 = createHash("sha256").update(text).digest("hex"); const output = packagingExportOutputSchema.parse({ relativeFilePath, artifactIds, sha256, mp4RelativeFilePath }); const review = transitionProjectStage(transitionProjectStage(transitionProjectStage(project, "packaging-export", "queued"), "packaging-export", "running"), "packaging-export", "needs_review");
  db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(review, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "packaging-export", status: "running", runnerId: "packaging-export-local", runnerVersion: "packaging-export-v1", inputArtifactIds: artifactIds, inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "packaging-export", status: "needs_review", runnerId: "packaging-export-local", runnerVersion: "packaging-export-v1", inputArtifactIds: artifactIds, inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt: now }, { id: artifactId, projectId, stageId: "packaging-export", stageRunId: runId, type: "package-export", version: workflowRunStore.listArtifacts(projectId, "packaging-export").length + 1, status: "needs_review", payloadJson: output, relativeFilePath, createdAt: now, updatedAt: now }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review);
});
ipcMain.handle("list-packaging-export-artifacts", (_event, input: unknown) => { const { projectId } = packagingExportRequestSchema.parse(input); return packagingExportArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "packaging-export").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, relativeFilePath: artifact.relativeFilePath, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });
ipcMain.handle("approve-packaging-export", (_event, input: unknown) => { const { projectId } = packagingExportRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "packaging-export").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Packaging Export exists."); const output = packagingExportOutputSchema.parse(artifact.payloadJson); verifyPackagingManifest({ workspaceRoot, ...(artifact.relativeFilePath ? { artifactRelativeFilePath: artifact.relativeFilePath } : {}), reviewedRelativeFilePath: output.relativeFilePath, reviewedSha256: output.sha256, reviewedArtifactIds: output.artifactIds, reviewedProjectId: projectId, ...(output.mp4RelativeFilePath ? { reviewedMp4RelativeFilePath: output.mp4RelativeFilePath } : {}) }); const approved = transitionProjectStage(project, "packaging-export", "approved"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });
ipcMain.handle("reject-packaging-export", (_event, input: unknown) => { const { projectId } = packagingExportRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "packaging-export").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId) throw new Error("No reviewable Packaging Export exists."); const rejected = transitionProjectStage(project, "packaging-export", "rejected"); db.exec("BEGIN IMMEDIATE;"); try { saveProjectWithWorkflowInvalidation(rejected, { withinTransaction: true }); workflowRunStore.rejectReviewRun(artifact.stageRunId, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(rejected); });

ipcMain.handle("list-projects", () => projectListResponseSchema.parse(projectRepository.listProjects()));

ipcMain.handle("load-project", (_event, input: unknown) => {
  const { projectId } = projectIdRequestSchema.parse(input);
  return nullableFactoryProjectResponseSchema.parse(projectRepository.loadProject(projectId) ?? null);
});

ipcMain.handle("delete-project", (_event, input: unknown) => {
  const { projectId } = projectIdRequestSchema.parse(input);
  projectRepository.deleteProject(projectId);
  logger.info("project_deleted", { projectId });
  return okResponseSchema.parse({ ok: true });
});

ipcMain.handle("save-provider-credential", async (_event, input: unknown) => {
  const parsed = saveProviderCredentialRequestSchema.parse(input);
  const settings = {
    providerId: parsed.providerId,
    baseUrl: parsed.baseUrl,
    ...(parsed.textModel ? { textModel: parsed.textModel } : {}),
    ...(parsed.imageModel ? { imageModel: parsed.imageModel } : {}),
    ...(parsed.videoModel ? { videoModel: parsed.videoModel } : {}),
    ...(parsed.ttsModel ? { ttsModel: parsed.ttsModel } : {}),
    ...(parsed.sttModel ? { sttModel: parsed.sttModel } : {})
  };
  const { apiKey } = parsed;
  const credentialRef = await credentialStore.saveProviderCredential(settings, apiKey);
  if (settings.providerId === "9router") {
    textCertificationStore.markTextCertificationsStale("9router");
    imageCertificationStore.markStale();
  }
  logger.info("provider_credential_saved", { providerId: settings.providerId });
  return providerCredentialSavedResponseSchema.parse({ providerId: settings.providerId, credentialRef });
});

ipcMain.handle("has-provider-credential", async (_event, input: unknown) => {
  const { providerId } = providerIdRequestSchema.parse(input);
  return providerCredentialPresenceResponseSchema.parse({
    providerId,
    hasCredential: await credentialStore.hasProviderCredential(providerId)
  });
});

ipcMain.handle("test-credential-presence", async (_event, input: unknown) => {
  const { providerId } = providerIdRequestSchema.parse(input);
  return providerCredentialPresenceResponseSchema.parse(await credentialStore.testCredentialPresence(providerId));
});

ipcMain.handle("delete-provider-credential", async (_event, input: unknown) => {
  const { providerId } = providerIdRequestSchema.parse(input);
  const deleted = await credentialStore.deleteProviderCredential(providerId);
  if (providerId === "9router") {
    textCertificationStore.markTextCertificationsStale("9router");
    imageCertificationStore.markStale();
  }
  return providerCredentialDeletedResponseSchema.parse({
    providerId,
    deleted
  });
});

ipcMain.handle("load-provider-credential-settings", (_event, input: unknown) => {
  const { providerId } = providerIdRequestSchema.parse(input);
  const settings = credentialStore.loadProviderCredentialSettings(providerId);
  return providerCredentialSettingsResponseSchema.parse(
    settings ?? {
      providerId,
      baseUrl: "http://127.0.0.1:20128/v1",
      hasCredential: false
    }
  );
});

ipcMain.handle("save-9router-model-configuration", (_event, input: unknown) => {
  const parsed = save9RouterModelConfigurationRequestSchema.parse(input ?? {});
  const providerId = "9router";
  const previousSettings = credentialStore.loadProviderCredentialSettings(providerId);
  credentialStore.saveProviderModelConfiguration(providerId, {
    ...(parsed.textModel ? { textModel: parsed.textModel } : {}),
    ...(parsed.imageModel ? { imageModel: parsed.imageModel } : {}),
    ...(parsed.videoModel ? { videoModel: parsed.videoModel } : {}),
    ...(parsed.ttsModel ? { ttsModel: parsed.ttsModel } : {}),
    ...(parsed.sttModel ? { sttModel: parsed.sttModel } : {})
  });
  const selectedFields = ["textModel", "imageModel", "videoModel", "ttsModel", "sttModel"].filter(
    (field) => Boolean(parsed[field as keyof typeof parsed])
  );
  logger.info("nine_router_model_configuration_saved", { providerId, selectedFields, selectedCount: selectedFields.length });
  const settings = credentialStore.loadProviderCredentialSettings(providerId);
  if (previousSettings?.textModel !== settings?.textModel) {
    textCertificationStore.markTextCertificationsStale(providerId);
  }
  if (previousSettings?.imageModel !== settings?.imageModel) {
    imageCertificationStore.markStale();
  }
  return providerCredentialSettingsResponseSchema.parse(settings);
});

ipcMain.handle("list-9router-models", async (_event, input: unknown) => {
  listNineRouterModelsRequestSchema.parse(input ?? {});
  return nineRouterModelListResponseSchema.parse(await listNineRouterModels({ credentialStore, logger }));
});

ipcMain.handle("load-9router-text-certification", async () =>
  textModelCertificationResponseSchema.parse(await loadNineRouterTextCertification({ credentialStore, certificationStore: textCertificationStore }))
);

ipcMain.handle("run-9router-text-certification", async (_event, input: unknown) => {
  run9RouterTextCertificationRequestSchema.parse(input ?? {});
  return textModelCertificationResponseSchema.parse(
    await runNineRouterTextCertification({ credentialStore, certificationStore: textCertificationStore, logger })
  );
});

ipcMain.handle("list-9router-tts-catalog", async (_event, input: unknown) => {
  const request = listNineRouterTtsCatalogRequestSchema.parse(input);
  const settings = credentialStore.loadProviderCredentialSettings("9router");
  const apiKey = await credentialStore.resolveProviderSecret("9router");
  if (!settings || !apiKey) throw new Error("9Router TTS requires a saved 9Router credential.");
  return nineRouterTtsCatalogResponseSchema.parse(
    await discoverNineRouterTtsCatalog({ baseUrl: settings.baseUrl, apiKey, provider: request.provider, language: request.language })
  );
});

ipcMain.handle("list-tts-providers", async (_event, input: unknown) => {
  const request = listTtsProvidersRequestSchema.parse(input ?? {});
  return listTtsProvidersResponseSchema.parse(await ttsManager.listProviders(request.language ?? "vi"));
});

ipcMain.handle("run-tts-provider-health-check", async (_event, input: unknown) => {
  const request = runTtsProviderHealthCheckRequestSchema.parse(input);
  return runTtsProviderHealthCheckResponseSchema.parse(await ttsManager.runHealthCheck(request.provider));
});

ipcMain.handle("preview-tts-provider", async (_event, input: unknown) => {
  const request = ttsPreviewRequestSchema.parse(input);
  const preview = await ttsManager.preview({
    provider: request.provider,
    voiceId: request.voiceId,
    language: request.language,
    text: request.text,
    ...(request.rate !== undefined ? { rate: request.rate } : {})
  });
  return ttsPreviewResponseSchema.parse({
    previewUrl: preview.previewUrl,
    relativeFilePath: relative(workspaceRoot, preview.outputPath),
    requestedProvider: preview.requestedProvider,
    actualProvider: preview.actualProvider,
    voiceId: preview.voiceId,
    durationSeconds: preview.durationSeconds,
    codec: preview.codec,
    cached: preview.cached,
    fallbackUsed: preview.fallbackUsed,
    message: preview.cached ? "Cached TTS preview is ready." : "TTS preview generated and validated."
  });
});

ipcMain.handle("create-tts-job", (_event, input: unknown) => {
  const request = createTtsJobRequestSchema.parse(input);
  const job = ttsJobs.create({
    provider: request.provider,
    voiceId: request.voiceId,
    language: request.language,
    segments: request.segments.map((segment) => ({
      id: segment.id,
      text: segment.text,
      startSeconds: segment.startSeconds,
      ...(segment.endSeconds !== undefined ? { endSeconds: segment.endSeconds } : {}),
      ...(segment.rate !== undefined ? { rate: segment.rate } : {})
    })),
    ...(request.projectId ? { projectId: request.projectId } : {}),
    ...(request.rate !== undefined ? { rate: request.rate } : {}),
    ...(request.fallbackEnabled !== undefined ? { fallbackEnabled: request.fallbackEnabled } : {}),
    ...(request.fallbackOrder !== undefined ? { fallbackOrder: request.fallbackOrder } : {})
  });
  void ttsJobs.run(job.id).catch((error) => logger.error("tts_job_failed", { jobId: job.id, message: error instanceof Error ? error.message : String(error) }));
  return ttsJobResponseSchema.parse(job);
});

ipcMain.handle("get-tts-job", (_event, input: unknown) => {
  const request = ttsJobIdRequestSchema.parse(input);
  const job = ttsJobs.get(request.jobId);
  if (!job) throw new Error("TTS job was not found.");
  return ttsJobResponseSchema.parse(job);
});

ipcMain.handle("get-project-tts-job", (_event, input: unknown) => {
  const request = projectIdRequestSchema.parse(input);
  return nullableTtsJobResponseSchema.parse(ttsJobs.getLatestForProject(request.projectId));
});

ipcMain.handle("retry-tts-job-segment", async (_event, input: unknown) => {
  const request = retryTtsJobSegmentRequestSchema.parse(input);
  const existing = ttsJobs.get(request.jobId);
  if (!existing) throw new Error("TTS job was not found.");
  if (existing.projectId) {
    const project = projectRepository.loadProject(existing.projectId);
    const stage = project?.stages.find((item) => item.id === "voice-generation");
    if (project && stage?.status === "needs_attention" && stage.attention?.code === "TTS_INTERRUPTED") {
      const resumed = transitionProjectStage(project, "voice-generation", "running");
      db.exec("BEGIN IMMEDIATE;");
      try {
        saveProjectWithWorkflowInvalidation(resumed, { withinTransaction: true });
        db.exec("COMMIT;");
      } catch (error) {
        db.exec("ROLLBACK;");
        throw error;
      }
    }
  }
  const job = await ttsJobs.retrySegment(request.jobId, request.segmentId);
  await completeManagedVoiceGeneration(job);
  return ttsJobResponseSchema.parse(job);
});

ipcMain.handle("cancel-tts-job", (_event, input: unknown) => {
  const request = ttsJobIdRequestSchema.parse(input);
  const job = ttsJobs.cancel(request.jobId);
  void completeManagedVoiceGeneration(job).catch((error) => logger.error("voice_generation_tts_cancel_failed", { jobId: job.id, message: error instanceof Error ? error.message : String(error) }));
  return ttsJobResponseSchema.parse(job);
});

ipcMain.handle("load-local-tts-settings", () => loadLocalTtsSettings());

ipcMain.handle("save-local-tts-settings", (_event, input: unknown) => {
  const settings = localTtsSettingsSchema.parse(input);
  if (settings.voiceMode === "voice-clone" && !settings.referenceAudioPath) throw new Error("Voice clone mode requires reference audio.");
  if (settings.voiceMode === "integrated-voices") {
    if (!settings.ttsProvider || settings.ttsProvider === "omnivoice-local" || settings.ttsProvider === "capcut-experimental") throw new Error("Choose an enabled TTS provider.");
    if (!settings.language || !settings.ttsVoiceId) throw new Error("Choose a provider language and voice before saving.");
    if (settings.ttsProvider === "nine-router-tts" && !settings.ttsVoiceProvider) throw new Error("Choose the 9Router voice source before saving.");
  }
  if (settings.referenceTranscript && !settings.referenceAudioPath) throw new Error("Reference transcript requires reference audio for voice cloning.");
  appSettingsStore.save(localTtsSettingsId, settings);
  return loadLocalTtsSettings();
});

ipcMain.handle("select-local-tts-reference-audio", async () => {
  const selected = await dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "Audio", extensions: ["wav", "mp3", "m4a", "flac", "ogg"] }] });
  return localTtsReferenceAudioResponseSchema.parse(selected.canceled || !selected.filePaths[0] ? {} : { referenceAudioPath: selected.filePaths[0] });
});

ipcMain.handle("generate-local-tts", async (_event, input: unknown) => {
  const request = generateLocalTtsRequestSchema.parse(input);
  return runConfiguredTts({
    projectId: request.projectId,
    text: request.text,
    ...(request.outputName ? { outputName: request.outputName } : {})
  });
});

ipcMain.handle("run-dev-voice-test", async (_event, input: unknown) => runDevVoiceTest(input));
ipcMain.handle("run-dev-capcut-test", async (_event, input: unknown) => runDevCapcutTest(input));
ipcMain.handle("run-dev-idea-test", async (_event, input: unknown) => runDevIdeaTest(input));
ipcMain.handle("run-dev-image-test", async (_event, input: unknown) => runDevImageTest(input));
ipcMain.handle("run-dev-stock-test", async (_event, input: unknown) => runDevStockTest(input));

ipcMain.handle("mock-image-batch", async (_event, projectId: string) => {
  const parsed = projectIdRequestSchema.parse({ projectId });
  for (let index = 0; index < 5; index += 1) {
    queue.enqueue({
      projectId: parsed.projectId,
      shotId: `shot-${index + 1}`,
      requestType: "image",
      provider: "9router",
      model: "mock-image",
      promptVersionId: "16_image_prompt_compiler.v1",
      priority: index,
      idempotencyKey: `${parsed.projectId}-mock-${index}`
    });
  }
  await queue.runUntilIdle(async (job) => ({
    outputAssetIds: [`asset-${job.shotId}`],
    responseMetadata: { mocked: true },
    usageEstimate: { usd: 0 }
  }));
  return queue.snapshotWorkers();
});
