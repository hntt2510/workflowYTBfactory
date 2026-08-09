import { useEffect, useMemo, useState } from "react";
import { actionDefinitions, getActionState, resolveProjectCheckpoints, type ActionId, type FactoryProject } from "@lsf/domain";
import { PageHeader, SectionCard, StatusBadge } from "../../components/ui";
import type { RouteId } from "../../navigation";
import { factoryClient } from "../../services/factoryClient";
import type { ActionRunView } from "../../types";

const stateTone: Record<string, "default" | "info" | "success" | "warning" | "danger"> = {
  not_applicable: "default", locked: "default", ready: "info", running: "info", waiting_user: "warning", needs_review: "warning", complete: "success", error: "danger", stale: "warning",
  READY: "info", RUNNING: "info", WAITING_USER: "warning", BLOCKED: "default", SUCCESS: "success", ERROR: "danger"
};

export function CheckpointWorkspace(props: { project: FactoryProject; setRoute: (route: RouteId) => void; setSelectedProject: (project: FactoryProject) => void; }) {
  const [runs, setRuns] = useState<ActionRunView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<ActionId | null>(null);
  const load = async () => setRuns(await factoryClient.listActionRuns({ projectId: props.project.id }));

  useEffect(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : String(reason))); }, [props.project.id]);
  const progress = useMemo(() => resolveProjectCheckpoints(props.project, runs), [props.project, runs]);

  async function begin(actionId: ActionId, route: RouteId): Promise<void> {
    setBusyAction(actionId);
    setError(null);
    try {
      await factoryClient.startProjectAction({ projectId: props.project.id, actionId });
      await load();
      props.setRoute(route);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusyAction(null);
    }
  }

  return <>
    <PageHeader eyebrow="PROJECT WORKSPACE" title={props.project.setup.projectName} description="Nội dung được tổ chức theo checkpoint; điều hướng checkpoint không tự gọi AI. Chọn hành động khi bạn sẵn sàng chạy hoặc nhập nội dung." />
    <SectionCard title="Tiến độ checkpoint" description={`${progress.completedCount}/${progress.totalCount} checkpoint bắt buộc đã hoàn tất.`}>
      <div className="status-grid" aria-label="Project checkpoints">
        {progress.checkpoints.map((checkpoint) => {
          const actions = actionDefinitions.filter((action) => action.checkpointId === checkpoint.definition.id);
          return <div className="status-row" key={checkpoint.definition.id}>
            <button type="button" className="button secondary compact" onClick={() => props.setRoute(checkpoint.definition.route)}>{checkpoint.definition.order}. {checkpoint.definition.label}</button>
            <StatusBadge tone={stateTone[checkpoint.state] ?? "default"}>{checkpoint.state.replaceAll("_", " ")}</StatusBadge>
            <small>{checkpoint.blockingReason ?? (checkpoint.state === "not_applicable" ? "Không áp dụng cho loại dự án này." : "")}</small>
            <div className="button-row">
              {actions.map((action) => {
                const runtime = getActionState(props.project, action.id, runs);
                const disabled = runtime.state === "BLOCKED" || runtime.state === "RUNNING" || busyAction !== null;
                return <button key={action.id} className="button secondary compact" type="button" disabled={disabled} title={runtime.reason} onClick={() => void begin(action.id, checkpoint.definition.route)}>
                  {busyAction === action.id ? "Đang mở…" : action.label} · {runtime.state}
                </button>;
              })}
            </div>
          </div>;
        })}
      </div>
    </SectionCard>
    <div className="button-row"><button className="button secondary compact" type="button" onClick={() => props.setRoute("reference-intake")}>Mở tài liệu tham khảo</button></div>
    {runs.length ? <SectionCard title="Action runtime" description="Tiến độ chỉ hiển thị phần trăm khi có đơn vị công việc thực tế.">
      <div className="status-grid">{runs.slice(0, 8).map((run) => <div className="status-row" key={run.id}>
        <span>{run.actionId}</span><StatusBadge tone={stateTone[run.state] ?? "default"}>{run.state}</StatusBadge>
        <small>{run.progress.mode === "determinate" ? `${run.progress.completedUnits}/${run.progress.totalUnits} ${run.progress.message}` : run.progress.message}</small>
      </div>)}</div>
    </SectionCard> : null}
    {error ? <SectionCard title="Action cần xử lý"><p className="error-message">{error}</p></SectionCard> : null}
  </>;
}
