import {
  createFixtureProject,
  createStageAttention,
  routeChannelProfile,
  resolveWorkflowProgress,
  seedChannelProfiles,
  type ChannelRouteDecision,
  type FactoryProject
} from "@lsf/domain";
import type { ChannelDna, ChannelProfile } from "@lsf/domain";
import type {
  BootstrapData,
  GenerateLocalTtsInput,
  DevCapcutTestResult,
  DevIdeaTestResult,
  DevImageTestResult,
  DevStockTestResult,
  LongShortFactoryApi,
  LocalTtsGenerated,
  LocalTtsSettings,
  ProjectSummary,
  ProviderCredentialInput,
  ProviderModelConfigurationInput,
  ProviderCredentialSettings,
  ProviderPresence,
  TextModelCertificationResponse,
  AssetAcquisitionArtifact,
  AssetConceptArtifact,
  AssetReviewArtifact,
  PromptPreparationArtifact
  , ImageModelCertificationResponse
} from "../types";

const emptyQueue = { concurrency: 5, running: 0, jobs: [] };
const browserRuntime = {
  sidecarPythonPath: "Electron main process unavailable",
  pythonExists: false,
  pythonVersion: "Unavailable",
  pycapcutStatus: "Unavailable",
  capcutInstallPath: "Electron main process unavailable",
  capcutInstalled: false,
  ffmpegPath: "Electron main process unavailable",
  ffmpegAvailable: false,
  ffmpegStatus: "Unavailable in browser preview",
  capcutDraftDir: "Not configured",
  draftDirConfigured: false,
  capcutCompatibility: "Unavailable in browser preview"
  , devTestLabEnabled: false
};

function createBrowserAssetScreenshotFixture(): {
  project: FactoryProject;
  prompt: PromptPreparationArtifact;
  acquisition: AssetAcquisitionArtifact;
  review: AssetReviewArtifact;
  previewUrls: Record<string, string>;
} {
  const project = createFixtureProject({
    topic: "Dòng tiền trong 60 giây",
    projectName: "Creator Studio asset intake fixture",
    format: "short",
    targetLanguage: "Vietnamese",
    workflowMode: "guided",
    visualWorkflow: "legacy",
    aspectRatio: "9:16",
    profiles: seedChannelProfiles
  });
  const sceneId = "scene-cash-flow";
  const shots = Array.from({ length: 3 }, (_, index) => ({
    id: `shot-cash-${index + 1}`,
    sceneId,
    order: index,
    startFrame: index * 60,
    durationFrames: 60,
    fps: 30,
    purpose: ["Mở vấn đề dòng tiền", "Minh họa tiền đi vào và đi ra", "Chốt nguyên tắc dòng tiền"][index]!,
    visualMode: "manual_upload" as const,
    framing: "Teacher half-body on the right; left safe zone for the diagram",
    cameraAngle: "Eye level",
    cameraMovement: index === 1 ? "Slide up" : "Slow zoom",
    subjectAction: ["Teacher faces camera", "Teacher points to a rising cash-flow arrow", "Teacher points to the takeaway"][index]!,
    startState: {},
    endState: {},
    continuityRefs: index === 0 ? [] : [`shot-cash-${index}`],
    approvedAssetId: `asset-shot-cash-${index + 1}`,
    motion: { effect: index === 1 ? "slide_up" as const : index === 2 ? "zoom_out" as const : "zoom_in" as const, intensity: "subtle" as const, rationale: "Keep the explainer readable." }
  }));
  const frameManifest = shots.map((shot, index) => ({
    shotId: shot.id,
    displayNumber: String(index + 1).padStart(3, "0"),
    assetId: `asset-${shot.id}`,
    role: index === 0 ? "BASE" as const : index === 1 ? "GRAPHIC" as const : "ACTION_KEYFRAME" as const,
    assetStrategy: "NEW_BASE" as const,
    purpose: shot.purpose,
    durationFrames: shot.durationFrames,
    delta: shot.subjectAction,
    continuityRefs: shot.continuityRefs,
    referenceInstructions: ["Keep the approved storyboard composition unchanged."],
    expectedFilename: `${String(index + 1).padStart(3, "0")}.png`,
    acceptanceChecklist: ["Separate image file", "Teacher remains in the right-side subject box", "Left safe zone remains available for the asset"]
  }));
  const prompt: PromptPreparationArtifact = {
    id: "artifact-browser-fixture-prompt",
    stageRunId: "run-browser-fixture-prompt",
    status: "approved",
    payloadJson: {
      prompts: shots.map((shot) => ({ shotId: shot.id, promptVersionId: `prompt-${shot.id}`, positivePrompt: shot.subjectAction, negativePrompt: "No watermark", aspectRatio: "9:16" as const, continuityConstraints: ["Keep the approved teacher framing."], prohibitedElements: ["watermark"] })),
      scenePrompts: [{ sceneId, promptVersionId: "scene-prompt-cash-flow-v1", targetTool: "GG Lab", compilationMode: "scene_prompt", promptText: "Create the three approved cash-flow frames as separate images.", frameNumbers: frameManifest.map((frame) => frame.displayNumber), generatedFrameNumbers: frameManifest.map((frame) => frame.displayNumber), referenceInstructions: ["Use the previous frame for continuity."], continuityLocks: ["Teacher stays on the right; assets stay on the left."], expectedAspectRatio: "9:16", frameManifest }]
    },
    createdAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:00.000Z"
  };
  const assets = shots.map((shot, index) => ({
    shotId: shot.id,
    promptVersionId: `prompt-${shot.id}`,
    relativeFilePath: `fixtures/creator-studio-v1/frames/${String(index + 1).padStart(3, "0")}.png`,
    sha256: String(index + 1).padStart(2, "0").repeat(32),
    mimeType: "image/png" as const,
    byteLength: 10_391,
    width: 1080,
    height: 1920
  }));
  const acquisition: AssetAcquisitionArtifact = {
    id: "artifact-browser-fixture-acquisition",
    stageRunId: "run-browser-fixture-acquisition",
    status: "approved",
    payloadJson: { assets },
    createdAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:00.000Z"
  };
  const review: AssetReviewArtifact = {
    id: "artifact-browser-fixture-review",
    stageRunId: "run-browser-fixture-review",
    status: "approved",
    payloadJson: { acquisitionArtifactId: acquisition.id, assets: assets.map((asset) => ({ asset, reviewStatus: "approved" as const, assignedShotId: asset.shotId })) },
    createdAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:00.000Z"
  };
  const stages = project.stages.map((stage) => ({ ...stage, status: "approved" as const }));
  const screenshotProject: FactoryProject = {
    ...project,
    scenes: [{ id: sceneId, scriptSectionId: "section-cash-flow", narration: "Dòng tiền đi vào và đi ra.", purpose: "Giải thích dòng tiền", startFrame: 0, durationFrames: 180, visualMode: "manual_upload", emotionalState: "clear", requiredAssets: [], continuityRefs: [] }],
    shots,
    stages,
    assetConcepts: []
  };
  return {
    project: screenshotProject,
    prompt,
    acquisition,
    review,
    previewUrls: Object.fromEntries(assets.map((asset, index) => [asset.sha256, browserFixturePreviewUrl(index)]))
  };
}

function browserFixturePreviewUrl(index: number): string {
  const label = String(index + 1).padStart(3, "0");
  const accent = ["#f47757", "#f2b84b", "#6ac7b8"][index % 3];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920"><rect width="1080" height="1920" fill="#191513"/><rect x="48" y="48" width="984" height="1824" rx="56" fill="#28201c" stroke="${accent}" stroke-width="12"/><circle cx="790" cy="700" r="230" fill="${accent}" opacity=".22"/><rect x="110" y="1120" width="520" height="34" rx="17" fill="${accent}"/><rect x="110" y="1190" width="360" height="24" rx="12" fill="#f3eadf" opacity=".8"/><text x="110" y="280" fill="#f3eadf" font-family="sans-serif" font-size="92" font-weight="700">FRAME ${label}</text><text x="110" y="390" fill="${accent}" font-family="sans-serif" font-size="42">CREATOR STUDIO FIXTURE</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function webFallback(): LongShortFactoryApi {
  let projects: FactoryProject[] = [];
  const screenshotFixture = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("creator-studio-fixture") === "asset-intake-complete"
    ? createBrowserAssetScreenshotFixture()
    : undefined;
  if (screenshotFixture) projects = [screenshotFixture.project];
  let providerSettings: ProviderCredentialSettings = {
    providerId: "9router",
    baseUrl: "Electron main process unavailable",
    hasCredential: false
  };

  return {
    async bootstrap(): Promise<BootstrapData> {
      return {
        profiles: seedChannelProfiles,
        workspaceRoot: "Browser preview only",
        databasePath: "Electron main process unavailable",
        projects: projects.map(toSummary),
        queue: emptyQueue,
        runtime: browserRuntime
      };
    },
    async listChannelProfiles() { return seedChannelProfiles; },
    async saveChannelDna(input: { profileId: string; channelDna: ChannelDna }): Promise<ChannelProfile> {
      const profile = seedChannelProfiles.find((candidate) => candidate.id === input.profileId);
      if (!profile) throw new Error("Channel profile not found.");
      return { ...profile, channelDna: input.channelDna };
    },
    async generateCharacterPack(): Promise<ChannelProfile> { throw new Error("Character generation requires Electron main process."); },
    async retryCharacterReference(): Promise<ChannelProfile> { throw new Error("Character generation requires Electron main process."); },
    async uploadCharacterReference(): Promise<ChannelProfile> { throw new Error("Character reference upload requires Electron main process."); },
    async approveCharacterVersion(): Promise<ChannelProfile> { throw new Error("Character approval requires Electron main process."); },
    async setActiveCharacterVersion(): Promise<ChannelProfile> { throw new Error("Character selection requires Electron main process."); },
    async getCharacterPreviewUrl(): Promise<{ url: string }> { throw new Error("Character preview requires Electron main process."); },
    async runCharacterPreparation(): Promise<FactoryProject> { throw new Error("Character preparation requires Electron main process."); },
    async approveCharacterPreparation(): Promise<FactoryProject> { throw new Error("Character preparation requires Electron main process."); },
    async startProductionPreparation(): Promise<FactoryProject> { throw new Error("Production orchestration requires Electron main process."); },
    async continueAfterIdeaSelection(): Promise<FactoryProject> { throw new Error("Production orchestration requires Electron main process."); },
    async startMediaGeneration(): Promise<FactoryProject> { throw new Error("Production orchestration requires Electron main process."); },
    async retryScene(): Promise<FactoryProject> { throw new Error("Production orchestration requires Electron main process."); },
    async reviseSceneReview(): Promise<FactoryProject> { throw new Error("Production orchestration requires Electron main process."); },
    async continueAfterSceneReview(): Promise<FactoryProject> { throw new Error("Production orchestration requires Electron main process."); },
    async renderProductionPreview(): Promise<FactoryProject> { throw new Error("Production orchestration requires Electron main process."); },
    async continueAfterFinalApproval(): Promise<FactoryProject> { throw new Error("Production orchestration requires Electron main process."); },
    async routeTopic(input): Promise<ChannelRouteDecision> {
      return routeChannelProfile(seedChannelProfiles, input);
    },
    async fixtureProject(input): Promise<FactoryProject> {
      const project = createFixtureProject({ ...input, profiles: seedChannelProfiles });
      projects = [project, ...projects.filter((item) => item.id !== project.id)];
      return project;
    },
    async listProjects(): Promise<ProjectSummary[]> {
      return projects.map(toSummary);
    },
    async loadProject(projectId): Promise<FactoryProject | null> {
      return projects.find((project) => project.id === projectId) ?? null;
    },
    async deleteProject(projectId): Promise<{ ok: boolean }> {
      projects = projects.filter((project) => project.id !== projectId);
      return { ok: true };
    },
    async saveProviderCredential(_input: ProviderCredentialInput): Promise<{ providerId: string; credentialRef: string }> {
      return { providerId: "9router", credentialRef: "browser-preview" };
    },
    async loadProviderCredentialSettings(providerId: string): Promise<ProviderCredentialSettings> {
      return providerId === "9router" ? providerSettings : { providerId, baseUrl: "Electron main process unavailable", hasCredential: false };
    },
    async hasProviderCredential(providerId: string): Promise<ProviderPresence> {
      return { providerId, hasCredential: false };
    },
    async testCredentialPresence(providerId: string): Promise<ProviderPresence> {
      return { providerId, hasCredential: false };
    },
    async deleteProviderCredential(providerId: string): Promise<{ providerId: string; deleted: boolean }> {
      return { providerId, deleted: false };
    },
    async list9RouterModels() {
      return {
        status: "network_error" as const,
        models: [],
        message: "Electron main process unavailable."
      };
    },
    async save9RouterModelConfiguration(input: ProviderModelConfigurationInput): Promise<ProviderCredentialSettings> {
      providerSettings = {
        ...providerSettings,
        ...(input.textModel ? { textModel: input.textModel } : {}),
        ...(input.imageModel ? { imageModel: input.imageModel } : {}),
        ...(input.videoModel ? { videoModel: input.videoModel } : {}),
        ...(input.ttsModel ? { ttsModel: input.ttsModel } : {}),
        ...(input.sttModel ? { sttModel: input.sttModel } : {})
      };
      return providerSettings;
    },
    async load9RouterTextCertification(): Promise<TextModelCertificationResponse> {
      return {
        status: "not_tested",
        message: "Electron main process unavailable.",
        errorCategory: "credential_missing"
      };
    },
    async run9RouterTextCertification(): Promise<TextModelCertificationResponse> {
      return {
        status: "failed",
        message: "Electron main process unavailable.",
        errorCategory: "network_error"
      };
    },
    async load9RouterImageCertification(): Promise<ImageModelCertificationResponse> { return { status: "not_tested", message: "Electron main process unavailable." }; },
    async run9RouterImageCertification(): Promise<ImageModelCertificationResponse> { return { status: "failed", message: "Electron main process unavailable.", errorCategory: "credential_missing" }; },
    async loadLocalTtsSettings(): Promise<LocalTtsSettings> {
      return {
        omnivoiceBinPath: "",
        outputDir: "Electron main process unavailable",
        ttsProvider: "omnivoice-local",
        ttsVoiceProvider: "edge-tts",
        ttsVoiceId: "",
        ttsPythonPath: "",
        modelPath: "",
        language: "",
        instruct: "",
        referenceAudioPath: "",
        referenceTranscript: "",
        available: false,
        resolvedBinPath: ""
      };
    },
    async saveLocalTtsSettings(input: Omit<LocalTtsSettings, "available" | "resolvedBinPath">): Promise<LocalTtsSettings> {
      return { ...input, available: false, resolvedBinPath: input.omnivoiceBinPath };
    },
    async selectLocalTtsReferenceAudio(): Promise<{ referenceAudioPath?: string }> { throw new Error("Electron main process unavailable."); },
    async generateLocalTts(_input: GenerateLocalTtsInput): Promise<LocalTtsGenerated> {
      throw new Error("Electron main process unavailable.");
    },
    async listNineRouterTtsCatalog(_input: { provider: "edge-tts" | "google-tts"; language: string }): Promise<import("../types").NineRouterTtsCatalogResult> { throw new Error("Electron main process unavailable."); },
    async listTtsProviders(): Promise<import("../types").TtsProviderCatalog> { throw new Error("Electron main process unavailable."); },
    async previewTtsProvider(): Promise<import("../types").TtsPreviewResult> { throw new Error("Electron main process unavailable."); },
    async createTtsJob(): Promise<import("../types").TtsJob> { throw new Error("Electron main process unavailable."); },
    async getTtsJob(): Promise<import("../types").TtsJob> { throw new Error("Electron main process unavailable."); },
    async getProjectTtsJob(): Promise<import("../types").TtsJob | null> { throw new Error("Electron main process unavailable."); },
    async retryTtsJobSegment(): Promise<import("../types").TtsJob> { throw new Error("Electron main process unavailable."); },
    async cancelTtsJob(): Promise<import("../types").TtsJob> { throw new Error("Electron main process unavailable."); },
    async runDevIdeaTest(_input: { topic: string; language?: string }): Promise<DevIdeaTestResult> { throw new Error("Dev Test Lab requires Electron."); },
    async runDevImageTest(_input: { prompt: string; aspectRatio: "16:9" | "9:16" }): Promise<DevImageTestResult> { throw new Error("Dev Test Lab requires Electron."); },
    async runDevStockTest(_input: { query: string; mediaType: "image" | "video" }): Promise<DevStockTestResult> { throw new Error("Dev Test Lab requires Electron."); },
    async addCompetitorReference(input): Promise<{ status: "saved"; project: FactoryProject; message: string }> {
      const project = projects.find((item) => item.id === input.projectId);
      if (!project) throw new Error("Project not found.");
      const nextProject = {
        ...project,
        competitorReferences: [
          ...project.competitorReferences,
          {
            id: `competitor-${Date.now()}`,
            ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
            pastedTranscript: input.pastedTranscript,
            ...(input.notes ? { notes: input.notes } : {}),
            status: "draft" as const,
            included: true,
            version: 1,
            createdAt: new Date().toISOString()
          }
        ],
        referenceSet: { status: "needs_validation" as const }
      };
      projects = projects.map((item) => item.id === nextProject.id ? nextProject : item);
      return { status: "saved", project: nextProject, message: "Competitor reference saved as Draft." };
    },
    async replaceCompetitorReference(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async editCompetitorReference(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async deleteCompetitorReference(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async setReferenceIncluded(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async getReferenceChangeImpact(): Promise<{ stageIds: string[]; stageNames: string[] }> {
      return { stageIds: [], stageNames: [] };
    },
    async validateReferenceSet(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async approveReferenceSet(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async rejectReferenceSet(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async revokeReferenceSetApproval(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async runTranscriptCleaning(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async listCompetitorWorkflowRuns() {
      return [];
    },
    async markStageAttention(input): Promise<FactoryProject> {
      const project = projects.find((item) => item.id === input.projectId);
      if (!project) throw new Error("Project not found.");
      const updated = {
        ...project,
        stages: project.stages.map((stage) => stage.id === input.stageId ? {
          ...stage,
          status: "needs_attention" as const,
          attention: createStageAttention(input.stageId, input.code, input.message)
        } : stage)
      };
      projects = projects.map((item) => item.id === updated.id ? updated : item);
      return updated;
    },
    async listTranscriptCleaningArtifacts() {
      return [];
    },
    async approveTranscriptCleaning(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async rejectTranscriptCleaning(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async runReferenceSegmentation(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async listReferenceSegmentationArtifacts() {
      return [];
    },
    async approveReferenceSegmentation(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async rejectReferenceSegmentation(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async runCompetitorDna(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async listCompetitorDnaArtifacts() {
      return [];
    },
    async approveCompetitorDna(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async rejectCompetitorDna(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async runOpportunityMap(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async listOpportunityMapArtifacts() {
      return [];
    },
    async approveOpportunityMap(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async rejectOpportunityMap(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async runIdeaLab(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async approveIdea(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async editIdea(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async rejectIdeaLab(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async runOriginalityReview(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async listOriginalityReviewArtifacts() {
      return [];
    },
    async approveOriginalityReview(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async rejectOriginalityReview(): Promise<FactoryProject> {
      throw new Error("Electron main process unavailable.");
    },
    async saveResearchSources(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runResearchSourceSearch(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listResearchSourcesArtifacts() { return []; },
    async approveResearchSources(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectResearchSources(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runClaimMap(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listClaimMapArtifacts() { return []; },
    async approveClaimMap(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectClaimMap(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runOutline(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listOutlineArtifacts() { return []; },
    async approveOutline(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectOutline(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runScript(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async regenerateScript(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async editScript(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listScriptArtifacts() { return []; },
    async approveScript(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectScript(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runFactReview(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listFactReviewArtifacts() { return []; },
    async approveFactReview(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectFactReview(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runRetentionReview(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listRetentionReviewArtifacts() { return []; },
    async approveRetentionReview(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectRetentionReview(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runScenePlan(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listScenePlanArtifacts() { return []; },
    async approveScenePlan(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectScenePlan(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runShotPlan(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listShotPlanArtifacts() { return []; },
    async approveShotPlan(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectShotPlan(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runVisualRouting(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listVisualRoutingArtifacts() { return []; },
    async editVisualRouting(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async approveVisualRouting(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectVisualRouting(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runAssetConcepts(): Promise<FactoryProject> { throw new Error("Asset Concepts requires Electron main process."); },
    async listAssetConceptsArtifacts({ projectId }: { projectId: string }) { return screenshotFixture && projectId === screenshotFixture.project.id ? [({ id: "artifact-browser-fixture-concepts", status: "approved", payloadJson: { concepts: [] }, createdAt: "2026-08-06T00:00:00.000Z", updatedAt: "2026-08-06T00:00:00.000Z" } satisfies AssetConceptArtifact)] : []; },
    async runPromptPreparation(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listPromptPreparationArtifacts({ projectId }: { projectId: string }) { return screenshotFixture && projectId === screenshotFixture.project.id ? [screenshotFixture.prompt] : []; },
    async approvePromptPreparation(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectPromptPreparation(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runAssetAcquisition(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listAssetAcquisitionArtifacts({ projectId }: { projectId: string }) { return screenshotFixture && projectId === screenshotFixture.project.id ? [screenshotFixture.acquisition] : []; },
    async approveAssetAcquisition(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectAssetAcquisition(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runAssetReview(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listAssetReviewArtifacts({ projectId }: { projectId: string }) { return screenshotFixture && projectId === screenshotFixture.project.id ? [screenshotFixture.review] : []; },
    async reviseAssetReview(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async selectManualAssetUpload(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    getDroppedFilePath(): string { throw new Error("Electron main process unavailable."); },
    async approveAssetReview(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectAssetReview(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runVoiceGeneration(_input: { projectId: string; voiceId: string; force?: boolean }): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listVoiceGenerationArtifacts() { return []; },
    async approveVoiceGeneration(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectVoiceGeneration(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runSubtitlePreparation(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listSubtitlePreparationArtifacts() { return []; },
    async approveSubtitlePreparation(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectSubtitlePreparation(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async selectProjectAudio(): Promise<FactoryProject> { throw new Error("Project audio selection requires Electron main process."); },
    async runTimelineAssembly(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listTimelineAssemblyArtifacts() { return []; },
    async approveTimelineAssembly(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectTimelineAssembly(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runPreviewRender(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listPreviewRenderArtifacts() { return []; },
    async getPreviewVideoUrl(): Promise<{ url: string }> { throw new Error("Electron main process unavailable."); },
    async downloadPreviewVideo(): Promise<{ canceled: boolean; fileName?: string; savedPath?: string }> { throw new Error("Electron main process unavailable."); },
    async getAssetPreviewUrl(input: { assetSha256: string }): Promise<{ url: string }> {
      const url = screenshotFixture?.previewUrls[input.assetSha256];
      if (!url) throw new Error("Electron main process unavailable.");
      return { url };
    },
    async approvePreviewRender(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectPreviewRender(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runQa(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listQaArtifacts() { return []; },
    async approveQa(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectQa(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runCapCutDraft(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listCapCutDraftArtifacts() { return []; },
    async approveCapCutDraft(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectCapCutDraft(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async runPackagingExport(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async listPackagingExportArtifacts() { return []; },
    async approvePackagingExport(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async rejectPackagingExport(): Promise<FactoryProject> { throw new Error("Electron main process unavailable."); },
    async mockImageBatch() {
      return emptyQueue;
    }
  };
}

function toSummary(project: FactoryProject): ProjectSummary {
  const progress = resolveWorkflowProgress(project);
  const currentStage = progress.currentStageId
    ? progress.stages.find((stage) => stage.stageId === progress.currentStageId)
    : undefined;
  return {
    id: project.id,
    topic: project.topic,
    profileId: project.profileId,
    ...(project.setup.channelId !== undefined ? { channelId: project.setup.channelId } : {}),
    format: project.format,
    projectName: project.setup.projectName,
    targetLanguage: project.setup.language,
    targetDuration: project.setup.targetDuration,
    updatedAt: new Date().toISOString(),
    progressPercent: progress.percent,
    ...(currentStage ? { currentStageId: currentStage.stageId, currentStageStatus: currentStage.internalStatus } : {})
  };
}

export const factoryClient: LongShortFactoryApi = window.longShortFactory ?? webFallback();
