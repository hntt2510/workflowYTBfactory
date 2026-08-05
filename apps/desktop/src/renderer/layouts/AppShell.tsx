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
  MonitorPlay,
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
import { useRef, type ReactNode } from "react";
import { resolveStageEligibilities, workflowStageDefinitions } from "@lsf/domain";
import type { ChannelProfile, FactoryProject, WorkflowStageStatus } from "@lsf/domain";
import { projectRoutes, type RouteId, workspaceRoutes } from "../navigation";
import type { ProjectSummary, QueueSnapshot } from "../types";
import { currentStage } from "../utils";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { creatorPhaseDefinitions, creatorPhaseStateLabel, creatorRouteLabel, creatorStatusLabel } from "../creatorStudioCopy";

gsap.registerPlugin(useGSAP);

const routeIcons: Record<RouteId, LucideIcon> = {
  dashboard: Gauge,
  projects: FolderKanban,
  create: Plus,
  production: Play,
  "scene-review": Video,
  "final-preview": MonitorPlay,
  "advanced-pipeline": ListChecks,
  "new-project": Plus,
  "project-overview": Layers3,
  "channel-profiles": Route,
  "reference-intake": FileText,
  "competitor-dna": Search,
  "idea-lab": FlaskConical,
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
        {props.selectedProject ? <ProjectPhaseStepper project={props.selectedProject} route={props.route} setRoute={props.setRoute} /> : null}
        <section className="content-scroll"><RouteTransition route={props.route}>{props.children}</RouteTransition></section>
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
      </nav>
    </aside>
  );
}

function RouteTransition(props: { route: RouteId; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add({ reduceMotion: "(prefers-reduced-motion: reduce)" }, (context) => {
      const panel = root.current;
      if (!panel) return;
      gsap.set(panel, { autoAlpha: 1, y: 0 });
      if (context.conditions?.reduceMotion) return;
      const timeline = gsap.timeline({ defaults: { duration: 0.2, ease: "power2.out" } });
      timeline.fromTo(panel, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0 });
    }, root);
    return () => media.revert();
  }, { scope: root, dependencies: [props.route], revertOnUpdate: true });
  return <div ref={root} data-route={props.route}>{props.children}</div>;
}

function ProjectPhaseStepper(props: { project: FactoryProject; route: RouteId; setRoute: (route: RouteId) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const statuses = new Map(props.project.stages.map((stage) => [stage.id, stage.status]));
  useGSAP(() => {
    const items = gsap.utils.toArray<HTMLElement>(".phase-step", root.current ?? undefined);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timeline = gsap.timeline({ defaults: { duration: 0.2, ease: "power2.out" } });
    timeline.fromTo(items, { y: -5, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.035 });
  }, { scope: root, dependencies: [props.route], revertOnUpdate: true });
  return <div className="phase-stepper" ref={root} aria-label="Production phases">
    {creatorPhaseDefinitions.map((phase, index) => {
      const phaseStatuses = phase.stageIds.map((stageId) => statuses.get(stageId) ?? "not_started");
      const state = phaseStatuses.every((status) => status === "approved") ? "complete" : phaseStatuses.some((status) => status === "running" || status === "needs_review") ? "current" : "upcoming";
      return <button className={`phase-step phase-${state} ${props.route === phase.route ? "active" : ""}`} key={phase.id} type="button" onClick={() => props.setRoute(phase.route)}>
        <span className="phase-number">{index + 1}</span><span className="phase-copy"><strong>{phase.label}</strong><small>{creatorPhaseStateLabel(state === "complete" ? "complete" : state === "current" ? "current" : "not_started")}</small></span>
      </button>;
    })}
  </div>;
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
            {status ? <small className={`nav-status tone-${statusTone(status)}`}>{creatorStatusLabel(status)}</small> : null}
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
  const saveState = props.selectedProject ? "Đã lưu" : "Chưa mở dự án";
  const status = props.selectedProject ? creatorStatusLabel(currentStage(props.selectedProject)) : "Đang chờ";
  return (
    <header className="topbar">
      <button className="icon-button" onClick={props.onToggle} type="button" aria-label="Toggle sidebar">
        {props.collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
      </button>
      <div className="topbar-project">
        <strong>{props.selectedProject?.setup.projectName ?? props.selectedProject?.topic ?? "Chưa mở dự án"}</strong>
        <span>
          {creatorRouteLabel(props.route)} · {status} · {saveState}
          {props.selectedProfile ? ` / ${props.selectedProfile.name}` : ""}
        </span>
      </div>
      <div className="topbar-actions">
        <label className="project-switcher">
          <span>Dự án</span>
          <select
            value={props.selectedProject?.id ?? ""}
            onChange={(event) => {
              if (event.target.value) void props.onOpenProject(event.target.value);
            }}
          >
            <option value="">Chưa mở dự án</option>
            {props.projects.map((project) => (
              <option key={project.id} value={project.id}>{project.projectName || project.topic}</option>
            ))}
          </select>
        </label>
        <div className="search-placeholder" aria-label="Search unavailable">
          <Search size={15} />
          <span>Tìm kiếm</span>
        </div>
        <button className="queue-chip" type="button" onClick={() => props.setRoute("production-queue")}>
          <Play size={15} />
          {props.queue.running} đang chạy · {props.queue.jobs.length} tác vụ
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
