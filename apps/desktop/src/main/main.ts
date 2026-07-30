import { app, BrowserWindow, dialog, ipcMain, protocol } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  projectListResponseSchema,
  providerCredentialDeletedResponseSchema,
  providerCredentialPresenceResponseSchema,
  providerCredentialSettingsResponseSchema,
  providerCredentialSavedResponseSchema,
  referenceIdRequestSchema,
  referenceSetRequestSchema,
  runTranscriptCleaningRequestSchema,
  transcriptCleaningArtifactRequestSchema,
  transcriptCleaningArtifactsResponseSchema,
  runReferenceSegmentationRequestSchema,
  referenceSegmentationArtifactRequestSchema,
  referenceSegmentationArtifactsResponseSchema,
  runCompetitorDnaRequestSchema,
  competitorDnaArtifactRequestSchema,
  competitorDnaArtifactsResponseSchema,
  opportunityMapRequestSchema,
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
  channelRouteInputSchema
} from "@lsf/domain";
import type { CompetitorReference, FactoryProject, WorkflowStageStatus } from "@lsf/domain";
import { PersistentGenerationQueue } from "@lsf/generation-queue";
import { NineRouterClient } from "@lsf/providers";
import { listNineRouterModels } from "./nineRouterModelService";
import { loadNineRouterTextCertification, runNineRouterTextCertification } from "./nineRouterTextCertificationService";
import { runTranscriptCleaning, TranscriptCleaningError } from "./transcriptCleaningService";
import { runReferenceSegmentation, ReferenceSegmentationError } from "./referenceSegmentationService";
import { runCompetitorDna, CompetitorDnaError } from "./competitorDnaService";
import { runOpportunityMap, OpportunityMapError } from "./opportunityMapService";
import { runIdeaLab, IdeaLabError } from "./ideaLabService";
import { runClaimMap, ClaimMapError } from "./claimMapService";
import { runOutline, OutlineError } from "./outlineService";
import { runScript, ScriptError } from "./scriptService";
import { runRetentionReview, RetentionReviewError } from "./retentionReviewService";
import { runScenePlan, ScenePlanError } from "./scenePlanService";
import { runPromptPreparation, PromptPreparationError } from "./promptPreparationService";
import { runShotPlan, ShotPlanError } from "./shotPlanService";
import { acquireImageAsset, AssetAcquisitionError, importLocalImageAsset } from "./assetAcquisitionService";
import { loadNineRouterImageCertification, runNineRouterImageCertification } from "./nineRouterImageCertificationService";
import { getPreviewFileSha256, PreviewRenderError, renderPreview } from "./previewRenderService";
import { CapCutDraftError, runCapCutDraftBridge } from "./capcutDraftService";
import { listNineRouterTtsCatalog as discoverNineRouterTtsCatalog } from "./nineRouterTtsService";
import { TtsJobService, type TtsJobView } from "./ttsJobService";
import { TtsManager, type TtsProviderId } from "./ttsManager";
import { TtsWorkerClient } from "./ttsWorkerService";

protocol.registerSchemesAsPrivileged([{ scheme: "lsf-audio", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

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
const generationJobStore = new GenerationJobStore(db);
const ttsJobStore = new TtsJobStore(db);
workflowRunStore.recoverInterruptedRuns();
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
        ? "Environment ready; editable draft export still not implemented"
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
  for (const job of ttsJobs.listQueued()) {
    void ttsJobs.run(job.id)
      .then((completed) => completeManagedVoiceGeneration(completed))
      .catch((error) => logger.error("tts_job_resume_failed", { jobId: job.id, message: error instanceof Error ? error.message : String(error) }));
  }
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
  }
  const win = createWindow();
  if (process.env.LSF_E2E_UI_REPORT_PATH) {
    void runUiVerification(win, process.env.LSF_E2E_UI_REPORT_PATH, process.env.LSF_E2E_UI_MODE ?? "create");
  }
});

app.on("before-quit", () => ttsManager?.dispose());

async function runUiVerification(win: BrowserWindow, reportPath: string, mode: string): Promise<void> {
  const topic = mode === "workflow-contract" ? "Workflow contract verification project" : "What did Aaron's breastpiece symbolize?";
  try {
    writeUiVerificationReport(reportPath, { ok: false, mode, phase: "started", workspaceRoot, databasePath });
    await waitForRenderer(win);
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
      await setInputValue(win, "#idea-competitor-url", "http://youtube.com/watch?v=3GKC4kC3iQ0");
      await setInputValue(win, "#idea-competitor-script", "Replacement transcript for the same normalized YouTube source.");
      await clickText(win, "Save competitor reference");
      await assertText(win, "This video already exists in the project.");
      await clickText(win, "Cancel duplicate");
      await clickText(win, "Validate reference set");
      await assertText(win, "Reference set validated. Review and approve it to continue.");
      await clickText(win, "Approve reference set");
      await assertText(win, "Reference set approved. Competitor Workflow is now available.");
      await clickText(win, "Continue to Competitor Workflow");
      await assertText(win, "Transcript Cleaning");
      await assertText(win, "no request runs on screen load");
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
      await waitForText(win, "New Project", 15_000);
      await clickText(win, "New Project");
      await assertText(win, "New Project Wizard");
      await clickText(win, "Route channel profile");
      await assertText(win, "Bible Mysteries Revealed");
      await clickText(win, "Continue");
      await clickText(win, "Continue");
      await clickText(win, "Review");
      await clickText(win, "Create Project");
      await assertText(win, topic);
      await assertText(win, "Project command center");
      await clickText(win, "Shots");
      await assertText(win, "Shot Board");
      await clickText(win, "Visuals");
      await assertText(win, "Visual Routing");
      await clickText(win, "Production Queue");
      await assertText(win, "Queue Simulation");
      await clickText(win, "Providers");
      await assertText(win, "Video model");
      await assertText(win, "TTS model");
      await assertText(win, "Other providers");
      await setInputValue(win, "#provider-api-key", "sk-ui-runtime-secret");
      await clickText(win, "Save credential");
      await assertText(win, "Credential saved");
      await assertNoText(win, "sk-ui-runtime-secret");
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

function updateProjectStage(project: FactoryProject, stageId: string, status: WorkflowStageStatus): FactoryProject {
  return {
    ...project,
    stages: normalizeProjectStages(project.stages).map((stage) => (stage.id === stageId ? { ...stage, status } : stage))
  };
}

function transitionProjectStage(project: FactoryProject, stageId: string, status: WorkflowStageStatus): FactoryProject {
  const current = normalizeProjectStages(project.stages).find((stage) => stage.id === stageId);
  if (!current) throw new Error(`Unknown workflow stage: ${stageId}`);
  if (current.status !== status) assertWorkflowStageTransition(current.status, status);
  return updateProjectStage(project, stageId, status);
}

function markReferenceChangeStale(project: FactoryProject): FactoryProject {
  const staleStages = new Set([
    "reference-validation",
    "transcript-cleaning",
    "reference-segmentation",
    "competitor-dna",
    "opportunity-map",
    "idea-lab",
    "originality-review",
    "research-source-intake",
    "claim-map",
    "outline",
    "script",
    "fact-review",
    "retention-review",
    "scene-plan",
    "shot-plan",
    "visual-routing",
    "prompt-preparation",
    "asset-acquisition",
    "asset-review",
    "voice-generation",
    "subtitle-preparation",
    "timeline-assembly",
    "preview-render",
    "qa",
    "capcut-draft",
    "packaging-export"
  ]);
  return {
    ...project,
    referenceSet: { ...(project.referenceSet ?? { status: "not_started" }), status: "stale" },
    stages: normalizeProjectStages(project.stages).map((stage) => (
      staleStages.has(stage.id) && (stage.status === "approved" || stage.status === "needs_review" || stage.status === "ready")
        ? { ...stage, status: "stale" }
        : stage
    ))
  };
}

function saveAndReturnProject(project: FactoryProject, options: { invalidateArtifacts?: boolean } = {}): FactoryProject {
  const normalized = { ...project, stages: normalizeProjectStages(project.stages) };
  db.exec("BEGIN IMMEDIATE;");
  try {
    projectRepository.saveProject(normalized, { withinTransaction: true });
    if (options.invalidateArtifacts || normalized.referenceSet?.status === "stale") workflowRunStore.markProjectArtifactsStale(normalized.id);
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

function referenceValidationInputFingerprint(references: CompetitorReference[]): string {
  return canonicalSha256(references.map((reference) => ({
    id: reference.id,
    identityKey: reference.identityKey,
    included: reference.included,
    sourceUrl: reference.sourceUrl,
    transcript: reference.pastedTranscript,
    version: reference.version
  })));
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
    format: request.format,
    targetLanguage: request.targetLanguage,
    profiles: seedChannelProfiles,
    ...(request.targetDuration ? { targetDuration: request.targetDuration } : {}),
    ...(request.projectName ? { projectName: request.projectName } : {}),
    ...(request.workflowMode ? { workflowMode: request.workflowMode } : {}),
    ...(competitorReference ? { competitorReference } : {})
  });
  projectRepository.createProject(project);
  logger.info("project_created", { projectId: project.id, topic: project.topic });
  return factoryProjectResponseSchema.parse(project);
});

ipcMain.handle("add-competitor-reference", (_event, input: unknown) => {
  const request = addCompetitorReferenceRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const identityKey = normalizeReferenceIdentity(request.sourceUrl);
  const existingReference = findDuplicateReference(project.competitorReferences, identityKey);
  if (existingReference) {
    logger.info("competitor_reference_duplicate_detected", { projectId: request.projectId, referenceId: existingReference.id });
    return addCompetitorReferenceResponseSchema.parse({
      status: "duplicate",
      project,
      existingReference,
      message: "This video already exists in the project."
    });
  }
  const now = new Date().toISOString();
  const referenceChangeProject = project.referenceSet?.status === "approved" ? markReferenceChangeStale(project) : project;
  const nextProject = updateProjectStage({
    ...referenceChangeProject,
    referenceSet: { status: "needs_validation" },
    competitorReferences: [
      ...project.competitorReferences,
      {
        id: `competitor-${randomUUID()}`,
        ...(identityKey ? { identityKey } : {}),
        ...(request.sourceUrl ? { sourceUrl: request.sourceUrl } : {}),
        pastedTranscript: request.pastedTranscript,
        ...(request.notes ? { notes: request.notes } : {}),
        status: "draft" as const,
        included: true,
        version: 1,
        createdAt: now,
        updatedAt: now
      }
    ]
  }, "reference-intake", "approved");
  const savedProject = saveAndReturnProject(nextProject, { invalidateArtifacts: project.referenceSet?.status === "approved" });
  logger.info("competitor_reference_added", { projectId: request.projectId });
  return addCompetitorReferenceResponseSchema.parse({
    status: "saved",
    project: savedProject,
    message: "Competitor reference saved as Draft."
  });
});

ipcMain.handle("replace-competitor-reference", (_event, input: unknown) => {
  const request = replaceCompetitorReferenceRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const existingReference = project.competitorReferences.find((reference) => reference.id === request.referenceId);
  if (!existingReference) throw new Error(`Reference not found: ${request.referenceId}`);
  const now = new Date().toISOString();
  const nextReference: CompetitorReference = {
    ...existingReference,
    id: `competitor-${randomUUID()}`,
    pastedTranscript: request.pastedTranscript,
    ...(request.notes ? { notes: request.notes } : {}),
    status: "draft",
    included: true,
    version: (existingReference.version ?? 1) + 1,
    parentReferenceId: existingReference.id,
    createdAt: now,
    updatedAt: now
  };
  const nextProject = markReferenceChangeStale({
    ...project,
    competitorReferences: project.competitorReferences.map((reference) =>
      reference.id === existingReference.id ? { ...reference, included: false, updatedAt: now } : reference
    ).concat(nextReference)
  });
  const savedProject = saveAndReturnProject(updateProjectStage(nextProject, "reference-intake", "approved"));
  logger.info("competitor_reference_replaced", { projectId: request.projectId, referenceId: existingReference.id });
  return factoryProjectResponseSchema.parse(savedProject);
});

ipcMain.handle("edit-competitor-reference", (_event, input: unknown) => {
  const request = editCompetitorReferenceRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const now = new Date().toISOString();
  const identityKey = normalizeReferenceIdentity(request.sourceUrl);
  const nextProject = markReferenceChangeStale({
    ...project,
    competitorReferences: project.competitorReferences.map((reference) => {
      if (reference.id !== request.referenceId) return reference;
      return {
        ...reference,
        ...(identityKey ? { identityKey } : {}),
        ...(request.sourceUrl ? { sourceUrl: request.sourceUrl } : {}),
        pastedTranscript: request.pastedTranscript,
        ...(request.notes ? { notes: request.notes } : {}),
        status: "draft",
        validationMessage: "Reference was edited and must be validated again.",
        updatedAt: now
      };
    })
  });
  const savedProject = saveAndReturnProject(updateProjectStage(nextProject, "reference-intake", "approved"));
  logger.info("competitor_reference_edited", { projectId: request.projectId, referenceId: request.referenceId });
  return factoryProjectResponseSchema.parse(savedProject);
});

ipcMain.handle("delete-competitor-reference", (_event, input: unknown) => {
  const request = referenceIdRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const nextProject = markReferenceChangeStale({
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
  const nextProject = markReferenceChangeStale({
    ...project,
    competitorReferences: project.competitorReferences.map((reference) =>
      reference.id === request.referenceId ? { ...reference, included: request.included, updatedAt: new Date().toISOString() } : reference
    )
  });
  const savedProject = saveAndReturnProject(nextProject);
  logger.info("competitor_reference_include_changed", { projectId: request.projectId, referenceId: request.referenceId, included: request.included });
  return factoryProjectResponseSchema.parse(savedProject);
});

ipcMain.handle("validate-reference-set", async (_event, input: unknown) => {
  const request = referenceSetRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const seenIdentityOwners = new Map<string, string>();
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
      included: reference.included !== false,
      updatedAt: new Date().toISOString()
    };
  });
  const referenceSet = await evaluateReferenceSet(validatedReferences);
  const validationStatus = referenceSet.status === "valid" ? "needs_review" : "failed";
  const inputFingerprint = referenceValidationInputFingerprint(validatedReferences);
  const existingRun = workflowRunStore.findLatestByInput(project.id, "reference-validation", inputFingerprint);
  if (existingRun?.status === "needs_review") {
    return factoryProjectResponseSchema.parse(project);
  }
  const nextProject = updateProjectStage({
    ...project,
    competitorReferences: validatedReferences,
    referenceSet
  }, "reference-validation", validationStatus);
  const now = new Date().toISOString();
  const runId = `stage-run-${randomUUID()}`;
  const artifacts = workflowRunStore.listArtifacts(project.id, "reference-validation");
  const artifactId = `artifact-${randomUUID()}`;
  db.exec("BEGIN IMMEDIATE;");
  try {
    projectRepository.saveProject(nextProject, { withinTransaction: true });
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
  const inputFingerprint = referenceValidationInputFingerprint(project.competitorReferences);
  const reviewRun = workflowRunStore.findLatestByInput(project.id, "reference-validation", inputFingerprint);
  if (!included.length || hasInvalid || project.referenceSet?.status !== "valid" || reviewRun?.status !== "needs_review") {
    throw new Error("Reference set must be valid before approval.");
  }
  const now = new Date().toISOString();
  const approvedProject = updateProjectStage({
    ...project,
    referenceSet: {
      ...(project.referenceSet ?? { status: "valid" }),
      status: "approved",
      approvedAt: now
    },
    competitorReferences: project.competitorReferences.map((reference) =>
      reference.included === false ? reference : { ...reference, status: "approved", updatedAt: now }
    )
  }, "reference-validation", "approved");
  db.exec("BEGIN IMMEDIATE;");
  try {
    projectRepository.saveProject(approvedProject, { withinTransaction: true });
    workflowRunStore.approveReviewRun(reviewRun.id);
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  const savedProject = approvedProject;
  logger.info("reference_set_approved", { projectId: request.projectId, includedCount: included.length });
  return factoryProjectResponseSchema.parse(savedProject);
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
  const inputFingerprint = canonicalSha256({
    stageId: "transcript-cleaning",
    referenceId: reference.id,
    transcript: reference.pastedTranscript,
    version: reference.version ?? 1
  });
  const existingRun = workflowRunStore.findLatestByInput(project.id, "transcript-cleaning", inputFingerprint);
  if (existingRun?.status === "running" || existingRun?.status === "needs_review") {
    return factoryProjectResponseSchema.parse(project);
  }

  const now = new Date().toISOString();
  const runId = `stage-run-${randomUUID()}`;
  const queuedProject = transitionProjectStage(project, "transcript-cleaning", "queued");
  const runningProject = transitionProjectStage(queuedProject, "transcript-cleaning", "running");
  db.exec("BEGIN IMMEDIATE;");
  try {
    projectRepository.saveProject(runningProject, { withinTransaction: true });
    workflowRunStore.createRun({
      id: runId,
      projectId: project.id,
      stageId: "transcript-cleaning",
      status: "running",
      runnerId: "transcript-cleaning-9router",
      runnerVersion: "transcript-cleaning-v1",
      inputArtifactIds: [reference.id],
      inputFingerprint,
      outputArtifactIds: [],
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
      credentialStore,
      certificationStore: textCertificationStore
    });
    const artifactId = `artifact-${randomUUID()}`;
    const artifacts = workflowRunStore.listArtifacts(project.id, "transcript-cleaning");
    const finishedAt = new Date().toISOString();
    const reviewProject = transitionProjectStage(runningProject, "transcript-cleaning", "needs_review");
    db.exec("BEGIN IMMEDIATE;");
    try {
      projectRepository.saveProject(reviewProject, { withinTransaction: true });
      workflowRunStore.finishRun({
        id: runId,
        projectId: project.id,
        stageId: "transcript-cleaning",
        status: "needs_review",
        runnerId: "transcript-cleaning-9router",
        runnerVersion: "transcript-cleaning-v1",
        inputArtifactIds: [reference.id],
        inputFingerprint,
        outputArtifactIds: [artifactId],
        finishedAt,
        ...(cleaned.returnedModelId ? { returnedModelId: cleaned.returnedModelId } : {})
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
    const failedProject = transitionProjectStage(runningProject, "transcript-cleaning", "failed");
    db.exec("BEGIN IMMEDIATE;");
    try {
      projectRepository.saveProject(failedProject, { withinTransaction: true });
      workflowRunStore.finishRun({
        id: runId,
        projectId: project.id,
        stageId: "transcript-cleaning",
        status: "failed",
        runnerId: "transcript-cleaning-9router",
        runnerVersion: "transcript-cleaning-v1",
        inputArtifactIds: [reference.id],
        inputFingerprint,
        outputArtifactIds: [],
        finishedAt,
        safeErrorCategory: safeCategory,
        safeErrorMessage: safeMessage
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
  if (!artifact?.stageRunId) throw new Error("No reviewable cleaned transcript exists for this reference.");
  const approvedReferences = project.competitorReferences.filter((reference) => reference.included !== false && reference.status === "approved");
  const nextArtifacts = artifacts.map((item) => item.id === artifact.id ? { ...item, status: "approved" as const } : item);
  const allApproved = approvedReferences.every((reference) =>
    nextArtifacts.some((item) => item.status === "approved" && item.payloadJson?.referenceId === reference.id)
  );
  const nextProject = allApproved
    ? transitionProjectStage(project, "transcript-cleaning", "approved")
    : updateProjectStage(project, "transcript-cleaning", "needs_review");
  db.exec("BEGIN IMMEDIATE;");
  try {
    projectRepository.saveProject(nextProject, { withinTransaction: true });
    workflowRunStore.approveReviewRun(artifact.stageRunId);
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  return factoryProjectResponseSchema.parse(nextProject);
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
  const cleanedArtifact = workflowRunStore.listArtifacts(project.id, "transcript-cleaning")
    .find((artifact) => artifact.status === "approved" && artifact.payloadJson?.referenceId === reference.id);
  if (!cleanedArtifact || typeof cleanedArtifact.payloadJson?.cleanedTranscript !== "string") {
    throw new Error("No approved cleaned transcript exists for this reference.");
  }
  const cleanedTranscript = cleanedArtifact.payloadJson.cleanedTranscript;
  const inputFingerprint = canonicalSha256({ stageId: "reference-segmentation", referenceId: reference.id, cleanedArtifactId: cleanedArtifact.id, cleanedTranscript });
  const existingRun = workflowRunStore.findLatestByInput(project.id, "reference-segmentation", inputFingerprint);
  if (existingRun?.status === "running" || existingRun?.status === "needs_review") return factoryProjectResponseSchema.parse(project);

  const now = new Date().toISOString();
  const runId = `stage-run-${randomUUID()}`;
  const currentStatus = project.stages.find((stage) => stage.id === "reference-segmentation")?.status ?? "not_started";
  const runningProject = currentStatus === "needs_review"
    ? project
    : transitionProjectStage(transitionProjectStage(project, "reference-segmentation", "queued"), "reference-segmentation", "running");
  db.exec("BEGIN IMMEDIATE;");
  try {
    projectRepository.saveProject(runningProject, { withinTransaction: true });
    workflowRunStore.createRun({
      id: runId, projectId: project.id, stageId: "reference-segmentation", status: "running",
      runnerId: "reference-segmentation-9router", runnerVersion: "reference-segmentation-v1",
      inputArtifactIds: [cleanedArtifact.id], inputFingerprint, outputArtifactIds: [], startedAt: now
    });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }

  try {
    const segmented = await runReferenceSegmentation({ referenceId: reference.id, cleanedTranscript, credentialStore, certificationStore: textCertificationStore });
    const artifactId = `artifact-${randomUUID()}`;
    const artifacts = workflowRunStore.listArtifacts(project.id, "reference-segmentation");
    const finishedAt = new Date().toISOString();
    const reviewProject = currentStatus === "needs_review" ? project : transitionProjectStage(runningProject, "reference-segmentation", "needs_review");
    db.exec("BEGIN IMMEDIATE;");
    try {
      projectRepository.saveProject(reviewProject, { withinTransaction: true });
      workflowRunStore.finishRun({
        id: runId, projectId: project.id, stageId: "reference-segmentation", status: "needs_review",
        runnerId: "reference-segmentation-9router", runnerVersion: "reference-segmentation-v1",
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
      projectRepository.saveProject(failedProject, { withinTransaction: true });
      workflowRunStore.finishRun({
        id: runId, projectId: project.id, stageId: "reference-segmentation", status: "failed",
        runnerId: "reference-segmentation-9router", runnerVersion: "reference-segmentation-v1",
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
  if (!artifact?.stageRunId) throw new Error("No reviewable segmentation exists for this reference.");
  const approvedReferences = project.competitorReferences.filter((reference) => reference.included !== false && reference.status === "approved");
  const nextArtifacts = artifacts.map((item) => item.id === artifact.id ? { ...item, status: "approved" as const } : item);
  const allApproved = approvedReferences.every((reference) => nextArtifacts.some((item) => item.status === "approved" && item.payloadJson?.referenceId === reference.id));
  const nextProject = allApproved ? transitionProjectStage(project, "reference-segmentation", "approved") : project;
  db.exec("BEGIN IMMEDIATE;");
  try {
    projectRepository.saveProject(nextProject, { withinTransaction: true });
    workflowRunStore.approveReviewRun(artifact.stageRunId);
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  return factoryProjectResponseSchema.parse(nextProject);
});

ipcMain.handle("run-competitor-dna", async (_event, input: unknown) => {
  const request = runCompetitorDnaRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const reference = project.competitorReferences.find((item) => item.id === request.referenceId);
  if (!reference || reference.included === false || reference.status !== "approved") throw new Error("Competitor DNA requires an included, approved reference.");
  const cleaned = workflowRunStore.listArtifacts(project.id, "transcript-cleaning").find((artifact) => artifact.status === "approved" && artifact.payloadJson?.referenceId === reference.id);
  const segmentation = workflowRunStore.listArtifacts(project.id, "reference-segmentation").find((artifact) => artifact.status === "approved" && artifact.payloadJson?.referenceId === reference.id);
  if (!cleaned || typeof cleaned.payloadJson?.cleanedTranscript !== "string" || !segmentation || !Array.isArray(segmentation.payloadJson?.segments)) throw new Error("Competitor DNA requires approved cleaned transcript and segmentation artifacts for this reference.");
  const inputFingerprint = canonicalSha256({ stageId: "competitor-dna", referenceId: reference.id, cleanedArtifactId: cleaned.id, segmentationArtifactId: segmentation.id });
  const existing = workflowRunStore.findLatestByInput(project.id, "competitor-dna", inputFingerprint);
  if (existing?.status === "running" || existing?.status === "needs_review") return factoryProjectResponseSchema.parse(project);
  const now = new Date().toISOString();
  const runId = `stage-run-${randomUUID()}`;
  const currentStatus = project.stages.find((stage) => stage.id === "competitor-dna")?.status ?? "not_started";
  const runningProject = currentStatus === "needs_review" ? project : transitionProjectStage(transitionProjectStage(project, "competitor-dna", "queued"), "competitor-dna", "running");
  db.exec("BEGIN IMMEDIATE;");
  try {
    projectRepository.saveProject(runningProject, { withinTransaction: true });
    workflowRunStore.createRun({ id: runId, projectId: project.id, stageId: "competitor-dna", status: "running", runnerId: "competitor-dna-9router", runnerVersion: "competitor-dna-v1", inputArtifactIds: [cleaned.id, segmentation.id], inputFingerprint, outputArtifactIds: [], startedAt: now });
    db.exec("COMMIT;");
  } catch (error) { db.exec("ROLLBACK;"); throw error; }
  try {
    const result = await runCompetitorDna({ referenceId: reference.id, cleanedTranscript: cleaned.payloadJson.cleanedTranscript, segments: segmentation.payloadJson.segments as never, credentialStore, certificationStore: textCertificationStore });
    const artifactId = `artifact-${randomUUID()}`;
    const finishedAt = new Date().toISOString();
    const artifacts = workflowRunStore.listArtifacts(project.id, "competitor-dna");
    const reviewProject = currentStatus === "needs_review" ? project : transitionProjectStage(runningProject, "competitor-dna", "needs_review");
    db.exec("BEGIN IMMEDIATE;");
    try {
      projectRepository.saveProject(reviewProject, { withinTransaction: true });
      workflowRunStore.finishRun({ id: runId, projectId: project.id, stageId: "competitor-dna", status: "needs_review", runnerId: "competitor-dna-9router", runnerVersion: "competitor-dna-v1", inputArtifactIds: [cleaned.id, segmentation.id], inputFingerprint, outputArtifactIds: [artifactId], finishedAt, ...(result.returnedModelId ? { returnedModelId: result.returnedModelId } : {}) }, { id: artifactId, projectId: project.id, stageId: "competitor-dna", stageRunId: runId, type: "competitor-dna-card", version: artifacts.length + 1, status: "needs_review", payloadJson: result.output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true });
      db.exec("COMMIT;");
    } catch (error) { db.exec("ROLLBACK;"); throw error; }
    return factoryProjectResponseSchema.parse(reviewProject);
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const safeCategory = error instanceof CompetitorDnaError ? error.category : "unexpected_failure";
    const safeMessage = error instanceof CompetitorDnaError ? error.message : "Competitor DNA failed.";
    const failedProject = currentStatus === "needs_review" ? project : transitionProjectStage(runningProject, "competitor-dna", "failed");
    db.exec("BEGIN IMMEDIATE;");
    try { projectRepository.saveProject(failedProject, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId: project.id, stageId: "competitor-dna", status: "failed", runnerId: "competitor-dna-9router", runnerVersion: "competitor-dna-v1", inputArtifactIds: [cleaned.id, segmentation.id], inputFingerprint, outputArtifactIds: [], finishedAt, safeErrorCategory: safeCategory, safeErrorMessage: safeMessage }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); }
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
  if (!artifact?.stageRunId) throw new Error("No reviewable Competitor DNA output exists for this reference.");
  const approvedReferences = project.competitorReferences.filter((reference) => reference.included !== false && reference.status === "approved");
  const nextArtifacts = artifacts.map((item) => item.id === artifact.id ? { ...item, status: "approved" as const } : item);
  const allApproved = approvedReferences.every((reference) => nextArtifacts.some((item) => item.status === "approved" && item.payloadJson?.referenceId === reference.id));
  const nextProject = allApproved ? transitionProjectStage(project, "competitor-dna", "approved") : project;
  db.exec("BEGIN IMMEDIATE;");
  try { projectRepository.saveProject(nextProject, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); }
  catch (error) { db.exec("ROLLBACK;"); throw error; }
  return factoryProjectResponseSchema.parse(nextProject);
});

ipcMain.handle("run-opportunity-map", async (_event, input: unknown) => {
  const { projectId } = opportunityMapRequestSchema.parse(input); const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const dna = workflowRunStore.listArtifacts(projectId, "competitor-dna").filter((artifact) => artifact.status === "approved");
  const refs = project.competitorReferences.filter((reference) => reference.included !== false && reference.status === "approved");
  if (dna.length !== refs.length || dna.length === 0) throw new Error("Opportunity Map requires approved Competitor DNA for every included reference.");
  const fingerprint = canonicalSha256({ stageId: "opportunity-map", artifactIds: dna.map((artifact) => artifact.id).sort() }); const existing = workflowRunStore.findLatestByInput(projectId, "opportunity-map", fingerprint);
  if (existing?.status === "running" || existing?.status === "needs_review") return factoryProjectResponseSchema.parse(project);
  const runId = `stage-run-${randomUUID()}`; const now = new Date().toISOString(); const running = transitionProjectStage(transitionProjectStage(project, "opportunity-map", "queued"), "opportunity-map", "running");
  db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(running, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "opportunity-map", status: "running", runnerId: "opportunity-map-9router", runnerVersion: "opportunity-map-v1", inputArtifactIds: dna.map((artifact) => artifact.id), inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
  try { const result = await runOpportunityMap({ dnaArtifacts: dna.map((artifact) => ({ id: artifact.id, payload: artifact.payloadJson ?? {} })), credentialStore, certificationStore: textCertificationStore }); const artifactId = `artifact-${randomUUID()}`; const finishedAt = new Date().toISOString(); const review = transitionProjectStage(running, "opportunity-map", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(review, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "opportunity-map", status: "needs_review", runnerId: "opportunity-map-9router", runnerVersion: "opportunity-map-v1", inputArtifactIds: dna.map((artifact) => artifact.id), inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt, ...(result.returnedModelId ? { returnedModelId: result.returnedModelId } : {}) }, { id: artifactId, projectId, stageId: "opportunity-map", stageRunId: runId, type: "opportunity-map", version: workflowRunStore.listArtifacts(projectId, "opportunity-map").length + 1, status: "needs_review", payloadJson: result.output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); }
  catch (error) { const failed = transitionProjectStage(running, "opportunity-map", "failed"); const message = error instanceof OpportunityMapError ? error.message : "Opportunity Map failed."; db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(failed, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "opportunity-map", status: "failed", runnerId: "opportunity-map-9router", runnerVersion: "opportunity-map-v1", inputArtifactIds: dna.map((artifact) => artifact.id), inputFingerprint: fingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof OpportunityMapError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); } catch (persistError) { db.exec("ROLLBACK;"); throw persistError; } throw new Error(message); }
});

ipcMain.handle("list-opportunity-map-artifacts", (_event, input: unknown) => { const { projectId } = opportunityMapRequestSchema.parse(input); return workflowRunStore.listArtifacts(projectId, "opportunity-map").map((artifact) => opportunityMapArtifactResponseSchema.parse({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt })); });

ipcMain.handle("approve-opportunity-map", (_event, input: unknown) => {
  const { projectId } = opportunityMapRequestSchema.parse(input); const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const artifact = workflowRunStore.listArtifacts(projectId, "opportunity-map").find((item) => item.status === "needs_review");
  if (!artifact?.stageRunId) throw new Error("No reviewable Opportunity Map exists.");
  const approved = transitionProjectStage(project, "opportunity-map", "approved");
  db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
  return factoryProjectResponseSchema.parse(approved);
});

ipcMain.handle("run-idea-lab", async (_event, input: unknown) => {
  const { projectId } = ideaLabRequestSchema.parse(input); const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const opportunity = workflowRunStore.listArtifacts(projectId, "opportunity-map").find((artifact) => artifact.status === "approved");
  if (!opportunity?.payloadJson) throw new Error("Idea Lab requires an approved Opportunity Map.");
  const profile = seedChannelProfiles.find((item) => item.id === project.profileId); if (!profile) throw new Error("Active channel profile is unavailable.");
  const fingerprint = canonicalSha256({ stageId: "idea-lab", opportunityId: opportunity.id, profileId: profile.id, format: project.format, language: project.targetLanguage, targetDuration: project.setup.targetDuration });
  const existingRun = workflowRunStore.findLatestByInput(projectId, "idea-lab", fingerprint);
  if (existingRun?.status === "running" || existingRun?.status === "needs_review") return factoryProjectResponseSchema.parse(project);
  const runId = `stage-run-${randomUUID()}`; const running = transitionProjectStage(transitionProjectStage(project, "idea-lab", "queued"), "idea-lab", "running"); const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(running, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "idea-lab", status: "running", runnerId: "idea-lab-9router", runnerVersion: "idea-lab-v1", inputArtifactIds: [opportunity.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
  try { const result = await runIdeaLab({ opportunityMap: opportunity.payloadJson, topic: project.topic, profile: profile as unknown as Record<string, unknown>, format: project.format, language: project.targetLanguage, targetDuration: project.setup.targetDuration, credentialStore, certificationStore: textCertificationStore }); const artifactId = `artifact-${randomUUID()}`; const finishedAt = new Date().toISOString(); const review = transitionProjectStage(running, "idea-lab", "needs_review"); const withIdeas = { ...review, ideas: result.output.candidates }; db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(withIdeas, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "idea-lab", status: "needs_review", runnerId: "idea-lab-9router", runnerVersion: "idea-lab-v1", inputArtifactIds: [opportunity.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt }, { id: artifactId, projectId, stageId: "idea-lab", stageRunId: runId, type: "idea-candidates", version: workflowRunStore.listArtifacts(projectId, "idea-lab").length + 1, status: "needs_review", payloadJson: result.output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(withIdeas); }
  catch (error) { const failed = transitionProjectStage(running, "idea-lab", "failed"); const message = error instanceof IdeaLabError ? error.message : "Idea Lab failed."; db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(failed, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "idea-lab", status: "failed", runnerId: "idea-lab-9router", runnerVersion: "idea-lab-v1", inputArtifactIds: [opportunity.id], inputFingerprint: fingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof IdeaLabError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); } catch (persistenceError) { db.exec("ROLLBACK;"); throw persistenceError; } throw new Error(message); }
});

ipcMain.handle("approve-idea", (_event, input: unknown) => {
  const { projectId, ideaId } = approveIdeaRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "idea-lab").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId) throw new Error("No reviewable Idea Lab output exists."); const candidateSet = ideaLabOutputSchema.parse(artifact.payloadJson); if (!candidateSet.candidates.some((idea) => idea.id === ideaId)) throw new Error("Idea candidate does not belong to the reviewable Idea Lab output."); const approved = transitionProjectStage({ ...project, ideas: candidateSet.candidates, approvedIdeaId: ideaId }, "idea-lab", "approved"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved);
});

ipcMain.handle("run-originality-review", (_event, input: unknown) => {
  const { projectId } = originalityReviewRequestSchema.parse(input);
  const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  if (!project.approvedIdeaId) throw new Error("Originality Review requires an approved Idea Lab candidate.");
  const ideaArtifact = workflowRunStore.listArtifacts(projectId, "idea-lab").find((artifact) => artifact.status === "approved");
  if (!ideaArtifact?.payloadJson) throw new Error("Originality Review requires an approved Idea Lab artifact.");
  const idea = ideaLabOutputSchema.parse(ideaArtifact.payloadJson).candidates.find((candidate) => candidate.id === project.approvedIdeaId);
  if (!idea) throw new Error("The approved idea is not present in the approved Idea Lab artifact.");
  const dnaArtifacts = workflowRunStore.listArtifacts(projectId, "competitor-dna").filter((artifact) => artifact.status === "approved" && artifact.payloadJson);
  if (!dnaArtifacts.length) throw new Error("Originality Review requires approved Competitor DNA artifacts.");
  const inputFingerprint = canonicalSha256({ stageId: "originality-review", ideaArtifactId: ideaArtifact.id, ideaId: idea.id, dnaArtifactIds: dnaArtifacts.map((artifact) => artifact.id) });
  const existingRun = workflowRunStore.findLatestByInput(projectId, "originality-review", inputFingerprint);
  if (existingRun?.status === "running" || existingRun?.status === "needs_review") return factoryProjectResponseSchema.parse(project);
  const runId = `stage-run-${randomUUID()}`;
  const running = transitionProjectStage(transitionProjectStage(project, "originality-review", "queued"), "originality-review", "running");
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE;");
  try {
    projectRepository.saveProject(running, { withinTransaction: true });
    workflowRunStore.createRun({ id: runId, projectId, stageId: "originality-review", status: "running", runnerId: "originality-review-local", runnerVersion: "originality-review-v1", inputArtifactIds: [ideaArtifact.id, ...dnaArtifacts.map((artifact) => artifact.id)], inputFingerprint, outputArtifactIds: [], startedAt: now });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  try {
    const patterns = dnaArtifacts.map((artifact) => {
      const dna = competitorDnaOutputSchema.parse(artifact.payloadJson);
      return { hookPattern: dna.hookPattern.abstraction, promisePattern: dna.promisePattern.abstraction, pacingPattern: dna.pacingPattern.description, proofPattern: dna.proofPattern.description, visualOpportunities: dna.visualOpportunities.map((item) => item.abstraction), forbiddenToCopy: dna.forbiddenToCopy.map((item) => item.element) };
    });
    const result = reviewOriginality({ idea, patterns });
    const output = originalityReviewOutputSchema.parse({ ideaId: idea.id, ...result, competitorDnaArtifactIds: dnaArtifacts.map((artifact) => artifact.id) });
    const artifactId = `artifact-${randomUUID()}`;
    const finishedAt = new Date().toISOString();
    const review = transitionProjectStage(running, "originality-review", "needs_review");
    db.exec("BEGIN IMMEDIATE;");
    try {
      projectRepository.saveProject(review, { withinTransaction: true });
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
      projectRepository.saveProject(failed, { withinTransaction: true });
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
    projectRepository.saveProject(approved, { withinTransaction: true });
    workflowRunStore.approveReviewRun(artifact.stageRunId);
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
  return factoryProjectResponseSchema.parse(approved);
});

ipcMain.handle("save-research-sources", (_event, input: unknown) => {
  const request = saveResearchSourcesRequestSchema.parse(input);
  const project = projectRepository.loadProject(request.projectId);
  if (!project) throw new Error(`Project not found: ${request.projectId}`);
  if (project.stages.find((stage) => stage.id === "originality-review")?.status !== "approved") throw new Error("Research Source Intake requires an approved Originality Review.");
  const inputFingerprint = canonicalSha256({ stageId: "research-source-intake", sources: request.sources });
  const existingRun = workflowRunStore.findLatestByInput(project.id, "research-source-intake", inputFingerprint);
  if (existingRun?.status === "needs_review" || existingRun?.status === "approved") return factoryProjectResponseSchema.parse(project);
  const runId = `stage-run-${randomUUID()}`;
  const artifactId = `artifact-${randomUUID()}`;
  const now = new Date().toISOString();
  const running = transitionProjectStage(transitionProjectStage(project, "research-source-intake", "queued"), "research-source-intake", "running");
  const review = transitionProjectStage(running, "research-source-intake", "needs_review");
  db.exec("BEGIN IMMEDIATE;");
  try {
    projectRepository.saveProject(review, { withinTransaction: true });
    workflowRunStore.createRun({ id: runId, projectId: project.id, stageId: "research-source-intake", status: "running", runnerId: "research-source-intake-manual", runnerVersion: "research-source-intake-v1", inputArtifactIds: [], inputFingerprint, outputArtifactIds: [], startedAt: now });
    workflowRunStore.finishRun({ id: runId, projectId: project.id, stageId: "research-source-intake", status: "needs_review", runnerId: "research-source-intake-manual", runnerVersion: "research-source-intake-v1", inputArtifactIds: [], inputFingerprint, outputArtifactIds: [artifactId], finishedAt: now }, { id: artifactId, projectId: project.id, stageId: "research-source-intake", stageRunId: runId, type: "research-sources", version: workflowRunStore.listArtifacts(project.id, "research-source-intake").length + 1, status: "needs_review", payloadJson: { sources: request.sources }, createdAt: now, updatedAt: now }, { withinTransaction: true });
    db.exec("COMMIT;");
  } catch (error) { db.exec("ROLLBACK;"); throw error; }
  return factoryProjectResponseSchema.parse(review);
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
  if (!artifact?.stageRunId) throw new Error("No reviewable Research Source Intake exists.");
  const approved = transitionProjectStage(project, "research-source-intake", "approved");
  db.exec("BEGIN IMMEDIATE;");
  try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
  return factoryProjectResponseSchema.parse(approved);
});

ipcMain.handle("run-claim-map", async (_event, input: unknown) => {
  const { projectId } = claimMapRequestSchema.parse(input); const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const sourceArtifact = workflowRunStore.listArtifacts(projectId, "research-source-intake").find((artifact) => artifact.status === "approved" && artifact.payloadJson);
  if (!sourceArtifact?.payloadJson) throw new Error("Claim Map requires approved research sources.");
  const sources = researchSourcesOutputSchema.parse(sourceArtifact.payloadJson).sources;
  const fingerprint = canonicalSha256({ stageId: "claim-map", sourceArtifactId: sourceArtifact.id, sources });
  const existingRun = workflowRunStore.findLatestByInput(projectId, "claim-map", fingerprint);
  if (existingRun?.status === "running" || existingRun?.status === "needs_review") return factoryProjectResponseSchema.parse(project);
  const runId = `stage-run-${randomUUID()}`; const now = new Date().toISOString(); const running = transitionProjectStage(transitionProjectStage(project, "claim-map", "queued"), "claim-map", "running");
  db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(running, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "claim-map", status: "running", runnerId: "claim-map-9router", runnerVersion: "claim-map-v1", providerId: "9router", inputArtifactIds: [sourceArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
  try {
    const result = await runClaimMap({ sources, credentialStore, certificationStore: textCertificationStore });
    const artifactId = `artifact-${randomUUID()}`; const finishedAt = new Date().toISOString(); const review = transitionProjectStage(running, "claim-map", "needs_review");
    db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(review, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "claim-map", status: "needs_review", runnerId: "claim-map-9router", runnerVersion: "claim-map-v1", providerId: "9router", inputArtifactIds: [sourceArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt, ...(result.returnedModelId ? { returnedModelId: result.returnedModelId } : {}) }, { id: artifactId, projectId, stageId: "claim-map", stageRunId: runId, type: "claim-map", version: workflowRunStore.listArtifacts(projectId, "claim-map").length + 1, status: "needs_review", payloadJson: result.output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
    return factoryProjectResponseSchema.parse(review);
  } catch (error) {
    const failed = transitionProjectStage(running, "claim-map", "failed"); const message = error instanceof ClaimMapError ? error.message : "Claim Map failed.";
    db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(failed, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "claim-map", status: "failed", runnerId: "claim-map-9router", runnerVersion: "claim-map-v1", providerId: "9router", inputArtifactIds: [sourceArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof ClaimMapError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); } catch (persistenceError) { db.exec("ROLLBACK;"); throw persistenceError; }
    throw new Error(message);
  }
});

ipcMain.handle("list-claim-map-artifacts", (_event, input: unknown) => { const { projectId } = claimMapRequestSchema.parse(input); return claimMapArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "claim-map").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });

ipcMain.handle("approve-claim-map", (_event, input: unknown) => {
  const { projectId } = claimMapRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "claim-map").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Claim Map exists."); const claims = claimMapOutputSchema.parse(artifact.payloadJson).claims.map(({ qualification, ...claim }) => ({ ...claim, ...(qualification ? { qualification } : {}) })); const approved = transitionProjectStage({ ...project, claims }, "claim-map", "approved"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved);
});

ipcMain.handle("run-outline", async (_event, input: unknown) => {
  const { projectId } = outlineRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); if (!project.approvedIdeaId) throw new Error("Outline requires an approved idea.");
  const ideaArtifact = workflowRunStore.listArtifacts(projectId, "idea-lab").find((artifact) => artifact.status === "approved" && artifact.payloadJson); const claimArtifact = workflowRunStore.listArtifacts(projectId, "claim-map").find((artifact) => artifact.status === "approved" && artifact.payloadJson); const profile = seedChannelProfiles.find((item) => item.id === project.profileId); if (!ideaArtifact?.payloadJson || !claimArtifact?.payloadJson || !profile) throw new Error("Outline requires approved idea, Claim Map, and channel profile.");
  const idea = ideaLabOutputSchema.parse(ideaArtifact.payloadJson).candidates.find((candidate) => candidate.id === project.approvedIdeaId); const claims = claimMapOutputSchema.parse(claimArtifact.payloadJson).claims; if (!idea || claims.some((claim) => claim.approvalState !== "allowed" || claim.state !== "verified")) throw new Error("Outline requires only allowed, verified claims.");
  const fingerprint = canonicalSha256({ stageId: "outline", ideaArtifactId: ideaArtifact.id, claimArtifactId: claimArtifact.id, profileId: profile.id, duration: project.setup.targetDuration }); const existing = workflowRunStore.findLatestByInput(projectId, "outline", fingerprint); if (existing?.status === "running" || existing?.status === "needs_review") return factoryProjectResponseSchema.parse(project);
  const runId = `stage-run-${randomUUID()}`; const now = new Date().toISOString(); const running = transitionProjectStage(transitionProjectStage(project, "outline", "queued"), "outline", "running"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(running, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "outline", status: "running", runnerId: "outline-9router", runnerVersion: "outline-v1", providerId: "9router", inputArtifactIds: [ideaArtifact.id, claimArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
  try { const result = await runOutline({ idea, claims, profile: profile as unknown as Record<string, unknown>, targetDuration: project.setup.targetDuration, credentialStore, certificationStore: textCertificationStore }); const artifactId = `artifact-${randomUUID()}`; const finishedAt = new Date().toISOString(); const review = transitionProjectStage(running, "outline", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(review, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "outline", status: "needs_review", runnerId: "outline-9router", runnerVersion: "outline-v1", providerId: "9router", inputArtifactIds: [ideaArtifact.id, claimArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt }, { id: artifactId, projectId, stageId: "outline", stageRunId: runId, type: "outline", version: workflowRunStore.listArtifacts(projectId, "outline").length + 1, status: "needs_review", payloadJson: result.output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); } catch (error) { const failed = transitionProjectStage(running, "outline", "failed"); const message = error instanceof OutlineError ? error.message : "Outline failed."; db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(failed, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "outline", status: "failed", runnerId: "outline-9router", runnerVersion: "outline-v1", providerId: "9router", inputArtifactIds: [ideaArtifact.id, claimArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof OutlineError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); } catch (persistenceError) { db.exec("ROLLBACK;"); throw persistenceError; } throw new Error(message); }
});

ipcMain.handle("list-outline-artifacts", (_event, input: unknown) => { const { projectId } = outlineRequestSchema.parse(input); return outlineArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "outline").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });

ipcMain.handle("approve-outline", (_event, input: unknown) => { const { projectId } = outlineRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "outline").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Outline exists."); outlineOutputSchema.parse(artifact.payloadJson); const approved = transitionProjectStage(project, "outline", "approved"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });

ipcMain.handle("run-script", async (_event, input: unknown) => {
  const { projectId } = scriptRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const outlineArtifact = workflowRunStore.listArtifacts(projectId, "outline").find((item) => item.status === "approved" && item.payloadJson); const claimArtifact = workflowRunStore.listArtifacts(projectId, "claim-map").find((item) => item.status === "approved" && item.payloadJson); if (!outlineArtifact?.payloadJson || !claimArtifact?.payloadJson) throw new Error("Script requires approved Outline and Claim Map."); const outline = outlineOutputSchema.parse(outlineArtifact.payloadJson); const claims = claimMapOutputSchema.parse(claimArtifact.payloadJson).claims; const fingerprint = canonicalSha256({ stageId: "script", outlineArtifactId: outlineArtifact.id, claimArtifactId: claimArtifact.id }); const existing = workflowRunStore.findLatestByInput(projectId, "script", fingerprint); if (existing?.status === "running" || existing?.status === "needs_review") return factoryProjectResponseSchema.parse(project); const runId = `stage-run-${randomUUID()}`; const now = new Date().toISOString(); const running = transitionProjectStage(transitionProjectStage(project, "script", "queued"), "script", "running"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(running, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "script", status: "running", runnerId: "script-9router", runnerVersion: "script-v1", providerId: "9router", inputArtifactIds: [outlineArtifact.id, claimArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } try { const result = await runScript({ outline, claims, credentialStore, certificationStore: textCertificationStore }); const artifactId = `artifact-${randomUUID()}`; const finishedAt = new Date().toISOString(); const review = transitionProjectStage(running, "script", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(review, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "script", status: "needs_review", runnerId: "script-9router", runnerVersion: "script-v1", providerId: "9router", inputArtifactIds: [outlineArtifact.id, claimArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt }, { id: artifactId, projectId, stageId: "script", stageRunId: runId, type: "script", version: workflowRunStore.listArtifacts(projectId, "script").length + 1, status: "needs_review", payloadJson: result.output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); } catch (error) { const failed = transitionProjectStage(running, "script", "failed"); const message = error instanceof ScriptError ? error.message : "Script failed."; db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(failed, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "script", status: "failed", runnerId: "script-9router", runnerVersion: "script-v1", providerId: "9router", inputArtifactIds: [outlineArtifact.id, claimArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof ScriptError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); } catch (persistenceError) { db.exec("ROLLBACK;"); throw persistenceError; } throw new Error(message); }
});

ipcMain.handle("approve-script", (_event, input: unknown) => { const { projectId } = scriptRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "script").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Script exists."); const sections = scriptOutputSchema.parse(artifact.payloadJson).sections.map(({ openLoop, ...section }) => ({ ...section, ...(openLoop ? { openLoop } : {}) })); const approved = transitionProjectStage({ ...project, scriptSections: sections }, "script", "approved"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });

ipcMain.handle("list-script-artifacts", (_event, input: unknown) => { const { projectId } = scriptRequestSchema.parse(input); return scriptArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "script").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });

ipcMain.handle("run-fact-review", (_event, input: unknown) => { const { projectId } = factReviewRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const scriptArtifact = workflowRunStore.listArtifacts(projectId, "script").find((item) => item.status === "approved" && item.payloadJson); if (!scriptArtifact?.payloadJson) throw new Error("Fact Review requires an approved Script."); const usedClaimIds = new Set(scriptOutputSchema.parse(scriptArtifact.payloadJson).sections.flatMap((section) => section.linkedClaimIds)); const claims = project.claims.filter((claim) => usedClaimIds.has(claim.id)); if (!claims.length) throw new Error("Fact Review requires script sections linked to approved claims."); const fingerprint = canonicalSha256({ stageId: "fact-review", scriptArtifactId: scriptArtifact.id, claims }); const existing = workflowRunStore.findLatestByInput(projectId, "fact-review", fingerprint); if (existing?.status === "running" || existing?.status === "needs_review") return factoryProjectResponseSchema.parse(project); const runId = `stage-run-${randomUUID()}`; const artifactId = `artifact-${randomUUID()}`; const now = new Date().toISOString(); const findings = reviewFacts(claims); const output = factReviewOutputSchema.parse({ reviewer: "local_deterministic", findings }); const review = transitionProjectStage(transitionProjectStage(transitionProjectStage(project, "fact-review", "queued"), "fact-review", "running"), "fact-review", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(review, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "fact-review", status: "running", runnerId: "fact-review-local", runnerVersion: "fact-review-v1", inputArtifactIds: [scriptArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "fact-review", status: "needs_review", runnerId: "fact-review-local", runnerVersion: "fact-review-v1", inputArtifactIds: [scriptArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt: now }, { id: artifactId, projectId, stageId: "fact-review", stageRunId: runId, type: "fact-review", version: workflowRunStore.listArtifacts(projectId, "fact-review").length + 1, status: "needs_review", payloadJson: output, createdAt: now, updatedAt: now }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); });

ipcMain.handle("list-fact-review-artifacts", (_event, input: unknown) => { const { projectId } = factReviewRequestSchema.parse(input); return factReviewArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "fact-review").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });

ipcMain.handle("approve-fact-review", (_event, input: unknown) => { const { projectId } = factReviewRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "fact-review").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Fact Review exists."); const output = factReviewOutputSchema.parse(artifact.payloadJson); if (output.findings.some((finding) => finding.verdict === "blocked")) throw new Error("Blocked fact-review findings must be resolved before approval."); const approved = transitionProjectStage(project, "fact-review", "approved"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });

ipcMain.handle("run-retention-review", async (_event, input: unknown) => { const { projectId } = retentionReviewRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const scriptArtifact = workflowRunStore.listArtifacts(projectId, "script").find((item) => item.status === "approved" && item.payloadJson); const factArtifact = workflowRunStore.listArtifacts(projectId, "fact-review").find((item) => item.status === "approved" && item.payloadJson); if (!scriptArtifact?.payloadJson || !factArtifact?.payloadJson) throw new Error("Retention Review requires approved Script and Fact Review."); const script = scriptOutputSchema.parse(scriptArtifact.payloadJson); const fingerprint = canonicalSha256({ stageId: "retention-review", scriptArtifactId: scriptArtifact.id, factArtifactId: factArtifact.id }); const existing = workflowRunStore.findLatestByInput(projectId, "retention-review", fingerprint); if (existing?.status === "running" || existing?.status === "needs_review") return factoryProjectResponseSchema.parse(project); const runId = `stage-run-${randomUUID()}`; const now = new Date().toISOString(); const running = transitionProjectStage(transitionProjectStage(project, "retention-review", "queued"), "retention-review", "running"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(running, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "retention-review", status: "running", runnerId: "retention-review-9router", runnerVersion: "retention-review-v1", providerId: "9router", inputArtifactIds: [scriptArtifact.id, factArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } try { const result = await runRetentionReview({ script, credentialStore, certificationStore: textCertificationStore }); const artifactId = `artifact-${randomUUID()}`; const finishedAt = new Date().toISOString(); const review = transitionProjectStage(running, "retention-review", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(review, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "retention-review", status: "needs_review", runnerId: "retention-review-9router", runnerVersion: "retention-review-v1", providerId: "9router", inputArtifactIds: [scriptArtifact.id, factArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt }, { id: artifactId, projectId, stageId: "retention-review", stageRunId: runId, type: "retention-review", version: workflowRunStore.listArtifacts(projectId, "retention-review").length + 1, status: "needs_review", payloadJson: result.output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); } catch (error) { const failed = transitionProjectStage(running, "retention-review", "failed"); const message = error instanceof RetentionReviewError ? error.message : "Retention Review failed."; db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(failed, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "retention-review", status: "failed", runnerId: "retention-review-9router", runnerVersion: "retention-review-v1", providerId: "9router", inputArtifactIds: [scriptArtifact.id, factArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof RetentionReviewError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); } catch (persistenceError) { db.exec("ROLLBACK;"); throw persistenceError; } throw new Error(message); } });

ipcMain.handle("list-retention-review-artifacts", (_event, input: unknown) => { const { projectId } = retentionReviewRequestSchema.parse(input); return retentionReviewArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "retention-review").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });

ipcMain.handle("approve-retention-review", (_event, input: unknown) => { const { projectId } = retentionReviewRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "retention-review").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Retention Review exists."); const output = retentionReviewOutputSchema.parse(artifact.payloadJson); if (output.overallVerdict === "blocked") throw new Error("Blocked Retention Review findings must be resolved before approval."); const approved = transitionProjectStage(project, "retention-review", "approved"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });

ipcMain.handle("run-scene-plan", async (_event, input: unknown) => { const { projectId } = scenePlanRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const scriptArtifact = workflowRunStore.listArtifacts(projectId, "script").find((item) => item.status === "approved" && item.payloadJson); const retentionArtifact = workflowRunStore.listArtifacts(projectId, "retention-review").find((item) => item.status === "approved" && item.payloadJson); if (!scriptArtifact?.payloadJson || !retentionArtifact?.payloadJson) throw new Error("Scene Plan requires approved Script and Retention Review."); const script = scriptOutputSchema.parse(scriptArtifact.payloadJson); const fingerprint = canonicalSha256({ stageId: "scene-plan", scriptArtifactId: scriptArtifact.id, retentionArtifactId: retentionArtifact.id, fps: project.timeline.fps }); const existing = workflowRunStore.findLatestByInput(projectId, "scene-plan", fingerprint); if (existing?.status === "running" || existing?.status === "needs_review") return factoryProjectResponseSchema.parse(project); const runId = `stage-run-${randomUUID()}`; const running = transitionProjectStage(transitionProjectStage(project, "scene-plan", "queued"), "scene-plan", "running"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(running, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "scene-plan", status: "running", runnerId: "scene-plan-9router", runnerVersion: "scene-plan-v1", providerId: "9router", inputArtifactIds: [scriptArtifact.id, retentionArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: new Date().toISOString() }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } try { const result = await runScenePlan({ script, fps: project.timeline.fps, credentialStore, certificationStore: textCertificationStore }); const artifactId = `artifact-${randomUUID()}`; const finishedAt = new Date().toISOString(); const review = transitionProjectStage(running, "scene-plan", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(review, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "scene-plan", status: "needs_review", runnerId: "scene-plan-9router", runnerVersion: "scene-plan-v1", providerId: "9router", inputArtifactIds: [scriptArtifact.id, retentionArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt }, { id: artifactId, projectId, stageId: "scene-plan", stageRunId: runId, type: "scene-plan", version: workflowRunStore.listArtifacts(projectId, "scene-plan").length + 1, status: "needs_review", payloadJson: result.output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); } catch (error) { const failed = transitionProjectStage(running, "scene-plan", "failed"); const message = error instanceof ScenePlanError ? error.message : "Scene Plan failed."; db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(failed, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "scene-plan", status: "failed", runnerId: "scene-plan-9router", runnerVersion: "scene-plan-v1", providerId: "9router", inputArtifactIds: [scriptArtifact.id, retentionArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof ScenePlanError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); } catch (persistenceError) { db.exec("ROLLBACK;"); throw persistenceError; } throw new Error(message); } });

ipcMain.handle("list-scene-plan-artifacts", (_event, input: unknown) => { const { projectId } = scenePlanRequestSchema.parse(input); return scenePlanArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "scene-plan").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });
ipcMain.handle("approve-scene-plan", (_event, input: unknown) => { const { projectId } = scenePlanRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "scene-plan").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Scene Plan exists."); const scenes = scenePlanOutputSchema.parse(artifact.payloadJson).scenes.map(({ proofObject, ...scene }) => ({ ...scene, ...(proofObject ? { proofObject } : {}) })); const approved = transitionProjectStage({ ...project, scenes }, "scene-plan", "approved"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });

ipcMain.handle("run-shot-plan", async (_event, input: unknown) => { const { projectId } = shotPlanRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const sceneArtifact = workflowRunStore.listArtifacts(projectId, "scene-plan").find((item) => item.status === "approved" && item.payloadJson); if (!sceneArtifact?.payloadJson) throw new Error("Shot Plan requires an approved Scene Plan."); const scenePlan = scenePlanOutputSchema.parse(sceneArtifact.payloadJson); const fingerprint = canonicalSha256({ stageId: "shot-plan", sceneArtifactId: sceneArtifact.id, fps: project.timeline.fps }); const existing = workflowRunStore.findLatestByInput(projectId, "shot-plan", fingerprint); if (existing?.status === "running" || existing?.status === "needs_review") return factoryProjectResponseSchema.parse(project); const runId = `stage-run-${randomUUID()}`; const running = transitionProjectStage(transitionProjectStage(project, "shot-plan", "queued"), "shot-plan", "running"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(running, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "shot-plan", status: "running", runnerId: "shot-plan-9router", runnerVersion: "shot-plan-v1", providerId: "9router", inputArtifactIds: [sceneArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: new Date().toISOString() }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } try { const result = await runShotPlan({ scenes: scenePlan.scenes, fps: project.timeline.fps, credentialStore, certificationStore: textCertificationStore }); const artifactId = `artifact-${randomUUID()}`; const finishedAt = new Date().toISOString(); const review = transitionProjectStage(running, "shot-plan", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(review, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "shot-plan", status: "needs_review", runnerId: "shot-plan-9router", runnerVersion: "shot-plan-v1", providerId: "9router", inputArtifactIds: [sceneArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt }, { id: artifactId, projectId, stageId: "shot-plan", stageRunId: runId, type: "shot-plan", version: workflowRunStore.listArtifacts(projectId, "shot-plan").length + 1, status: "needs_review", payloadJson: result.output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); } catch (error) { const failed = transitionProjectStage(running, "shot-plan", "failed"); const message = error instanceof ShotPlanError ? error.message : "Shot Plan failed."; db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(failed, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "shot-plan", status: "failed", runnerId: "shot-plan-9router", runnerVersion: "shot-plan-v1", providerId: "9router", inputArtifactIds: [sceneArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof ShotPlanError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); } catch (persistenceError) { db.exec("ROLLBACK;"); throw persistenceError; } throw new Error(message); } });

ipcMain.handle("list-shot-plan-artifacts", (_event, input: unknown) => { const { projectId } = shotPlanRequestSchema.parse(input); return shotPlanArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "shot-plan").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });
ipcMain.handle("approve-shot-plan", (_event, input: unknown) => { const { projectId } = shotPlanRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "shot-plan").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Shot Plan exists."); const shots = shotPlanOutputSchema.parse(artifact.payloadJson).shots; const approved = transitionProjectStage({ ...project, shots }, "shot-plan", "approved"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });

ipcMain.handle("run-visual-routing", (_event, input: unknown) => { const { projectId } = visualRoutingRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const shotArtifact = workflowRunStore.listArtifacts(projectId, "shot-plan").find((item) => item.status === "approved" && item.payloadJson); if (!shotArtifact?.payloadJson) throw new Error("Visual Routing requires an approved Shot Plan."); const shots = shotPlanOutputSchema.parse(shotArtifact.payloadJson).shots; const fingerprint = canonicalSha256({ stageId: "visual-routing", shotArtifactId: shotArtifact.id }); const existing = workflowRunStore.findLatestByInput(projectId, "visual-routing", fingerprint); if (existing?.status === "running" || existing?.status === "needs_review") return factoryProjectResponseSchema.parse(project); const runId = `stage-run-${randomUUID()}`; const artifactId = `artifact-${randomUUID()}`; const now = new Date().toISOString(); const output = visualRoutingOutputSchema.parse({ shots: applyVisualRouting(shots) }); const review = transitionProjectStage(transitionProjectStage(transitionProjectStage(project, "visual-routing", "queued"), "visual-routing", "running"), "visual-routing", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(review, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "visual-routing", status: "running", runnerId: "visual-routing-local", runnerVersion: "visual-routing-v1", inputArtifactIds: [shotArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "visual-routing", status: "needs_review", runnerId: "visual-routing-local", runnerVersion: "visual-routing-v1", inputArtifactIds: [shotArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt: now }, { id: artifactId, projectId, stageId: "visual-routing", stageRunId: runId, type: "visual-routing", version: workflowRunStore.listArtifacts(projectId, "visual-routing").length + 1, status: "needs_review", payloadJson: output, createdAt: now, updatedAt: now }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); });
ipcMain.handle("list-visual-routing-artifacts", (_event, input: unknown) => { const { projectId } = visualRoutingRequestSchema.parse(input); return visualRoutingArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "visual-routing").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });
ipcMain.handle("edit-visual-routing", (_event, input: unknown) => { const { projectId, artifactId, shotId, visualMode } = editVisualRoutingRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const source = workflowRunStore.listArtifacts(projectId, "visual-routing").find((item) => item.id === artifactId && item.status === "needs_review"); if (!source?.stageRunId || !source.payloadJson) throw new Error("Visual Routing revision must start from a reviewable artifact."); const current = visualRoutingOutputSchema.parse(source.payloadJson); if (!current.shots.some((shot) => shot.id === shotId)) throw new Error("Shot is not present in the Visual Routing artifact."); const output = visualRoutingOutputSchema.parse({ shots: current.shots.map((shot) => shot.id === shotId ? { ...shot, visualMode } : shot) }); const fingerprint = canonicalSha256({ stageId: "visual-routing", sourceArtifactId: source.id, shotId, visualMode }); const existing = workflowRunStore.findLatestByInput(projectId, "visual-routing", fingerprint); if (existing?.status === "needs_review") return factoryProjectResponseSchema.parse(project); const runId = `stage-run-${randomUUID()}`; const nextArtifactId = `artifact-${randomUUID()}`; const now = new Date().toISOString(); db.exec("BEGIN IMMEDIATE;"); try { workflowRunStore.rejectReviewRun(source.stageRunId); workflowRunStore.createRun({ id: runId, projectId, stageId: "visual-routing", status: "running", runnerId: "visual-routing-user-edit", runnerVersion: "visual-routing-v1", inputArtifactIds: [source.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "visual-routing", status: "needs_review", runnerId: "visual-routing-user-edit", runnerVersion: "visual-routing-v1", inputArtifactIds: [source.id], inputFingerprint: fingerprint, outputArtifactIds: [nextArtifactId], finishedAt: now }, { id: nextArtifactId, projectId, stageId: "visual-routing", stageRunId: runId, type: "visual-routing", version: workflowRunStore.listArtifacts(projectId, "visual-routing").length + 1, status: "needs_review", payloadJson: output, createdAt: now, updatedAt: now }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(project); });
ipcMain.handle("approve-visual-routing", (_event, input: unknown) => { const { projectId } = visualRoutingRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "visual-routing").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Visual Routing exists."); const shots = visualRoutingOutputSchema.parse(artifact.payloadJson).shots; const approved = transitionProjectStage({ ...project, shots }, "visual-routing", "approved"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });

ipcMain.handle("run-prompt-preparation", async (_event, input: unknown) => { const { projectId } = promptPreparationRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const routingArtifact = workflowRunStore.listArtifacts(projectId, "visual-routing").find((item) => item.status === "approved" && item.payloadJson); if (!routingArtifact?.payloadJson) throw new Error("Prompt Preparation requires approved Visual Routing."); const routing = visualRoutingOutputSchema.parse(routingArtifact.payloadJson); const aspectRatio = project.format === "short" ? "9:16" : "16:9" as const; const fingerprint = canonicalSha256({ stageId: "prompt-preparation", visualRoutingArtifactId: routingArtifact.id, aspectRatio }); const existing = workflowRunStore.findLatestByInput(projectId, "prompt-preparation", fingerprint); if (existing?.status === "running" || existing?.status === "needs_review") return factoryProjectResponseSchema.parse(project); const runId = `stage-run-${randomUUID()}`; const running = transitionProjectStage(transitionProjectStage(project, "prompt-preparation", "queued"), "prompt-preparation", "running"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(running, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "prompt-preparation", status: "running", runnerId: "prompt-preparation-9router", runnerVersion: "prompt-preparation-v1", providerId: "9router", promptTemplateId: "visual-prompt-v1", promptVersion: "v1", inputArtifactIds: [routingArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: new Date().toISOString() }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } try { const result = await runPromptPreparation({ shots: routing.shots, aspectRatio, credentialStore, certificationStore: textCertificationStore }); const artifactId = `artifact-${randomUUID()}`; const finishedAt = new Date().toISOString(); const review = transitionProjectStage(running, "prompt-preparation", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(review, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "prompt-preparation", status: "needs_review", runnerId: "prompt-preparation-9router", runnerVersion: "prompt-preparation-v1", providerId: "9router", promptTemplateId: "visual-prompt-v1", promptVersion: "v1", inputArtifactIds: [routingArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt, ...(result.returnedModelId ? { returnedModelId: result.returnedModelId } : {}) }, { id: artifactId, projectId, stageId: "prompt-preparation", stageRunId: runId, type: "visual-prompts", version: workflowRunStore.listArtifacts(projectId, "prompt-preparation").length + 1, status: "needs_review", payloadJson: result.output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); } catch (error) { const failed = transitionProjectStage(running, "prompt-preparation", "failed"); const message = error instanceof PromptPreparationError ? error.message : "Prompt Preparation failed."; db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(failed, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "prompt-preparation", status: "failed", runnerId: "prompt-preparation-9router", runnerVersion: "prompt-preparation-v1", providerId: "9router", inputArtifactIds: [routingArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof PromptPreparationError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); } catch (persistenceError) { db.exec("ROLLBACK;"); throw persistenceError; } throw new Error(message); } });
ipcMain.handle("list-prompt-preparation-artifacts", (_event, input: unknown) => { const { projectId } = promptPreparationRequestSchema.parse(input); return promptPreparationArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "prompt-preparation").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });
ipcMain.handle("approve-prompt-preparation", (_event, input: unknown) => { const { projectId } = promptPreparationRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "prompt-preparation").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Prompt Preparation exists."); const prompts = promptPreparationOutputSchema.parse(artifact.payloadJson).prompts; const promptVersions = new Map(prompts.map((prompt) => [prompt.shotId, prompt.promptVersionId])); const approved = transitionProjectStage({ ...project, shots: project.shots.map((shot) => promptVersions.has(shot.id) ? { ...shot, promptVersionId: promptVersions.get(shot.id)! } : shot) }, "prompt-preparation", "approved"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });

ipcMain.handle("load-9router-image-certification", async () => loadNineRouterImageCertification({ credentialStore, certificationStore: imageCertificationStore }));
ipcMain.handle("run-9router-image-certification", async (_event, input: unknown) => {
  const { confirmation } = run9RouterImageCertificationRequestSchema.parse(input);
  if (confirmation !== "Run 1 image certification request") throw new Error("Image certification requires explicit confirmation.");
  return runNineRouterImageCertification({ credentialStore, certificationStore: imageCertificationStore, logger });
});
ipcMain.handle("run-asset-acquisition", async (_event, input: unknown) => {
  const { projectId } = assetAcquisitionRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`);
  const promptArtifact = workflowRunStore.listArtifacts(projectId, "prompt-preparation").find((item) => item.status === "approved" && item.payloadJson); if (!promptArtifact?.payloadJson) throw new Error("Asset Acquisition requires approved Prompt Preparation.");
  const prompts = promptPreparationOutputSchema.parse(promptArtifact.payloadJson).prompts; const imagePrompts = prompts.filter((prompt) => project.shots.some((shot) => shot.id === prompt.shotId && shot.visualMode === "ai_image" && shot.promptVersionId === prompt.promptVersionId));
  if (imagePrompts.length === 0) throw new Error("Asset Acquisition requires at least one approved AI image prompt.");
  const certification = await loadNineRouterImageCertification({ credentialStore, certificationStore: imageCertificationStore }); if (certification.status !== "verified") throw new Error("A verified image-model certification is required before Asset Acquisition can run.");
  const fingerprint = canonicalSha256({ stageId: "asset-acquisition", promptArtifactId: promptArtifact.id, imageCertificationId: certification.record?.id, promptIds: imagePrompts.map((prompt) => prompt.promptVersionId) }); const existing = workflowRunStore.findLatestByInput(projectId, "asset-acquisition", fingerprint); if (existing?.status === "running" || existing?.status === "needs_review") return factoryProjectResponseSchema.parse(project);
  const settings = credentialStore.loadProviderCredentialSettings("9router"); const apiKey = await credentialStore.resolveProviderSecret("9router"); if (!settings?.imageModel || !apiKey) throw new Error("The selected image model or credential is unavailable."); const imageModel = settings.imageModel; const imageBaseUrl = settings.baseUrl; const runId = `stage-run-${randomUUID()}`; const running = transitionProjectStage(transitionProjectStage(project, "asset-acquisition", "queued"), "asset-acquisition", "running");
  db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(running, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "asset-acquisition", status: "running", runnerId: "asset-acquisition-9router", runnerVersion: "asset-acquisition-v1", providerId: "9router", configuredModelId: imageModel, inputArtifactIds: [promptArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: new Date().toISOString() }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
  try {
    const assets = [];
    for (const prompt of imagePrompts) {
      const jobKey = canonicalSha256({ stageId: "asset-acquisition", projectId, shotId: prompt.shotId, promptVersionId: prompt.promptVersionId, imageModel, aspectRatio: prompt.aspectRatio });
      const savedJob = generationJobStore.findByIdempotencyKey(jobKey);
      const priorAsset = savedJob?.state === "succeeded" ? acquiredImageAssetSchema.safeParse(savedJob.payload.asset) : null;
      if (priorAsset?.success) { assets.push(priorAsset.data); continue; }
      const jobId = savedJob?.id ?? `generation-job-${randomUUID()}`;
      const jobPayload = { stageRunId: runId, promptVersionId: prompt.promptVersionId, model: imageModel, shotId: prompt.shotId };
      if (savedJob) generationJobStore.restart(jobId, jobPayload); else generationJobStore.create({ id: jobId, projectId, shotId: prompt.shotId, idempotencyKey: jobKey, state: "running", payload: jobPayload });
      try {
        const asset = await acquireImageAsset({ projectId, shotId: prompt.shotId, promptVersionId: prompt.promptVersionId, idempotencyKey: jobKey, positivePrompt: prompt.positivePrompt, aspectRatio: prompt.aspectRatio, imageModel, apiKey, baseUrl: imageBaseUrl, imageCapabilityVerified: true, workspaceRoot });
        generationJobStore.finish(jobId, "succeeded", { ...jobPayload, asset }); assets.push(asset);
      } catch (error) {
        generationJobStore.finish(jobId, "failed", { ...jobPayload, errorCategory: error instanceof AssetAcquisitionError ? error.category : "unexpected_failure" }); throw error;
      }
    }
    const output = assetAcquisitionOutputSchema.parse({ assets }); const artifactId = `artifact-${randomUUID()}`; const finishedAt = new Date().toISOString(); const review = transitionProjectStage(running, "asset-acquisition", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(review, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "asset-acquisition", status: "needs_review", runnerId: "asset-acquisition-9router", runnerVersion: "asset-acquisition-v1", providerId: "9router", configuredModelId: imageModel, inputArtifactIds: [promptArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt }, { id: artifactId, projectId, stageId: "asset-acquisition", stageRunId: runId, type: "asset", version: workflowRunStore.listArtifacts(projectId, "asset-acquisition").length + 1, status: "needs_review", payloadJson: output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); } catch (error) { const failed = transitionProjectStage(running, "asset-acquisition", "failed"); const message = error instanceof AssetAcquisitionError ? error.message : "Asset Acquisition failed."; db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(failed, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "asset-acquisition", status: "failed", runnerId: "asset-acquisition-9router", runnerVersion: "asset-acquisition-v1", providerId: "9router", configuredModelId: imageModel, inputArtifactIds: [promptArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof AssetAcquisitionError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); } catch (persistenceError) { db.exec("ROLLBACK;"); throw persistenceError; } throw new Error(message); }
});
ipcMain.handle("list-asset-acquisition-artifacts", (_event, input: unknown) => { const { projectId } = assetAcquisitionRequestSchema.parse(input); return assetAcquisitionArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "asset-acquisition").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });
ipcMain.handle("approve-asset-acquisition", (_event, input: unknown) => { const { projectId } = assetAcquisitionRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "asset-acquisition").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId) throw new Error("No reviewable Asset Acquisition output exists."); const approved = transitionProjectStage(project, "asset-acquisition", "approved"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });

ipcMain.handle("run-asset-review", (_event, input: unknown) => { const { projectId } = assetReviewRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const acquisition = workflowRunStore.listArtifacts(projectId, "asset-acquisition").find((item) => item.status === "approved" && item.payloadJson); if (!acquisition?.payloadJson) throw new Error("Asset Review requires approved Asset Acquisition."); const assets = assetAcquisitionOutputSchema.parse(acquisition.payloadJson).assets; const fingerprint = canonicalSha256({ stageId: "asset-review", acquisitionArtifactId: acquisition.id }); const existing = workflowRunStore.findLatestByInput(projectId, "asset-review", fingerprint); if (existing?.status === "needs_review") return factoryProjectResponseSchema.parse(project); const runId = `stage-run-${randomUUID()}`; const artifactId = `artifact-${randomUUID()}`; const now = new Date().toISOString(); const output = assetReviewOutputSchema.parse({ acquisitionArtifactId: acquisition.id, assets: assets.map((asset) => ({ asset, reviewStatus: "needs_review" })) }); const review = transitionProjectStage(transitionProjectStage(transitionProjectStage(project, "asset-review", "queued"), "asset-review", "running"), "asset-review", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(review, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "asset-review", status: "running", runnerId: "asset-review-local", runnerVersion: "asset-review-v1", inputArtifactIds: [acquisition.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "asset-review", status: "needs_review", runnerId: "asset-review-local", runnerVersion: "asset-review-v1", inputArtifactIds: [acquisition.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt: now }, { id: artifactId, projectId, stageId: "asset-review", stageRunId: runId, type: "asset-review", version: workflowRunStore.listArtifacts(projectId, "asset-review").length + 1, status: "needs_review", payloadJson: output, createdAt: now, updatedAt: now }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); });
ipcMain.handle("list-asset-review-artifacts", (_event, input: unknown) => { const { projectId } = assetReviewRequestSchema.parse(input); return assetReviewArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "asset-review").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });
ipcMain.handle("revise-asset-review", (_event, input: unknown) => { const request = reviseAssetReviewRequestSchema.parse(input); const project = projectRepository.loadProject(request.projectId); if (!project) throw new Error(`Project not found: ${request.projectId}`); const source = workflowRunStore.listArtifacts(request.projectId, "asset-review").find((item) => item.id === request.artifactId && item.status === "needs_review"); if (!source?.stageRunId || !source.payloadJson) throw new Error("Asset Review revision must start from a reviewable artifact."); const current = assetReviewOutputSchema.parse(source.payloadJson); const selected = current.assets.find((item) => item.asset.sha256 === request.assetSha256); if (!selected) throw new Error("Asset is not present in the review artifact."); if (request.action === "assign" && (!request.shotId || request.shotId !== selected.asset.shotId)) throw new Error("An asset can only be assigned to its explicitly mapped shot."); if (request.action === "assign" && selected.reviewStatus !== "approved") throw new Error("Approve an asset before assigning it."); const assets = current.assets.map((item) => { if (item.asset.sha256 !== request.assetSha256) return item; if (request.action === "approve") return { ...item, reviewStatus: "approved" as const }; if (request.action === "reject") return { ...item, reviewStatus: "rejected" as const, assignedShotId: undefined }; if (request.action === "assign") return { ...item, assignedShotId: request.shotId! }; return { ...item, assignedShotId: undefined }; }); const output = assetReviewOutputSchema.parse({ ...current, assets }); const fingerprint = canonicalSha256({ stageId: "asset-review", sourceArtifactId: source.id, assetSha256: request.assetSha256, action: request.action, ...(request.shotId ? { shotId: request.shotId } : {}) }); const runId = `stage-run-${randomUUID()}`; const artifactId = `artifact-${randomUUID()}`; const now = new Date().toISOString(); db.exec("BEGIN IMMEDIATE;"); try { workflowRunStore.rejectReviewRun(source.stageRunId); workflowRunStore.createRun({ id: runId, projectId: request.projectId, stageId: "asset-review", status: "running", runnerId: "asset-review-user-action", runnerVersion: "asset-review-v1", inputArtifactIds: [source.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); workflowRunStore.finishRun({ id: runId, projectId: request.projectId, stageId: "asset-review", status: "needs_review", runnerId: "asset-review-user-action", runnerVersion: "asset-review-v1", inputArtifactIds: [source.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt: now }, { id: artifactId, projectId: request.projectId, stageId: "asset-review", stageRunId: runId, type: "asset-review", version: workflowRunStore.listArtifacts(request.projectId, "asset-review").length + 1, status: "needs_review", payloadJson: output, createdAt: now, updatedAt: now }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(project); });
ipcMain.handle("approve-asset-review", (_event, input: unknown) => { const { projectId } = assetReviewRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "asset-review").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Asset Review exists."); const output = assetReviewOutputSchema.parse(artifact.payloadJson); if (output.assets.some((item) => item.reviewStatus !== "approved" || !item.assignedShotId)) throw new Error("Approve and explicitly assign every generated asset before completing Asset Review."); const assignments = new Map(output.assets.map((item) => [item.assignedShotId!, `asset-${item.asset.sha256}`])); const approved = transitionProjectStage({ ...project, shots: project.shots.map((shot) => assignments.has(shot.id) ? { ...shot, approvedAssetId: assignments.get(shot.id)! } : shot) }, "asset-review", "approved"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });

ipcMain.handle("select-manual-asset-upload", async (_event, input: unknown) => {
  const request = manualAssetUploadRequestSchema.parse(input); const project = projectRepository.loadProject(request.projectId); if (!project) throw new Error(`Project not found: ${request.projectId}`);
  const source = workflowRunStore.listArtifacts(request.projectId, "asset-review").find((item) => item.id === request.artifactId && item.status === "needs_review"); if (!source?.stageRunId || !source.payloadJson) throw new Error("Manual Upload must start from a reviewable Asset Review artifact.");
  const shot = project.shots.find((item) => item.id === request.shotId); if (!shot || (shot.visualMode !== "manual_upload" && shot.visualMode !== "uploaded")) throw new Error("Manual Upload is only available for a manually routed shot.");
  const selected = await dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }] }); if (selected.canceled || !selected.filePaths[0]) return factoryProjectResponseSchema.parse(project);
  const asset = await importLocalImageAsset({ projectId: request.projectId, shotId: request.shotId, workspaceRoot, sourcePath: selected.filePaths[0] }); const current = assetReviewOutputSchema.parse(source.payloadJson); if (current.assets.some((item) => item.asset.sha256 === asset.sha256)) throw new Error("That image is already present in this review.");
  const output = assetReviewOutputSchema.parse({ ...current, assets: [...current.assets, { asset, reviewStatus: "needs_review" }] }); const runId = `stage-run-${randomUUID()}`; const artifactId = `artifact-${randomUUID()}`; const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE;"); try { workflowRunStore.rejectReviewRun(source.stageRunId); workflowRunStore.createRun({ id: runId, projectId: request.projectId, stageId: "asset-review", status: "running", runnerId: "asset-review-manual-upload", runnerVersion: "asset-review-v1", inputArtifactIds: [source.id], inputFingerprint: canonicalSha256({ stageId: "asset-review", sourceArtifactId: source.id, manualUploadSha256: asset.sha256, shotId: request.shotId }), outputArtifactIds: [], startedAt: now }); workflowRunStore.finishRun({ id: runId, projectId: request.projectId, stageId: "asset-review", status: "needs_review", runnerId: "asset-review-manual-upload", runnerVersion: "asset-review-v1", inputArtifactIds: [source.id], inputFingerprint: canonicalSha256({ stageId: "asset-review", sourceArtifactId: source.id, manualUploadSha256: asset.sha256, shotId: request.shotId }), outputArtifactIds: [artifactId], finishedAt: now }, { id: artifactId, projectId: request.projectId, stageId: "asset-review", stageRunId: runId, type: "asset-review", version: workflowRunStore.listArtifacts(request.projectId, "asset-review").length + 1, status: "needs_review", payloadJson: output, createdAt: now, updatedAt: now }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
  return factoryProjectResponseSchema.parse(project);
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
      projectRepository.saveProject(failed, { withinTransaction: true });
      workflowRunStore.finishRun({ ...run, status: "failed", outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: "tts_cancelled", safeErrorMessage: "Voice Generation was cancelled." }, undefined, { withinTransaction: true });
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
    return;
  }

  const failedSegments = job.segments.filter((segment) => segment.state === "failed");
  if (failedSegments.length) return;
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
      projectRepository.saveProject(review, { withinTransaction: true });
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
      projectRepository.saveProject(failed, { withinTransaction: true });
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
  const scriptArtifact = workflowRunStore.listArtifacts(projectId, "script").find((item) => item.status === "approved" && item.payloadJson);
  if (!scriptArtifact?.payloadJson) throw new Error("Voice Generation requires an approved Script.");
  const assetReviewArtifact = workflowRunStore.listArtifacts(projectId, "asset-review").find((item) => item.status === "approved");
  if (!assetReviewArtifact || project.shots.some((shot) => shot.visualMode === "ai_image" && !shot.approvedAssetId)) throw new Error("Voice Generation requires approved, assigned assets.");

  const settings = loadLocalTtsSettings();
  const provider = configuredTtsProvider(settings);
  if (!settings.available) throw new Error(`Selected TTS provider (${provider}) is not configured or available. No fallback voice provider will be used.`);
  const voiceId = provider === "omnivoice-local" ? "omnivoice-local" : settings.ttsVoiceId ?? defaultVoiceForProvider(provider, settings.language ?? "vi");
  if (!voiceId) throw new Error("Select a voice before starting Voice Generation.");
  const script = scriptOutputSchema.parse(scriptArtifact.payloadJson);
  const fingerprint = canonicalSha256({ stageId: "voice-generation", scriptArtifactId: scriptArtifact.id, assetReviewArtifactId: assetReviewArtifact.id, provider, voiceId, rate: settings.ttsRate ?? 1, fallbackEnabled: settings.ttsFallbackEnabled ?? false, fallbackOrder: settings.ttsFallbackOrder ?? [], sections: script.sections.map((section) => section.id) });
  const existing = workflowRunStore.findLatestByInput(projectId, "voice-generation", fingerprint);
  if (existing?.status === "running" || existing?.status === "needs_review") return factoryProjectResponseSchema.parse(project);

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
    projectRepository.saveProject(running, { withinTransaction: true });
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
ipcMain.handle("approve-voice-generation", (_event, input: unknown) => { const { projectId } = voiceGenerationRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "voice-generation").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Voice Generation output exists."); voiceGenerationOutputSchema.parse(artifact.payloadJson); const approved = transitionProjectStage(project, "voice-generation", "approved"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });

ipcMain.handle("run-subtitle-preparation", (_event, input: unknown) => {
  const { projectId } = subtitlePreparationRequestSchema.parse(input);
  const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const scriptArtifact = workflowRunStore.listArtifacts(projectId, "script").find((item) => item.status === "approved" && item.payloadJson);
  const voiceArtifact = workflowRunStore.listArtifacts(projectId, "voice-generation").find((item) => item.status === "approved" && item.payloadJson);
  if (!scriptArtifact?.payloadJson || !voiceArtifact?.payloadJson) throw new Error("Subtitle Preparation requires approved Script and Voice Generation.");
  const script = scriptOutputSchema.parse(scriptArtifact.payloadJson);
  const voice = voiceGenerationOutputSchema.parse(voiceArtifact.payloadJson);
  const fps = project.timeline.fps;
  const fingerprint = canonicalSha256({ stageId: "subtitle-preparation", scriptArtifactId: scriptArtifact.id, voiceArtifactId: voiceArtifact.id, fps });
  const existing = workflowRunStore.findLatestByInput(projectId, "subtitle-preparation", fingerprint);
  if (existing?.status === "needs_review") return factoryProjectResponseSchema.parse(project);

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
    projectRepository.saveProject(review, { withinTransaction: true });
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
ipcMain.handle("approve-subtitle-preparation", (_event, input: unknown) => { const { projectId } = subtitlePreparationRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "subtitle-preparation").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Subtitle Preparation output exists."); subtitlePreparationOutputSchema.parse(artifact.payloadJson); const approved = transitionProjectStage(project, "subtitle-preparation", "approved"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });

ipcMain.handle("run-timeline-assembly", (_event, input: unknown) => {
  const { projectId } = timelineAssemblyRequestSchema.parse(input);
  const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const assetReview = workflowRunStore.listArtifacts(projectId, "asset-review").find((item) => item.status === "approved" && item.payloadJson);
  const voice = workflowRunStore.listArtifacts(projectId, "voice-generation").find((item) => item.status === "approved" && item.payloadJson);
  const subtitles = workflowRunStore.listArtifacts(projectId, "subtitle-preparation").find((item) => item.status === "approved" && item.payloadJson);
  if (!assetReview?.payloadJson || !voice?.payloadJson || !subtitles?.payloadJson) throw new Error("Timeline Assembly requires approved Asset Review, Voice Generation, and Subtitle Preparation.");
  const reviewed = assetReviewOutputSchema.parse(assetReview.payloadJson);
  const voiceOutput = voiceGenerationOutputSchema.parse(voice.payloadJson);
  const subtitleOutput = subtitlePreparationOutputSchema.parse(subtitles.payloadJson);
  const fps = project.timeline.fps;
  if (subtitleOutput.fps !== fps) throw new Error("Subtitle timing FPS does not match the project timeline.");

  const approvedAssets = new Map(reviewed.assets.filter((item) => item.reviewStatus === "approved" && item.assignedShotId).map((item) => [item.assignedShotId!, item.asset]));
  const visuals = [...project.shots].sort((a, b) => a.startFrame - b.startFrame).map((shot) => {
    const asset = approvedAssets.get(shot.id);
    if (!asset || !shot.approvedAssetId || !existsSync(join(workspaceRoot, asset.relativeFilePath))) throw new Error(`Approved asset is missing for shot ${shot.id}.`);
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
  if (existing?.status === "needs_review") return factoryProjectResponseSchema.parse(project);
  const runId = `stage-run-${randomUUID()}`;
  const artifactId = `artifact-${randomUUID()}`;
  const now = new Date().toISOString();
  const review = transitionProjectStage(transitionProjectStage(transitionProjectStage(project, "timeline-assembly", "queued"), "timeline-assembly", "running"), "timeline-assembly", "needs_review");
  db.exec("BEGIN IMMEDIATE;");
  try {
    projectRepository.saveProject(review, { withinTransaction: true });
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
ipcMain.handle("approve-timeline-assembly", (_event, input: unknown) => { const { projectId } = timelineAssemblyRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "timeline-assembly").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Timeline Assembly exists."); const timeline = timelineAssemblyOutputSchema.parse(artifact.payloadJson); const approved = transitionProjectStage({ ...project, timeline }, "timeline-assembly", "approved"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });

function resolveWorkspaceArtifactPath(relativeFilePath: string): string {
  const resolvedPath = resolve(workspaceRoot, relativeFilePath);
  const pathFromWorkspace = relative(workspaceRoot, resolvedPath);
  if (!pathFromWorkspace || pathFromWorkspace.startsWith("..") || resolve(workspaceRoot) === resolvedPath) {
    throw new Error("Approved media path is outside the workspace.");
  }
  return resolvedPath;
}

ipcMain.handle("run-preview-render", async (_event, input: unknown) => {
  const { projectId } = previewRenderRequestSchema.parse(input);
  const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const timelineArtifact = workflowRunStore.listArtifacts(projectId, "timeline-assembly").find((item) => item.status === "approved" && item.payloadJson);
  const assetReviewArtifact = workflowRunStore.listArtifacts(projectId, "asset-review").find((item) => item.status === "approved" && item.payloadJson);
  const voiceArtifact = workflowRunStore.listArtifacts(projectId, "voice-generation").find((item) => item.status === "approved" && item.payloadJson);
  if (!timelineArtifact?.payloadJson || !assetReviewArtifact?.payloadJson || !voiceArtifact?.payloadJson) {
    throw new Error("Preview Render requires approved Timeline Assembly, Asset Review, and Voice Generation.");
  }

  const timeline = timelineAssemblyOutputSchema.parse(timelineArtifact.payloadJson);
  const reviewedAssets = assetReviewOutputSchema.parse(assetReviewArtifact.payloadJson);
  const voiceOutput = voiceGenerationOutputSchema.parse(voiceArtifact.payloadJson);
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
      return { filePath: resolveWorkspaceArtifactPath(item.sourceId) };
    });
  if (!visualInputs.length || !audioInputs.length) throw new Error("Preview Render requires approved visual and narration media.");

  const inputArtifactIds = [timelineArtifact.id, assetReviewArtifact.id, voiceArtifact.id];
  const inputFingerprint = canonicalSha256({ stageId: "preview-render", inputArtifactIds, timeline });
  const runId = `stage-run-${randomUUID()}`;
  const now = new Date().toISOString();
  let running: FactoryProject;
  db.exec("BEGIN IMMEDIATE;");
  try {
    // Recheck while holding the write lock so concurrent IPC requests cannot start duplicate renders.
    const existingRun = workflowRunStore.findLatestByInput(projectId, "preview-render", inputFingerprint);
    if (existingRun?.status === "running" || existingRun?.status === "needs_review") {
      db.exec("COMMIT;");
      const currentProject = projectRepository.loadProject(projectId);
      if (!currentProject) throw new Error(`Project not found: ${projectId}`);
      return factoryProjectResponseSchema.parse(currentProject);
    }
    running = transitionProjectStage(transitionProjectStage(project, "preview-render", "queued"), "preview-render", "running");
    projectRepository.saveProject(running, { withinTransaction: true });
    workflowRunStore.createRun({ id: runId, projectId, stageId: "preview-render", status: "running", runnerId: "ffmpeg-preview", runnerVersion: "preview-render-v1", inputArtifactIds, inputFingerprint, outputArtifactIds: [], startedAt: now });
    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }

  const relativeFilePath = join("previews", projectId, `${runId}.mp4`);
  const outputPath = resolveWorkspaceArtifactPath(relativeFilePath);
  mkdirSync(dirname(outputPath), { recursive: true });
  try {
    const result = await renderPreview({ timeline, outputPath, resolution: project.format === "short" ? "1080p-vertical" : "1080p-horizontal", visualInputs, audioInputs, ...(process.env.FFMPEG_PATH ? { ffmpegPath: process.env.FFMPEG_PATH } : {}), ...(process.env.FFPROBE_PATH ? { ffprobePath: process.env.FFPROBE_PATH } : {}) });
    const artifactId = `artifact-${randomUUID()}`;
    const finishedAt = new Date().toISOString();
    const output = previewRenderOutputSchema.parse({ relativeFilePath, durationSeconds: result.durationSeconds, width: result.width, height: result.height, sha256: result.sha256, inputArtifactIds });
    const review = transitionProjectStage(running, "preview-render", "needs_review");
    db.exec("BEGIN IMMEDIATE;");
    try {
      projectRepository.saveProject(review, { withinTransaction: true });
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
      projectRepository.saveProject(failed, { withinTransaction: true });
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
  const approved = transitionProjectStage(project, "preview-render", "approved");
  db.exec("BEGIN IMMEDIATE;");
  try {
    projectRepository.saveProject(approved, { withinTransaction: true });
    workflowRunStore.approveReviewRun(artifact.stageRunId);
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
    projectRepository.saveProject(rejected, { withinTransaction: true });
    workflowRunStore.rejectReviewRun(artifact.stageRunId);
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
  const preview = workflowRunStore.listArtifacts(projectId, "preview-render").find((item) => item.status === "approved" && item.payloadJson);
  const timeline = workflowRunStore.listArtifacts(projectId, "timeline-assembly").find((item) => item.status === "approved" && item.payloadJson);
  if (!preview?.payloadJson || !timeline?.payloadJson) throw new Error("QA requires approved Preview Render and Timeline Assembly.");
  const assets = workflowRunStore.listArtifacts(projectId, "asset-review").find((item) => item.status === "approved" && item.payloadJson);
  const voice = workflowRunStore.listArtifacts(projectId, "voice-generation").find((item) => item.status === "approved" && item.payloadJson);
  const subtitles = workflowRunStore.listArtifacts(projectId, "subtitle-preparation").find((item) => item.status === "approved" && item.payloadJson);
  const script = workflowRunStore.listArtifacts(projectId, "script").find((item) => item.status === "approved" && item.payloadJson);
  const inputArtifactIds = [preview, timeline, assets, voice, subtitles, script].filter((item): item is NonNullable<typeof item> => Boolean(item)).map((item) => item.id);
  const fingerprint = canonicalSha256({ stageId: "qa", inputArtifactIds, timeline: timeline.payloadJson, projectStages: project.stages });
  const existing = workflowRunStore.findLatestByInput(projectId, "qa", fingerprint);
  if (existing?.status === "needs_review") return factoryProjectResponseSchema.parse(project);
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
  for (const item of project.timeline.items.filter((item) => item.track === "narration")) if (!existsSync(resolveWorkspaceArtifactPath(item.sourceId))) add("missing_audio", "blocking", "A narration file is missing.", item.sourceId);
  if (project.claims.some((claim) => claim.state === "unsupported" || claim.approvalState === "blocked")) add("unsupported_claim", "blocking", "Project contains unsupported or blocked claims.", "claim-map");
  if (imageCertificationStore.loadLatest()?.overallStatus !== "verified") add("certification", "warning", "The latest image capability certification is not verified.", "image-certification");
  const runtime = await probeRuntimeEnvironment();
  if (!runtime.pythonExists || !runtime.capcutInstalled || runtime.pycapcutStatus !== "Installed" || !runtime.draftDirConfigured) add("capcut_prerequisite", "warning", "CapCut Draft prerequisites are not fully configured.", "runtime-environment");
  const output = qaOutputSchema.parse({ runner: "local_deterministic", findings, inputArtifactIds });
  const runId = `stage-run-${randomUUID()}`; const artifactId = `artifact-${randomUUID()}`; const now = new Date().toISOString();
  const review = transitionProjectStage(transitionProjectStage(transitionProjectStage(project, "qa", "queued"), "qa", "running"), "qa", "needs_review");
  db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(review, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "qa", status: "running", runnerId: "qa-local", runnerVersion: "qa-v1", inputArtifactIds, inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "qa", status: "needs_review", runnerId: "qa-local", runnerVersion: "qa-v1", inputArtifactIds, inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt: now }, { id: artifactId, projectId, stageId: "qa", stageRunId: runId, type: "qa-report", version: workflowRunStore.listArtifacts(projectId, "qa").length + 1, status: "needs_review", payloadJson: output, createdAt: now, updatedAt: now }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
  return factoryProjectResponseSchema.parse(review);
});
ipcMain.handle("list-qa-artifacts", (_event, input: unknown) => { const { projectId } = qaRequestSchema.parse(input); return qaArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "qa").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });
ipcMain.handle("approve-qa", (_event, input: unknown) => { const { projectId } = qaRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "qa").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable QA report exists."); if (qaOutputSchema.parse(artifact.payloadJson).findings.some((finding) => finding.severity === "blocking")) throw new Error("Resolve blocking QA findings before approval."); const approved = transitionProjectStage(project, "qa", "approved"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });
ipcMain.handle("reject-qa", (_event, input: unknown) => { const { projectId } = qaRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "qa").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId) throw new Error("No reviewable QA report exists."); const rejected = transitionProjectStage(project, "qa", "rejected"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(rejected, { withinTransaction: true }); workflowRunStore.rejectReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(rejected); });

ipcMain.handle("run-capcut-draft", async (_event, input: unknown) => {
  const { projectId } = capcutDraftRequestSchema.parse(input);
  const project = projectRepository.loadProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const qa = workflowRunStore.listArtifacts(projectId, "qa").find((item) => item.status === "approved" && item.payloadJson);
  const timelineArtifact = workflowRunStore.listArtifacts(projectId, "timeline-assembly").find((item) => item.status === "approved" && item.payloadJson);
  const assets = workflowRunStore.listArtifacts(projectId, "asset-review").find((item) => item.status === "approved" && item.payloadJson);
  const subtitles = workflowRunStore.listArtifacts(projectId, "subtitle-preparation").find((item) => item.status === "approved" && item.payloadJson);
  if (!qa?.payloadJson || !timelineArtifact?.payloadJson || !assets?.payloadJson || !subtitles?.payloadJson) throw new Error("CapCut Draft requires approved QA, Timeline Assembly, Asset Review, and Subtitle Preparation.");
  const runtime = await probeRuntimeEnvironment();
  if (!runtime.pythonExists || !runtime.capcutInstalled || runtime.pycapcutStatus !== "Installed" || !runtime.draftDirConfigured) throw new Error("CapCut Draft prerequisites are not configured.");
  const timeline = timelineAssemblyOutputSchema.parse(timelineArtifact.payloadJson);
  const reviewed = assetReviewOutputSchema.parse(assets.payloadJson);
  const subtitleOutput = subtitlePreparationOutputSchema.parse(subtitles.payloadJson);
  const assetsById = new Map(reviewed.assets.filter((item) => item.reviewStatus === "approved" && item.assignedShotId).map((item) => [item.asset.sha256, item.asset]));
  const visuals = timeline.items.filter((item) => item.track === "primary_visual").map((item) => {
    const asset = [...assetsById.values()].find((candidate) => project.shots.some((shot) => shot.approvedAssetId === item.sourceId && shot.id === candidate.shotId));
    if (!asset) throw new Error("Timeline visual is not backed by an approved assigned asset.");
    return { filePath: resolveWorkspaceArtifactPath(asset.relativeFilePath), startUs: Math.round(item.startFrame * 1_000_000 / item.fps), durationUs: Math.round(item.durationFrames * 1_000_000 / item.fps) };
  });
  const audio = timeline.items.filter((item) => item.track === "narration").map((item) => ({ filePath: resolveWorkspaceArtifactPath(item.sourceId), startUs: Math.round(item.startFrame * 1_000_000 / item.fps), durationUs: Math.round(item.durationFrames * 1_000_000 / item.fps) }));
  const inputArtifactIds = [qa.id, timelineArtifact.id, assets.id, subtitles.id];
  const fingerprint = canonicalSha256({ stageId: "capcut-draft", inputArtifactIds, timeline });
  const existing = workflowRunStore.findLatestByInput(projectId, "capcut-draft", fingerprint);
  if (existing?.status === "running" || existing?.status === "needs_review") return factoryProjectResponseSchema.parse(project);
  const runId = `stage-run-${randomUUID()}`;
  const draftName = `${projectId}-${runId}`;
  const running = transitionProjectStage(transitionProjectStage(project, "capcut-draft", "queued"), "capcut-draft", "running");
  db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(running, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "capcut-draft", status: "running", runnerId: "pycapcut-bridge", runnerVersion: "capcut-bridge-v2", inputArtifactIds, inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: new Date().toISOString() }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
  try {
    const bridge = await runCapCutDraftBridge({ pythonPath: runtime.sidecarPythonPath, bridgePath: join(repoRoot, "python", "capcut_bridge", "bridge.py"), payload: { draftDirectory: join(runtime.capcutDraftDir, draftName), canvas: { width: project.format === "short" ? 1080 : 1920, height: project.format === "short" ? 1920 : 1080, fps: timeline.fps }, timeline: { visuals, audio, subtitles: subtitleOutput.cues.map((cue) => ({ text: cue.text, startUs: Math.round(cue.startFrame * 1_000_000 / subtitleOutput.fps), durationUs: Math.round(cue.durationFrames * 1_000_000 / subtitleOutput.fps) })) } } });
    const output = capcutDraftOutputSchema.parse({ draftName, structurallyValidated: true, trackCounts: bridge.trackCounts, inputArtifactIds }); const artifactId = `artifact-${randomUUID()}`; const review = transitionProjectStage(running, "capcut-draft", "needs_review"); const now = new Date().toISOString();
    db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(review, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "capcut-draft", status: "needs_review", runnerId: "pycapcut-bridge", runnerVersion: "capcut-bridge-v2", inputArtifactIds, inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt: now }, { id: artifactId, projectId, stageId: "capcut-draft", stageRunId: runId, type: "capcut-draft", version: workflowRunStore.listArtifacts(projectId, "capcut-draft").length + 1, status: "needs_review", payloadJson: output, createdAt: now, updatedAt: now }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; }
    return factoryProjectResponseSchema.parse(review);
  } catch (error) {
    const failed = transitionProjectStage(running, "capcut-draft", "failed"); const message = error instanceof CapCutDraftError ? error.message : "CapCut Draft failed.";
    db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(failed, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "capcut-draft", status: "failed", runnerId: "pycapcut-bridge", runnerVersion: "capcut-bridge-v2", inputArtifactIds, inputFingerprint: fingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof CapCutDraftError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); } catch (persistenceError) { db.exec("ROLLBACK;"); throw persistenceError; }
    throw new Error(message);
  }
});
ipcMain.handle("list-capcut-draft-artifacts", (_event, input: unknown) => { const { projectId } = capcutDraftRequestSchema.parse(input); return capcutDraftArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "capcut-draft").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });
ipcMain.handle("approve-capcut-draft", (_event, input: unknown) => { const { projectId } = capcutDraftApprovalRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "capcut-draft").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable CapCut Draft exists."); capcutDraftOutputSchema.parse(artifact.payloadJson); const approved = transitionProjectStage(project, "capcut-draft", "approved"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });

ipcMain.handle("run-packaging-export", (_event, input: unknown) => {
  const { projectId } = packagingExportRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`);
  const requiredStages = ["qa", "capcut-draft", "preview-render", "timeline-assembly", "script", "asset-review"];
  const artifacts = requiredStages.map((stageId) => workflowRunStore.listArtifacts(projectId, stageId).find((item) => item.status === "approved" && item.payloadJson));
  if (artifacts.some((artifact) => !artifact)) throw new Error("Packaging Export requires approved QA, CapCut Draft, preview, timeline, script, and assets.");
  const approved = artifacts as NonNullable<(typeof artifacts)[number]>[]; const artifactIds = approved.map((artifact) => artifact.id);
  const manifest = { schemaVersion: 1, project: { id: project.id, topic: project.topic, format: project.format, targetLanguage: project.targetLanguage }, artifactIds };
  const text = JSON.stringify(manifest, null, 2); if (/(?:api[_-]?key|authorization|credential|https?:\/\/|[A-Za-z]:[\\/]|\.\.)/i.test(text)) throw new Error("Packaging manifest failed secret or path safety validation.");
  const fingerprint = canonicalSha256({ stageId: "packaging-export", artifactIds }); const existing = workflowRunStore.findLatestByInput(projectId, "packaging-export", fingerprint); if (existing?.status === "needs_review") return factoryProjectResponseSchema.parse(project);
  const runId = `stage-run-${randomUUID()}`; const artifactId = `artifact-${randomUUID()}`; const now = new Date().toISOString(); const relativeFilePath = join("exports", projectId, `${runId}.json`); const outputPath = resolveWorkspaceArtifactPath(relativeFilePath); mkdirSync(dirname(outputPath), { recursive: true }); writeFileSync(outputPath, text, "utf8"); const sha256 = createHash("sha256").update(text).digest("hex"); const output = packagingExportOutputSchema.parse({ relativeFilePath, artifactIds, sha256 }); const review = transitionProjectStage(transitionProjectStage(transitionProjectStage(project, "packaging-export", "queued"), "packaging-export", "running"), "packaging-export", "needs_review");
  db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(review, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "packaging-export", status: "running", runnerId: "packaging-export-local", runnerVersion: "packaging-export-v1", inputArtifactIds: artifactIds, inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "packaging-export", status: "needs_review", runnerId: "packaging-export-local", runnerVersion: "packaging-export-v1", inputArtifactIds: artifactIds, inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt: now }, { id: artifactId, projectId, stageId: "packaging-export", stageRunId: runId, type: "package-export", version: workflowRunStore.listArtifacts(projectId, "packaging-export").length + 1, status: "needs_review", payloadJson: output, relativeFilePath, createdAt: now, updatedAt: now }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review);
});
ipcMain.handle("list-packaging-export-artifacts", (_event, input: unknown) => { const { projectId } = packagingExportRequestSchema.parse(input); return packagingExportArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "packaging-export").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, relativeFilePath: artifact.relativeFilePath, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });
ipcMain.handle("approve-packaging-export", (_event, input: unknown) => { const { projectId } = packagingExportRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "packaging-export").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Packaging Export exists."); const output = packagingExportOutputSchema.parse(artifact.payloadJson); if (artifact.relativeFilePath !== output.relativeFilePath || !existsSync(resolveWorkspaceArtifactPath(output.relativeFilePath))) throw new Error("Package manifest is missing."); const approved = transitionProjectStage(project, "packaging-export", "approved"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });
ipcMain.handle("reject-packaging-export", (_event, input: unknown) => { const { projectId } = packagingExportRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "packaging-export").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId) throw new Error("No reviewable Packaging Export exists."); const rejected = transitionProjectStage(project, "packaging-export", "rejected"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(rejected, { withinTransaction: true }); workflowRunStore.rejectReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(rejected); });

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
