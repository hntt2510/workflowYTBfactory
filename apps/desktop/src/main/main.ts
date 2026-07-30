import { app, BrowserWindow, ipcMain } from "electron";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execFile, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  AppSettingsStore,
  createKeytarKeychain,
  MemoryKeychain,
  ProjectRepository,
  ProviderCredentialStore,
  TextCertificationStore,
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
  listNineRouterModelsRequestSchema,
  localTtsGeneratedResponseSchema,
  localTtsSettingsResponseSchema,
  localTtsSettingsSchema,
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
  applyVisualRouting,
  replaceCompetitorReferenceRequestSchema,
  providerIdRequestSchema,
  routeChannelProfile,
  run9RouterTextCertificationRequestSchema,
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
import { runShotPlan, ShotPlanError } from "./shotPlanService";

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
const workflowRunStore = new WorkflowRunStore(db);
const logger = new JsonLogger();
const uiVerificationEvents: string[] = [];
let credentialStore: ProviderCredentialStore;
projectRepository.seedProfiles();
const queue = new PersistentGenerationQueue({
  storagePath: join(workspaceRoot, "queue.json"),
  defaultConcurrency: 5
});
const localTtsSettingsId = "local-tts";
const execFileAsync = promisify(execFile);

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

function loadLocalTtsSettings() {
  const fallback = {
    omnivoiceBinPath: defaultOmniVoiceBinPath(),
    outputDir: process.env.OMNIVOICE_OUTPUT_DIR ?? join(workspaceRoot, "assets", "tts"),
    modelPath: process.env.OMNIVOICE_MODEL_PATH ?? "",
    language: "",
    instruct: ""
  };
  const settings = localTtsSettingsSchema.parse(appSettingsStore.load(localTtsSettingsId, fallback));
  const resolvedBinPath = settings.omnivoiceBinPath;
  return localTtsSettingsResponseSchema.parse({
    ...settings,
    resolvedBinPath,
    available: Boolean(resolvedBinPath && existsSync(resolvedBinPath))
  });
}

async function runOmniVoiceTts(input: { projectId: string; text: string; outputName?: string }) {
  const settings = loadLocalTtsSettings();
  if (!settings.available) {
    throw new Error("OmniVoice binary is not configured or does not exist.");
  }
  mkdirSync(settings.outputDir, { recursive: true });
  const outputName = input.outputName ?? `${input.projectId}-tts-${Date.now()}.wav`;
  const outputPath = join(settings.outputDir, outputName.endsWith(".wav") ? outputName : `${outputName}.wav`);
  const args = ["--text", input.text, "--output", outputPath];
  if (settings.modelPath) args.push("--model", settings.modelPath);
  if (settings.language) args.push("--language", settings.language);
  if (settings.instruct) args.push("--instruct", settings.instruct);
  await execFileAsync(settings.resolvedBinPath, args, { encoding: "utf8", timeout: 30 * 60_000 });
  if (!existsSync(outputPath)) throw new Error("OmniVoice completed without creating an audio file.");
  return localTtsGeneratedResponseSchema.parse({ ok: true, outputPath, provider: "omnivoice-local" });
}

function probeRuntimeEnvironment() {
  const sidecarPythonPath =
    process.env.CAPCUT_PYTHON_PATH ?? join(repoRoot, "python", "capcut_bridge", ".venv", "Scripts", "python.exe");
  const capcutInstallPath = process.env.CAPCUT_INSTALL_DIR ?? join(app.getPath("home"), "AppData", "Local", "CapCut");
  const capcutDraftDir = process.env.CAPCUT_DRAFT_DIR ?? "";
  const pythonExists = existsSync(sidecarPythonPath);
  let pythonVersion = "Not found";
  let pycapcutStatus = "Not installed";
  if (pythonExists) {
    try {
      pythonVersion = execFileSync(sidecarPythonPath, ["--version"], { encoding: "utf8", timeout: 5_000 }).trim();
      execFileSync(sidecarPythonPath, ["-c", "import pycapcut"], { encoding: "utf8", timeout: 5_000 });
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
    const output = execFileSync(ffmpegPath, ["-version"], { encoding: "utf8", timeout: 5_000 });
    ffmpegStatus = output.split("\n")[0]?.trim() || "Detected";
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
        : "Needs setup"
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
  credentialStore = await createCredentialStore();
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
      await assertText(win, "Demo Generation");
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
      await clickText(win, "Create Demo Project");
      await assertText(win, topic);
      await assertText(win, "Project command center");
      await clickText(win, "Shots");
      await assertText(win, "Shot Board");
      await assertText(win, "00:00:");
      await clickText(win, "Visuals");
      await assertText(win, "Real 9Router image generation and asset assignment are not implemented yet.");
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

ipcMain.handle("bootstrap", () => ({
  profiles: seedChannelProfiles,
  workspaceRoot,
  databasePath,
  projects: projectRepository.listProjects(),
  queue: queue.snapshotWorkers(),
  runtime: probeRuntimeEnvironment()
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

ipcMain.handle("validate-reference-set", (_event, input: unknown) => {
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
  const referenceSet = evaluateReferenceSet(validatedReferences);
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
  const { projectId } = claimMapRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "claim-map").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Claim Map exists."); const claims = claimMapOutputSchema.parse(artifact.payloadJson).claims; const approved = transitionProjectStage({ ...project, claims }, "claim-map", "approved"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved);
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

ipcMain.handle("approve-script", (_event, input: unknown) => { const { projectId } = scriptRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "script").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Script exists."); const sections = scriptOutputSchema.parse(artifact.payloadJson).sections; const approved = transitionProjectStage({ ...project, scriptSections: sections }, "script", "approved"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });

ipcMain.handle("list-script-artifacts", (_event, input: unknown) => { const { projectId } = scriptRequestSchema.parse(input); return scriptArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "script").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });

ipcMain.handle("run-fact-review", (_event, input: unknown) => { const { projectId } = factReviewRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const scriptArtifact = workflowRunStore.listArtifacts(projectId, "script").find((item) => item.status === "approved" && item.payloadJson); if (!scriptArtifact?.payloadJson) throw new Error("Fact Review requires an approved Script."); const usedClaimIds = new Set(scriptOutputSchema.parse(scriptArtifact.payloadJson).sections.flatMap((section) => section.linkedClaimIds)); const claims = project.claims.filter((claim) => usedClaimIds.has(claim.id)); if (!claims.length) throw new Error("Fact Review requires script sections linked to approved claims."); const fingerprint = canonicalSha256({ stageId: "fact-review", scriptArtifactId: scriptArtifact.id, claims }); const existing = workflowRunStore.findLatestByInput(projectId, "fact-review", fingerprint); if (existing?.status === "running" || existing?.status === "needs_review") return factoryProjectResponseSchema.parse(project); const runId = `stage-run-${randomUUID()}`; const artifactId = `artifact-${randomUUID()}`; const now = new Date().toISOString(); const findings = reviewFacts(claims); const output = factReviewOutputSchema.parse({ reviewer: "local_deterministic", findings }); const review = transitionProjectStage(transitionProjectStage(transitionProjectStage(project, "fact-review", "queued"), "fact-review", "running"), "fact-review", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(review, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "fact-review", status: "running", runnerId: "fact-review-local", runnerVersion: "fact-review-v1", inputArtifactIds: [scriptArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "fact-review", status: "needs_review", runnerId: "fact-review-local", runnerVersion: "fact-review-v1", inputArtifactIds: [scriptArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt: now }, { id: artifactId, projectId, stageId: "fact-review", stageRunId: runId, type: "fact-review", version: workflowRunStore.listArtifacts(projectId, "fact-review").length + 1, status: "needs_review", payloadJson: output, createdAt: now, updatedAt: now }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); });

ipcMain.handle("list-fact-review-artifacts", (_event, input: unknown) => { const { projectId } = factReviewRequestSchema.parse(input); return factReviewArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "fact-review").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });

ipcMain.handle("approve-fact-review", (_event, input: unknown) => { const { projectId } = factReviewRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "fact-review").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Fact Review exists."); const output = factReviewOutputSchema.parse(artifact.payloadJson); if (output.findings.some((finding) => finding.verdict === "blocked")) throw new Error("Blocked fact-review findings must be resolved before approval."); const approved = transitionProjectStage(project, "fact-review", "approved"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });

ipcMain.handle("run-retention-review", async (_event, input: unknown) => { const { projectId } = retentionReviewRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const scriptArtifact = workflowRunStore.listArtifacts(projectId, "script").find((item) => item.status === "approved" && item.payloadJson); const factArtifact = workflowRunStore.listArtifacts(projectId, "fact-review").find((item) => item.status === "approved" && item.payloadJson); if (!scriptArtifact?.payloadJson || !factArtifact?.payloadJson) throw new Error("Retention Review requires approved Script and Fact Review."); const script = scriptOutputSchema.parse(scriptArtifact.payloadJson); const fingerprint = canonicalSha256({ stageId: "retention-review", scriptArtifactId: scriptArtifact.id, factArtifactId: factArtifact.id }); const existing = workflowRunStore.findLatestByInput(projectId, "retention-review", fingerprint); if (existing?.status === "running" || existing?.status === "needs_review") return factoryProjectResponseSchema.parse(project); const runId = `stage-run-${randomUUID()}`; const now = new Date().toISOString(); const running = transitionProjectStage(transitionProjectStage(project, "retention-review", "queued"), "retention-review", "running"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(running, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "retention-review", status: "running", runnerId: "retention-review-9router", runnerVersion: "retention-review-v1", providerId: "9router", inputArtifactIds: [scriptArtifact.id, factArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } try { const result = await runRetentionReview({ script, credentialStore, certificationStore: textCertificationStore }); const artifactId = `artifact-${randomUUID()}`; const finishedAt = new Date().toISOString(); const review = transitionProjectStage(running, "retention-review", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(review, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "retention-review", status: "needs_review", runnerId: "retention-review-9router", runnerVersion: "retention-review-v1", providerId: "9router", inputArtifactIds: [scriptArtifact.id, factArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt }, { id: artifactId, projectId, stageId: "retention-review", stageRunId: runId, type: "retention-review", version: workflowRunStore.listArtifacts(projectId, "retention-review").length + 1, status: "needs_review", payloadJson: result.output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); } catch (error) { const failed = transitionProjectStage(running, "retention-review", "failed"); const message = error instanceof RetentionReviewError ? error.message : "Retention Review failed."; db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(failed, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "retention-review", status: "failed", runnerId: "retention-review-9router", runnerVersion: "retention-review-v1", providerId: "9router", inputArtifactIds: [scriptArtifact.id, factArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof RetentionReviewError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); } catch (persistenceError) { db.exec("ROLLBACK;"); throw persistenceError; } throw new Error(message); } });

ipcMain.handle("list-retention-review-artifacts", (_event, input: unknown) => { const { projectId } = retentionReviewRequestSchema.parse(input); return retentionReviewArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "retention-review").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });

ipcMain.handle("approve-retention-review", (_event, input: unknown) => { const { projectId } = retentionReviewRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "retention-review").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Retention Review exists."); const output = retentionReviewOutputSchema.parse(artifact.payloadJson); if (output.overallVerdict === "blocked") throw new Error("Blocked Retention Review findings must be resolved before approval."); const approved = transitionProjectStage(project, "retention-review", "approved"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });

ipcMain.handle("run-scene-plan", async (_event, input: unknown) => { const { projectId } = scenePlanRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const scriptArtifact = workflowRunStore.listArtifacts(projectId, "script").find((item) => item.status === "approved" && item.payloadJson); const retentionArtifact = workflowRunStore.listArtifacts(projectId, "retention-review").find((item) => item.status === "approved" && item.payloadJson); if (!scriptArtifact?.payloadJson || !retentionArtifact?.payloadJson) throw new Error("Scene Plan requires approved Script and Retention Review."); const script = scriptOutputSchema.parse(scriptArtifact.payloadJson); const fingerprint = canonicalSha256({ stageId: "scene-plan", scriptArtifactId: scriptArtifact.id, retentionArtifactId: retentionArtifact.id, fps: project.timeline.fps }); const existing = workflowRunStore.findLatestByInput(projectId, "scene-plan", fingerprint); if (existing?.status === "running" || existing?.status === "needs_review") return factoryProjectResponseSchema.parse(project); const runId = `stage-run-${randomUUID()}`; const running = transitionProjectStage(transitionProjectStage(project, "scene-plan", "queued"), "scene-plan", "running"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(running, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "scene-plan", status: "running", runnerId: "scene-plan-9router", runnerVersion: "scene-plan-v1", providerId: "9router", inputArtifactIds: [scriptArtifact.id, retentionArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: new Date().toISOString() }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } try { const result = await runScenePlan({ script, fps: project.timeline.fps, credentialStore, certificationStore: textCertificationStore }); const artifactId = `artifact-${randomUUID()}`; const finishedAt = new Date().toISOString(); const review = transitionProjectStage(running, "scene-plan", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(review, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "scene-plan", status: "needs_review", runnerId: "scene-plan-9router", runnerVersion: "scene-plan-v1", providerId: "9router", inputArtifactIds: [scriptArtifact.id, retentionArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt }, { id: artifactId, projectId, stageId: "scene-plan", stageRunId: runId, type: "scene-plan", version: workflowRunStore.listArtifacts(projectId, "scene-plan").length + 1, status: "needs_review", payloadJson: result.output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); } catch (error) { const failed = transitionProjectStage(running, "scene-plan", "failed"); const message = error instanceof ScenePlanError ? error.message : "Scene Plan failed."; db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(failed, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "scene-plan", status: "failed", runnerId: "scene-plan-9router", runnerVersion: "scene-plan-v1", providerId: "9router", inputArtifactIds: [scriptArtifact.id, retentionArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof ScenePlanError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); } catch (persistenceError) { db.exec("ROLLBACK;"); throw persistenceError; } throw new Error(message); } });

ipcMain.handle("list-scene-plan-artifacts", (_event, input: unknown) => { const { projectId } = scenePlanRequestSchema.parse(input); return scenePlanArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "scene-plan").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });
ipcMain.handle("approve-scene-plan", (_event, input: unknown) => { const { projectId } = scenePlanRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "scene-plan").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Scene Plan exists."); const scenes = scenePlanOutputSchema.parse(artifact.payloadJson).scenes; const approved = transitionProjectStage({ ...project, scenes }, "scene-plan", "approved"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });

ipcMain.handle("run-shot-plan", async (_event, input: unknown) => { const { projectId } = shotPlanRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const sceneArtifact = workflowRunStore.listArtifacts(projectId, "scene-plan").find((item) => item.status === "approved" && item.payloadJson); if (!sceneArtifact?.payloadJson) throw new Error("Shot Plan requires an approved Scene Plan."); const scenePlan = scenePlanOutputSchema.parse(sceneArtifact.payloadJson); const fingerprint = canonicalSha256({ stageId: "shot-plan", sceneArtifactId: sceneArtifact.id, fps: project.timeline.fps }); const existing = workflowRunStore.findLatestByInput(projectId, "shot-plan", fingerprint); if (existing?.status === "running" || existing?.status === "needs_review") return factoryProjectResponseSchema.parse(project); const runId = `stage-run-${randomUUID()}`; const running = transitionProjectStage(transitionProjectStage(project, "shot-plan", "queued"), "shot-plan", "running"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(running, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "shot-plan", status: "running", runnerId: "shot-plan-9router", runnerVersion: "shot-plan-v1", providerId: "9router", inputArtifactIds: [sceneArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: new Date().toISOString() }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } try { const result = await runShotPlan({ scenes: scenePlan.scenes, fps: project.timeline.fps, credentialStore, certificationStore: textCertificationStore }); const artifactId = `artifact-${randomUUID()}`; const finishedAt = new Date().toISOString(); const review = transitionProjectStage(running, "shot-plan", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(review, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "shot-plan", status: "needs_review", runnerId: "shot-plan-9router", runnerVersion: "shot-plan-v1", providerId: "9router", inputArtifactIds: [sceneArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt }, { id: artifactId, projectId, stageId: "shot-plan", stageRunId: runId, type: "shot-plan", version: workflowRunStore.listArtifacts(projectId, "shot-plan").length + 1, status: "needs_review", payloadJson: result.output, createdAt: finishedAt, updatedAt: finishedAt }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); } catch (error) { const failed = transitionProjectStage(running, "shot-plan", "failed"); const message = error instanceof ShotPlanError ? error.message : "Shot Plan failed."; db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(failed, { withinTransaction: true }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "shot-plan", status: "failed", runnerId: "shot-plan-9router", runnerVersion: "shot-plan-v1", providerId: "9router", inputArtifactIds: [sceneArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], finishedAt: new Date().toISOString(), safeErrorCategory: error instanceof ShotPlanError ? error.category : "unexpected_failure", safeErrorMessage: message }, undefined, { withinTransaction: true }); db.exec("COMMIT;"); } catch (persistenceError) { db.exec("ROLLBACK;"); throw persistenceError; } throw new Error(message); } });

ipcMain.handle("list-shot-plan-artifacts", (_event, input: unknown) => { const { projectId } = shotPlanRequestSchema.parse(input); return shotPlanArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "shot-plan").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });
ipcMain.handle("approve-shot-plan", (_event, input: unknown) => { const { projectId } = shotPlanRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "shot-plan").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Shot Plan exists."); const shots = shotPlanOutputSchema.parse(artifact.payloadJson).shots; const approved = transitionProjectStage({ ...project, shots }, "shot-plan", "approved"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });

ipcMain.handle("run-visual-routing", (_event, input: unknown) => { const { projectId } = visualRoutingRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const shotArtifact = workflowRunStore.listArtifacts(projectId, "shot-plan").find((item) => item.status === "approved" && item.payloadJson); if (!shotArtifact?.payloadJson) throw new Error("Visual Routing requires an approved Shot Plan."); const shots = shotPlanOutputSchema.parse(shotArtifact.payloadJson).shots; const fingerprint = canonicalSha256({ stageId: "visual-routing", shotArtifactId: shotArtifact.id }); const existing = workflowRunStore.findLatestByInput(projectId, "visual-routing", fingerprint); if (existing?.status === "running" || existing?.status === "needs_review") return factoryProjectResponseSchema.parse(project); const runId = `stage-run-${randomUUID()}`; const artifactId = `artifact-${randomUUID()}`; const now = new Date().toISOString(); const output = visualRoutingOutputSchema.parse({ shots: applyVisualRouting(shots) }); const review = transitionProjectStage(transitionProjectStage(transitionProjectStage(project, "visual-routing", "queued"), "visual-routing", "running"), "visual-routing", "needs_review"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(review, { withinTransaction: true }); workflowRunStore.createRun({ id: runId, projectId, stageId: "visual-routing", status: "running", runnerId: "visual-routing-local", runnerVersion: "visual-routing-v1", inputArtifactIds: [shotArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "visual-routing", status: "needs_review", runnerId: "visual-routing-local", runnerVersion: "visual-routing-v1", inputArtifactIds: [shotArtifact.id], inputFingerprint: fingerprint, outputArtifactIds: [artifactId], finishedAt: now }, { id: artifactId, projectId, stageId: "visual-routing", stageRunId: runId, type: "visual-routing", version: workflowRunStore.listArtifacts(projectId, "visual-routing").length + 1, status: "needs_review", payloadJson: output, createdAt: now, updatedAt: now }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(review); });
ipcMain.handle("list-visual-routing-artifacts", (_event, input: unknown) => { const { projectId } = visualRoutingRequestSchema.parse(input); return visualRoutingArtifactsResponseSchema.parse(workflowRunStore.listArtifacts(projectId, "visual-routing").map((artifact) => ({ id: artifact.id, ...(artifact.stageRunId ? { stageRunId: artifact.stageRunId } : {}), status: artifact.status, payloadJson: artifact.payloadJson, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt }))); });
ipcMain.handle("edit-visual-routing", (_event, input: unknown) => { const { projectId, artifactId, shotId, visualMode } = editVisualRoutingRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const source = workflowRunStore.listArtifacts(projectId, "visual-routing").find((item) => item.id === artifactId && item.status === "needs_review"); if (!source?.stageRunId || !source.payloadJson) throw new Error("Visual Routing revision must start from a reviewable artifact."); const current = visualRoutingOutputSchema.parse(source.payloadJson); if (!current.shots.some((shot) => shot.id === shotId)) throw new Error("Shot is not present in the Visual Routing artifact."); const output = visualRoutingOutputSchema.parse({ shots: current.shots.map((shot) => shot.id === shotId ? { ...shot, visualMode } : shot) }); const fingerprint = canonicalSha256({ stageId: "visual-routing", sourceArtifactId: source.id, shotId, visualMode }); const existing = workflowRunStore.findLatestByInput(projectId, "visual-routing", fingerprint); if (existing?.status === "needs_review") return factoryProjectResponseSchema.parse(project); const runId = `stage-run-${randomUUID()}`; const nextArtifactId = `artifact-${randomUUID()}`; const now = new Date().toISOString(); db.exec("BEGIN IMMEDIATE;"); try { workflowRunStore.rejectReviewRun(source.stageRunId); workflowRunStore.createRun({ id: runId, projectId, stageId: "visual-routing", status: "running", runnerId: "visual-routing-user-edit", runnerVersion: "visual-routing-v1", inputArtifactIds: [source.id], inputFingerprint: fingerprint, outputArtifactIds: [], startedAt: now }); workflowRunStore.finishRun({ id: runId, projectId, stageId: "visual-routing", status: "needs_review", runnerId: "visual-routing-user-edit", runnerVersion: "visual-routing-v1", inputArtifactIds: [source.id], inputFingerprint: fingerprint, outputArtifactIds: [nextArtifactId], finishedAt: now }, { id: nextArtifactId, projectId, stageId: "visual-routing", stageRunId: runId, type: "visual-routing", version: workflowRunStore.listArtifacts(projectId, "visual-routing").length + 1, status: "needs_review", payloadJson: output, createdAt: now, updatedAt: now }, { withinTransaction: true }); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(project); });
ipcMain.handle("approve-visual-routing", (_event, input: unknown) => { const { projectId } = visualRoutingRequestSchema.parse(input); const project = projectRepository.loadProject(projectId); if (!project) throw new Error(`Project not found: ${projectId}`); const artifact = workflowRunStore.listArtifacts(projectId, "visual-routing").find((item) => item.status === "needs_review"); if (!artifact?.stageRunId || !artifact.payloadJson) throw new Error("No reviewable Visual Routing exists."); const shots = visualRoutingOutputSchema.parse(artifact.payloadJson).shots; const approved = transitionProjectStage({ ...project, shots }, "visual-routing", "approved"); db.exec("BEGIN IMMEDIATE;"); try { projectRepository.saveProject(approved, { withinTransaction: true }); workflowRunStore.approveReviewRun(artifact.stageRunId); db.exec("COMMIT;"); } catch (error) { db.exec("ROLLBACK;"); throw error; } return factoryProjectResponseSchema.parse(approved); });

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

ipcMain.handle("load-local-tts-settings", () => loadLocalTtsSettings());

ipcMain.handle("save-local-tts-settings", (_event, input: unknown) => {
  const settings = localTtsSettingsSchema.parse(input);
  appSettingsStore.save(localTtsSettingsId, settings);
  return loadLocalTtsSettings();
});

ipcMain.handle("generate-local-tts", async (_event, input: unknown) => {
  const request = generateLocalTtsRequestSchema.parse(input);
  return runOmniVoiceTts({
    projectId: request.projectId,
    text: request.text,
    ...(request.outputName ? { outputName: request.outputName } : {})
  });
});

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
