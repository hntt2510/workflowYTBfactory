import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import type { ChannelProfile, ChannelRouteDecision, FactoryProject, StageEligibility, WorkflowStageStatus } from "@lsf/domain";
import { resolveStageEligibilities, seedChannelProfiles, workflowStageDefinitions } from "@lsf/domain";
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
  ResearchSourcesArtifact,
  ClaimMapArtifact,
  OutlineArtifact,
  ScriptArtifact,
  FactReviewArtifact,
  RetentionReviewArtifact,
  ScenePlanArtifact,
  ShotPlanArtifact,
  VisualRoutingArtifact,
  TranscriptCleaningArtifact,
  ReferenceSegmentationArtifact,
  CompetitorDnaArtifact,
  OpportunityMapArtifact
} from "./types";
import { currentStage, estimatedDuration, formatDate, formatTimecode, projectProgress, queueCounts, stageTone } from "./utils";
import { AppShell, LoadingScreen } from "./layouts/AppShell";
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
    capcutCompatibility: "Loading"
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

const workflowModeOptions: Array<{ value: "guided" | "semi_automatic" | "full_automatic"; label: string; detail: string }> = [
  { value: "guided", label: "Guided", detail: "Approval required at every stage." },
  { value: "semi_automatic", label: "Semi-automatic", detail: "Automatic drafts; paid/media actions require approval." },
  { value: "full_automatic", label: "Full automatic", detail: "Uses configured providers and approval policy." }
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
  const [localTtsSettings, setLocalTtsSettings] = useState<LocalTtsSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const data = await factoryClient.bootstrap();
    setBootstrap(data);
    setLocalTtsSettings(await factoryClient.loadLocalTtsSettings());
    const settings = await factoryClient.loadProviderCredentialSettings("9router");
    setProviderSettings(settings);
    setProviderPresence({ providerId: settings.providerId, hasCredential: settings.hasCredential });
    setTextCertification(await factoryClient.load9RouterTextCertification());
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

  async function openProject(projectId: string) {
    const project = await factoryClient.loadProject(projectId);
    setSelectedProject(project);
    setRoute(project ? "project-overview" : "projects");
  }

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
    targetDuration?: string;
    projectName?: string;
    workflowMode?: "guided" | "semi_automatic" | "full_automatic";
    competitorReference?: {
      sourceUrl?: string;
      pastedTranscript: string;
      notes?: string;
    };
  }) {
    const project = await factoryClient.fixtureProject(input);
    setSelectedProject(project);
    await refresh();
    setRoute("project-overview");
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
      setRoute={setRoute}
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
          setRoute={setRoute}
          bootstrap={bootstrap}
          providerPresence={providerPresence}
          stockPresence={stockPresence}
          providerSettings={providerSettings}
          textCertification={textCertification}
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
          setLocalTtsSettings={setLocalTtsSettings}
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
    targetDuration?: string;
    projectName?: string;
    workflowMode?: "guided" | "semi_automatic" | "full_automatic";
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
  setLocalTtsSettings: (settings: LocalTtsSettings | null) => void;
}) {
  if (props.route === "dashboard") return <Dashboard {...props} />;
  if (props.route === "projects") return <ProjectsScreen {...props} />;
  if (props.route === "new-project") return <NewProjectWizard {...props} />;
  if (props.route === "channel-profiles") return <ChannelProfilesScreen profiles={props.profiles} />;
  if (props.route === "production-queue") return <QueueScreen queue={props.bootstrap.queue} selectedProject={props.selectedProject} onRunDemo={props.onRefresh} />;
  if (props.route === "asset-library") return <AssetLibraryScreen selectedProject={props.selectedProject} />;
  if (props.route === "providers") return <ProvidersScreen presence={props.providerPresence} stockPresence={props.stockPresence} settings={props.providerSettings} textCertification={props.textCertification} setTextCertification={props.setTextCertification} setPresence={props.setProviderPresence} setStockPresence={props.setStockPresence} setSettings={props.setProviderSettings} onRefresh={props.onRefresh} />;
  if (props.route === "settings") return <SettingsScreen bootstrap={props.bootstrap} localTtsSettings={props.localTtsSettings} setLocalTtsSettings={props.setLocalTtsSettings} />;
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
  if (props.route === "project-overview") return <ProjectOverview {...props} selectedProject={props.selectedProject} />;
  if (props.route === "reference-intake") return <ReferenceIntakeScreen project={props.selectedProject} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} />;
  if (props.route === "competitor-dna") return <CompetitorDnaScreen project={props.selectedProject} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} textCertification={props.textCertification} />;
  if (props.route === "idea-lab") return <IdeaLabScreen project={props.selectedProject} setSelectedProject={props.setSelectedProject} textCertification={props.textCertification} />;
  if (props.route === "research-claims") return <ClaimsScreen project={props.selectedProject} setSelectedProject={props.setSelectedProject} textCertification={props.textCertification} />;
  if (props.route === "script") return <ScriptScreen project={props.selectedProject} selectedProfile={props.selectedProfile} setSelectedProject={props.setSelectedProject} textCertification={props.textCertification} />;
  if (props.route === "scenes") return <ScenesScreen project={props.selectedProject} setSelectedProject={props.setSelectedProject} textCertification={props.textCertification} />;
  if (props.route === "shots") return <ShotsScreen project={props.selectedProject} setSelectedProject={props.setSelectedProject} textCertification={props.textCertification} />;
  if (props.route === "visuals") return <VisualsScreen project={props.selectedProject} setSelectedProject={props.setSelectedProject} />;
  if (props.route === "voice") return <VoiceScreen project={props.selectedProject} localTtsSettings={props.localTtsSettings} onRefresh={props.onRefresh} />;
  if (props.route === "timeline") return <TimelineScreen project={props.selectedProject} />;
  if (props.route === "qa") return <UnavailableWorkflow title="QA" reason="The QA engine is missing; no fake AI QA findings are generated." />;
  return <UnavailableWorkflow title="Export" reason="CapCut export remains manifest-only and disconnected; editable draft generation is unavailable." />;
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
            <button className="button primary" type="button" onClick={() => props.setRoute("new-project")}>
              <Plus size={16} /> New Project
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
        actions={<button className="button primary" type="button" onClick={() => props.setRoute("new-project")}><Plus size={16} /> New Project</button>}
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

function NewProjectWizard(props: {
  profiles: ChannelProfile[]; 
  providerPresence: ProviderPresence;
  stockPresence: ProviderPresence;
  providerSettings: ProviderCredentialSettings | null;
  bootstrap: BootstrapData;
  localTtsSettings: LocalTtsSettings | null;
  setRoute: (route: RouteId) => void;
  onCreateProject: (input: {
    topic: string;
    format: "long" | "short";
    targetLanguage: string;
    targetDuration?: string;
    projectName?: string;
    workflowMode?: "guided" | "semi_automatic" | "full_automatic";
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
  const [workflowMode, setWorkflowMode] = useState<"guided" | "semi_automatic" | "full_automatic">("guided");
  const [competitorUrl, setCompetitorUrl] = useState("");
  const [competitorScript, setCompetitorScript] = useState("");
  const [competitorNotes, setCompetitorNotes] = useState("");
  const [message, setMessage] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [decision, setDecision] = useState<ChannelRouteDecision | null>(null);
  const [saving, setSaving] = useState(false);
  const routedProfile = props.profiles.find((profile) => profile.id === (selectedProfileId || decision?.selectedProfileId));
  const targetLanguage = languageChoice === "Custom" ? customLanguage.trim() : languageChoice;
  const effectiveTargetDuration = targetDuration.trim() || defaultTargetDuration(format);
  const setupChecks = [
    { label: "9Router API key", ready: props.providerPresence.hasCredential, action: "providers" as RouteId, help: "Save 9Router credential before creating projects that need AI analysis or image routing." },
    { label: "OmniVoice TTS", ready: Boolean(props.localTtsSettings?.available), action: "settings" as RouteId, help: "Configure OmniVoice executable in Settings so voice generation can run locally." },
    { label: "FFmpeg", ready: props.bootstrap.runtime.ffmpegAvailable, action: "settings" as RouteId, help: "Set FFMPEG_PATH or add ffmpeg to PATH before competitor video/preview processing." },
    { label: "Pexels stock", ready: props.stockPresence.hasCredential, action: "providers" as RouteId, help: "Save a Pexels API key for stock image/video lookup." }
  ];
  const setupReady = setupChecks.every((check) => check.ready);

  async function routeTopic() {
    setMessage("");
    if (!setupReady) {
      setMessage("Setup is incomplete. Finish the required config checklist before creating or routing a new project.");
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
      setMessage("Setup is incomplete. Finish 9Router, OmniVoice, and FFmpeg first.");
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
      await props.onCreateProject({
        topic,
        projectName: projectName.trim() || topic,
        format,
        targetLanguage: targetLanguage.trim() || "English",
        targetDuration: effectiveTargetDuration,
        workflowMode,
        ...(competitorReference ? { competitorReference } : {})
      });
    } catch (error) {
      setMessage(`Project create failed: ${error instanceof Error ? error.message : String(error)}`);
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
              <FormField label="Competitor video URL" htmlFor="competitor-url" hint="Paste the source link for traceability. FFmpeg/download handling is enabled only after FFmpeg is detected.">
                <input id="competitor-url" value={competitorUrl} onChange={(event) => setCompetitorUrl(event.target.value)} placeholder="https://..." />
              </FormField>
              <FormField label="Competitor script / analysis" htmlFor="competitor-script" hint="Paste transcript or the full analysis block. This is saved with the project for later AI analysis.">
                <textarea id="competitor-script" value={competitorScript} onChange={(event) => setCompetitorScript(event.target.value)} placeholder="Paste competitor transcript and notes here" />
              </FormField>
              <FormField label="Competitor notes" htmlFor="competitor-notes">
                <textarea id="competitor-notes" value={competitorNotes} onChange={(event) => setCompetitorNotes(event.target.value)} placeholder="Optional notes, hook observations, or angle constraints" />
              </FormField>
              <button className="button primary" type="button" onClick={() => void routeTopic()} disabled={!targetLanguage.trim()}>
                Route channel profile
              </button>
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
              <p><strong>Competitor references:</strong> {competitorScript.trim() ? "1 pasted reference will be saved" : "None pasted yet"}</p>
              <p><StatusBadge tone="info">Ready</StatusBadge> Project creation saves setup and references only. Later stages must be run and approved one by one.</p>
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
  providerPresence: ProviderPresence;
  textCertification: TextModelCertificationResponse;
}) {
  const project = props.selectedProject;
  const blockedVisuals = !props.providerPresence.hasCredential;
  const eligibilities = resolveStageEligibilities(project, { textVerified: props.textCertification.status === "verified" });
  const nextStage = eligibilities.find((stage) => stage.runnable || stage.reviewable) ?? eligibilities.find((stage) => stage.status === "blocked") ?? eligibilities.at(-1);
  const nextStageRoute = nextStage ? stageRoute(nextStage.stageId) : "project-overview";
  return (
    <>
      <PageHeader
        title={project.setup.projectName}
        description="Project command center backed by persisted SQLite data."
        actions={
          <>
            <button className="button primary" type="button" onClick={() => props.setRoute(nextStageRoute)}>Run next stage</button>
            <button className="button secondary" type="button" onClick={() => props.setRoute("settings")}>Project settings</button>
          </>
        }
      />
      <section className="metric-grid">
        <MetricCard label="Channel profile" value={props.selectedProfile?.name ?? project.profileId} />
        <MetricCard label="Language" value={project.setup.language} />
        <MetricCard label="Target duration" value={project.setup.targetDuration} />
        <MetricCard label="Workflow mode" value={workflowModeOptions.find((option) => option.value === project.setup.workflowMode)?.label ?? project.setup.workflowMode} />
        <MetricCard label="Current stage" value={currentStage(project)} />
        <MetricCard label="Progress" value={`${projectProgress(project)}%`} />
        <MetricCard label="Estimated duration" value={estimatedDuration(project)} />
      </section>
      <SectionCard title="Workflow progress" description={blockedVisuals ? "Visual generation is blocked: no image provider has been configured." : "Open stages one by one. Provider-backed runners still require explicit confirmation inside each stage."}>
        <div className="workflow-list">
          {project.stages.map((stage) => (
            <button className="workflow-stage" key={stage.id} type="button" onClick={() => props.setRoute(stageRoute(stage.name))}>
              <span>{stage.name}</span>
              <StatusBadge tone={stageTone(stage.status)}>{(eligibilities.find((eligibility) => eligibility.stageId === stage.id)?.status ?? stage.status).replaceAll("_", " ")}</StatusBadge>
              <small>Depends on: {stage.dependsOn.join(", ") || "None"}</small>
            </button>
          ))}
        </div>
      </SectionCard>
      <section className="metric-grid">
        <MetricCard label="Ideas" value={project.ideas.length} detail={project.ideas.length ? "Generated" : "Awaiting Idea Lab"} tone={project.ideas.length ? "success" : "warning"} />
        <MetricCard label="Claims" value={project.claims.length} />
        <MetricCard label="Script sections" value={project.scriptSections.length} />
        <MetricCard label="Scenes" value={project.scenes.length} />
        <MetricCard label="Shots" value={project.shots.length} />
        <MetricCard label="Approved assets" value="Not available" detail="Asset assignment missing" tone="warning" />
      </section>
      <SectionCard title="Process guide" description="Use this order to test the production flow without skipping approval gates.">
        <SettingsList items={[
          ["1. Reference Intake", "Paste competitor transcript/link and source notes. Save them to the project."],
          ["2. Competitor DNA", "Run 9Router analysis only after references are saved, then approve/reject the analysis."],
          ["3. Opportunity Map", "Generate opportunities from approved competitor DNA and channel profile."],
          ["4. Idea Lab", "Generate idea candidates, review them, then choose exactly one approved idea."],
          ["5. Script", "Generate outline/script only from the approved idea, then approve before scenes/shots."],
          ["6. Media", "Only after script approval: visual prompts, 9Router images, Pexels stock, evidence image URLs, voice, timeline, preview, CapCut."]
        ]} />
      </SectionCard>
    </>
  );
}

function stageRoute(name: string): RouteId {
  const stage = workflowStageDefinitions.find((definition) => definition.id === name || definition.name === name);
  if (stage) return stage.screenRoute as RouteId;
  if (/channel|profile/i.test(name)) return "channel-profiles";
  if (/reference/i.test(name)) return "reference-intake";
  if (/competitor/i.test(name)) return "competitor-dna";
  if (/opportunity|originality|idea/i.test(name)) return "idea-lab";
  if (/idea/i.test(name)) return "idea-lab";
  if (/claim|research/i.test(name)) return "research-claims";
  if (/script|outline|retention|fact/i.test(name)) return "script";
  if (/scene/i.test(name)) return "scenes";
  if (/shot|visual/i.test(name)) return "shots";
  if (/voice/i.test(name)) return "voice";
  if (/timeline|preview/i.test(name)) return "timeline";
  if (/qa/i.test(name)) return "qa";
  if (/capcut|export|packaging/i.test(name)) return "export";
  return "project-overview";
}

function ChannelProfilesScreen(props: { profiles: ChannelProfile[] }) {
  const [selectedId, setSelectedId] = useState(props.profiles[0]?.id ?? "");
  const selected = props.profiles.find((profile) => profile.id === selectedId) ?? props.profiles[0];
  return (
    <>
      <PageHeader
        title="Channel Profiles"
        description="Seeded channel memory is active for routing. Profile editing persistence is not implemented."
        actions={
          <>
            <DisabledAction reason="Profile create persistence is not implemented.">Create</DisabledAction>
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
          <SectionCard title="Profile editor" description="Read-only until channel profile persistence is implemented.">
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
  return (
    <SectionCard title={props.stageName} description={props.purpose}>
      <div className="metric-grid">
        <MetricCard label="Stage number" value={props.stageNumber} />
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

function ActionableBlockedState(props: { eligibility: StageEligibility; setRoute: (route: RouteId) => void }) {
  if (!props.eligibility.blockingReasons.length) return null;
  return (
    <SectionCard title="Blocked prerequisites">
      <div className="status-grid">
        {props.eligibility.blockingReasons.map((reason) => (
          <div className="status-row" key={`${props.eligibility.stageId}-${reason.code}`}>
            <span>{reason.message}</span>
            <StatusBadge tone="warning">{reason.code.replaceAll("_", " ")}</StatusBadge>
            {reason.actionRoute ? (
              <button className="button compact" type="button" onClick={() => props.setRoute(reason.actionRoute as RouteId)}>Go to required screen</button>
            ) : null}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function ReferenceIntakeScreen(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; setRoute: (route: RouteId) => void }) {
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
      <CompetitorReferenceIntake project={props.project} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} />
    </>
  );
}

function CompetitorReferenceIntake(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; setRoute: (route: RouteId) => void }) {
  const [sourceUrl, setSourceUrl] = useState("");
  const [pastedTranscript, setPastedTranscript] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [duplicateReferenceId, setDuplicateReferenceId] = useState<string | null>(null);
  const [editingReferenceId, setEditingReferenceId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const referenceSetStatus = props.project.referenceSet?.status ?? "not_started";
  const includedCount = props.project.competitorReferences.filter((reference) => reference.included !== false).length;
  const hasValidReferenceSet = referenceSetStatus === "valid";
  const canContinue = referenceSetStatus === "approved";

  async function addReference() {
    setSaving(true);
    setMessage("");
    try {
      if (editingReferenceId) {
        if (props.project.referenceSet?.status === "approved" && !window.confirm("Changing this approved reference will mark downstream stages stale. Continue?")) return;
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
      setMessage(`Competitor reference save failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function replaceDuplicate() {
    if (!duplicateReferenceId) return;
    setSaving(true);
    try {
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
      setMessage(`Reference replace failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function validateReferenceSet() {
    const project = await factoryClient.validateReferenceSet({ projectId: props.project.id });
    props.setSelectedProject(project);
    setMessage(project.referenceSet?.status === "valid" ? "Reference set validated. Review and approve it to continue." : "Reference set validation found issues to fix.");
  }

  async function approveReferenceSet() {
    const project = await factoryClient.approveReferenceSet({ projectId: props.project.id });
    props.setSelectedProject(project);
    setMessage("Reference set approved. Competitor Workflow is now available.");
  }

  function startEdit(referenceId: string) {
    const reference = props.project.competitorReferences.find((item) => item.id === referenceId);
    if (!reference) return;
    setEditingReferenceId(reference.id);
    setSourceUrl(reference.sourceUrl ?? "");
    setPastedTranscript(reference.pastedTranscript);
    setNotes(reference.notes ?? "");
    setDuplicateReferenceId(null);
  }

  function clearForm() {
    setSourceUrl("");
    setPastedTranscript("");
    setNotes("");
    setEditingReferenceId(null);
  }

  return (
    <>
      <SectionCard title="Competitor reference intake" description="Paste competitor video links and transcript/analysis blocks before running idea or originality work.">
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
              <button className="button primary" type="button" onClick={() => void addReference()} disabled={saving}>{saving ? "Saving..." : editingReferenceId ? "Save reference edits" : "Save competitor reference"}</button>
            ) : (
              <DisabledAction reason="Paste a transcript or analysis block before saving.">Save competitor reference</DisabledAction>
            )}
            {editingReferenceId ? <button className="button secondary" type="button" onClick={clearForm}>Cancel edit</button> : null}
          </div>
          {duplicateReferenceId ? (
            <div className="button-row">
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
          <MetricCard label="Included references" value={includedCount} />
          <MetricCard label="Duplicates" value={props.project.competitorReferences.filter((reference) => reference.status === "duplicate").length} tone="warning" />
        </div>
        <div className="button-row">
          {props.project.competitorReferences.length ? (
            <button className="button secondary" type="button" onClick={() => void validateReferenceSet()}>Validate reference set</button>
          ) : (
            <DisabledAction reason="Add at least one reference first.">Validate reference set</DisabledAction>
          )}
          {hasValidReferenceSet ? (
            <button className="button primary" type="button" onClick={() => void approveReferenceSet()}>Approve reference set</button>
          ) : (
            <DisabledAction reason="Reference set must be valid before approval.">Approve reference set</DisabledAction>
          )}
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
              <thead><tr><th>Include</th><th>Source</th><th>Transcript</th><th>Status</th><th>Version</th><th>Added</th><th>Actions</th></tr></thead>
              <tbody>
                {props.project.competitorReferences.map((reference) => (
                  <tr key={reference.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={reference.included !== false}
                        onChange={(event) => {
                          if (props.project.referenceSet?.status === "approved" && !window.confirm("Changing this approved reference will mark downstream stages stale. Continue?")) return;
                          void factoryClient.setReferenceIncluded({ projectId: props.project.id, referenceId: reference.id, included: event.target.checked }).then(props.setSelectedProject);
                        }}
                        aria-label={`Include ${reference.sourceUrl ?? reference.id}`}
                      />
                    </td>
                    <td>{reference.sourceUrl ?? "Manual paste"}</td>
                    <td>{reference.pastedTranscript.slice(0, 180)}{reference.pastedTranscript.length > 180 ? "..." : ""}</td>
                    <td>
                      <StatusBadge tone={reference.status === "approved" || reference.status === "valid" ? "success" : reference.status === "invalid" || reference.status === "duplicate" ? "danger" : "warning"}>
                        {(reference.status ?? "draft").replaceAll("_", " ")}
                      </StatusBadge>
                      {reference.validationMessage ? <small>{reference.validationMessage}</small> : null}
                    </td>
                    <td>{reference.version ?? 1}</td>
                    <td>{formatDate(reference.createdAt)}</td>
                    <td className="row-actions">
                      <button className="button compact" type="button" onClick={() => startEdit(reference.id)}>Edit</button>
                      <button
                        className="button danger compact"
                        type="button"
                        onClick={() => {
                          if (props.project.referenceSet?.status === "approved" && !window.confirm("Deleting this approved reference will mark downstream stages stale. Continue?")) return;
                          void factoryClient.deleteCompetitorReference({ projectId: props.project.id, referenceId: reference.id }).then(props.setSelectedProject);
                        }}
                      >
                        Delete
                      </button>
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

function CompetitorDnaScreen(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; setRoute: (route: RouteId) => void; textCertification: TextModelCertificationResponse }) {
  const [runningReferenceId, setRunningReferenceId] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState("");
  const [cleaningArtifacts, setCleaningArtifacts] = useState<TranscriptCleaningArtifact[]>([]);
  const [segmentationArtifacts, setSegmentationArtifacts] = useState<ReferenceSegmentationArtifact[]>([]);
  const [dnaArtifacts, setDnaArtifacts] = useState<CompetitorDnaArtifact[]>([]);
  const hasReferences = props.project.competitorReferences.length > 0;
  const eligibilities = resolveStageEligibilities(props.project, { textVerified: props.textCertification.status === "verified" });
  const transcriptCleaning = eligibilities.find((stage) => stage.stageId === "transcript-cleaning")!;
  const segmentation = eligibilities.find((stage) => stage.stageId === "reference-segmentation")!;
  const competitorDna = eligibilities.find((stage) => stage.stageId === "competitor-dna")!;
  const approvedReferences = props.project.competitorReferences.filter((reference) => reference.included !== false && reference.status === "approved");

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      Promise.all(approvedReferences.map((reference) => factoryClient.listTranscriptCleaningArtifacts({ projectId: props.project.id, referenceId: reference.id }))),
      Promise.all(approvedReferences.map((reference) => factoryClient.listReferenceSegmentationArtifacts({ projectId: props.project.id, referenceId: reference.id }))),
      Promise.all(approvedReferences.map((reference) => factoryClient.listCompetitorDnaArtifacts({ projectId: props.project.id, referenceId: reference.id })))
    ])
      .then(([cleaning, segmentationArtifacts, dnaArtifacts]) => {
        if (!cancelled) {
          setCleaningArtifacts(cleaning.flat());
          setSegmentationArtifacts(segmentationArtifacts.flat());
          setDnaArtifacts(dnaArtifacts.flat());
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCleaningArtifacts([]);
          setSegmentationArtifacts([]);
          setDnaArtifacts([]);
        }
      });
    return () => { cancelled = true; };
  }, [props.project]);

  async function runCleaning(referenceId: string) {
    setRunningReferenceId(referenceId);
    setRunMessage("");
    try {
      const project = await factoryClient.runTranscriptCleaning({ projectId: props.project.id, referenceId });
      props.setSelectedProject(project);
      const artifacts = await factoryClient.listTranscriptCleaningArtifacts({ projectId: props.project.id, referenceId });
      setCleaningArtifacts((current) => [...current.filter((artifact) => artifact.payloadJson.referenceId !== referenceId), ...artifacts]);
      setRunMessage("Transcript Cleaning completed and is ready for review.");
    } catch (error) {
      setRunMessage(`Transcript Cleaning failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRunningReferenceId(null);
    }
  }

  async function approveCleaning(referenceId: string) {
    setRunningReferenceId(referenceId);
    setRunMessage("");
    try {
      const project = await factoryClient.approveTranscriptCleaning({ projectId: props.project.id, referenceId });
      props.setSelectedProject(project);
      const artifacts = await factoryClient.listTranscriptCleaningArtifacts({ projectId: props.project.id, referenceId });
      setCleaningArtifacts((current) => [...current.filter((artifact) => artifact.payloadJson.referenceId !== referenceId), ...artifacts]);
      setRunMessage("Cleaned transcript approved.");
    } catch (error) {
      setRunMessage(`Transcript approval failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRunningReferenceId(null);
    }
  }

  async function runSegmentation(referenceId: string) {
    setRunningReferenceId(referenceId);
    setRunMessage("");
    try {
      const project = await factoryClient.runReferenceSegmentation({ projectId: props.project.id, referenceId });
      props.setSelectedProject(project);
      const artifacts = await factoryClient.listReferenceSegmentationArtifacts({ projectId: props.project.id, referenceId });
      setSegmentationArtifacts((current) => current.filter((artifact) => artifact.payloadJson.referenceId !== referenceId).concat(artifacts));
      setRunMessage("Reference Segmentation completed and is ready for review.");
    } catch (error) {
      setRunMessage(`Reference Segmentation failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRunningReferenceId(null);
    }
  }

  async function approveSegmentation(referenceId: string) {
    setRunningReferenceId(referenceId);
    setRunMessage("");
    try {
      const project = await factoryClient.approveReferenceSegmentation({ projectId: props.project.id, referenceId });
      props.setSelectedProject(project);
      const artifacts = await factoryClient.listReferenceSegmentationArtifacts({ projectId: props.project.id, referenceId });
      setSegmentationArtifacts((current) => current.filter((artifact) => artifact.payloadJson.referenceId !== referenceId).concat(artifacts));
      setRunMessage("Reference segmentation approved.");
    } catch (error) {
      setRunMessage(`Segmentation approval failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRunningReferenceId(null);
    }
  }

  async function runDna(referenceId: string) {
    setRunningReferenceId(referenceId); setRunMessage("");
    try {
      const project = await factoryClient.runCompetitorDna({ projectId: props.project.id, referenceId });
      props.setSelectedProject(project);
      const artifacts = await factoryClient.listCompetitorDnaArtifacts({ projectId: props.project.id, referenceId });
      setDnaArtifacts((current) => current.filter((artifact) => artifact.payloadJson.referenceId !== referenceId).concat(artifacts));
      setRunMessage("Competitor DNA completed and is ready for review.");
    } catch (error) { setRunMessage(`Competitor DNA failed: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setRunningReferenceId(null); }
  }

  async function approveDna(referenceId: string) {
    setRunningReferenceId(referenceId); setRunMessage("");
    try {
      const project = await factoryClient.approveCompetitorDna({ projectId: props.project.id, referenceId });
      props.setSelectedProject(project);
      const artifacts = await factoryClient.listCompetitorDnaArtifacts({ projectId: props.project.id, referenceId });
      setDnaArtifacts((current) => current.filter((artifact) => artifact.payloadJson.referenceId !== referenceId).concat(artifacts));
      setRunMessage("Competitor DNA approved.");
    } catch (error) { setRunMessage(`Competitor DNA approval failed: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setRunningReferenceId(null); }
  }

  return (
    <>
      <PageHeader
        title="Competitor DNA"
        description="Competitor workflow starts with Transcript Cleaning, then Segmentation, then Competitor DNA review."
        actions={
          <>
            <button className="button secondary" type="button" onClick={() => props.setRoute("reference-intake")}>Back to references</button>
            {approvedReferences.length && transcriptCleaning.runnable ? (
              <button className="button primary" type="button" onClick={() => void runCleaning(approvedReferences[0]!.id)} disabled={runningReferenceId !== null}>
                {runningReferenceId ? "Cleaning transcript..." : "Run Transcript Cleaning"}
              </button>
            ) : (
              <DisabledAction reason={transcriptCleaning.blockingReasons[0]?.message ?? "Transcript Cleaning is not runnable yet."}>Run Transcript Cleaning</DisabledAction>
            )}
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
      {!hasReferences ? (
        <EmptyState
          title="No references saved"
          detail="Add at least one competitor reference before this stage can run."
          action={<button className="button primary" type="button" onClick={() => props.setRoute("reference-intake")}>Add reference</button>}
        />
      ) : (
        <SectionCard title="Current approved input" description="Only approved included references may feed Transcript Cleaning. Each button starts one explicit provider run; no request runs on screen load.">
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
                    {reference.status === "approved" && transcriptCleaning.runnable ? (
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
                        {artifact.payloadJson.warnings.length ? <small>Warnings: {artifact.payloadJson.warnings.join(", ").replaceAll("_", " ")}</small> : null}
                        {artifact.status === "needs_review" ? <button className="button compact" type="button" onClick={() => void approveCleaning(reference.id)} disabled={runningReferenceId !== null}>Approve cleaned transcript</button> : null}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </SectionCard>
      )}
      <SectionCard title="Competitor workflow stages" description="Stages are separate even though they share this screen.">
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
            return <tr key={reference.id}><td>{reference.sourceUrl ?? "Manual paste"}</td><td>{segmentationArtifacts.some((artifact) => artifact.status === "approved" && artifact.payloadJson.referenceId === reference.id) ? "Approved" : "Missing"}</td><td>{dna.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge><small>{artifact.payloadJson.hookPattern.abstraction}</small>{artifact.status === "needs_review" ? <button className="button compact" type="button" onClick={() => void approveDna(reference.id)} disabled={runningReferenceId !== null}>Approve DNA</button> : null}</div>)}</td><td>{canRun ? <button className="button compact" type="button" onClick={() => void runDna(reference.id)} disabled={runningReferenceId !== null}>{runningReferenceId === reference.id ? "Running..." : "Analyze"}</button> : <DisabledAction reason={competitorDna.blockingReasons[0]?.message ?? "Competitor DNA is not runnable for this reference."}>Analyze</DisabledAction>}</td></tr>;
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
                <td>{segmentationArtifacts.filter((artifact) => artifact.payloadJson.referenceId === reference.id).map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge><small>{artifact.payloadJson.segments.length} exact segments</small>{artifact.status === "needs_review" ? <button className="button compact" type="button" onClick={() => void approveSegmentation(reference.id)} disabled={runningReferenceId !== null}>Approve segments</button> : null}</div>)}</td>
                <td>{canRun ? <button className="button compact" type="button" onClick={() => void runSegmentation(reference.id)} disabled={runningReferenceId !== null}>{runningReferenceId === reference.id ? "Running..." : "Segment"}</button> : <DisabledAction reason={segmentation.blockingReasons[0]?.message ?? "Segmentation is not runnable for this reference."}>Segment</DisabledAction>}</td>
              </tr>;
            })}
          </tbody>
        </DataTable>
      </SectionCard>
      {runMessage ? <p className={runMessage.includes("failed") ? "error-message" : "safe-message"}>{runMessage}</p> : null}
      <SectionCard title="Run history" description="Each explicit Transcript Cleaning run is persisted in workflow_stage_runs with a review artifact. Detailed history UI is the next batch.">
        <EmptyState title="Review required" detail={props.project.stages.find((stage) => stage.id === "transcript-cleaning")?.status === "needs_review" ? "The latest cleaning output is waiting for review and approval." : "Run an approved reference to create a reviewable cleaning artifact."} />
      </SectionCard>
    </>
  );
}

function IdeaLabScreen(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; textCertification: TextModelCertificationResponse }) {
  const [artifacts, setArtifacts] = useState<OpportunityMapArtifact[]>([]);
  const [originalityArtifacts, setOriginalityArtifacts] = useState<OriginalityReviewArtifact[]>([]);
  const [message, setMessage] = useState("");
  const opportunity = resolveStageEligibilities(props.project, { textVerified: props.textCertification.status === "verified" }).find((stage) => stage.stageId === "opportunity-map")!;
  const ideaLab = resolveStageEligibilities(props.project, { textVerified: props.textCertification.status === "verified" }).find((stage) => stage.stageId === "idea-lab")!;
  const originalityReview = resolveStageEligibilities(props.project, { textVerified: props.textCertification.status === "verified" }).find((stage) => stage.stageId === "originality-review")!;
  useEffect(() => { void factoryClient.listOpportunityMapArtifacts({ projectId: props.project.id }).then(setArtifacts).catch(() => setArtifacts([])); }, [props.project]);
  useEffect(() => { void factoryClient.listOriginalityReviewArtifacts({ projectId: props.project.id }).then(setOriginalityArtifacts).catch(() => setOriginalityArtifacts([])); }, [props.project]);
  async function runOpportunity() { try { const project = await factoryClient.runOpportunityMap({ projectId: props.project.id }); props.setSelectedProject(project); setArtifacts(await factoryClient.listOpportunityMapArtifacts({ projectId: props.project.id })); setMessage("Opportunity Map is ready for review."); } catch (error) { setMessage(`Opportunity Map failed: ${error instanceof Error ? error.message : String(error)}`); } }
  async function approveOpportunity() { try { const project = await factoryClient.approveOpportunityMap({ projectId: props.project.id }); props.setSelectedProject(project); setArtifacts(await factoryClient.listOpportunityMapArtifacts({ projectId: props.project.id })); setMessage("Opportunity Map approved."); } catch (error) { setMessage(`Opportunity approval failed: ${error instanceof Error ? error.message : String(error)}`); } }
  async function runIdeas() { try { const project = await factoryClient.runIdeaLab({ projectId: props.project.id }); props.setSelectedProject(project); setMessage("Idea Lab is ready for review."); } catch (error) { setMessage(`Idea Lab failed: ${error instanceof Error ? error.message : String(error)}`); } }
  async function approveIdea(ideaId: string) { try { const project = await factoryClient.approveIdea({ projectId: props.project.id, ideaId }); props.setSelectedProject(project); setMessage("Idea approved."); } catch (error) { setMessage(`Idea approval failed: ${error instanceof Error ? error.message : String(error)}`); } }
  async function runOriginalityReview() { try { const project = await factoryClient.runOriginalityReview({ projectId: props.project.id }); props.setSelectedProject(project); setOriginalityArtifacts(await factoryClient.listOriginalityReviewArtifacts({ projectId: props.project.id })); setMessage("Originality Review is ready for review."); } catch (error) { setMessage(`Originality Review failed: ${error instanceof Error ? error.message : String(error)}`); } }
  async function approveOriginalityReview() { try { const project = await factoryClient.approveOriginalityReview({ projectId: props.project.id }); props.setSelectedProject(project); setOriginalityArtifacts(await factoryClient.listOriginalityReviewArtifacts({ projectId: props.project.id })); setMessage("Originality Review approved. Research Source Intake is unlocked."); } catch (error) { setMessage(`Originality approval failed: ${error instanceof Error ? error.message : String(error)}`); } }
  return (
    <>
      <PageHeader title="Idea Lab" description="Opportunity Map must be explicitly reviewed before Idea Lab becomes runnable." actions={ideaLab.runnable ? <button className="button primary" type="button" onClick={() => void runIdeas()}>Run Idea Lab</button> : opportunity.runnable ? <button className="button primary" type="button" onClick={() => void runOpportunity()}>Run Opportunity Map</button> : <DisabledAction reason={ideaLab.blockingReasons[0]?.message ?? opportunity.blockingReasons[0]?.message ?? "Opportunity Map is not runnable."}>Run Idea Lab</DisabledAction>} />
      <StageStatusHeader stageName="Opportunity Map" stageNumber={7} eligibility={opportunity} dependencies={["Competitor DNA"]} purpose="Synthesize evidence-backed content spaces from approved Competitor DNA only." />
      <SectionCard title="Opportunity Map review" description="No Idea Lab run is triggered automatically.">
        {artifacts.length ? artifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge><p>{artifact.payloadJson.recommendedContentSpaces.map((item) => `${item.text} (${item.confidence})`).join("; ") || "No recommended content spaces."}</p>{artifact.status === "needs_review" ? <button className="button compact" type="button" onClick={() => void approveOpportunity()}>Approve Opportunity Map</button> : null}</div>) : <EmptyState title="No Opportunity Map yet" detail="Approve Competitor DNA for every included reference, then run this stage explicitly." />}
        {message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}
      </SectionCard>
      <StageStatusHeader stageName="Idea Lab" stageNumber={8} eligibility={ideaLab} dependencies={["Opportunity Map"]} purpose="Generate exactly twelve original candidates from the approved Opportunity Map; approving one does not run research or script." />
      <SectionCard title="Idea candidates" description="Provider-generated candidates require an explicit choice; no candidate is selected automatically.">
        <DataTable label="Idea candidates">
          <thead>
            <tr>
              <th>Working title</th>
              <th>Angle</th>
              <th>Traffic</th>
              <th>Novelty</th>
              <th>Fit</th>
              <th>Risk</th>
              <th>Status</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {props.project.ideas.map((idea) => (
              <tr key={idea.id}>
                <td>{idea.workingTitle}</td>
                <td>{idea.angle}</td>
                <td>{idea.trafficModel}</td>
                <td><ScoreBar value={idea.noveltyScore} label="Novelty" /></td>
                <td><ScoreBar value={idea.audienceFitScore} label="Audience fit" /></td>
                <td>{idea.researchRisk}</td>
                <td><StatusBadge tone={props.project.approvedIdeaId === idea.id ? "success" : ideaLab.status === "needs_review" ? "warning" : "info"}>{props.project.approvedIdeaId === idea.id ? "Approved" : ideaLab.status === "needs_review" ? "Review required" : "Candidate"}</StatusBadge></td>
                <td>{ideaLab.status === "needs_review" ? <button className="button compact" type="button" onClick={() => void approveIdea(idea.id)}>Approve this idea</button> : null}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </SectionCard>
      <StageStatusHeader stageName="Originality Review" stageNumber={9} eligibility={originalityReview} dependencies={["Approved Idea Lab candidate", "Approved Competitor DNA"]} purpose="Check phrase, structural, thumbnail, and concept overlap against stored competitor evidence before research begins." />
      <SectionCard title="Originality Review" description="This local deterministic review compares the selected idea to approved competitor patterns; it never claims external web-search coverage.">
        {originalityArtifacts.length ? originalityArtifacts.map((artifact) => (
          <div key={artifact.id}>
            <StatusBadge tone={artifact.payloadJson.status === "pass" ? "success" : "danger"}>{artifact.payloadJson.status.replaceAll("_", " ")}</StatusBadge>
            <p>Phrase {artifact.payloadJson.phraseOverlapRisk}% | Structure {artifact.payloadJson.structuralOverlapRisk}% | Thumbnail {artifact.payloadJson.thumbnailOverlapRisk}% | Concept {artifact.payloadJson.conceptOverlapRisk}%</p>
            {artifact.payloadJson.flaggedMatches.length ? <TagList items={artifact.payloadJson.flaggedMatches} /> : <p>No material overlap was detected in the approved competitor evidence.</p>}
            {artifact.payloadJson.requiredChanges.length ? <TagList items={artifact.payloadJson.requiredChanges} /> : null}
            {artifact.status === "needs_review" && artifact.payloadJson.status === "pass" ? <button className="button compact" type="button" onClick={() => void approveOriginalityReview()}>Approve Originality Review</button> : null}
          </div>
        )) : <EmptyState title="No Originality Review yet" detail="Approve an Idea Lab candidate, then run this stage explicitly." />}
        <div className="button-row">
          {originalityReview.runnable ? <button className="button primary" type="button" onClick={() => void runOriginalityReview()}>Run Originality Review</button> : <DisabledAction reason={originalityReview.blockingReasons[0]?.message ?? "Originality Review is not ready to run."}>Run Originality Review</DisabledAction>}
        </div>
      </SectionCard>
    </>
  );
}

function ClaimsScreen(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; textCertification: TextModelCertificationResponse }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [publisher, setPublisher] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [sourceType, setSourceType] = useState<"primary" | "secondary">("primary");
  const [artifacts, setArtifacts] = useState<ResearchSourcesArtifact[]>([]);
  const [claimMapArtifacts, setClaimMapArtifacts] = useState<ClaimMapArtifact[]>([]);
  const [message, setMessage] = useState("");
  const intake = resolveStageEligibilities(props.project).find((stage) => stage.stageId === "research-source-intake")!;
  const claimMap = resolveStageEligibilities(props.project, { textVerified: props.textCertification.status === "verified" }).find((stage) => stage.stageId === "claim-map")!;
  useEffect(() => { void factoryClient.listResearchSourcesArtifacts({ projectId: props.project.id }).then(setArtifacts).catch(() => setArtifacts([])); }, [props.project]);
  useEffect(() => { void factoryClient.listClaimMapArtifacts({ projectId: props.project.id }).then(setClaimMapArtifacts).catch(() => setClaimMapArtifacts([])); }, [props.project]);
  async function saveSource() { try { const project = await factoryClient.saveResearchSources({ projectId: props.project.id, sources: [{ id: `source-${Date.now()}`, title, url, publisher, excerpt, sourceType }] }); props.setSelectedProject(project); setArtifacts(await factoryClient.listResearchSourcesArtifacts({ projectId: props.project.id })); setMessage("Research source is ready for review."); } catch (error) { setMessage(`Research source save failed: ${error instanceof Error ? error.message : String(error)}`); } }
  async function approveSources() { try { const project = await factoryClient.approveResearchSources({ projectId: props.project.id }); props.setSelectedProject(project); setArtifacts(await factoryClient.listResearchSourcesArtifacts({ projectId: props.project.id })); setMessage("Research sources approved. Claim Map is now eligible."); } catch (error) { setMessage(`Research source approval failed: ${error instanceof Error ? error.message : String(error)}`); } }
  async function runClaimMap() { try { const project = await factoryClient.runClaimMap({ projectId: props.project.id }); props.setSelectedProject(project); setClaimMapArtifacts(await factoryClient.listClaimMapArtifacts({ projectId: props.project.id })); setMessage("Claim Map is ready for review."); } catch (error) { setMessage(`Claim Map failed: ${error instanceof Error ? error.message : String(error)}`); } }
  async function approveClaimMap() { try { const project = await factoryClient.approveClaimMap({ projectId: props.project.id }); props.setSelectedProject(project); setClaimMapArtifacts(await factoryClient.listClaimMapArtifacts({ projectId: props.project.id })); setMessage("Claim Map approved. Outline is now eligible."); } catch (error) { setMessage(`Claim Map approval failed: ${error instanceof Error ? error.message : String(error)}`); } }
  const selectedClaim = props.project.claims[0];
  return (
    <>
      <PageHeader title="Research & Claims" description="Add cited sources manually. The app never fabricates source material or web-search results." />
      <StageStatusHeader stageName="Research Source Intake" stageNumber={10} eligibility={intake} dependencies={["Approved Originality Review"]} purpose="Collect traceable source excerpts for later claim mapping." />
      <SectionCard title="Research source intake" description="Each submission is a cited manual source artifact that requires approval before Claim Map can use it.">
        <div className="form-grid">
          <FormField label="Source title" htmlFor="research-source-title"><input id="research-source-title" value={title} onChange={(event) => setTitle(event.target.value)} /></FormField>
          <FormField label="Canonical URL" htmlFor="research-source-url"><input id="research-source-url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." /></FormField>
          <FormField label="Publisher" htmlFor="research-source-publisher"><input id="research-source-publisher" value={publisher} onChange={(event) => setPublisher(event.target.value)} /></FormField>
          <FormField label="Quoted excerpt" htmlFor="research-source-excerpt"><textarea id="research-source-excerpt" value={excerpt} onChange={(event) => setExcerpt(event.target.value)} /></FormField>
          <FormField label="Source type" htmlFor="research-source-type"><select id="research-source-type" value={sourceType} onChange={(event) => setSourceType(event.target.value as "primary" | "secondary")}><option value="primary">Primary</option><option value="secondary">Secondary</option></select></FormField>
          {intake.runnable && title.trim() && url.trim() && publisher.trim() && excerpt.trim() ? <button className="button primary" type="button" onClick={() => void saveSource()}>Save source for review</button> : <DisabledAction reason={intake.blockingReasons[0]?.message ?? "Enter title, canonical URL, publisher, and an excerpt before saving."}>Save source for review</DisabledAction>}
        </div>
        {artifacts.map((artifact) => <div key={artifact.id}>{artifact.payloadJson.sources.map((source) => <p key={source.id}><strong>{source.title}</strong> ({source.sourceType}) - {source.url}</p>)}{artifact.status === "needs_review" ? <button className="button compact" type="button" onClick={() => void approveSources()}>Approve research sources</button> : null}</div>)}
        {message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}
      </SectionCard>
      <StageStatusHeader stageName="Claim Map" stageNumber={11} eligibility={claimMap} dependencies={["Approved research sources", "Verified text model"]} purpose="Create source-linked claims that must be reviewed before Outline can use them." />
      <SectionCard title="Claim Map review" description="The provider may use only approved manual source excerpts. It cannot invent sources or silently approve unsupported claims.">
        {claimMap.runnable ? <button className="button primary" type="button" onClick={() => void runClaimMap()}>Run Claim Map</button> : <DisabledAction reason={claimMap.blockingReasons[0]?.message ?? "Claim Map is not runnable yet."}>Run Claim Map</DisabledAction>}
        {claimMapArtifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge>{artifact.payloadJson.claims.map((claim) => <p key={claim.id}>{claim.text} ({claim.state}; {claim.sourceIds.join(", ")})</p>)}{artifact.status === "needs_review" ? <button className="button compact" type="button" onClick={() => void approveClaimMap()}>Approve Claim Map</button> : null}</div>)}
      </SectionCard>
      <div className="split-grid">
        <SectionCard title="Claim list">
          {props.project.claims.length === 0 ? (
            <EmptyState title="No claims" detail="Claim mapping will populate this once the research pipeline exists." />
          ) : (
            <DataTable label="Claims">
              <thead><tr><th>Claim</th><th>Type</th><th>Status</th><th>Confidence</th></tr></thead>
              <tbody>
                {props.project.claims.map((claim) => (
                  <tr key={claim.id}>
                    <td>{claim.text}</td>
                    <td>{claim.type}</td>
                    <td><StatusBadge tone={claim.state === "unsupported" ? "warning" : "info"}>{claim.state.replaceAll("_", " ")}</StatusBadge></td>
                    <td>{Math.round(claim.confidence * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </SectionCard>
        <SectionCard title="Claim inspector">
          {selectedClaim ? (
            <div className="inspector">
              <p>{selectedClaim.text}</p>
              <p><strong>Evidence:</strong> {selectedClaim.evidenceNote ?? "No evidence note"}</p>
              <p><strong>Qualification:</strong> {selectedClaim.qualification ?? "Not provided"}</p>
              <StatusBadge tone={selectedClaim.approvalState === "blocked" ? "warning" : "success"}>{selectedClaim.approvalState}</StatusBadge>
            </div>
          ) : <EmptyState title="Nothing selected" detail="Select a claim after claim mapping exists." />}
        </SectionCard>
      </div>
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
  async function perform(action: () => Promise<FactoryProject>, success: string, failed: string) { setRunning(true); setMessage(""); try { props.setSelectedProject(await action()); await refreshArtifacts(); setMessage(success); } catch (error) { setMessage(`${failed}: ${error instanceof Error ? error.message : String(error)}`); } finally { setRunning(false); } }
  function runOutline() { return perform(() => factoryClient.runOutline({ projectId: props.project.id }), "Outline is ready for review.", "Outline failed"); }
  function approveOutline() { return perform(() => factoryClient.approveOutline({ projectId: props.project.id }), "Outline approved. Script is now eligible.", "Outline approval failed"); }
  function runScript() { return perform(() => factoryClient.runScript({ projectId: props.project.id }), "Script is ready for review.", "Script failed"); }
  function approveScript() { return perform(() => factoryClient.approveScript({ projectId: props.project.id }), "Script approved. Fact Review is now eligible.", "Script approval failed"); }
  function runFactReview() { return perform(() => factoryClient.runFactReview({ projectId: props.project.id }), "Fact Review is ready for review.", "Fact Review failed"); }
  function approveFactReview() { return perform(() => factoryClient.approveFactReview({ projectId: props.project.id }), "Fact Review approved.", "Fact Review approval failed"); }
  function runRetentionReview() { return perform(() => factoryClient.runRetentionReview({ projectId: props.project.id }), "Retention Review is ready for review.", "Retention Review failed"); }
  function approveRetentionReview() { return perform(() => factoryClient.approveRetentionReview({ projectId: props.project.id }), "Retention Review approved.", "Retention Review approval failed"); }
  return (
    <>
      <PageHeader title="Script" description="Outline, Script, and Fact Review remain separate review checkpoints." actions={outline.runnable ? <button className="button primary" type="button" onClick={() => void runOutline()} disabled={running}>Run Outline</button> : <DisabledAction reason={outline.blockingReasons[0]?.message ?? "Outline is not runnable."}>Run Outline</DisabledAction>} />
      <StageStatusHeader stageName="Outline" stageNumber={12} eligibility={outline} dependencies={["Approved Claim Map", "Approved idea", "Approved Originality Review"]} purpose="Plan factual sections linked only to allowed, verified claims." />
      <SectionCard title="Outline review">{outlines.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge>{artifact.payloadJson.sections.map((section) => <p key={section.id}>{section.purpose}: {section.keyPoint}</p>)}{artifact.status === "needs_review" ? <button className="button compact" type="button" onClick={() => void approveOutline()} disabled={running}>Approve Outline</button> : null}</div>)}</SectionCard>
      <StageStatusHeader stageName="Script" stageNumber={13} eligibility={script} dependencies={["Approved Outline", "Approved Claim Map"]} purpose="Draft narration only from each outline section's allowed claims." />
      <SectionCard title="Script review" description="Each run is explicit and uses the certified text model; approval persists the reviewed sections.">
        {script.runnable ? <button className="button primary" type="button" onClick={() => void runScript()} disabled={running}>Run Script</button> : <DisabledAction reason={script.blockingReasons[0]?.message ?? "Script is not runnable."}>Run Script</DisabledAction>}
        {scripts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge>{artifact.payloadJson.sections.map((section) => <p key={section.id}><strong>{section.purpose}</strong>: {section.narration}</p>)}{artifact.status === "needs_review" ? <button className="button compact" type="button" onClick={() => void approveScript()} disabled={running}>Approve Script</button> : null}</div>)}
      </SectionCard>
      <StageStatusHeader stageName="Fact Review" stageNumber={14} eligibility={factReview} dependencies={["Approved Script"]} purpose="Locally verify the claims actually used in the approved script; this is not a web-search review." />
      <SectionCard title="Fact Review" description="Blocked findings prevent approval. Qualification findings must remain qualified in narration.">
        {factReview.runnable ? <button className="button primary" type="button" onClick={() => void runFactReview()} disabled={running}>Run Fact Review</button> : <DisabledAction reason={factReview.blockingReasons[0]?.message ?? "Fact Review is not runnable."}>Run Fact Review</DisabledAction>}
        {factReviews.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge><small>Reviewer: local deterministic</small>{artifact.payloadJson.findings.map((finding) => <p key={finding.claimId}><strong>{finding.claimId}</strong>: {finding.verdict.replaceAll("_", " ")} - {finding.reason}</p>)}{artifact.status === "needs_review" ? <button className="button compact" type="button" onClick={() => void approveFactReview()} disabled={running}>Approve Fact Review</button> : null}</div>)}
        {message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}
      </SectionCard>
      <StageStatusHeader stageName="Retention Review" stageNumber={15} eligibility={retentionReview} dependencies={["Approved Fact Review", "Approved Script"]} purpose="Review pacing and retention risks without rewriting or adding facts." />
      <SectionCard title="Retention Review" description="The certified text model returns section-bound editorial findings for human review.">
        {retentionReview.runnable ? <button className="button primary" type="button" onClick={() => void runRetentionReview()} disabled={running}>Run Retention Review</button> : <DisabledAction reason={retentionReview.blockingReasons[0]?.message ?? "Retention Review is not runnable."}>Run Retention Review</DisabledAction>}
        {retentionReviews.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge><p>Verdict: {artifact.payloadJson.overallVerdict.replaceAll("_", " ")}</p>{artifact.payloadJson.findings.map((finding) => <p key={finding.sectionId}><strong>{finding.sectionId}</strong> ({finding.severity}): {finding.reason} Suggested: {finding.recommendedChange}</p>)}{artifact.status === "needs_review" ? <button className="button compact" type="button" onClick={() => void approveRetentionReview()} disabled={running}>Approve Retention Review</button> : null}</div>)}
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
              <textarea value={section.narration} readOnly aria-label={`Narration ${section.id}`} />
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
  async function perform(action: () => Promise<FactoryProject>, success: string) { setRunning(true); try { props.setSelectedProject(await action()); await refresh(); setMessage(success); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setRunning(false); } }
  return (
    <>
      <PageHeader title="Scenes" description="Review frame-timed scenes generated only from the approved Script and Retention Review." actions={eligibility.runnable ? <button className="button primary" type="button" onClick={() => void perform(() => factoryClient.runScenePlan({ projectId: props.project.id }), "Scene Plan is ready for review.")} disabled={running}>Run Scene Plan</button> : <DisabledAction reason={eligibility.blockingReasons[0]?.message ?? "Scene Plan is not runnable."}>Run Scene Plan</DisabledAction>} />
      <StageStatusHeader stageName="Scene Plan" stageNumber={16} eligibility={eligibility} dependencies={["Approved Retention Review"]} purpose="Create frame-timed scenes without creating assets or shots." />
      <SectionCard title="Scene Plan review">{artifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge>{artifact.payloadJson.scenes.map((scene) => <p key={scene.id}>{scene.purpose}: {scene.startFrame} + {scene.durationFrames} frames</p>)}{artifact.status === "needs_review" ? <button className="button compact" type="button" onClick={() => void perform(() => factoryClient.approveScenePlan({ projectId: props.project.id }), "Scene Plan approved.")} disabled={running}>Approve Scene Plan</button> : null}</div>)}{message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}</SectionCard>
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
  async function perform(action: () => Promise<FactoryProject>, success: string) { setRunning(true); try { props.setSelectedProject(await action()); await refresh(); setMessage(success); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setRunning(false); } }
  return (
    <>
      <PageHeader
        title="Shot Board"
        description="Review frame-accurate shots generated only from the approved Scene Plan."
        actions={
          <><div className="segmented">{(["board", "table", "timeline"] as const).map((item) => <button className={view === item ? "active" : ""} key={item} onClick={() => setView(item)} type="button">{item}</button>)}</div>{eligibility.runnable ? <button className="button primary" type="button" onClick={() => void perform(() => factoryClient.runShotPlan({ projectId: props.project.id }), "Shot Plan is ready for review.")} disabled={running}>Run Shot Plan</button> : <DisabledAction reason={eligibility.blockingReasons[0]?.message ?? "Shot Plan is not runnable."}>Run Shot Plan</DisabledAction>}</>
        }
      />
      <StageStatusHeader stageName="Shot Plan" stageNumber={17} eligibility={eligibility} dependencies={["Approved Scene Plan"]} purpose="Create frame-timed shots without creating or assigning assets." />
      <SectionCard title="Shot Plan review">{artifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge>{artifact.payloadJson.shots.map((shot) => <p key={shot.id}>{shot.purpose}: {shot.startFrame} + {shot.durationFrames} frames</p>)}{artifact.status === "needs_review" ? <button className="button compact" type="button" onClick={() => void perform(() => factoryClient.approveShotPlan({ projectId: props.project.id }), "Shot Plan approved.")} disabled={running}>Approve Shot Plan</button> : null}</div>)}{message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}</SectionCard>
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

function VisualsScreen(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void }) {
  const [artifacts, setArtifacts] = useState<VisualRoutingArtifact[]>([]); const [running, setRunning] = useState(false); const [message, setMessage] = useState("");
  const eligibility = resolveStageEligibilities(props.project).find((stage) => stage.stageId === "visual-routing")!;
  const refresh = () => factoryClient.listVisualRoutingArtifacts({ projectId: props.project.id }).then(setArtifacts);
  useEffect(() => { void refresh().catch(() => setArtifacts([])); }, [props.project.id]);
  async function perform(action: () => Promise<FactoryProject>, success: string) { setRunning(true); try { props.setSelectedProject(await action()); await refresh(); setMessage(success); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setRunning(false); } }
  return <>
    <PageHeader title="Visual Sources" description="Route approved shots to visual modes before preparing prompts or acquiring assets." actions={eligibility.runnable ? <button className="button primary" type="button" onClick={() => void perform(() => factoryClient.runVisualRouting({ projectId: props.project.id }), "Visual Routing is ready for review.")} disabled={running}>Run Visual Routing</button> : <DisabledAction reason={eligibility.blockingReasons[0]?.message ?? "Visual Routing is not runnable."}>Run Visual Routing</DisabledAction>} />
    <StageStatusHeader stageName="Visual Routing" stageNumber={18} eligibility={eligibility} dependencies={["Approved Shot Plan"]} purpose="Assign an editable visual mode per shot; this stage does not generate assets." />
    <SectionCard title="Visual Routing review">{artifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{artifact.status.replaceAll("_", " ")}</StatusBadge>{artifact.payloadJson.shots.map((shot) => <p key={shot.id}><strong>{shot.id}</strong>: {shot.purpose} - {shot.visualMode}</p>)}{artifact.status === "needs_review" ? <button className="button compact" type="button" onClick={() => void perform(() => factoryClient.approveVisualRouting({ projectId: props.project.id }), "Visual Routing approved.")} disabled={running}>Approve Visual Routing</button> : null}</div>)}{message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}</SectionCard>
    <div className="shot-board">{props.project.shots.map((shot) => <article className="shot-card" key={shot.id}><div className="shot-thumb">No asset</div><div><strong>{shot.id}</strong><span>{shot.sceneId}</span></div><p>{shot.purpose}</p><StatusBadge tone="warning">{shot.visualMode}</StatusBadge></article>)}</div>
  </>;
}

function TimelineScreen(props: { project: FactoryProject }) {
  const totalFrames = Math.max(...props.project.timeline.items.map((item) => item.startFrame + item.durationFrames), 1);
  return (
    <>
      <PageHeader title="Timeline" description="Simplified admin timeline using frame-based timing." actions={<DisabledAction reason="FFmpeg preview command is not connected to IPC.">Preview</DisabledAction>} />
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
  setTextCertification: (certification: TextModelCertificationResponse) => void;
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
  const [certificationRetryUsed, setCertificationRetryUsed] = useState(false);
  const [savingStock, setSavingStock] = useState(false);
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
      setStockMessage(`Pexels credential save failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSavingStock(false);
    }
  }

  async function refreshModels() {
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
          <SelectedModelConfiguration selectedModels={selectedModels} textCertificationStatus={displayedCertificationStatus} />
          <TextModelCertificationPanel
            selectedModel={textModel}
            certification={props.textCertification}
            displayedStatus={displayedCertificationStatus}
            running={certificationRunning}
            retryExhausted={certificationRetryExhausted}
            hasCredential={props.presence.hasCredential}
            onRun={() => void runTextCertification()}
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
}) {
  const rows = [
    ["Text", props.selectedModels.textModel, textCertificationLabel(props.textCertificationStatus)],
    ["Image", props.selectedModels.imageModel, "Not Verified"],
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

function testResultLabel(result: { status: "passed" | "failed"; skipped?: boolean; errorCategory?: string }): string {
  if (result.skipped) return `Skipped (${result.errorCategory ?? "unknown_error"})`;
  if (result.status === "passed") return "Passed";
  return `Failed (${result.errorCategory ?? "unknown_error"})`;
}

function textCertificationLabel(status: TextModelCertificationStatus): string {
  if (status === "verified") return "Verified";
  if (status === "failed") return "Failed";
  if (status === "stale") return "Stale";
  if (status === "testing") return "Testing";
  return "Not Verified";
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

function certificationTone(status: string): "default" | "success" | "warning" | "danger" | "info" {
  if (status === "Verified") return "success";
  if (status === "Failed") return "danger";
  if (status === "Testing") return "info";
  return "warning";
}

function VoiceScreen(props: { project: FactoryProject; localTtsSettings: LocalTtsSettings | null; onRefresh: () => Promise<void> }) {
  const defaultText = props.project.scriptSections.map((section) => section.narration).join("\n\n");
  const [text, setText] = useState(defaultText);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setText(defaultText);
  }, [defaultText]);

  async function generateVoice() {
    setGenerating(true);
    setMessage("");
    try {
      const result = await factoryClient.generateLocalTts({
        projectId: props.project.id,
        text
      });
      setMessage(`Generated: ${result.outputPath}`);
      await props.onRefresh();
    } catch (error) {
      setMessage(`TTS failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setGenerating(false);
    }
  }

  const available = props.localTtsSettings?.available ?? false;
  return (
    <>
      <PageHeader title="Voice" description="Local OmniVoice TTS generation for the current project." />
      <SectionCard title="OmniVoice generation">
        <div className="form-grid">
          <FormField label="OmniVoice status" htmlFor="omnivoice-status">
            <input id="omnivoice-status" value={available ? "Detected" : "Needs setup"} disabled readOnly />
          </FormField>
          <FormField label="Binary path" htmlFor="omnivoice-bin-readonly">
            <input id="omnivoice-bin-readonly" value={props.localTtsSettings?.resolvedBinPath ?? ""} disabled readOnly />
          </FormField>
          <FormField label="Narration text" htmlFor="voice-narration">
            <textarea id="voice-narration" value={text} onChange={(event) => setText(event.target.value)} />
          </FormField>
          <div className="button-row">
            {available && text.trim() ? (
              <button className="button primary" type="button" onClick={() => void generateVoice()} disabled={generating}>
                {generating ? "Generating..." : "Generate WAV"}
              </button>
            ) : (
              <DisabledAction reason="Configure OmniVoice in Settings and enter narration text first.">Generate WAV</DisabledAction>
            )}
          </div>
          {message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}
        </div>
      </SectionCard>
    </>
  );
}

function SettingsScreen(props: {
  bootstrap: BootstrapData;
  localTtsSettings: LocalTtsSettings | null;
  setLocalTtsSettings: (settings: LocalTtsSettings | null) => void;
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
        <SectionCard title="Generation"><SettingsList items={[["Approval policy", "Guided"], ["Paid generation", "Disabled until provider execution exists"], ["Provider concurrency", "Five-worker queue exists; provider-specific setting unavailable"]]} /></SectionCard>
        <OmniVoiceSettings settings={props.localTtsSettings} setSettings={props.setLocalTtsSettings} />
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
        <SectionCard title="FFmpeg"><SettingsList items={[["Status", runtime.ffmpegAvailable ? "Detected" : "Needs setup"], ["Path", runtime.ffmpegPath], ["Version", runtime.ffmpegStatus], ["Preview IPC", "Unavailable"], ["Competitor video processing", runtime.ffmpegAvailable ? "Ready for future downloader/transcriber wiring" : "Blocked until FFmpeg is configured"]]} /></SectionCard>
        <SectionCard title="Security"><SettingsList items={[["Credential storage", "OS keychain reference"], ["Renderer API keys", "Write-only input"], ["Log redaction", "Enabled"], ["Generic filesystem IPC", "Unavailable"]]} /></SectionCard>
        <SectionCard title="Diagnostics"><SettingsList items={[["CodeGraph", "Development index only"], ["Queue snapshot", `${props.bootstrap.queue.jobs.length} jobs`], ["Project count", `${props.bootstrap.projects.length}`]]} /></SectionCard>
      </div>
    </>
  );
}

function OmniVoiceSettings(props: { settings: LocalTtsSettings | null; setSettings: (settings: LocalTtsSettings | null) => void }) {
  const [omnivoiceBinPath, setOmnivoiceBinPath] = useState(props.settings?.omnivoiceBinPath ?? "");
  const [outputDir, setOutputDir] = useState(props.settings?.outputDir ?? "");
  const [modelPath, setModelPath] = useState(props.settings?.modelPath ?? "");
  const [language, setLanguage] = useState(props.settings?.language ?? "");
  const [instruct, setInstruct] = useState(props.settings?.instruct ?? "");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!props.settings) return;
    setOmnivoiceBinPath(props.settings.omnivoiceBinPath);
    setOutputDir(props.settings.outputDir);
    setModelPath(props.settings.modelPath ?? "");
    setLanguage(props.settings.language ?? "");
    setInstruct(props.settings.instruct ?? "");
  }, [props.settings]);

  async function saveSettings() {
    setMessage("");
    try {
      const settings = await factoryClient.saveLocalTtsSettings({
        omnivoiceBinPath,
        outputDir,
        ...(modelPath ? { modelPath } : {}),
        ...(language ? { language } : {}),
        ...(instruct ? { instruct } : {})
      });
      props.setSettings(settings);
      setMessage(settings.available ? "OmniVoice saved and detected." : "OmniVoice settings saved, but binary was not detected.");
    } catch (error) {
      setMessage(`OmniVoice save failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return (
    <SectionCard title="OmniVoice TTS">
      <div className="form-grid">
        <FormField label="Status" htmlFor="local-tts-status">
          <input id="local-tts-status" value={props.settings?.available ? "Detected" : "Needs setup"} disabled readOnly />
        </FormField>
        <FormField label="OmniVoice infer executable" htmlFor="local-tts-bin">
          <input id="local-tts-bin" value={omnivoiceBinPath} onChange={(event) => setOmnivoiceBinPath(event.target.value)} placeholder="Path to omnivoice-infer.exe" />
        </FormField>
        <FormField label="Output directory" htmlFor="local-tts-output-dir">
          <input id="local-tts-output-dir" value={outputDir} onChange={(event) => setOutputDir(event.target.value)} />
        </FormField>
        <FormField label="Model path" htmlFor="local-tts-model">
          <input id="local-tts-model" value={modelPath} onChange={(event) => setModelPath(event.target.value)} placeholder="Optional local checkpoint or HF id" />
        </FormField>
        <FormField label="Language" htmlFor="local-tts-language">
          <input id="local-tts-language" value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="Optional, e.g. Vietnamese" />
        </FormField>
        <FormField label="Voice instruction" htmlFor="local-tts-instruct">
          <input id="local-tts-instruct" value={instruct} onChange={(event) => setInstruct(event.target.value)} placeholder="Optional voice design instruction" />
        </FormField>
        <div className="button-row">
          <button className="button primary" type="button" onClick={() => void saveSettings()}>Save OmniVoice</button>
        </div>
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
  return allRoutes.some((item) => item.id === value) ? (value as RouteId) : "dashboard";
}
