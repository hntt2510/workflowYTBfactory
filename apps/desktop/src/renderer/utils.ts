import { framesToTimecode } from "@lsf/domain";
import { resolveWorkflowProgress } from "@lsf/domain";
import type { FactoryProject, StageStatus } from "@lsf/domain";
import type { ProjectSummary, QueueSnapshot } from "./types";

export function formatDate(value?: string): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function stageTone(status: StageStatus | string): "default" | "success" | "warning" | "danger" | "info" {
  if (status === "approved" || status === "succeeded" || status === "complete") return "success";
  if (status === "failed" || status === "rejected") return "danger";
  if (status === "blocked" || status === "not_started" || status === "stale" || status === "needs_attention" || status === "rate_limited") return "warning";
  if (status === "running" || status === "queued" || status === "ready" || status === "needs_review" || status === "current") return "info";
  return "default";
}

export function projectProgress(project: FactoryProject): number {
  return resolveWorkflowProgress(project).percent;
}

export function currentStage(project: FactoryProject): string {
  return resolveWorkflowProgress(project).currentStageName ?? "Complete";
}

export function queueCounts(queue: QueueSnapshot) {
  return queue.jobs.reduce<Record<string, number>>((counts, job) => {
    counts[job.state] = (counts[job.state] ?? 0) + 1;
    return counts;
  }, {});
}

export function estimatedDuration(project: FactoryProject): string {
  const frames = project.timeline.items.reduce((max, item) => Math.max(max, item.startFrame + item.durationFrames), 0);
  return framesToTimecode(frames, project.timeline.fps);
}

export function formatTimecode(frames: number, fps: number): string {
  return framesToTimecode(frames, fps);
}

export function activeProjectSummary(projects: ProjectSummary[], projectId?: string): ProjectSummary | undefined {
  return projects.find((project) => project.id === projectId);
}

export function safeRendererError(error: unknown, fallback = "The operation could not be completed. Retry the affected step or open Diagnostics."): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = rawMessage.match(/^Error invoking remote method '[^']+':\s*(.*)$/i)?.[1]?.trim() ?? rawMessage;
  if (message.includes("The selected scene has no AI image media to regenerate")) return "This scene has no AI image to regenerate. Choose a scene routed to AI Image or use Upload Replacement.";
  if (message.includes("Approve and explicitly assign every generated asset")) return "Approve and assign every generated asset before completing Scene Review.";
  if (message.includes("Production is already running for this project")) return "Production is still running. Wait for the current phase to finish before trying again.";
  if (message.includes("does not match the project language") || message.includes("does not match language")) return "The selected voice does not match this project's language. Choose a matching voice on the Voice screen, then retry.";
  if (message.includes("voice-generation did not produce a reviewable result")) return "Voice Generation did not finish successfully. Open Production or Diagnostics to retry it.";
  if (!message || /error invoking remote method|remote method|ipc|zod|invalid input|cannot read properties|uncaught/i.test(message)) return fallback;
  return message.length > 500 ? `${message.slice(0, 497)}...` : message;
}
