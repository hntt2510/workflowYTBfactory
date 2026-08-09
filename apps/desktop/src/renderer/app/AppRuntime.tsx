import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import type { FactoryProject } from "@lsf/domain";
import { resolveWorkflowProgress, seedChannelProfiles } from "@lsf/domain";
import { SectionCard } from "../components/ui";
import { AppShell, LoadingScreen } from "../layouts/AppShell";
import { canonicalRoute, routeForStage, routeFromHash } from "../routes/routeAdapter";
import { RouteScreen } from "../routes/RouteScreen";
import { factoryClient, isBrowserPreview } from "../services/factoryClient";
import type {
  BootstrapData,
  ActionRunView,
  ImageModelCertificationResponse,
  LocalTtsSettings,
  ProviderCredentialSettings,
  ProviderPresence,
  TextModelCertificationResponse
} from "../types";
import { hasSemiAutomaticAttention, nextSemiAutomaticChain, type SemiAutomaticChain, type SemiAutomaticProgress } from "../semiAutomaticWorkflow";
import { safeRendererError } from "../utils";
import type { RouteId } from "../navigation";

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

export function AppRuntime() {
  const [route, setRoute] = useState<RouteId>(() => routeFromHash());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [bootstrap, setBootstrap] = useState<BootstrapData>(fallbackBootstrap);
  const [selectedProject, setSelectedProject] = useState<FactoryProject | null>(null);
  const [actionRuns, setActionRuns] = useState<ActionRunView[]>([]);
  const [providerPresence, setProviderPresence] = useState<ProviderPresence>({ providerId: "cockpit", hasCredential: false });
  const [stockPresence, setStockPresence] = useState<ProviderPresence>({ providerId: "pexels", hasCredential: false });
  const [providerSettings, setProviderSettings] = useState<ProviderCredentialSettings | null>(null);
  const [textCertification, setTextCertification] = useState<TextModelCertificationResponse>({ status: "not_tested", message: "Text capability has not been verified." });
  const [imageCertification, setImageCertification] = useState<ImageModelCertificationResponse>({ status: "not_tested", message: "Image model has not been certified." });
  const [localTtsSettings, setLocalTtsSettings] = useState<LocalTtsSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [semiAutomaticProgress, setSemiAutomaticProgress] = useState<SemiAutomaticProgress | null>(null);
  const [semiAutomaticError, setSemiAutomaticError] = useState<string | null>(null);
  const [semiAutomaticRunning, setSemiAutomaticRunning] = useState(false);
  const semiAutomaticRunLock = useRef(false);

  async function refresh() {
    const data = await factoryClient.bootstrap();
    setBootstrap(data);
    setLocalTtsSettings(await factoryClient.loadLocalTtsSettings());
    const settings = await factoryClient.loadProviderCredentialSettings("cockpit");
    setProviderSettings(settings);
    setProviderPresence({ providerId: settings.providerId, hasCredential: settings.hasCredential });
    setTextCertification(await factoryClient.loadTextProviderCapability());
    setStockPresence(await factoryClient.hasProviderCredential("pexels"));
    if (selectedProject) setSelectedProject(await factoryClient.loadProject(selectedProject.id));
  }

  useEffect(() => {
    void refresh().catch((reason) => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const refreshRuns = () => void factoryClient.listActiveActionRuns().then(setActionRuns).catch(() => setActionRuns([]));
    refreshRuns();
    const timer = window.setInterval(refreshRuns, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const nextHash = `#${route}`;
    if (window.location.hash !== nextHash) window.history.replaceState(null, "", nextHash);
  }, [route]);

  function navigate(nextRoute: RouteId): void {
    setRoute(canonicalRoute(nextRoute));
  }

  async function openProject(projectId: string) {
    setSemiAutomaticError(null);
    setSemiAutomaticProgress(null);
    const project = await factoryClient.loadProject(projectId);
    setSelectedProject(project);
    if (!project) {
      navigate("projects");
      return;
    }
    navigate("project-overview");
  }

  async function deleteProject(projectId: string) {
    if (!window.confirm("Delete this project from SQLite? Workspace files are not removed.")) return;
    await factoryClient.deleteProject(projectId);
    if (selectedProject?.id === projectId) setSelectedProject(null);
    await refresh();
  }

  async function createDemoProject(input: Parameters<typeof factoryClient.fixtureProject>[0]) {
    setSemiAutomaticError(null);
    setSemiAutomaticProgress(null);
    const project = await factoryClient.fixtureProject(input);
    setSelectedProject(project);
    await refresh();
    navigate("project-overview");
  }

  async function startSemiAutomatic(chain: SemiAutomaticChain, project: FactoryProject): Promise<void> {
    if (project.setup.workflowContract !== "legacy" || project.setup.workflowMode !== "semi_automatic" || semiAutomaticRunning || semiAutomaticRunLock.current) return;
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
      if (chain === "reference" && result.setup.inputMode === "existing_script") result = await factoryClient.continueAfterIdeaSelection({ projectId: project.id, ideaId: "existing-script" });
      const pausedForVoice = chain === "assets" && result.stages.find((stage) => stage.id === "voice-generation")?.status !== "approved";
      setSemiAutomaticProgress({ chain, completed: 1, total: 1, stageId: pausedForVoice ? "voice-generation" : "production-orchestrator", message: pausedForVoice ? "Scene assets are ready. Choose a voice for this project before generating audio." : "Production orchestration completed this phase." });
      setSelectedProject(result);
      navigate(routeForStage(pausedForVoice ? "voice-generation" : resolveWorkflowProgress(result).currentStageId));
    } catch (reason) {
      setSemiAutomaticError(safeRendererError(reason, "Production could not continue. Open Advanced Pipeline Details and retry the affected phase."));
      const persisted = await factoryClient.loadProject(project.id).catch(() => null);
      if (persisted) {
        setSelectedProject(persisted);
        navigate(routeForStage(resolveWorkflowProgress(persisted).currentStageId));
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
    <AppShell collapsed={sidebarCollapsed} onToggleSidebar={() => setSidebarCollapsed((value) => !value)} route={route} selectedProject={selectedProject} selectedProfile={selectedProfile} projects={projectSummaries} queue={bootstrap.queue} actionRuns={actionRuns} onOpenProject={openProject} setRoute={navigate}>
      {isBrowserPreview ? <SectionCard><div className="warning-state"><strong>Browser Preview — cấu hình provider bảo mật yêu cầu Electron.</strong><p>API key, lưu credential và Test connection không hoạt động trong browser preview.</p></div></SectionCard> : null}
      {error ? <SectionCard><div className="error-state"><strong>Application bootstrap failed</strong><p>{error}</p></div></SectionCard> : null}
      {loading ? <LoadingScreen /> : null}
      {!loading ? <RouteErrorBoundary route={route} setRoute={navigate}><RouteScreen route={route} setRoute={navigate} bootstrap={bootstrap} providerPresence={providerPresence} stockPresence={stockPresence} providerSettings={providerSettings} textCertification={textCertification} imageCertification={imageCertification} localTtsSettings={localTtsSettings} selectedProject={selectedProject} selectedProfile={selectedProfile} profiles={profiles} projectSummaries={projectSummaries} onOpenProject={openProject} onDeleteProject={deleteProject} onCreateProject={createDemoProject} onRefresh={refresh} setSelectedProject={setSelectedProject} setProviderPresence={setProviderPresence} setStockPresence={setStockPresence} setProviderSettings={setProviderSettings} setTextCertification={setTextCertification} setImageCertification={setImageCertification} startSemiAutomatic={startSemiAutomatic} semiAutomaticProgress={semiAutomaticProgress} semiAutomaticRunning={semiAutomaticRunning} semiAutomaticError={semiAutomaticError} /></RouteErrorBoundary> : null}
    </AppShell>
  );
}

class RouteErrorBoundary extends Component<{ route: RouteId; setRoute: (route: RouteId) => void; children: ReactNode }, { hasError: boolean }> {
  static getDerivedStateFromError(): { hasError: boolean } { return { hasError: true }; }
  state: { hasError: boolean } = { hasError: false };
  componentDidUpdate(previous: Readonly<{ route: RouteId }>) { if (previous.route !== this.props.route && this.state.hasError) this.setState({ hasError: false }); }
  render() {
    if (this.state.hasError) return <SectionCard><div className="error-state"><strong>Màn hình chưa khả dụng</strong><p>Tuyến {this.props.route} không thể hiển thị dữ liệu của dự án hiện tại. Hãy chọn một tuyến khác hoặc mở lại dự án.</p><button className="button secondary" type="button" onClick={() => this.props.setRoute("project-overview")}>Về tổng quan dự án</button></div></SectionCard>;
    return this.props.children;
  }
}
