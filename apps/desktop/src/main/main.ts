import { app, BrowserWindow, ipcMain } from "electron";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AppSettingsStore,
  createKeytarKeychain,
  MemoryKeychain,
  ProjectRepository,
  ProviderCredentialStore,
  JsonLogger,
  openFactoryDatabase
} from "@lsf/db";
import {
  createProjectRequestSchema,
  createFixtureProject,
  addCompetitorReferenceRequestSchema,
  factoryProjectResponseSchema,
  channelRouteDecisionResponseSchema,
  nullableFactoryProjectResponseSchema,
  okResponseSchema,
  generateLocalTtsRequestSchema,
  localTtsGeneratedResponseSchema,
  localTtsSettingsResponseSchema,
  localTtsSettingsSchema,
  projectIdRequestSchema,
  projectListResponseSchema,
  providerCredentialDeletedResponseSchema,
  providerCredentialPresenceResponseSchema,
  providerCredentialSettingsResponseSchema,
  providerCredentialSavedResponseSchema,
  providerIdRequestSchema,
  routeChannelProfile,
  saveProviderCredentialRequestSchema,
  seedChannelProfiles,
  channelRouteInputSchema
} from "@lsf/domain";
import { PersistentGenerationQueue } from "@lsf/generation-queue";

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
const logger = new JsonLogger();
const uiVerificationEvents: string[] = [];
let credentialStore: ProviderCredentialStore;
projectRepository.seedProfiles();
const queue = new PersistentGenerationQueue({
  storagePath: join(workspaceRoot, "queue.json"),
  defaultConcurrency: 5
});
const localTtsSettingsId = "local-tts";

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

function runOmniVoiceTts(input: { projectId: string; text: string; outputName?: string }) {
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
  execFileSync(settings.resolvedBinPath, args, { encoding: "utf8", timeout: 30 * 60_000 });
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
  const win = createWindow();
  if (process.env.LSF_E2E_UI_REPORT_PATH) {
    void runUiVerification(win, process.env.LSF_E2E_UI_REPORT_PATH, process.env.LSF_E2E_UI_MODE ?? "create");
  }
});

async function runUiVerification(win: BrowserWindow, reportPath: string, mode: string): Promise<void> {
  const topic = "What did Aaron's breastpiece symbolize?";
  try {
    writeUiVerificationReport(reportPath, { ok: false, mode, phase: "started", workspaceRoot, databasePath });
    await waitForRenderer(win);
    writeUiVerificationReport(reportPath, { ok: false, mode, phase: "renderer_loaded", workspaceRoot, databasePath });
    if (mode === "verify") {
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
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
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
  const nextProject = {
    ...project,
    competitorReferences: [
      ...project.competitorReferences,
      {
        id: `competitor-${randomUUID()}`,
        ...(request.sourceUrl ? { sourceUrl: request.sourceUrl } : {}),
        pastedTranscript: request.pastedTranscript,
        ...(request.notes ? { notes: request.notes } : {}),
        createdAt: new Date().toISOString()
      }
    ]
  };
  projectRepository.saveProject(nextProject);
  logger.info("competitor_reference_added", { projectId: request.projectId });
  return factoryProjectResponseSchema.parse(nextProject);
});

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
  logger.info("provider_credential_saved", { providerId: settings.providerId, credentialRef });
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
  return providerCredentialDeletedResponseSchema.parse({
    providerId,
    deleted: await credentialStore.deleteProviderCredential(providerId)
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

ipcMain.handle("load-local-tts-settings", () => loadLocalTtsSettings());

ipcMain.handle("save-local-tts-settings", (_event, input: unknown) => {
  const settings = localTtsSettingsSchema.parse(input);
  appSettingsStore.save(localTtsSettingsId, settings);
  return loadLocalTtsSettings();
});

ipcMain.handle("generate-local-tts", (_event, input: unknown) => {
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
