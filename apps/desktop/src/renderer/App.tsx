import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import type { ChannelProfile, ChannelRouteDecision, CharacterReferenceView, FactoryProject, ProductionStatus, StageEligibility, SubtitlePreset } from "@lsf/domain";
import { characterVersionIsApproved, productionStatusLabel, resolveProductionStatus, resolveStageEligibilities, resolveWorkflowProgress, seedChannelProfiles, workflowProgressStateLabel, workflowStageDefinitions } from "@lsf/domain";
import { factoryClient } from "./services/factoryClient";
import { allRoutes, type RouteId } from "./navigation";
import { DataTable, DisabledAction, EmptyState, FormField, MetricCard, PageHeader, ScoreBar, SectionCard, StatusBadge, TagList } from "./components/ui";
import type {
  BootstrapData,
  LocalTtsSettings,
  ModelListStatus,
  ProjectSummary,
  ProviderCredentialSettings,
  ProviderModelConfigurationInput,
  ProviderPresence,
  QueueSnapshot,
  TextModelCertificationResponse,
  TextModelCertificationStatus,
  OriginalityReviewArtifact,
  OutlineArtifact,
  ScriptArtifact,
  FactReviewArtifact,
  RetentionReviewArtifact,
  ScenePlanArtifact,
  ShotPlanArtifact,
  VisualRoutingArtifact,
  AssetConceptArtifact,
  PromptPreparationArtifact,
  AssetAcquisitionArtifact,
  AssetReviewArtifact,
  VoiceGenerationArtifact,
  SubtitlePreparationArtifact,
  TimelineAssemblyArtifact,
  PreviewRenderArtifact,
  QaArtifact,
  CapCutDraftArtifact,
  PackagingExportArtifact,
  ImageModelCertificationResponse,
  TranscriptCleaningArtifact,
  ReferenceSegmentationArtifact,
  CompetitorDnaArtifact,
  CompetitorWorkflowRun,
  OpportunityMapArtifact
  , TtsProviderCatalog, TtsProviderId, TtsJob
} from "./types";
import { estimatedDuration, formatDate, formatTimecode, queueCounts, safeRendererError, stageTone } from "./utils";
import { certificationTone, imageCertificationLabel, textCertificationLabel } from "./certificationLabels";
import { characterVersionNeedsSetup, hasSemiAutomaticAttention, nextSemiAutomaticChain, type SemiAutomaticChain, type SemiAutomaticProgress } from "./semiAutomaticWorkflow";
import { AppShell, LoadingScreen } from "./layouts/AppShell";
import "./styles.css";

const competitorWorkflowStageIds: CompetitorWorkflowRun["stageId"][] = ["transcript-cleaning", "reference-segmentation", "competitor-dna"];

async function loadCompetitorWorkflowRuns(projectId: string): Promise<CompetitorWorkflowRun[]> {
  const runs = await Promise.all(competitorWorkflowStageIds.map((stageId) => factoryClient.listCompetitorWorkflowRuns({ projectId, stageId })));
  return runs.flat().sort((left, right) => (right.startedAt ?? "").localeCompare(left.startedAt ?? ""));
}

function chunkProgressLabel(run: CompetitorWorkflowRun): string {
  const chunks = run.payloadJson?.chunks;
  const persistedTotal = run.payloadJson?.chunkCount;
  const firstChunk = Array.isArray(chunks) ? chunks.find((chunk) => typeof chunk === "object" && chunk !== null && "totalChunks" in chunk) : undefined;
  const total = typeof persistedTotal === "number" && persistedTotal > 0
    ? persistedTotal
    : typeof firstChunk === "object" && firstChunk !== null && "totalChunks" in firstChunk && typeof firstChunk.totalChunks === "number"
      ? firstChunk.totalChunks
      : Array.isArray(chunks) && chunks.length > 0 ? chunks.length : 0;
  if (!total) return "-";
  const completed = Array.isArray(chunks) ? chunks.filter((chunk) => typeof chunk === "object" && chunk !== null && "status" in chunk && chunk.status === "completed").length : 0;
  const failed = Array.isArray(chunks) ? chunks.filter((chunk) => typeof chunk === "object" && chunk !== null && "status" in chunk && chunk.status === "failed") : [];
  const failedLabel = failed.length ? `, failed chunk ${(failed[0] as { chunkIndex?: unknown }).chunkIndex ?? "?"}` : "";
  return `${completed}/${total} chunks completed${failedLabel}`;
}

function workflowStageLabel(stageId: CompetitorWorkflowRun["stageId"]): string {
  return stageId === "transcript-cleaning" ? "Transcript Cleaning" : stageId === "reference-segmentation" ? "Reference Segmentation" : "Competitor DNA";
}

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

const workflowModeOptions: Array<{ value: "guided" | "semi_automatic" | "full_automatic"; label: string; detail: string }> = [
  { value: "guided", label: "Advanced guided", detail: "Expose every internal stage for debugging." },
  { value: "semi_automatic", label: "Simple production", detail: "Runs valid internal stages automatically and pauses only at user checkpoints." },
  { value: "full_automatic", label: "Full automatic", detail: "Not implemented yet; use Guided mode for manual execution." }
];

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
    const nextChain = nextSemiAutomaticChain(project);
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
    const nextChain = nextSemiAutomaticChain(selectedProject);
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
  if (props.route === "scenes") return <ScenesScreen project={props.selectedProject} setSelectedProject={props.setSelectedProject} textCertification={props.textCertification} />;
  if (props.route === "shots") return <ShotsScreen project={props.selectedProject} setSelectedProject={props.setSelectedProject} textCertification={props.textCertification} />;
  if (props.route === "visuals") return <VisualsScreen project={props.selectedProject} textCertification={props.textCertification} imageCertification={props.imageCertification} setSelectedProject={props.setSelectedProject} setImageCertification={props.setImageCertification} startSemiAutomatic={props.startSemiAutomatic} />;
  if (props.route === "voice") return <VoiceScreen project={props.selectedProject} localTtsSettings={props.localTtsSettings} onRefresh={props.onRefresh} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} />;
  if (props.route === "timeline") return <TimelineScreen project={props.selectedProject} setSelectedProject={props.setSelectedProject} startSemiAutomatic={props.startSemiAutomatic} />;
  if (props.route === "qa") return <QaScreen project={props.selectedProject} setSelectedProject={props.setSelectedProject} />;
  return <ExportScreen project={props.selectedProject} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} />;
}

function Dashboard(props: {
  bootstrap: BootstrapData;
  providerPresence: ProviderPresence;
  setRoute: (route: RouteId) => void;
  onOpenProject: (projectId: string) => Promise<void>;
}) {
  const counts = queueCounts(props.bootstrap.queue);
  const activeProjects = props.bootstrap.projects.length;
  return (
    <>
      <PageHeader
        eyebrow="Local production workspace"
        title="Long/Short Factory"
        description="Local AI-assisted YouTube production workspace."
        actions={
          <>
            <button className="button primary" type="button" onClick={() => props.setRoute("create")}>
              <Plus size={16} /> Create Video Project
            </button>
            <button className="button secondary" type="button" onClick={() => props.setRoute("projects")}>Open Project</button>
            <DisabledAction reason="Project ZIP import is not implemented.">Import Project</DisabledAction>
          </>
        }
      />
      <section className="metric-grid">
        <MetricCard label="Total projects" value={props.bootstrap.projects.length} detail="SQLite-backed" tone="success" />
        <MetricCard label="Active projects" value={activeProjects} detail="No archived state yet" />
        <MetricCard label="Queued jobs" value={counts.queued ?? 0} detail="Queue is JSON-backed" />
        <MetricCard label="Failed jobs" value={counts.failed ?? 0} />
        <MetricCard label="Assets generated" value="Not available" detail="Asset persistence is not wired" tone="warning" />
        <MetricCard label="Provider status" value={props.providerPresence.hasCredential ? "Credential saved" : "Not configured"} tone={props.providerPresence.hasCredential ? "success" : "warning"} />
      </section>
      <RecentProjects projects={props.bootstrap.projects} onOpenProject={props.onOpenProject} />
      <SystemStatus bootstrap={props.bootstrap} providerPresence={props.providerPresence} />
    </>
  );
}

function RecentProjects(props: { projects: ProjectSummary[]; onOpenProject: (projectId: string) => Promise<void> }) {
  return (
    <SectionCard title="Recent projects" description="Persisted projects available from SQLite.">
      {props.projects.length === 0 ? (
        <EmptyState title="No projects yet" detail="Create a demo project to verify persistence and browse workflow screens." />
      ) : (
        <DataTable label="Recent projects">
          <thead>
            <tr>
              <th>Project name</th>
              <th>Channel profile</th>
              <th>Format</th>
              <th>Language</th>
              <th>Target duration</th>
              <th>Current stage</th>
              <th>Last modified</th>
              <th>Progress</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {props.projects.map((project) => (
              <tr key={project.id}>
                <td>{project.projectName || project.topic}</td>
                <td>{project.profileId}</td>
                <td>{project.format === "long" ? "YouTube Long" : "YouTube Short"}</td>
                <td>{project.targetLanguage}</td>
                <td>{project.targetDuration}</td>
                <td>Not loaded</td>
                <td>{formatDate(project.updatedAt)}</td>
                <td>Open to calculate</td>
                <td><StatusBadge tone="success">Persisted</StatusBadge></td>
                <td className="row-actions">
                  <button className="button compact" type="button" onClick={() => void props.onOpenProject(project.id)}>Open</button>
                  <DisabledAction reason="Duplicate is not implemented.">Duplicate</DisabledAction>
                  <DisabledAction reason="Export ZIP is not implemented.">Export</DisabledAction>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </SectionCard>
  );
}

function SystemStatus(props: { bootstrap: BootstrapData; providerPresence: ProviderPresence }) {
  const sqliteUnavailable = /unavailable/i.test(props.bootstrap.databasePath);
  const runtime = props.bootstrap.runtime;
  const items = [
    ["SQLite", sqliteUnavailable ? "Unavailable" : "Ready", props.bootstrap.databasePath],
    ["9Router", props.providerPresence.hasCredential ? "Credential saved" : "Not configured", "Provider execution is deferred"],
    ["FFmpeg", runtime.ffmpegAvailable ? "Ready" : "Needs setup", runtime.ffmpegAvailable ? runtime.ffmpegStatus : "Set FFMPEG_PATH or add ffmpeg to PATH"],
    [
      "Python sidecar",
      runtime.pythonExists && runtime.pycapcutStatus === "Installed" ? "Ready" : "Needs setup",
      `${runtime.pythonVersion}; pycapcut ${runtime.pycapcutStatus}`
    ],
    [
      "CapCut",
      runtime.capcutInstalled ? "Experimental" : "Unavailable",
      runtime.capcutInstalled ? `${runtime.capcutInstallPath}; ${runtime.capcutCompatibility}` : "CapCut install path was not found"
    ],
    ["Workspace path", "Ready", props.bootstrap.workspaceRoot],
    ["CodeGraph development index", "Experimental", "Development-only index"]
  ];
  return (
    <SectionCard title="System status">
      <div className="status-grid">
        {items.map(([name, status, detail]) => (
          <div className="status-row" key={name}>
            <span>{name}</span>
            <StatusBadge tone={status === "Ready" ? "success" : status === "Experimental" ? "info" : "warning"}>{status}</StatusBadge>
            <small>{detail}</small>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function ProjectsScreen(props: {
  projectSummaries: ProjectSummary[];
  onOpenProject: (projectId: string) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  setRoute: (route: RouteId) => void;
}) {
  return (
    <>
      <PageHeader
        title="Projects"
        description="Create, open, and manage SQLite-backed local projects."
        actions={<button className="button primary" type="button" onClick={() => props.setRoute("create")}><Plus size={16} /> Create Video Project</button>}
      />
      <SectionCard>
        {props.projectSummaries.length === 0 ? (
          <EmptyState title="No persisted projects" detail="The project list is empty because no SQLite-backed project has been created yet." />
        ) : (
          <DataTable label="Projects">
            <thead>
              <tr>
                <th>Name</th>
                <th>Profile</th>
                <th>Format</th>
                <th>Language</th>
                <th>Target duration</th>
                <th>Updated</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {props.projectSummaries.map((project) => (
                <tr key={project.id}>
                  <td>{project.projectName || project.topic}</td>
                  <td>{project.profileId}</td>
                  <td>{project.format === "long" ? "YouTube Long" : "YouTube Short"}</td>
                  <td>{project.targetLanguage}</td>
                  <td>{project.targetDuration}</td>
                  <td>{formatDate(project.updatedAt)}</td>
                  <td><StatusBadge tone="success">Persisted</StatusBadge></td>
                  <td className="row-actions">
                    <button className="button compact" type="button" onClick={() => void props.onOpenProject(project.id)}>Open</button>
                    <button className="button danger compact" type="button" onClick={() => void props.onDeleteProject(project.id)}><Trash2 size={14} /> Delete</button>
                    <DisabledAction reason="Project duplication is not implemented.">Duplicate</DisabledAction>
                    <DisabledAction reason="Project export is not implemented.">Export</DisabledAction>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </SectionCard>
    </>
  );
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
  return <><PageHeader eyebrow="Production" title="Preparing your video" description="The application runs internal workflow stages automatically and brings you back only when your input is needed." actions={nextChain ? <button className="button primary" type="button" onClick={() => void props.startSemiAutomatic(nextChain, props.project)}>Continue production</button> : <button className="button secondary" type="button" onClick={() => props.setRoute(nextRoute)}>{characterNeedsSetup ? "Set up channel character" : "Open next step"}</button>} /><section className="metric-grid"><MetricCard label="Production status" value={productionStatusLabel(status)} tone={status === "needs_attention" || status === "failed" ? "warning" : status === "completed" ? "success" : "info"} /><MetricCard label="Input mode" value={props.project.setup.inputMode ?? "topic"} /><MetricCard label="Style" value="VOX Documentary" /><MetricCard label="Scenes" value={props.project.scenes.length} /></section><SectionCard title="What happens next" description={characterNeedsSetup ? "Approve a channel character before Visual Routing can continue." : status === "needs_attention" ? "A persisted internal failure needs an explicit action before production can continue." : "Non-blocking internal stages remain hidden from the default production path."}><StatusBadge tone={status === "needs_attention" || status === "failed" ? "danger" : "info"}>{productionStatusLabel(status)}</StatusBadge><p>{characterNeedsSetup ? "Open Channel Profiles, approve the active teacher character, then return to production." : status === "waiting_for_idea" ? "Choose one idea to set the creative direction." : status === "needs_scene_review" ? "Review scenes and regenerate only the ones that need changes." : status === "needs_final_review" ? "Review the real preview before exporting." : status === "completed" ? "Your project is complete." : status === "needs_attention" || status === "failed" ? "Open Advanced Pipeline Details to see the safe reason and retry action." : "Content preparation and production are in progress."}</p></SectionCard>{attentionStage ? <SectionCard title={`Needs attention: ${attentionStage.name}`} description="Production stopped at this phase; no dependent stage will continue until it is retried successfully."><p><strong>Affected phase:</strong> {attentionStage.attention?.phase ?? attentionStage.name}</p><p><strong>Safe reason:</strong> {attentionStage.attention?.safeReason ?? attentionStage.attention?.message ?? "The phase reported a failure without a detailed message."}</p>{attentionStage.attention?.failedItem ? <p><strong>Failed item:</strong> {attentionStage.attention.failedItem}</p> : null}<p><strong>Recommended action:</strong> {attentionStage.attention?.recommendedAction ?? "Review stage"}</p><p><strong>Retry action:</strong> {attentionStage.attention?.retryAction ?? "Retry stage"}</p><div className="button-row">{(attentionStage.attention?.actions ?? []).map((action) => <button className="button secondary compact" type="button" key={`${action.label}-${action.route ?? "stage"}`} onClick={() => props.setRoute(stageRoute(action.route ?? attentionStage.id))}>{action.label}</button>)}<button className="button primary compact" type="button" onClick={() => props.setRoute(stageRoute(attentionStage.id))}>Open affected phase</button></div></SectionCard> : null}<AdvancedPipelineDetails project={props.project} setRoute={props.setRoute} /></>;
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
  return <SectionCard title="Advanced Pipeline Details" description="Read-only internal stages, runs, artifacts, and safe failure state for debugging and recovery."><details><summary>Show {workflowStageDefinitions.length} internal stages</summary><div className="workflow-list">{workflowStageDefinitions.map((definition) => { const stage = props.project.stages.find((item) => item.id === definition.id); const presentation = progress.stages.find((item) => item.stageId === definition.id)!; return <div className="workflow-stage" key={definition.id}><span>{definition.order}. {definition.name}</span><StatusBadge tone={stageTone(presentation.state)}>{workflowProgressStateLabel(presentation.state)}</StatusBadge><small>{presentation.state === "not_applicable" ? "Not used for this project input." : presentation.state === "optional" ? "Optional output; it does not block Packaging Export." : `Internal status: ${presentation.internalStatus.replaceAll("_", " ")}${stage?.attention?.message ? ` - ${stage.attention.message}` : stage?.dependsOn.length ? ` - Depends on: ${stage.dependsOn.join(", ")}` : ""}`}</small>{definition.id === "preview-render" ? <button className="button secondary compact" type="button" onClick={() => props.setRoute("final-preview")}>Open final preview</button> : definition.id === "capcut-draft" || definition.id === "packaging-export" ? <button className="button secondary compact" type="button" onClick={() => props.setRoute("export")}>Open export</button> : null}</div>; })}</div></details><button className="button secondary compact" type="button" onClick={() => props.setRoute("advanced-pipeline")}>Open diagnostics view</button></SectionCard>;
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
                {visualModes.map((mode) => <option key={mode} value={mode}>{mode.replaceAll("_", " ")}</option>)}
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
              <p><strong>Prompt status:</strong> {prompt ? "ready" : "missing"} - <strong>Voice segment:</strong> {voiceSegment ? (voiceArtifact?.status === "approved" ? "ready" : voiceArtifact?.status?.replaceAll("_", " ") ?? "pending") : "pending"}</p>
              {item ? <div><p><strong>Asset status:</strong> {item.reviewStatus.replaceAll("_", " ")} {item.assignedShotId ? `- assigned to ${item.assignedShotId}` : "- unassigned"}</p>{assetUrls[item.asset.sha256] ? <img src={assetUrls[item.asset.sha256]} alt={`Preview for ${shot.id}`} style={{ maxWidth: "100%", maxHeight: 240, objectFit: "contain" }} /> : <StatusBadge tone="warning">Preview unavailable</StatusBadge>}</div> : <StatusBadge tone="warning">No generated asset yet</StatusBadge>}
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

function FinalPreviewScreen(props: { project: FactoryProject; localTtsSettings: LocalTtsSettings | null; setSelectedProject: (project: FactoryProject | null) => void; setRoute: (route: RouteId) => void; startSemiAutomatic: (chain: SemiAutomaticChain, project: FactoryProject) => Promise<void> }) {
  const [artifacts, setArtifacts] = useState<PreviewRenderArtifact[]>([]);
  const [mediaUrl, setMediaUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const preview = resolveStageEligibilities(props.project).find((stage) => stage.stageId === "preview-render");
  const currentArtifact = artifacts.find((artifact) => artifact.status === "needs_review") ?? artifacts.find((artifact) => artifact.status === "approved");
  const warnings = preview?.blockingReasons ?? [];

  async function refresh(): Promise<void> {
    const next = await factoryClient.listPreviewRenderArtifacts({ projectId: props.project.id });
    setArtifacts(next);
    const candidate = next.find((artifact) => artifact.status === "needs_review") ?? next.find((artifact) => artifact.status === "approved");
    if (!candidate) {
      setMediaUrl("");
      return;
    }
    const response = await factoryClient.getPreviewVideoUrl({ projectId: props.project.id, artifactId: candidate.id });
    setMediaUrl(response.url);
  }

  useEffect(() => { void refresh().catch((error) => setMessage(safeRendererError(error, "The final preview could not be loaded. Render it again or open Timeline."))); }, [props.project.id]);

  async function perform(action: () => Promise<FactoryProject>, success: string): Promise<FactoryProject | null> {
    setRunning(true);
    setMessage("");
    try {
      const next = await action();
      props.setSelectedProject(next);
      await refresh();
      setMessage(success);
      return next;
    } catch (error) {
      setMessage(safeRendererError(error, "The final preview action could not be completed. Retry the preview step."));
      return null;
    } finally {
      setRunning(false);
    }
  }

  async function approveFinalVideo(): Promise<FactoryProject> {
    const next = await factoryClient.approvePreviewRender({ projectId: props.project.id });
    if (next.setup.workflowMode === "semi_automatic") void props.startSemiAutomatic("preview", next);
    return next;
  }

  async function downloadVideo(): Promise<void> {
    if (!currentArtifact) return;
    setRunning(true);
    setMessage("");
    try {
      const result = await factoryClient.downloadPreviewVideo({ projectId: props.project.id, artifactId: currentArtifact.id });
      setMessage(result.canceled ? "MP4 download canceled." : `MP4 saved as ${result.fileName ?? "video.mp4"}.`);
    } catch (error) {
      setMessage(safeRendererError(error, "The MP4 could not be downloaded."));
    } finally {
      setRunning(false);
    }
  }

  const canRenderAgain = Boolean(currentArtifact) && ["needs_review", "approved", "failed", "needs_attention", "stale"].includes(preview?.status ?? "");
  const voiceLabel = props.project.setup.voiceId ?? props.localTtsSettings?.ttsVoiceId ?? "Existing configured voice";
  const subtitleLabel = currentArtifact?.payloadJson.subtitleRelativeFilePath
    ? currentArtifact.payloadJson.subtitlePreset === "minimal" ? "Minimal - local UTF-8" : currentArtifact.payloadJson.subtitlePreset === "high-contrast" ? "High Contrast - local UTF-8" : "VOX Clean - local UTF-8"
    : "Subtitle cues pending";

  return <>
    <PageHeader title="Final Preview" description="Review the real rendered video and its persisted metadata before export." actions={<div className="button-row"><button className="button secondary" type="button" onClick={() => props.setRoute("scene-review")}>Return to Scene Review</button><button className="button secondary" type="button" onClick={() => props.setRoute("timeline")}>Open subtitle controls</button></div>} />
    <SectionCard title="Rendered video" description="This player uses a safe workspace URL for the persisted reviewable or approved MP4.">
      {mediaUrl ? <video className="preview-video" controls preload="metadata" src={mediaUrl}>Your browser cannot play this preview.</video> : <EmptyState title="No reviewable preview yet" detail="Render an approved timeline after voice and subtitle preparation complete." action={<button className="button primary" type="button" onClick={() => props.setRoute("timeline")}>Open Timeline</button>} />}
      {message ? <p className={message.toLowerCase().includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}
    </SectionCard>
    <section className="metric-grid">
      <MetricCard label="Preview status" value={preview?.status?.replaceAll("_", " ") ?? "not started"} tone={preview?.status === "approved" ? "success" : preview?.status === "needs_review" ? "info" : "warning"} />
      <MetricCard label="Duration" value={currentArtifact ? `${currentArtifact.payloadJson.durationSeconds.toFixed(2)}s` : "-"} />
      <MetricCard label="Resolution" value={currentArtifact ? `${currentArtifact.payloadJson.width} × ${currentArtifact.payloadJson.height}` : "-"} />
      <MetricCard label="Scenes" value={props.project.scenes.length} />
    </section>
    <SectionCard title="Preview details">
      <p><strong>Voice:</strong> {voiceLabel}</p>
      <p><strong>Subtitle preset:</strong> {subtitleLabel}</p>
      <p><strong>Preview file:</strong> {currentArtifact?.relativeFilePath ?? "Not rendered"}</p>
      {warnings.length ? <div><strong>Warnings</strong>{warnings.map((warning) => <p key={`${warning.code}-${warning.message}`}>{warning.message}</p>)}</div> : <p className="safe-message">No blocking preview warnings.</p>}
      <div className="button-row">
        {currentArtifact ? <button className="button secondary" type="button" disabled={running} onClick={() => void downloadVideo()}>Download MP4</button> : null}
        {currentArtifact?.status === "needs_review" ? <button className="button primary" type="button" disabled={running || !preview?.approvable} onClick={() => void perform(approveFinalVideo, "Final video approved.").then((updated) => { if (updated?.stages.find((stage) => stage.id === "preview-render")?.status === "approved") props.setRoute("project-overview"); })}>Approve Final Video</button> : null}
        {canRenderAgain ? <button className="button secondary" type="button" disabled={running} onClick={() => void perform(() => factoryClient.runPreviewRender({ projectId: props.project.id, force: true, subtitlePreset: currentArtifact?.payloadJson.subtitlePreset ?? "vox-clean" }), "Preview rendered again; approval is still required.")}>{running ? "Rendering..." : "Render Again"}</button> : null}
        <button className="button secondary" type="button" onClick={() => props.setRoute("scene-review")}>Return to Scene Review</button>
        <button className="button secondary" type="button" disabled={running} onClick={() => props.setRoute("voice")}>Change Voice / Regenerate</button>
        <button className="button secondary" type="button" onClick={() => props.setRoute("timeline")}>Change Subtitle Preset</button>
      </div>
    </SectionCard>
  </>;
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
  const [languageChoice, setLanguageChoice] = useState("English");
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
  const setupChecks = [
    { label: "9Router API key", ready: props.providerPresence.hasCredential, action: "providers" as RouteId, help: "Save 9Router credential in Providers." },
    { label: "9Router Text model", ready: props.textCertification.status === "verified", action: "providers" as RouteId, help: "Select a discovered text model and run Text Model Certification." },
    { label: "9Router Image model", ready: props.imageCertification.status === "verified", action: "providers" as RouteId, help: "Select an image model and run Image Model Certification." },
    { label: "OmniVoice TTS", ready: Boolean(props.localTtsSettings?.available), action: "settings" as RouteId, help: "Configure OmniVoice executable in Settings." },
    { label: "FFmpeg", ready: props.bootstrap.runtime.ffmpegAvailable, action: "settings" as RouteId, help: "Set FFMPEG_PATH or add ffmpeg to PATH before video download/preview processing." },
    { label: "Pexels stock", ready: props.stockPresence.hasCredential, action: "providers" as RouteId, help: "Save a Pexels API key for stock image/video lookup." }
  ];
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
      <PageHeader title="New Project Wizard" description="Finish local setup first, then create a project with competitor references saved into SQLite." />
      <div className="wizard">
        <aside className="wizard-steps">
          {["Basic information", "Channel profile", "Workflow mode", "Provider selection", "Review"].map((label, index) => (
            <button className={step === index + 1 ? "active" : ""} key={label} onClick={() => setStep(index + 1)} type="button">
              <span>{index + 1}</span>{label}
            </button>
          ))}
        </aside>
        <SectionCard>
          <div className="setup-checklist">
            {setupChecks.map((check) => (
              <div className="status-row" key={check.label}>
                <span>{check.label}</span>
                <StatusBadge tone={check.ready ? "success" : "warning"}>{check.ready ? "Ready" : "Needs setup"}</StatusBadge>
                {check.ready ? <small>Configured</small> : <button className="button compact" type="button" onClick={() => props.setRoute(check.action)}>{check.help}</button>}
              </div>
            ))}
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
                Route channel profile
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
                {characterVersions.length ? <div className="option-grid">{characterVersions.map((version) => <Option key={version.id} title={`${version.name} v${version.version}`} detail={`${version.status.replaceAll("_", " ")} / ${version.references.length} views`} active={selectedCharacterVersion?.id === version.id} onClick={() => setSelectedCharacterVersionId(version.id)} />)}</div> : <p className="muted">No character pack is approved for this profile yet. Create one in Channel Profiles before visual production.</p>}
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
              {[
                { name: "Text", provider: "9Router", ready: props.providerPresence.hasCredential, status: props.providerPresence.hasCredential ? "Credential saved" : "Not configured" },
                { name: "Image", provider: "9Router", ready: props.providerPresence.hasCredential, status: props.providerPresence.hasCredential ? "Credential saved" : "Not configured" },
                { name: "Video", provider: "9Router", ready: Boolean(props.providerSettings?.videoModel && props.providerPresence.hasCredential), status: props.providerSettings?.videoModel ? "Model configured" : "No video model" },
                { name: "TTS", provider: "OmniVoice local", ready: Boolean(props.localTtsSettings?.available), status: props.localTtsSettings?.available ? "Detected" : "Needs setup" },
                { name: "STT", provider: "Not wired", ready: false, status: "Not configured" },
                { name: "Stock", provider: "Pexels", ready: props.stockPresence.hasCredential, status: props.stockPresence.hasCredential ? "Credential saved" : "Not configured" },
                { name: "Evidence images", provider: "Direct URL / Wikipedia", ready: true, status: "Manual URL ready" }
              ].map((capability) => (
                <div className="capability-card" key={capability.name}>
                  <strong>{capability.name}</strong>
                  <span>{capability.provider}</span>
                  <StatusBadge tone={capability.ready ? "success" : "warning"}>{capability.status}</StatusBadge>
                  <small>{capability.name === "Evidence images" ? "Paste source image URLs in references; Google automated image search is not wired." : "Cost estimate unavailable"}</small>
                </div>
              ))}
              <button className="button primary" type="button" onClick={() => setStep(5)}>Review</button>
            </div>
          ) : null}
          {step === 5 ? (
            <div className="review-list">
              <p><strong>Project:</strong> {projectName.trim() || topic}</p>
              <p><strong>Topic:</strong> {topic}</p>
              <p><strong>Profile:</strong> {routedProfile?.name ?? "Route before creating"}</p>
              <p><strong>Language:</strong> {targetLanguage.trim() || "English"}</p>
              <p><strong>Target duration:</strong> {effectiveTargetDuration}</p>
              <p><strong>Mode:</strong> {workflowModeOptions.find((option) => option.value === workflowMode)?.label ?? "Guided"}</p>
              <p><strong>Competitor references:</strong> {competitorScript.trim() ? "1 pasted competitor script/reference will be saved as Draft" : "None pasted yet; you can add it later in Reference Intake"}</p>
              <p><StatusBadge tone="info">Ready</StatusBadge> Project creation saves setup and references only. Later stages must be run and approved one by one.</p>
              {!setupReady ? <p className="error-message">Cannot create yet. {missingSetupMessage}</p> : null}
              <button className="button primary" type="button" onClick={() => void create()} disabled={saving || !topic.trim() || !targetLanguage.trim() || !setupReady}>
                {saving ? "Creating..." : "Create Project"}
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

function ProjectOverview(props: {
  selectedProject: FactoryProject;
  selectedProfile: ChannelProfile | undefined;
  setRoute: (route: RouteId) => void;
  startSemiAutomatic: (chain: SemiAutomaticChain, project: FactoryProject) => Promise<void>;
  textCertification: TextModelCertificationResponse;
  imageCertification: ImageModelCertificationResponse;
  localTtsSettings: LocalTtsSettings | null;
  semiAutomaticProgress: SemiAutomaticProgress | null;
  semiAutomaticRunning: boolean;
  semiAutomaticError: string | null;
}) {
  const project = props.selectedProject;
  const characterNeedsSetup = characterVersionNeedsSetup(project, props.selectedProfile);
  const eligibilities = resolveStageEligibilities(project, {
    textVerified: props.textCertification.status === "verified",
    imageVerified: props.imageCertification.status === "verified",
    localAudioAvailable: props.localTtsSettings?.available ?? false
  });
  const progress = resolveWorkflowProgress(project);
  const presentationById = new Map(progress.stages.map((stage) => [stage.stageId, stage]));
  const checkpoint = project.stages.find((stage) => stage.status === "needs_review");
  const attention = project.stages.find((stage) => stage.status === "needs_attention" || stage.status === "failed");
  const nextStage = eligibilities.find((stage) => {
    if (!stage.runnable && !stage.reviewable) return false;
    const presentation = presentationById.get(stage.stageId);
    return presentation?.state !== "not_applicable" && presentation?.state !== "optional";
  });
  const nextStageName = nextStage ? workflowStageDefinitions.find((stage) => stage.id === nextStage.stageId)?.name ?? nextStage.stageId : undefined;
  const nextChain = nextSemiAutomaticChain(project);
  const isRunning = props.semiAutomaticRunning || project.stages.some((stage) => stage.status === "queued" || stage.status === "running");
  const actionStage = attention ?? checkpoint;
  const actionRoute = characterNeedsSetup ? "channel-profiles" : actionStage ? stageRoute(actionStage.id) : nextStage ? stageRoute(nextStage.stageId) : "advanced-pipeline";
  const phaseRows = progress.phases.map((phase) => ({
    ...phase,
    currentStage: phase.currentStageName ?? (phase.state === "not_applicable" ? "Not used" : phase.state === "optional" ? "Optional" : phase.state === "complete" ? "Complete" : "Waiting")
  }));
  const actionLabel = characterNeedsSetup ? "Set up channel character" : attention ? `Open ${attention.name}` : checkpoint ? `Review ${checkpoint.name}` : nextChain && !isRunning ? "Continue production" : nextStageName ? `Open ${nextStageName}` : "Production complete";
  const capcut = presentationById.get("capcut-draft");

  async function continueProduction(): Promise<void> {
    if (characterNeedsSetup) {
      props.setRoute("channel-profiles");
      return;
    }
    if (actionStage) {
      props.setRoute(actionRoute);
      return;
    }
    if (nextChain && !isRunning) {
      await props.startSemiAutomatic(nextChain, project);
      return;
    }
    if (nextStage) props.setRoute(actionRoute);
  }

  return (
    <>
      <PageHeader
        eyebrow="Project Diagnostic"
        title={project.setup.projectName}
        description="One place to see progress. The app runs safe stages automatically and opens a review screen only when you choose it."
        actions={<div className="button-row">{progress.percent === 100 ? <><button className="button secondary" type="button" onClick={() => props.setRoute("final-preview")}>Watch final video</button><button className="button secondary" type="button" onClick={() => props.setRoute("export")}>Open export</button></> : null}<button className="button primary" type="button" disabled={isRunning || (!actionStage && !nextStage && !nextChain)} onClick={() => void continueProduction()}>{isRunning ? "Production is running..." : actionLabel}</button></div>}
      />
      <section className="metric-grid">
        <MetricCard label="Status" value={productionStatusLabel(resolveProductionStatus(project))} />
        <MetricCard label="Progress" value={`${progress.percent}%`} />
        <MetricCard label="Language" value={project.setup.language || project.targetLanguage} />
        <MetricCard label="Current step" value={progress.currentStageName ?? "Complete"} />
      </section>
      {props.semiAutomaticProgress ? (
        <SectionCard title={props.semiAutomaticRunning ? "Live progress" : "Last automatic update"} description="The current automatic phase and latest persisted result are shown here.">
          <p>{props.semiAutomaticProgress.message}</p>
          <p className="muted">{props.semiAutomaticProgress.completed}/{props.semiAutomaticProgress.total} completed - {props.semiAutomaticProgress.stageId}</p>
        </SectionCard>
      ) : null}
      {props.semiAutomaticError ? <SectionCard title="Needs attention"><p className="error-message">{props.semiAutomaticError}</p></SectionCard> : null}
      <SectionCard title="Progress summary" description="Only applicable required stages count toward progress. Optional outputs are shown separately.">
        <div className="route-result">
          <StatusBadge tone={stageTone(progress.currentStageId ? "current" : "complete")}>{progress.completedCount}/{progress.totalCount} required stages complete</StatusBadge>
          <strong>{progress.currentStageName ? `Current: ${progress.currentStageName}` : "Project complete"}</strong>
          <span>{progress.currentPhaseName ? `Current phase: ${progress.currentPhaseName}. ` : ""}{actionLabel}.</span>
        </div>
        {capcut?.state === "optional" ? <p className="muted">CapCut Draft is optional and does not block Packaging Export.</p> : null}
        {progress.percent === 100 ? <div className="button-row"><button className="button primary compact" type="button" onClick={() => props.setRoute("final-preview")}>Watch final video</button><button className="button secondary compact" type="button" onClick={() => props.setRoute("export")}>View exported files</button></div> : null}
      </SectionCard>
      <SectionCard title={attention ? "Action required" : checkpoint ? "Review available" : "Production progress"} description={attention?.attention?.message ?? (checkpoint ? "Open the review only when you are ready. Confirming it returns you here." : "Automatic stages continue until a human decision is required.")}>
        {attention || checkpoint ? (
          <div className="route-result">
            <StatusBadge tone={attention ? "danger" : "info"}>{attention ? "Needs attention" : "Needs review"}</StatusBadge>
            <strong>{attention?.name ?? checkpoint?.name}</strong>
            <span>{attention?.attention?.message ?? "A review decision is ready."}</span>
          </div>
        ) : isRunning ? (
          <p className="muted">No action is required right now. Keep this screen open to monitor the project.</p>
        ) : (
          <p className="muted">The next safe step will appear here when it is ready.</p>
        )}
      </SectionCard>
      <SectionCard title="Production phases">
        <div className="status-grid">
          {phaseRows.map((phase) => (
            <div className="status-row" key={phase.id}>
              <span>{phase.name}</span>
              <StatusBadge tone={stageTone(phase.state)}>{workflowProgressStateLabel(phase.state)}</StatusBadge>
              <small>{phase.currentStage ?? "Complete"}</small>
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Project details">
        <SettingsList items={[
          ["Channel profile", props.selectedProfile?.name ?? project.profileId],
          ["Target duration", project.setup.targetDuration],
          ["Workflow mode", workflowModeOptions.find((option) => option.value === project.setup.workflowMode)?.label ?? project.setup.workflowMode],
          ["Scenes", String(project.scenes.length)],
          ["Shots", String(project.shots.length)],
          ["Approved idea", project.approvedIdeaId ?? "Pending"]
        ]} />
      </SectionCard>
      <SectionCard title="Advanced controls" description="Internal stages remain available for debugging, not as the normal production path.">
        <button className="button secondary compact" type="button" onClick={() => props.setRoute("advanced-pipeline")}>Open Advanced Pipeline Details</button>
      </SectionCard>
    </>
  );
}

function stageRoute(name: string): RouteId {
  if (name === "asset-review" || /asset review/i.test(name)) return "scene-review";
  if (name === "preview-render" || /preview render/i.test(name)) return "final-preview";
  const stage = workflowStageDefinitions.find((definition) => definition.id === name || definition.name === name);
  if (stage) return stage.screenRoute as RouteId;
  if (/channel|profile/i.test(name)) return "channel-profiles";
  if (/reference/i.test(name)) return "reference-intake";
  if (/competitor/i.test(name)) return "competitor-dna";
  if (/opportunity|originality|idea/i.test(name)) return "idea-lab";
  if (/idea/i.test(name)) return "idea-lab";
  if (/script|outline|retention|fact/i.test(name)) return "script";
  if (/scene/i.test(name)) return "scenes";
  if (/shot|visual/i.test(name)) return "shots";
  if (/voice/i.test(name)) return "voice";
  if (/timeline|preview/i.test(name)) return "timeline";
  if (/qa/i.test(name)) return "qa";
  if (/capcut|export|packaging/i.test(name)) return "export";
  return "project-overview";
}

function ChannelProfilesScreen(props: { profiles: ChannelProfile[]; onRefresh: () => Promise<void> }) {
  const [selectedId, setSelectedId] = useState(props.profiles[0]?.id ?? "");
  const selected = props.profiles.find((profile) => profile.id === selectedId) ?? props.profiles[0];
  const [characterName, setCharacterName] = useState("The Channel Teacher");
  const [persona, setPersona] = useState({ role: "Educational YouTube teacher", ageRange: "30-45", appearance: "Approachable, expressive, clear silhouette", wardrobe: "Smart casual blazer", palette: "Navy, cream, warm gold", props: "", gestures: "Pointing, open hand, presenting", tone: "Clear, curious, encouraging" });
  const [invariantTraits, setInvariantTraits] = useState("Same face, hairstyle, body proportions, wardrobe palette");
  const [prohibitedChanges, setProhibitedChanges] = useState("No age shift, costume redesign, logos, or identity changes");
  const [viewCount, setViewCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const versions = selected?.characterVersions ?? [];

  async function generateCharacterPack(): Promise<void> {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      await factoryClient.generateCharacterPack({ profileId: selected.id, name: characterName.trim(), persona: { ...persona, props: persona.props.split(",").map((item) => item.trim()).filter(Boolean), gestures: persona.gestures.split(",").map((item) => item.trim()).filter(Boolean) }, invariantTraits: invariantTraits.split("\n").map((item) => item.trim()).filter(Boolean), prohibitedChanges: prohibitedChanges.split("\n").map((item) => item.trim()).filter(Boolean), viewCount });
      await props.onRefresh();
      setMessage("Da tao prompt pack local. Copy tung prompt sang GG Lab, upload du anh roi approve.");
    } catch (error) {
      setMessage(`Character generation failed: ${safeRendererError(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function preview(versionId: string, view: CharacterReferenceView): Promise<void> {
    try {
      const result = await factoryClient.getCharacterPreviewUrl({ profileId: selected!.id, versionId, view });
      setPreviewUrls((current) => ({ ...current, [`${versionId}:${view}`]: result.url }));
    } catch (error) {
      setMessage(`Preview unavailable: ${safeRendererError(error)}`);
    }
  }

  async function retry(versionId: string, view: CharacterReferenceView): Promise<void> {
    if (!selected) return;
    setBusy(true);
    try {
      await factoryClient.retryCharacterReference({ profileId: selected.id, versionId, view });
      await props.onRefresh();
      setMessage(`Da tao lai prompt cho view ${view.replaceAll("_", " ")}. Hay tao va upload anh moi.`);
    } catch (error) {
      setMessage(`Character view retry failed: ${safeRendererError(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function upload(versionId: string, view: CharacterReferenceView): Promise<void> {
    if (!selected) return;
    setBusy(true);
    try {
      await factoryClient.uploadCharacterReference({ profileId: selected.id, versionId, view });
      await props.onRefresh();
      setMessage(`Da upload anh cho view ${view.replaceAll("_", " ")}.`);
    } catch (error) {
      setMessage(`Character upload failed: ${safeRendererError(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function approve(versionId: string): Promise<void> {
    if (!selected) return;
    setBusy(true);
    try {
      await factoryClient.approveCharacterVersion({ profileId: selected.id, versionId });
      await props.onRefresh();
      setMessage("Character version approved and set active for new projects.");
    } catch (error) {
      setMessage(`Character approval failed: ${safeRendererError(error)}`);
    } finally {
      setBusy(false);
    }
  }

  function updatePersona(field: keyof typeof persona, value: string): void {
    setPersona((current) => ({ ...current, [field]: value }));
  }

  return (
    <>
      <PageHeader
        title="Channel Profiles"
        description="Configure the teacher identity once per channel. New character-first projects reuse the active approved version."
        actions={
          <>
            <button className="button primary" type="button" disabled={busy || !selected} onClick={() => void generateCharacterPack()}>Create GG Lab Prompt Pack</button>
            <DisabledAction reason="Profile import/export is not implemented.">Import JSON</DisabledAction>
          </>
        }
      />
      <div className="split-grid">
        <SectionCard title="Profiles">
          <DataTable label="Channel profiles">
            <thead>
              <tr>
                <th>Name</th>
                <th>Main keyword</th>
                <th>Niche</th>
                <th>Language</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {props.profiles.map((profile) => (
                <tr key={profile.id} onClick={() => setSelectedId(profile.id)} className={selectedId === profile.id ? "selected-row" : ""}>
                  <td>{profile.name}</td>
                  <td>{profile.mainKeyword}</td>
                  <td>{profile.niche}</td>
                  <td>{profile.language}</td>
                  <td><StatusBadge tone="success">Seeded</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </SectionCard>
        {selected ? (
          <SectionCard title="Teacher character setup" description="Tao prompt local, tu gen anh trong GG Lab, upload tung view roi duyet ca pack.">
            <div className="tabs-static">
              {["General", "Audience", "Content", "Tone", "Visuals", "Voice", "Hashtags", "Avoid Rules", "Router Signals"].map((tab) => <span key={tab}>{tab}</span>)}
            </div>
            <div className="inspector">
              <h3>{selected.name}</h3>
              <p>{selected.targetAudience}</p>
              <p><strong>Tone:</strong> {selected.tone}</p>
              <p><strong>Visuals:</strong> {selected.visualStyle}</p>
              <TagList items={selected.routerSignals} limit={10} />
              <TagList items={selected.coreHashtags.concat(selected.secondaryHashtags)} limit={8} />
            </div>
            <div className="form-grid">
              <FormField label="Teacher name" htmlFor="character-name"><input id="character-name" value={characterName} onChange={(event) => setCharacterName(event.target.value)} /></FormField>
              <FormField label="Role" htmlFor="character-role"><input id="character-role" value={persona.role} onChange={(event) => updatePersona("role", event.target.value)} /></FormField>
              <FormField label="Age range" htmlFor="character-age"><input id="character-age" value={persona.ageRange} onChange={(event) => updatePersona("ageRange", event.target.value)} /></FormField>
              <FormField label="Appearance" htmlFor="character-appearance"><textarea id="character-appearance" value={persona.appearance} onChange={(event) => updatePersona("appearance", event.target.value)} /></FormField>
              <FormField label="Wardrobe" htmlFor="character-wardrobe"><input id="character-wardrobe" value={persona.wardrobe} onChange={(event) => updatePersona("wardrobe", event.target.value)} /></FormField>
              <FormField label="Palette" htmlFor="character-palette"><input id="character-palette" value={persona.palette} onChange={(event) => updatePersona("palette", event.target.value)} /></FormField>
              <FormField label="Props (comma separated)" htmlFor="character-props"><input id="character-props" value={persona.props} onChange={(event) => updatePersona("props", event.target.value)} /></FormField>
              <FormField label="Gestures (comma separated)" htmlFor="character-gestures"><input id="character-gestures" value={persona.gestures} onChange={(event) => updatePersona("gestures", event.target.value)} /></FormField>
              <FormField label="Tone" htmlFor="character-tone"><input id="character-tone" value={persona.tone} onChange={(event) => updatePersona("tone", event.target.value)} /></FormField>
              <FormField label="Identity pack views" htmlFor="character-view-count"><select id="character-view-count" value={viewCount} onChange={(event) => setViewCount(Number(event.target.value))}><option value={4}>4 views</option><option value={5}>5 views</option><option value={6}>6 views</option></select></FormField>
              <FormField label="Invariant traits" htmlFor="character-invariants"><textarea id="character-invariants" value={invariantTraits} onChange={(event) => setInvariantTraits(event.target.value)} /></FormField>
              <FormField label="Prohibited changes" htmlFor="character-prohibited"><textarea id="character-prohibited" value={prohibitedChanges} onChange={(event) => setProhibitedChanges(event.target.value)} /></FormField>
            </div>
            {versions.map((version) => {
              const uploadReady = version.references.length >= 4 && version.references.every((reference) => Boolean(reference.relativeFilePath && reference.sha256));
              return <SectionCard key={version.id} title={`${version.name} v${version.version}`} description={`${characterVersionIsApproved(version) ? "approved" : version.status.replaceAll("_", " ")}${selected.activeCharacterVersionId === version.id ? " / active" : ""}`}>
                <div className="profile-grid">{version.references.map((reference) => {
                  const key = `${version.id}:${reference.view}`;
                  return <div className="profile-card" key={reference.id}>
                    <strong>{reference.view.replaceAll("_", " ")}</strong>
                    <small>{reference.relativeFilePath ? "image uploaded / review pending" : "prompt ready / image missing"}</small>
                    {previewUrls[key] ? <img className="character-preview" src={previewUrls[key]} alt={`${version.name} ${reference.view}`} /> : reference.relativeFilePath ? <button className="button compact" type="button" onClick={() => void preview(version.id, reference.view)}>Preview</button> : <p className="muted">No image uploaded.</p>}
                    {reference.promptText ? <><textarea className="prompt-preview" readOnly value={reference.promptText} aria-label={`Prompt ${reference.view}`} /><button className="button compact" type="button" onClick={() => void navigator.clipboard.writeText(reference.promptText ?? "")}>Copy prompt</button></> : null}
                    <div className="button-row"><button className="button primary compact" type="button" disabled={busy} onClick={() => void upload(version.id, reference.view)}>Upload / replace</button><button className="button secondary compact" type="button" disabled={busy} onClick={() => void retry(version.id, reference.view)}>Regenerate prompt</button></div>
                  </div>;
                })}</div>
                {!characterVersionIsApproved(version) ? <><button className="button primary compact" type="button" disabled={busy || !uploadReady} onClick={() => void approve(version.id)}>Approve / Lock Version</button>{!uploadReady ? <small className="muted">Upload every identity view before approval.</small> : null}</> : <StatusBadge tone="success">Approved and active</StatusBadge>}
              </SectionCard>;
            })}
            {message ? <p className={message.includes("failed") || message.includes("unavailable") ? "error-message" : "safe-message"}>{message}</p> : null}
          </SectionCard>
        ) : null}
      </div>
    </>
  );
}

function StageStatusHeader(props: {
  stageName: string;
  stageNumber: number;
  eligibility: StageEligibility;
  dependencies: string[];
  purpose: string;
}) {
  const registeredStage = workflowStageDefinitions.find((stage) => stage.name === props.stageName);
  return (
    <SectionCard title={props.stageName} description={props.purpose}>
      <div className="metric-grid">
        <MetricCard label="Stage number" value={registeredStage?.order ?? props.stageNumber} />
        <MetricCard label="Current status" value={props.eligibility.status.replaceAll("_", " ")} tone={stageTone(props.eligibility.status)} />
        <MetricCard label="Runnable" value={props.eligibility.runnable ? "Yes" : "No"} tone={props.eligibility.runnable ? "success" : "warning"} />
        <MetricCard label="Approval" value={props.eligibility.approvable ? "Available" : "Locked"} tone={props.eligibility.approvable ? "success" : "warning"} />
      </div>
      <SettingsList items={[
        ["Dependencies", props.dependencies.join(", ") || "None"],
        ["Reviewable", props.eligibility.reviewable ? "Yes" : "No"],
        ["Blocking reasons", props.eligibility.blockingReasons.map((reason) => reason.message).join(" ") || "None"]
      ]} />
    </SectionCard>
  );
}

function canRetryStage(stage: StageEligibility): boolean {
  return stage.runnable || stage.status === "failed" || stage.status === "needs_attention";
}

function ActionableBlockedState(props: { eligibility: StageEligibility; setRoute: (route: RouteId) => void }) {
  if (!props.eligibility.blockingReasons.length) return null;
  return (
    <SectionCard title="Blocked prerequisites">
      <div className="status-grid">
        {props.eligibility.blockingReasons.map((reason) => (
          <div className="status-row" key={`${props.eligibility.stageId}-${reason.code}`}>
            <span>{reason.message}</span>
            <StatusBadge tone="warning">{reason.code.replaceAll("_", " ")}</StatusBadge>
            {(reason.actions?.length ? reason.actions : reason.actionRoute ? [{ label: "Go to required screen", route: reason.actionRoute }] : [])
              .filter((action) => action.route)
              .map((action) => <button className="button compact" key={`${reason.code}-${action.label}`} type="button" onClick={() => props.setRoute(action.route as RouteId)}>{action.label}</button>)}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function ReferenceIntakeScreen(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; setRoute: (route: RouteId) => void; startSemiAutomatic: (chain: SemiAutomaticChain, project: FactoryProject) => Promise<void> }) {
  const referenceValidation = resolveStageEligibilities(props.project).find((stage) => stage.stageId === "reference-validation")!;
  const canContinue = props.project.referenceSet?.status === "approved";
  return (
    <>
      <PageHeader
        title="Reference Intake"
        description="Paste competitor links, transcripts, or analysis blocks and save them into this project."
        actions={canContinue ? (
          <button className="button primary" type="button" onClick={() => props.setRoute("competitor-dna")}>Continue to Competitor Workflow</button>
        ) : (
          <DisabledAction reason={referenceValidation.blockingReasons[0]?.message ?? "Validate and approve the reference set first."}>Continue to Competitor Workflow</DisabledAction>
        )}
      />
      <StageStatusHeader
        stageName="Reference Validation"
        stageNumber={3}
        eligibility={referenceValidation}
        dependencies={["Reference Intake"]}
        purpose="Validate references, resolve duplicates, and approve the exact reference set that unlocks the competitor workflow."
      />
      <CompetitorReferenceIntake project={props.project} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} startSemiAutomatic={props.startSemiAutomatic} />
    </>
  );
}

function CompetitorReferenceIntake(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; setRoute: (route: RouteId) => void; startSemiAutomatic: (chain: SemiAutomaticChain, project: FactoryProject) => Promise<void> }) {
  const [sourceUrl, setSourceUrl] = useState("");
  const [pastedTranscript, setPastedTranscript] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [duplicateReferenceId, setDuplicateReferenceId] = useState<string | null>(null);
  const [editingReferenceId, setEditingReferenceId] = useState<string | null>(null);
  const [replaceReferenceId, setReplaceReferenceId] = useState<string | null>(null);
  const [viewingReferenceId, setViewingReferenceId] = useState<string | null>(null);
  const [expandedVersionRootId, setExpandedVersionRootId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const referenceSetStatus = props.project.referenceSet?.status ?? "not_started";
  const includedReferences = props.project.competitorReferences.filter((reference) => reference.included !== false);
  const includedCount = includedReferences.length;
  const validCount = props.project.referenceSet?.validCount ?? includedReferences.filter((reference) => reference.status === "valid" || reference.status === "approved").length;
  const invalidCount = props.project.referenceSet?.invalidCount ?? includedReferences.filter((reference) => reference.status === "invalid").length;
  const duplicateCount = props.project.referenceSet?.duplicateCount ?? includedReferences.filter((reference) => reference.status === "duplicate").length;
  const draftCount = props.project.referenceSet?.draftCount ?? includedReferences.filter((reference) => !reference.status || reference.status === "draft").length;
  const excludedCount = props.project.referenceSet?.excludedCount ?? props.project.competitorReferences.length - includedCount;
  const hasValidReferenceSet = referenceSetStatus === "valid";
  const referenceValidation = resolveStageEligibilities(props.project).find((stage) => stage.stageId === "reference-validation");
  const canContinue = referenceSetStatus === "approved";

  function referenceRootId(reference: typeof props.project.competitorReferences[number]): string {
    const byId = new Map(props.project.competitorReferences.map((item) => [item.id, item]));
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

  async function confirmApprovedChange(action: string): Promise<boolean> {
    if (props.project.referenceSet?.status !== "approved") return true;
    const impact = await factoryClient.getReferenceChangeImpact();
    const stages = impact.stageNames.length ? impact.stageNames.map((name) => `- ${name}`).join("\n") : "- Reference Validation and dependent stages";
    return window.confirm(`${action} will invalidate:\n\n${stages}\n\nContinue?`);
  }

  async function addReference() {
    setSaving(true);
    setMessage("");
    try {
      if (replaceReferenceId) {
        if (!(await confirmApprovedChange("Creating a new transcript version"))) return;
        const project = await factoryClient.replaceCompetitorReference({
          projectId: props.project.id,
          referenceId: replaceReferenceId,
          pastedTranscript,
          ...(notes.trim() ? { notes: notes.trim() } : {})
        });
        props.setSelectedProject(project);
        clearForm();
        setMessage("Transcript version created. Validate the reference set again.");
        return;
      }
      if (editingReferenceId) {
        if (!(await confirmApprovedChange("Changing this approved reference"))) return;
        const project = await factoryClient.editCompetitorReference({
          projectId: props.project.id,
          referenceId: editingReferenceId,
          ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
          pastedTranscript,
          ...(notes.trim() ? { notes: notes.trim() } : {})
        });
        props.setSelectedProject(project);
        clearForm();
        setMessage("Reference edited. Validate the reference set again.");
        return;
      }
      if (!(await confirmApprovedChange("Adding a reference to this approved set"))) return;
      const result = await factoryClient.addCompetitorReference({
        projectId: props.project.id,
        ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
        pastedTranscript,
        ...(notes.trim() ? { notes: notes.trim() } : {})
      });
      props.setSelectedProject(result.project);
      if (result.status === "duplicate") {
        setDuplicateReferenceId(result.existingReference?.id ?? null);
        setMessage(result.message);
        return;
      }
      clearForm();
      setMessage(result.message);
    } catch (error) {
      setMessage(`Competitor reference save failed: ${safeRendererError(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function replaceDuplicate() {
    if (!duplicateReferenceId) return;
    setSaving(true);
    try {
      if (!(await confirmApprovedChange("Creating a new transcript version"))) return;
      const project = await factoryClient.replaceCompetitorReference({
        projectId: props.project.id,
        referenceId: duplicateReferenceId,
        pastedTranscript,
        ...(notes.trim() ? { notes: notes.trim() } : {})
      });
      props.setSelectedProject(project);
      clearForm();
      setDuplicateReferenceId(null);
      setMessage("Duplicate transcript saved as a new reference version.");
    } catch (error) {
      setMessage(`Reference replace failed: ${safeRendererError(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function validateReferenceSet() {
    try {
      const project = await factoryClient.validateReferenceSet({ projectId: props.project.id });
      props.setSelectedProject(project);
      setMessage(project.referenceSet?.status === "valid" ? "Reference set validated. Review and approve it to continue." : "Reference set validation found issues to fix.");
    } catch (error) {
      setMessage(`Reference validation failed: ${safeRendererError(error)}`);
    }
  }

  async function approveReferenceSet() {
    try {
      const project = await factoryClient.approveReferenceSet({ projectId: props.project.id });
      props.setSelectedProject(project);
      setMessage("Reference set approved. Competitor Workflow is now available.");
      if (project.setup.workflowMode === "semi_automatic") void props.startSemiAutomatic("reference", project);
    } catch (error) {
      setMessage(`Reference approval failed: ${safeRendererError(error)}`);
    }
  }

  async function rejectReferenceSet() {
    const project = await factoryClient.rejectReferenceSet({ projectId: props.project.id });
    props.setSelectedProject(project);
    setMessage("Reference set rejected. Update references, then validate again.");
  }

  async function revokeReferenceSetApproval() {
    if (!(await confirmApprovedChange("Revoking this approval"))) return;
    const project = await factoryClient.revokeReferenceSetApproval({ projectId: props.project.id });
    props.setSelectedProject(project);
    setMessage("Reference set approval revoked. Validate the current references before continuing.");
  }

  function startEdit(referenceId: string) {
    const reference = props.project.competitorReferences.find((item) => item.id === referenceId);
    if (!reference) return;
    setEditingReferenceId(reference.id);
    setReplaceReferenceId(null);
    setSourceUrl(reference.sourceUrl ?? "");
    setPastedTranscript(reference.pastedTranscript);
    setNotes(reference.notes ?? "");
    setDuplicateReferenceId(null);
  }

  function startReplace(referenceId: string) {
    const reference = props.project.competitorReferences.find((item) => item.id === referenceId);
    if (!reference) return;
    setEditingReferenceId(null);
    setReplaceReferenceId(reference.id);
    setSourceUrl(reference.sourceUrl ?? "");
    setPastedTranscript("");
    setNotes(reference.notes ?? "");
    setDuplicateReferenceId(null);
  }

  function clearForm() {
    setSourceUrl("");
    setPastedTranscript("");
    setNotes("");
    setEditingReferenceId(null);
    setReplaceReferenceId(null);
  }

  return (
    <>
      <SectionCard title="Competitor reference intake" description="Save references as Draft, validate them locally, then explicitly approve the current reference set.">
        <div className="form-grid">
          <FormField label="Competitor video URL" htmlFor="idea-competitor-url" hint="FFmpeg is required later for local video/audio processing; pasted URL is stored now for traceability.">
            <input id="idea-competitor-url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://..." />
          </FormField>
          <FormField label="Pasted transcript / analysis" htmlFor="idea-competitor-script">
            <textarea id="idea-competitor-script" value={pastedTranscript} onChange={(event) => setPastedTranscript(event.target.value)} placeholder="Paste the full competitor transcript or analysis block here" />
          </FormField>
          <FormField label="Notes" htmlFor="idea-competitor-notes">
            <textarea id="idea-competitor-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional notes for what AI should inspect" />
          </FormField>
          <div className="button-row">
            {pastedTranscript.trim() ? (
              <button className="button primary" type="button" onClick={() => void addReference()} disabled={saving}>{saving ? "Saving..." : replaceReferenceId ? "Create transcript version" : editingReferenceId ? "Save reference edits" : "Save competitor reference"}</button>
            ) : (
              <DisabledAction reason="Paste a transcript or analysis block before saving.">Save competitor reference</DisabledAction>
            )}
            {editingReferenceId || replaceReferenceId ? <button className="button secondary" type="button" onClick={clearForm}>Cancel edit</button> : null}
          </div>
          {duplicateReferenceId ? (
            <div className="button-row">
              <button className="button secondary" type="button" onClick={() => { setViewingReferenceId(duplicateReferenceId); setDuplicateReferenceId(null); }}>Open existing</button>
              <button className="button primary" type="button" onClick={() => void replaceDuplicate()} disabled={saving}>Replace transcript as new version</button>
              <button className="button secondary" type="button" onClick={() => { setDuplicateReferenceId(null); clearForm(); }}>Cancel duplicate</button>
            </div>
          ) : null}
          {message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}
        </div>
      </SectionCard>
      <SectionCard title="Reference set controls" description="A saved reference is only Draft until local validation and reference-set approval are complete.">
        <div className="metric-grid">
          <MetricCard label="Reference set" value={referenceSetStatus.replaceAll("_", " ")} tone={referenceSetStatus === "approved" ? "success" : referenceSetStatus === "stale" ? "warning" : "info"} />
          <MetricCard label="Included" value={includedCount} />
          <MetricCard label="Valid" value={validCount} tone="success" />
          <MetricCard label="Invalid" value={invalidCount} tone={invalidCount ? "warning" : "info"} />
          <MetricCard label="Duplicates" value={duplicateCount} tone={duplicateCount ? "warning" : "info"} />
          <MetricCard label="Draft" value={draftCount} tone={draftCount ? "warning" : "info"} />
          <MetricCard label="Excluded" value={excludedCount} />
        </div>
        <p className="muted">Fingerprint: {props.project.referenceSet?.currentFingerprint ? `${props.project.referenceSet.currentFingerprint.slice(0, 12)}...` : "Not validated"} · Last validated: {props.project.referenceSet?.validationRunAt ? formatDate(props.project.referenceSet.validationRunAt) : "Never"} · Last approved: {props.project.referenceSet?.approvedAt ? formatDate(props.project.referenceSet.approvedAt) : "Never"}</p>
        <div className="button-row">
          {props.project.competitorReferences.length ? (
            <button className="button secondary" type="button" onClick={() => void validateReferenceSet()}>Validate reference set</button>
          ) : (
            <DisabledAction reason="Add at least one reference first.">Validate reference set</DisabledAction>
          )}
          {hasValidReferenceSet && referenceValidation?.approvable ? (
            <button className="button primary" type="button" onClick={() => void approveReferenceSet()}>Approve reference set</button>
          ) : (
            <DisabledAction reason={referenceValidation?.blockingReasons[0]?.message ?? "Reference set must be valid before approval."}>Approve reference set</DisabledAction>
          )}
          {hasValidReferenceSet ? (
            <button className="button danger" type="button" onClick={() => void rejectReferenceSet()}>Reject reference set</button>
          ) : null}
          {referenceSetStatus === "approved" ? (
            <button className="button danger" type="button" onClick={() => void revokeReferenceSetApproval()}>Revoke reference approval</button>
          ) : null}
          {canContinue ? (
            <button className="button primary" type="button" onClick={() => props.setRoute("competitor-dna")}>Continue to Competitor Workflow</button>
          ) : (
            <DisabledAction reason="Approve the validated reference set before continuing.">Continue to Competitor Workflow</DisabledAction>
          )}
        </div>
      </SectionCard>
      <SectionCard title="Saved competitor references">
        {props.project.competitorReferences.length === 0 ? (
          <EmptyState title="No competitor references yet" detail="Paste a transcript or analysis block above. AI analysis can use it after the provider pipeline is wired." />
        ) : (
          <DataTable label="Competitor references">
              <thead><tr><th>Include</th><th>Source identity</th><th>Transcript</th><th>Status</th><th>Version</th><th>Validated</th><th>Actions</th></tr></thead>
              <tbody>
                {props.project.competitorReferences.map((reference) => (
                  <React.Fragment key={reference.id}>
                  <tr key={reference.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={reference.included !== false}
                        onChange={(event) => {
                          void confirmApprovedChange("Changing this reference inclusion").then((confirmed) => confirmed
                            ? factoryClient.setReferenceIncluded({ projectId: props.project.id, referenceId: reference.id, included: event.target.checked }).then(props.setSelectedProject)
                            : undefined);
                        }}
                        aria-label={`Include ${reference.sourceUrl ?? reference.id}`}
                      />
                    </td>
                    <td><strong>{reference.identityKey ?? "manual"}</strong><small>{reference.sourceUrl ?? "Manual paste"}</small></td>
                    <td>{reference.pastedTranscript.slice(0, 180)}{reference.pastedTranscript.length > 180 ? "..." : ""}</td>
                    <td>
                      <StatusBadge tone={reference.status === "approved" || reference.status === "valid" ? "success" : reference.status === "invalid" || reference.status === "duplicate" ? "danger" : "warning"}>
                        {(reference.status ?? "draft").replaceAll("_", " ")}
                      </StatusBadge>
                      {reference.validationMessage ? <small>{reference.validationMessage}</small> : null}
                      {reference.validationErrors?.length ? <small>Errors: {reference.validationErrors.join(", ")}</small> : null}
                      {reference.validationWarnings?.length ? <small>Warnings: {reference.validationWarnings.join(", ")}</small> : null}
                    </td>
                    <td>{reference.version ?? 1}</td>
                    <td>{reference.validatedAt ? formatDate(reference.validatedAt) : "Never"}</td>
                    <td className="row-actions">
                      <button className="button compact" type="button" onClick={() => setViewingReferenceId(viewingReferenceId === reference.id ? null : reference.id)}>{viewingReferenceId === reference.id ? "Hide" : "View"}</button>
                      <button className="button compact" type="button" onClick={() => startEdit(reference.id)}>Edit</button>
                      <button className="button compact" type="button" onClick={() => startReplace(reference.id)}>Replace transcript</button>
                      <button className="button compact" type="button" onClick={() => { const rootId = referenceRootId(reference); setExpandedVersionRootId(expandedVersionRootId === rootId ? null : rootId); }}>{expandedVersionRootId === referenceRootId(reference) ? "Hide versions" : "Versions"}</button>
                      <button className="button compact" type="button" onClick={() => void validateReferenceSet()}>Validate</button>
                      <button className="button compact" type="button" onClick={() => void factoryClient.setReferenceIncluded({ projectId: props.project.id, referenceId: reference.id, included: reference.included === false }).then(props.setSelectedProject)}>{reference.included === false ? "Include" : "Exclude"}</button>
                      <button
                        className="button danger compact"
                        type="button"
                        onClick={() => {
                          void confirmApprovedChange("Deleting this reference").then((confirmed) => confirmed ? factoryClient.deleteCompetitorReference({ projectId: props.project.id, referenceId: reference.id }).then(props.setSelectedProject) : undefined);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                  {viewingReferenceId === reference.id || expandedVersionRootId === referenceRootId(reference) ? (
                    <tr key={`${reference.id}-details`}><td colSpan={7}>
                      {viewingReferenceId === reference.id ? <div><strong>Current transcript</strong><p>{reference.pastedTranscript}</p><small>Identity: {reference.identityKey ?? "manual"} · Created: {formatDate(reference.createdAt)} · Updated: {reference.updatedAt ? formatDate(reference.updatedAt) : "Never"}</small></div> : null}
                      {expandedVersionRootId === referenceRootId(reference) ? <div><strong>Transcript versions</strong><p>{props.project.competitorReferences.filter((item) => referenceRootId(item) === referenceRootId(reference)).map((item) => `v${item.version ?? 1} ${item.id}${item.included === false ? " (inactive)" : " (current)"}`).join(" · ")}</p></div> : null}
                    </td></tr>
                  ) : null}
                  </React.Fragment>
                ))}
              </tbody>
            </DataTable>
        )}
      </SectionCard>
    </>
  );
}

function CompetitorDnaScreen(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; setRoute: (route: RouteId) => void; textCertification: TextModelCertificationResponse; startSemiAutomatic: (chain: SemiAutomaticChain, project: FactoryProject) => Promise<void> }) {
  const [runningReferenceId, setRunningReferenceId] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState("");
  const [cleaningArtifacts, setCleaningArtifacts] = useState<TranscriptCleaningArtifact[]>([]);
  const [segmentationArtifacts, setSegmentationArtifacts] = useState<ReferenceSegmentationArtifact[]>([]);
  const [dnaArtifacts, setDnaArtifacts] = useState<CompetitorDnaArtifact[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<CompetitorWorkflowRun[]>([]);
  const hasReferences = props.project.competitorReferences.length > 0;
  const eligibilities = resolveStageEligibilities(props.project, { textVerified: props.textCertification.status === "verified" });
  const transcriptCleaning = eligibilities.find((stage) => stage.stageId === "transcript-cleaning")!;
  const segmentation = eligibilities.find((stage) => stage.stageId === "reference-segmentation")!;
  const competitorDna = eligibilities.find((stage) => stage.stageId === "competitor-dna")!;
  const approvedReferences = props.project.competitorReferences.filter((reference) => reference.included !== false && reference.status === "approved");
  const isSemiAutomatic = props.project.setup.workflowMode === "semi_automatic";

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      Promise.all(approvedReferences.map((reference) => factoryClient.listTranscriptCleaningArtifacts({ projectId: props.project.id, referenceId: reference.id }))),
      Promise.all(approvedReferences.map((reference) => factoryClient.listReferenceSegmentationArtifacts({ projectId: props.project.id, referenceId: reference.id }))),
      Promise.all(approvedReferences.map((reference) => factoryClient.listCompetitorDnaArtifacts({ projectId: props.project.id, referenceId: reference.id }))),
      loadCompetitorWorkflowRuns(props.project.id)
    ])
      .then(([cleaning, segmentationArtifacts, dnaArtifacts, runs]) => {
        if (!cancelled) {
          setCleaningArtifacts(cleaning.flat());
          setSegmentationArtifacts(segmentationArtifacts.flat());
          setDnaArtifacts(dnaArtifacts.flat());
          setWorkflowRuns(runs);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCleaningArtifacts([]);
          setSegmentationArtifacts([]);
          setDnaArtifacts([]);
          setWorkflowRuns([]);
        }
      });
    return () => { cancelled = true; };
  }, [props.project]);

  useEffect(() => {
    if (!runningReferenceId) return;
    let cancelled = false;
    const refresh = () => {
      void loadCompetitorWorkflowRuns(props.project.id).then((runs) => {
        if (!cancelled) setWorkflowRuns(runs);
      }).catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [runningReferenceId, props.project.id]);

  async function reloadWorkflowRuns() {
    try { setWorkflowRuns(await loadCompetitorWorkflowRuns(props.project.id)); } catch { /* keep the last persisted view */ }
  }

  function continueAutomaticReferenceChain(project: FactoryProject): void {
    if (project.setup.workflowMode === "semi_automatic") void props.startSemiAutomatic("reference", project);
  }

  async function runCleaning(referenceId: string) {
    setRunningReferenceId(referenceId);
    setRunMessage("");
    try {
      const project = await factoryClient.runTranscriptCleaning({ projectId: props.project.id, referenceId });
      props.setSelectedProject(project);
      continueAutomaticReferenceChain(project);
      const artifacts = await factoryClient.listTranscriptCleaningArtifacts({ projectId: props.project.id, referenceId });
      setCleaningArtifacts((current) => [...current.filter((artifact) => artifact.payloadJson.referenceId !== referenceId), ...artifacts]);
      const stageStatus = project.stages.find((stage) => stage.id === "transcript-cleaning")?.status;
      setRunMessage(stageStatus === "queued" || stageStatus === "running"
        ? "Transcript Cleaning is already running; no duplicate request was sent."
        : "Transcript Cleaning completed and is ready for review.");
    } catch (error) {
      setRunMessage(`Transcript Cleaning failed: ${safeRendererError(error)}`);
    } finally {
      void reloadWorkflowRuns();
      setRunningReferenceId(null);
    }
  }

  async function approveCleaning(referenceId: string) {
    setRunningReferenceId(referenceId);
    setRunMessage("");
    try {
      const project = await factoryClient.approveTranscriptCleaning({ projectId: props.project.id, referenceId });
      props.setSelectedProject(project);
      continueAutomaticReferenceChain(project);
      const artifacts = await factoryClient.listTranscriptCleaningArtifacts({ projectId: props.project.id, referenceId });
      setCleaningArtifacts((current) => [...current.filter((artifact) => artifact.payloadJson.referenceId !== referenceId), ...artifacts]);
      setRunMessage("Cleaned transcript approved.");
    } catch (error) {
      setRunMessage(`Transcript approval failed: ${safeRendererError(error)}`);
    } finally {
      void reloadWorkflowRuns();
      setRunningReferenceId(null);
    }
  }

  async function rejectCleaning(referenceId: string) {
    setRunningReferenceId(referenceId);
    setRunMessage("");
    try {
      const project = await factoryClient.rejectTranscriptCleaning({ projectId: props.project.id, referenceId });
      props.setSelectedProject(project);
      const artifacts = await factoryClient.listTranscriptCleaningArtifacts({ projectId: props.project.id, referenceId });
      setCleaningArtifacts((current) => [...current.filter((artifact) => artifact.payloadJson.referenceId !== referenceId), ...artifacts]);
      setRunMessage("Cleaned transcript rejected.");
    } catch (error) {
      setRunMessage(`Transcript rejection failed: ${safeRendererError(error)}`);
    } finally {
      void reloadWorkflowRuns();
      setRunningReferenceId(null);
    }
  }

  async function runSegmentation(referenceId: string) {
    setRunningReferenceId(referenceId);
    setRunMessage("");
    try {
      const project = await factoryClient.runReferenceSegmentation({ projectId: props.project.id, referenceId });
      props.setSelectedProject(project);
      continueAutomaticReferenceChain(project);
      const artifacts = await factoryClient.listReferenceSegmentationArtifacts({ projectId: props.project.id, referenceId });
      setSegmentationArtifacts((current) => current.filter((artifact) => artifact.payloadJson.referenceId !== referenceId).concat(artifacts));
      setRunMessage("Reference Segmentation completed and is ready for review.");
    } catch (error) {
      setRunMessage(`Reference Segmentation failed: ${safeRendererError(error)}`);
    } finally {
      void reloadWorkflowRuns();
      setRunningReferenceId(null);
    }
  }

  async function approveSegmentation(referenceId: string) {
    setRunningReferenceId(referenceId);
    setRunMessage("");
    try {
      const project = await factoryClient.approveReferenceSegmentation({ projectId: props.project.id, referenceId });
      props.setSelectedProject(project);
      continueAutomaticReferenceChain(project);
      const artifacts = await factoryClient.listReferenceSegmentationArtifacts({ projectId: props.project.id, referenceId });
      setSegmentationArtifacts((current) => current.filter((artifact) => artifact.payloadJson.referenceId !== referenceId).concat(artifacts));
      setRunMessage("Reference segmentation approved.");
    } catch (error) {
      setRunMessage(`Segmentation approval failed: ${safeRendererError(error)}`);
    } finally {
      setRunningReferenceId(null);
    }
  }

  async function rejectSegmentation(referenceId: string) {
    setRunningReferenceId(referenceId);
    setRunMessage("");
    try {
      const project = await factoryClient.rejectReferenceSegmentation({ projectId: props.project.id, referenceId });
      props.setSelectedProject(project);
      const artifacts = await factoryClient.listReferenceSegmentationArtifacts({ projectId: props.project.id, referenceId });
      setSegmentationArtifacts((current) => current.filter((artifact) => artifact.payloadJson.referenceId !== referenceId).concat(artifacts));
      setRunMessage("Reference segmentation rejected.");
    } catch (error) {
      setRunMessage(`Segmentation rejection failed: ${safeRendererError(error)}`);
    } finally {
      setRunningReferenceId(null);
    }
  }

  async function runDna(referenceId: string) {
    setRunningReferenceId(referenceId); setRunMessage("");
    try {
      const project = await factoryClient.runCompetitorDna({ projectId: props.project.id, referenceId });
      props.setSelectedProject(project);
      continueAutomaticReferenceChain(project);
      const artifacts = await factoryClient.listCompetitorDnaArtifacts({ projectId: props.project.id, referenceId });
      setDnaArtifacts((current) => current.filter((artifact) => artifact.payloadJson.referenceId !== referenceId).concat(artifacts));
      setRunMessage("Competitor DNA completed and is ready for review.");
    } catch (error) { setRunMessage(`Competitor DNA failed: ${safeRendererError(error)}`); }
    finally { void reloadWorkflowRuns(); setRunningReferenceId(null); }
  }

  async function approveDna(referenceId: string) {
    setRunningReferenceId(referenceId); setRunMessage("");
    try {
      const project = await factoryClient.approveCompetitorDna({ projectId: props.project.id, referenceId });
      props.setSelectedProject(project);
      continueAutomaticReferenceChain(project);
      const artifacts = await factoryClient.listCompetitorDnaArtifacts({ projectId: props.project.id, referenceId });
      setDnaArtifacts((current) => current.filter((artifact) => artifact.payloadJson.referenceId !== referenceId).concat(artifacts));
      setRunMessage("Competitor DNA approved.");
    } catch (error) { setRunMessage(`Competitor DNA approval failed: ${safeRendererError(error)}`); }
    finally { void reloadWorkflowRuns(); setRunningReferenceId(null); }
  }

  async function rejectDna(referenceId: string) {
    setRunningReferenceId(referenceId); setRunMessage("");
    try {
      const project = await factoryClient.rejectCompetitorDna({ projectId: props.project.id, referenceId });
      props.setSelectedProject(project);
      const artifacts = await factoryClient.listCompetitorDnaArtifacts({ projectId: props.project.id, referenceId });
      setDnaArtifacts((current) => current.filter((artifact) => artifact.payloadJson.referenceId !== referenceId).concat(artifacts));
      setRunMessage("Competitor DNA rejected.");
    } catch (error) { setRunMessage(`Competitor DNA rejection failed: ${safeRendererError(error)}`); }
    finally { void reloadWorkflowRuns(); setRunningReferenceId(null); }
  }

  function canRunStage(stage: StageEligibility): boolean {
    return stage.runnable || stage.status === "failed" || stage.status === "needs_attention";
  }

  function stageActionReason(stage: StageEligibility, fallback: string): string {
    return stage.blockingReasons[0]?.message ?? fallback;
  }

  function nextReferenceAction<T extends { status: string; payloadJson: { referenceId: string } }>(artifacts: T[]): { referenceId: string; kind: "approve" | "run" } | null {
    for (const reference of approvedReferences) {
      const current = artifacts.filter((artifact) => artifact.payloadJson.referenceId === reference.id && artifact.status !== "stale");
      if (current.some((artifact) => artifact.status === "needs_review")) return { referenceId: reference.id, kind: "approve" };
      if (!current.some((artifact) => artifact.status === "approved")) return { referenceId: reference.id, kind: "run" };
    }
    return null;
  }

  const nextSegmentationAction = nextReferenceAction(segmentationArtifacts);
  const nextDnaAction = nextReferenceAction(dnaArtifacts);
  const canRunPendingReferenceStage = (stage: StageEligibility): boolean =>
    stage.runnable || stage.status === "needs_review" || stage.status === "failed" || stage.status === "needs_attention";
  const canManuallyRunStage = (stage: StageEligibility): boolean =>
    !isSemiAutomatic || stage.status === "failed" || stage.status === "needs_attention";

  return (
    <>
      <PageHeader
        title="Competitor DNA"
        description="Competitor workflow starts with Transcript Cleaning, then Segmentation, then Competitor DNA review."
        actions={
          <>
            <button className="button secondary" type="button" onClick={() => props.setRoute("reference-intake")}>Back to references</button>
            {!isSemiAutomatic && approvedReferences.length && transcriptCleaning.runnable ? (
              <button className="button primary" type="button" onClick={() => void runCleaning(approvedReferences[0]!.id)} disabled={runningReferenceId !== null}>
                {runningReferenceId ? "Cleaning transcript..." : "Run Transcript Cleaning"}
              </button>
            ) : isSemiAutomatic && !hasSemiAutomaticAttention(props.project) ? (
              <span className="muted">Transcript Cleaning, Segmentation, and Competitor DNA run automatically.</span>
            ) : (
              <DisabledAction reason={transcriptCleaning.blockingReasons[0]?.message ?? "Transcript Cleaning is not runnable yet."}>Run Transcript Cleaning</DisabledAction>
            )}
            {!isSemiAutomatic && nextSegmentationAction?.kind === "approve" ? (
              <button className="button secondary" type="button" onClick={() => void approveSegmentation(nextSegmentationAction.referenceId)} disabled={runningReferenceId !== null || !segmentation.approvable}>Approve Segmentation</button>
            ) : !isSemiAutomatic && nextSegmentationAction?.kind === "run" && canRunPendingReferenceStage(segmentation) ? (
              <button className="button secondary" type="button" onClick={() => void runSegmentation(nextSegmentationAction.referenceId)} disabled={runningReferenceId !== null}>Run Segmentation</button>
            ) : canManuallyRunStage(segmentation) && segmentation.status !== "approved" ? (
              <DisabledAction reason={stageActionReason(segmentation, "Approve all cleaned transcripts before running Segmentation.")}>Run Segmentation</DisabledAction>
            ) : null}
            {!isSemiAutomatic && nextDnaAction?.kind === "approve" ? (
              <button className="button secondary" type="button" onClick={() => void approveDna(nextDnaAction.referenceId)} disabled={runningReferenceId !== null || !competitorDna.approvable}>Approve DNA</button>
            ) : !isSemiAutomatic && nextDnaAction?.kind === "run" && canRunPendingReferenceStage(competitorDna) ? (
              <button className="button secondary" type="button" onClick={() => void runDna(nextDnaAction.referenceId)} disabled={runningReferenceId !== null}>Run DNA</button>
            ) : canManuallyRunStage(competitorDna) && competitorDna.status !== "approved" ? (
              <DisabledAction reason={stageActionReason(competitorDna, "Approve all segmentations before running Competitor DNA.")}>Run DNA</DisabledAction>
            ) : null}
          </>
        }
      />
      <StageStatusHeader
        stageName="Transcript Cleaning"
        stageNumber={4}
        eligibility={transcriptCleaning}
        dependencies={["Reference Validation"]}
        purpose="First runnable stage in the competitor workflow. It must use the approved reference set, not raw pasted drafts."
      />
      <ActionableBlockedState eligibility={transcriptCleaning} setRoute={props.setRoute} />
      <ActionableBlockedState eligibility={segmentation} setRoute={props.setRoute} />
      <ActionableBlockedState eligibility={competitorDna} setRoute={props.setRoute} />
      <SectionCard title="Next competitor actions" description="The next runnable action is shown here so Segmentation and Competitor DNA do not get hidden below the transcript table.">
        <div className="button-row">
          {approvedReferences.map((reference) => {
            const cleaningArtifact = cleaningArtifacts.find((artifact) => artifact.payloadJson.referenceId === reference.id && artifact.status === "needs_review");
            const segmentationArtifact = segmentationArtifacts.find((artifact) => artifact.payloadJson.referenceId === reference.id && artifact.status === "needs_review");
            const dnaArtifact = dnaArtifacts.find((artifact) => artifact.payloadJson.referenceId === reference.id && artifact.status === "needs_review");
            return <React.Fragment key={`next-${reference.id}`}>
              {!isSemiAutomatic && cleaningArtifact ? <button className="button compact" type="button" onClick={() => void approveCleaning(reference.id)} disabled={runningReferenceId !== null}>Approve Cleaning</button> : null}
              {(!isSemiAutomatic || transcriptCleaning.status === "failed" || transcriptCleaning.status === "needs_attention") && !cleaningArtifact && canRunStage(transcriptCleaning) ? <button className="button compact" type="button" onClick={() => void runCleaning(reference.id)} disabled={runningReferenceId !== null}>{transcriptCleaning.status === "failed" || transcriptCleaning.status === "needs_attention" ? "Retry Cleaning" : "Run Cleaning"}</button> : null}
              {!isSemiAutomatic && segmentationArtifact ? <button className="button compact" type="button" onClick={() => void approveSegmentation(reference.id)} disabled={runningReferenceId !== null}>Approve Segmentation</button> : null}
              {(!isSemiAutomatic || segmentation.status === "failed" || segmentation.status === "needs_attention") && !segmentationArtifact ? canRunStage(segmentation) ? <button className="button compact" type="button" onClick={() => void runSegmentation(reference.id)} disabled={runningReferenceId !== null}>{segmentation.status === "failed" || segmentation.status === "needs_attention" ? "Retry Segmentation" : "Run Segmentation"}</button> : <DisabledAction reason={stageActionReason(segmentation, "Approve all cleaned transcripts before running Segmentation.")}>Run Segmentation</DisabledAction> : null}
              {!isSemiAutomatic && dnaArtifact ? <button className="button compact" type="button" onClick={() => void approveDna(reference.id)} disabled={runningReferenceId !== null}>Approve DNA</button> : null}
              {(!isSemiAutomatic || competitorDna.status === "failed" || competitorDna.status === "needs_attention") && !dnaArtifact ? canRunStage(competitorDna) ? <button className="button compact" type="button" onClick={() => void runDna(reference.id)} disabled={runningReferenceId !== null}>{competitorDna.status === "failed" || competitorDna.status === "needs_attention" ? "Retry DNA" : "Run DNA"}</button> : <DisabledAction reason={stageActionReason(competitorDna, "Approve all segmentations before running Competitor DNA.")}>Run DNA</DisabledAction> : null}
            </React.Fragment>;
          })}
          {!approvedReferences.length ? <>
            <DisabledAction reason="Approve at least one included reference before running the competitor workflow.">Run Segmentation</DisabledAction>
            <DisabledAction reason="Approve at least one included reference before running the competitor workflow.">Run DNA</DisabledAction>
          </> : null}
        </div>
      </SectionCard>
      {!hasReferences ? (
        <EmptyState
          title="No references saved"
          detail="Add at least one competitor reference before this stage can run."
          action={<button className="button primary" type="button" onClick={() => props.setRoute("reference-intake")}>Add reference</button>}
        />
      ) : (
        <SectionCard title="Current approved input" description="Only approved included references may feed Transcript Cleaning. In Semi-automatic mode the eligible chain starts automatically; controls remain available for Guided mode and failed-run recovery.">
          <DataTable label="Competitor DNA inputs">
            <thead><tr><th>Source</th><th>Raw transcript</th><th>Added</th><th>Run</th><th>Review output</th></tr></thead>
            <tbody>
              {props.project.competitorReferences.filter((reference) => reference.included !== false).map((reference) => (
                <tr key={reference.id}>
                  <td>{reference.sourceUrl ?? "Manual paste"}</td>
                  <td>{reference.pastedTranscript.slice(0, 180)}{reference.pastedTranscript.length > 180 ? "..." : ""}</td>
                  <td>{formatDate(reference.createdAt)}</td>
                  <td>
                    <StatusBadge tone={reference.status === "approved" ? "success" : "warning"}>{(reference.status ?? "draft").replaceAll("_", " ")}</StatusBadge>
                    {reference.status === "approved" && !isSemiAutomatic && transcriptCleaning.runnable ? (
                      <button className="button compact" type="button" onClick={() => void runCleaning(reference.id)} disabled={runningReferenceId !== null}>
                        {runningReferenceId === reference.id ? "Running..." : "Clean"}
                      </button>
                    ) : null}
                  </td>
                  <td>
                    {cleaningArtifacts.filter((artifact) => artifact.payloadJson.referenceId === reference.id).map((artifact) => (
                      <div key={artifact.id}>
                        <StatusBadge tone={artifact.status === "approved" ? "success" : artifact.status === "needs_review" ? "warning" : "info"}>{artifact.status.replaceAll("_", " ")}</StatusBadge>
                        <small>{artifact.payloadJson.cleanedTranscript.slice(0, 140)}{artifact.payloadJson.cleanedTranscript.length > 140 ? "..." : ""}</small>
                        <small>Characters: {artifact.payloadJson.sourceCharacterCount} -&gt; {artifact.payloadJson.cleanedCharacterCount}; chunks: {artifact.payloadJson.execution.chunkCount}; flagged: {artifact.payloadJson.execution.flaggedSegmentCount}; removed noise: {artifact.payloadJson.execution.removedNoise}</small>
                        {artifact.payloadJson.warnings.length ? <small>Warnings: {artifact.payloadJson.warnings.join(", ").replaceAll("_", " ")}</small> : null}
                        <details><summary>Original / cleaned comparison</summary><small>Original: {reference.pastedTranscript}</small><small>Cleaned: {artifact.payloadJson.cleanedTranscript}</small></details>
                        {artifact.status === "needs_review" ? <div className="button-row">{transcriptCleaning.approvable ? <button className="button compact" type="button" onClick={() => void approveCleaning(reference.id)} disabled={runningReferenceId !== null}>Approve cleaned transcript</button> : <DisabledAction reason={transcriptCleaning.blockingReasons[0]?.message ?? "Transcript Cleaning cannot be approved yet."}>Approve cleaned transcript</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void rejectCleaning(reference.id)} disabled={runningReferenceId !== null}>Reject cleaned transcript</button></div> : null}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </SectionCard>
      )}
      <SectionCard title="Competitor workflow stages" description="Stages are persisted separately, but Semi-automatic mode runs each eligible stage in order and stops only on a checkpoint or error.">
        <DataTable label="Competitor workflow stage status">
          <thead><tr><th>Stage</th><th>Status</th><th>Runnable</th><th>Reason</th></tr></thead>
          <tbody>
            {[transcriptCleaning, segmentation, competitorDna].map((stage) => {
              const definition = workflowStageDefinitions.find((item) => item.id === stage.stageId);
              return (
                <tr key={stage.stageId}>
                  <td>{definition?.name ?? stage.stageId}</td>
                  <td><StatusBadge tone={stageTone(stage.status)}>{stage.status.replaceAll("_", " ")}</StatusBadge></td>
                  <td>{stage.runnable ? "Yes" : "No"}</td>
                  <td>{stage.blockingReasons[0]?.message ?? "No blocking reason."}</td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </SectionCard>
      <StageStatusHeader stageName="Competitor DNA" stageNumber={6} eligibility={competitorDna} dependencies={["Reference Segmentation"]} purpose="Extract evidence-backed abstractions from one approved reference at a time; it never produces reusable wording or ideas." />
      <SectionCard title="Approved segmentation evidence" description="Competitor DNA is explicit per reference and uses only approved segmentation artifacts.">
        <DataTable label="Competitor DNA inputs"><thead><tr><th>Reference</th><th>Segments</th><th>DNA review</th><th>Action</th></tr></thead><tbody>
          {approvedReferences.map((reference) => {
            const dna = dnaArtifacts.filter((artifact) => artifact.payloadJson.referenceId === reference.id);
            const hasDna = dna.some((artifact) => artifact.status !== "stale");
            const canRun = competitorDna.runnable || (competitorDna.status === "needs_review" && !hasDna);
            return <tr key={reference.id}><td>{reference.sourceUrl ?? "Manual paste"}</td><td>{segmentationArtifacts.some((artifact) => artifact.status === "approved" && artifact.payloadJson.referenceId === reference.id) ? "Approved" : "Missing"}</td><td>{dna.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge><small>{artifact.payloadJson.hookPattern.abstraction}</small>{artifact.status === "needs_review" ? <div className="button-row">{competitorDna.approvable ? <button className="button compact" type="button" onClick={() => void approveDna(reference.id)} disabled={runningReferenceId !== null}>Approve DNA</button> : <DisabledAction reason={competitorDna.blockingReasons[0]?.message ?? "Competitor DNA cannot be approved yet."}>Approve DNA</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void rejectDna(reference.id)} disabled={runningReferenceId !== null}>Reject DNA</button></div> : null}</div>)}</td><td>{canRun ? <button className="button compact" type="button" onClick={() => void runDna(reference.id)} disabled={runningReferenceId !== null}>{runningReferenceId === reference.id ? "Running..." : "Analyze"}</button> : <DisabledAction reason={competitorDna.blockingReasons[0]?.message ?? "Competitor DNA is not runnable for this reference."}>Analyze</DisabledAction>}</td></tr>;
          })}
        </tbody></DataTable>
      </SectionCard>
      <StageStatusHeader
        stageName="Reference Segmentation"
        stageNumber={5}
        eligibility={segmentation}
        dependencies={["Transcript Cleaning"]}
        purpose="Split each approved cleaned transcript into exact, non-overlapping narrative segments before any competitor analysis."
      />
      <SectionCard title="Approved cleaned transcripts" description="Each explicit run consumes only an approved cleaning artifact and preserves its structured segment output for review.">
        <DataTable label="Reference Segmentation inputs">
          <thead><tr><th>Reference</th><th>Approved cleaned input</th><th>Segments</th><th>Action</th></tr></thead>
          <tbody>
            {approvedReferences.map((reference) => {
              const hasSegment = segmentationArtifacts.some((artifact) => artifact.payloadJson.referenceId === reference.id && artifact.status !== "stale");
              const canRun = segmentation.runnable || (segmentation.status === "needs_review" && !hasSegment);
              return <tr key={reference.id}>
                <td>{reference.sourceUrl ?? "Manual paste"}</td>
                <td>{cleaningArtifacts.some((artifact) => artifact.status === "approved" && artifact.payloadJson.referenceId === reference.id) ? "Approved" : "Missing"}</td>
                <td>{segmentationArtifacts.filter((artifact) => artifact.payloadJson.referenceId === reference.id).map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge><small>{artifact.payloadJson.segments.length} exact segments</small>{artifact.status === "needs_review" ? <div className="button-row">{segmentation.approvable ? <button className="button compact" type="button" onClick={() => void approveSegmentation(reference.id)} disabled={runningReferenceId !== null}>Approve segments</button> : <DisabledAction reason={segmentation.blockingReasons[0]?.message ?? "Reference Segmentation cannot be approved yet."}>Approve segments</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void rejectSegmentation(reference.id)} disabled={runningReferenceId !== null}>Reject segments</button></div> : null}</div>)}</td>
                <td>{canRun ? <button className="button compact" type="button" onClick={() => void runSegmentation(reference.id)} disabled={runningReferenceId !== null}>{runningReferenceId === reference.id ? "Running..." : "Segment"}</button> : <DisabledAction reason={segmentation.blockingReasons[0]?.message ?? "Segmentation is not runnable for this reference."}>Segment</DisabledAction>}</td>
              </tr>;
            })}
          </tbody>
        </DataTable>
      </SectionCard>
      {runMessage ? <p className={runMessage.includes("failed") ? "error-message" : "safe-message"}>{runMessage}</p> : null}
      <SectionCard title="Run history" description="Every Stage 4-6 execution is persisted with its run ID, input fingerprint, provider/model, progress and safe failure state.">
        {workflowRuns.length ? <DataTable label="Competitor workflow run history"><thead><tr><th>Stage</th><th>Status</th><th>Run ID</th><th>Provider / model</th><th>Started</th><th>Chunks</th><th>Input fingerprint</th><th>Safe error</th></tr></thead><tbody>
          {workflowRuns.map((run) => <tr key={run.id}>
            <td>{workflowStageLabel(run.stageId)}</td>
            <td><StatusBadge tone={stageTone(run.status)}>{run.status.replaceAll("_", " ")}</StatusBadge></td>
            <td><code>{run.id}</code></td>
            <td>{run.providerId ?? "local"}{run.configuredModelId ? ` / ${run.configuredModelId}` : ""}</td>
            <td>{run.startedAt ? formatDate(run.startedAt) : "-"}{run.finishedAt ? ` -> ${formatDate(run.finishedAt)}` : ""}</td>
            <td>{chunkProgressLabel(run)}</td>
            <td><code>{run.inputFingerprint.slice(0, 16)}</code></td>
            <td>{run.safeErrorCategory ? `${run.safeErrorCategory}: ${run.safeErrorMessage ?? ""}` : "-"}</td>
          </tr>)}
        </tbody></DataTable> : <EmptyState title="No runs yet" detail="Run an approved reference to create a persisted StageRun history entry." />}
      </SectionCard>
    </>
  );
}

function IdeaLabScreen(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; setRoute: (route: RouteId) => void; textCertification: TextModelCertificationResponse; startSemiAutomatic: (chain: SemiAutomaticChain, project: FactoryProject) => Promise<void> }) {
  const [artifacts, setArtifacts] = useState<OpportunityMapArtifact[]>([]);
  const [originalityArtifacts, setOriginalityArtifacts] = useState<OriginalityReviewArtifact[]>([]);
  const [message, setMessage] = useState("");
  const opportunity = resolveStageEligibilities(props.project, { textVerified: props.textCertification.status === "verified" }).find((stage) => stage.stageId === "opportunity-map")!;
  const ideaLab = resolveStageEligibilities(props.project, { textVerified: props.textCertification.status === "verified" }).find((stage) => stage.stageId === "idea-lab")!;
  const originalityReview = resolveStageEligibilities(props.project, { textVerified: props.textCertification.status === "verified" }).find((stage) => stage.stageId === "originality-review")!;
  const topicMode = props.project.setup.inputMode === "topic" && props.project.competitorReferences.length === 0;
  const [editingIdea, setEditingIdea] = useState<FactoryProject["ideas"][number] | null>(null);
  useEffect(() => { void factoryClient.listOpportunityMapArtifacts({ projectId: props.project.id }).then(setArtifacts).catch(() => setArtifacts([])); }, [props.project]);
  useEffect(() => { void factoryClient.listOriginalityReviewArtifacts({ projectId: props.project.id }).then(setOriginalityArtifacts).catch(() => setOriginalityArtifacts([])); }, [props.project]);
  async function runOpportunity() { try { const project = await factoryClient.runOpportunityMap({ projectId: props.project.id }); props.setSelectedProject(project); setArtifacts(await factoryClient.listOpportunityMapArtifacts({ projectId: props.project.id })); setMessage("Opportunity Map is ready for review."); } catch (error) { setMessage(`Opportunity Map failed: ${safeRendererError(error)}`); } }
  async function approveOpportunity() { try { const project = await factoryClient.approveOpportunityMap({ projectId: props.project.id }); props.setSelectedProject(project); setArtifacts(await factoryClient.listOpportunityMapArtifacts({ projectId: props.project.id })); setMessage("Opportunity Map approved."); } catch (error) { setMessage(`Opportunity approval failed: ${safeRendererError(error)}`); } }
  async function rejectOpportunity() { try { const project = await factoryClient.rejectOpportunityMap({ projectId: props.project.id }); props.setSelectedProject(project); setArtifacts(await factoryClient.listOpportunityMapArtifacts({ projectId: props.project.id })); setMessage("Opportunity Map rejected."); } catch (error) { setMessage(`Opportunity rejection failed: ${safeRendererError(error)}`); } }
  async function runIdeas(force = false) { try { const project = await factoryClient.runIdeaLab({ projectId: props.project.id, ...(force ? { force: true } : {}) }); props.setSelectedProject(project); setMessage(force ? "Ideas regenerated. Choose one candidate to continue." : "Idea Lab is ready for review."); } catch (error) { setMessage(`Idea Lab failed: ${safeRendererError(error)}`); } }
  async function approveIdea(ideaId: string) { try { const project = await factoryClient.approveIdea({ projectId: props.project.id, ideaId }); props.setSelectedProject(project); props.setRoute("project-overview"); setMessage("Idea chosen as the creative direction."); if (project.setup.workflowMode === "semi_automatic") void props.startSemiAutomatic("idea", project); } catch (error) { setMessage(`Idea approval failed: ${safeRendererError(error)}`); } }
  async function saveEditedIdea() { if (!editingIdea) return; try { const project = await factoryClient.editIdea({ projectId: props.project.id, ideaId: editingIdea.id, changes: { workingTitle: editingIdea.workingTitle, angle: editingIdea.angle, corePromise: editingIdea.corePromise, viewerProblem: editingIdea.viewerProblem, dramaticQuestion: editingIdea.dramaticQuestion, targetEmotion: editingIdea.targetEmotion, thumbnailConcept: editingIdea.thumbnailConcept, noveltyExplanation: editingIdea.noveltyExplanation, productionDifficulty: editingIdea.productionDifficulty } }); props.setSelectedProject(project); setEditingIdea(null); setMessage("Idea edited. Review and choose it when ready."); } catch (error) { setMessage(`Idea edit failed: ${safeRendererError(error)}`); } }
  async function rejectIdeaLab() { try { const project = await factoryClient.rejectIdeaLab({ projectId: props.project.id }); props.setSelectedProject(project); setMessage("Idea Lab rejected."); } catch (error) { setMessage(`Idea Lab rejection failed: ${safeRendererError(error)}`); } }
  async function runOriginalityReview() { try { const project = await factoryClient.runOriginalityReview({ projectId: props.project.id }); props.setSelectedProject(project); setOriginalityArtifacts(await factoryClient.listOriginalityReviewArtifacts({ projectId: props.project.id })); setMessage("Originality Review is ready for review."); } catch (error) { setMessage(`Originality Review failed: ${safeRendererError(error)}`); } }
  async function approveOriginalityReview() { try { const project = await factoryClient.approveOriginalityReview({ projectId: props.project.id }); props.setSelectedProject(project); setOriginalityArtifacts(await factoryClient.listOriginalityReviewArtifacts({ projectId: props.project.id })); setMessage("Originality Review approved. Outline is now eligible."); } catch (error) { setMessage(`Originality approval failed: ${safeRendererError(error)}`); } }
  async function rejectOriginalityReview() { try { const project = await factoryClient.rejectOriginalityReview({ projectId: props.project.id }); props.setSelectedProject(project); setOriginalityArtifacts(await factoryClient.listOriginalityReviewArtifacts({ projectId: props.project.id })); setMessage("Originality Review rejected."); } catch (error) { setMessage(`Originality rejection failed: ${safeRendererError(error)}`); } }
  return (
    <>
      <PageHeader title="Idea Lab" description={topicMode ? "Topic mode generates original candidates directly, then pauses for one creative choice." : "Reference analysis is prepared internally; review the resulting ideas rather than approving every internal stage."} actions={props.project.ideas.length > 0 && ideaLab.status === "needs_review" ? <button className="button primary" type="button" onClick={() => void runIdeas(true)}>Regenerate Ideas</button> : topicMode || ideaLab.runnable ? <button className="button primary" type="button" onClick={() => void runIdeas()}>Generate Ideas</button> : opportunity.runnable ? <button className="button primary" type="button" onClick={() => void runOpportunity()}>Run Opportunity Map</button> : <DisabledAction reason={ideaLab.blockingReasons[0]?.message ?? opportunity.blockingReasons[0]?.message ?? "Idea generation is not ready."}>Generate Ideas</DisabledAction>} />
      {!topicMode ? <StageStatusHeader stageName="Opportunity Map" stageNumber={7} eligibility={opportunity} dependencies={["Competitor DNA"]} purpose="Internal evidence synthesis; users see its result through idea candidates." /> : null}
      {!topicMode ? <SectionCard title="Opportunity Map review" description="The map is persisted for diagnostics but is not a normal user checkpoint.">
        {artifacts.length ? artifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge><p>{artifact.payloadJson.recommendedContentSpaces.map((item) => `${item.text} (${item.confidence})`).join("; ") || "No recommended content spaces."}</p>{artifact.status === "needs_review" ? <div className="button-row"><button className="button compact" type="button" disabled={!opportunity.approvable} onClick={() => void approveOpportunity()}>Approve Opportunity Map</button><button className="button danger compact" type="button" onClick={() => void rejectOpportunity()}>Reject Opportunity Map</button></div> : null}</div>) : <EmptyState title="No Opportunity Map yet" detail="Approve Competitor DNA for every included reference, then run this stage explicitly." />}
        {message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}
      </SectionCard> : null}
      <StageStatusHeader stageName="Idea Lab" stageNumber={8} eligibility={ideaLab} dependencies={topicMode ? [] : ["Opportunity Map"]} purpose="Generate exactly six original candidates, then pause for the user to choose one." />
      <SectionCard title="Idea candidates" description="Provider-generated candidates require an explicit choice; no candidate is selected automatically.">
        {ideaLab.status === "needs_review" ? <div className="button-row"><button className="button danger compact" type="button" onClick={() => void rejectIdeaLab()}>Reject Idea Lab</button></div> : null}
        {ideaLab.status === "needs_review" || ideaLab.status === "approved" ? (
          <div className="card-grid">
            {props.project.ideas.map((idea) => <SectionCard key={idea.id} title={idea.workingTitle} description={idea.angle} className="compact-card">
              <p><strong>Core promise:</strong> {idea.corePromise}</p>
              <p><strong>Viewer question:</strong> {idea.dramaticQuestion}</p>
              <p><strong>Target emotion:</strong> {idea.targetEmotion}</p>
              <p><strong>Thumbnail concept:</strong> {idea.thumbnailConcept}</p>
              <p><strong>Estimated difficulty:</strong> {idea.productionDifficulty} / <strong>Research risk:</strong> {idea.researchRisk}</p>
              <p><strong>Originality summary:</strong> {idea.noveltyExplanation}</p>
              <div className="button-row"><StatusBadge tone={props.project.approvedIdeaId === idea.id ? "success" : ideaLab.status === "needs_review" ? "warning" : "info"}>{props.project.approvedIdeaId === idea.id ? "Chosen idea" : ideaLab.status === "needs_review" ? "Review required" : "Candidate"}</StatusBadge>{ideaLab.status === "needs_review" ? <><button className="button primary compact" type="button" disabled={!ideaLab.approvable} onClick={() => void approveIdea(idea.id)}>Choose Idea</button><button className="button secondary compact" type="button" onClick={() => setEditingIdea(idea)}>Edit</button></> : null}</div>
              {editingIdea?.id === idea.id ? <div className="form-grid"><FormField label="Working title" htmlFor={`idea-title-${idea.id}`}><input id={`idea-title-${idea.id}`} value={editingIdea.workingTitle} onChange={(event) => setEditingIdea({ ...editingIdea, workingTitle: event.target.value })} /></FormField><FormField label="Angle" htmlFor={`idea-angle-${idea.id}`}><textarea id={`idea-angle-${idea.id}`} value={editingIdea.angle} onChange={(event) => setEditingIdea({ ...editingIdea, angle: event.target.value })} /></FormField><FormField label="Core promise" htmlFor={`idea-promise-${idea.id}`}><textarea id={`idea-promise-${idea.id}`} value={editingIdea.corePromise} onChange={(event) => setEditingIdea({ ...editingIdea, corePromise: event.target.value })} /></FormField><FormField label="Viewer problem" htmlFor={`idea-problem-${idea.id}`}><textarea id={`idea-problem-${idea.id}`} value={editingIdea.viewerProblem} onChange={(event) => setEditingIdea({ ...editingIdea, viewerProblem: event.target.value })} /></FormField><FormField label="Viewer question" htmlFor={`idea-question-${idea.id}`}><textarea id={`idea-question-${idea.id}`} value={editingIdea.dramaticQuestion} onChange={(event) => setEditingIdea({ ...editingIdea, dramaticQuestion: event.target.value })} /></FormField><FormField label="Target emotion" htmlFor={`idea-emotion-${idea.id}`}><input id={`idea-emotion-${idea.id}`} value={editingIdea.targetEmotion} onChange={(event) => setEditingIdea({ ...editingIdea, targetEmotion: event.target.value })} /></FormField><FormField label="Thumbnail concept" htmlFor={`idea-thumbnail-${idea.id}`}><textarea id={`idea-thumbnail-${idea.id}`} value={editingIdea.thumbnailConcept} onChange={(event) => setEditingIdea({ ...editingIdea, thumbnailConcept: event.target.value })} /></FormField><FormField label="Originality summary" htmlFor={`idea-originality-${idea.id}`}><textarea id={`idea-originality-${idea.id}`} value={editingIdea.noveltyExplanation} onChange={(event) => setEditingIdea({ ...editingIdea, noveltyExplanation: event.target.value })} /></FormField><FormField label="Estimated difficulty" htmlFor={`idea-difficulty-${idea.id}`}><select id={`idea-difficulty-${idea.id}`} value={editingIdea.productionDifficulty} onChange={(event) => setEditingIdea({ ...editingIdea, productionDifficulty: event.target.value as typeof editingIdea.productionDifficulty })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></FormField><div className="button-row"><button className="button primary compact" type="button" onClick={() => void saveEditedIdea()}>Save Edit</button><button className="button secondary compact" type="button" onClick={() => setEditingIdea(null)}>Cancel</button></div></div> : null}
            </SectionCard>)}
          </div>
        ) : (
          <EmptyState
            title="Idea Lab is blocked"
            detail={topicMode ? "Generate ideas to choose the creative direction." : ideaLab.blockingReasons[0]?.message ?? "Reference analysis is still preparing."}
            action={topicMode || opportunity.runnable ? <button className="button primary" type="button" onClick={() => void (topicMode ? runIdeas() : runOpportunity())}>{topicMode ? "Generate ideas" : "Run Opportunity Map"}</button> : undefined}
          />
        )}
      </SectionCard>
      <StageStatusHeader stageName="Originality Review" stageNumber={9} eligibility={originalityReview} dependencies={["Approved Idea Lab candidate", "Approved Competitor DNA"]} purpose="Check phrase, structural, thumbnail, and concept overlap against stored competitor evidence before Outline begins." />
      <SectionCard title="Originality Review" description="This local deterministic review compares the selected idea to approved competitor patterns; it never claims external web-search coverage.">
        {originalityArtifacts.length ? originalityArtifacts.map((artifact) => (
          <div key={artifact.id}>
            <StatusBadge tone={artifact.payloadJson.status === "pass" ? "success" : "danger"}>{artifact.payloadJson.status.replaceAll("_", " ")}</StatusBadge>
            <p>Phrase {artifact.payloadJson.phraseOverlapRisk}% | Structure {artifact.payloadJson.structuralOverlapRisk}% | Thumbnail {artifact.payloadJson.thumbnailOverlapRisk}% | Concept {artifact.payloadJson.conceptOverlapRisk}%</p>
            {artifact.payloadJson.flaggedMatches.length ? <TagList items={artifact.payloadJson.flaggedMatches} /> : <p>No material overlap was detected in the approved competitor evidence.</p>}
            {artifact.payloadJson.requiredChanges.length ? <TagList items={artifact.payloadJson.requiredChanges} /> : null}
            {artifact.status === "needs_review" ? <div className="button-row">{artifact.payloadJson.status === "pass" ? <button className="button compact" type="button" disabled={!originalityReview.approvable} onClick={() => void approveOriginalityReview()}>Approve Originality Review</button> : null}<button className="button danger compact" type="button" onClick={() => void rejectOriginalityReview()}>Reject Originality Review</button></div> : null}
          </div>
        )) : <EmptyState title="No Originality Review yet" detail="Approve an Idea Lab candidate, then run this stage explicitly." />}
        <div className="button-row">
          {originalityReview.runnable ? <button className="button primary" type="button" onClick={() => void runOriginalityReview()}>Run Originality Review</button> : <DisabledAction reason={originalityReview.blockingReasons[0]?.message ?? "Originality Review is not ready to run."}>Run Originality Review</DisabledAction>}
        </div>
      </SectionCard>
    </>
  );
}

function ScriptScreen(props: { project: FactoryProject; selectedProfile: ChannelProfile | undefined; setSelectedProject: (project: FactoryProject | null) => void; textCertification: TextModelCertificationResponse }) {
  const [outlines, setOutlines] = useState<OutlineArtifact[]>([]);
  const [scripts, setScripts] = useState<ScriptArtifact[]>([]);
  const [factReviews, setFactReviews] = useState<FactReviewArtifact[]>([]);
  const [retentionReviews, setRetentionReviews] = useState<RetentionReviewArtifact[]>([]);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [draftNarration, setDraftNarration] = useState("");
  const eligibilities = resolveStageEligibilities(props.project, { textVerified: props.textCertification.status === "verified" });
  const outline = eligibilities.find((stage) => stage.stageId === "outline")!;
  const script = eligibilities.find((stage) => stage.stageId === "script")!;
  const factReview = eligibilities.find((stage) => stage.stageId === "fact-review")!;
  const retentionReview = eligibilities.find((stage) => stage.stageId === "retention-review")!;
  async function refreshArtifacts() {
    const [nextOutlines, nextScripts, nextFactReviews, nextRetentionReviews] = await Promise.all([
      factoryClient.listOutlineArtifacts({ projectId: props.project.id }),
      factoryClient.listScriptArtifacts({ projectId: props.project.id }),
      factoryClient.listFactReviewArtifacts({ projectId: props.project.id }),
      factoryClient.listRetentionReviewArtifacts({ projectId: props.project.id })
    ]);
    setOutlines(nextOutlines); setScripts(nextScripts); setFactReviews(nextFactReviews); setRetentionReviews(nextRetentionReviews);
  }
  useEffect(() => { void refreshArtifacts().catch(() => { setOutlines([]); setScripts([]); setFactReviews([]); setRetentionReviews([]); }); }, [props.project.id]);
  async function perform(action: () => Promise<FactoryProject>, success: string, failed: string) { setRunning(true); setMessage(""); try { props.setSelectedProject(await action()); await refreshArtifacts(); setMessage(success); } catch (error) { setMessage(`${failed}: ${safeRendererError(error)}`); } finally { setRunning(false); } }
  function runOutline() { return perform(() => factoryClient.runOutline({ projectId: props.project.id }), "Outline is ready for review.", "Outline failed"); }
  function approveOutline() { return perform(() => factoryClient.approveOutline({ projectId: props.project.id }), "Outline approved. Script is now eligible.", "Outline approval failed"); }
  function rejectOutline() { return perform(() => factoryClient.rejectOutline({ projectId: props.project.id }), "Outline rejected.", "Outline rejection failed"); }
  function runScript() { return perform(() => factoryClient.runScript({ projectId: props.project.id }), "Script is ready for review.", "Script failed"); }
  function regenerateScript() { return perform(() => factoryClient.regenerateScript({ projectId: props.project.id }), "Script regenerated and is ready for review.", "Script regeneration failed"); }
  function approveScript() { return perform(() => factoryClient.approveScript({ projectId: props.project.id }), "Script approved. Fact Review is now eligible.", "Script approval failed"); }
  function rejectScript() { return perform(() => factoryClient.rejectScript({ projectId: props.project.id }), "Script rejected.", "Script rejection failed"); }
  async function saveScriptEdit(sectionId: string): Promise<void> {
    const artifact = [...scripts].reverse().find((item) => item.status === "needs_review" || item.status === "approved");
    if (!artifact) { setMessage("Script editing requires a persisted Script artifact."); return; }
    setRunning(true);
    try {
      const project = await factoryClient.editScript({ projectId: props.project.id, artifactId: artifact.id, sectionId, narration: draftNarration });
      props.setSelectedProject(project);
      await refreshArtifacts();
      setEditingSectionId(null);
      setDraftNarration("");
      setMessage("Script edit saved. Review and approve the revised script before continuing.");
    } catch (error) {
      setMessage(`Script edit failed: ${safeRendererError(error)}`);
    } finally {
      setRunning(false);
    }
  }
  function runFactReview() { return perform(() => factoryClient.runFactReview({ projectId: props.project.id }), "Fact Review is ready for review.", "Fact Review failed"); }
  function approveFactReview() { return perform(() => factoryClient.approveFactReview({ projectId: props.project.id }), "Fact Review approved.", "Fact Review approval failed"); }
  function rejectFactReview() { return perform(() => factoryClient.rejectFactReview({ projectId: props.project.id }), "Fact Review rejected.", "Fact Review rejection failed"); }
  function runRetentionReview() { return perform(() => factoryClient.runRetentionReview({ projectId: props.project.id }), "Retention Review is ready for review.", "Retention Review failed"); }
  function approveRetentionReview() { return perform(() => factoryClient.approveRetentionReview({ projectId: props.project.id }), "Retention Review approved.", "Retention Review approval failed"); }
  function rejectRetentionReview() { return perform(() => factoryClient.rejectRetentionReview({ projectId: props.project.id }), "Retention Review rejected.", "Retention Review rejection failed"); }
  return (
    <>
      <PageHeader title="Script" description="Outline, Script, and Fact Review remain separate review checkpoints." actions={outline.runnable ? <button className="button primary" type="button" onClick={() => void runOutline()} disabled={running}>Run Outline</button> : <DisabledAction reason={outline.blockingReasons[0]?.message ?? "Outline is not runnable."}>Run Outline</DisabledAction>} />
      <StageStatusHeader stageName="Outline" stageNumber={10} eligibility={outline} dependencies={["Approved idea", "Approved Originality Review"]} purpose="Plan sections from the approved idea without external research or claim mapping." />
      <SectionCard title="Outline review">{outlines.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge>{artifact.payloadJson.sections.map((section) => <p key={section.id}>{section.purpose}: {section.keyPoint}</p>)}{artifact.status === "needs_review" ? <div className="button-row">{outline.approvable ? <button className="button compact" type="button" onClick={() => void approveOutline()} disabled={running}>Approve Outline</button> : <DisabledAction reason={outline.blockingReasons[0]?.message ?? "Outline cannot be approved yet."}>Approve Outline</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void rejectOutline()} disabled={running}>Reject Outline</button></div> : null}</div>)}</SectionCard>
      <StageStatusHeader stageName="Script" stageNumber={11} eligibility={script} dependencies={["Approved Outline"]} purpose="Draft narration only from the approved outline." />
      <SectionCard title="Script review" description="Each run is explicit and uses the certified text model; approval persists the reviewed sections.">
        {script.runnable ? <button className="button primary" type="button" onClick={() => void runScript()} disabled={running}>Run Script</button> : <DisabledAction reason={script.blockingReasons[0]?.message ?? "Script is not runnable."}>Run Script</DisabledAction>}
        {props.project.setup.inputMode !== "existing_script" && props.project.scriptSections.length ? <button className="button secondary" type="button" onClick={() => void regenerateScript()} disabled={running}>Regenerate Script</button> : null}
        {scripts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge>{artifact.payloadJson.sections.map((section) => <p key={section.id}><strong>{section.purpose}</strong>: {section.narration}</p>)}{artifact.status === "needs_review" ? <div className="button-row">{script.approvable ? <button className="button compact" type="button" onClick={() => void approveScript()} disabled={running}>Approve Script</button> : <DisabledAction reason={script.blockingReasons[0]?.message ?? "Script cannot be approved yet."}>Approve Script</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void rejectScript()} disabled={running}>Reject Script</button></div> : null}</div>)}
      </SectionCard>
      <StageStatusHeader stageName="Fact Review" stageNumber={12} eligibility={factReview} dependencies={["Approved Script"]} purpose="Review script findings locally; this stage does not perform web research." />
      <SectionCard title="Fact Review" description="Blocked findings prevent approval. Qualification findings must remain qualified in narration.">
        {factReview.runnable ? <button className="button primary" type="button" onClick={() => void runFactReview()} disabled={running}>Run Fact Review</button> : <DisabledAction reason={factReview.blockingReasons[0]?.message ?? "Fact Review is not runnable."}>Run Fact Review</DisabledAction>}
        {factReviews.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge><small>Reviewer: local deterministic</small>{artifact.payloadJson.findings.map((finding) => <p key={finding.claimId}><strong>{finding.claimId}</strong>: {finding.verdict.replaceAll("_", " ")} - {finding.reason}</p>)}{artifact.status === "needs_review" ? <div className="button-row">{factReview.approvable ? <button className="button compact" type="button" onClick={() => void approveFactReview()} disabled={running}>Approve Fact Review</button> : <DisabledAction reason={factReview.blockingReasons[0]?.message ?? "Fact Review cannot be approved yet."}>Approve Fact Review</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void rejectFactReview()} disabled={running}>Reject Fact Review</button></div> : null}</div>)}
        {message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}
      </SectionCard>
      <StageStatusHeader stageName="Retention Review" stageNumber={13} eligibility={retentionReview} dependencies={["Approved Fact Review", "Approved Script"]} purpose="Review pacing and retention risks without rewriting or adding facts." />
      <SectionCard title="Retention Review" description="The certified text model returns section-bound editorial findings for human review.">
        {retentionReview.runnable ? <button className="button primary" type="button" onClick={() => void runRetentionReview()} disabled={running}>Run Retention Review</button> : <DisabledAction reason={retentionReview.blockingReasons[0]?.message ?? "Retention Review is not runnable."}>Run Retention Review</DisabledAction>}
        {retentionReviews.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge><p>Verdict: {artifact.payloadJson.overallVerdict.replaceAll("_", " ")}</p>{artifact.payloadJson.findings.map((finding) => <p key={finding.sectionId}><strong>{finding.sectionId}</strong> ({finding.severity}): {finding.reason} Suggested: {finding.recommendedChange}</p>)}{artifact.status === "needs_review" ? <div className="button-row">{retentionReview.approvable ? <button className="button compact" type="button" onClick={() => void approveRetentionReview()} disabled={running}>Approve Retention Review</button> : <DisabledAction reason={retentionReview.blockingReasons[0]?.message ?? "Retention Review cannot be approved yet."}>Approve Retention Review</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void rejectRetentionReview()} disabled={running}>Reject Retention Review</button></div> : null}</div>)}
      </SectionCard>
      <div className="split-grid script-layout">
        <SectionCard title="Sections">
          {props.project.scriptSections.map((section) => (
            <button className="script-section-button" key={section.id} type="button">
              <strong>{section.purpose}</strong>
              <span>{section.estimatedSeconds}s / {section.estimatedWords} words</span>
            </button>
          ))}
        </SectionCard>
        <SectionCard title="Narration editor">
          {props.project.scriptSections.map((section) => (
            <article className="script-block" key={section.id}>
              <h3>{section.purpose}</h3>
              <textarea value={editingSectionId === section.id ? draftNarration : section.narration} readOnly={editingSectionId !== section.id} onChange={(event) => setDraftNarration(event.target.value)} aria-label={`Narration ${section.id}`} />
              {editingSectionId === section.id ? <div className="button-row"><button className="button primary compact" type="button" disabled={running || !draftNarration.trim()} onClick={() => void saveScriptEdit(section.id)}>Save Script Edit</button><button className="button secondary compact" type="button" disabled={running} onClick={() => { setEditingSectionId(null); setDraftNarration(""); }}>Cancel</button></div> : <button className="button secondary compact" type="button" disabled={running} onClick={() => { setEditingSectionId(section.id); setDraftNarration(section.narration); }}>Edit Script</button>}
              <TagList items={section.visualOpportunities} limit={5} />
            </article>
          ))}
        </SectionCard>
        <SectionCard title="Inspector">
          <p><strong>Channel rules:</strong> {props.selectedProfile?.tone ?? "No profile loaded"}</p>
          <p><strong>Avoid list:</strong></p>
          <TagList items={props.selectedProfile?.avoidList ?? []} limit={8} />
        </SectionCard>
      </div>
    </>
  );
}

function ScenesScreen(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; textCertification: TextModelCertificationResponse }) {
  const [artifacts, setArtifacts] = useState<ScenePlanArtifact[]>([]); const [running, setRunning] = useState(false); const [message, setMessage] = useState("");
  const eligibility = resolveStageEligibilities(props.project, { textVerified: props.textCertification.status === "verified" }).find((stage) => stage.stageId === "scene-plan")!;
  const refresh = () => factoryClient.listScenePlanArtifacts({ projectId: props.project.id }).then(setArtifacts);
  useEffect(() => { void refresh().catch(() => setArtifacts([])); }, [props.project.id]);
  async function perform(action: () => Promise<FactoryProject>, success: string) { setRunning(true); try { props.setSelectedProject(await action()); await refresh(); setMessage(success); } catch (error) { setMessage(safeRendererError(error)); } finally { setRunning(false); } }
  return (
    <>
      <PageHeader title="Scenes" description="Review frame-timed scenes generated only from the approved Script and Retention Review." actions={eligibility.runnable ? <button className="button primary" type="button" onClick={() => void perform(() => factoryClient.runScenePlan({ projectId: props.project.id }), "Scene Plan is ready for review.")} disabled={running}>Run Scene Plan</button> : <DisabledAction reason={eligibility.blockingReasons[0]?.message ?? "Scene Plan is not runnable."}>Run Scene Plan</DisabledAction>} />
      <StageStatusHeader stageName="Scene Plan" stageNumber={15} eligibility={eligibility} dependencies={["Approved Retention Review"]} purpose="Create frame-timed scenes without creating assets or shots." />
      <SectionCard title="Scene Plan review">{artifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge>{artifact.payloadJson.scenes.map((scene) => <p key={scene.id}>{scene.purpose}: {scene.startFrame} + {scene.durationFrames} frames</p>)}{artifact.status === "needs_review" ? <div className="button-row">{eligibility.approvable ? <button className="button compact" type="button" onClick={() => void perform(() => factoryClient.approveScenePlan({ projectId: props.project.id }), "Scene Plan approved.")} disabled={running}>Approve Scene Plan</button> : <DisabledAction reason={eligibility.blockingReasons[0]?.message ?? "Scene Plan cannot be approved yet."}>Approve Scene Plan</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void perform(() => factoryClient.rejectScenePlan({ projectId: props.project.id }), "Scene Plan rejected.")} disabled={running}>Reject Scene Plan</button></div> : null}</div>)}{message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}</SectionCard>
      <div className="card-grid">
        {props.project.scenes.map((scene) => (
          <SectionCard key={scene.id} className="compact-card">
            <div className="scene-card">
              <strong>{scene.id}</strong>
              <span>{scene.purpose}</span>
              <small>{formatTimecode(scene.startFrame, props.project.timeline.fps)} / {formatTimecode(scene.durationFrames, props.project.timeline.fps)}</small>
              <StatusBadge tone="demo">{scene.visualMode}</StatusBadge>
            </div>
          </SectionCard>
        ))}
      </div>
    </>
  );
}

function ShotsScreen(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; textCertification: TextModelCertificationResponse }) {
  const [view, setView] = useState<"board" | "table" | "timeline">("board"); const [artifacts, setArtifacts] = useState<ShotPlanArtifact[]>([]); const [running, setRunning] = useState(false); const [message, setMessage] = useState("");
  const eligibility = resolveStageEligibilities(props.project, { textVerified: props.textCertification.status === "verified" }).find((stage) => stage.stageId === "shot-plan")!;
  const refresh = () => factoryClient.listShotPlanArtifacts({ projectId: props.project.id }).then(setArtifacts);
  useEffect(() => { void refresh().catch(() => setArtifacts([])); }, [props.project.id]);
  async function perform(action: () => Promise<FactoryProject>, success: string) { setRunning(true); try { props.setSelectedProject(await action()); await refresh(); setMessage(success); } catch (error) { setMessage(safeRendererError(error)); } finally { setRunning(false); } }
  return (
    <>
      <PageHeader
        title="Shot Board"
        description="Review frame-accurate shots generated only from the approved Scene Plan."
        actions={
          <><div className="segmented">{(["board", "table", "timeline"] as const).map((item) => <button className={view === item ? "active" : ""} key={item} onClick={() => setView(item)} type="button">{item}</button>)}</div>{eligibility.runnable ? <button className="button primary" type="button" onClick={() => void perform(() => factoryClient.runShotPlan({ projectId: props.project.id }), "Shot Plan is ready for review.")} disabled={running}>Run Shot Plan</button> : <DisabledAction reason={eligibility.blockingReasons[0]?.message ?? "Shot Plan is not runnable."}>Run Shot Plan</DisabledAction>}</>
        }
      />
      <StageStatusHeader stageName="Shot Plan" stageNumber={16} eligibility={eligibility} dependencies={["Approved Scene Plan"]} purpose="Create frame-timed shots without creating or assigning assets." />
      <SectionCard title="Shot Plan review">{artifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge>{artifact.payloadJson.shots.map((shot) => <p key={shot.id}>{shot.purpose}: {shot.startFrame} + {shot.durationFrames} frames</p>)}{artifact.status === "needs_review" ? <div className="button-row">{eligibility.approvable ? <button className="button compact" type="button" onClick={() => void perform(() => factoryClient.approveShotPlan({ projectId: props.project.id }), "Shot Plan approved.")} disabled={running}>Approve Shot Plan</button> : <DisabledAction reason={eligibility.blockingReasons[0]?.message ?? "Shot Plan cannot be approved yet."}>Approve Shot Plan</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void perform(() => factoryClient.rejectShotPlan({ projectId: props.project.id }), "Shot Plan rejected.")} disabled={running}>Reject Shot Plan</button></div> : null}</div>)}{message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}</SectionCard>
      {view === "board" ? (
        <div className="shot-board">
          {props.project.shots.map((shot) => (
            <article className="shot-card" key={shot.id}>
              <div className="shot-thumb">No asset</div>
              <div>
                <strong>{shot.id}</strong>
                <span>{shot.sceneId}</span>
              </div>
              <small>{formatTimecode(shot.startFrame, shot.fps)} / {formatTimecode(shot.durationFrames, shot.fps)} ({shot.durationFrames} frames)</small>
              <p>{shot.purpose}</p>
              <StatusBadge tone="warning">{shot.visualMode}</StatusBadge>
            </article>
          ))}
        </div>
      ) : (
        <DataTable label="Shots">
          <thead><tr><th>Shot</th><th>Scene</th><th>Start</th><th>Duration</th><th>Framing</th><th>Camera</th><th>Asset</th></tr></thead>
          <tbody>
            {props.project.shots.map((shot) => (
              <tr key={shot.id}>
                <td>{shot.id}</td>
                <td>{shot.sceneId}</td>
                <td>{formatTimecode(shot.startFrame, shot.fps)}</td>
                <td>{formatTimecode(shot.durationFrames, shot.fps)} / {shot.durationFrames} frames</td>
                <td>{shot.framing}</td>
                <td>{shot.cameraAngle}</td>
                <td><StatusBadge tone="warning">Unassigned</StatusBadge></td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </>
  );
}

function VisualsScreen(props: { project: FactoryProject; textCertification: TextModelCertificationResponse; imageCertification: ImageModelCertificationResponse; setSelectedProject: (project: FactoryProject | null) => void; setImageCertification: (certification: ImageModelCertificationResponse) => void; startSemiAutomatic: (chain: SemiAutomaticChain, project: FactoryProject) => Promise<void> }) {
  const [artifacts, setArtifacts] = useState<VisualRoutingArtifact[]>([]);
  const [conceptArtifacts, setConceptArtifacts] = useState<AssetConceptArtifact[]>([]);
  const [promptArtifacts, setPromptArtifacts] = useState<PromptPreparationArtifact[]>([]);
  const [assetArtifacts, setAssetArtifacts] = useState<AssetAcquisitionArtifact[]>([]);
  const [assetReviewArtifacts, setAssetReviewArtifacts] = useState<AssetReviewArtifact[]>([]);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const visualModes = ["reuse", "document", "diagram", "stock_image", "stock_video", "ai_image", "ai_video", "manual_upload"] as const;
  const motionEffects = ["none", "slide_up", "slide_down", "pan_left", "pan_right", "zoom_in", "zoom_out", "pop", "dissolve"] as const;
  const characterFirst = props.project.setup.visualWorkflow === "character_first";
  const eligibility = resolveStageEligibilities(props.project).find((stage) => stage.stageId === "visual-routing")!;
  const promptEligibility = resolveStageEligibilities(props.project, { textVerified: props.textCertification.status === "verified" }).find((stage) => stage.stageId === "prompt-preparation")!;
  const conceptEligibility = resolveStageEligibilities(props.project, { textVerified: props.textCertification.status === "verified" }).find((stage) => stage.stageId === "asset-concepts")!;
  const assetEligibility = resolveStageEligibilities(props.project, { imageVerified: props.imageCertification.status === "verified" }).find((stage) => stage.stageId === "asset-acquisition")!;
  const assetReviewEligibility = resolveStageEligibilities(props.project).find((stage) => stage.stageId === "asset-review")!;
  const latestPrompt = promptArtifacts.find((artifact) => artifact.status === "needs_review" || artifact.status === "approved") ?? promptArtifacts.at(-1);
  const latestReview = assetReviewArtifacts.find((artifact) => artifact.status === "needs_review") ?? assetReviewArtifacts.find((artifact) => artifact.status === "approved") ?? assetReviewArtifacts.at(-1);
  const reviewItems = latestReview?.payloadJson.assets ?? [];
  const requiredShots = props.project.shots.filter((shot) => shot.visualMode !== "reuse");
  const itemForShot = (shotId: string) => reviewItems.find((item) => item.reviewStatus !== "rejected" && (item.assignedShotId === shotId || (!item.assignedShotId && item.asset.shotId === shotId)));
  const mappedShotIds = new Set(reviewItems.filter((item) => item.reviewStatus === "approved" && item.assignedShotId).map((item) => item.assignedShotId));
  const missingCount = requiredShots.filter((shot) => !mappedShotIds.has(shot.id)).length;
  const warningCount = reviewItems.filter((item) => item.warnings?.length).length;
  const orphanCount = reviewItems.filter((item) => !props.project.shots.some((shot) => shot.id === (item.assignedShotId ?? item.asset.shotId))).length;
  const assetConceptsReady = conceptArtifacts.some((artifact) => artifact.status === "approved");
  const refresh = async () => {
    const [routing, concepts, prompts, assets, reviews] = await Promise.all([
      factoryClient.listVisualRoutingArtifacts({ projectId: props.project.id }),
      factoryClient.listAssetConceptsArtifacts({ projectId: props.project.id }),
      factoryClient.listPromptPreparationArtifacts({ projectId: props.project.id }),
      factoryClient.listAssetAcquisitionArtifacts({ projectId: props.project.id }),
      factoryClient.listAssetReviewArtifacts({ projectId: props.project.id })
    ]);
    setArtifacts(routing); setConceptArtifacts(concepts); setPromptArtifacts(prompts); setAssetArtifacts(assets); setAssetReviewArtifacts(reviews);
  };
  useEffect(() => { void refresh().catch(() => { setArtifacts([]); setConceptArtifacts([]); setPromptArtifacts([]); setAssetArtifacts([]); setAssetReviewArtifacts([]); }); }, [props.project.id]);
  async function perform(action: () => Promise<FactoryProject>, success: string) {
    setRunning(true);
    try { props.setSelectedProject(await action()); await refresh(); setMessage(success); }
    catch (error) { setMessage(safeRendererError(error)); }
    finally { setRunning(false); }
  }

  async function copyScenePrompt(promptText: string) {
    try { await navigator.clipboard.writeText(promptText); setMessage("Đã copy prompt cho cảnh."); }
    catch { setMessage("Không thể copy tự động. Hãy chọn và copy prompt thủ công."); }
  }
  async function importDroppedFiles(event: React.DragEvent<HTMLDivElement>): Promise<void> {
    event.preventDefault();
    if (running || !latestPrompt || latestPrompt.status !== "approved") return;
    const sourcePaths = Array.from(event.dataTransfer.files)
      .map((file) => factoryClient.getDroppedFilePath(file))
      .filter(Boolean);
    if (!sourcePaths.length) {
      setMessage("Không đọc được đường dẫn file được thả. Hãy dùng nút tải ảnh.");
      return;
    }
    await perform(() => factoryClient.selectManualAssetUpload({ projectId: props.project.id, sourcePaths }), "Đã import ảnh. Tiếp tục approve từng frame.");
  }
  async function uploadShot(shotId: string): Promise<void> {
    if (running || !latestPrompt || latestPrompt.status !== "approved") {
      setMessage("Approve Scene Prompt before uploading storyboard frames.");
      return;
    }
    await perform(
      () => factoryClient.selectManualAssetUpload({
        projectId: props.project.id,
        shotId,
        ...(latestReview?.status === "needs_review" ? { artifactId: latestReview.id } : {})
      }),
      "Frame imported. Continue with review and mapping."
    );
  }
  return <>
    <PageHeader title={characterFirst ? "Director & Assets" : "Visual Sources"} description={characterFirst ? "Chốt storyboard, copy prompt theo cảnh, rồi tải ảnh bạn đã tạo từ GG Lab lên." : "Route approved shots to visual modes before preparing prompts or acquiring assets."} actions={canRetryStage(eligibility) ? <button className="button primary" type="button" onClick={() => void perform(() => factoryClient.runVisualRouting({ projectId: props.project.id }), eligibility.status === "failed" || eligibility.status === "needs_attention" ? "Visual Routing retry is ready for review." : "Visual Routing is ready for review.")} disabled={running}>{eligibility.status === "failed" || eligibility.status === "needs_attention" ? "Retry Visual Routing" : "Run Visual Routing"}</button> : <DisabledAction reason={eligibility.blockingReasons[0]?.message ?? "Visual Routing is not runnable."}>Run Visual Routing</DisabledAction>} />
    <StageStatusHeader stageName="Visual Routing" stageNumber={16} eligibility={eligibility} dependencies={["Approved Shot Plan"]} purpose="Assign one visual strategy and one motion intent to every storyboard frame. This stage never creates an image." />
    <SectionCard title="Storyboard routing" description="Mỗi shot có một mục đích rõ ràng. Motion chỉ là hướng dựng trong FFmpeg/CapCut, không thay thế frame mới khi câu chuyện cần đổi trạng thái.">
      {artifacts.map((artifact) => <div key={artifact.id} className="studio-stack"><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{displayStatus(artifact.status)}</StatusBadge>{artifact.payloadJson.shots.map((shot) => <div className="storyboard-row" key={shot.id}><div><strong>{shot.id}</strong><span>{shot.sceneId} · {shot.semanticBeat ?? shot.purpose}</span></div>{artifact.status === "needs_review" ? <div className="row-actions"><select aria-label={`Visual mode for ${shot.id}`} value={shot.visualMode} disabled={running} onChange={(event) => void perform(() => factoryClient.editVisualRouting({ projectId: props.project.id, artifactId: artifact.id, shotId: shot.id, visualMode: event.target.value as FactoryProject["shots"][number]["visualMode"], ...(shot.motion ? { motionEffect: shot.motion.effect } : {}) }), "Đã lưu hướng visual.")}>{visualModes.map((mode) => <option key={mode} value={mode}>{visualLabel(mode)}</option>)}</select><select aria-label={`Motion effect for ${shot.id}`} value={shot.motion?.effect ?? "none"} disabled={running} onChange={(event) => void perform(() => factoryClient.editVisualRouting({ projectId: props.project.id, artifactId: artifact.id, shotId: shot.id, visualMode: shot.visualMode as FactoryProject["shots"][number]["visualMode"], motionEffect: event.target.value as NonNullable<FactoryProject["shots"][number]["motion"]>["effect"] }), "Đã lưu motion override.")}>{motionEffects.map((effect) => <option key={effect} value={effect}>{motionLabel(effect)}</option>)}</select></div> : <span className="storyboard-meta">{visualLabel(shot.visualMode)} · {motionLabel(shot.motion?.effect ?? "none")}</span>}</div>)}{artifact.status === "needs_review" ? <div className="button-row"><button className="button compact" type="button" onClick={() => void perform(() => factoryClient.approveVisualRouting({ projectId: props.project.id }), "Đã duyệt storyboard routing.")} disabled={running || !eligibility.approvable}>Approve routing</button><button className="button danger compact" type="button" onClick={() => void perform(() => factoryClient.rejectVisualRouting({ projectId: props.project.id }), "Đã từ chối storyboard routing.")} disabled={running}>Reject</button></div> : null}</div>)}
      {message ? <p className={message.toLowerCase().includes("failed") || message.toLowerCase().includes("không") ? "error-message" : "safe-message"}>{message}</p> : null}
    </SectionCard>
    <StageStatusHeader stageName="Asset Concepts" stageNumber={20} eligibility={conceptEligibility} dependencies={["Approved Visual Routing", "Approved Character Pack"]} purpose="Map each semantic beat to a reusable visual asset and motion intention before prompt compilation." />
    <SectionCard title="Asset concepts" description="Các concept được tạo local cho manual-first flow; provider text chỉ là tuỳ chọn ở pipeline legacy.">
      {canRetryStage(conceptEligibility) || (conceptEligibility.status === "approved" && !assetConceptsReady) ? <button className="button primary" type="button" disabled={running} onClick={() => void perform(() => factoryClient.runAssetConcepts({ projectId: props.project.id }), "Asset concepts đã sẵn sàng.")}>{conceptEligibility.status === "failed" || conceptEligibility.status === "needs_attention" ? "Retry concepts" : "Create concepts"}</button> : null}
      {conceptArtifacts.map((artifact) => <div key={artifact.id} className="studio-stack"><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{displayStatus(artifact.status)}</StatusBadge><div className="card-grid">{artifact.payloadJson.concepts.map((concept) => <article className="shot-card studio-card" key={concept.id}><strong>{concept.role}</strong><span>{concept.shotId} · {concept.semanticBeat}</span><p>{concept.description}</p><small>{concept.motionIntent}</small><TagList items={concept.visualConstraints.concat(concept.colorPalette)} limit={6} /></article>)}</div></div>)}
    </SectionCard>
    <StageStatusHeader stageName="Prompt Studio" stageNumber={21} eligibility={promptEligibility} dependencies={["Approved Asset Concepts"]} purpose="Một scene một prompt copy được cho GG Lab. Không tạo ảnh trong app." />
    <SectionCard title="Scene prompt studio" description="Mỗi prompt hướng dẫn GG Lab tạo nhiều frame riêng, đánh số toàn cục và dùng frame trước làm reference nội bộ.">
      {promptEligibility.runnable ? <button className="button primary" type="button" onClick={() => void perform(() => factoryClient.runPromptPreparation({ projectId: props.project.id }), "Scene prompts đã sẵn sàng để copy.")} disabled={running}>Compile scene prompts</button> : null}
      {latestPrompt?.payloadJson.scenePrompts?.length ? <div className="prompt-studio-grid">{latestPrompt.payloadJson.scenePrompts.map((scenePrompt) => <article className="prompt-card" key={scenePrompt.sceneId}><div className="prompt-card-header"><div><strong>{scenePrompt.sceneId}</strong><span>{scenePrompt.frameNumbers.join(" · ")} · {scenePrompt.expectedAspectRatio}</span></div><button className="button compact" type="button" onClick={() => void copyScenePrompt(scenePrompt.promptText)}>Copy prompt</button></div><textarea readOnly value={scenePrompt.promptText} aria-label={`Prompt for ${scenePrompt.sceneId}`} /><div className="prompt-meta"><span>References: {scenePrompt.referenceInstructions.length}</span><span>Locks: {scenePrompt.continuityLocks.length}</span></div></article>)}</div> : latestPrompt?.payloadJson.prompts.length ? <div className="studio-stack">{latestPrompt.payloadJson.prompts.map((prompt) => <article className="prompt-card" key={prompt.shotId}><div className="prompt-card-header"><strong>{prompt.shotId}</strong><button className="button compact" type="button" onClick={() => void copyScenePrompt(prompt.positivePrompt)}>Copy prompt</button></div><p>{prompt.positivePrompt}</p></article>)}</div> : <EmptyState title="Chưa có prompt" detail="Approve routing và tạo Asset Concepts trước khi compile prompt." />}
      {latestPrompt?.status === "needs_review" ? <div className="button-row"><button className="button compact" type="button" onClick={() => void perform(() => factoryClient.approvePromptPreparation({ projectId: props.project.id }), "Đã duyệt prompt package.")} disabled={running || !promptEligibility.approvable}>Approve prompts</button><button className="button danger compact" type="button" onClick={() => void perform(() => factoryClient.rejectPromptPreparation({ projectId: props.project.id }), "Đã từ chối prompt package.")} disabled={running}>Reject</button></div> : null}
    </SectionCard>
    {characterFirst ? <>
      <SectionCard title="Asset Intake" description="Tạo ảnh thủ công trong GG Lab, sau đó kéo thả hoặc chọn nhiều file tại đây. File 001, 002... sẽ tự map theo thứ tự storyboard.">
        <div className="intake-summary"><div><strong>{missingCount}</strong><span>frame còn thiếu</span></div><div><strong>{requiredShots.length - missingCount}</strong><span>frame đã map/duyệt</span></div><div><strong>{requiredShots.length}</strong><span>frame cần có</span></div></div>
        <div className="upload-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => void importDroppedFiles(event)}><p><strong>Upload nhiều ảnh một lần</strong></p><p>PNG, JPG hoặc WebP · tự kiểm tra MIME, kích thước, hash và mapping.</p><button className="button primary" type="button" disabled={running || !latestPrompt || latestPrompt.status !== "approved"} onClick={() => void perform(() => factoryClient.selectManualAssetUpload({ projectId: props.project.id }), "Đã import ảnh. Tiếp tục approve từng frame.")}>Tải ảnh GG Lab lên</button>{!latestPrompt || latestPrompt.status !== "approved" ? <small>Approve Scene Prompt trước khi upload.</small> : <small>Kéo thả nhiều ảnh vào vùng này để tự map theo storyboard.</small>}</div>
        <div className="asset-intake-grid">
          {requiredShots.map((shot) => {
            const item = itemForShot(shot.id);
            return (
              <article className={`asset-slot ${item ? "" : "asset-slot-missing"}`} key={`slot-${shot.id}`}>
                {item && latestReview ? <AssetPreviewImage projectId={props.project.id} artifactId={latestReview.id} assetSha256={item.asset.sha256} /> : <div className="asset-slot-preview asset-slot-placeholder">Missing</div>}
                <div>
                  <strong>{shot.id}</strong>
                  <span>{item ? `${item.asset.width}x${item.asset.height} · ${item.reviewStatus === "approved" ? "Approved" : "Needs review"}` : "Missing storyboard frame"}</span>
                  {item?.warnings?.map((warning) => <small className="attention-copy" key={warning}>{warning}</small>)}
                </div>
                <button className="button compact" type="button" disabled={running || !latestPrompt || latestPrompt.status !== "approved"} onClick={() => void uploadShot(shot.id)}>{item ? "Upload / replace" : "Upload frame"}</button>
              </article>
            );
          })}
        </div>
        {warningCount > 0 ? <p className="attention-copy">{warningCount} image warning(s) need review before Build.</p> : null}
        {orphanCount > 0 ? <p className="attention-copy">{orphanCount} imported file(s) do not match a storyboard frame.</p> : null}
        {latestReview ? (
          <div className="asset-intake-grid">
            {reviewItems.map((item) => (
              <article className="asset-slot" key={`${item.asset.sha256}-${item.assignedShotId ?? item.asset.shotId}`}>
                <AssetPreviewImage projectId={props.project.id} artifactId={latestReview.id} assetSha256={item.asset.sha256} />
                <div>
                  <strong>{item.assignedShotId ?? item.asset.shotId}</strong>
                  <span>{item.asset.width}×{item.asset.height} · {item.reviewStatus === "approved" ? "Đã duyệt" : item.reviewStatus === "rejected" ? "Cần thay" : "Chờ review"}</span>
                </div>
                {latestReview.status === "needs_review" ? (
                  <>
                    <div className="button-row">
                      <button className="button compact" type="button" disabled={running} onClick={() => void perform(() => factoryClient.reviseAssetReview({ projectId: props.project.id, artifactId: latestReview.id, assetSha256: item.asset.sha256, action: "approve" }), "Frame đã được duyệt.")}>Approve</button>
                      <button className="button danger compact" type="button" disabled={running} onClick={() => void perform(() => factoryClient.reviseAssetReview({ projectId: props.project.id, artifactId: latestReview.id, assetSha256: item.asset.sha256, action: "reject" }), "Frame removed; upload a replacement when ready.")}>Remove / replace</button>
                    </div>
                    {item.reviewStatus === "approved" ? (
                      <select
                        aria-label={`Assign ${item.asset.sha256} to storyboard frame`}
                        value={item.assignedShotId ?? ""}
                        disabled={running}
                        onChange={(event) => {
                          const shotId = event.target.value;
                          void perform(
                            () => factoryClient.reviseAssetReview({
                              projectId: props.project.id,
                              artifactId: latestReview.id,
                              assetSha256: item.asset.sha256,
                              action: shotId ? "assign" : "unassign",
                              ...(shotId ? { shotId } : {})
                            }),
                            "Frame mapping updated."
                          );
                        }}
                      >
                        <option value="">Unassign frame</option>
                        {requiredShots.map((shot) => <option key={shot.id} value={shot.id}>{shot.id}</option>)}
                      </select>
                    ) : null}
                  </>
                ) : null}
              </article>
            ))}
          </div>
        ) : <EmptyState title="Chưa có ảnh upload" detail="Tạo ảnh theo prompt studio rồi upload toàn bộ ở đây." />}
      </SectionCard>
    </> : <>
      <StageStatusHeader stageName="Asset Acquisition" stageNumber={18} eligibility={assetEligibility} dependencies={["Approved Prompt Preparation", "Verified image model"]} purpose="Legacy/experimental provider image generation. It is not part of the default character-first flow." />
      <SectionCard title="Legacy image generation" description="Chỉ dùng khi bạn chủ động bật pipeline provider cũ.">{assetEligibility.runnable ? <button className="button primary" type="button" onClick={() => void perform(() => factoryClient.runAssetAcquisition({ projectId: props.project.id }), "Generated assets are ready for review.")} disabled={running}>Generate images</button> : <DisabledAction reason={assetEligibility.blockingReasons[0]?.message ?? "Asset Acquisition is not runnable."}>Generate images</DisabledAction>}{assetArtifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{displayStatus(artifact.status)}</StatusBadge>{artifact.status === "needs_review" ? <div className="button-row"><button className="button compact" type="button" onClick={() => void perform(() => factoryClient.approveAssetAcquisition({ projectId: props.project.id }), "Asset acquisition approved.")} disabled={running || !assetEligibility.approvable}>Approve</button><button className="button danger compact" type="button" onClick={() => void perform(() => factoryClient.rejectAssetAcquisition({ projectId: props.project.id }), "Asset acquisition rejected.")} disabled={running}>Reject</button></div> : null}</div>)}</SectionCard>
    </>}
    <SectionCard title="Asset review" description="Build chỉ mở khi mọi frame bắt buộc đã được map, approve và assign.">{latestReview ? <><StatusBadge tone={latestReview.status === "approved" ? "success" : "warning"}>{displayStatus(latestReview.status)}</StatusBadge>{latestReview.status === "needs_review" ? <div className="button-row"><button className="button primary" type="button" disabled={running || !assetReviewEligibility.approvable} onClick={() => void perform(async () => { const project = await factoryClient.approveAssetReview({ projectId: props.project.id }); if (project.setup.workflowMode === "semi_automatic") void props.startSemiAutomatic("assets", project); return project; }, "Assets approved. Build is ready.")}>Approve all mapped assets</button><button className="button danger compact" type="button" disabled={running} onClick={() => void perform(() => factoryClient.rejectAssetReview({ projectId: props.project.id }), "Asset review rejected.")}>Reject review</button></div> : null}</> : <EmptyState title="Asset review chưa bắt đầu" detail="Upload ảnh để tạo batch review." />}{missingCount > 0 ? <p className="attention-copy">Còn thiếu {missingCount} frame bắt buộc. Build vẫn bị khoá.</p> : null}</SectionCard>
  </>;
}

function displayStatus(status: string): string {
  const labels: Record<string, string> = { not_started: "Chưa bắt đầu", blocked: "Đang chờ bước trước", ready: "Sẵn sàng", queued: "Đang xếp hàng", running: "Đang xử lý", needs_review: "Chờ bạn duyệt", needs_attention: "Cần xử lý", approved: "Đã duyệt", rejected: "Đã từ chối", failed: "Có lỗi", stale: "Cần cập nhật" };
  return labels[status] ?? status;
}

function visualLabel(mode: string): string {
  const labels: Record<string, string> = { ai_image: "Ảnh mới (GG Lab)", ai_video: "Video", stock_image: "Ảnh stock", stock_video: "Video stock", manual_upload: "Ảnh upload", uploaded: "Đã upload", reuse: "Tái sử dụng", document: "Tài liệu", diagram: "Sơ đồ", text_card: "Text card" };
  return labels[mode] ?? mode;
}

function motionLabel(effect: string): string {
  const labels: Record<string, string> = { none: "Không motion", slide_up: "Trượt lên", slide_down: "Trượt xuống", pan_left: "Pan trái", pan_right: "Pan phải", zoom_in: "Zoom in", zoom_out: "Zoom out", pop: "Pop", dissolve: "Dissolve" };
  return labels[effect] ?? effect;
}

function AssetPreviewImage(props: { projectId: string; artifactId: string; assetSha256: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => { let active = true; void factoryClient.getAssetPreviewUrl(props).then((result) => { if (active) setUrl(result.url); }).catch(() => undefined); return () => { active = false; }; }, [props.projectId, props.artifactId, props.assetSha256]);
  return url ? <img className="asset-slot-preview" src={url} alt="Storyboard frame preview" /> : <div className="asset-slot-preview asset-slot-placeholder">Preview</div>;
}
function TimelineScreen(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; startSemiAutomatic: (chain: SemiAutomaticChain, project: FactoryProject) => Promise<void> }) {
  const [artifacts, setArtifacts] = useState<TimelineAssemblyArtifact[]>([]); const [previewArtifacts, setPreviewArtifacts] = useState<PreviewRenderArtifact[]>([]); const [subtitlePreset, setSubtitlePreset] = useState<SubtitlePreset>("vox-clean"); const [running, setRunning] = useState(false); const [message, setMessage] = useState("");
  const eligibility = resolveStageEligibilities(props.project).find((stage) => stage.stageId === "timeline-assembly")!;
  const previewEligibility = resolveStageEligibilities(props.project).find((stage) => stage.stageId === "preview-render")!;
  const nextChain = nextSemiAutomaticChain(props.project);
  const refresh = async () => { const [timeline, previews] = await Promise.all([factoryClient.listTimelineAssemblyArtifacts({ projectId: props.project.id }), factoryClient.listPreviewRenderArtifacts({ projectId: props.project.id })]); setArtifacts(timeline); setPreviewArtifacts(previews); const currentPreview = previews.find((artifact) => artifact.status === "needs_review") ?? previews.find((artifact) => artifact.status === "approved"); setSubtitlePreset(currentPreview?.payloadJson.subtitlePreset ?? "vox-clean"); };
  useEffect(() => { void refresh().catch(() => setArtifacts([])); }, [props.project.id]);
  async function perform(action: () => Promise<FactoryProject>, success: string) { setRunning(true); try { props.setSelectedProject(await action()); await refresh(); setMessage(success); } catch (error) { setMessage(safeRendererError(error)); } finally { setRunning(false); } }
  async function selectAudio(kind: "music" | "ambient" | "sfx"): Promise<void> {
    await perform(() => factoryClient.selectProjectAudio({ projectId: props.project.id, kind }), `${kind} audio saved. Rebuild the timeline to include it.`);
  }
  const totalFrames = Math.max(...props.project.timeline.items.map((item) => item.startFrame + item.durationFrames), 1);
  return (
    <>
      <PageHeader title="Timeline" description="Assemble approved visuals, voice, and subtitles into an integer-frame review timeline." actions={canRetryStage(eligibility) ? <button className="button primary" type="button" disabled={running} onClick={() => void perform(() => factoryClient.runTimelineAssembly({ projectId: props.project.id }), eligibility.status === "failed" || eligibility.status === "needs_attention" ? "Timeline Assembly retry is ready for review." : "Timeline Assembly is ready for review.")}>{eligibility.status === "failed" || eligibility.status === "needs_attention" ? "Retry Timeline Assembly" : "Assemble timeline"}</button> : <DisabledAction reason={eligibility.blockingReasons[0]?.message ?? "Timeline Assembly is not runnable."}>Assemble timeline</DisabledAction>} />
      <StageStatusHeader stageName="Timeline Assembly" stageNumber={22} eligibility={eligibility} dependencies={["Approved Asset Review", "Approved Voice", "Approved Subtitles"]} purpose="Create a reviewable timeline only from approved media; it does not render or export." />
      <SectionCard title="Audio tracks" description="Optional music, ambience, and SFX are copied into the workspace. Music and ambience loop under narration at reduced volume; SFX stays a separate CapCut audio item.">
        <div className="button-row"><button className="button secondary" type="button" disabled={running} onClick={() => void selectAudio("music")}>{props.project.setup.musicPath ? "Replace music" : "Add music"}</button><button className="button secondary" type="button" disabled={running} onClick={() => void selectAudio("ambient")}>{props.project.setup.ambientPath ? "Replace ambience" : "Add ambience"}</button><button className="button secondary" type="button" disabled={running} onClick={() => void selectAudio("sfx")}>{props.project.setup.sfxPath ? "Replace SFX" : "Add SFX"}</button></div>
        <p className="muted">Music: {props.project.setup.musicPath ?? "not supplied"} · Ambience: {props.project.setup.ambientPath ?? "not supplied"} · SFX: {props.project.setup.sfxPath ?? "not supplied"}</p>
      </SectionCard>
<SectionCard title="Timeline Assembly review">{artifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : artifact.status === "rejected" ? "danger" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge><p>{artifact.payloadJson.items.length} media items at {artifact.payloadJson.fps} fps</p>{artifact.status === "needs_review" ? <div className="button-row"><button className="button compact" type="button" disabled={running || !eligibility.approvable} onClick={() => void perform(() => factoryClient.approveTimelineAssembly({ projectId: props.project.id }), "Timeline Assembly approved.")}>Approve timeline</button><button className="button danger compact" type="button" disabled={running} onClick={() => void perform(() => factoryClient.rejectTimelineAssembly({ projectId: props.project.id }), "Timeline Assembly rejected.")}>Reject timeline</button></div> : null}</div>)}{message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}</SectionCard>
      <StageStatusHeader stageName="Preview Render" stageNumber={23} eligibility={previewEligibility} dependencies={["Approved Timeline Assembly"]} purpose="Render real approved visual and narration media with FFmpeg, then review the validated local preview before QA." />
      <SectionCard title="Subtitle preset" description="Important Vietnamese text stays in the local UTF-8 compositing layer. Choose one global subtitle style before rendering the preview."><FormField label="Subtitle preset" htmlFor="subtitle-preset"><select id="subtitle-preset" value={subtitlePreset} onChange={(event) => setSubtitlePreset(event.target.value as SubtitlePreset)}><option value="vox-clean">VOX Clean</option><option value="minimal">Minimal</option><option value="high-contrast">High Contrast</option></select></FormField></SectionCard>
      <SectionCard title="Preview Render review" description="This runs FFmpeg only after you click it. The renderer cannot select paths or invoke a process directly.">
        {canRetryStage(previewEligibility) ? <button className="button primary" type="button" disabled={running} onClick={() => void perform(() => factoryClient.runPreviewRender({ projectId: props.project.id, subtitlePreset }), previewEligibility.status === "failed" || previewEligibility.status === "needs_attention" ? "Preview Render retry is ready for review." : "Preview Render is ready for review.")}>{running ? "Rendering preview..." : previewEligibility.status === "failed" || previewEligibility.status === "needs_attention" ? "Retry Preview Render" : "Render approved preview"}</button> : <DisabledAction reason={previewEligibility.blockingReasons[0]?.message ?? "Preview Render requires an approved timeline."}>Render approved preview</DisabledAction>}
        {previewArtifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : artifact.status === "rejected" ? "danger" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge><p>{artifact.payloadJson.width}x{artifact.payloadJson.height}, {artifact.payloadJson.durationSeconds.toFixed(2)}s</p><p>{artifact.relativeFilePath}</p><p>SHA-256: {artifact.payloadJson.sha256 ?? "Unavailable; render again before approval."}</p>{artifact.status === "needs_review" ? <div className="button-row"><button className="button compact" type="button" disabled={running || !previewEligibility.approvable} onClick={() => void perform(async () => { const project = await factoryClient.approvePreviewRender({ projectId: props.project.id }); if (project.setup.workflowMode === "semi_automatic") void props.startSemiAutomatic("preview", project); return project; }, "Preview Render approved.")}>Approve preview</button><button className="button danger compact" type="button" disabled={running} onClick={() => void perform(() => factoryClient.rejectPreviewRender({ projectId: props.project.id }), "Preview Render rejected. Render another approved timeline when ready.")}>Reject preview</button></div> : null}</div>)}
      </SectionCard>
      {props.project.setup.workflowMode === "semi_automatic" && nextChain === "preview" && previewEligibility.status === "approved" ? <SectionCard title="Continue automatic production" description="The final Preview Render is approved. QA and Packaging Export will run automatically; an optional CapCut Draft remains available from Export."><button className="button primary" type="button" disabled={running} onClick={() => void props.startSemiAutomatic("preview", props.project)}>Continue to QA and Packaging</button></SectionCard> : null}
      <SectionCard>
        <div className="timeline-view">
          {props.project.timeline.items.map((item) => (
            <div className="timeline-item" key={item.id} style={{ left: `${(item.startFrame / totalFrames) * 100}%`, width: `${(item.durationFrames / totalFrames) * 100}%` }}>
              {item.track} / {item.sourceId}
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
}

function QaScreen(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void }) {
  const [artifacts, setArtifacts] = useState<QaArtifact[]>([]); const [running, setRunning] = useState(false); const [message, setMessage] = useState("");
  const eligibility = resolveStageEligibilities(props.project).find((stage) => stage.stageId === "qa")!;
  const canRunQa = canRetryStage(eligibility);
  const refresh = () => factoryClient.listQaArtifacts({ projectId: props.project.id }).then(setArtifacts);
  useEffect(() => { void refresh().catch(() => setArtifacts([])); }, [props.project.id]);
  async function perform(action: () => Promise<FactoryProject>, success: string) { setRunning(true); try { props.setSelectedProject(await action()); await refresh(); setMessage(success); } catch (error) { setMessage(safeRendererError(error)); } finally { setRunning(false); } }
  return <><PageHeader title="QA" description="Run deterministic evidence checks after an approved preview. QA never fabricates AI findings or auto-approves the project." actions={canRunQa ? <button className="button primary" type="button" disabled={running} onClick={() => void perform(() => factoryClient.runQa({ projectId: props.project.id }), eligibility.status === "failed" || eligibility.status === "needs_attention" ? "QA retry is ready for review." : "QA report is ready for review.")}>{eligibility.status === "failed" || eligibility.status === "needs_attention" ? "Retry QA" : "Run QA"}</button> : <DisabledAction reason={eligibility.blockingReasons[0]?.message ?? "QA requires an approved preview."}>Run QA</DisabledAction>} /><StageStatusHeader stageName="QA" stageNumber={25} eligibility={eligibility} dependencies={["Approved Preview Render"]} purpose="Inspect persisted artifacts and local media evidence before optional CapCut or final packaging." /><SectionCard title="QA reports">{artifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge>{artifact.payloadJson.findings.length ? artifact.payloadJson.findings.map((finding, index) => <p key={`${finding.code}-${index}`}><strong>{finding.severity}</strong> {finding.code}: {finding.message}</p>) : <p>No deterministic findings.</p>}{artifact.status === "needs_review" ? <div className="button-row"><button className="button compact" disabled={running || !eligibility.approvable || artifact.payloadJson.findings.some((finding) => finding.severity === "blocking")} type="button" onClick={() => void perform(() => factoryClient.approveQa({ projectId: props.project.id }), "QA approved.")}>Approve QA</button><button className="button danger compact" disabled={running} type="button" onClick={() => void perform(() => factoryClient.rejectQa({ projectId: props.project.id }), "QA rejected.")}>Reject QA</button></div> : null}</div>)}{message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}</SectionCard></>;
}

function ExportScreen(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; setRoute: (route: RouteId) => void }) {
  const [artifacts, setArtifacts] = useState<PackagingExportArtifact[]>([]);
  const [capcutArtifacts, setCapcutArtifacts] = useState<CapCutDraftArtifact[]>([]);
  const [previewArtifacts, setPreviewArtifacts] = useState<PreviewRenderArtifact[]>([]);
  const [resolution, setResolution] = useState<"1080p" | "720p">(props.project.setup.outputResolution ?? "1080p");
  const [includeSubtitles, setIncludeSubtitles] = useState(true);
  const [exportSubtitleFile, setExportSubtitleFile] = useState(true);
  const [createCapCutDraft, setCreateCapCutDraft] = useState(false);
  const [includeProjectManifest, setIncludeProjectManifest] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const eligibility = resolveStageEligibilities(props.project).find((stage) => stage.stageId === "packaging-export")!;
  const capcutEligibility = resolveStageEligibilities(props.project).find((stage) => stage.stageId === "capcut-draft")!;
  const canRunCapcut = canRetryStage(capcutEligibility);
  const currentPreview = previewArtifacts.find((artifact) => artifact.status === "approved" || artifact.status === "needs_review");
  const previewHasSubtitles = Boolean(currentPreview?.payloadJson.subtitleRelativeFilePath);
  const previewOptionsChanged = resolution !== (props.project.setup.outputResolution ?? "1080p") || includeSubtitles !== previewHasSubtitles;
  const canRunPackaging = canRetryStage(eligibility) && !previewOptionsChanged;

  const refresh = async () => {
    const [exports, drafts, previews] = await Promise.all([
      factoryClient.listPackagingExportArtifacts({ projectId: props.project.id }),
      factoryClient.listCapCutDraftArtifacts({ projectId: props.project.id }),
      factoryClient.listPreviewRenderArtifacts({ projectId: props.project.id })
    ]);
    setArtifacts(exports);
    setCapcutArtifacts(drafts);
    setPreviewArtifacts(previews);
    if (previews[0]) setIncludeSubtitles(Boolean(previews[0].payloadJson.subtitleRelativeFilePath));
  };

  useEffect(() => {
    setResolution(props.project.setup.outputResolution ?? "1080p");
    void refresh().catch(() => {
      setArtifacts([]);
      setCapcutArtifacts([]);
      setPreviewArtifacts([]);
    });
  }, [props.project.id]);

  async function perform(action: () => Promise<FactoryProject>, success: string) {
    setRunning(true);
    try {
      props.setSelectedProject(await action());
      await refresh();
      setMessage(success);
    } catch (error) {
      setMessage(safeRendererError(error, "The export operation could not be completed. Check the selected options and retry."));
    } finally {
      setRunning(false);
    }
  }

  async function applyPreviewOptions() {
    setRunning(true);
    try {
      const next = await factoryClient.runPreviewRender({ projectId: props.project.id, force: true, resolution, includeSubtitles, subtitlePreset: currentPreview?.payloadJson.subtitlePreset ?? "vox-clean" });
      props.setSelectedProject(next);
      props.setRoute("final-preview");
    } catch (error) {
      setMessage(safeRendererError(error, "The preview options could not be applied. Render the preview again and retry."));
    } finally {
      setRunning(false);
    }
  }

  async function createPackage() {
    setRunning(true);
    try {
      let next = await factoryClient.runPackagingExport({ projectId: props.project.id, exportSubtitleFile, includeProjectManifest });
      let success = includeProjectManifest ? "Final MP4 and project manifest are ready for review." : "Final MP4 is ready for review without a project manifest.";
      if (createCapCutDraft) {
        try {
          next = await factoryClient.runCapCutDraft({ projectId: props.project.id });
          success += " CapCut Draft is ready for optional review.";
        } catch (error) {
          success += ` CapCut Draft was not created: ${safeRendererError(error, "the optional CapCut draft could not be created")}`;
        }
      }
      props.setSelectedProject(next);
      await refresh();
      setMessage(success);
    } catch (error) {
      setMessage(safeRendererError(error, "The export operation could not be completed. Check the selected options and retry."));
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <PageHeader title="Export" description="Choose final output options, then create a reviewed workspace-local MP4 package." actions={<div className="button-row"><button className="button secondary" type="button" onClick={() => props.setRoute("final-preview")}>Watch final video</button>{canRunPackaging ? <button className="button primary" type="button" disabled={running} onClick={() => void createPackage()}>{eligibility.status === "failed" || eligibility.status === "needs_attention" ? "Retry Packaging Export" : "Create final MP4 package"}</button> : <DisabledAction reason={previewOptionsChanged ? "Apply the selected preview options and approve Final Preview before exporting." : eligibility.blockingReasons[0]?.message ?? "Packaging requires approved QA and production artifacts; CapCut Draft is optional."}>Create final MP4 package</DisabledAction>}</div>} />
      <SectionCard title="Export options" description="Resolution and subtitle burn-in changes create a new Final Preview checkpoint. Subtitle file, manifest, and CapCut draft are package options.">
        <div className="form-grid">
          <FormField label="Resolution" htmlFor="export-resolution"><select id="export-resolution" value={resolution} onChange={(event) => setResolution(event.target.value as "1080p" | "720p")}><option value="1080p">1080p</option><option value="720p">720p</option></select></FormField>
          <label><input type="checkbox" checked={includeSubtitles} onChange={(event) => setIncludeSubtitles(event.target.checked)} /> Include subtitles in video</label>
          <label><input type="checkbox" checked={exportSubtitleFile} onChange={(event) => setExportSubtitleFile(event.target.checked)} /> Export subtitle file</label>
          <label><input type="checkbox" checked={createCapCutDraft} onChange={(event) => setCreateCapCutDraft(event.target.checked)} /> Create CapCut draft</label>
          <label><input type="checkbox" checked={includeProjectManifest} onChange={(event) => setIncludeProjectManifest(event.target.checked)} /> Include project manifest</label>
        </div>
        {previewOptionsChanged ? <div className="button-row"><button className="button secondary" type="button" disabled={running} onClick={() => void applyPreviewOptions()}>Render preview with selected video options</button><span className="muted">Final Preview approval is required before export.</span></div> : null}
      </SectionCard>
      <StageStatusHeader stageName="CapCut Draft" stageNumber={26} eligibility={capcutEligibility} dependencies={["Approved QA", "Approved Timeline"]} purpose="Optional structural draft for manual CapCut desktop review; it is never required for final MP4 packaging." />
      <SectionCard title="CapCut Draft review">
        {canRunCapcut ? <button className="button primary" type="button" disabled={running} onClick={() => void perform(() => factoryClient.runCapCutDraft({ projectId: props.project.id }), capcutEligibility.status === "failed" || capcutEligibility.status === "needs_attention" ? "CapCut Draft retry is ready for manual desktop review." : "CapCut draft is ready for manual desktop review.")}>{capcutEligibility.status === "failed" || capcutEligibility.status === "needs_attention" ? "Retry CapCut draft" : "Create CapCut draft"}</button> : <DisabledAction reason={capcutEligibility.blockingReasons[0]?.message ?? "CapCut Draft requires approved QA and runtime prerequisites."}>Create CapCut draft</DisabledAction>}
        {capcutArtifacts.map((artifact) => <p key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : artifact.status === "rejected" ? "danger" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge> {artifact.payloadJson.draftName}: {artifact.payloadJson.trackCounts.video} video, {artifact.payloadJson.trackCounts.audio} audio, {artifact.payloadJson.trackCounts.text} subtitle tracks; {artifact.payloadJson.mediaValidated ? `${artifact.payloadJson.visualClipCount ?? artifact.payloadJson.trackCounts.video} visual clips validated` : "legacy visual media not revalidated"}. {artifact.status === "needs_review" ? <span className="button-row"><button className="button compact" disabled={running || !capcutEligibility.approvable} type="button" onClick={() => { if (window.confirm("Confirm that you opened this draft in CapCut and verified that video, audio, and subtitle tracks are editable.")) void perform(() => factoryClient.approveCapCutDraft({ projectId: props.project.id, confirmation: "I opened the draft in CapCut and verified editable tracks" }), "CapCut Draft approved after manual verification."); }}>Confirm CapCut review</button><button className="button danger compact" disabled={running} type="button" onClick={() => void perform(() => factoryClient.rejectCapCutDraft({ projectId: props.project.id }), "CapCut Draft rejected.")}>Reject draft</button></span> : null}</p>)}
      </SectionCard>
      <StageStatusHeader stageName="Packaging Export" stageNumber={27} eligibility={eligibility} dependencies={["Approved QA", "Approved Preview, Timeline, Voice, Subtitles, and Assets"]} purpose="Copy the approved preview into a final MP4 and optionally include its subtitle file and project manifest." />
      <SectionCard title="Package manifests">
        {artifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge><p>Manifest: {artifact.payloadJson.manifestRelativeFilePath ?? "Not included"}</p><p>Final MP4: {artifact.payloadJson.mp4RelativeFilePath ?? "Not available"}</p>{artifact.payloadJson.subtitleRelativeFilePath ? <p>Subtitle file: {artifact.payloadJson.subtitleRelativeFilePath}</p> : null}<p>{artifact.payloadJson.artifactIds.length} approved artifacts, SHA-256 {artifact.payloadJson.sha256.slice(0, 12)}...</p>{artifact.status === "needs_review" ? <div className="button-row"><button className="button compact" disabled={running || !eligibility.approvable} type="button" onClick={() => void perform(() => factoryClient.approvePackagingExport({ projectId: props.project.id }), "Final MP4 package approved.")}>Approve package</button><button className="button danger compact" disabled={running} type="button" onClick={() => void perform(() => factoryClient.rejectPackagingExport({ projectId: props.project.id }), "Package export rejected.")}>Reject package</button></div> : null}</div>)}
        {message ? <p className={message.toLowerCase().includes("failed") || message.toLowerCase().includes("not created") ? "error-message" : "safe-message"}>{message}</p> : null}
      </SectionCard>
    </>
  );
}

function QueueScreen(props: { queue: QueueSnapshot; selectedProject: FactoryProject | null; onRunDemo: () => Promise<void> }) {
  const counts = queueCounts(props.queue);
  async function runDemoQueue() {
    if (!props.selectedProject) return;
    await factoryClient.mockImageBatch(props.selectedProject.id);
    await props.onRunDemo();
  }
  return (
    <>
      <PageHeader
        title="Production Queue"
        description="Queue monitor reflects the real JSON-backed queue. The only runnable queue action is explicitly marked as simulation."
        actions={
          props.selectedProject ? (
            <button className="button secondary" type="button" onClick={() => void runDemoQueue()}><Sparkles size={16} /> Run Queue Simulation</button>
          ) : <DisabledAction reason="Open a project before running the explicit queue simulation.">Run Queue Simulation</DisabledAction>
        }
      />
      <SectionCard>
        <div className="route-result">
          <StatusBadge tone="demo">Queue simulation</StatusBadge>
          <span>The queue backend is real and persisted as JSON, but image workers still use the explicit mock IPC until provider execution is implemented.</span>
        </div>
      </SectionCard>
      <section className="metric-grid">
        {["queued", "running", "succeeded", "failed", "paused", "rate_limited"].map((state) => <MetricCard key={state} label={state.replace("_", " ")} value={counts[state] ?? 0} />)}
      </section>
      <SectionCard title="Five workers">
        <div className="worker-grid">
          {Array.from({ length: props.queue.concurrency }, (_, index) => (
            <div className="worker-slot" key={index}>
              <strong>Worker {index + 1}</strong>
              <span>{index < props.queue.running ? "Running" : "Idle"}</span>
              <small>No progress metadata available</small>
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Jobs">
        {props.queue.jobs.length === 0 ? (
          <EmptyState title="Queue empty" detail="No real provider jobs have been submitted. Simulated jobs are labeled and cost $0." />
        ) : (
          <DataTable label="Generation jobs">
            <thead><tr><th>Status</th><th>Job ID</th><th>Project</th><th>Shot</th><th>Type</th><th>Provider</th><th>Model</th><th>Attempt</th><th>Error</th></tr></thead>
            <tbody>
              {props.queue.jobs.map((job) => (
                <tr key={job.id}>
                  <td><StatusBadge tone={stageTone(job.state)}>{job.state}</StatusBadge></td>
                  <td>{job.id}</td>
                  <td>{job.projectId}</td>
                  <td>{job.shotId}</td>
                  <td>{job.requestType}</td>
                  <td>{job.provider}</td>
                  <td>{job.model}</td>
                  <td>{job.attemptCount}</td>
                  <td>{job.errorClassification ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </SectionCard>
    </>
  );
}

function AssetLibraryScreen(props: { selectedProject: FactoryProject | null }) {
  return (
    <>
      <PageHeader title="Asset Library" description="Asset metadata tables exist, but asset save/hash/assign runtime flow is not connected." />
      <EmptyState
        title="No assets available"
        detail={props.selectedProject ? "This project has no generated, uploaded, or assigned assets yet." : "Open a project to filter assets once asset persistence is wired."}
      />
    </>
  );
}

function ProvidersScreen(props: {
  presence: ProviderPresence;
  stockPresence: ProviderPresence;
  settings: ProviderCredentialSettings | null;
  textCertification: TextModelCertificationResponse;
  imageCertification: ImageModelCertificationResponse;
  setTextCertification: (certification: TextModelCertificationResponse) => void;
  setImageCertification: (certification: ImageModelCertificationResponse) => void;
  setPresence: (presence: ProviderPresence) => void;
  setStockPresence: (presence: ProviderPresence) => void;
  setSettings: (settings: ProviderCredentialSettings | null) => void;
  onRefresh: () => Promise<void>;
}) {
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:20128/v1");
  const [apiKey, setApiKey] = useState("");
  const [imageModel, setImageModel] = useState("");
  const [textModel, setTextModel] = useState("");
  const [videoModel, setVideoModel] = useState("");
  const [ttsModel, setTtsModel] = useState("");
  const [sttModel, setSttModel] = useState("");
  const [pexelsApiKey, setPexelsApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [stockMessage, setStockMessage] = useState("");
  const [modelConfigMessage, setModelConfigMessage] = useState("");
  const [modelListStatus, setModelListStatus] = useState<ModelListStatus>("not_tested");
  const [modelListMessage, setModelListMessage] = useState("Endpoint not tested.");
  const [models, setModels] = useState<Array<{ id: string }>>([]);
  const [savingCredential, setSavingCredential] = useState(false);
  const [savingModelConfiguration, setSavingModelConfiguration] = useState(false);
  const [certificationRunning, setCertificationRunning] = useState(false);
  const [imageCertificationRunning, setImageCertificationRunning] = useState(false);
  const [certificationRetryUsed, setCertificationRetryUsed] = useState(false);
  const [savingStock, setSavingStock] = useState(false);
  const modelRefreshRunning = useRef(false);
  const modelListingRunning = modelListStatus === "testing";
  const baseUrlValid = isValidProviderBaseUrl(baseUrl);
  const discoveredModelIds = models.map((model) => model.id);
  const discoveredModelIdSet = new Set(discoveredModelIds);
  const selectedModels = { textModel, imageModel, videoModel, ttsModel, sttModel };
  const selectedModelValues = Object.values(selectedModels).filter(Boolean);
  const selectionsUseDiscoveredModels = selectedModelValues.every((model) => discoveredModelIdSet.has(model));
  const canSaveModelConfiguration = props.presence.hasCredential && discoveredModelIds.length > 0 && selectionsUseDiscoveredModels;
  const displayedCertificationStatus: TextModelCertificationStatus = certificationRunning ? "testing" : props.textCertification.status;
  const certificationRetryExhausted = isRetryableCertificationError(props.textCertification.errorCategory) && certificationRetryUsed;

  useEffect(() => {
    const settings = props.settings;
    if (!settings) return;
    setBaseUrl(settings.baseUrl);
    setImageModel(settings.imageModel ?? "");
    setTextModel(settings.textModel ?? "");
    setVideoModel(settings.videoModel ?? "");
    setTtsModel(settings.ttsModel ?? "");
    setSttModel(settings.sttModel ?? "");
    props.setPresence({ providerId: settings.providerId, hasCredential: settings.hasCredential });
    setCertificationRetryUsed(false);
  }, [props.settings, props.setPresence]);

  useEffect(() => {
    if (!props.presence.hasCredential || !isValidProviderBaseUrl(baseUrl)) return;
    void refreshModels();
  }, [props.presence.hasCredential, baseUrl]);

  async function saveCredential() {
    setSavingCredential(true);
    setMessage("");
    try {
      await factoryClient.saveProviderCredential({
        providerId: "9router",
        baseUrl,
        apiKey
      });
      setApiKey("");
      const settings = await factoryClient.loadProviderCredentialSettings("9router");
      props.setSettings(settings);
      const presence = { providerId: settings.providerId, hasCredential: settings.hasCredential };
      props.setPresence(presence);
      setMessage(presence.hasCredential ? "Credential saved. Raw key was cleared from the form." : "Credential saved to SQLite, but the keychain did not return the secret.");
      await props.onRefresh();
    } catch {
      setMessage("Credential save failed. The typed API key was preserved; check diagnostics or provider settings and try again.");
    } finally {
      setSavingCredential(false);
    }
  }

  async function deleteCredential() {
    await factoryClient.deleteProviderCredential("9router");
    const settings = await factoryClient.loadProviderCredentialSettings("9router");
    props.setSettings(settings);
    const presence = { providerId: settings.providerId, hasCredential: settings.hasCredential };
    props.setPresence(presence);
    setMessage("Credential reference deleted.");
    await props.onRefresh();
  }

  async function savePexelsCredential() {
    setSavingStock(true);
    setStockMessage("");
    try {
      await factoryClient.saveProviderCredential({
        providerId: "pexels",
        baseUrl: "https://api.pexels.com/v1",
        apiKey: pexelsApiKey
      });
      setPexelsApiKey("");
      const presence = await factoryClient.testCredentialPresence("pexels");
      props.setStockPresence(presence);
      setStockMessage(presence.hasCredential ? "Pexels credential saved. Stock search can use this key when the stock adapter is wired." : "Pexels reference saved, but the keychain did not return the secret.");
      await props.onRefresh();
    } catch (error) {
      setStockMessage(`Pexels credential save failed: ${safeRendererError(error)}`);
    } finally {
      setSavingStock(false);
    }
  }

  async function refreshModels() {
    if (modelRefreshRunning.current) return;
    modelRefreshRunning.current = true;
    setModelListStatus("testing");
    setModelListMessage("Testing endpoint...");
    try {
      const result = await factoryClient.list9RouterModels();
      setModelListStatus(result.status);
      setModelListMessage(result.message);
      if (result.status === "models_discovered" || result.status === "empty_model_list") {
        setModels(result.models);
      }
    } catch {
      setModelListStatus("network_error");
      setModelListMessage("Model listing failed before a safe response was returned.");
    } finally {
      modelRefreshRunning.current = false;
    }
  }

  async function saveModelConfiguration() {
    setSavingModelConfiguration(true);
    setModelConfigMessage("");
    try {
      const input: ProviderModelConfigurationInput = {
        providerId: "9router",
        ...(textModel ? { textModel } : {}),
        ...(imageModel ? { imageModel } : {}),
        ...(videoModel ? { videoModel } : {}),
        ...(ttsModel ? { ttsModel } : {}),
        ...(sttModel ? { sttModel } : {})
      };
      const settings = await factoryClient.save9RouterModelConfiguration(input);
      props.setSettings(settings);
      setTextModel(settings.textModel ?? "");
      setImageModel(settings.imageModel ?? "");
      setVideoModel(settings.videoModel ?? "");
      setTtsModel(settings.ttsModel ?? "");
      setSttModel(settings.sttModel ?? "");
      setModelConfigMessage("Model configuration saved. Selected models are not verified.");
      await props.onRefresh();
    } catch {
      setModelConfigMessage("Model configuration save failed. Previous saved configuration was preserved.");
    } finally {
      setSavingModelConfiguration(false);
    }
  }

  async function runTextCertification() {
    const model = textModel || "No selected model";
    const confirmed = window.confirm(
      `This test sends real requests to 9Router and may consume provider quota.\n\nProvider: 9Router\nModel: ${model}\nEndpoint: /v1/responses\nRequests: 2`
    );
    if (!confirmed) return;
    const retryingTransientFailure = isRetryableCertificationError(props.textCertification.errorCategory);
    setCertificationRunning(true);
    try {
      props.setTextCertification({
        status: "testing",
        message: "Text model certification is running."
      });
      const result = await factoryClient.run9RouterTextCertification({
        providerId: "9router",
        confirmation: "Run 2 certification requests"
      });
      if (retryingTransientFailure) setCertificationRetryUsed(true);
      props.setTextCertification(result);
      await props.onRefresh();
    } catch {
      if (retryingTransientFailure) setCertificationRetryUsed(true);
      props.setTextCertification({
        status: "failed",
        message: "Text model certification failed before a safe response was returned.",
        errorCategory: "unknown_error"
      });
    } finally {
      setCertificationRunning(false);
    }
  }

  async function runImageCertification() {
    const model = imageModel || "No selected model";
    const confirmed = window.confirm(
      `This test sends one real image request to 9Router and may consume provider quota.\n\nProvider: 9Router\nModel: ${model}\nEndpoint: /v1/images/generations\nRequests: 1`
    );
    if (!confirmed) return;
    setImageCertificationRunning(true);
    try {
      const result = await factoryClient.run9RouterImageCertification({
        providerId: "9router",
        confirmation: "Run 1 image certification request"
      });
      props.setImageCertification(result);
      await props.onRefresh();
    } catch {
      props.setImageCertification({
        status: "failed",
        message: "Image model certification failed before a safe response was returned.",
        errorCategory: "unknown_error"
      });
    } finally {
      setImageCertificationRunning(false);
    }
  }

  return (
    <>
      <PageHeader title="Providers" description="Secure provider settings. Existing keys are never rendered back to the UI." />
      <SectionCard title="9Router">
        <div className="form-grid">
          <FormField label="Base URL" htmlFor="provider-base-url">
            <input id="provider-base-url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
          </FormField>
          <FormField label="API key" htmlFor="provider-api-key" hint={props.presence.hasCredential ? "Credential saved. Leave blank unless replacing." : "Write-only input."}>
            <input id="provider-api-key" value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" autoComplete="off" />
          </FormField>
          <ModelSelect label="Text model" id="provider-text-model" value={textModel} modelIds={discoveredModelIds} onChange={setTextModel} />
          <ModelSelect label="Image model" id="provider-image-model" value={imageModel} modelIds={discoveredModelIds} onChange={setImageModel} />
          <ModelSelect label="Video model" id="provider-video-model" value={videoModel} modelIds={discoveredModelIds} onChange={setVideoModel} />
          <ModelSelect label="TTS model" id="provider-tts-model" value={ttsModel} modelIds={discoveredModelIds} onChange={setTtsModel} />
          <ModelSelect label="STT model" id="provider-stt-model" value={sttModel} modelIds={discoveredModelIds} onChange={setSttModel} />
          <FormField label="Concurrency" htmlFor="provider-concurrency" hint="Provider-specific concurrency persistence is not implemented; queue default remains five workers.">
            <input id="provider-concurrency" value="5" disabled readOnly />
          </FormField>
          <FormField label="Timeout" htmlFor="provider-timeout" hint="Timeout settings are not persisted yet.">
            <input id="provider-timeout" value="Not configured" disabled readOnly />
          </FormField>
          <FormField label="Retry limit" htmlFor="provider-retry-limit" hint="Queue retry policy is coded in the generation queue, not editable here yet.">
            <input id="provider-retry-limit" value="2 automatic retries" disabled readOnly />
          </FormField>
          <div className="capability-card">
            <strong>Credential status</strong>
            <StatusBadge tone={props.presence.hasCredential ? "success" : "warning"}>{props.presence.hasCredential ? "Credential saved" : "Not configured"}</StatusBadge>
          </div>
          <div className="button-row">
            {apiKey.trim() ? (
              <button className="button primary" type="button" onClick={() => void saveCredential()} disabled={savingCredential}>
                {savingCredential ? "Saving..." : "Save credential"}
              </button>
            ) : (
              <DisabledAction reason="Enter a new API key before saving or replacing the credential.">Save credential</DisabledAction>
            )}
            {props.presence.hasCredential ? (
              <button className="button danger" type="button" onClick={() => void deleteCredential()}>Delete credential</button>
            ) : (
              <DisabledAction reason="No provider credential is saved yet.">Delete credential</DisabledAction>
            )}
            {props.presence.hasCredential && baseUrlValid && !modelListingRunning ? (
              <button className="button secondary" type="button" onClick={() => void refreshModels()}>Refresh models</button>
            ) : (
              <DisabledAction reason={!props.presence.hasCredential ? "Save a 9Router credential first." : !baseUrlValid ? "Saved base URL must be valid before model listing." : "Model listing is already running."}>Refresh models</DisabledAction>
            )}
            {canSaveModelConfiguration && !savingModelConfiguration ? (
              <button className="button primary" type="button" onClick={() => void saveModelConfiguration()}>Save model configuration</button>
            ) : (
              <DisabledAction reason={!props.presence.hasCredential ? "Save a 9Router credential first." : !discoveredModelIds.length ? "Refresh models before selecting discovered IDs." : !selectionsUseDiscoveredModels ? "Selections must come from the current discovered model list." : "Model configuration is already saving."}>Save model configuration</DisabledAction>
            )}
            <DisabledAction reason="Paid capability tests require provider execution and confirmation flow.">Test capability</DisabledAction>
          </div>
          {message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}
          {modelConfigMessage ? <p className={modelConfigMessage.includes("failed") ? "error-message" : "safe-message"}>{modelConfigMessage}</p> : null}
          <div className="capability-card">
            <strong>Model listing</strong>
            <StatusBadge tone={modelListTone(modelListStatus)}>{modelListStatus.replaceAll("_", " ")}</StatusBadge>
            <small>{modelListMessage}</small>
          </div>
          <SelectedModelConfiguration selectedModels={selectedModels} textCertificationStatus={displayedCertificationStatus} imageCertificationStatus={props.imageCertification.status} />
          <TextModelCertificationPanel
            selectedModel={textModel}
            certification={props.textCertification}
            displayedStatus={displayedCertificationStatus}
            running={certificationRunning}
            retryExhausted={certificationRetryExhausted}
            hasCredential={props.presence.hasCredential}
            onRun={() => void runTextCertification()}
          />
          <ImageModelCertificationPanel
            selectedModel={imageModel}
            configurationSaved={props.settings?.imageModel === imageModel}
            certification={props.imageCertification}
            running={imageCertificationRunning}
            hasCredential={props.presence.hasCredential}
            onRun={() => void runImageCertification()}
          />
          {models.length ? (
            <DataTable label="9Router Discovered models">
              <thead><tr><th>Discovered</th></tr></thead>
              <tbody>
                {models.map((model) => <tr key={model.id}><td>{model.id}</td></tr>)}
              </tbody>
            </DataTable>
          ) : null}
        </div>
      </SectionCard>
      <SectionCard title="Pexels stock media" description="Pexels API key for stock video/image lookup. The key is stored in the OS keychain; the search adapter is still pending.">
        <div className="form-grid">
          <FormField label="API key" htmlFor="pexels-api-key" hint={props.stockPresence.hasCredential ? "Credential saved. Leave blank unless replacing." : "Write-only input."}>
            <input id="pexels-api-key" value={pexelsApiKey} onChange={(event) => setPexelsApiKey(event.target.value)} type="password" autoComplete="off" />
          </FormField>
          <div className="capability-card">
            <strong>Stock status</strong>
            <StatusBadge tone={props.stockPresence.hasCredential ? "success" : "warning"}>{props.stockPresence.hasCredential ? "Credential saved" : "Not configured"}</StatusBadge>
            <small>Pexels will cover stock video/image search once asset lookup is wired.</small>
          </div>
          <div className="button-row">
            {pexelsApiKey.trim() ? (
              <button className="button primary" type="button" onClick={() => void savePexelsCredential()} disabled={savingStock}>
                {savingStock ? "Saving..." : "Save Pexels"}
              </button>
            ) : (
              <DisabledAction reason="Enter a Pexels API key before saving or replacing the credential.">Save Pexels</DisabledAction>
            )}
          </div>
          {stockMessage ? <p className={stockMessage.includes("failed") ? "error-message" : "safe-message"}>{stockMessage}</p> : null}
        </div>
      </SectionCard>
      <SectionCard title="Evidence image sources" description="Direct image URLs from Google results, Wikipedia, archive pages, or source pages can be pasted into project references now. Automated Google image search is not wired.">
        <SettingsList items={[["Wikipedia/direct image URL", "Ready for manual references"], ["Google image search", "Manual source URL only"], ["Automated downloader", "Not wired yet"]]} />
      </SectionCard>
      <SectionCard title="Other providers" description="Cards are read-only until provider adapters exist.">
        <div className="provider-card-grid">
          {["Gemini", "OpenAI-compatible", "ElevenLabs", "Local", "Stock providers", "CapCut-assisted"].map((provider) => (
            <div className="capability-card" key={provider}>
              <strong>{provider}</strong>
              <StatusBadge tone="warning">Unavailable</StatusBadge>
              <small>No runtime adapter or persisted configuration is connected.</small>
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
}

function ModelSelect(props: { label: string; id: string; value: string; modelIds: string[]; onChange: (value: string) => void }) {
  const valueInDiscovered = props.modelIds.includes(props.value);
  return (
    <FormField label={props.label} htmlFor={props.id} hint="Select from Discovered models only. Manual entry is disabled.">
      <select
        id={props.id}
        value={valueInDiscovered ? props.value : ""}
        onChange={(event) => props.onChange(event.target.value)}
        disabled={!props.modelIds.length}
      >
        <option value="">Select Discovered model</option>
        {props.modelIds.map((modelId) => (
          <option key={modelId} value={modelId}>{modelId}</option>
        ))}
      </select>
    </FormField>
  );
}

function SelectedModelConfiguration(props: {
  selectedModels: Record<"textModel" | "imageModel" | "videoModel" | "ttsModel" | "sttModel", string>;
  textCertificationStatus: TextModelCertificationStatus;
  imageCertificationStatus: ImageModelCertificationResponse["status"];
}) {
  const rows = [
    ["Text", props.selectedModels.textModel, textCertificationLabel(props.textCertificationStatus)],
    ["Image", props.selectedModels.imageModel, imageCertificationLabel(props.imageCertificationStatus)],
    ["Video", props.selectedModels.videoModel, "Not Verified"],
    ["TTS", props.selectedModels.ttsModel, "Not Verified"],
    ["STT", props.selectedModels.sttModel, "Not Verified"]
  ].filter((row): row is [string, string, string] => Boolean(row[1]));

  if (!rows.length) {
    return (
      <div className="capability-card">
        <strong>Selected</strong>
        <StatusBadge tone="warning">Not verified</StatusBadge>
        <small>No selected models.</small>
      </div>
    );
  }

  return (
    <DataTable label="Selected model configuration">
      <thead><tr><th>Capability</th><th>Selected</th><th>Status</th></tr></thead>
      <tbody>
        {rows.map(([capability, modelId, status]) => (
          <tr key={capability}>
            <td>{capability}</td>
            <td>{modelId}</td>
            <td><StatusBadge tone={certificationTone(status)}>{status}</StatusBadge></td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function TextModelCertificationPanel(props: {
  selectedModel: string;
  certification: TextModelCertificationResponse;
  displayedStatus: TextModelCertificationStatus;
  running: boolean;
  retryExhausted: boolean;
  hasCredential: boolean;
  onRun: () => void;
}) {
  const record = props.certification.record;
  const exact = record?.exactTextTest;
  const json = record?.strictJsonTest;
  return (
    <div className="form-grid">
      <div className="section-heading">
        <h3>Text Model Certification</h3>
        <p>This test sends real requests to 9Router and may consume provider quota.</p>
      </div>
      <div className="form-grid">
        <div className="capability-card">
          <strong>Selected model</strong>
          <StatusBadge tone={props.selectedModel ? "info" : "warning"}>{props.selectedModel || "Not selected"}</StatusBadge>
          <small>{props.selectedModel ? "Selected" : "Select a discovered Text model first."}</small>
        </div>
        <div className="capability-card">
          <strong>Endpoint strategy</strong>
          <StatusBadge tone="info">/v1/responses</StatusBadge>
          <small>Requests: 2</small>
        </div>
        <div className="capability-card">
          <strong>Certification status</strong>
          <StatusBadge tone={modelCertificationTone(props.displayedStatus)}>{textCertificationLabel(props.displayedStatus)}</StatusBadge>
          <small>{props.certification.message}</small>
        </div>
        <SettingsList items={[
          ["Last tested time", record?.testedAt ? formatDate(record.testedAt) : "Not tested"],
          ["Test A result", exact ? testResultLabel(exact) : "Not tested"],
          ["Test A latency", exact ? `${exact.latencyMs} ms` : "Not tested"],
          ["Test B result", json ? testResultLabel(json) : "Not tested"],
          ["Test B latency", json ? `${json.latencyMs} ms` : "Not tested"],
          ["Returned model ID", record?.returnedModelId ?? "Not returned"]
        ]} />
        <div className="button-row">
          {props.hasCredential && props.selectedModel && !props.running && !props.retryExhausted ? (
            <button className="button primary" type="button" onClick={props.onRun}>Run 2 certification requests</button>
          ) : (
            <DisabledAction reason={!props.hasCredential ? "Save a 9Router credential first." : !props.selectedModel ? "Select and save a Text model first." : props.retryExhausted ? "One manual retry was already used for this network or timeout failure." : "Text certification is already testing."}>Run 2 certification requests</DisabledAction>
          )}
        </div>
      </div>
    </div>
  );
}

function ImageModelCertificationPanel(props: {
  selectedModel: string;
  configurationSaved: boolean;
  certification: ImageModelCertificationResponse;
  running: boolean;
  hasCredential: boolean;
  onRun: () => void;
}) {
  const displayedStatus = props.running ? "Testing" : imageCertificationLabel(props.certification.status);
  return (
    <div className="form-grid">
      <div className="section-heading">
        <h3>Image Model Certification</h3>
        <p>This test sends one real image request to 9Router and may consume provider quota.</p>
      </div>
      <div className="form-grid">
        <div className="capability-card">
          <strong>Selected model</strong>
          <StatusBadge tone={props.selectedModel ? "info" : "warning"}>{props.selectedModel || "Not selected"}</StatusBadge>
          <small>{props.selectedModel ? "Selected" : "Refresh models, then select and save an image model first."}</small>
        </div>
        <div className="capability-card">
          <strong>Endpoint strategy</strong>
          <StatusBadge tone="info">/v1/images/generations</StatusBadge>
          <small>Requests: 1</small>
        </div>
        <div className="capability-card">
          <strong>Certification status</strong>
          <StatusBadge tone={certificationTone(displayedStatus)}>{displayedStatus}</StatusBadge>
          <small>{props.certification.message}</small>
        </div>
        <SettingsList items={[
          ["Last tested time", props.certification.record?.testedAt ? formatDate(props.certification.record.testedAt) : "Not tested"],
          ["Result", props.running ? "Testing" : imageCertificationLabel(props.certification.status)],
          ["Model at last test", props.certification.record?.configuredModelId ?? "Not tested"]
        ]} />
        <div className="button-row">
          {props.hasCredential && props.selectedModel && props.configurationSaved && !props.running ? (
            <button className="button primary" type="button" onClick={props.onRun}>Run 1 image certification request</button>
          ) : (
            <DisabledAction reason={!props.hasCredential ? "Save a 9Router credential first." : !props.selectedModel ? "Refresh models, then select an Image model." : !props.configurationSaved ? "Save model configuration before running certification." : "Image certification is already testing."}>Run 1 image certification request</DisabledAction>
          )}
        </div>
      </div>
    </div>
  );
}

function testResultLabel(result: { status: "passed" | "failed"; skipped?: boolean; errorCategory?: string }): string {
  if (result.skipped) return `Skipped (${result.errorCategory ?? "unknown_error"})`;
  if (result.status === "passed") return "Passed";
  return `Failed (${result.errorCategory ?? "unknown_error"})`;
}

function modelCertificationTone(status: TextModelCertificationStatus): "default" | "success" | "warning" | "danger" | "info" {
  if (status === "verified") return "success";
  if (status === "failed") return "danger";
  if (status === "testing") return "info";
  return "warning";
}

function isRetryableCertificationError(errorCategory: string | undefined): boolean {
  return errorCategory === "timeout" || errorCategory === "network_error";
}

function VoiceScreen(props: { project: FactoryProject; localTtsSettings: LocalTtsSettings | null; onRefresh: () => Promise<void>; setSelectedProject: (project: FactoryProject | null) => void; setRoute: (route: RouteId) => void }) {
  const [artifacts, setArtifacts] = useState<VoiceGenerationArtifact[]>([]);
  const [subtitleArtifacts, setSubtitleArtifacts] = useState<SubtitlePreparationArtifact[]>([]);
  const [ttsJob, setTtsJob] = useState<TtsJob | null>(null);
  const [voiceCatalog, setVoiceCatalog] = useState<TtsProviderCatalog>({ providers: [], voices: [] });
  const [voiceCatalogMessage, setVoiceCatalogMessage] = useState("");
  const [loadingVoiceCatalog, setLoadingVoiceCatalog] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const settingsAvailable = props.localTtsSettings?.available ?? false;
  const projectLanguage = ttsLanguageCode(props.project.setup.language || props.project.targetLanguage);
  const configuredProvider = props.localTtsSettings?.voiceMode === "integrated-voices"
    ? props.localTtsSettings.ttsProvider ?? "edge-tts"
    : "omnivoice-local";
  const matchingVoices = voiceCatalog.voices.filter((voice) => voice.enabled && !voice.experimental && voice.provider === configuredProvider && ttsLanguageCode(voice.language) === projectLanguage);
  const configuredVoiceId = props.localTtsSettings?.ttsVoiceId;
  const savedVoiceId = [props.project.setup.voiceId, configuredVoiceId]
    .find((voiceId): voiceId is string => Boolean(voiceId && ttsLanguageCode(voiceId) === projectLanguage));
  const configuredVoiceMatchesLanguage = configuredProvider !== "omnivoice-local"
    && Boolean(savedVoiceId);
  const catalogAvailable = configuredProvider !== "omnivoice-local"
    && (matchingVoices.length > 0 || configuredVoiceMatchesLanguage);
  const available = settingsAvailable || catalogAvailable;
  const voiceOptions = configuredProvider === "omnivoice-local"
      ? [{ id: "omnivoice-local", label: "Configured OmniVoice voice", gender: "unknown" }]
      : matchingVoices.length
        ? matchingVoices.map((voice) => ({ id: voice.providerVoiceId, label: `${voice.label} (${voice.provider})`, gender: voice.gender }))
        : configuredVoiceMatchesLanguage && savedVoiceId
          ? [{ id: savedVoiceId, label: `Saved project voice (${savedVoiceId})`, gender: "unknown" as const }]
          : [];
  const eligibility = resolveStageEligibilities(props.project, { localAudioAvailable: available }).find((stage) => stage.stageId === "voice-generation")!;
  const subtitleEligibility = resolveStageEligibilities(props.project).find((stage) => stage.stageId === "subtitle-preparation")!;
  const retryableStatuses = ["approved", "needs_review", "failed", "needs_attention", "rejected", "stale"] as const;
  const hasUnmetWorkflowDependency = eligibility.blockingReasons.some((reason) => reason.code.startsWith("DEPENDENCY_") || reason.code === "REFERENCE_SET_NOT_APPROVED");
  const canGenerate = Boolean(available && selectedVoiceId && !hasUnmetWorkflowDependency && (eligibility.runnable || retryableStatuses.includes(eligibility.status as typeof retryableStatuses[number])));

  useEffect(() => {
    setSelectedVoiceId("");
    setVoiceCatalogMessage("");
    if (configuredProvider === "omnivoice-local") {
      setVoiceCatalog({ providers: [], voices: [] });
      setSelectedVoiceId("omnivoice-local");
      return;
    }
    let cancelled = false;
    setLoadingVoiceCatalog(true);
    void factoryClient.listTtsProviders({ language: projectLanguage, refresh: true })
      .then((catalog) => {
        if (cancelled) return;
        setVoiceCatalog(catalog);
        const matchingVoiceIds = catalog.voices
          .filter((voice) => voice.enabled && !voice.experimental && voice.provider === configuredProvider && ttsLanguageCode(voice.language) === projectLanguage)
          .map((voice) => voice.providerVoiceId);
        setSelectedVoiceId((current) => {
          if (current && matchingVoiceIds.includes(current)) return current;
          const projectVoiceId = props.project.setup.voiceId;
          if (projectVoiceId && matchingVoiceIds.includes(projectVoiceId)) return projectVoiceId;
          return matchingVoiceIds[0] ?? savedVoiceId ?? "";
        });
        const provider = catalog.providers.find((item) => item.id === configuredProvider);
        const hasMatchingVoice = matchingVoiceIds.length > 0 || configuredVoiceMatchesLanguage;
        setVoiceCatalogMessage(provider?.health === "unavailable" && !hasMatchingVoice ? provider.message : "");
      })
      .catch((error) => {
        if (!cancelled) setVoiceCatalogMessage(safeRendererError(error, "Voice catalog could not be loaded."));
      })
      .finally(() => { if (!cancelled) setLoadingVoiceCatalog(false); });
    return () => { cancelled = true; };
  }, [configuredProvider, projectLanguage, props.project.id, savedVoiceId]);

  const refresh = async () => {
    const [voice, subtitles, job] = await Promise.all([
      factoryClient.listVoiceGenerationArtifacts({ projectId: props.project.id }),
      factoryClient.listSubtitlePreparationArtifacts({ projectId: props.project.id }),
      factoryClient.getProjectTtsJob({ projectId: props.project.id })
    ]);
    setArtifacts(voice);
    setSubtitleArtifacts(subtitles);
    setTtsJob(job);
  };

  useEffect(() => { void refresh().catch(() => { setArtifacts([]); setTtsJob(null); }); }, [props.project.id]);
  useEffect(() => {
    if (!ttsJob || !["queued", "running"].includes(ttsJob.state)) return;
    const timer = window.setInterval(() => { void refresh().catch(() => undefined); }, 1200);
    return () => window.clearInterval(timer);
  }, [props.project.id, ttsJob?.id, ttsJob?.state]);
  useEffect(() => {
    if (!ttsJob || ["queued", "running"].includes(ttsJob.state)) return;
    if (ttsJob.state === "success") {
      setMessage(props.project.setup.workflowMode === "semi_automatic"
        ? "Voice generated successfully. Continuing production."
        : "Voice generated successfully. Review the voice segments to continue.");
    } else if (ttsJob.state === "failed") {
      setMessage(ttsJob.errorMessage ?? "Voice generation failed. Retry the failed segment.");
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        await refresh();
        const project = await factoryClient.loadProject(props.project.id);
        if (project) {
          props.setSelectedProject(project);
          if (project.setup.workflowMode === "semi_automatic" && project.stages.find((stage) => stage.id === "voice-generation")?.status === "approved") props.setRoute("timeline");
        }
        await props.onRefresh();
      })().catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [props.project.id, ttsJob?.id, ttsJob?.state]);

  async function perform(action: () => Promise<FactoryProject>, success: string) {
    setGenerating(true);
    try {
      const project = await action();
      props.setSelectedProject(project);
      await refresh();
      await props.onRefresh();
      setMessage(success);
    } catch (error) {
      setMessage(safeRendererError(error, "Voice action failed. Check the job details below and retry."));
    } finally {
      setGenerating(false);
    }
  }

  async function retrySegment(segmentId: string) {
    if (!ttsJob) return;
    setGenerating(true);
    try {
      const job = await factoryClient.retryTtsJobSegment({ jobId: ttsJob.id, segmentId });
      setTtsJob(job);
      await refresh();
      setMessage(`Retry started for ${segmentId}.`);
    } catch (error) {
      setMessage(safeRendererError(error, "The failed voice segment could not be retried."));
    } finally {
      setGenerating(false);
    }
  }

  async function cancelJob() {
    if (!ttsJob) return;
    setGenerating(true);
    try {
      setTtsJob(await factoryClient.cancelTtsJob({ jobId: ttsJob.id }));
      setMessage("Voice job cancelled.");
    } catch (error) {
      setMessage(safeRendererError(error, "The voice job could not be cancelled."));
    } finally {
      setGenerating(false);
    }
  }

  const completedSegments = ttsJob?.segments.filter((segment) => segment.state === "success").length ?? 0;
  return (
    <>
      <PageHeader title="Voice" description="Choose the voice for this project before generating narration. Voices are filtered to the project's language." />
      <StageStatusHeader stageName="Voice Generation" stageNumber={20} eligibility={eligibility} dependencies={["Approved Script", "Approved Asset Review", "Available TTS provider"]} purpose="Generate timestamped, FFprobe-validated voice segments and a merged voiceover track before review." />
      <SectionCard title="Choose voice for this project">
        <div className="form-grid">
          <FormField label="Project language" htmlFor="project-language"><input id="project-language" value={props.project.setup.language || props.project.targetLanguage} disabled readOnly /></FormField>
          <FormField label="Voice" htmlFor="project-voice" hint="Only voices matching this project's language are shown.">
            <select id="project-voice" value={selectedVoiceId} onChange={(event) => setSelectedVoiceId(event.target.value)} disabled={loadingVoiceCatalog || !available}>
              <option value="">{loadingVoiceCatalog ? "Loading matching voices..." : "Select a voice"}</option>
              {voiceOptions.map((voice) => <option key={voice.id} value={voice.id}>{voice.label} - {voice.gender}</option>)}
            </select>
          </FormField>
          {!available ? <p className="error-message">No usable voice provider is available for this project.</p> : null}
          {voiceCatalogMessage ? <p className="safe-message">{voiceCatalogMessage}</p> : null}
          <div className="button-row">
            {canGenerate && ["approved", "needs_review"].includes(eligibility.status) ? <button className="button primary" type="button" onClick={() => void perform(() => factoryClient.runVoiceGeneration({ projectId: props.project.id, voiceId: selectedVoiceId, force: true }), "Voice job queued. Progress is shown below.")} disabled={generating || ttsJob?.state === "running" || ttsJob?.state === "queued"}>{generating ? "Starting..." : "Generate voice"}</button> : canGenerate ? <button className="button primary" type="button" onClick={() => void perform(() => factoryClient.runVoiceGeneration({ projectId: props.project.id, voiceId: selectedVoiceId }), "Voice job queued. Progress is shown below.")} disabled={generating || ttsJob?.state === "running" || ttsJob?.state === "queued"}>{generating ? "Starting..." : "Generate voice"}</button> : <DisabledAction reason={!selectedVoiceId ? "Select a voice for this project first." : eligibility.blockingReasons[0]?.message ?? "Approve Script and Asset Review before generating voice."}>Generate voice</DisabledAction>}
          </div>
          {ttsJob ? <div className="settings-list">
            <p><strong>Job</strong>: {ttsJob.state} ({completedSegments}/{ttsJob.segments.length} segments), requested provider: {ttsJob.provider}</p>
            {ttsJob.mergedRelativeFilePath ? <p><strong>Merged voiceover</strong>: {ttsJob.mergedRelativeFilePath}</p> : null}
            {ttsJob.errorMessage ? <p className="error-message">{ttsJob.errorMessage}</p> : null}
            {ttsJob.segments.map((segment) => <p key={segment.segmentId}><strong>{segment.segmentId}</strong>: {segment.state}, actual provider {segment.actualProvider ?? "pending"}, attempts {segment.attemptCount}{segment.fallbackUsed ? " (explicit fallback used)" : ""}{segment.timingOverflowSeconds > 0 ? `, timing overflow ${segment.timingOverflowSeconds.toFixed(2)}s` : ""}{segment.errorMessage ? ` - ${segment.errorMessage}` : ""}{segment.state === "failed" ? <button className="button compact" type="button" disabled={generating} onClick={() => void retrySegment(segment.segmentId)}>Retry segment</button> : null}</p>)}
            {["queued", "running"].includes(ttsJob.state) ? <button className="button compact" type="button" disabled={generating} onClick={() => void cancelJob()}>Cancel job</button> : null}
          </div> : null}
            {artifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : artifact.status === "rejected" ? "danger" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge><p>Requested provider: {artifact.payloadJson.requestedProvider ?? "legacy artifact"}</p>{artifact.payloadJson.mergedRelativeFilePath ? <p>Merged voiceover: {artifact.payloadJson.mergedRelativeFilePath}</p> : null}{artifact.payloadJson.timingWarnings?.map((warning) => <p className="safe-message" key={warning}>{warning}</p>)}{artifact.payloadJson.segments.map((segment) => <p key={segment.scriptSectionId}><strong>{segment.scriptSectionId}</strong>: {segment.actualProvider ?? "unknown"}, {segment.durationSeconds.toFixed(2)}s, SHA-256 {segment.sha256.slice(0, 12)}...</p>)}{artifact.status === "needs_review" ? <div className="button-row"><button className="button compact" type="button" disabled={generating || !eligibility.approvable} onClick={() => void perform(() => factoryClient.approveVoiceGeneration({ projectId: props.project.id }), "Voice Generation approved.")}>Approve voice segments</button><button className="button danger compact" type="button" disabled={generating} onClick={() => void perform(() => factoryClient.rejectVoiceGeneration({ projectId: props.project.id }), "Voice Generation rejected.")}>Reject voice segments</button></div> : null}</div>)}
          {message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}
        </div>
      </SectionCard>
      <SectionCard title="Background and original audio"><p>Unavailable: this workflow has no approved audio source. The timeline contains narration only and does not synthesize placeholder BGM.</p></SectionCard>
      <StageStatusHeader stageName="Subtitle Preparation" stageNumber={21} eligibility={subtitleEligibility} dependencies={["Approved Script", "Approved Voice Generation"]} purpose="Derive frame-based cues from the timestamped narration without changing script wording." />
      <SectionCard title="Subtitle review">{subtitleEligibility.runnable ? <button className="button primary" type="button" disabled={generating} onClick={() => void perform(() => factoryClient.runSubtitlePreparation({ projectId: props.project.id }), "Subtitle cues are ready for review.")}>Prepare subtitles</button> : <DisabledAction reason={subtitleEligibility.blockingReasons[0]?.message ?? "Approve Voice Generation before preparing subtitles."}>Prepare subtitles</DisabledAction>}{subtitleArtifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : artifact.status === "rejected" ? "danger" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge><p>{artifact.payloadJson.cues.length} cues at {artifact.payloadJson.fps} fps</p>{artifact.payloadJson.cues.slice(0, 5).map((cue) => <p key={cue.id}>{cue.startFrame}: {cue.text}</p>)}{artifact.status === "needs_review" ? <div className="button-row"><button className="button compact" type="button" disabled={generating || !subtitleEligibility.approvable} onClick={() => void perform(() => factoryClient.approveSubtitlePreparation({ projectId: props.project.id }), "Subtitle Preparation approved.")}>Approve subtitles</button><button className="button danger compact" type="button" disabled={generating} onClick={() => void perform(() => factoryClient.rejectSubtitlePreparation({ projectId: props.project.id }), "Subtitle Preparation rejected.")}>Reject subtitles</button></div> : null}</div>)}</SectionCard>
    </>
  );
}

function SettingsScreen(props: {
  bootstrap: BootstrapData;
  setRoute: (route: RouteId) => void;
}) {
  const runtime = props.bootstrap.runtime;
  return (
    <>
      <PageHeader title="Settings" description="Dark-only local workspace settings. Most backend settings are read-only until persistence endpoints exist." />
      <div className="settings-grid">
        <SectionCard title="General"><SettingsList items={[["Mode", "Local desktop"], ["Project persistence", "SQLite"], ["Cloud sync", "Unavailable"]]} /></SectionCard>
        <SectionCard title="Workspace">
          <SettingsList items={[["Workspace location", props.bootstrap.workspaceRoot], ["Database location", props.bootstrap.databasePath], ["Asset location", "Not configured"], ["Logs location", "Not configured"]]} />
          <DisabledAction reason="Open-folder IPC is not implemented.">Open folder</DisabledAction>
        </SectionCard>
        <SectionCard title="Appearance"><SettingsList items={[["Theme", "Dark only"], ["Density", "Comfortable"], ["Sidebar", "Expanded / collapsed"]]} /></SectionCard>
        <SectionCard title="Generation"><SettingsList items={[["Approval policy", "Guided"], ["Paid generation", "Explicit stage runs only; never automatic"], ["Provider concurrency", "Five-worker queue exists; provider-specific setting unavailable"]]} /></SectionCard>
        <SectionCard title="Advanced workflow" description="The stage-by-stage guided experience is hidden from the default navigation but remains available for debugging and recovery.">
          <button className="button secondary" type="button" onClick={() => props.setRoute("new-project")}>Open Advanced Guided Wizard</button>
        </SectionCard>
        <SectionCard title="CapCut"><SettingsList items={[
          ["Installation status", runtime.capcutInstalled ? "Detected" : "Unavailable"],
          ["Version", "Not verified"],
          ["Install path", runtime.capcutInstallPath],
          ["Draft directory", runtime.capcutDraftDir],
          ["Python status", runtime.pythonExists ? runtime.pythonVersion : "Needs setup"],
          ["Python path", runtime.sidecarPythonPath],
          ["pycapcut status", runtime.pycapcutStatus],
          ["Compatibility status", runtime.capcutCompatibility]
        ]} /></SectionCard>
        <SectionCard title="FFmpeg"><SettingsList items={[["Status", runtime.ffmpegAvailable ? "Detected" : "Needs setup"], ["Path", runtime.ffmpegPath], ["Version", runtime.ffmpegStatus], ["Preview IPC", runtime.ffmpegAvailable ? "Ready for explicit approved-media renders" : "Blocked until FFmpeg is configured"], ["Competitor video processing", runtime.ffmpegAvailable ? "Ready for future downloader/transcriber wiring" : "Blocked until FFmpeg is configured"]]} /></SectionCard>
        <SectionCard title="Security"><SettingsList items={[["Credential storage", "OS keychain reference"], ["Renderer API keys", "Write-only input"], ["Log redaction", "Enabled"], ["Generic filesystem IPC", "Unavailable"]]} /></SectionCard>
        <SectionCard title="Diagnostics"><SettingsList items={[["CodeGraph", "Development index only"], ["Queue snapshot", `${props.bootstrap.queue.jobs.length} jobs`], ["Project count", `${props.bootstrap.projects.length}`]]} /></SectionCard>
      </div>
    </>
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

function SettingsList(props: { items: Array<[string, string]> }) {
  return (
    <dl className="settings-list">
      {props.items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function isValidProviderBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function modelListTone(status: ModelListStatus): "default" | "success" | "warning" | "danger" | "info" {
  if (status === "models_discovered" || status === "empty_model_list") return "success";
  if (status === "testing") return "info";
  if (status === "not_tested") return "warning";
  return "danger";
}

function DiagnosticsScreen(props: { bootstrap: BootstrapData; presence: ProviderPresence }) {
  const diagnostics = {
    workspaceRoot: props.bootstrap.workspaceRoot,
    databasePath: props.bootstrap.databasePath,
    projectCount: props.bootstrap.projects.length,
    queueJobs: props.bootstrap.queue.jobs.length,
    providerStatus: props.presence.hasCredential ? "credential_saved" : "not_configured"
  };
  return (
    <>
      <PageHeader title="Diagnostics" description="Redacted local state for troubleshooting." />
      <SectionCard>
        <pre className="diagnostics">{JSON.stringify(diagnostics, null, 2)}</pre>
      </SectionCard>
    </>
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
