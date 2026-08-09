import type { FactoryProject, WorkflowStageStatus } from "./types";
import { isWorkflowStageApplicable } from "./workflowProgress";
import { workflowStageDefinitions } from "./workflowRegistry";

export type CheckpointId = "brief" | "research" | "idea" | "script" | "director" | "storyboard" | "prompts" | "images" | "handoff";
export type CheckpointState = "not_applicable" | "locked" | "ready" | "running" | "waiting_user" | "needs_review" | "complete" | "error" | "stale";
export type ActionRuntimeState = "READY" | "RUNNING" | "WAITING_USER" | "BLOCKED" | "SUCCESS" | "ERROR";
export type ActionProgress =
  | { mode: "determinate"; completedUnits: number; totalUnits: number; currentUnit?: string; message: string }
  | { mode: "indeterminate"; startedAt: string; message: string };

export interface CheckpointDefinition {
  id: CheckpointId;
  label: string;
  order: number;
  stageIds: readonly string[];
  required: boolean;
  route: "project-overview" | "reference-intake" | "idea-lab" | "script" | "scenes" | "shots" | "visuals" | "assets";
}

export const checkpointDefinitions: readonly CheckpointDefinition[] = [
  { id: "brief", label: "Brief", order: 1, stageIds: ["project-setup"], required: true, route: "project-overview" },
  { id: "research", label: "Nghiên cứu / Tham khảo", order: 2, stageIds: ["reference-intake"], required: true, route: "reference-intake" },
  { id: "idea", label: "Ý tưởng", order: 3, stageIds: ["idea-lab"], required: true, route: "idea-lab" },
  { id: "script", label: "Câu chuyện + Kịch bản", order: 4, stageIds: ["story-architecture", "script", "timing"], required: true, route: "script" },
  { id: "director", label: "Đạo diễn", order: 5, stageIds: ["director-analysis", "scene-plan"], required: true, route: "scenes" },
  { id: "storyboard", label: "Storyboard / Keyframes", order: 6, stageIds: ["shot-plan"], required: true, route: "shots" },
  { id: "prompts", label: "Prompt + GG Lab Batch", order: 7, stageIds: ["prompt-preparation", "batch-planner"], required: true, route: "visuals" },
  { id: "images", label: "Nhập + Duyệt ảnh", order: 8, stageIds: ["gglab-generation-gate", "asset-review"], required: true, route: "assets" },
  { id: "handoff", label: "Bàn giao", order: 9, stageIds: ["production-handoff"], required: true, route: "project-overview" }
];

export type ActionId = "SAVE_BRIEF" | "GENERATE_RESEARCH_ANALYSIS" | "GENERATE_IDEAS" | "SELECT_IDEA" | "GENERATE_SCRIPT" | "REVISE_SCRIPT" | "GENERATE_DIRECTOR_PLAN" | "GENERATE_STORYBOARD" | "PREPARE_GG_LAB_PROMPTS" | "IMPORT_IMAGES" | "APPROVE_IMAGES" | "GENERATE_HANDOFF";
export interface ActionDefinition { id: ActionId; checkpointId: CheckpointId; stageId: string; label: string; kind: "command" | "user_input"; }
export const actionDefinitions: readonly ActionDefinition[] = [
  { id: "SAVE_BRIEF", checkpointId: "brief", stageId: "project-setup", label: "Lưu Brief", kind: "user_input" },
  { id: "GENERATE_RESEARCH_ANALYSIS", checkpointId: "research", stageId: "reference-intake", label: "Phân tích tham khảo", kind: "command" },
  { id: "GENERATE_IDEAS", checkpointId: "idea", stageId: "idea-lab", label: "Tạo ý tưởng", kind: "command" },
  { id: "SELECT_IDEA", checkpointId: "idea", stageId: "idea-lab", label: "Chọn ý tưởng", kind: "user_input" },
  { id: "GENERATE_SCRIPT", checkpointId: "script", stageId: "script", label: "Tạo kịch bản", kind: "command" },
  { id: "REVISE_SCRIPT", checkpointId: "script", stageId: "script", label: "Sửa kịch bản", kind: "user_input" },
  { id: "GENERATE_DIRECTOR_PLAN", checkpointId: "director", stageId: "scene-plan", label: "Tạo kế hoạch đạo diễn", kind: "command" },
  { id: "GENERATE_STORYBOARD", checkpointId: "storyboard", stageId: "shot-plan", label: "Tạo storyboard", kind: "command" },
  { id: "PREPARE_GG_LAB_PROMPTS", checkpointId: "prompts", stageId: "prompt-preparation", label: "Chuẩn bị prompt GG Lab", kind: "command" },
  { id: "IMPORT_IMAGES", checkpointId: "images", stageId: "gglab-generation-gate", label: "Nhập ảnh từ GG Lab", kind: "user_input" },
  { id: "APPROVE_IMAGES", checkpointId: "images", stageId: "asset-review", label: "Duyệt ảnh", kind: "user_input" },
  { id: "GENERATE_HANDOFF", checkpointId: "handoff", stageId: "production-handoff", label: "Tạo gói bàn giao", kind: "user_input" }
];

export interface ActionRunSnapshot { actionId: ActionId; state: "queued" | "running" | "waiting_user" | "success" | "failed" | "cancelled"; safeErrorMessage?: string; progress?: ActionProgress; }
export interface ResolvedCheckpoint { definition: CheckpointDefinition; state: CheckpointState; blockingReason?: string; }
export interface ProjectCheckpointProgress { checkpoints: ResolvedCheckpoint[]; completedCount: number; totalCount: number; percent: number; }

const terminalError = new Set<WorkflowStageStatus>(["failed", "needs_attention", "rejected"]);
export function resolveProjectCheckpoints(project: FactoryProject, runs: readonly ActionRunSnapshot[] = []): ProjectCheckpointProgress {
  const stageById = new Map(project.stages.map((stage) => [stage.id, stage]));
  const definitionsById = new Map(workflowStageDefinitions.map((stage) => [stage.id, stage]));
  const checkpoints: ResolvedCheckpoint[] = [];
  for (const definition of checkpointDefinitions) {
    if (project.setup.inputMode === "existing_script" && (definition.id === "research" || definition.id === "idea")) {
      checkpoints.push({ definition, state: "not_applicable" });
      continue;
    }
    const applicableStages = definition.stageIds.filter((id) => {
      const stage = definitionsById.get(id);
      return stage ? isWorkflowStageApplicable(project, stage) : true;
    });
    if (!applicableStages.length) {
      checkpoints.push({ definition, state: "not_applicable" });
      continue;
    }
    const statuses = applicableStages.map((id) => stageById.get(id)?.status ?? "not_started");
    // Stores return newest first. Only each action's latest attempt may control the
    // checkpoint: an old failure must not mask a later successful retry.
    const seenActions = new Set<ActionId>();
    const currentRuns = runs.filter((run) => {
      const matches = actionDefinitions.find((action) => action.id === run.actionId)?.checkpointId === definition.id;
      if (!matches || seenActions.has(run.actionId)) return false;
      seenActions.add(run.actionId);
      return true;
    });
    if (currentRuns.some((run) => run.state === "running" || run.state === "queued")) { checkpoints.push({ definition, state: "running" }); continue; }
    if (currentRuns.some((run) => run.state === "waiting_user")) { checkpoints.push({ definition, state: "waiting_user" }); continue; }
    if (currentRuns.some((run) => run.state === "failed") || statuses.some((status) => terminalError.has(status))) { checkpoints.push({ definition, state: "error" }); continue; }
    if (statuses.some((status) => status === "stale")) { checkpoints.push({ definition, state: "stale" }); continue; }
    if (statuses.every((status) => status === "approved")) { checkpoints.push({ definition, state: "complete" }); continue; }
    const firstIncomplete = applicableStages.findIndex((id) => (stageById.get(id)?.status ?? "not_started") !== "approved");
    const prerequisitesComplete = checkpointDefinitions.filter((candidate) => candidate.order < definition.order).every((candidate) => {
      const previous = checkpoints.find((entry) => entry.definition.id === candidate.id);
      return !previous || previous.state === "complete" || previous.state === "not_applicable";
    });
    checkpoints.push(prerequisitesComplete && firstIncomplete >= 0 ? { definition, state: "ready" } : { definition, state: "locked", blockingReason: "Hoàn tất checkpoint trước trước khi tiếp tục." });
  }
  const required = checkpoints.filter((checkpoint) => checkpoint.definition.required && checkpoint.state !== "not_applicable");
  const completedCount = required.filter((checkpoint) => checkpoint.state === "complete").length;
  return { checkpoints, completedCount, totalCount: required.length, percent: required.length ? Math.round(completedCount / required.length * 100) : 0 };
}

export function getActionState(project: FactoryProject, actionId: ActionId, runs: readonly ActionRunSnapshot[] = []): { state: ActionRuntimeState; reason?: string } {
  const action = actionDefinitions.find((candidate) => candidate.id === actionId);
  if (!action) throw new Error(`Unknown action: ${actionId}`);
  const run = runs.find((candidate) => candidate.actionId === actionId);
  if (run?.state === "running" || run?.state === "queued") return { state: "RUNNING" };
  if (run?.state === "waiting_user") return { state: "WAITING_USER", ...(run.progress?.message ? { reason: run.progress.message } : {}) };
  if (run?.state === "failed") return { state: "ERROR", ...(run.safeErrorMessage ? { reason: run.safeErrorMessage } : {}) };
  const checkpoint = resolveProjectCheckpoints(project, runs).checkpoints.find((entry) => entry.definition.id === action.checkpointId)!;
  if (checkpoint.state === "complete") return { state: "SUCCESS" };
  if (checkpoint.state === "ready") return { state: "READY" };
  return { state: "BLOCKED", reason: checkpoint.blockingReason ?? "Checkpoint chưa sẵn sàng." };
}
