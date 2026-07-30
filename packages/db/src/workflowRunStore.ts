import type { WorkflowArtifact, WorkflowStageRun } from "@lsf/domain";
import type { FactoryDatabase } from "./connection";

interface StageRunRow {
  id: string;
  project_id: string;
  stage_id: string;
  status: WorkflowStageRun["status"];
  runner_id: string;
  runner_version: string;
  provider_id: string | null;
  configured_model_id: string | null;
  returned_model_id: string | null;
  prompt_template_id: string | null;
  prompt_version: string | null;
  input_artifact_ids_json: string;
  input_fingerprint: string;
  output_artifact_ids_json: string;
  safe_error_category: string | null;
  safe_error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
}

interface ArtifactRow {
  id: string;
  project_id: string;
  stage_id: string;
  stage_run_id: string | null;
  type: string;
  version: number;
  status: WorkflowArtifact["status"];
  payload_json: string | null;
  relative_file_path: string | null;
  created_at: string;
  updated_at: string;
}

export class WorkflowRunStore {
  constructor(private readonly db: FactoryDatabase) {}

  createRun(run: WorkflowStageRun): void {
    this.db.prepare(
      `INSERT INTO workflow_stage_runs (
        id, project_id, stage_id, status, runner_id, runner_version, provider_id,
        configured_model_id, returned_model_id, prompt_template_id, prompt_version,
        input_artifact_ids_json, input_fingerprint, output_artifact_ids_json,
        safe_error_category, safe_error_message, started_at, finished_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      run.id, run.projectId, run.stageId, run.status, run.runnerId, run.runnerVersion,
      run.providerId ?? null, run.configuredModelId ?? null, run.returnedModelId ?? null,
      run.promptTemplateId ?? null, run.promptVersion ?? null, JSON.stringify(run.inputArtifactIds),
      run.inputFingerprint, JSON.stringify(run.outputArtifactIds), run.safeErrorCategory ?? null,
      run.safeErrorMessage ?? null, run.startedAt ?? null, run.finishedAt ?? null
    );
  }

  completeRun(run: WorkflowStageRun, artifact: WorkflowArtifact, options: { withinTransaction?: boolean } = {}): void {
    if (!options.withinTransaction) this.db.exec("BEGIN IMMEDIATE;");
    try {
      this.createRun(run);
      this.saveArtifact(artifact);
      if (!options.withinTransaction) this.db.exec("COMMIT;");
    } catch (error) {
      if (!options.withinTransaction) this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  findLatestByInput(projectId: string, stageId: string, inputFingerprint: string): WorkflowStageRun | null {
    const row = this.db.prepare(
      `SELECT * FROM workflow_stage_runs
       WHERE project_id = ? AND stage_id = ? AND input_fingerprint = ?
       ORDER BY created_at DESC LIMIT 1`
    ).get(projectId, stageId, inputFingerprint) as StageRunRow | undefined;
    return row ? toStageRun(row) : null;
  }

  listRuns(projectId: string, stageId: string): WorkflowStageRun[] {
    return (this.db.prepare(
      "SELECT * FROM workflow_stage_runs WHERE project_id = ? AND stage_id = ? ORDER BY created_at DESC"
    ).all(projectId, stageId) as unknown as StageRunRow[]).map(toStageRun);
  }

  listArtifacts(projectId: string, stageId: string): WorkflowArtifact[] {
    return (this.db.prepare(
      "SELECT * FROM workflow_artifacts WHERE project_id = ? AND stage_id = ? ORDER BY version DESC"
    ).all(projectId, stageId) as unknown as ArtifactRow[]).map(toArtifact);
  }

  approveReviewRun(runId: string): void {
    const result = this.db.prepare(
      "UPDATE workflow_stage_runs SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'needs_review'"
    ).run(runId);
    if (result.changes !== 1) throw new Error("Stage run is not awaiting review.");
    this.db.prepare(
      "UPDATE workflow_artifacts SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE stage_run_id = ? AND status = 'needs_review'"
    ).run(runId);
  }

  rejectReviewRun(runId: string): void {
    const result = this.db.prepare(
      "UPDATE workflow_stage_runs SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'needs_review'"
    ).run(runId);
    if (result.changes !== 1) throw new Error("Stage run is not awaiting review.");
    this.db.prepare(
      "UPDATE workflow_artifacts SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE stage_run_id = ? AND status = 'needs_review'"
    ).run(runId);
  }

  finishRun(run: WorkflowStageRun, artifact?: WorkflowArtifact, options: { withinTransaction?: boolean } = {}): void {
    if (!options.withinTransaction) this.db.exec("BEGIN IMMEDIATE;");
    try {
      const result = this.db.prepare(
        `UPDATE workflow_stage_runs SET
          status = ?, returned_model_id = ?, output_artifact_ids_json = ?, safe_error_category = ?,
          safe_error_message = ?, finished_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'running'`
      ).run(
        run.status, run.returnedModelId ?? null, JSON.stringify(run.outputArtifactIds),
        run.safeErrorCategory ?? null, run.safeErrorMessage ?? null, run.finishedAt ?? null, run.id
      );
      if (result.changes !== 1) throw new Error("Stage run is not running.");
      if (artifact) this.saveArtifact(artifact);
      if (!options.withinTransaction) this.db.exec("COMMIT;");
    } catch (error) {
      if (!options.withinTransaction) this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  markProjectArtifactsStale(projectId: string): void {
    this.db.prepare(
      "UPDATE workflow_artifacts SET status = 'stale', updated_at = CURRENT_TIMESTAMP WHERE project_id = ? AND status IN ('needs_review', 'approved')"
    ).run(projectId);
    this.db.prepare(
      "UPDATE workflow_stage_runs SET status = 'stale', updated_at = CURRENT_TIMESTAMP WHERE project_id = ? AND status = 'approved'"
    ).run(projectId);
  }

  recoverInterruptedRuns(): number {
    return Number(this.db.prepare("UPDATE workflow_stage_runs SET status = 'failed', safe_error_category = 'interrupted', safe_error_message = 'The previous application session ended before this run completed.', finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE status IN ('queued', 'running') AND runner_version NOT LIKE 'voice-generation-tts-job-v1:%'").run().changes);
  }

  private saveArtifact(artifact: WorkflowArtifact): void {
    this.db.prepare(
      `INSERT INTO workflow_artifacts (
        id, project_id, stage_id, stage_run_id, type, version, status, payload_json, relative_file_path, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      artifact.id, artifact.projectId, artifact.stageId, artifact.stageRunId ?? null,
      artifact.type, artifact.version, artifact.status, artifact.payloadJson ? JSON.stringify(artifact.payloadJson) : null,
      artifact.relativeFilePath ?? null, artifact.createdAt, artifact.updatedAt
    );
  }
}

function toStageRun(row: StageRunRow): WorkflowStageRun {
  return {
    id: row.id, projectId: row.project_id, stageId: row.stage_id, status: row.status,
    runnerId: row.runner_id, runnerVersion: row.runner_version,
    ...(row.provider_id ? { providerId: row.provider_id } : {}),
    ...(row.configured_model_id ? { configuredModelId: row.configured_model_id } : {}),
    ...(row.returned_model_id ? { returnedModelId: row.returned_model_id } : {}),
    ...(row.prompt_template_id ? { promptTemplateId: row.prompt_template_id } : {}),
    ...(row.prompt_version ? { promptVersion: row.prompt_version } : {}),
    inputArtifactIds: JSON.parse(row.input_artifact_ids_json) as string[], inputFingerprint: row.input_fingerprint,
    outputArtifactIds: JSON.parse(row.output_artifact_ids_json) as string[],
    ...(row.started_at ? { startedAt: row.started_at } : {}), ...(row.finished_at ? { finishedAt: row.finished_at } : {}),
    ...(row.safe_error_category ? { safeErrorCategory: row.safe_error_category } : {}),
    ...(row.safe_error_message ? { safeErrorMessage: row.safe_error_message } : {})
  };
}

function toArtifact(row: ArtifactRow): WorkflowArtifact {
  return {
    id: row.id, projectId: row.project_id, stageId: row.stage_id, ...(row.stage_run_id ? { stageRunId: row.stage_run_id } : {}),
    type: row.type, version: row.version, status: row.status,
    ...(row.payload_json ? { payloadJson: JSON.parse(row.payload_json) as Record<string, unknown> } : {}),
    ...(row.relative_file_path ? { relativeFilePath: row.relative_file_path } : {}),
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}
