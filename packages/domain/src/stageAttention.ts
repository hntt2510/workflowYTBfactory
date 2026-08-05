import { getWorkflowStageDefinition } from "./workflowRegistry";
import type { StageAttention, StageAttentionAction } from "./types";

export interface StageAttentionOptions {
  phase?: string;
  failedItem?: string;
  recommendedAction?: string;
  retryAction?: string;
  retryRoute?: string;
  settingsRoute?: string;
  existingActions?: StageAttentionAction[];
}

const settingsFailureCodePattern = /provider|credential|capability|configuration|config|model|certification|ffmpeg/i;

function settingsRouteFor(stageId: string, code: string): string | undefined {
  if (!settingsFailureCodePattern.test(code)) return undefined;
  return getWorkflowStageDefinition(stageId)?.executionKind === "provider_audio" ? "settings" : "providers";
}

function uniqueActions(actions: StageAttentionAction[]): StageAttentionAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.label}:${action.route ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function createStageAttention(stageId: string, code: string, safeReason: string, options: StageAttentionOptions = {}): StageAttention {
  const definition = getWorkflowStageDefinition(stageId);
  const phase = options.phase ?? definition?.name ?? stageId;
  const reviewRoute = definition?.screenRoute;
  const retryAction = options.retryAction ?? "Retry stage";
  const retryRoute = options.retryRoute ?? reviewRoute;
  const settingsRoute = options.settingsRoute ?? settingsRouteFor(stageId, code);
  const actions: StageAttentionAction[] = [
    { label: "Review stage", ...(reviewRoute ? { route: reviewRoute } : {}) },
    { label: retryAction, ...(retryRoute ? { route: retryRoute } : {}) },
    ...(options.existingActions ?? []),
    ...(settingsRoute ? [{ label: "Open Settings", route: settingsRoute }] : [])
  ];
  return {
    code,
    message: safeReason,
    phase,
    safeReason,
    ...(options.failedItem ? { failedItem: options.failedItem } : {}),
    recommendedAction: options.recommendedAction ?? "Review stage",
    retryAction,
    ...(settingsRoute ? { settingsRoute } : {}),
    actions: uniqueActions(actions)
  };
}

export function normalizeStageAttention(stageId: string, attention: Partial<StageAttention>): StageAttention {
  const code = typeof attention.code === "string" && attention.code ? attention.code : "NEEDS_ATTENTION";
  const safeReason = typeof attention.safeReason === "string" && attention.safeReason
    ? attention.safeReason
    : typeof attention.message === "string" && attention.message
      ? attention.message
      : `${stageId} needs attention before the workflow can continue.`;
  const options: StageAttentionOptions = {};
  if (typeof attention.phase === "string" && attention.phase) options.phase = attention.phase;
  if (typeof attention.failedItem === "string" && attention.failedItem) options.failedItem = attention.failedItem;
  if (typeof attention.recommendedAction === "string" && attention.recommendedAction) options.recommendedAction = attention.recommendedAction;
  if (typeof attention.retryAction === "string" && attention.retryAction) options.retryAction = attention.retryAction;
  if (typeof attention.settingsRoute === "string" && attention.settingsRoute) options.settingsRoute = attention.settingsRoute;
  if (Array.isArray(attention.actions)) {
    options.existingActions = attention.actions.filter((action): action is StageAttentionAction => Boolean(
      action && typeof action === "object" && typeof action.label === "string" && action.label
    ));
  }
  return createStageAttention(stageId, code, safeReason, options);
}
