import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ChannelProfile, ChannelRouteDecision, FactoryProject, ProductionStatus, SubtitlePreset } from "@lsf/domain";
import { characterVersionIsApproved, resolveApprovedCharacterVersion, resolveProductionStatus, resolveWorkflowProgress, seedChannelProfiles, workflowProgressStateLabel, workflowStageDefinitions } from "@lsf/domain";
import { factoryClient } from "./services/factoryClient";
import { allRoutes, type RouteId } from "./navigation";
import { DataTable, DisabledAction, EmptyState, FormField, MetricCard, PageHeader, ScoreBar, SectionCard, SettingsList, StatusBadge, TagList } from "./components/ui";
import type {
  BootstrapData,
  LocalTtsSettings,
  ProjectSummary,
  ProviderCredentialSettings,
  ProviderPresence,
  TextModelCertificationResponse,
  ScenePlanArtifact,
  VisualRoutingArtifact,
  PromptPreparationArtifact,
  AssetReviewArtifact,
  VoiceGenerationArtifact,
  TimelineAssemblyArtifact,
  PreviewRenderArtifact,
  QaArtifact,
  CapCutDraftArtifact,
  PackagingExportArtifact,
  ImageModelCertificationResponse,
  TtsProviderCatalog, TtsProviderId
} from "./types";
import { estimatedDuration, formatDate, formatTimecode, safeRendererError, stageTone } from "./utils";
import { automaticChainForStage, characterVersionNeedsSetup, hasSemiAutomaticAttention, nextSemiAutomaticChain, type SemiAutomaticChain, type SemiAutomaticProgress } from "./semiAutomaticWorkflow";
import { AppShell, LoadingScreen } from "./layouts/AppShell";
import { ScenesScreen, ShotsScreen, VisualsScreen, visualLabel } from "./features/director/DirectorScreens";
import { Dashboard } from "./features/home/HomeScreens";
import { AssetLibraryScreen } from "./features/assets/AssetLibraryScreen";
import { ProjectOverview, stageRoute } from "./features/projects/ProjectOverview";
import { ProjectsScreen } from "./features/projects/ProjectsScreen";
import { QueueScreen } from "./features/queue/QueueScreen";
import { VoiceScreen } from "./features/voice/VoiceScreen";
import { ChannelProfilesScreen } from "./features/settings/ChannelProfilesScreen";
import { DiagnosticsScreen, SettingsScreen } from "./features/settings/SettingsScreens";
import { ProvidersScreen } from "./features/settings/ProvidersScreen";
import { CompetitorDnaScreen, IdeaLabScreen, ReferenceIntakeScreen, ScriptScreen } from "./features/story/StoryScreens";
import { ExportScreen, QaScreen, TimelineScreen } from "./features/build/BuildScreens";
import { FinalPreviewScreen } from "./features/build/FinalPreviewScreen";
import { creatorInputModeLabel, creatorPhaseStateLabel, creatorStatusLabel, workflowModeOptions } from "./creatorStudioCopy";
import "./styles.css";


const fallbackBootstrap: BootstrapData = {
  profiles: seedChannelProfiles,
  workspaceRoot: "Loading",
  databasePath: "Loading",
  projects: [],
  queue: { concurrency: 5, running: 0, jobs: [] },
  runtime: {
    sidecarPythonPath: "Loading",
    pythonExists: false,
    pythonVersion: "Loading",
    pycapcutStatus: "Loading",
    capcutInstallPath: "Loading",
    capcutInstalled: false,
    ffmpegPath: "Loading",
    ffmpegAvailable: false,
    ffmpegStatus: "Loading",
    capcutDraftDir: "Loading",
    draftDirConfigured: false,
    capcutCompatibility: "Loading",
    devTestLabEnabled: false
  }
};

const languageOptions = [
  "English",
  "Vietnamese",
  "Spanish",
  "Portuguese",
  "French",
  "German",
  "Italian",
  "Dutch",
  "Polish",
  "Turkish",
  "Arabic",
  "Hindi",
  "Indonesian",
  "Japanese",
  "Korean",
  "Thai",
  "Custom"
];

const ttsLanguageOptions: Array<{ code: string; label: string }> = [
  { code: "vi", label: "Vietnamese" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "pt", label: "Portuguese" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "tr", label: "Turkish" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "id", label: "Indonesian" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "th", label: "Thai" },
  { code: "zh", label: "Chinese" }
];

function simpleCreateLanguageOptions(profiles: ChannelProfile[], settings: LocalTtsSettings | null): string[] {
  const configured = new Set(languageOptions.filter((option) => option !== "Custom"));
  for (const profile of profiles) {
    const value = profile.language.trim();
    if (!value) continue;
    const option = ttsLanguageOptions.find((item) => item.code === ttsLanguageCode(value));
    configured.add(option?.label ?? value);
  }
  const storedLanguage = settings?.language?.trim();
  if (storedLanguage) {
    const option = ttsLanguageOptions.find((item) => item.code === ttsLanguageCode(storedLanguage));
    configured.add(option?.label ?? storedLanguage);
  }
  const storedVoice = settings?.ttsVoiceId?.trim().toLowerCase() ?? "";
  if (storedVoice.startsWith("vi-") || storedVoice.includes("/vi-")) configured.add("Vietnamese");
  return Array.from(configured).sort((left, right) => left.localeCompare(right));
}

function defaultTargetDuration(format: "long" | "short"): string {
  return format === "long" ? "8-12 minutes" : "45-60 seconds";
}

function App() {
  const [route, setRoute] = useState<RouteId>(() => routeFromHash());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [bootstrap, setBootstrap] = useState<BootstrapData>(fallbackBootstrap);
  const [selectedProject, setSelectedProject] = useState<FactoryProject | null>(null);
  const [providerPresence, setProviderPresence] = useState<ProviderPresence>({ providerId: "9router", hasCredential: false });
  const [stockPresence, setStockPresence] = useState<ProviderPresence>({ providerId: "pexels", hasCredential: false });
  const [providerSettings, setProviderSettings] = useState<ProviderCredentialSettings | null>(null);
  const [textCertification, setTextCertification] = useState<TextModelCertificationResponse>({
    status: "not_tested",
    message: "Text model has not been certified."
  });
  const [imageCertification, setImageCertification] = useState<ImageModelCertificationResponse>({
    status: "not_tested",
    message: "Image model has not been certified."
  });
  const [localTtsSettings, setLocalTtsSettings] = useState<LocalTtsSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [semiAutomaticProgress, setSemiAutomaticProgress] = useState<SemiAutomaticProgress | null>(null);
  const [semiAutomaticError, setSemiAutomaticError] = useState<string | null>(null);
  const [semiAutomaticRunning, setSemiAutomaticRunning] = useState(false);
  const semiAutomaticRunLock = useRef(false);
  const automaticResumeAttemptedProjects = useRef(new Set<string>());

  async function refresh() {
    const data = await factoryClient.bootstrap();
    setBootstrap(data);
    setLocalTtsSettings(await factoryClient.loadLocalTtsSettings());
    const settings = await factoryClient.loadProviderCredentialSettings("9router");
    setProviderSettings(settings);
    setProviderPresence({ providerId: settings.providerId, hasCredential: settings.hasCredential });
    setTextCertification(await factoryClient.load9RouterTextCertification());
    setImageCertification(await factoryClient.load9RouterImageCertification());
    setStockPresence(await factoryClient.hasProviderCredential("pexels"));
    if (selectedProject) {
      const reloaded = await factoryClient.loadProject(selectedProject.id);
      setSelectedProject(reloaded);
    }
  }

  useEffect(() => {
    void refresh()
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const nextHash = `#${route}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", nextHash);
    }
  }, [route]);

  function navigate(nextRoute: RouteId): void {
    setRoute(nextRoute);
  }

  async function openProject(projectId: string) {
    setSemiAutomaticError(null);
    setSemiAutomaticProgress(null);
    const project = await factoryClient.loadProject(projectId);
    setSelectedProject(project);
    if (!project) {
      setRoute("projects");
      return;
    }
    automaticResumeAttemptedProjects.current.delete(project.id);
    const nextChain = nextSemiAutomaticChain(project, bootstrap.profiles.find((profile) => profile.id === project.profileId));
    if (nextChain && !hasSemiAutomaticAttention(project)) {
      automaticResumeAttemptedProjects.current.add(project.id);
      navigate("project-overview");
      void startSemiAutomatic(nextChain, project);
      return;
    }
    navigate("project-overview");
  }

  useEffect(() => {
    if (loading || !selectedProject || selectedProject.setup.workflowMode !== "semi_automatic" || semiAutomaticRunLock.current) return;
    const nextChain = nextSemiAutomaticChain(selectedProject, bootstrap.profiles.find((profile) => profile.id === selectedProject.profileId));
    if (!nextChain || hasSemiAutomaticAttention(selectedProject) || automaticResumeAttemptedProjects.current.has(selectedProject.id)) return;
    automaticResumeAttemptedProjects.current.add(selectedProject.id);
    void startSemiAutomatic(nextChain, selectedProject);
  }, [loading, selectedProject]);

  async function deleteProject(projectId: string) {
    if (!window.confirm("Delete this project from SQLite? Workspace files are not removed.")) return;
    await factoryClient.deleteProject(projectId);
    if (selectedProject?.id === projectId) setSelectedProject(null);
    await refresh();
  }

  async function createDemoProject(input: {
    topic: string;
    format: "long" | "short";
    targetLanguage: string;
    selectedProfileId?: string;
    targetDuration?: string;
    projectName?: string;
    workflowMode?: "guided" | "semi_automatic" | "full_automatic";
    visualWorkflow?: "legacy" | "character_first";
    characterVersionId?: string;
    inputMode?: "topic" | "existing_script" | "reference";
    aspectRatio?: "16:9" | "9:16" | "1:1";
    visualStyle?: "vox-documentary";
    voiceId?: string;
    outputResolution?: "1080p" | "720p";
    sourceScript?: string;
    referenceUrl?: string;
    competitorReference?: {
      sourceUrl?: string;
      pastedTranscript: string;
      notes?: string;
    };
  }) {
    setSemiAutomaticError(null);
    setSemiAutomaticProgress(null);
    const project = await factoryClient.fixtureProject(input);
    setSelectedProject(project);
    await refresh();
    navigate("project-overview");
  }

  async function startSemiAutomatic(chain: SemiAutomaticChain, project: FactoryProject): Promise<void> {
    if (project.setup.workflowMode !== "semi_automatic" || semiAutomaticRunning || semiAutomaticRunLock.current) return;
    semiAutomaticRunLock.current = true;
    setSemiAutomaticRunning(true);
    setSemiAutomaticError(null);
    try {
      setSemiAutomaticProgress({ chain, completed: 0, total: 1, stageId: "production-orchestrator", message: "Running trusted production orchestration." });
      let result = chain === "reference"
        ? await factoryClient.startProductionPreparation({ projectId: project.id })
        : chain === "idea"
          ? project.approvedIdeaId
            ? await factoryClient.continueAfterIdeaSelection({ projectId: project.id, ideaId: project.approvedIdeaId })
            : project.setup.inputMode === "existing_script"
              ? await factoryClient.continueAfterIdeaSelection({ projectId: project.id, ideaId: "existing-script" })
              : await factoryClient.startProductionPreparation({ projectId: project.id })
          : chain === "assets"
            ? await factoryClient.startMediaGeneration({ projectId: project.id })
            : await factoryClient.continueAfterFinalApproval({ projectId: project.id });
      if (chain === "reference" && result.setup.inputMode === "existing_script") {
        result = await factoryClient.continueAfterIdeaSelection({ projectId: project.id, ideaId: "existing-script" });
      }
      const pausedForVoice = chain === "assets" && result.stages.find((stage) => stage.id === "voice-generation")?.status !== "approved";
      setSemiAutomaticProgress({ chain, completed: 1, total: 1, stageId: pausedForVoice ? "voice-generation" : "production-orchestrator", message: pausedForVoice ? "Scene assets are ready. Choose a voice for this project before generating audio." : "Production orchestration completed this phase." });
      setSelectedProject(result);
      navigate("project-overview");
    } catch (reason) {
      setSemiAutomaticError(safeRendererError(reason, "Production could not continue. Open Advanced Pipeline Details and retry the affected phase."));
      const persisted = await factoryClient.loadProject(project.id).catch(() => null);
      if (persisted) {
        setSelectedProject(persisted);
        navigate("project-overview");
      }
    } finally {
      semiAutomaticRunLock.current = false;
      setSemiAutomaticRunning(false);
    }
  }

  const profiles = bootstrap.profiles;
  const projectSummaries = bootstrap.projects;
  const selectedProfile = selectedProject ? profiles.find((profile) => profile.id === selectedProject.profileId) : undefined;

  return (
    <AppShell
      collapsed={sidebarCollapsed}
      onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
      route={route}
      selectedProject={selectedProject}
      selectedProfile={selectedProfile}
      projects={projectSummaries}
      queue={bootstrap.queue}
      onOpenProject={openProject}
      setRoute={navigate}
    >
      {error ? (
        <SectionCard>
          <div className="error-state">
            <strong>Application bootstrap failed</strong>
            <p>{error}</p>
          </div>
        </SectionCard>
      ) : null}
      {loading ? <LoadingScreen /> : null}
      {!loading ? (
        <RouteScreen
          route={route}
          setRoute={navigate}
          bootstrap={bootstrap}
          providerPresence={providerPresence}
          stockPresence={stockPresence}
          providerSettings={providerSettings}
          textCertification={textCertification}
          imageCertification={imageCertification}
          localTtsSettings={localTtsSettings}
          selectedProject={selectedProject}
          selectedProfile={selectedProfile}
          profiles={profiles}
          projectSummaries={projectSummaries}
          onOpenProject={openProject}
          onDeleteProject={deleteProject}
          onCreateProject={createDemoProject}
          onRefresh={refresh}
          setSelectedProject={setSelectedProject}
          setProviderPresence={setProviderPresence}
          setStockPresence={setStockPresence}
          setProviderSettings={setProviderSettings}
          setTextCertification={setTextCertification}
          setImageCertification={setImageCertification}
          startSemiAutomatic={startSemiAutomatic}
          semiAutomaticProgress={semiAutomaticProgress}
          semiAutomaticRunning={semiAutomaticRunning}
          semiAutomaticError={semiAutomaticError}
        />
      ) : null}
    </AppShell>
  );
}

function RouteScreen(props: {
  route: RouteId;
  setRoute: (route: RouteId) => void;
  bootstrap: BootstrapData;
  providerPresence: ProviderPresence;
  stockPresence: ProviderPresence;
  providerSettings: ProviderCredentialSettings | null;
  textCertification: TextModelCertificationResponse;
  imageCertification: ImageModelCertificationResponse;
  localTtsSettings: LocalTtsSettings | null;
  selectedProject: FactoryProject | null;
  selectedProfile: ChannelProfile | undefined;
  profiles: ChannelProfile[];
  projectSummaries: ProjectSummary[];
  onOpenProject: (projectId: string) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onCreateProject: (input: {
    topic: string;
    format: "long" | "short";
    targetLanguage: string;
    selectedProfileId?: string;
    targetDuration?: string;
    projectName?: string;
    workflowMode?: "guided" | "semi_automatic" | "full_automatic";
    visualWorkflow?: "legacy" | "character_first";
    characterVersionId?: string;
    inputMode?: "topic" | "existing_script" | "reference";
    aspectRatio?: "16:9" | "9:16" | "1:1";
    visualStyle?: "vox-documentary";
    voiceId?: string;
    outputResolution?: "1080p" | "720p";
    sourceScript?: string;
    referenceUrl?: string;
    competitorReference?: {
      sourceUrl?: string;
      pastedTranscript: string;
      notes?: string;
    };
  }) => Promise<void>;
  onRefresh: () => Promise<void>;
  setSelectedProject: (project: FactoryProject | null) => void;
  setProviderPresence: (presence: ProviderPresence) => void;
  setStockPresence: (presence: ProviderPresence) => void;
  setProviderSettings: (settings: ProviderCredentialSettings | null) => void;
  setTextCertification: (certification: TextModelCertificationResponse) => void;
  setImageCertification: (certification: ImageModelCertificationResponse) => void;
  startSemiAutomatic: (chain: SemiAutomaticChain, project: FactoryProject) => Promise<void>;
  semiAutomaticProgress: SemiAutomaticProgress | null;
  semiAutomaticRunning: boolean;
  semiAutomaticError: string | null;
}) {
  if (props.route === "dashboard") return <Dashboard {...props} />;
  if (props.route === "projects") return <ProjectsScreen {...props} />;
  if (props.route === "create" || props.route === "new-project") return props.route === "create" ? <SimpleCreateScreen {...props} /> : <NewProjectWizard {...props} />;
  if (props.route === "channel-profiles") return <ChannelProfilesScreen profiles={props.profiles} onRefresh={props.onRefresh} />;
  if (props.route === "production-queue") return <QueueScreen queue={props.bootstrap.queue} selectedProject={props.selectedProject} onRunDemo={props.onRefresh} />;
  if (props.route === "asset-library") return <AssetLibraryScreen selectedProject={props.selectedProject} />;
  if (props.route === "providers") return <ProvidersScreen presence={props.providerPresence} stockPresence={props.stockPresence} settings={props.providerSettings} textCertification={props.textCertification} imageCertification={props.imageCertification} setTextCertification={props.setTextCertification} setImageCertification={props.setImageCertification} setPresence={props.setProviderPresence} setStockPresence={props.setStockPresence} setSettings={props.setProviderSettings} onRefresh={props.onRefresh} />;
  if (props.route === "settings") return <SettingsScreen bootstrap={props.bootstrap} setRoute={props.setRoute} />;
  if (props.route === "diagnostics") return <DiagnosticsScreen bootstrap={props.bootstrap} presence={props.providerPresence} />;
  if (!props.selectedProject) {
    return (
      <EmptyState
        title="Open a project to view this workflow"
        detail="Project workflow screens use persisted project data. Open an existing project or create a demo project first."
        action={<button className="button primary" onClick={() => props.setRoute("projects")} type="button">Open Projects</button>}
      />
    );
  }
  if (props.route === "production") return <><ProductionScreen project={props.selectedProject} selectedProfile={props.selectedProfile} setRoute={props.setRoute} startSemiAutomatic={props.startSemiAutomatic} /><ProductionScriptPanel project={props.selectedProject} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} startSemiAutomatic={props.startSemiAutomatic} /></>;
  if (props.route === "scene-review") return <SceneReviewScreen project={props.selectedProject} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} />;
  if (props.route === "final-preview") return <FinalPreviewScreen project={props.selectedProject} localTtsSettings={props.localTtsSettings} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} startSemiAutomatic={props.startSemiAutomatic} />;
  if (props.route === "advanced-pipeline") return <AdvancedPipelineScreen project={props.selectedProject} setRoute={props.setRoute} />;
  if (props.route === "project-overview") return <ProjectOverview {...props} selectedProject={props.selectedProject} />;
  if (props.route === "reference-intake") return <ReferenceIntakeScreen project={props.selectedProject} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} startSemiAutomatic={props.startSemiAutomatic} />;
  if (props.route === "competitor-dna") return <CompetitorDnaScreen project={props.selectedProject} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} textCertification={props.textCertification} startSemiAutomatic={props.startSemiAutomatic} />;
  if (props.route === "idea-lab") return <IdeaLabScreen project={props.selectedProject} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} textCertification={props.textCertification} startSemiAutomatic={props.startSemiAutomatic} />;
  if (props.route === "script") return <ScriptScreen project={props.selectedProject} selectedProfile={props.selectedProfile} setSelectedProject={props.setSelectedProject} textCertification={props.textCertification} />;
  if (props.route === "scenes") return <ScenesScreen project={props.selectedProject} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} textCertification={props.textCertification} />;
  if (props.route === "shots") return <ShotsScreen project={props.selectedProject} setSelectedProject={props.setSelectedProject} textCertification={props.textCertification} />;
  if (props.route === "visuals") return <VisualsScreen project={props.selectedProject} textCertification={props.textCertification} imageCertification={props.imageCertification} setSelectedProject={props.setSelectedProject} setImageCertification={props.setImageCertification} startSemiAutomatic={props.startSemiAutomatic} />;
  if (props.route === "voice") return <VoiceScreen project={props.selectedProject} localTtsSettings={props.localTtsSettings} onRefresh={props.onRefresh} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} languageCode={ttsLanguageCode} />;
  if (props.route === "timeline") return <TimelineScreen project={props.selectedProject} setSelectedProject={props.setSelectedProject} startSemiAutomatic={props.startSemiAutomatic} />;
  if (props.route === "qa") return <QaScreen project={props.selectedProject} setSelectedProject={props.setSelectedProject} />;
  return <ExportScreen project={props.selectedProject} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} />;
}

function SimpleCreateScreen(props: {
  profiles: ChannelProfile[];
  localTtsSettings: LocalTtsSettings | null;
  setRoute: (route: RouteId) => void;
  onCreateProject: (input: {
    topic: string;
    format: "long" | "short";
    targetLanguage: string;
    selectedProfileId?: string;
    characterVersionId?: string;
    targetDuration?: string;
    projectName?: string;
    workflowMode?: "guided" | "semi_automatic" | "full_automatic";
    inputMode?: "topic" | "existing_script" | "reference";
    aspectRatio?: "16:9" | "9:16" | "1:1";
    visualStyle?: "vox-documentary";
    voiceId?: string;
    outputResolution?: "1080p" | "720p";
    sourceScript?: string;
    referenceUrl?: string;
    competitorReference?: { sourceUrl?: string; pastedTranscript: string; notes?: string };
  }) => Promise<void>;
}) {
  const [inputMode, setInputMode] = useState<"topic" | "existing_script" | "reference">("topic");
  const [topic, setTopic] = useState("");
  const [script, setScript] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [referenceTranscript, setReferenceTranscript] = useState("");
  const [notes, setNotes] = useState("");
  const [profileId, setProfileId] = useState(props.profiles[0]?.id ?? "");
  const selectedProfile = props.profiles.find((profile) => profile.id === profileId);
  const approvedCharacterVersions = (selectedProfile?.characterVersions ?? []).filter(characterVersionIsApproved);
  const defaultCharacterVersion = resolveApprovedCharacterVersion(selectedProfile);
  const [characterVersionId, setCharacterVersionId] = useState(defaultCharacterVersion?.id ?? "");
  const availableLanguages = simpleCreateLanguageOptions(props.profiles, props.localTtsSettings);
  const [language, setLanguage] = useState(availableLanguages.includes("Vietnamese") ? "Vietnamese" : availableLanguages[0] ?? "English");
  const [duration, setDuration] = useState("45-60 seconds");
  const [customDuration, setCustomDuration] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [voiceId, setVoiceId] = useState("");
  const [resolution, setResolution] = useState<"1080p" | "720p">("1080p");
  const [catalog, setCatalog] = useState<TtsProviderCatalog | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void factoryClient.listTtsProviders({ language: ttsLanguageCode(language) })
      .then((result) => { if (!cancelled) setCatalog(result); })
      .catch(() => { if (!cancelled) setCatalog(null); });
    return () => { cancelled = true; };
  }, [language]);

  const configuredProvider = props.localTtsSettings?.ttsProvider;
  const selectedLanguageCode = ttsLanguageCode(language);
  const voices = (catalog?.voices ?? []).filter((voice) => voice.enabled && !voice.experimental && ttsLanguageCode(voice.language) === selectedLanguageCode && (!configuredProvider || voice.provider === configuredProvider));
  const configuredLanguageCode = ttsLanguageCode(props.localTtsSettings?.language);
  const configuredVoice = props.localTtsSettings?.available && props.localTtsSettings.ttsVoiceId
    && configuredLanguageCode === selectedLanguageCode
    ? [{ key: `configured:${props.localTtsSettings.ttsVoiceId}`, label: `Configured voice (${props.localTtsSettings.ttsVoiceId})` }]
    : [];
  const voiceOptions = voices.length ? voices.map((voice) => ({ key: voice.providerVoiceId, label: `${voice.label} (${voice.provider})` })) : configuredVoice;
  const defaultVoiceKey = voiceOptions[0]?.key ?? "";
  const contentReady = inputMode === "topic" ? topic.trim().length > 0 : inputMode === "existing_script" ? script.trim().length > 0 : referenceTranscript.trim().length > 0;
  const configurationReady = duration !== "Custom" || customDuration.trim().length > 0;

  useEffect(() => {
    const nextDefault = resolveApprovedCharacterVersion(selectedProfile)?.id ?? "";
    setCharacterVersionId((current) => approvedCharacterVersions.some((version) => version.id === current) ? current : nextDefault);
  }, [profileId, selectedProfile, approvedCharacterVersions]);

  useEffect(() => {
    if (!voiceOptions.some((voice) => voice.key === voiceId)) setVoiceId(defaultVoiceKey);
  }, [defaultVoiceKey, voiceId, voiceOptions]);

  async function create(): Promise<void> {
    setMessage("");
    if (!contentReady || !configurationReady) {
      setMessage(inputMode === "topic" ? "Enter a topic to continue." : inputMode === "existing_script" ? "Paste an existing script to continue." : "Paste a reference transcript to continue.");
      if (!configurationReady) setMessage("Enter a custom target duration to continue.");
      return;
    }
    setSaving(true);
    try {
      const title = inputMode === "topic" ? topic.trim() : inputMode === "existing_script" ? "Existing script project" : "Reference project";
      await props.onCreateProject({
        topic: title,
        projectName: title.slice(0, 120),
        format: aspectRatio === "9:16" ? "short" : "long",
        targetLanguage: language,
        ...(profileId ? { selectedProfileId: profileId } : {}),
        targetDuration: duration === "Custom" ? customDuration.trim() : duration,
        workflowMode: "semi_automatic",
        inputMode,
        aspectRatio,
        visualStyle: "vox-documentary",
        ...(characterVersionId ? { characterVersionId } : {}),
        ...(voiceId ? { voiceId: voiceId.startsWith("configured:") ? voiceId.slice("configured:".length) : voiceId } : {}),
        outputResolution: resolution,
        ...(inputMode === "existing_script" ? { sourceScript: script } : {}),
        ...(inputMode === "reference" ? {
          ...(referenceUrl.trim() ? { referenceUrl: referenceUrl.trim() } : {}),
          competitorReference: { ...(referenceUrl.trim() ? { sourceUrl: referenceUrl.trim() } : {}), pastedTranscript: referenceTranscript, ...(notes.trim() ? { notes: notes.trim() } : {}) }
        } : {})
      });
    } catch (error) {
      setMessage(safeRendererError(error, "The project could not be created. Check the configuration and retry."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Create Video Project" description="Choose the source, VOX Documentary style, an available voice, and output settings. Internal production stages run automatically when valid." />
      <div className="form-grid">
        <FormField label="Input mode" htmlFor="simple-input-mode">
          <select id="simple-input-mode" value={inputMode} onChange={(event) => setInputMode(event.target.value as typeof inputMode)}>
            <option value="topic">Topic</option>
            <option value="existing_script">Existing Script</option>
            <option value="reference">Reference</option>
          </select>
        </FormField>
        <FormField label="Channel profile" htmlFor="simple-channel-profile">
          <select id="simple-channel-profile" value={profileId} onChange={(event) => setProfileId(event.target.value)}>
            {props.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select>
        </FormField>
        <FormField label="Language" htmlFor="simple-language">
          <select id="simple-language" value={language} onChange={(event) => setLanguage(event.target.value)}>
            {availableLanguages.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </FormField>
        <FormField label="Target duration" htmlFor="simple-duration">
          <select id="simple-duration" value={duration} onChange={(event) => setDuration(event.target.value)}>
            {['30-45 seconds', '45-60 seconds', '60-90 seconds', '2-3 minutes', '5-8 minutes', 'Custom'].map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </FormField>
        {duration === "Custom" ? <FormField label="Custom duration" htmlFor="simple-custom-duration" hint="Describe the target length, for example 90-120 seconds."><input id="simple-custom-duration" value={customDuration} onChange={(event) => setCustomDuration(event.target.value)} placeholder="90-120 seconds" /></FormField> : null}
        <FormField label="Aspect ratio" htmlFor="simple-aspect-ratio">
          <select id="simple-aspect-ratio" value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as typeof aspectRatio)}>
            <option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option>
          </select>
        </FormField>
        <FormField label="Visual style" htmlFor="simple-visual-style">
          <select id="simple-visual-style" value="vox-documentary" disabled><option value="vox-documentary">VOX Documentary</option></select>
        </FormField>
        <FormField label="Teacher character" htmlFor="simple-character-version" hint={approvedCharacterVersions.length ? "The selected approved version is snapshotted into this project." : "No approved version yet. Create the project, then approve one in Channel Profiles."}>
          <select id="simple-character-version" value={characterVersionId} onChange={(event) => setCharacterVersionId(event.target.value)}>
            <option value="">Select after creation</option>
            {approvedCharacterVersions.map((version) => <option key={version.id} value={version.id}>{version.name} v{version.version}{selectedProfile?.activeCharacterVersionId === version.id ? " (active)" : ""}</option>)}
          </select>
        </FormField>
        <FormField label="Voice" htmlFor="simple-voice" hint={voiceOptions.length ? "Available configured voices only." : "No available voice preset was detected. The project will need attention before voice generation."}>
          <select id="simple-voice" value={voiceId} onChange={(event) => setVoiceId(event.target.value)}>
            <option value="">Choose an available voice</option>
            {voiceOptions.map((voice) => <option key={voice.key} value={voice.key}>{voice.label}</option>)}
          </select>
        </FormField>
        <FormField label="Output resolution" htmlFor="simple-resolution">
          <select id="simple-resolution" value={resolution} onChange={(event) => setResolution(event.target.value as typeof resolution)}><option value="1080p">1080p</option><option value="720p">720p</option></select>
        </FormField>
      </div>
      <SectionCard title="Source material" description="Free-form text is limited to your topic, script, reference, and production notes.">
        {inputMode === "topic" ? <FormField label="Topic" htmlFor="simple-topic"><textarea id="simple-topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="What should the video explain?" /></FormField> : null}
        {inputMode === "existing_script" ? <FormField label="Existing script" htmlFor="simple-script"><textarea id="simple-script" value={script} onChange={(event) => setScript(event.target.value)} placeholder="Paste your script here" /></FormField> : null}
        {inputMode === "reference" ? <div className="form-grid"><FormField label="Reference URL" htmlFor="simple-reference-url"><input id="simple-reference-url" value={referenceUrl} onChange={(event) => setReferenceUrl(event.target.value)} placeholder="Optional source URL" /></FormField><FormField label="Reference transcript" htmlFor="simple-reference-transcript"><textarea id="simple-reference-transcript" value={referenceTranscript} onChange={(event) => setReferenceTranscript(event.target.value)} placeholder="Paste the competitor transcript/reference" /></FormField><FormField label="Notes" htmlFor="simple-reference-notes"><textarea id="simple-reference-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional notes" /></FormField></div> : null}
      </SectionCard>
      {message ? <p className="error-message">{message}</p> : null}
      <div className="button-row"><button className="button primary" type="button" disabled={saving || !contentReady || !configurationReady} onClick={() => void create()}>{saving ? "Creating..." : "Create Video Project"}</button><button className="button secondary" type="button" onClick={() => props.setRoute("projects")}>Cancel</button></div>
    </>
  );
}

function ProductionScreen(props: { project: FactoryProject; selectedProfile: ChannelProfile | undefined; setRoute: (route: RouteId) => void; startSemiAutomatic: (chain: SemiAutomaticChain, project: FactoryProject) => Promise<void> }) {
  const status = resolveProductionStatus(props.project);
  const nextChain = nextSemiAutomaticChain(props.project);
  const characterNeedsSetup = characterVersionNeedsSetup(props.project, props.selectedProfile);
  const voiceReady = props.project.stages.find((stage) => stage.id === "voice-generation")?.status === "approved";
  const nextRoute = characterNeedsSetup ? "channel-profiles" : status === "waiting_for_idea" ? "idea-lab" : status === "needs_scene_review" ? "scene-review" : !voiceReady && props.project.stages.find((stage) => stage.id === "asset-review")?.status === "approved" ? "voice" : status === "needs_final_review" ? "final-preview" : "advanced-pipeline";
  const attentionStage = props.project.stages.find((stage) => stage.status === "needs_attention" || stage.status === "failed");
  return <><PageHeader eyebrow="Production" title="Preparing your video" description="The application runs internal workflow stages automatically and brings you back only when your input is needed." actions={nextChain ? <button className="button primary" type="button" onClick={() => void props.startSemiAutomatic(nextChain, props.project)}>Continue production</button> : <button className="button secondary" type="button" onClick={() => props.setRoute(nextRoute)}>{characterNeedsSetup ? "Set up channel character" : "Open next step"}</button>} /><section className="metric-grid"><MetricCard label="Production status" value={creatorStatusLabel(status)} tone={status === "needs_attention" || status === "failed" ? "warning" : status === "completed" ? "success" : "info"} /><MetricCard label="Input mode" value={creatorInputModeLabel(props.project.setup.inputMode ?? "topic")} /><MetricCard label="Style" value="VOX Documentary" /><MetricCard label="Scenes" value={props.project.scenes.length} /></section><SectionCard title="What happens next" description={characterNeedsSetup ? "Approve a channel character before Visual Routing can continue." : status === "needs_attention" ? "A persisted internal failure needs an explicit action before production can continue." : "Non-blocking internal stages remain hidden from the default production path."}><StatusBadge tone={status === "needs_attention" || status === "failed" ? "danger" : "info"}>{creatorStatusLabel(status)}</StatusBadge><p>{characterNeedsSetup ? "Open Channel Profiles, approve the active teacher character, then return to production." : status === "waiting_for_idea" ? "Choose one idea to set the creative direction." : status === "needs_scene_review" ? "Review scenes and regenerate only the ones that need changes." : status === "needs_final_review" ? "Review the real preview before exporting." : status === "completed" ? "Your project is complete." : status === "needs_attention" || status === "failed" ? "Open Advanced Pipeline Details to see the safe reason and retry action." : "Content preparation and production are in progress."}</p></SectionCard>{attentionStage ? <SectionCard title={`Needs attention: ${attentionStage.name}`} description="Production stopped at this phase; no dependent stage will continue until it is retried successfully."><p><strong>Affected phase:</strong> {attentionStage.attention?.phase ?? attentionStage.name}</p><p><strong>Safe reason:</strong> {attentionStage.attention?.safeReason ?? attentionStage.attention?.message ?? "The phase reported a failure without a detailed message."}</p>{attentionStage.attention?.failedItem ? <p><strong>Failed item:</strong> {attentionStage.attention.failedItem}</p> : null}<p><strong>Recommended action:</strong> {attentionStage.attention?.recommendedAction ?? "Review stage"}</p><p><strong>Retry action:</strong> {attentionStage.attention?.retryAction ?? "Retry stage"}</p><div className="button-row">{(attentionStage.attention?.actions ?? []).map((action) => <button className="button secondary compact" type="button" key={`${action.label}-${action.route ?? "stage"}`} onClick={() => props.setRoute(stageRoute(action.route ?? attentionStage.id))}>{action.label}</button>)}<button className="button primary compact" type="button" onClick={() => props.setRoute(stageRoute(attentionStage.id))}>Open affected phase</button></div></SectionCard> : null}<AdvancedPipelineDetails project={props.project} setRoute={props.setRoute} /></>;
}

function ProductionScriptPanel(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; setRoute: (route: RouteId) => void; startSemiAutomatic: (chain: SemiAutomaticChain, project: FactoryProject) => Promise<void> }) {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  if (!props.project.scriptSections.length) return null;
  const status = resolveProductionStatus(props.project);
  const scriptApproved = props.project.stages.find((stage) => stage.id === "script")?.status === "approved";
  const nextChain = nextSemiAutomaticChain(props.project);
  const nextRoute = status === "needs_scene_review" ? "scene-review" : status === "needs_final_review" ? "final-preview" : "advanced-pipeline";
  async function regenerateScript(): Promise<void> {
    setRunning(true);
    setMessage("");
    try {
      const project = await factoryClient.regenerateScript({ projectId: props.project.id });
      props.setSelectedProject(project);
      setMessage("Script regenerated. Review it before continuing production.");
    } catch (error) {
      setMessage(`Script regeneration failed: ${safeRendererError(error)}`);
    } finally {
      setRunning(false);
    }
  }
  function continueProduction(): void {
    if (!scriptApproved) {
      props.setRoute("script");
      return;
    }
    if (nextChain) void props.startSemiAutomatic(nextChain, props.project);
    else props.setRoute(nextRoute);
  }
  return <SectionCard title="Prepared script" description="Review the prepared narration here. Script editing and regeneration remain optional unless a blocking finding requires attention."><div className="script-preview-list">{props.project.scriptSections.map((section) => <article className="script-block" key={section.id}><h3>{section.purpose}</h3><p>{section.narration}</p><small>{section.estimatedSeconds}s · {section.estimatedWords} words</small></article>)}</div><div className="button-row"><button className="button secondary" type="button" onClick={() => props.setRoute("script")}>Edit Script</button>{props.project.setup.inputMode !== "existing_script" ? <button className="button secondary" type="button" disabled={running} onClick={() => void regenerateScript()}>{running ? "Regenerating..." : "Regenerate Script"}</button> : null}<button className="button primary" type="button" onClick={continueProduction}>{scriptApproved ? "Continue" : "Review Script"}</button></div>{message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}</SectionCard>;
}

function AdvancedPipelineDetails(props: { project: FactoryProject; setRoute: (route: RouteId) => void }) {
  const progress = resolveWorkflowProgress(props.project);
  return <SectionCard title="Advanced Pipeline Details" description="Read-only internal stages, runs, artifacts, and safe failure state for debugging and recovery."><details><summary>Show {workflowStageDefinitions.length} internal stages</summary><div className="workflow-list">{workflowStageDefinitions.map((definition) => { const stage = props.project.stages.find((item) => item.id === definition.id); const presentation = progress.stages.find((item) => item.stageId === definition.id)!; return <div className="workflow-stage" key={definition.id}><span>{definition.order}. {definition.name}</span><StatusBadge tone={stageTone(presentation.state)}>{workflowProgressStateLabel(presentation.state)}</StatusBadge><small>{presentation.state === "not_applicable" ? "Not used for this project input." : presentation.state === "optional" ? "Optional output; it does not block Packaging Export." : `Internal status: ${creatorStatusLabel(presentation.internalStatus)}${stage?.attention?.message ? ` - ${stage.attention.message}` : stage?.dependsOn.length ? ` - Depends on: ${stage.dependsOn.join(", ")}` : ""}`}</small>{definition.id === "preview-render" ? <button className="button secondary compact" type="button" onClick={() => props.setRoute("final-preview")}>Open final preview</button> : definition.id === "capcut-draft" || definition.id === "packaging-export" ? <button className="button secondary compact" type="button" onClick={() => props.setRoute("export")}>Open export</button> : null}</div>; })}</div></details><button className="button secondary compact" type="button" onClick={() => props.setRoute("advanced-pipeline")}>Open diagnostics view</button></SectionCard>;
}

function AdvancedPipelineScreen(props: { project: FactoryProject; setRoute: (route: RouteId) => void }) {
  return <><PageHeader title="Advanced Pipeline Details" description="Internal stages remain available for debugging, history, and manual recovery." /><AdvancedPipelineDetails project={props.project} setRoute={props.setRoute} /></>;
}

function SceneReviewScreen(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; setRoute: (route: RouteId) => void }) {
  const [artifacts, setArtifacts] = useState<AssetReviewArtifact[]>([]);
  const [promptArtifacts, setPromptArtifacts] = useState<PromptPreparationArtifact[]>([]);
  const [routingArtifacts, setRoutingArtifacts] = useState<VisualRoutingArtifact[]>([]);
  const [scenePlanArtifacts, setScenePlanArtifacts] = useState<ScenePlanArtifact[]>([]);
  const [voiceArtifacts, setVoiceArtifacts] = useState<VoiceGenerationArtifact[]>([]);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [editingPrompt, setEditingPrompt] = useState<{ shotId: string; positivePrompt: string; negativePrompt: string } | null>(null);
  const [editingDirection, setEditingDirection] = useState<{ shotId: string; framing: string; cameraAngle: string; cameraMovement: string; subjectAction: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh(): Promise<AssetReviewArtifact[]> {
    const [next, prompts, routing, scenePlans, voices] = await Promise.all([
      factoryClient.listAssetReviewArtifacts({ projectId: props.project.id }),
      factoryClient.listPromptPreparationArtifacts({ projectId: props.project.id }),
      factoryClient.listVisualRoutingArtifacts({ projectId: props.project.id }),
      factoryClient.listScenePlanArtifacts({ projectId: props.project.id }),
      factoryClient.listVoiceGenerationArtifacts({ projectId: props.project.id })
    ]);
    setArtifacts(next);
    setPromptArtifacts(prompts);
    setRoutingArtifacts(routing);
    setScenePlanArtifacts(scenePlans);
    setVoiceArtifacts(voices);
    const reviewArtifact = next.find((artifact) => artifact.status === "needs_review") ?? next.find((artifact) => artifact.status === "approved");
    const urls = await Promise.all((reviewArtifact?.payloadJson.assets ?? []).map(async (item) => {
      try {
        return [item.asset.sha256, (await factoryClient.getAssetPreviewUrl({ projectId: props.project.id, artifactId: reviewArtifact!.id, assetSha256: item.asset.sha256 })).url] as const;
      } catch {
        return null;
      }
    }));
    setAssetUrls(Object.fromEntries(urls.filter((item): item is readonly [string, string] => item !== null)));
    return next;
  }

  useEffect(() => { void refresh(); }, [props.project.id]);

  async function perform(action: () => Promise<FactoryProject>, success: string): Promise<FactoryProject | null> {
    setRunning(true);
    setMessage("");
    try {
      const next = await action();
      const updated = await factoryClient.loadProject(props.project.id) ?? next;
      props.setSelectedProject(updated);
      await refresh();
      setMessage(success);
      return updated;
    } catch (error) {
      setMessage(safeRendererError(error, "Scene Review could not save that change. Check the selected item and retry."));
      return null;
    } finally {
      setRunning(false);
    }
  }

  async function approveScene(sceneId: string): Promise<FactoryProject> {
    let refreshed = await refresh();
    let review = refreshed.find((artifact) => artifact.status === "needs_review") ?? refreshed.find((artifact) => artifact.status === "approved");
    if (!review) throw new Error("No reviewable scene assets exist.");
    let pending = review.payloadJson.assets.find((item) => props.project.shots.some((shot) => shot.id === item.asset.shotId && shot.sceneId === sceneId) && item.reviewStatus === "needs_review");
    while (pending) {
      await factoryClient.reviseAssetReview({ projectId: props.project.id, artifactId: review.id, assetSha256: pending.asset.sha256, action: "approve" });
      refreshed = await refresh();
      review = refreshed.find((artifact) => artifact.status === "needs_review") ?? refreshed.find((artifact) => artifact.status === "approved");
      if (!review) break;
      pending = review.payloadJson.assets.find((item) => props.project.shots.some((shot) => shot.id === item.asset.shotId && shot.sceneId === sceneId) && item.reviewStatus === "needs_review");
    }
    refreshed = await refresh();
    review = refreshed.find((artifact) => artifact.status === "needs_review") ?? refreshed.find((artifact) => artifact.status === "approved");
    let unassigned = review?.payloadJson.assets.find((item) => props.project.shots.some((shot) => shot.id === item.asset.shotId && shot.sceneId === sceneId) && item.reviewStatus === "approved" && !item.assignedShotId);
    while (review && unassigned) {
      await factoryClient.reviseAssetReview({ projectId: props.project.id, artifactId: review.id, assetSha256: unassigned.asset.sha256, action: "assign", shotId: unassigned.asset.shotId });
      refreshed = await refresh();
      review = refreshed.find((artifact) => artifact.status === "needs_review") ?? refreshed.find((artifact) => artifact.status === "approved");
      unassigned = review?.payloadJson.assets.find((item) => props.project.shots.some((shot) => shot.id === item.asset.shotId && shot.sceneId === sceneId) && item.reviewStatus === "approved" && !item.assignedShotId);
    }
    refreshed = await refresh();
    const finalReview = refreshed.find((artifact) => artifact.status === "needs_review") ?? refreshed.find((artifact) => artifact.status === "approved");
    if (finalReview?.payloadJson.assets.every((item) => item.reviewStatus === "approved" && Boolean(item.assignedShotId))) {
      if (finalReview.status === "approved") return factoryClient.continueAfterSceneReview({ projectId: props.project.id });
      const approved = await factoryClient.approveAssetReview({ projectId: props.project.id });
      if (approved.setup.workflowMode === "semi_automatic") return factoryClient.continueAfterSceneReview({ projectId: props.project.id });
      return await factoryClient.loadProject(props.project.id) ?? approved;
    }
    return await factoryClient.loadProject(props.project.id) ?? props.project;
  }

  async function revise(input: Parameters<typeof factoryClient.reviseSceneReview>[0], success: string): Promise<void> {
    await perform(() => factoryClient.reviseSceneReview(input), success);
  }

  const review = artifacts.find((artifact) => artifact.status === "needs_review") ?? artifacts.find((artifact) => artifact.status === "approved");
  const promptArtifact = promptArtifacts.find((artifact) => artifact.status === "approved" || artifact.status === "needs_review");
  const routingArtifact = routingArtifacts.find((artifact) => artifact.status === "approved" || artifact.status === "needs_review");
  const scenePlanArtifact = scenePlanArtifacts.find((artifact) => artifact.status === "approved" || artifact.status === "needs_review");
  const voiceArtifact = voiceArtifacts.find((artifact) => artifact.status === "approved" || artifact.status === "needs_review");
  const visualModes = ["reuse", "document", "diagram", "stock_image", "stock_video", "ai_image", "ai_video", "manual_upload"] as const;

  return (
    <>
      <PageHeader title="Scene Review" description="Review real scene media, narration, direction, prompts, and voice readiness. Changes create persisted revisions and stay scoped to the selected scene." actions={<button className="button secondary" type="button" onClick={() => props.setRoute("visuals")}>Open detailed visual controls</button>} />
      {props.project.scenes.length ? <div className="scene-grid">{props.project.scenes.map((scene, index) => {
        const sceneShots = props.project.shots.filter((shot) => shot.sceneId === scene.id);
        const sceneShotIds = new Set(sceneShots.map((shot) => shot.id));
        const items = review?.payloadJson.assets.filter((item) => sceneShotIds.has(item.asset.shotId)) ?? [];
        const ready = items.length > 0 && items.every((item) => item.reviewStatus === "approved" && Boolean(item.assignedShotId));
        const canRegenerate = sceneShots.some((shot) => shot.visualMode === "ai_image");
        return <SectionCard title={`Scene ${index + 1}`} key={scene.id}>
          <p><strong>Narration:</strong> {scene.narration}</p>
          <p><strong>Duration:</strong> {formatTimecode(scene.durationFrames, props.project.timeline.fps)}</p>
          <p><strong>Visual purpose:</strong> {scene.purpose}</p>
          <div className="form-grid">
            <FormField label="VOX scene type" htmlFor={`scene-type-${scene.id}`}>
              <select id={`scene-type-${scene.id}`} value={scene.visualMode} disabled={running || !routingArtifact} onChange={(event) => routingArtifact ? void revise({ projectId: props.project.id, artifactId: routingArtifact.id, action: "change_scene_type", sceneId: scene.id, visualMode: event.target.value as FactoryProject["shots"][number]["visualMode"] }, "VOX scene type updated; regenerate this scene when ready.") : undefined}>
                {visualModes.map((mode) => <option key={mode} value={mode}>{visualLabel(mode)}</option>)}
              </select>
            </FormField>
          </div>
          {sceneShots.length ? sceneShots.map((shot) => {
            const item = items.find((candidate) => candidate.asset.shotId === shot.id);
            const prompt = promptArtifact?.payloadJson.prompts.find((candidate) => candidate.shotId === shot.id);
            const voiceSegment = voiceArtifact?.payloadJson.segments.find((segment) => segment.scriptSectionId === scene.scriptSectionId);
            return <div className="section-card" key={shot.id}>
              <p><strong>{shot.id}</strong> - {shot.purpose}</p>
              <p><strong>Generation prompt:</strong> {prompt?.positivePrompt ?? "Not prepared"}</p>
              <p><strong>Prompt status:</strong> {prompt ? "ready" : "missing"} - <strong>Voice segment:</strong> {voiceSegment ? (voiceArtifact?.status === "approved" ? "ready" : creatorStatusLabel(voiceArtifact?.status ?? "pending")) : "pending"}</p>
              {item ? <div><p><strong>Asset status:</strong> {creatorStatusLabel(item.reviewStatus)} {item.assignedShotId ? `- assigned to ${item.assignedShotId}` : "- unassigned"}</p>{assetUrls[item.asset.sha256] ? <img src={assetUrls[item.asset.sha256]} alt={`Preview for ${shot.id}`} style={{ maxWidth: "100%", maxHeight: 240, objectFit: "contain" }} /> : <StatusBadge tone="warning">Preview unavailable</StatusBadge>}</div> : <StatusBadge tone="warning">No generated asset yet</StatusBadge>}
              <div className="button-row">
                {promptArtifact ? <button className="button compact" type="button" disabled={running} onClick={() => setEditingPrompt({ shotId: shot.id, positivePrompt: prompt?.positivePrompt ?? "", negativePrompt: prompt?.negativePrompt ?? "" })}>Edit Prompt</button> : null}
                {routingArtifact ? <button className="button compact" type="button" disabled={running} onClick={() => setEditingDirection({ shotId: shot.id, framing: shot.framing, cameraAngle: shot.cameraAngle, cameraMovement: shot.cameraMovement, subjectAction: shot.subjectAction })}>Adjust Direction</button> : null}
                {review?.status === "needs_review" ? <button className="button secondary compact" type="button" disabled={running || !review} onClick={() => void perform(() => factoryClient.selectManualAssetUpload({ projectId: props.project.id, artifactId: review!.id, shotId: shot.id }), "Replacement image imported and ready for review.")}>Upload Replacement</button> : null}
                {item?.reviewStatus === "needs_review" && review?.status === "needs_review" ? <button className="button compact" type="button" disabled={running} onClick={() => void perform(() => factoryClient.reviseAssetReview({ projectId: props.project.id, artifactId: review!.id, assetSha256: item.asset.sha256, action: "approve" }), "Scene asset approved.")}>Approve Asset</button> : null}
                {item?.reviewStatus === "approved" && !item.assignedShotId && review?.status === "needs_review" ? <button className="button compact" type="button" disabled={running} onClick={() => void perform(() => factoryClient.reviseAssetReview({ projectId: props.project.id, artifactId: review!.id, assetSha256: item.asset.sha256, action: "assign", shotId: item.asset.shotId }), "Scene asset assigned.")}>Assign Asset</button> : null}
              </div>
              {editingPrompt?.shotId === shot.id ? <div className="form-grid"><FormField label="Positive prompt" htmlFor={`prompt-positive-${shot.id}`}><textarea id={`prompt-positive-${shot.id}`} value={editingPrompt.positivePrompt} onChange={(event) => setEditingPrompt({ ...editingPrompt, positivePrompt: event.target.value })} /></FormField><FormField label="Negative prompt" htmlFor={`prompt-negative-${shot.id}`}><textarea id={`prompt-negative-${shot.id}`} value={editingPrompt.negativePrompt} onChange={(event) => setEditingPrompt({ ...editingPrompt, negativePrompt: event.target.value })} /></FormField><div className="button-row"><button className="button primary compact" type="button" disabled={running || !promptArtifact} onClick={() => promptArtifact && void revise({ projectId: props.project.id, artifactId: promptArtifact.id, action: "edit_prompt", shotId: shot.id, positivePrompt: editingPrompt.positivePrompt, negativePrompt: editingPrompt.negativePrompt }, "Generation prompt updated; regenerate this scene when ready.").then(() => setEditingPrompt(null))}>Save Prompt</button><button className="button secondary compact" type="button" onClick={() => setEditingPrompt(null)}>Cancel</button></div></div> : null}
              {editingDirection?.shotId === shot.id ? <div className="form-grid"><FormField label="Framing" htmlFor={`direction-framing-${shot.id}`}><input id={`direction-framing-${shot.id}`} value={editingDirection.framing} onChange={(event) => setEditingDirection({ ...editingDirection, framing: event.target.value })} /></FormField><FormField label="Camera angle" htmlFor={`direction-angle-${shot.id}`}><input id={`direction-angle-${shot.id}`} value={editingDirection.cameraAngle} onChange={(event) => setEditingDirection({ ...editingDirection, cameraAngle: event.target.value })} /></FormField><FormField label="Camera movement" htmlFor={`direction-movement-${shot.id}`}><input id={`direction-movement-${shot.id}`} value={editingDirection.cameraMovement} onChange={(event) => setEditingDirection({ ...editingDirection, cameraMovement: event.target.value })} /></FormField><FormField label="Subject action" htmlFor={`direction-action-${shot.id}`}><textarea id={`direction-action-${shot.id}`} value={editingDirection.subjectAction} onChange={(event) => setEditingDirection({ ...editingDirection, subjectAction: event.target.value })} /></FormField><div className="button-row"><button className="button primary compact" type="button" disabled={running || !routingArtifact} onClick={() => routingArtifact && void revise({ projectId: props.project.id, artifactId: routingArtifact.id, action: "edit_direction", shotId: shot.id, framing: editingDirection.framing, cameraAngle: editingDirection.cameraAngle, cameraMovement: editingDirection.cameraMovement, subjectAction: editingDirection.subjectAction }, "Scene direction updated; regenerate this scene when ready.").then(() => setEditingDirection(null))}>Save Direction</button><button className="button secondary compact" type="button" onClick={() => setEditingDirection(null)}>Cancel</button></div></div> : null}
            </div>;
          }) : <StatusBadge tone="warning">No shots are assigned to this scene.</StatusBadge>}
          <div className="button-row"><button className="button secondary compact" type="button" disabled={running || !canRegenerate} title={canRegenerate ? undefined : "Regeneration is available only for scenes with AI Image media."} onClick={() => void perform(() => factoryClient.retryScene({ projectId: props.project.id, sceneId: scene.id }), "Scene regeneration is ready for review.")}>Regenerate Scene</button><button className="button primary compact" type="button" disabled={running || !ready} onClick={() => void perform(() => approveScene(scene.id), "Scene approved.").then((updated) => { if (updated?.stages.find((stage) => stage.id === "asset-review")?.status === "approved") props.setRoute("project-overview"); })}>Approve Scene</button>{scenePlanArtifact && props.project.scenes.length > 1 ? <button className="button danger compact" type="button" disabled={running} onClick={() => { if (window.confirm("Remove this scene and its dependent media?")) void revise({ projectId: props.project.id, artifactId: scenePlanArtifact.id, action: "remove_scene", sceneId: scene.id }, "Scene removed; affected media and preview are stale."); }}>Remove Scene</button> : null}</div>
        </SectionCard>;
      })}</div> : <EmptyState title="Scenes are not ready yet" detail="Production will create the scene list after content preparation." action={<button className="button primary" type="button" onClick={() => props.setRoute("production")}>Back to Production</button>} />}
      {message ? <p className={message.toLowerCase().includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}
    </>
  );
}

function NewProjectWizard(props: {
  profiles: ChannelProfile[]; 
  providerPresence: ProviderPresence;
  stockPresence: ProviderPresence;
  providerSettings: ProviderCredentialSettings | null;
  textCertification: TextModelCertificationResponse;
  imageCertification: ImageModelCertificationResponse;
  bootstrap: BootstrapData;
  localTtsSettings: LocalTtsSettings | null;
  setRoute: (route: RouteId) => void;
  onCreateProject: (input: {
    topic: string;
    format: "long" | "short";
    targetLanguage: string;
    selectedProfileId?: string;
    targetDuration?: string;
    projectName?: string;
    workflowMode?: "guided" | "semi_automatic" | "full_automatic";
    visualWorkflow?: "legacy" | "character_first";
    characterVersionId?: string;
    competitorReference?: {
      sourceUrl?: string;
      pastedTranscript: string;
      notes?: string;
    };
  }) => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [topic, setTopic] = useState("What did Aaron's breastpiece symbolize?");
  const [projectName, setProjectName] = useState("");
  const [format, setFormat] = useState<"long" | "short">("long");
  const [languageChoice, setLanguageChoice] = useState("Vietnamese");
  const [customLanguage, setCustomLanguage] = useState("");
  const [targetDuration, setTargetDuration] = useState("");
  const [workflowMode, setWorkflowMode] = useState<"guided" | "semi_automatic" | "full_automatic">("semi_automatic");
  const [competitorUrl, setCompetitorUrl] = useState("");
  const [competitorScript, setCompetitorScript] = useState("");
  const [competitorNotes, setCompetitorNotes] = useState("");
  const [message, setMessage] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [selectedCharacterVersionId, setSelectedCharacterVersionId] = useState<string | undefined>(undefined);
  const [decision, setDecision] = useState<ChannelRouteDecision | null>(null);
  const [saving, setSaving] = useState(false);
  const routedProfile = props.profiles.find((profile) => profile.id === (selectedProfileId || decision?.selectedProfileId));
  const characterVersions = (routedProfile?.characterVersions ?? []).filter(characterVersionIsApproved);
  const selectedCharacterVersion = characterVersions.find((version) => version.id === selectedCharacterVersionId) ?? characterVersions.find((version) => version.id === routedProfile?.activeCharacterVersionId);
  const targetLanguage = languageChoice === "Custom" ? customLanguage.trim() : languageChoice;
  const effectiveTargetDuration = targetDuration.trim() || defaultTargetDuration(format);
  // Provider capability gates belong to individual production stages, not project creation.
  const setupReady = Boolean(targetLanguage.trim());
  const missingSetupMessage = setupReady ? "" : "Choose a target language before creating the project.";

  async function routeTopic() {
    setMessage("");
    if (!setupReady) {
      setMessage(`Setup is incomplete. Finish these items before creating a project. ${missingSetupMessage}`);
      return;
    }
    if (!targetLanguage.trim()) return;
    const input = {
      topic,
      format,
      targetLanguage,
      ...(selectedProfileId ? { selectedProfileId } : {})
    };
    setDecision(await factoryClient.routeTopic(input));
    setStep(2);
  }

  async function create() {
    setMessage("");
    if (!setupReady) {
      setMessage(`Setup is incomplete. Finish these items before creating a project. ${missingSetupMessage}`);
      return;
    }
    setSaving(true);
    try {
      const competitorReference = competitorScript.trim()
        ? {
            ...(competitorUrl.trim() ? { sourceUrl: competitorUrl.trim() } : {}),
            pastedTranscript: competitorScript,
            ...(competitorNotes.trim() ? { notes: competitorNotes.trim() } : {})
          }
        : undefined;
      const routedProfileId = selectedProfileId || decision?.selectedProfileId;
      await props.onCreateProject({
        topic,
        projectName: projectName.trim() || topic,
        format,
        targetLanguage: targetLanguage.trim() || "English",
        targetDuration: effectiveTargetDuration,
        workflowMode,
        ...(competitorReference ? { competitorReference } : {}),
        ...(routedProfileId ? { selectedProfileId: routedProfileId } : {}),
        ...(workflowMode === "semi_automatic" ? { visualWorkflow: "character_first" as const } : { visualWorkflow: "legacy" as const }),
        ...(selectedCharacterVersion?.id ? { characterVersionId: selectedCharacterVersion.id } : {})
      });
    } catch (error) {
      setMessage(`Project create failed: ${safeRendererError(error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Bắt đầu một video mới" title="Tạo dự án" description="Chốt brief trước. Bạn có thể tạo ảnh thủ công trong GG Lab mà không cần cấu hình image provider." />
      <div className="wizard">
        <aside className="wizard-steps">
          {["Brief", "Kênh", "Cách làm", "Đường đi video", "Xác nhận"].map((label, index) => (
            <button className={step === index + 1 ? "active" : ""} key={label} onClick={() => setStep(index + 1)} type="button">
              <span>{index + 1}</span>{label}
            </button>
          ))}
        </aside>
        <SectionCard>
          <div className="creator-intro">
            <span className="eyebrow">Manual-first studio</span>
            <strong>Ảnh được tạo ở GG Lab, video được dựng trong app.</strong>
            <p>Provider, giọng đọc và CapCut là phần mở rộng. Chúng không chặn việc tạo project hoặc đi qua Story.</p>
          </div>
          {message ? <p className="error-message">{message}</p> : null}
          {step === 1 ? (
            <div className="form-grid">
              <FormField label="Project name" htmlFor="project-name" hint="Saved as the display name for this setup. Leave it blank to reuse the topic.">
                <input id="project-name" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Optional display name" />
              </FormField>
              <FormField label="Topic" htmlFor="project-topic">
                <textarea id="project-topic" value={topic} onChange={(event) => setTopic(event.target.value)} />
              </FormField>
              <FormField label="Video format" htmlFor="project-format">
                <select id="project-format" value={format} onChange={(event) => setFormat(event.target.value as "long" | "short")}>
                  <option value="long">YouTube Long</option>
                  <option value="short">YouTube Short</option>
                </select>
              </FormField>
              <FormField label="Language" htmlFor="project-language">
                <select id="project-language" value={languageChoice} onChange={(event) => setLanguageChoice(event.target.value)}>
                  {languageOptions.map((language) => (
                    <option key={language} value={language}>{language}</option>
                  ))}
                </select>
              </FormField>
              {languageChoice === "Custom" ? (
                <FormField label="Custom language" htmlFor="project-custom-language" hint="Type any language, locale, or dialect label you want to keep with this channel setup.">
                  <input id="project-custom-language" value={customLanguage} onChange={(event) => setCustomLanguage(event.target.value)} placeholder="e.g. Tagalog, Swahili, pt-BR" />
                </FormField>
              ) : null}
              <FormField label="Target duration" htmlFor="project-duration" hint={`Leave blank to use the default ${defaultTargetDuration(format)}.`}>
                <input id="project-duration" value={targetDuration} onChange={(event) => setTargetDuration(event.target.value)} placeholder={defaultTargetDuration(format)} />
              </FormField>
              <FormField label="FPS / Aspect ratio" htmlFor="project-fps" hint="Current domain fixtures use 30 FPS, but the setup keeps room for future per-project overrides.">
                <input id="project-fps" value={format === "long" ? "30 FPS / 16:9" : "30 FPS / 9:16"} readOnly />
              </FormField>
              <FormField label="Competitor video URL" htmlFor="competitor-url" hint="Paste the source link manually for traceability. FFmpeg is only required later when the app downloads/processes competitor media.">
                <input id="competitor-url" value={competitorUrl} onChange={(event) => setCompetitorUrl(event.target.value)} placeholder="https://..." />
              </FormField>
              <FormField label="Competitor script / analysis" htmlFor="competitor-script" hint="Paste transcript or the full analysis block. This is saved with the project for later AI analysis.">
                <textarea id="competitor-script" value={competitorScript} onChange={(event) => setCompetitorScript(event.target.value)} placeholder="Paste competitor transcript and notes here" />
              </FormField>
              <FormField label="Competitor notes" htmlFor="competitor-notes">
                <textarea id="competitor-notes" value={competitorNotes} onChange={(event) => setCompetitorNotes(event.target.value)} placeholder="Optional notes, hook observations, or angle constraints" />
              </FormField>
              <button className="button primary" type="button" onClick={() => void routeTopic()} disabled={!targetLanguage.trim() || !setupReady}>
                Chọn kênh
              </button>
              {!setupReady ? <p className="error-message">Finish setup first: {missingSetupMessage}</p> : null}
            </div>
          ) : null}
          {step === 2 ? (
            <div className="stack">
              <div className="route-result">
                <strong>{routedProfile?.name ?? "No route yet"}</strong>
                <StatusBadge tone={decision?.requiresUserConfirmation ? "warning" : "success"}>
                  {decision ? `${Math.round(decision.confidence * 100)}% confidence` : "Needs routing"}
                </StatusBadge>
                {decision ? <TagList items={decision.matchedSignals.length ? decision.matchedSignals : ["No signal matched"]} /> : null}
              </div>
              <div className="profile-grid">
                {props.profiles.map((profile) => (
                  <button
                    className={`profile-card ${selectedProfileId === profile.id || (!selectedProfileId && decision?.selectedProfileId === profile.id) ? "active" : ""}`}
                    key={profile.id}
                    type="button"
                  onClick={() => setSelectedProfileId(profile.id)}
                  >
                    <strong>{profile.name}</strong>
                    <span>{profile.niche}</span>
                    <small>{profile.language} / {profile.tone}</small>
                    <small>{profile.imageStyleModel.name}</small>
                    <small>Avoid: {profile.avoidList[0] ?? "No rule"}</small>
                  </button>
                ))}
              </div>
              <button className="button primary" type="button" onClick={() => setStep(3)}>Continue</button>
              <SectionCard title="Teacher character" description="New Semi-automatic projects use the active approved character by default. You can choose another approved version here.">
                {characterVersions.length ? <div className="option-grid">{characterVersions.map((version) => <Option key={version.id} title={`${version.name} v${version.version}`} detail={`${creatorStatusLabel(version.status)} / ${version.references.length} views`} active={selectedCharacterVersion?.id === version.id} onClick={() => setSelectedCharacterVersionId(version.id)} />)}</div> : <p className="muted">No character pack is approved for this profile yet. Create one in Channel Profiles before visual production.</p>}
              </SectionCard>
            </div>
          ) : null}
          {step === 3 ? (
            <div className="option-grid">
              {workflowModeOptions.map((option) => (
                <Option
                  key={option.value}
                  title={option.label}
                  detail={option.detail}
                  active={workflowMode === option.value}
                  disabled={option.value === "full_automatic"}
                  onClick={option.value === "full_automatic" ? undefined : () => setWorkflowMode(option.value)}
                />
              ))}
              <button className="button primary" type="button" onClick={() => setStep(4)}>Continue</button>
            </div>
          ) : null}
          {step === 4 ? (
            <div className="capability-grid">
              <div className="capability-card creator-path-card">
                <span className="eyebrow">Mặc định</span>
                <strong>GG Lab thủ công</strong>
                <span>Tạo prompt theo từng cảnh, tự tạo ảnh, rồi upload 001.png, 002.png...</span>
                <StatusBadge tone="success">Không cần image API</StatusBadge>
              </div>
              <div className="capability-card creator-path-card">
                <strong>FFmpeg dựng MP4</strong>
                <span>Pan, zoom, transition, voice và subtitle được ghép ở Build.</span>
                <StatusBadge tone={props.bootstrap.runtime.ffmpegAvailable ? "success" : "warning"}>{props.bootstrap.runtime.ffmpegAvailable ? "Sẵn sàng" : "Cấu hình ở Build"}</StatusBadge>
              </div>
              <div className="capability-card creator-path-card">
                <strong>Giọng đọc và nhạc</strong>
                <span>Có thể thêm sau khi duyệt asset. Không chặn việc tạo project.</span>
                <StatusBadge tone="info">Thiết lập sau</StatusBadge>
              </div>
              <button className="button primary" type="button" onClick={() => setStep(5)}>Xem lại</button>
            </div>
          ) : null}
          {step === 5 ? (
            <div className="review-list">
              <p><strong>Dự án:</strong> {projectName.trim() || topic}</p>
              <p><strong>Chủ đề:</strong> {topic}</p>
              <p><strong>Kênh:</strong> {routedProfile?.name ?? "Chưa chọn"}</p>
              <p><strong>Ngôn ngữ:</strong> {targetLanguage.trim() || "Vietnamese"}</p>
              <p><strong>Thời lượng:</strong> {effectiveTargetDuration}</p>
              <p><strong>Cách làm:</strong> {workflowModeOptions.find((option) => option.value === workflowMode)?.label ?? "Guided"}</p>
              <p><strong>Ảnh:</strong> Tạo thủ công trong GG Lab, upload và duyệt trong Assets.</p>
              <p><strong>Tài liệu tham khảo:</strong> {competitorScript.trim() ? "1 transcript sẽ được lưu để phân tích" : "Chưa có; có thể thêm sau"}</p>
              <p><StatusBadge tone="success">Sẵn sàng tạo</StatusBadge> Cấu hình provider sẽ chỉ được hỏi khi một bước thực sự cần nó.</p>
              {!setupReady ? <p className="error-message">Chưa thể tạo. {missingSetupMessage}</p> : null}
              <button className="button primary" type="button" onClick={() => void create()} disabled={saving || !topic.trim() || !targetLanguage.trim() || !setupReady}>
                {saving ? "Đang tạo..." : "Tạo dự án"}
              </button>
            </div>
          ) : null}
        </SectionCard>
      </div>
    </>
  );
}

function Option(props: { title: string; detail: string; active?: boolean; disabled?: boolean; onClick?: (() => void) | undefined }) {
  return (
    <button className={`option-card ${props.active ? "active" : ""} ${props.disabled ? "disabled" : ""}`} type="button" onClick={props.onClick} disabled={props.disabled}>
      <strong>{props.title}</strong>
      <span>{props.detail}</span>
    </button>
  );
}




function ttsLanguageCode(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  const option = ttsLanguageOptions.find((item) => item.code === normalized || item.label.toLowerCase() === normalized);
  return option?.code ?? (normalized ? normalized.split("-", 1)[0]! : "vi");
}

function defaultIntegratedVoice(provider: LocalTtsSettings["ttsProvider"] | undefined, language: string): string {
  if (provider === "edge-tts" && language === "vi") return "vi-VN-HoaiMyNeural";
  if (provider === "gtts") return language;
  if (provider === "kokoro-vietnamese" && language === "vi") return "diem_trinh";
  return "";
}

function OmniVoiceSettings(props: { settings: LocalTtsSettings | null; setSettings: (settings: LocalTtsSettings | null) => void }) {
  const [omnivoiceBinPath, setOmnivoiceBinPath] = useState(props.settings?.omnivoiceBinPath ?? "");
  const [outputDir, setOutputDir] = useState(props.settings?.outputDir ?? "");
  const [voiceMode, setVoiceMode] = useState<NonNullable<LocalTtsSettings["voiceMode"]>>(props.settings?.voiceMode ?? (props.settings?.ttsProvider && props.settings.ttsProvider !== "omnivoice-local" ? "integrated-voices" : "voice-design"));
  const [ttsProvider, setTtsProvider] = useState<TtsProviderId>(() => props.settings?.ttsProvider && props.settings.ttsProvider !== "omnivoice-local" && props.settings.ttsProvider !== "capcut-experimental" ? props.settings.ttsProvider : "edge-tts");
  const [ttsVoiceProvider, setTtsVoiceProvider] = useState<NonNullable<LocalTtsSettings["ttsVoiceProvider"]>>(props.settings?.ttsVoiceProvider ?? "edge-tts");
  const [ttsVoiceId, setTtsVoiceId] = useState(() => props.settings?.ttsVoiceId ?? defaultIntegratedVoice(props.settings?.ttsProvider, ttsLanguageCode(props.settings?.language)));
  const [ttsLanguage, setTtsLanguage] = useState(ttsLanguageCode(props.settings?.language));
  const [ttsCatalog, setTtsCatalog] = useState<TtsProviderCatalog>({ providers: [], voices: [] });
  const [ttsCatalogMessage, setTtsCatalogMessage] = useState("");
  const [loadingTtsCatalog, setLoadingTtsCatalog] = useState(false);
  const [ttsRate, setTtsRate] = useState(props.settings?.ttsRate ?? 1);
  const [ttsFallbackEnabled, setTtsFallbackEnabled] = useState(props.settings?.ttsFallbackEnabled ?? false);
  const [modelPath, setModelPath] = useState(props.settings?.modelPath ?? "");
  const [language, setLanguage] = useState(ttsLanguageCode(props.settings?.language));
  const [instruct, setInstruct] = useState(props.settings?.instruct ?? "");
  const [referenceAudioPath, setReferenceAudioPath] = useState(props.settings?.referenceAudioPath ?? "");
  const [referenceTranscript, setReferenceTranscript] = useState(props.settings?.referenceTranscript ?? "");
  const [voiceGender, setVoiceGender] = useState<LocalTtsSettings["voiceGender"]>(props.settings?.voiceGender);
  const [voiceAge, setVoiceAge] = useState<LocalTtsSettings["voiceAge"]>(props.settings?.voiceAge);
  const [voicePitch, setVoicePitch] = useState<LocalTtsSettings["voicePitch"]>(props.settings?.voicePitch);
  const [voiceStyle, setVoiceStyle] = useState<LocalTtsSettings["voiceStyle"]>(props.settings?.voiceStyle);
  const [voiceEnglishAccent, setVoiceEnglishAccent] = useState<LocalTtsSettings["voiceEnglishAccent"]>(props.settings?.voiceEnglishAccent);
  const [voiceChineseDialect, setVoiceChineseDialect] = useState<LocalTtsSettings["voiceChineseDialect"]>(props.settings?.voiceChineseDialect);
  const [previewText, setPreviewText] = useState("Xin chào. Đây là bản xem trước giọng tiếng Việt. Giọng đọc cần rõ dấu, tự nhiên và mạch lạc.");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!props.settings) return;
    setOmnivoiceBinPath(props.settings.omnivoiceBinPath);
    setOutputDir(props.settings.outputDir);
    setVoiceMode(props.settings.voiceMode ?? (props.settings.ttsProvider && props.settings.ttsProvider !== "omnivoice-local" ? "integrated-voices" : "voice-design"));
    setTtsProvider(props.settings.ttsProvider && props.settings.ttsProvider !== "omnivoice-local" && props.settings.ttsProvider !== "capcut-experimental" ? props.settings.ttsProvider : "edge-tts");
    setTtsVoiceProvider(props.settings.ttsVoiceProvider ?? "edge-tts");
    setTtsVoiceId(props.settings.ttsVoiceId ?? defaultIntegratedVoice(props.settings.ttsProvider, ttsLanguageCode(props.settings.language)));
    setTtsLanguage(ttsLanguageCode(props.settings.language));
    setTtsRate(props.settings.ttsRate ?? 1);
    setTtsFallbackEnabled(props.settings.ttsFallbackEnabled ?? false);
    setModelPath(props.settings.modelPath ?? "");
    setLanguage(ttsLanguageCode(props.settings.language));
    setInstruct(props.settings.instruct ?? "");
    setReferenceAudioPath(props.settings.referenceAudioPath ?? "");
    setReferenceTranscript(props.settings.referenceTranscript ?? "");
    setVoiceGender(props.settings.voiceGender);
    setVoiceAge(props.settings.voiceAge);
    setVoicePitch(props.settings.voicePitch);
    setVoiceStyle(props.settings.voiceStyle);
    setVoiceEnglishAccent(props.settings.voiceEnglishAccent);
    setVoiceChineseDialect(props.settings.voiceChineseDialect);
  }, [props.settings]);

  useEffect(() => {
    if (voiceMode !== "integrated-voices") return;
    void refreshTtsCatalog();
  }, [voiceMode, ttsProvider, ttsLanguage]);

  function settingsInput(): Omit<LocalTtsSettings, "available" | "resolvedBinPath"> {
    return {
        omnivoiceBinPath,
        outputDir,
        voiceMode,
        ...(voiceMode === "integrated-voices" ? { ttsProvider, ...(ttsProvider === "nine-router-tts" ? { ttsVoiceProvider } : {}), ...(ttsVoiceId ? { ttsVoiceId } : {}), ...(ttsLanguage.trim() ? { language: ttsLanguage.trim() } : {}), ttsRate, ttsFallbackEnabled, ...(ttsFallbackEnabled ? { ttsFallbackOrder: ["edge-tts", "gtts"] } : {}) } : {}),
        ...(voiceMode !== "integrated-voices" && modelPath ? { modelPath } : {}),
        ...(voiceMode !== "integrated-voices" && language ? { language } : {}),
        ...(instruct ? { instruct } : {}),
        ...(referenceAudioPath ? { referenceAudioPath } : {}),
        ...(referenceTranscript ? { referenceTranscript } : {}),
        ...(voiceGender ? { voiceGender } : {}),
        ...(voiceAge ? { voiceAge } : {}),
        ...(voicePitch ? { voicePitch } : {}),
        ...(voiceStyle ? { voiceStyle } : {}),
        ...(voiceEnglishAccent ? { voiceEnglishAccent } : {}),
        ...(voiceChineseDialect ? { voiceChineseDialect } : {})
    };
  }

  async function saveSettings() {
    setMessage("");
    try {
      const settings = await factoryClient.saveLocalTtsSettings(settingsInput());
      props.setSettings(settings);
      setMessage(voiceMode === "integrated-voices"
        ? (settings.available ? `${ttsProvider} voice saved and ready.` : `${ttsProvider} voice saved, but the local provider environment or credential is unavailable.`)
        : (settings.available ? "OmniVoice saved and detected." : "OmniVoice settings saved, but binary was not detected."));
    } catch (error) {
      setMessage(`Voice provider save failed: ${safeRendererError(error)}`);
    }
  }

  async function previewVoice() {
    setPreviewing(true); setMessage(""); setPreviewUrl("");
    try {
      if (voiceMode !== "integrated-voices") {
        throw new Error("Preview is available for integrated voices only.");
      }
      const settings = await factoryClient.saveLocalTtsSettings(settingsInput());
      props.setSettings(settings);
      const preview = await factoryClient.previewTtsProvider({ provider: ttsProvider, voiceId: ttsVoiceId, language: ttsLanguageCode(ttsLanguage), text: previewText, rate: ttsRate });
      setPreviewUrl(preview.previewUrl);
      setMessage(`${preview.actualProvider} preview ${preview.cached ? "loaded from cache" : "generated and validated"}.`);
    } catch (error) {
      setMessage(`Voice preview failed: ${safeRendererError(error)}`);
    } finally { setPreviewing(false); }
  }

  async function refreshTtsCatalog() {
    const selectedLanguage = ttsLanguageCode(ttsLanguage);
    if (!selectedLanguage) {
      setMessage("Enter a language code before discovering voices, for example vi or en.");
      return;
    }
    setTtsLanguage(selectedLanguage);
    setLoadingTtsCatalog(true); setMessage(""); setTtsCatalogMessage("");
    try {
      const catalog = await factoryClient.listTtsProviders({ language: selectedLanguage, refresh: true });
      setTtsCatalog(catalog);
      const voices = catalog.voices.filter((voice) => voice.provider === ttsProvider && voice.enabled && ttsLanguageCode(voice.language) === selectedLanguage);
      setTtsVoiceId((currentVoiceId) => voices.some((voice) => voice.providerVoiceId === currentVoiceId) ? currentVoiceId : voices[0]?.providerVoiceId ?? defaultIntegratedVoice(ttsProvider, selectedLanguage));
      const status = catalog.providers.find((provider) => provider.id === ttsProvider);
      setTtsCatalogMessage(status ? `${status.displayName}: ${status.message}` : "Provider catalog refreshed.");
    } catch (error) {
      setMessage(`Voice discovery failed: ${safeRendererError(error)}`);
    } finally { setLoadingTtsCatalog(false); }
  }

  async function chooseReferenceAudio() {
    setMessage("");
    try {
      const selected = await factoryClient.selectLocalTtsReferenceAudio();
      if (selected.referenceAudioPath) setReferenceAudioPath(selected.referenceAudioPath);
    } catch (error) {
      setMessage(`Reference audio selection failed: ${safeRendererError(error)}`);
    }
  }

  return (
       <SectionCard title="Voice Providers">
         <div className="form-grid">
        <FormField label="Status" htmlFor="local-tts-status">
          <input id="local-tts-status" value={props.settings?.available ? (voiceMode === "integrated-voices" ? `${ttsProvider} configured` : "OmniVoice detected") : "Needs setup"} disabled readOnly />
        </FormField>
        <FormField label="Voice mode" htmlFor="local-tts-mode" hint="Each mode uses only its own settings; generation never blends modes or falls back.">
          <select id="local-tts-mode" value={voiceMode} onChange={(event) => setVoiceMode(event.target.value as NonNullable<LocalTtsSettings["voiceMode"]>)}>
            <option value="voice-design">1. Design a voice (OmniVoice)</option>
            <option value="integrated-voices">2. Integrated voices</option>
            <option value="voice-clone">3. Clone a voice (OmniVoice)</option>
          </select>
        </FormField>
        {voiceMode === "integrated-voices" ? <>
        <FormField label="Provider" htmlFor="local-tts-provider" hint="Microsoft Edge Neural runs directly from the local Python worker and is the recommended Vietnamese default.">
          <select id="local-tts-provider" value={ttsProvider} onChange={(event) => { const provider = event.target.value as TtsProviderId; setTtsProvider(provider); setTtsVoiceId(""); setTtsCatalogMessage(""); }}>
            {(ttsCatalog.providers.length ? ttsCatalog.providers : [
              { id: "edge-tts", displayName: "Microsoft Edge Neural", enabled: true, experimental: false },
              { id: "kokoro-vietnamese", displayName: "Kokoro Vietnamese", enabled: true, experimental: false },
              { id: "gtts", displayName: "Google gTTS", enabled: true, experimental: false },
              { id: "nine-router-tts", displayName: "9Router TTS", enabled: true, experimental: false },
              { id: "capcut-experimental", displayName: "CapCut TTS", enabled: false, experimental: true }
            ]).map((provider) => <option key={provider.id} value={provider.id} disabled={!provider.enabled}>{provider.displayName}{provider.experimental ? " (experimental, disabled)" : ""}</option>)}
          </select>
        </FormField>
        <FormField label="Language" htmlFor="local-tts-language" hint="Only voices matching this language are shown.">
          <select id="local-tts-language" value={ttsLanguageCode(ttsLanguage)} onChange={(event) => { setTtsLanguage(event.target.value); setTtsVoiceId(""); setTtsCatalogMessage(""); }}>
            {ttsLanguageOptions.map((option) => <option key={option.code} value={option.code}>{option.label} ({option.code})</option>)}
          </select>
        </FormField>
        <FormField label="Voice" htmlFor="local-tts-voice" hint="The selected voice is the only voice used unless you explicitly enable fallback.">
          <select id="local-tts-voice" value={ttsVoiceId} onChange={(event) => setTtsVoiceId(event.target.value)}>
            {!ttsCatalog.voices.some((voice) => voice.provider === ttsProvider && voice.enabled && ttsLanguageCode(voice.language) === ttsLanguageCode(ttsLanguage)) ? <option value={ttsVoiceId}>{ttsVoiceId ? `${ttsVoiceId} (catalog loading)` : "No matching voice found"}</option> : null}
            {ttsCatalog.voices.filter((voice) => voice.provider === ttsProvider && voice.enabled && ttsLanguageCode(voice.language) === ttsLanguageCode(ttsLanguage)).map((voice) => <option key={voice.key} value={voice.providerVoiceId}>{voice.label} - {voice.gender}</option>)}
          </select>
        </FormField>
        <FormField label="Speech rate" htmlFor="local-tts-rate" hint="Automatic timing adjustment never exceeds 1.8x."><input id="local-tts-rate" type="number" min="0.5" max="1.8" step="0.05" value={ttsRate} onChange={(event) => setTtsRate(Number(event.target.value))} /></FormField>
        <FormField label="Fallback" htmlFor="local-tts-fallback" hint="Disabled by default so a failed Edge segment never becomes a different voice without disclosure."><select id="local-tts-fallback" value={ttsFallbackEnabled ? "enabled" : "strict"} onChange={(event) => setTtsFallbackEnabled(event.target.value === "enabled")}><option value="strict">Strict: fail and retry manually</option><option value="enabled">Explicit fallback: Edge, then Google</option></select></FormField>
        {ttsCatalog.providers.length ? <p className="safe-message">{ttsCatalog.providers.find((provider) => provider.id === ttsProvider)?.message ?? ttsCatalogMessage}</p> : null}
        {ttsCatalogMessage ? <p className="safe-message">{ttsCatalogMessage}</p> : null}
        </> : null}
        {voiceMode !== "integrated-voices" ? <FormField label="OmniVoice infer executable" htmlFor="local-tts-bin">
          <input id="local-tts-bin" value={omnivoiceBinPath} onChange={(event) => setOmnivoiceBinPath(event.target.value)} placeholder="Path to omnivoice-infer.exe" />
        </FormField> : null}
        <FormField label="Output directory" htmlFor="local-tts-output-dir">
          <input id="local-tts-output-dir" value={outputDir} onChange={(event) => setOutputDir(event.target.value)} />
        </FormField>
        {voiceMode !== "integrated-voices" ? <>
        <FormField label="Model path" htmlFor="local-tts-model">
          <input id="local-tts-model" value={modelPath} onChange={(event) => setModelPath(event.target.value)} placeholder="Optional local checkpoint or HF id" />
        </FormField>
        <FormField label="Language" htmlFor="local-tts-language">
          <select id="local-tts-language" value={ttsLanguageCode(language)} onChange={(event) => setLanguage(event.target.value)}>
            {ttsLanguageOptions.map((option) => <option key={option.code} value={option.code}>{option.label} ({option.code})</option>)}
          </select>
        </FormField>
        </> : null}
        {voiceMode === "voice-design" ? <>
        <FormField label="Gender" htmlFor="local-tts-gender"><select id="local-tts-gender" value={voiceGender ?? ""} onChange={(event) => setVoiceGender(event.target.value as LocalTtsSettings["voiceGender"])}><option value="">Auto</option><option value="male">Male</option><option value="female">Female</option></select></FormField>
        <FormField label="Age" htmlFor="local-tts-age"><select id="local-tts-age" value={voiceAge ?? ""} onChange={(event) => setVoiceAge(event.target.value as LocalTtsSettings["voiceAge"])}><option value="">Auto</option><option value="child">Child</option><option value="teenager">Teenager</option><option value="young adult">Young adult</option><option value="middle-aged">Middle-aged</option><option value="elderly">Elderly</option></select></FormField>
        <FormField label="Pitch" htmlFor="local-tts-pitch"><select id="local-tts-pitch" value={voicePitch ?? ""} onChange={(event) => setVoicePitch(event.target.value as LocalTtsSettings["voicePitch"])}><option value="">Auto</option><option value="very low pitch">Very low</option><option value="low pitch">Low</option><option value="moderate pitch">Moderate</option><option value="high pitch">High</option><option value="very high pitch">Very high</option></select></FormField>
        <FormField label="Style" htmlFor="local-tts-style"><select id="local-tts-style" value={voiceStyle ?? ""} onChange={(event) => setVoiceStyle(event.target.value as LocalTtsSettings["voiceStyle"])}><option value="">Auto</option><option value="whisper">Whisper</option></select></FormField>
        <FormField label="English accent" htmlFor="local-tts-accent" hint="Only effective when synthesizing English."><select id="local-tts-accent" value={voiceEnglishAccent ?? ""} onChange={(event) => setVoiceEnglishAccent(event.target.value as LocalTtsSettings["voiceEnglishAccent"])}><option value="">Auto</option>{["american accent", "british accent", "australian accent", "canadian accent", "indian accent", "chinese accent", "korean accent", "japanese accent", "portuguese accent", "russian accent"].map((value) => <option key={value} value={value}>{value}</option>)}</select></FormField>
        <FormField label="Chinese dialect" htmlFor="local-tts-dialect" hint="Only effective when synthesizing Chinese."><select id="local-tts-dialect" value={voiceChineseDialect ?? ""} onChange={(event) => setVoiceChineseDialect(event.target.value as LocalTtsSettings["voiceChineseDialect"])}><option value="">Auto</option>{["河南话", "陕西话", "四川话", "贵州话", "云南话", "桂林话", "济南话", "石家庄话", "甘肃话", "宁夏话", "青岛话", "东北话"].map((value) => <option key={value} value={value}>{value}</option>)}</select></FormField>
        <FormField label="Additional voice instruction" htmlFor="local-tts-instruct" hint="Optional supported OmniVoice attributes, comma-separated.">
          <input id="local-tts-instruct" value={instruct} onChange={(event) => setInstruct(event.target.value)} placeholder="Optional additional voice design instruction" />
        </FormField>
        </> : null}
        {voiceMode === "voice-clone" ? <>
        <FormField label="Voice clone reference audio" htmlFor="local-tts-reference-audio" hint="Use only a voice you own or have permission to clone. A clean 3-10 second clip works best.">
          <div className="button-row"><input id="local-tts-reference-audio" value={referenceAudioPath} onChange={(event) => setReferenceAudioPath(event.target.value)} placeholder="Optional reference audio path" /><button className="button compact" type="button" onClick={() => void chooseReferenceAudio()}>Choose audio</button></div>
        </FormField>
        <FormField label="Reference transcript" htmlFor="local-tts-reference-transcript" hint="Optional. Leave blank to let OmniVoice transcribe the reference clip.">
          <textarea id="local-tts-reference-transcript" value={referenceTranscript} onChange={(event) => setReferenceTranscript(event.target.value)} placeholder="Words spoken in the reference audio" />
        </FormField>
        </> : null}
        <div className="button-row">
          <button className="button primary" type="button" onClick={() => void saveSettings()}>Save voice provider</button>
        </div>
        <FormField label="Preview text" htmlFor="local-tts-preview-text">
          <textarea id="local-tts-preview-text" value={previewText} onChange={(event) => setPreviewText(event.target.value)} />
        </FormField>
        <div className="button-row"><button className="button primary" type="button" disabled={previewing || voiceMode !== "integrated-voices" || !ttsVoiceId} onClick={() => void previewVoice()}>{previewing ? "Generating preview..." : "Preview voice"}</button></div>
        {previewUrl ? <audio key={previewUrl} controls autoPlay src={previewUrl} onError={() => setMessage("Browser could not play this preview audio.")}>Audio preview is unavailable.</audio> : null}
        {message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}
      </div>
    </SectionCard>
  );
}



function UnavailableWorkflow(props: { title: string; reason: string }) {
  return (
    <>
      <PageHeader title={props.title} description={props.reason} />
      <EmptyState title={`${props.title} unavailable`} detail={props.reason} />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

function routeFromHash(): RouteId {
  const value = window.location.hash.replace(/^#/, "");
  return allRoutes.some((item) => item.id === value) ? (value as RouteId) : "projects";
}
