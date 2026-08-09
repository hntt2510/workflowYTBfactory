import type { ActionProgress, ActionId, CheckpointId } from "@lsf/domain";
import type { FactoryDatabase } from "./connection";

export type ActionRunState = "queued" | "running" | "waiting_user" | "success" | "failed" | "cancelled";
export interface ActionRun {
  id: string;
  projectId: string;
  checkpointId: CheckpointId;
  actionId: ActionId;
  stageId?: string;
  state: ActionRunState;
  progress: ActionProgress;
  safeErrorCode?: string;
  safeErrorMessage?: string;
  retryable: boolean;
  inputFingerprint: string;
  outputArtifactIds: string[];
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
}

interface ActionRunRow { id: string; project_id: string; checkpoint_id: CheckpointId; action_id: ActionId; stage_id: string | null; state: ActionRunState; progress_mode: ActionProgress["mode"]; completed_units: number | null; total_units: number | null; current_unit: string | null; message: string | null; safe_error_code: string | null; safe_error_message: string | null; retryable: number; input_fingerprint: string; output_artifact_ids_json: string; started_at: string | null; finished_at: string | null; updated_at: string; }

export class ActionRunStore {
  constructor(private readonly db: FactoryDatabase) {}

  create(run: ActionRun): ActionRun {
    try {
      this.db.prepare(`INSERT INTO action_runs (id, project_id, checkpoint_id, action_id, stage_id, state, progress_mode, completed_units, total_units, current_unit, message, safe_error_code, safe_error_message, retryable, input_fingerprint, output_artifact_ids_json, started_at, finished_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(run.id, run.projectId, run.checkpointId, run.actionId, run.stageId ?? null, run.state, run.progress.mode, run.progress.mode === "determinate" ? run.progress.completedUnits : null, run.progress.mode === "determinate" ? run.progress.totalUnits : null, run.progress.mode === "determinate" ? run.progress.currentUnit ?? null : null, run.progress.message, run.safeErrorCode ?? null, run.safeErrorMessage ?? null, run.retryable ? 1 : 0, run.inputFingerprint, JSON.stringify(run.outputArtifactIds), run.startedAt ?? null, run.finishedAt ?? null, run.updatedAt);
      return run;
    } catch (error) {
      if (String(error).includes("idx_action_runs_active_fingerprint") || String(error).includes("UNIQUE constraint failed")) throw new Error("An equivalent action is already active for this project.");
      throw error;
    }
  }

  list(projectId: string): ActionRun[] {
    return (this.db.prepare("SELECT * FROM action_runs WHERE project_id = ? ORDER BY updated_at DESC").all(projectId) as unknown as ActionRunRow[]).map(toActionRun);
  }

  listActive(): ActionRun[] {
    return (this.db.prepare("SELECT * FROM action_runs WHERE state IN ('queued', 'running', 'waiting_user', 'failed') ORDER BY updated_at DESC").all() as unknown as ActionRunRow[]).map(toActionRun);
  }

  update(run: ActionRun): void {
    const result = this.db.prepare(`UPDATE action_runs SET state = ?, progress_mode = ?, completed_units = ?, total_units = ?, current_unit = ?, message = ?, safe_error_code = ?, safe_error_message = ?, retryable = ?, output_artifact_ids_json = ?, started_at = ?, finished_at = ?, updated_at = ? WHERE id = ?`)
      .run(run.state, run.progress.mode, run.progress.mode === "determinate" ? run.progress.completedUnits : null, run.progress.mode === "determinate" ? run.progress.totalUnits : null, run.progress.mode === "determinate" ? run.progress.currentUnit ?? null : null, run.progress.message, run.safeErrorCode ?? null, run.safeErrorMessage ?? null, run.retryable ? 1 : 0, JSON.stringify(run.outputArtifactIds), run.startedAt ?? null, run.finishedAt ?? null, run.updatedAt, run.id);
    if (result.changes !== 1) throw new Error("Action run not found.");
  }

  recoverInterruptedRuns(): ActionRun[] {
    const rows = this.db.prepare("SELECT * FROM action_runs WHERE state IN ('queued', 'running')").all() as unknown as ActionRunRow[];
    if (!rows.length) return [];
    const finishedAt = new Date().toISOString();
    this.db.prepare(`UPDATE action_runs
      SET state = 'failed', safe_error_code = 'interrupted',
          safe_error_message = 'The previous application session ended before this action completed.',
          retryable = 1, finished_at = ?, updated_at = ?
      WHERE state IN ('queued', 'running')`).run(finishedAt, finishedAt);
    return rows.map((row) => ({ ...toActionRun(row), state: "failed" as const, safeErrorCode: "interrupted", safeErrorMessage: "The previous application session ended before this action completed.", retryable: true, finishedAt, updatedAt: finishedAt }));
  }

  markStaleForStages(projectId: string, stageIds: readonly string[]): number {
    if (!stageIds.length) return 0;
    const placeholders = stageIds.map(() => "?").join(", ");
    return Number(this.db.prepare(`UPDATE action_runs SET state = 'cancelled', message = 'Inputs changed; start this action again.', updated_at = CURRENT_TIMESTAMP
      WHERE project_id = ? AND stage_id IN (${placeholders}) AND state IN ('queued', 'running', 'waiting_user')`).run(projectId, ...stageIds).changes);
  }
}

function toActionRun(row: ActionRunRow): ActionRun {
  const progress: ActionProgress = row.progress_mode === "determinate"
    ? { mode: "determinate", completedUnits: row.completed_units ?? 0, totalUnits: row.total_units ?? 0, ...(row.current_unit ? { currentUnit: row.current_unit } : {}), message: row.message ?? "" }
    : { mode: "indeterminate", startedAt: row.started_at ?? row.updated_at, message: row.message ?? "" };
  return { id: row.id, projectId: row.project_id, checkpointId: row.checkpoint_id, actionId: row.action_id, ...(row.stage_id ? { stageId: row.stage_id } : {}), state: row.state, progress, ...(row.safe_error_code ? { safeErrorCode: row.safe_error_code } : {}), ...(row.safe_error_message ? { safeErrorMessage: row.safe_error_message } : {}), retryable: row.retryable === 1, inputFingerprint: row.input_fingerprint, outputArtifactIds: JSON.parse(row.output_artifact_ids_json) as string[], ...(row.started_at ? { startedAt: row.started_at } : {}), ...(row.finished_at ? { finishedAt: row.finished_at } : {}), updatedAt: row.updated_at };
}
