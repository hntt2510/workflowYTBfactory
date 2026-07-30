import { randomUUID } from "node:crypto";
import { relative } from "node:path";
import type { StoredTtsJob, StoredTtsJobSegment, TtsJobState, TtsJobStore } from "@lsf/db";
import type { TtsProviderId } from "./ttsManager";

export type TtsJobProviderId = TtsProviderId | "omnivoice-local";
export interface TtsJobSegmentInput { id: string; text: string; startSeconds: number; endSeconds?: number; rate?: number; }

interface TtsJobSynthesizer {
  synthesize(input: { provider: TtsJobProviderId; voiceId: string; language: string; text: string; rate: number; outputPath: string; fallbackEnabled: boolean; fallbackOrder: TtsProviderId[] }): Promise<{ requestedProvider: TtsJobProviderId; actualProvider: TtsJobProviderId; voiceId: string; outputPath: string; attemptCount: number; fallbackUsed: boolean; fallbackReason?: string }>;
}

interface JobPayload extends Record<string, unknown> {
  provider: TtsJobProviderId;
  voiceId: string;
  language: string;
  rate: number;
  fallbackEnabled: boolean;
  fallbackOrder: TtsProviderId[];
  mergedRelativeFilePath?: string;
  errorMessage?: string;
}

interface SegmentPayload extends Record<string, unknown> {
  segmentId: string;
  text: string;
  startSeconds: number;
  endSeconds?: number;
  rate: number;
  requestedProvider: TtsJobProviderId;
  actualProvider?: TtsJobProviderId;
  voiceId: string;
  availableDurationSeconds?: number;
  originalDurationSeconds?: number;
  finalDurationSeconds?: number;
  appliedSpeed?: number;
  timingOverflowSeconds: number;
  relativeFilePath?: string;
  attemptCount: number;
  fallbackUsed: boolean;
  fallbackReason?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface TtsJobView {
  id: string;
  projectId?: string;
  state: TtsJobState;
  provider: TtsJobProviderId;
  voiceId: string;
  language: string;
  mergedRelativeFilePath?: string;
  errorMessage?: string;
  segments: Array<SegmentPayload & { state: StoredTtsJobSegment["state"] }>;
  createdAt: string;
  updatedAt: string;
}

export class TtsJobService {
  private readonly running = new Set<string>();

  constructor(private readonly input: {
    store: TtsJobStore;
    manager: TtsJobSynthesizer;
    workspaceRoot: string;
    outputPathFor: (jobId: string, segmentId: string) => string;
    probeAudio: (path: string) => Promise<{ durationSeconds: number }>;
    fitAudio: (inputPath: string, outputPath: string, speed: number) => Promise<void>;
    mergeAudio: (items: Array<{ inputPath: string; startSeconds: number }>, outputPath: string) => Promise<void>;
    mergedOutputPathFor: (jobId: string) => string;
  }) {}

  create(input: { projectId?: string; provider: TtsJobProviderId; voiceId: string; language: string; rate?: number; fallbackEnabled?: boolean; fallbackOrder?: TtsProviderId[]; segments: TtsJobSegmentInput[] }): TtsJobView {
    const id = `tts-job-${randomUUID()}`;
    const now = new Date().toISOString();
    const payload: JobPayload = {
      provider: input.provider,
      voiceId: input.voiceId,
      language: input.language,
      rate: input.rate ?? 1,
      fallbackEnabled: input.fallbackEnabled ?? false,
      fallbackOrder: input.fallbackOrder ?? []
    };
    const job: StoredTtsJob = { id, ...(input.projectId ? { projectId: input.projectId } : {}), state: "queued", payload, createdAt: now, updatedAt: now };
    const segments = input.segments.map((segment, order): StoredTtsJobSegment => ({
      id: `tts-segment-${randomUUID()}`,
      jobId: id,
      order,
      state: "queued",
      payload: {
        segmentId: segment.id,
        text: segment.text,
        startSeconds: segment.startSeconds,
        ...(segment.endSeconds ? { endSeconds: segment.endSeconds } : {}),
        rate: segment.rate ?? payload.rate,
        requestedProvider: input.provider,
        voiceId: input.voiceId,
        timingOverflowSeconds: 0,
        attemptCount: 0,
        fallbackUsed: false
      } satisfies SegmentPayload,
      createdAt: now,
      updatedAt: now
    }));
    this.input.store.create(job, segments);
    return this.get(id)!;
  }

  get(id: string): TtsJobView | null {
    const stored = this.input.store.get(id);
    return stored ? toView(stored.job, stored.segments) : null;
  }

  listQueued(): TtsJobView[] { return this.input.store.listQueued().flatMap((job) => this.get(job.id) ?? []); }

  getLatestForProject(projectId: string): TtsJobView | null {
    const job = this.input.store.latestForProject(projectId);
    return job ? this.get(job.id) : null;
  }

  async run(id: string, onlySegmentId?: string): Promise<TtsJobView> {
    if (this.running.has(id)) return this.get(id) ?? Promise.reject(new Error("TTS job was not found."));
    this.running.add(id);
    try {
      const initial = this.input.store.get(id);
      if (!initial) throw new Error("TTS job was not found.");
      if (initial.job.state === "cancelled") return toView(initial.job, initial.segments);
      const jobPayload = initial.job.payload as JobPayload;
      this.input.store.updateJob(id, "running", jobPayload);
      for (let index = 0; index < initial.segments.length; index += 1) {
        const segment = initial.segments[index]!;
        const payload = segment.payload as SegmentPayload;
        if (onlySegmentId && payload.segmentId !== onlySegmentId) continue;
        const latest = this.input.store.get(id);
        if (!latest || latest.job.state === "cancelled") break;
        if (!onlySegmentId && segment.state === "success") continue;
        await this.runSegment(id, segment, initial.segments[index + 1]);
      }
      return await this.finish(id);
    } finally {
      this.running.delete(id);
    }
  }

  async retrySegment(jobId: string, segmentId: string): Promise<TtsJobView> {
    const current = this.input.store.get(jobId);
    if (!current) throw new Error("TTS job was not found.");
    const segment = current.segments.find((item) => (item.payload as SegmentPayload).segmentId === segmentId);
    if (!segment) throw new Error("TTS segment was not found.");
    const payload = segment.payload as SegmentPayload;
    this.input.store.updateSegment(segment.id, "queued", { ...payload, errorCode: undefined, errorMessage: undefined, timingOverflowSeconds: 0 });
    this.input.store.updateJob(jobId, "queued", current.job.payload);
    return this.run(jobId, segmentId);
  }

  cancel(id: string): TtsJobView {
    this.input.store.cancel(id);
    const job = this.get(id);
    if (!job) throw new Error("TTS job was not found.");
    return job;
  }

  private async runSegment(jobId: string, segment: StoredTtsJobSegment, nextSegment?: StoredTtsJobSegment): Promise<void> {
    const job = this.input.store.get(jobId)?.job;
    if (!job) throw new Error("TTS job was not found.");
    const settings = job.payload as JobPayload;
    const existing = segment.payload as SegmentPayload;
    const now = new Date().toISOString();
    const availableDurationSeconds = nextSegment
      ? Math.max(0.01, Number((nextSegment.payload as SegmentPayload).startSeconds) - existing.startSeconds)
      : existing.endSeconds ? Math.max(0.01, existing.endSeconds - existing.startSeconds) : undefined;
    const running: SegmentPayload = { ...existing, ...(availableDurationSeconds ? { availableDurationSeconds } : {}), attemptCount: existing.attemptCount + 1 };
    this.input.store.updateSegment(segment.id, "running", running, now);
    const originalOutputPath = this.input.outputPathFor(jobId, existing.segmentId);
    try {
      const generated = await this.input.manager.synthesize({
        provider: settings.provider,
        voiceId: settings.voiceId,
        language: settings.language,
        text: existing.text,
        rate: existing.rate,
        outputPath: originalOutputPath,
        fallbackEnabled: settings.fallbackEnabled,
        fallbackOrder: settings.fallbackOrder
      });
      const originalMetadata = await this.input.probeAudio(generated.outputPath);
      let outputPath = generated.outputPath;
      let finalDurationSeconds = originalMetadata.durationSeconds;
      let appliedSpeed = existing.rate;
      let timingOverflowSeconds = 0;
      if (availableDurationSeconds && originalMetadata.durationSeconds > availableDurationSeconds) {
        const requiredSpeed = originalMetadata.durationSeconds / availableDurationSeconds;
        if (requiredSpeed <= 1.8) {
          const fittedOutputPath = originalOutputPath.replace(/\.[A-Za-z0-9]+$/, "-fitted.mp3");
          await this.input.fitAudio(originalOutputPath, fittedOutputPath, requiredSpeed);
          outputPath = fittedOutputPath;
          finalDurationSeconds = (await this.input.probeAudio(fittedOutputPath)).durationSeconds;
          appliedSpeed = requiredSpeed;
        } else {
          timingOverflowSeconds = originalMetadata.durationSeconds - availableDurationSeconds;
        }
      }
      const success: SegmentPayload = {
        ...running,
        actualProvider: generated.actualProvider,
        voiceId: generated.voiceId,
        originalDurationSeconds: originalMetadata.durationSeconds,
        finalDurationSeconds,
        appliedSpeed,
        timingOverflowSeconds,
        relativeFilePath: relative(this.input.workspaceRoot, outputPath),
        fallbackUsed: generated.fallbackUsed,
        attemptCount: existing.attemptCount + generated.attemptCount,
        ...(generated.fallbackReason ? { fallbackReason: generated.fallbackReason } : {})
      };
      if (this.input.store.get(jobId)?.job.state === "cancelled") return;
      this.input.store.updateSegment(segment.id, "success", success);
    } catch (error) {
      const message = error instanceof Error ? error.message : "TTS segment failed.";
      if (this.input.store.get(jobId)?.job.state !== "cancelled") this.input.store.updateSegment(segment.id, "failed", { ...running, errorCode: "provider_failed", errorMessage: message });
    }
  }

  private async finish(id: string): Promise<TtsJobView> {
    const current = this.input.store.get(id);
    if (!current) throw new Error("TTS job was not found.");
    if (current.job.state === "cancelled") return toView(current.job, current.segments);
    const segments = current.segments;
    const failed = segments.filter((segment) => segment.state === "failed");
    const cancelled = segments.filter((segment) => segment.state === "cancelled");
    const completed = segments.filter((segment) => segment.state === "success");
    let state: TtsJobState = failed.length === segments.length ? "failed" : cancelled.length ? "cancelled" : failed.length ? "partial" : "success";
    const jobPayload = current.job.payload as JobPayload;
    if (completed.length && !cancelled.length) {
      try {
        const mergeItems = completed.map((segment) => {
          const payload = segment.payload as SegmentPayload;
          if (!payload.relativeFilePath) throw new Error("Completed segment has no audio path.");
          return { inputPath: joinWorkspace(this.input.workspaceRoot, payload.relativeFilePath), startSeconds: payload.startSeconds };
        });
        const mergedOutputPath = this.input.mergedOutputPathFor(id);
        await this.input.mergeAudio(mergeItems, mergedOutputPath);
        jobPayload.mergedRelativeFilePath = relative(this.input.workspaceRoot, mergedOutputPath);
      } catch (error) {
        state = "partial";
        jobPayload.errorMessage = error instanceof Error ? error.message : "Voiceover merge failed.";
      }
    }
    if (completed.some((segment) => Number((segment.payload as SegmentPayload).timingOverflowSeconds) > 0)) state = "partial";
    this.input.store.updateJob(id, state, jobPayload);
    return this.get(id)!;
  }
}

function toView(job: StoredTtsJob, segments: StoredTtsJobSegment[]): TtsJobView {
  const payload = job.payload as JobPayload;
  return {
    id: job.id,
    ...(job.projectId ? { projectId: job.projectId } : {}),
    state: job.state,
    provider: payload.provider,
    voiceId: payload.voiceId,
    language: payload.language,
    ...(payload.mergedRelativeFilePath ? { mergedRelativeFilePath: payload.mergedRelativeFilePath } : {}),
    ...(payload.errorMessage ? { errorMessage: payload.errorMessage } : {}),
    segments: segments.map((segment) => ({ ...(segment.payload as SegmentPayload), state: segment.state })),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}

function joinWorkspace(workspaceRoot: string, relativePath: string): string {
  return `${workspaceRoot}${workspaceRoot.endsWith("\\") ? "" : "\\"}${relativePath.replaceAll("/", "\\")}`;
}
