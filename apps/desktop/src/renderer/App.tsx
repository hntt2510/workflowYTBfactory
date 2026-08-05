import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ChannelProfile, FactoryProject } from "@lsf/domain";
import { seedChannelProfiles } from "@lsf/domain";
import { factoryClient } from "./services/factoryClient";
import { allRoutes, type RouteId } from "./navigation";
import { EmptyState, SectionCard } from "./components/ui";
import type {
  BootstrapData,
  LocalTtsSettings,
  ProjectSummary,
  ProviderCredentialSettings,
  ProviderPresence,
  TextModelCertificationResponse,
  ImageModelCertificationResponse,
} from "./types";
import { safeRendererError } from "./utils";
import { automaticChainForStage, hasSemiAutomaticAttention, nextSemiAutomaticChain, type SemiAutomaticChain, type SemiAutomaticProgress } from "./semiAutomaticWorkflow";
import { AppShell, LoadingScreen } from "./layouts/AppShell";
import { ScenesScreen, ShotsScreen, VisualsScreen } from "./features/director/DirectorScreens";
import { Dashboard } from "./features/home/HomeScreens";
import { AssetLibraryScreen } from "./features/assets/AssetLibraryScreen";
import { ProjectOverview } from "./features/projects/ProjectOverview";
import { NewProjectWizard, SimpleCreateScreen, ttsLanguageCode } from "./features/projects/CreateScreens";
import { AdvancedPipelineScreen, ProductionScriptPanel, ProductionScreen, SceneReviewScreen } from "./features/production/ProductionScreens";
import { ProjectsScreen } from "./features/projects/ProjectsScreen";
import { QueueScreen } from "./features/queue/QueueScreen";
import { VoiceScreen } from "./features/voice/VoiceScreen";
import { ChannelProfilesScreen } from "./features/settings/ChannelProfilesScreen";
import { DiagnosticsScreen, SettingsScreen } from "./features/settings/SettingsScreens";
import { ProvidersScreen } from "./features/settings/ProvidersScreen";
import { CompetitorDnaScreen, IdeaLabScreen, ReferenceIntakeScreen, ScriptScreen } from "./features/story/StoryScreens";
import { ExportScreen, QaScreen, TimelineScreen } from "./features/build/BuildScreens";
import { FinalPreviewScreen } from "./features/build/FinalPreviewScreen";
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

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

function routeFromHash(): RouteId {
  const value = window.location.hash.replace(/^#/, "");
  return allRoutes.some((item) => item.id === value) ? (value as RouteId) : "projects";
}
