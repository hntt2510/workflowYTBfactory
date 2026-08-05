import { getWorkflowStageDefinition, perReferenceArtifactStages, semiAutomaticAutomaticStageIds, type WorkflowArtifact, type WorkflowStageRun } from "@lsf/domain";
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
  payload_json: string | null;
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

interface WorkflowApprovalMetadata {
  actor: string;
  mode: "manual" | "automatic" | "synthetic-regression";
  isUserApproval: boolean;
  approvedBy: "user" | "system";
  approvalMode: "manual" | "automatic";
  approvedAt: string;
}

interface ReviewApprovalOptions {
  withinTransaction?: boolean;
  approvalMode?: "manual" | "automatic";
}

export class WorkflowRunStore {
  constructor(private readonly db: FactoryDatabase) {}

  createRun(run: WorkflowStageRun): void {
    if (
      this.hasPendingOrAcceptedRun(run.projectId, run.stageId, run.inputFingerprint)
      || this.hasPendingTranscriptCleaningRunForReference(run)
    ) {
      throw new Error("A pending or accepted stage run already exists for this input.");
    }
    this.db.prepare(
      `INSERT INTO workflow_stage_runs (
        id, project_id, stage_id, status, runner_id, runner_version, provider_id,
        configured_model_id, returned_model_id, prompt_template_id, prompt_version,
        input_artifact_ids_json, input_fingerprint, output_artifact_ids_json,
        safe_error_category, safe_error_message, payload_json, started_at, finished_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      run.id, run.projectId, run.stageId, run.status, run.runnerId, run.runnerVersion,
      run.providerId ?? null, run.configuredModelId ?? null, run.returnedModelId ?? null,
      run.promptTemplateId ?? null, run.promptVersion ?? null, JSON.stringify(run.inputArtifactIds),
      run.inputFingerprint, JSON.stringify(run.outputArtifactIds), run.safeErrorCategory ?? null,
      run.safeErrorMessage ?? null, run.payloadJson ? JSON.stringify(run.payloadJson) : "{}", run.startedAt ?? null, run.finishedAt ?? null
    );
  }

  completeRun(run: WorkflowStageRun, artifact: WorkflowArtifact, options: { withinTransaction?: boolean } = {}): void {
    if (!options.withinTransaction) this.db.exec("BEGIN IMMEDIATE;");
    try {
      assertArtifactMatchesRun(run, artifact);
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

  private hasPendingOrAcceptedRun(projectId: string, stageId: string, inputFingerprint: string): boolean {
    const row = this.db.prepare(
      `SELECT 1 FROM workflow_stage_runs
       WHERE project_id = ? AND stage_id = ? AND input_fingerprint = ?
       AND status IN ('queued', 'running', 'needs_review', 'approved')
       LIMIT 1`
    ).get(projectId, stageId, inputFingerprint);
    if (row) return true;
    return false;
  }

  private hasPendingTranscriptCleaningRunForReference(run: WorkflowStageRun): boolean {
    if (run.stageId !== "transcript-cleaning") return false;
    const referenceId = run.payloadJson?.referenceId;
    if (typeof referenceId !== "string" || !referenceId) return false;
    const rows = this.db.prepare(
      `SELECT payload_json FROM workflow_stage_runs
       WHERE project_id = ? AND stage_id = 'transcript-cleaning'
       AND status IN ('queued', 'running', 'needs_review', 'approved')`
    ).all(run.projectId) as Array<{ payload_json: string | null }>;
    return rows.some((row) => {
      if (!row.payload_json) return false;
      try {
        return (JSON.parse(row.payload_json) as { referenceId?: unknown }).referenceId === referenceId;
      } catch {
        return false;
      }
    });
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

  getArtifact(projectId: string, artifactId: string): WorkflowArtifact | null {
    const row = this.db.prepare(
      "SELECT * FROM workflow_artifacts WHERE project_id = ? AND id = ?"
    ).get(projectId, artifactId) as ArtifactRow | undefined;
    return row ? toArtifact(row) : null;
  }

  approveReviewRun(runId: string, options: ReviewApprovalOptions = {}): void {
    this.completeReviewRun(runId, "approved", options);
  }

  rejectReviewRun(runId: string, options: { withinTransaction?: boolean } = {}): void {
    this.completeReviewRun(runId, "rejected", options);
  }

  finishRun(run: WorkflowStageRun, artifact?: WorkflowArtifact, options: { withinTransaction?: boolean } = {}): void {
    if (!options.withinTransaction) this.db.exec("BEGIN IMMEDIATE;");
    try {
      const result = this.db.prepare(
        `UPDATE workflow_stage_runs SET
          status = ?, returned_model_id = ?, output_artifact_ids_json = ?, safe_error_category = ?,
          safe_error_message = ?, payload_json = ?, finished_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'running'`
      ).run(
        run.status, run.returnedModelId ?? null, JSON.stringify(run.outputArtifactIds),
        run.safeErrorCategory ?? null, run.safeErrorMessage ?? null, run.payloadJson ? JSON.stringify(run.payloadJson) : "{}", run.finishedAt ?? null, run.id
      );
      if (result.changes !== 1) throw new Error("Stage run is not running.");
      if (artifact) {
        assertArtifactMatchesRun(run, artifact);
        this.saveArtifact(artifact);
      }
      this.persistStageAttention(run);
      if (!options.withinTransaction) this.db.exec("COMMIT;");
    } catch (error) {
      if (!options.withinTransaction) this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  markReviewAttention(runId: string, category: string, message: string, options: { withinTransaction?: boolean } = {}): void {
    if (!options.withinTransaction) this.db.exec("BEGIN IMMEDIATE;");
    try {
      const row = this.db.prepare("SELECT * FROM workflow_stage_runs WHERE id = ? AND status IN ('needs_review', 'failed')").get(runId) as StageRunRow | undefined;
      if (!row) throw new Error("Stage run is not awaiting review.");
      const payload = parseJsonRecord(row.payload_json);
      payload.attention = { code: category, message };
      const artifactResult = this.db.prepare(
        "UPDATE workflow_artifacts SET status = 'needs_attention', updated_at = CURRENT_TIMESTAMP WHERE stage_run_id = ? AND status IN ('needs_review', 'needs_attention')"
      ).run(runId);
      const runResult = this.db.prepare(
        `UPDATE workflow_stage_runs SET status = 'needs_attention', safe_error_category = ?, safe_error_message = ?, payload_json = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status IN ('needs_review', 'failed')`
      ).run(category, message, JSON.stringify(payload), runId);
      if (runResult.changes !== 1) throw new Error("Stage run is not available for attention handling.");
      if (artifactResult.changes > 1) throw new Error("Stage run has multiple review artifacts.");
      this.persistStageAttention({ ...toStageRun(row), status: "needs_attention", safeErrorCategory: category, safeErrorMessage: message, payloadJson: payload });
      if (!options.withinTransaction) this.db.exec("COMMIT;");
    } catch (error) {
      if (!options.withinTransaction) this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  updateRunPayload(runId: string, payloadJson: Record<string, unknown>): void {
    const result = this.db.prepare(
      "UPDATE workflow_stage_runs SET payload_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'running'"
    ).run(JSON.stringify(payloadJson), runId);
    if (result.changes !== 1) throw new Error("Stage run is no longer running.");
  }

  markProjectArtifactsStale(projectId: string): void {
    this.db.prepare(
      "UPDATE workflow_artifacts SET status = 'stale', updated_at = CURRENT_TIMESTAMP WHERE project_id = ? AND status IN ('needs_review', 'needs_attention', 'approved')"
    ).run(projectId);
    this.db.prepare(
      "UPDATE workflow_stage_runs SET status = 'stale', updated_at = CURRENT_TIMESTAMP WHERE project_id = ? AND status IN ('queued', 'running', 'needs_review', 'needs_attention', 'approved')"
    ).run(projectId);
  }

  markStageArtifactsStale(projectId: string, stageIds: readonly string[]): void {
    const uniqueStageIds = [...new Set(stageIds)].filter(Boolean);
    if (!uniqueStageIds.length) return;
    const placeholders = uniqueStageIds.map(() => "?").join(", ");
    this.db.prepare(
      `UPDATE workflow_artifacts SET status = 'stale', updated_at = CURRENT_TIMESTAMP WHERE project_id = ? AND stage_id IN (${placeholders}) AND status IN ('needs_review', 'needs_attention', 'approved')`
    ).run(projectId, ...uniqueStageIds);
    this.db.prepare(
      `UPDATE workflow_stage_runs SET status = 'stale', updated_at = CURRENT_TIMESTAMP WHERE project_id = ? AND stage_id IN (${placeholders}) AND status IN ('queued', 'running', 'needs_review', 'needs_attention', 'approved')`
    ).run(projectId, ...uniqueStageIds);
  }

  recoverInterruptedRuns(): WorkflowStageRun[] {
    const rows = this.db.prepare(
      "SELECT * FROM workflow_stage_runs WHERE status IN ('queued', 'running') AND runner_version NOT LIKE 'voice-generation-tts-job-v1:%'"
    ).all() as unknown as StageRunRow[];
    if (!rows.length) return [];
    this.db.prepare(
      "UPDATE workflow_stage_runs SET status = 'failed', safe_error_category = 'interrupted', safe_error_message = 'The previous application session ended before this run completed.', finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE status IN ('queued', 'running') AND runner_version NOT LIKE 'voice-generation-tts-job-v1:%'"
    ).run();
    return rows.map((row) => ({
      ...toStageRun(row),
      status: "failed" as const,
      safeErrorCategory: "interrupted",
      safeErrorMessage: "The previous application session ended before this run completed."
    }));
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

  private persistStageAttention(run: WorkflowStageRun): void {
    const row = this.db.prepare("SELECT payload_json FROM projects WHERE id = ?").get(run.projectId) as { payload_json?: string } | undefined;
    if (!row?.payload_json) return;
    const payload = parseJsonRecord(row.payload_json);
    const stages = Array.isArray(payload.stages) ? payload.stages : [];
    const definition = getWorkflowStageDefinition(run.stageId);
    const attention = run.status === "failed" || run.status === "needs_attention"
      ? {
          code: run.safeErrorCategory ?? "STAGE_FAILED",
          message: run.safeErrorMessage ?? `${definition?.name ?? run.stageId} failed. Review the failed run before retrying.`,
          actions: [{ label: "Review stage", ...(definition?.screenRoute ? { route: definition.screenRoute } : {}) }]
        }
      : undefined;
    const nextStages = stages.map((stage) => {
      if (!stage || typeof stage !== "object" || (stage as { id?: unknown }).id !== run.stageId) return stage;
      const nextStage = { ...(stage as Record<string, unknown>) };
      nextStage.status = run.status;
      if (attention) nextStage.attention = attention;
      else delete nextStage.attention;
      return nextStage;
    });
    payload.stages = nextStages;
    this.db.prepare("UPDATE projects SET payload_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(JSON.stringify(payload), run.projectId);
  }

  private completeReviewRun(runId: string, status: "approved" | "rejected", options: ReviewApprovalOptions): void {
    if (!options.withinTransaction) this.db.exec("BEGIN IMMEDIATE;");
    try {
      if (status === "approved") this.assertApprovedInputArtifactsCurrent(runId);
      const artifactResult = this.db.prepare(
        "UPDATE workflow_artifacts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE stage_run_id = ? AND status = 'needs_review'"
      ).run(status, runId);
      if (artifactResult.changes !== 1) throw new Error("Stage run must have exactly one review artifact awaiting review.");
      const runResult = this.db.prepare(
        "UPDATE workflow_stage_runs SET status = ?, payload_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'needs_review'"
      ).run(status, JSON.stringify(this.withApprovalMetadata(runId, options.approvalMode)), runId);
      if (runResult.changes !== 1) throw new Error("Stage run is not awaiting review.");
      if (!options.withinTransaction) this.db.exec("COMMIT;");
    } catch (error) {
      if (!options.withinTransaction) this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  private withApprovalMetadata(runId: string, requestedApprovalMode: ReviewApprovalOptions["approvalMode"]): Record<string, unknown> {
    const row = this.db.prepare(
      `SELECT p.payload_json AS project_payload_json, r.payload_json AS run_payload_json, r.stage_id AS stage_id
       FROM workflow_stage_runs r
       JOIN projects p ON p.id = r.project_id
       WHERE r.id = ? AND r.status = 'needs_review'`
    ).get(runId) as { project_payload_json?: string; run_payload_json?: string; stage_id?: string } | undefined;
    if (!row) throw new Error("Stage run is not awaiting review.");
    const projectPayload = parseJsonRecord(row.project_payload_json);
    const runPayload = parseJsonRecord(row.run_payload_json);
    const synthetic = projectPayload.synthetic === true;
    const syntheticEnabled = process.env.LSF_MAIN_FLOW_SYNTHETIC_APPROVALS === "1";
    const workflowMode = (projectPayload.setup as { workflowMode?: unknown } | undefined)?.workflowMode;
    const automatic = requestedApprovalMode === "automatic"
      || (requestedApprovalMode === undefined && workflowMode === "semi_automatic" && !!row.stage_id && semiAutomaticAutomaticStageIds.has(row.stage_id));
    if (automatic && (workflowMode !== "semi_automatic" || !row.stage_id || !semiAutomaticAutomaticStageIds.has(row.stage_id))) {
      throw new Error("Automatic approval is only allowed for eligible Semi-automatic stages.");
    }
    const approval: WorkflowApprovalMetadata = automatic
      ? { actor: "system", mode: "automatic", isUserApproval: false, approvedBy: "system", approvalMode: "automatic", approvedAt: new Date().toISOString() }
      : synthetic && syntheticEnabled
        ? { actor: "main-flow-test-agent", mode: "synthetic-regression", isUserApproval: false, approvedBy: "system", approvalMode: "manual", approvedAt: new Date().toISOString() }
        : { actor: "user", mode: "manual", isUserApproval: true, approvedBy: "user", approvalMode: "manual", approvedAt: new Date().toISOString() };
    return { ...runPayload, approval };
  }

  private assertApprovedInputArtifactsCurrent(runId: string): void {
    const row = this.db.prepare("SELECT project_id, stage_id, input_artifact_ids_json FROM workflow_stage_runs WHERE id = ? AND status = 'needs_review'").get(runId) as Pick<StageRunRow, "project_id" | "stage_id" | "input_artifact_ids_json"> | undefined;
    if (!row) return;
    if (row.stage_id === "reference-validation") return;
    const inputIds = JSON.parse(row.input_artifact_ids_json) as string[];
    const definition = getWorkflowStageDefinition(row.stage_id);
    if (!inputIds.length && definition?.dependsOn.length && !this.isTopicIdeaRunWithoutReferences(row.project_id, row.stage_id)) {
      throw new Error("Stage run inputs are no longer approved.");
    }
    if (!inputIds.length) return;
    if (inputIds.some((artifactId) => {
      if (this.isCurrentApprovedArtifact(row.project_id, artifactId, new Set([runId]))) return false;
      if (row.stage_id === "qa" && this.isCurrentReviewableArtifact(row.project_id, artifactId, new Set([runId]))) return false;
      return true;
    })) throw new Error("Stage run inputs are no longer approved.");
  }

  private isTopicIdeaRunWithoutReferences(projectId: string, stageId: string): boolean {
    if (stageId !== "idea-lab") return false;
    const row = this.db.prepare("SELECT payload_json FROM projects WHERE id = ?").get(projectId) as { payload_json?: string } | undefined;
    const payload = parseJsonRecord(row?.payload_json);
    const setup = payload.setup as { inputMode?: unknown } | undefined;
    if (setup?.inputMode !== "topic") return false;
    const references = Array.isArray(payload.competitorReferences) ? payload.competitorReferences : [];
    return references.every((reference) => reference && typeof reference === "object" && (reference as { included?: unknown }).included === false)
      || references.length === 0;
  }

  private isCurrentReviewableArtifact(projectId: string, artifactId: string, visitedRunIds: Set<string>): boolean {
    const artifact = this.getArtifact(projectId, artifactId);
    if (artifact?.status !== "needs_review" || !artifact.stageRunId) return false;
    const run = this.getRun(artifact.stageRunId);
    if (!run || run.projectId !== projectId || run.status !== "needs_review" || !run.outputArtifactIds.includes(artifact.id)) return false;
    if (visitedRunIds.has(run.id)) return false;
    const nextVisitedRunIds = new Set(visitedRunIds);
    nextVisitedRunIds.add(run.id);
    if (run.stageId !== "reference-validation" && run.inputArtifactIds.some((inputArtifactId) => !this.isCurrentApprovedArtifact(projectId, inputArtifactId, nextVisitedRunIds))) return false;
    return true;
  }

  private isCurrentApprovedArtifact(projectId: string, artifactId: string, visitedRunIds: Set<string>): boolean {
    const artifact = this.getArtifact(projectId, artifactId);
    if (artifact?.status !== "approved" || !artifact.stageRunId) return false;
    const run = this.getRun(artifact.stageRunId);
    if (!run || run.projectId !== projectId || run.status !== "approved" || !run.outputArtifactIds.includes(artifact.id)) return false;
    if (visitedRunIds.has(run.id)) return false;
    const nextVisitedRunIds = new Set(visitedRunIds);
    nextVisitedRunIds.add(run.id);
    if (run.stageId !== "reference-validation" && run.inputArtifactIds.some((inputArtifactId) => !this.isCurrentApprovedArtifact(projectId, inputArtifactId, nextVisitedRunIds))) return false;
    return this.currentArtifactIds(projectId, artifact.stageId, nextVisitedRunIds, artifact.id).includes(artifact.id);
  }

  private currentArtifactIds(projectId: string, stageId: string, visitedRunIds: Set<string>, trustedArtifactId?: string): string[] {
    const seenReferenceIds = new Set<string>();
    const currentIds: string[] = [];
    const isPerReferenceStage = perReferenceArtifactStages.has(stageId);
    for (const candidate of this.listArtifacts(projectId, stageId)) {
      if (candidate.status !== "approved" || !candidate.stageRunId) continue;
      const payloadReferenceId = typeof candidate.payloadJson?.referenceId === "string" ? candidate.payloadJson.referenceId : null;
      if (isPerReferenceStage && !payloadReferenceId) continue;
      const referenceId = isPerReferenceStage ? payloadReferenceId : null;
      if (referenceId && seenReferenceIds.has(referenceId)) continue;
      const run = this.getRun(candidate.stageRunId);
      if (!run || run.projectId !== projectId || run.status !== "approved" || !run.outputArtifactIds.includes(candidate.id)) continue;
      const isTrustedArtifact = candidate.id === trustedArtifactId;
      if (visitedRunIds.has(run.id) && !isTrustedArtifact) continue;
      const nextVisitedRunIds = new Set(visitedRunIds);
      nextVisitedRunIds.add(run.id);
      if (!isTrustedArtifact && run.stageId !== "reference-validation" && run.inputArtifactIds.some((inputArtifactId) => !this.isCurrentApprovedArtifact(projectId, inputArtifactId, nextVisitedRunIds))) continue;
      currentIds.push(candidate.id);
      if (referenceId) seenReferenceIds.add(referenceId);
      else break;
    }
    return currentIds;
  }

  private getRun(runId: string): WorkflowStageRun | null {
    const row = this.db.prepare("SELECT * FROM workflow_stage_runs WHERE id = ?").get(runId) as StageRunRow | undefined;
    return row ? toStageRun(row) : null;
  }
}

function assertArtifactMatchesRun(run: WorkflowStageRun, artifact: WorkflowArtifact): void {
  if (artifact.projectId !== run.projectId || artifact.stageId !== run.stageId || artifact.stageRunId !== run.id) {
    throw new Error("Workflow artifact does not match its stage run.");
  }
  if (!run.outputArtifactIds.includes(artifact.id)) {
    throw new Error("Stage run output artifact IDs must include the saved artifact.");
  }
  if (run.status === "needs_review" && artifact.status !== "needs_review") {
    throw new Error("Review stage runs must create review artifacts.");
  }
  if (run.status === "approved" && artifact.status !== "approved") {
    throw new Error("Approved stage runs must create approved artifacts.");
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
    ...(row.payload_json ? { payloadJson: JSON.parse(row.payload_json) as Record<string, unknown> } : {}),
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

function parseJsonRecord(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}
