import {
  Archive,
  Boxes,
  ChevronLeft,
  ChevronRight,
  FileText,
  FlaskConical,
  FolderKanban,
  Gauge,
  HardDrive,
  Image,
  KeyRound,
  Layers3,
  ListChecks,
  Mic2,
  Play,
  Plus,
  Route,
  Search,
  Settings,
  ShieldCheck,
  TerminalSquare,
  Video
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { resolveStageEligibilities, workflowStageDefinitions } from "@lsf/domain";
import type { ChannelProfile, FactoryProject, WorkflowStageStatus } from "@lsf/domain";
import { projectRoutes, routeLabel, type RouteId, workspaceRoutes } from "../navigation";
import type { ProjectSummary, QueueSnapshot } from "../types";
import { currentStage } from "../utils";

const routeIcons: Record<RouteId, LucideIcon> = {
  dashboard: Gauge,
  projects: FolderKanban,
  "new-project": Plus,
  "project-overview": Layers3,
  "channel-profiles": Route,
  "reference-intake": FileText,
  "competitor-dna": Search,
  "idea-lab": FlaskConical,
  "research-claims": ShieldCheck,
  script: FileText,
  scenes: Video,
  shots: Boxes,
  visuals: Image,
  voice: Mic2,
  timeline: ListChecks,
  qa: ShieldCheck,
  export: Archive,
  "production-queue": Play,
  "asset-library": HardDrive,
  providers: KeyRound,
  settings: Settings,
  diagnostics: TerminalSquare
};

export function AppShell(props: {
  children: ReactNode;
  collapsed: boolean;
  onToggleSidebar: () => void;
  route: RouteId;
  selectedProject: FactoryProject | null;
  selectedProfile: ChannelProfile | undefined;
  projects: ProjectSummary[];
  queue: QueueSnapshot;
  onOpenProject: (projectId: string) => Promise<void>;
  setRoute: (route: RouteId) => void;
}) {
  return (
    <main className="admin-shell">
      <Sidebar collapsed={props.collapsed} route={props.route} setRoute={props.setRoute} selectedProject={props.selectedProject} />
      <section className="app-main">
        <TopBar
          collapsed={props.collapsed}
          onToggle={props.onToggleSidebar}
          route={props.route}
          selectedProject={props.selectedProject}
          selectedProfile={props.selectedProfile}
          projects={props.projects}
          queue={props.queue}
          onOpenProject={props.onOpenProject}
          setRoute={props.setRoute}
        />
        <section className="content-scroll">{props.children}</section>
      </section>
    </main>
  );
}

function Sidebar(props: {
  collapsed: boolean;
  route: RouteId;
  setRoute: (route: RouteId) => void;
  selectedProject: FactoryProject | null;
}) {
  return (
    <aside className={`sidebar ${props.collapsed ? "collapsed" : ""}`}>
      <div className="brand">
        <Boxes size={22} />
        <span>Long/Short Factory</span>
      </div>
      <nav aria-label="Workspace navigation">
        <NavGroup items={workspaceRoutes} route={props.route} setRoute={props.setRoute} collapsed={props.collapsed} />
        {props.selectedProject ? (
          <>
            <div className="nav-heading">Project</div>
            <NavGroup items={projectRoutes} route={props.route} setRoute={props.setRoute} collapsed={props.collapsed} selectedProject={props.selectedProject} />
          </>
        ) : null}
      </nav>
    </aside>
  );
}

function NavGroup(props: {
  items: Array<{ id: RouteId; label: string }>;
  route: RouteId;
  setRoute: (route: RouteId) => void;
  collapsed: boolean;
  selectedProject?: FactoryProject | null;
}) {
  const stageStatusByRoute = props.selectedProject ? routeStageStatuses(props.selectedProject) : new Map<RouteId, WorkflowStageStatus>();
  return (
    <div className="nav-group">
      {props.items.map((item) => {
        const Icon = routeIcons[item.id];
        const status = stageStatusByRoute.get(item.id);
        return (
          <button
            className={`nav-button ${props.route === item.id ? "active" : ""}`}
            key={item.id}
            title={props.collapsed ? item.label : undefined}
            type="button"
            onClick={() => props.setRoute(item.id)}
          >
            <Icon size={17} />
            <span>{item.label}</span>
            {status ? <small className={`nav-status tone-${statusTone(status)}`}>{status.replaceAll("_", " ")}</small> : null}
          </button>
        );
      })}
    </div>
  );
}

function routeStageStatuses(project: FactoryProject): Map<RouteId, WorkflowStageStatus> {
  const statuses = new Map<RouteId, WorkflowStageStatus>();
  const eligibilities = resolveStageEligibilities(project);
  for (const route of projectRoutes) {
    const stageIds: Set<string> = new Set(workflowStageDefinitions.filter((stage) => stage.screenRoute === route.id).map((stage) => stage.id));
    const routeEligibilities = eligibilities.filter((eligibility) => stageIds.has(eligibility.stageId));
    const status = routeEligibilities.find((eligibility) => eligibility.status !== "approved")?.status ?? routeEligibilities.at(-1)?.status;
    if (status) statuses.set(route.id, status);
  }
  return statuses;
}

function statusTone(status: WorkflowStageStatus): "success" | "warning" | "danger" | "info" | "default" {
  if (status === "approved") return "success";
  if (status === "blocked" || status === "not_started" || status === "stale") return "warning";
  if (status === "failed" || status === "rejected") return "danger";
  if (status === "running" || status === "queued" || status === "needs_review" || status === "ready") return "info";
  return "default";
}

function TopBar(props: {
  collapsed: boolean;
  onToggle: () => void;
  route: RouteId;
  selectedProject: FactoryProject | null;
  selectedProfile: ChannelProfile | undefined;
  projects: ProjectSummary[];
  queue: QueueSnapshot;
  onOpenProject: (projectId: string) => Promise<void>;
  setRoute: (route: RouteId) => void;
}) {
  const saveState = props.selectedProject ? "SQLite saved" : "No open save";
  const status = props.selectedProject ? currentStage(props.selectedProject) : "Idle";
  return (
    <header className="topbar">
      <button className="icon-button" onClick={props.onToggle} type="button" aria-label="Toggle sidebar">
        {props.collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
      </button>
      <div className="topbar-project">
        <strong>{props.selectedProject?.setup.projectName ?? props.selectedProject?.topic ?? "No project open"}</strong>
        <span>
          {routeLabel(props.route)} / {status} / {saveState}
          {props.selectedProfile ? ` / ${props.selectedProfile.name}` : ""}
        </span>
      </div>
      <div className="topbar-actions">
        <label className="project-switcher">
          <span>Project</span>
          <select
            value={props.selectedProject?.id ?? ""}
            onChange={(event) => {
              if (event.target.value) void props.onOpenProject(event.target.value);
            }}
          >
            <option value="">No project open</option>
            {props.projects.map((project) => (
              <option key={project.id} value={project.id}>{project.projectName || project.topic}</option>
            ))}
          </select>
        </label>
        <div className="search-placeholder" aria-label="Search unavailable">
          <Search size={15} />
          <span>Search unavailable</span>
        </div>
        <button className="queue-chip" type="button" onClick={() => props.setRoute("production-queue")}>
          <Play size={15} />
          {props.queue.running} running / {props.queue.jobs.length} jobs
        </button>
        <button className="icon-button" type="button" aria-label="Open settings" onClick={() => props.setRoute("settings")}>
          <Settings size={17} />
        </button>
      </div>
    </header>
  );
}

export function LoadingScreen() {
  return (
    <div className="skeleton-stack" aria-label="Loading application state">
      <div />
      <div />
      <div />
    </div>
  );
}
