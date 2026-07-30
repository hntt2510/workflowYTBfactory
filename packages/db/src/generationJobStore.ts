import type { FactoryDatabase } from "./connection";

export type AssetJobState = "running" | "succeeded" | "failed";
export interface AssetGenerationJob { id: string; projectId: string; shotId: string; idempotencyKey: string; state: AssetJobState; payload: Record<string, unknown>; }

export class GenerationJobStore {
  constructor(private readonly db: FactoryDatabase) {}
  findByIdempotencyKey(idempotencyKey: string): AssetGenerationJob | null {
    const row = this.db.prepare("SELECT id, project_id, shot_id, idempotency_key, state, payload_json FROM generation_jobs WHERE idempotency_key = ?").get(idempotencyKey) as { id: string; project_id: string; shot_id: string; idempotency_key: string; state: AssetJobState; payload_json: string } | undefined;
    return row ? { id: row.id, projectId: row.project_id, shotId: row.shot_id, idempotencyKey: row.idempotency_key, state: row.state, payload: JSON.parse(row.payload_json) as Record<string, unknown> } : null;
  }
  create(job: AssetGenerationJob): void { this.db.prepare("INSERT INTO generation_jobs (id, project_id, shot_id, state, idempotency_key, payload_json) VALUES (?, ?, ?, ?, ?, ?)").run(job.id, job.projectId, job.shotId, job.state, job.idempotencyKey, JSON.stringify(job.payload)); }
  restart(id: string, payload: Record<string, unknown>): void { const result = this.db.prepare("UPDATE generation_jobs SET state = 'running', payload_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND state = 'failed'").run(JSON.stringify(payload), id); if (result.changes !== 1) throw new Error("Generation job cannot be retried."); }
  finish(id: string, state: Exclude<AssetJobState, "running">, payload: Record<string, unknown>): void { const result = this.db.prepare("UPDATE generation_jobs SET state = ?, payload_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND state = 'running'").run(state, JSON.stringify(payload), id); if (result.changes !== 1) throw new Error("Generation job is not running."); }
  recoverInterruptedJobs(): number { return Number(this.db.prepare("UPDATE generation_jobs SET state = 'failed', updated_at = CURRENT_TIMESTAMP WHERE state = 'running'").run().changes); }
}
