import { framesToTimecode } from "@lsf/domain";
import type { FactoryProject, StageStatus } from "@lsf/domain";
import type { ProjectSummary, QueueSnapshot } from "./types";

export function formatDate(value?: string): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function stageTone(status: StageStatus | string): "default" | "success" | "warning" | "danger" | "info" {
  if (status === "approved" || status === "succeeded") return "success";
  if (status === "failed" || status === "rejected") return "danger";
  if (status === "blocked" || status === "not_started" || status === "stale" || status === "rate_limited") return "warning";
  if (status === "running" || status === "queued" || status === "ready" || status === "needs_review") return "info";
  return "default";
}

export function projectProgress(project: FactoryProject): number {
  if (project.stages.length === 0) return 0;
  const approved = project.stages.filter((stage) => stage.status === "approved").length;
  return Math.round((approved / project.stages.length) * 100);
}

export function currentStage(project: FactoryProject): string {
  return project.stages.find((stage) => stage.status !== "approved")?.name ?? project.stages.at(-1)?.name ?? "Not started";
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
