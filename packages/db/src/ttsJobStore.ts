import type { FactoryDatabase } from "./connection";

export type TtsJobState = "queued" | "running" | "success" | "partial" | "failed" | "cancelled";
export type TtsSegmentState = "queued" | "running" | "success" | "failed" | "cancelled";

export interface StoredTtsJob {
  id: string;
  projectId?: string;
  state: TtsJobState;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface StoredTtsJobSegment {
  id: string;
  jobId: string;
  order: number;
  state: TtsSegmentState;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export class TtsJobStore {
  constructor(private readonly db: FactoryDatabase) {}

  create(job: StoredTtsJob, segments: StoredTtsJobSegment[]): void {
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      this.db.prepare("INSERT INTO tts_jobs (id, project_id, state, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(job.id, job.projectId ?? null, job.state, JSON.stringify(job.payload), job.createdAt, job.updatedAt);
      const insert = this.db.prepare("INSERT INTO tts_job_segments (id, job_id, segment_order, state, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
      for (const segment of segments) {
        insert.run(segment.id, segment.jobId, segment.order, segment.state, JSON.stringify(segment.payload), segment.createdAt, segment.updatedAt);
      }
      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  get(id: string): { job: StoredTtsJob; segments: StoredTtsJobSegment[] } | null {
    const job = this.readJob(id);
    if (!job) return null;
    return { job, segments: this.listSegments(id) };
  }

  listQueued(): StoredTtsJob[] {
    return (this.db.prepare("SELECT id, project_id, state, payload_json, created_at, updated_at FROM tts_jobs WHERE state = 'queued' ORDER BY created_at").all() as unknown as TtsJobRow[]).map(toJob);
  }

  latestForProject(projectId: string): StoredTtsJob | null {
    const row = this.db.prepare("SELECT id, project_id, state, payload_json, created_at, updated_at FROM tts_jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1").get(projectId) as unknown as TtsJobRow | undefined;
    return row ? toJob(row) : null;
  }

  updateJob(id: string, state: TtsJobState, payload: Record<string, unknown>, updatedAt = new Date().toISOString()): void {
    const result = this.db.prepare("UPDATE tts_jobs SET state = ?, payload_json = ?, updated_at = ? WHERE id = ?").run(state, JSON.stringify(payload), updatedAt, id);
    if (result.changes !== 1) throw new Error("TTS job was not found.");
  }

  updateSegment(id: string, state: TtsSegmentState, payload: Record<string, unknown>, updatedAt = new Date().toISOString()): void {
    const result = this.db.prepare("UPDATE tts_job_segments SET state = ?, payload_json = ?, updated_at = ? WHERE id = ?").run(state, JSON.stringify(payload), updatedAt, id);
    if (result.changes !== 1) throw new Error("TTS segment was not found.");
  }

  cancel(id: string): void {
    const now = new Date().toISOString();
    const result = this.db.prepare("UPDATE tts_jobs SET state = 'cancelled', updated_at = ? WHERE id = ? AND state IN ('queued', 'running')").run(now, id);
    if (result.changes !== 1) throw new Error("TTS job cannot be cancelled.");
    this.db.prepare("UPDATE tts_job_segments SET state = 'cancelled', updated_at = ? WHERE job_id = ? AND state IN ('queued', 'running')").run(now, id);
  }

  recoverInterruptedJobs(): number {
    return Number(this.db.prepare("UPDATE tts_jobs SET state = 'queued', updated_at = CURRENT_TIMESTAMP WHERE state = 'running'").run().changes);
  }

  private readJob(id: string): StoredTtsJob | null {
    const row = this.db.prepare("SELECT id, project_id, state, payload_json, created_at, updated_at FROM tts_jobs WHERE id = ?").get(id) as TtsJobRow | undefined;
    return row ? toJob(row) : null;
  }

  private listSegments(jobId: string): StoredTtsJobSegment[] {
    return (this.db.prepare("SELECT id, job_id, segment_order, state, payload_json, created_at, updated_at FROM tts_job_segments WHERE job_id = ? ORDER BY segment_order").all(jobId) as unknown as TtsSegmentRow[]).map(toSegment);
  }
}

interface TtsJobRow { id: string; project_id: string | null; state: TtsJobState; payload_json: string; created_at: string; updated_at: string; }
interface TtsSegmentRow { id: string; job_id: string; segment_order: number; state: TtsSegmentState; payload_json: string; created_at: string; updated_at: string; }

function toJob(row: TtsJobRow): StoredTtsJob {
  return { id: row.id, ...(row.project_id ? { projectId: row.project_id } : {}), state: row.state, payload: JSON.parse(row.payload_json) as Record<string, unknown>, createdAt: row.created_at, updatedAt: row.updated_at };
}

function toSegment(row: TtsSegmentRow): StoredTtsJobSegment {
  return { id: row.id, jobId: row.job_id, order: row.segment_order, state: row.state, payload: JSON.parse(row.payload_json) as Record<string, unknown>, createdAt: row.created_at, updatedAt: row.updated_at };
}
