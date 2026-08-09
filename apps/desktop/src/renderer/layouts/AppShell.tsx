import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderKanban,
  Gauge,
  HardDrive,
  Image,
  KeyRound,
  ListChecks,
  Mic2,
  MonitorPlay,
  Play,
  Plus,
  Route,
  Settings,
  ShieldCheck,
  TerminalSquare,
  Video
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { ChannelProfile, FactoryProject } from "@lsf/domain";
import { creatorPhaseDefinitions, creatorRouteLabel, creatorStageLabel, creatorStatusLabel } from "../creatorStudioCopy";
import { sidebarRouteGroups, type RouteDefinition, type RouteId } from "../navigation";
import type { ActionRunView, ProjectSummary, QueueSnapshot } from "../types";
import { currentStage } from "../utils";

gsap.registerPlugin(useGSAP);

const routeIcons: Record<RouteId, LucideIcon> = {
  content: FileText,
  director: Video,
  assets: Image,
  build: MonitorPlay,
  dashboard: Gauge,
  projects: FolderKanban,
  create: Plus,
  production: Play,
  "scene-review": Video,
  "final-preview": MonitorPlay,
  export: ListChecks,
  "advanced-pipeline": ListChecks,
  "new-project": Plus,
  "project-overview": FileText,
  "channel-profiles": Route,
  "reference-intake": FileText,
  "competitor-dna": FileText,
  "idea-lab": FileText,
  script: FileText,
  scenes: Video,
  shots: Boxes,
  visuals: Image,
  voice: Mic2,
  timeline: ListChecks,
  qa: ShieldCheck,
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
  actionRuns: ActionRunView[];
  onOpenProject: (projectId: string) => Promise<void>;
  setRoute: (route: RouteId) => void;
}) {
  return (
    <main className="admin-shell studio-shell">
      <Sidebar collapsed={props.collapsed} route={props.route} setRoute={props.setRoute} selectedProject={props.selectedProject} />
      <section className="app-main">
        <TopBar
          collapsed={props.collapsed}
          onToggle={props.onToggleSidebar}
          route={props.route}
          selectedProject={props.selectedProject}
          selectedProfile={props.selectedProfile}
          projects={props.projects}
          queue={props.queue} actionRuns={props.actionRuns}
          onOpenProject={props.onOpenProject}
          setRoute={props.setRoute}
        />
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
        <span className="brand-mark"><Boxes size={19} /></span>
        <span>Long/Short Factory</span>
      </div>
      <nav className="sidebar-navigation" aria-label="Điều hướng ứng dụng">
        {sidebarRouteGroups.map((group) => (
          <div className="sidebar-section" key={group.id}>
            <p className="nav-heading">{group.label}</p>
            <NavGroup items={group.items} route={props.route} setRoute={props.setRoute} collapsed={props.collapsed} hasProject={Boolean(props.selectedProject)} />
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span className="sidebar-footer-dot" />
        <span>{props.selectedProject ? "Bản nháp cục bộ" : "Chưa mở dự án"}</span>
      </div>
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
      gsap.timeline({ defaults: { duration: 0.2, ease: "power2.out" } })
        .fromTo(panel, { autoAlpha: 0, y: 7 }, { autoAlpha: 1, y: 0 });
    }, root);
    return () => media.revert();
  }, { scope: root, dependencies: [props.route], revertOnUpdate: true });
  return <div ref={root} data-route={props.route}>{props.children}</div>;
}

function ProjectPhaseStepper(props: { project: FactoryProject; route: RouteId; setRoute: (route: RouteId) => void }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add({ reduceMotion: "(prefers-reduced-motion: reduce)" }, (context) => {
      const items = gsap.utils.toArray<HTMLElement>(".phase-step", root.current ?? undefined);
      gsap.set(items, { autoAlpha: 1, y: 0 });
      if (context.conditions?.reduceMotion) return;
      gsap.timeline({ defaults: { duration: 0.18, ease: "power2.out" } })
        .fromTo(items, { autoAlpha: 0, y: -5 }, { autoAlpha: 1, y: 0, stagger: 0.035 });
    }, root);
    return () => media.revert();
  }, { scope: root, dependencies: [props.route, props.project.id], revertOnUpdate: true });

  return (
    <div className="phase-stepper" ref={root} aria-label="Lộ trình sản xuất">
      {creatorPhaseDefinitions.map((phase, index) => {
        const active = phaseRouteMatches(phase.id, props.route);
        const rawState = phaseState(props.project, phase.stageIds, index);
        const state = active && rawState === "ready" ? "current" : rawState;
        return (
          <button className={`phase-step phase-${state} ${active ? "active" : ""}`} key={phase.id} type="button" disabled={state === "locked"} aria-current={active ? "step" : undefined} onClick={() => props.setRoute(phase.route)}>
            <span className="phase-number">{index + 1}</span>
            <span className="phase-copy"><strong>{phase.label}</strong><small>{phase.description}</small></span>
            <span className="phase-state">{creatorStatusLabel(state)}</span>
          </button>
        );
      })}
    </div>
  );
}

type CreatorPhaseState = "complete" | "current" | "attention" | "locked" | "ready";

function phaseState(project: FactoryProject, stageIds: readonly string[], index: number): Exclude<CreatorPhaseState, "current"> {
  const statuses = stageIds.map((stageId) => project.stages.find((stage) => stage.id === stageId)?.status ?? "not_started");
  if (statuses.some((status) => ["needs_attention", "failed", "rejected", "stale"].includes(status))) return "attention";
  const applicable = statuses;
  if (applicable.length > 0 && applicable.every((status) => status === "approved")) return "complete";
  if (statuses.some((status) => ["running", "queued", "needs_review"].includes(status))) return "ready";
  const priorPhasesComplete = creatorPhaseDefinitions.slice(0, index).every((phase) => {
    const priorStatuses = phase.stageIds.map((stageId) => project.stages.find((stage) => stage.id === stageId)?.status ?? "not_started");
    const priorApplicable = priorStatuses;
    return priorApplicable.length > 0 && priorApplicable.every((status) => status === "approved");
  });
  return priorPhasesComplete ? "ready" : "locked";
}

function phaseRouteMatches(phaseId: string, route: RouteId): boolean {
  if (phaseId === "brief") return ["content", "project-overview"].includes(route);
  if (phaseId === "story") return ["script", "idea-lab", "reference-intake", "competitor-dna"].includes(route);
  if (phaseId === "director") return ["director", "scenes", "shots", "visuals"].includes(route);
  if (phaseId === "assets") return ["assets", "scene-review"].includes(route);
  return ["build", "voice", "timeline", "qa", "final-preview", "export"].includes(route);
}

function NavGroup(props: {
  items: readonly RouteDefinition[];
  route: RouteId;
  setRoute: (route: RouteId) => void;
  collapsed: boolean;
  hasProject: boolean;
}) {
  return (
    <div className="nav-group">
      {props.items.map((item) => {
        const Icon = routeIcons[item.id];
        return (
          <button className={`nav-button ${props.route === item.id ? "active" : ""}`} data-route={item.id} key={item.id} title={item.requiresProject && !props.hasProject ? "Cần mở dự án trước." : props.collapsed ? item.label : undefined} type="button" disabled={item.requiresProject && !props.hasProject} onClick={() => props.setRoute(item.id)}>
            <Icon size={17} />
            <span>{item.label}{item.legacy ? <small className="nav-legacy-badge">Legacy</small> : null}{item.requiresProject && !props.hasProject ? <small className="nav-disabled-reason">Cần mở dự án trước.</small> : null}</span>
          </button>
        );
      })}
    </div>
  );
}

function TopBar(props: {
  collapsed: boolean;
  onToggle: () => void;
  route: RouteId;
  selectedProject: FactoryProject | null;
  selectedProfile: ChannelProfile | undefined;
  projects: ProjectSummary[];
  queue: QueueSnapshot;
  actionRuns: ActionRunView[];
  onOpenProject: (projectId: string) => Promise<void>;
  setRoute: (route: RouteId) => void;
}) {
  const saveState = props.selectedProject ? "Đã lưu cục bộ" : "Chưa mở dự án";
  const stage = props.selectedProject ? creatorStageLabel(currentStage(props.selectedProject)) : "Chọn một dự án để bắt đầu";
  const [runtimeOpen, setRuntimeOpen] = useState(false);
  const activeRuns = props.actionRuns.filter((run) => ["queued", "running", "waiting_user", "failed"].includes(run.state));
  return (
    <header className="topbar">
      <button className="icon-button topbar-toggle" onClick={props.onToggle} type="button" aria-label="Thu gọn hoặc mở thanh điều hướng">
        {props.collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
      </button>
      <div className="topbar-project">
        <span className="topbar-breadcrumb">{creatorRouteLabel(props.route)}</span>
        <strong>{props.selectedProject?.setup.projectName ?? props.selectedProject?.topic ?? "Long/Short Factory"}</strong>
        <span>{stage} · {saveState}{props.selectedProfile ? ` · ${props.selectedProfile.name}` : ""}</span>
      </div>
      <div className="topbar-actions">
        <label className="project-switcher">
          <span>Dự án</span>
          <select value={props.selectedProject?.id ?? ""} onChange={(event) => { if (event.target.value) void props.onOpenProject(event.target.value); }}>
            <option value="">Chọn dự án</option>
            {props.projects.map((project) => <option key={project.id} value={project.id}>{project.projectName || project.topic}</option>)}
          </select>
        </label>
        {activeRuns.length ? <button className="queue-chip" type="button" onClick={() => setRuntimeOpen((value) => !value)}><Play size={15} /> {activeRuns.length} tác vụ</button> : null}
        <button className="icon-button" type="button" aria-label="Mở cài đặt" onClick={() => props.setRoute("settings")}><Settings size={17} /></button>
      </div>
      {runtimeOpen ? <div className="runtime-drawer" role="dialog" aria-label="Action runtime">{activeRuns.map((run) => <div className="status-row" key={run.id}><span>{run.actionId}</span><small>{run.state} · {run.progress.mode === "determinate" ? `${run.progress.completedUnits}/${run.progress.totalUnits}` : run.progress.message}{run.safeErrorMessage ? ` · ${run.safeErrorMessage}` : ""}</small></div>)}</div> : null}
    </header>
  );
}

export function LoadingScreen() {
  return <div className="skeleton-stack" aria-label="Đang tải trạng thái ứng dụng"><div /><div /><div /></div>;
}
