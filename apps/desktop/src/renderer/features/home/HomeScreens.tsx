import { Plus } from "lucide-react";
import type { BootstrapData, ProjectSummary, ProviderPresence } from "../../types";
import { DataTable, DisabledAction, EmptyState, MetricCard, PageHeader, SectionCard, StatusBadge } from "../../components/ui";
import { formatDate, queueCounts } from "../../utils";
import type { RouteId } from "../../navigation";

export function Dashboard(props: {
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
