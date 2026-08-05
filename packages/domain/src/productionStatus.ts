import type { FactoryProject, ProductionStatus, WorkflowStageStatus } from "./types";

function statusOf(project: FactoryProject, stageId: string): WorkflowStageStatus {
  return project.stages.find((stage) => stage.id === stageId)?.status ?? "not_started";
}

function needsAttention(project: FactoryProject): boolean {
  return project.stages.some((stage) => stage.status === "failed" || stage.status === "needs_attention");
}

export function resolveProductionStatus(project: FactoryProject): ProductionStatus {
  if (needsAttention(project)) return "needs_attention";

  const packaging = statusOf(project, "packaging-export");
  if (packaging === "approved") return "completed";
  if (packaging === "running" || packaging === "queued") return "exporting";

  const capcut = statusOf(project, "capcut-draft");
  if (capcut === "running" || capcut === "queued") return "exporting";

  const qa = statusOf(project, "qa");
  const preview = statusOf(project, "preview-render");
  if (qa === "needs_review" || qa === "approved" || qa === "running" || qa === "queued") return "needs_final_review";
  if (preview === "needs_review") return "needs_final_review";
  if (preview === "running" || preview === "queued") return "rendering_preview";

  const voice = statusOf(project, "voice-generation");
  if (voice === "running" || voice === "queued" || voice === "needs_review") return "generating_voice";

  const assetReview = statusOf(project, "asset-review");
  if (assetReview === "needs_review") return "needs_scene_review";
  const asset = statusOf(project, "asset-acquisition");
  if (asset === "running" || asset === "queued" || asset === "needs_review") return "generating_media";

  if (statusOf(project, "idea-lab") === "needs_review") return "waiting_for_idea";
  if (project.setup.inputMode === "topic" && !project.approvedIdeaId && project.ideas.length > 0) return "waiting_for_idea";

  const setup = statusOf(project, "project-setup");
  if (setup === "not_started" || setup === "ready") return "draft";
  return "preparing";
}

export function productionStatusLabel(status: ProductionStatus): string {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
