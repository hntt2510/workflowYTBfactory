import type { FactoryProject, WorkflowStageStatus } from "./types";
import { isWorkflowStageApplicable } from "./workflowProgress";
import { getWorkflowStageDefinition, workflowStageDefinitions } from "./workflowRegistry";

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
  { id: "script", label: "Câu chuyện + Kịch bản", order: 4, stageIds: ["story-architecture", "outline", "script", "script-review"], required: true, route: "script" },
  { id: "director", label: "Đạo diễn", order: 5, stageIds: ["director-analysis", "scene-plan"], required: true, route: "scenes" },
  { id: "storyboard", label: "Storyboard / Keyframes", order: 6, stageIds: ["shot-plan"], required: true, route: "shots" },
  { id: "prompts", label: "Prompt + GG Lab Batch", order: 7, stageIds: ["prompt-preparation", "batch-planner"], required: true, route: "visuals" },
  { id: "images", label: "Nhập + Duyệt ảnh", order: 8, stageIds: ["gglab-generation-gate", "asset-review"], required: true, route: "assets" },
  { id: "handoff", label: "Bàn giao", order: 9, stageIds: ["production-handoff"], required: true, route: "project-overview" }
];

export type ActionId = "SAVE_BRIEF" | "GENERATE_RESEARCH_ANALYSIS" | "RUN_TRANSCRIPT_CLEANING" | "RUN_REFERENCE_SEGMENTATION" | "GENERATE_COMPETITOR_DNA" | "GENERATE_OPPORTUNITY_MAP" | "GENERATE_IDEAS" | "SELECT_IDEA" | "GENERATE_STORY_ARCHITECTURE" | "GENERATE_OUTLINE" | "GENERATE_SCRIPT" | "REVIEW_SCRIPT" | "REVISE_SCRIPT" | "APPROVE_SCRIPT" | "GENERATE_DIRECTOR_PLAN" | "GENERATE_STORYBOARD" | "PREPARE_GG_LAB_PROMPTS" | "IMPORT_IMAGES" | "APPROVE_IMAGES" | "GENERATE_HANDOFF";
export interface ActionDefinition {
  id: ActionId;
  checkpointId: CheckpointId;
  stageId: string;
  label: string;
  kind: "command" | "user_input";
  prerequisites: readonly CheckpointId[];
  stagePrerequisites?: readonly string[];
  expectedOutput: string;
  retryPolicy: "retry_failed" | "retry_missing_units" | "resume_user_input";
  invalidates: readonly CheckpointId[];
}
export const actionDefinitions: readonly ActionDefinition[] = [
  { id: "SAVE_BRIEF", checkpointId: "brief", stageId: "project-setup", label: "Lưu Brief", kind: "user_input", prerequisites: [], expectedOutput: "Saved project brief", retryPolicy: "resume_user_input", invalidates: ["research", "idea", "script", "director", "storyboard", "prompts", "images", "handoff"] },
  { id: "GENERATE_RESEARCH_ANALYSIS", checkpointId: "research", stageId: "reference-intake", label: "Phân tích tham khảo", kind: "command", prerequisites: ["brief"], expectedOutput: "Reference analysis artifacts", retryPolicy: "retry_missing_units", invalidates: ["idea", "script", "director", "storyboard", "prompts", "images", "handoff"] },
  { id: "RUN_TRANSCRIPT_CLEANING", checkpointId: "research", stageId: "transcript-cleaning", label: "Làm sạch transcript", kind: "command", prerequisites: ["brief"], stagePrerequisites: ["reference-intake"], expectedOutput: "Reviewable cleaned transcript", retryPolicy: "retry_missing_units", invalidates: ["idea", "script", "director", "storyboard", "prompts", "images", "handoff"] },
  { id: "RUN_REFERENCE_SEGMENTATION", checkpointId: "research", stageId: "reference-segmentation", label: "Phân đoạn tham khảo", kind: "command", prerequisites: ["brief"], stagePrerequisites: ["transcript-cleaning"], expectedOutput: "Reviewable reference segments", retryPolicy: "retry_failed", invalidates: ["idea", "script", "director", "storyboard", "prompts", "images", "handoff"] },
  { id: "GENERATE_COMPETITOR_DNA", checkpointId: "research", stageId: "competitor-dna", label: "Phân tích DNA đối thủ", kind: "command", prerequisites: ["brief"], stagePrerequisites: ["reference-segmentation"], expectedOutput: "Reviewable competitor DNA", retryPolicy: "retry_failed", invalidates: ["idea", "script", "director", "storyboard", "prompts", "images", "handoff"] },
  { id: "GENERATE_OPPORTUNITY_MAP", checkpointId: "research", stageId: "opportunity-map", label: "Tạo bản đồ cơ hội", kind: "command", prerequisites: ["brief"], stagePrerequisites: ["competitor-dna"], expectedOutput: "Reviewable opportunity map", retryPolicy: "retry_failed", invalidates: ["idea", "script", "director", "storyboard", "prompts", "images", "handoff"] },
  { id: "GENERATE_IDEAS", checkpointId: "idea", stageId: "idea-lab", label: "Tạo ý tưởng", kind: "command", prerequisites: ["brief"], expectedOutput: "Reviewable idea candidates", retryPolicy: "retry_failed", invalidates: ["script", "director", "storyboard", "prompts", "images", "handoff"] },
  { id: "SELECT_IDEA", checkpointId: "idea", stageId: "idea-lab", label: "Chọn ý tưởng", kind: "user_input", prerequisites: ["brief"], expectedOutput: "Approved idea", retryPolicy: "resume_user_input", invalidates: ["script", "director", "storyboard", "prompts", "images", "handoff"] },
  { id: "GENERATE_STORY_ARCHITECTURE", checkpointId: "script", stageId: "story-architecture", label: "Tạo chiến lược câu chuyện", kind: "command", prerequisites: ["idea"], expectedOutput: "Reviewable story architecture", retryPolicy: "retry_failed", invalidates: ["script", "director", "storyboard", "prompts", "images", "handoff"] },
  { id: "GENERATE_OUTLINE", checkpointId: "script", stageId: "outline", label: "Tạo dàn ý", kind: "command", prerequisites: ["idea"], stagePrerequisites: ["story-architecture"], expectedOutput: "Reviewable duration-aware outline", retryPolicy: "retry_failed", invalidates: ["script", "director", "storyboard", "prompts", "images", "handoff"] },
  { id: "GENERATE_SCRIPT", checkpointId: "script", stageId: "script", label: "Tạo kịch bản", kind: "command", prerequisites: ["idea"], stagePrerequisites: ["outline"], expectedOutput: "Reviewable script", retryPolicy: "retry_failed", invalidates: ["director", "storyboard", "prompts", "images", "handoff"] },
  { id: "REVIEW_SCRIPT", checkpointId: "script", stageId: "script-review", label: "Kiểm tra kịch bản", kind: "command", prerequisites: [], expectedOutput: "Structured script review", retryPolicy: "retry_failed", invalidates: [] },
  { id: "REVISE_SCRIPT", checkpointId: "script", stageId: "script", label: "Sửa kịch bản", kind: "user_input", prerequisites: ["idea"], expectedOutput: "Revised script", retryPolicy: "resume_user_input", invalidates: ["director", "storyboard", "prompts", "images", "handoff"] },
  { id: "APPROVE_SCRIPT", checkpointId: "script", stageId: "script", label: "Duyệt kịch bản", kind: "user_input", prerequisites: [], stagePrerequisites: ["script-review"], expectedOutput: "Explicitly approved script", retryPolicy: "resume_user_input", invalidates: [] },
  { id: "GENERATE_DIRECTOR_PLAN", checkpointId: "director", stageId: "scene-plan", label: "Tạo kế hoạch đạo diễn", kind: "command", prerequisites: ["script"], expectedOutput: "Reviewable director plan", retryPolicy: "retry_failed", invalidates: ["storyboard", "prompts", "images", "handoff"] },
  { id: "GENERATE_STORYBOARD", checkpointId: "storyboard", stageId: "shot-plan", label: "Tạo storyboard", kind: "command", prerequisites: ["director"], expectedOutput: "Reviewable storyboard", retryPolicy: "retry_missing_units", invalidates: ["prompts", "images", "handoff"] },
  { id: "PREPARE_GG_LAB_PROMPTS", checkpointId: "prompts", stageId: "prompt-preparation", label: "Chuẩn bị prompt GG Lab", kind: "command", prerequisites: ["storyboard"], expectedOutput: "Reviewable GG Lab prompt batches", retryPolicy: "retry_missing_units", invalidates: ["images", "handoff"] },
  { id: "IMPORT_IMAGES", checkpointId: "images", stageId: "gglab-generation-gate", label: "Nhập ảnh từ GG Lab", kind: "user_input", prerequisites: ["prompts"], expectedOutput: "Imported image files", retryPolicy: "resume_user_input", invalidates: ["handoff"] },
  { id: "APPROVE_IMAGES", checkpointId: "images", stageId: "asset-review", label: "Duyệt ảnh", kind: "user_input", prerequisites: ["prompts"], expectedOutput: "Approved image mapping", retryPolicy: "resume_user_input", invalidates: ["handoff"] },
  { id: "GENERATE_HANDOFF", checkpointId: "handoff", stageId: "production-handoff", label: "Tạo gói bàn giao", kind: "user_input", prerequisites: ["images"], expectedOutput: "Project handoff package", retryPolicy: "resume_user_input", invalidates: [] }
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
  const stageById = new Map(project.stages.map((stage) => [stage.id, stage.status]));
  // Script Review is intentionally available for a current draft before Script
  // approval; treating its canonical dependency as an approved-only dependency
  // would make the G02 checkpoint button contradict the creator flow.
  if (actionId === "REVIEW_SCRIPT") {
    const scriptStatus = stageById.get("script");
    const reviewStatus = stageById.get("script-review");
    if (reviewStatus === "approved") return { state: "SUCCESS" };
    if (scriptStatus === "needs_review" || scriptStatus === "approved") return { state: "READY" };
    return { state: "BLOCKED", reason: "Create or import a Script draft before running Script Review." };
  }
  if (actionId === "APPROVE_SCRIPT") {
    if (stageById.get("script") !== "needs_review") return { state: "BLOCKED", reason: "A current reviewable Script version is required." };
    if (stageById.get("script-review") !== "approved") return { state: "BLOCKED", reason: "Run Script Review for the current Script version first." };
    return { state: "READY" };
  }
  const checkpoints = resolveProjectCheckpoints(project, runs).checkpoints;
  const unmetPrerequisite = action.prerequisites.map((id) => checkpoints.find((entry) => entry.definition.id === id)!).find((entry) => entry.state !== "complete" && entry.state !== "not_applicable");
  if (unmetPrerequisite) return { state: "BLOCKED", reason: `Hoàn tất ${unmetPrerequisite.definition.label} trước khi tiếp tục.` };
  const stagePrerequisites = action.stagePrerequisites ?? getWorkflowStageDefinition(action.stageId)?.dependsOn ?? [];
  const unmetStageDependency = stagePrerequisites.find((stageId) => stageById.get(stageId) !== "approved");
  if (unmetStageDependency) return { state: "BLOCKED", reason: `Hoàn tất ${getWorkflowStageDefinition(unmetStageDependency)?.name ?? unmetStageDependency} trước khi tiếp tục.` };
  const checkpoint = checkpoints.find((entry) => entry.definition.id === action.checkpointId)!;
  if (checkpoint.state === "complete") return { state: "SUCCESS" };
  if (checkpoint.state === "ready") return { state: "READY" };
  return { state: "BLOCKED", reason: checkpoint.blockingReason ?? "Checkpoint chưa sẵn sàng." };
}
