import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type GenerationJobState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "paused"
  | "waiting_user"
  | "rate_limited";

export interface GenerationJob {
  id: string;
  projectId: string;
  shotId: string;
  requestType: "image" | "video" | "tts" | "stt";
  provider: string;
  model: string;
  promptVersionId: string;
  inputAssetIds: string[];
  idempotencyKey: string;
  priority: number;
  attemptCount: number;
  requestTimestamp?: string;
  responseMetadata?: Record<string, unknown>;
  costEstimate?: Record<string, unknown>;
  outputAssetIds: string[];
  errorClassification?: string;
  state: GenerationJobState;
}

export interface JobResult {
  outputAssetIds: string[];
  responseMetadata?: Record<string, unknown>;
  usageEstimate?: Record<string, unknown>;
}

export interface QueueOptions {
  storagePath?: string;
  defaultConcurrency?: number;
  maxAutomaticRetries?: number;
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs: number
  ) {
    super(message);
  }
}

export class PersistentGenerationQueue {
  private jobs = new Map<string, GenerationJob>();
  private running = 0;
  private readonly defaultConcurrency: number;
  private readonly maxAutomaticRetries: number;

  constructor(private readonly options: QueueOptions = {}) {
    this.defaultConcurrency = options.defaultConcurrency ?? 5;
    this.maxAutomaticRetries = options.maxAutomaticRetries ?? 2;
    this.restore();
  }

  enqueue(input: Omit<GenerationJob, "id" | "state" | "attemptCount" | "inputAssetIds" | "outputAssetIds"> & {
    inputAssetIds?: string[];
  }): GenerationJob {
    const existing = [...this.jobs.values()].find((job) => job.idempotencyKey === input.idempotencyKey);
    if (existing) {
      return existing;
    }
    const job: GenerationJob = {
      ...input,
      id: `job-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      inputAssetIds: input.inputAssetIds ?? [],
      outputAssetIds: [],
      attemptCount: 0,
      state: "queued"
    };
    this.jobs.set(job.id, job);
    this.persist();
    return job;
  }

  pause(jobId: string): void {
    const job = this.mustGet(jobId);
    if (job.state === "queued" || job.state === "rate_limited") {
      job.state = "paused";
      this.persist();
    }
  }

  resume(jobId: string): void {
    const job = this.mustGet(jobId);
    if (job.state === "paused") {
      job.state = "queued";
      this.persist();
    }
  }

  cancel(jobId: string): void {
    const job = this.mustGet(jobId);
    if (job.state !== "succeeded") {
      job.state = "cancelled";
      this.persist();
    }
  }

  snapshotWorkers() {
    return {
      concurrency: this.defaultConcurrency,
      running: this.running,
      jobs: [...this.jobs.values()].sort((a, b) => a.priority - b.priority)
    };
  }

  async runUntilIdle(worker: (job: GenerationJob) => Promise<JobResult>): Promise<void> {
    while (this.hasRunnableJobs() || this.running > 0) {
      const batch = this.nextJobs(this.defaultConcurrency - this.running);
      await Promise.all(batch.map((job) => this.runJob(job, worker)));
      if (this.hasRunnableJobs() && batch.length === 0) {
        await sleep(5);
      }
    }
  }

  private async runJob(job: GenerationJob, worker: (job: GenerationJob) => Promise<JobResult>): Promise<void> {
    this.running += 1;
    job.state = "running";
    job.requestTimestamp = new Date().toISOString();
    job.attemptCount += 1;
    this.persist();
    try {
      const result = await worker(job);
      job.state = "succeeded";
      job.outputAssetIds = result.outputAssetIds;
      if (result.responseMetadata) {
        job.responseMetadata = result.responseMetadata;
      }
      if (result.usageEstimate) {
        job.costEstimate = result.usageEstimate;
      }
    } catch (error) {
      if (error instanceof RateLimitError && job.attemptCount <= this.maxAutomaticRetries) {
        job.state = "rate_limited";
        job.errorClassification = "rate_limited";
        this.persist();
        await sleep(error.retryAfterMs);
        job.state = "queued";
      } else if (job.attemptCount <= this.maxAutomaticRetries) {
        job.state = "queued";
        job.errorClassification = "transient";
        await sleep(10 * job.attemptCount);
      } else {
        job.state = "failed";
        job.errorClassification = error instanceof Error ? error.message : "unknown";
      }
    } finally {
      this.running -= 1;
      this.persist();
    }
  }

  private nextJobs(limit: number): GenerationJob[] {
    if (limit <= 0) return [];
    return [...this.jobs.values()]
      .filter((job) => job.state === "queued")
      .sort((a, b) => a.priority - b.priority)
      .slice(0, limit);
  }

  private hasRunnableJobs(): boolean {
    return [...this.jobs.values()].some((job) => job.state === "queued");
  }

  private mustGet(jobId: string): GenerationJob {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Unknown job: ${jobId}`);
    }
    return job;
  }

  private restore(): void {
    if (!this.options.storagePath || !existsSync(this.options.storagePath)) {
      return;
    }
    const restored = JSON.parse(readFileSync(this.options.storagePath, "utf8")) as GenerationJob[];
    for (const job of restored) {
      this.jobs.set(job.id, job.state === "running" ? { ...job, state: "queued" } : job);
    }
  }

  private persist(): void {
    if (!this.options.storagePath) {
      return;
    }
    mkdirSync(dirname(this.options.storagePath), { recursive: true });
    writeFileSync(this.options.storagePath, JSON.stringify([...this.jobs.values()], null, 2));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
