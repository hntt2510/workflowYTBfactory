import { useEffect, useMemo, useState } from "react";
import { actionDefinitions, getActionState, resolveProjectCheckpoints, type ActionId, type CheckpointId } from "@lsf/domain";
import { PageHeader, SectionCard, StatusBadge } from "../../components/ui";
import { ProjectStudioScreen } from "../studio/ProjectStudioScreen";
import { CompetitorDnaScreen, ReferenceIntakeScreen } from "../story/StoryScreens";
import type { ProjectWorkspaceProps } from "../studio/types";
import type { RouteId } from "../../navigation";
import { factoryClient } from "../../services/factoryClient";
import type { ActionRunView } from "../../types";

const stateTone: Record<string, "default" | "info" | "success" | "warning" | "danger"> = {
  not_applicable: "default", locked: "default", ready: "info", running: "info", waiting_user: "warning", needs_review: "warning", complete: "success", error: "danger", stale: "warning",
  READY: "info", RUNNING: "info", WAITING_USER: "warning", BLOCKED: "default", SUCCESS: "success", ERROR: "danger"
};

const checkpointForRoute: Partial<Record<RouteId, CheckpointId>> = {
  "reference-intake": "research", "competitor-dna": "research", "idea-lab": "idea", script: "script", director: "director", scenes: "director", shots: "storyboard", visuals: "prompts", assets: "images", "project-overview": "brief"
};

export function CheckpointWorkspace(props: ProjectWorkspaceProps) {
  const [runs, setRuns] = useState<ActionRunView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<ActionId | null>(null);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<CheckpointId>("brief");
  const load = async () => setRuns(await factoryClient.listActionRuns({ projectId: props.project.id }));

  useEffect(() => {
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
    const timer = window.setInterval(() => { void load().catch(() => undefined); }, 1_000);
    return () => window.clearInterval(timer);
  }, [props.project.id]);
  const progress = useMemo(() => resolveProjectCheckpoints(props.project, runs), [props.project, runs]);
  const active = progress.checkpoints.find((checkpoint) => checkpoint.definition.id === selectedCheckpoint) ?? progress.checkpoints[0]!;

  async function begin(actionId: ActionId): Promise<void> {
    setBusyAction(actionId);
    setError(null);
    try {
      await factoryClient.startProjectAction({ projectId: props.project.id, actionId });
      await load();
      await props.onRefresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      await load();
    } finally {
      setBusyAction(null);
    }
  }

  function navigateInsideWorkspace(route: RouteId): void {
    if (route === "competitor-dna") { setSelectedCheckpoint("research"); return; }
    const checkpoint = checkpointForRoute[route];
    if (checkpoint) setSelectedCheckpoint(checkpoint);
    else props.setRoute(route);
  }

  return <>
    <PageHeader eyebrow="PROJECT WORKSPACE" title={props.project.setup.projectName} description="Chọn checkpoint để thay đổi nội dung ngay trong workspace. Điều hướng không gọi AI; chỉ nút hành động mới thực thi." />
    <SectionCard title="Tiến độ project" description={`${progress.completedCount}/${progress.totalCount} checkpoint bắt buộc đã hoàn tất.`}>
      <div className="status-grid" aria-label="Project checkpoints">
        {progress.checkpoints.map((checkpoint) => <button className="status-row" type="button" key={checkpoint.definition.id} onClick={() => setSelectedCheckpoint(checkpoint.definition.id)}>
          <span>{checkpoint.definition.order}. {checkpoint.definition.label}</span>
          <StatusBadge tone={stateTone[checkpoint.state] ?? "default"}>{checkpoint.state.replaceAll("_", " ")}</StatusBadge>
          <small>{checkpoint.blockingReason ?? (checkpoint.state === "not_applicable" ? "Không áp dụng." : "Mở checkpoint")}</small>
        </button>)}
      </div>
    </SectionCard>
    <div className="button-row"><button className="button secondary compact" type="button" onClick={() => setSelectedCheckpoint("research")}>Mở tài liệu tham khảo</button></div>
    <SectionCard title={active.definition.label} description={active.blockingReason ?? "Nội dung và hành động của checkpoint hiện tại."}>
      <div className="button-row">
        {actionDefinitions.filter((action) => action.checkpointId === active.definition.id && ![
          "RUN_TRANSCRIPT_CLEANING", "RUN_REFERENCE_SEGMENTATION", "GENERATE_COMPETITOR_DNA", "GENERATE_OPPORTUNITY_MAP", "SELECT_IDEA", "REVISE_SCRIPT", "APPROVE_SCRIPT"
        ].includes(action.id)).map((action) => {
          const runtime = getActionState(props.project, action.id, runs);
          const label = runtime.state === "ERROR" ? `Thử lại ${action.label}` : action.label;
          return <button key={action.id} className="button secondary compact" type="button" disabled={runtime.state === "BLOCKED" || runtime.state === "RUNNING" || runtime.state === "SUCCESS" || busyAction !== null} title={runtime.reason} onClick={() => void begin(action.id)}>{busyAction === action.id ? "Đang chạy…" : label} · {runtime.state}</button>;
        })}
      </div>
      <CheckpointContent checkpointId={active.definition.id} props={{ ...props, setRoute: navigateInsideWorkspace, startSemiAutomatic: async () => undefined }} />
    </SectionCard>
    <RuntimePanel runs={runs.filter((run) => run.checkpointId === active.definition.id)} />
    {error ? <SectionCard title="Action cần xử lý"><p className="error-message">{error}</p></SectionCard> : null}
  </>;
}

function CheckpointContent({ checkpointId, props }: { checkpointId: CheckpointId; props: ProjectWorkspaceProps }) {
  if (checkpointId === "research") return <ResearchCheckpointContent props={props} />;
  if (checkpointId === "idea") return <ProjectStudioScreen {...props} workspace="content" initialTab="ideas" />;
  if (checkpointId === "script") return <ProjectStudioScreen {...props} workspace="content" initialTab="story" />;
  if (checkpointId === "director") return <ProjectStudioScreen {...props} workspace="director" initialTab="scenes" />;
  if (checkpointId === "storyboard") return <ProjectStudioScreen {...props} workspace="director" initialTab="storyboard" />;
  if (checkpointId === "prompts") return <ProjectStudioScreen {...props} workspace="director" initialTab="prompts" />;
  if (checkpointId === "images") return <ProjectStudioScreen {...props} workspace="assets" />;
  if (checkpointId === "handoff") return <p className="muted">Handoff ghi nhận project đã hoàn tất các checkpoint tiền sản xuất. Video production legacy không thuộc G02.</p>;
  return <BriefContent project={props.project} />;
}

function ResearchCheckpointContent({ props }: { props: ProjectWorkspaceProps }) {
  return <div className="form-grid">
    <SectionCard title="1. Reference intake" description="Add or review creator-supplied transcripts, source metadata, and notes. This checkpoint never downloads or crawls sources.">
      <ReferenceIntakeScreen project={props.project} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} startSemiAutomatic={props.startSemiAutomatic} />
    </SectionCard>
    {props.project.setup.inputMode === "reference" ? <SectionCard title="2. Transcript to opportunity" description="Run and approve each card in order. Chunk progress comes from the persisted Transcript Cleaning ActionRun.">
      <CompetitorDnaScreen project={props.project} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} textCertification={props.textCertification} startSemiAutomatic={props.startSemiAutomatic} />
    </SectionCard> : <p className="muted">Topic projects can continue directly to Idea Lab; reference analysis is not required.</p>}
  </div>;
}

function BriefContent({ project }: { project: ProjectWorkspaceProps["project"] }) {
  return <div className="settings-list">
    <div><span>Chủ đề</span><strong>{project.topic}</strong></div>
    <div><span>Định dạng</span><strong>{project.format}</strong></div>
    <div><span>Ngôn ngữ</span><strong>{project.setup.language || project.targetLanguage}</strong></div>
    <div><span>Mục tiêu</span><strong>{project.setup.targetDuration}</strong></div>
    <p className="muted">Brief đã lưu là đầu vào cho các action rõ ràng ở từng checkpoint; điều hướng checkpoint không tự chạy production.</p>
  </div>;
}

function RuntimePanel({ runs }: { runs: readonly ActionRunView[] }) {
  if (!runs.length) return null;
  return <SectionCard title="Runtime checkpoint" description="Tiến độ chỉ dùng đơn vị thực tế; Cockpit không báo đơn vị được hiển thị không xác định."><div className="status-grid">{runs.map((run) => <div className="status-row" key={run.id}><span>{run.actionId}</span><StatusBadge tone={stateTone[run.state] ?? "default"}>{run.state}</StatusBadge>{run.progress.mode === "determinate" ? <progress value={run.progress.completedUnits} max={run.progress.totalUnits} aria-label={`${run.actionId} progress`} /> : null}<small>{run.progress.mode === "determinate" ? `${run.progress.completedUnits}/${run.progress.totalUnits} · ${run.progress.totalUnits ? Math.round(run.progress.completedUnits / run.progress.totalUnits * 100) : 0}% · ${run.progress.currentUnit ?? run.progress.message}` : `${run.progress.message} · bắt đầu ${new Date(run.progress.startedAt).toLocaleTimeString()}`}{run.safeErrorMessage ? ` · ${run.safeErrorMessage}` : ""}</small></div>)}</div></SectionCard>;
}
