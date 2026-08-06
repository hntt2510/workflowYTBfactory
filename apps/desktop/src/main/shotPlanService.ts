import type { ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { imageBudgetForDuration, maxAiImagesPerMinute, motionEffectsFromGrammar, selectMotionEffect, shotPlanOutputSchema, type ResolvedChannelPromptContext } from "@lsf/domain";
import { NineRouterClient, NineRouterTextResponseError } from "@lsf/providers";
import { loadNineRouterTextCertification } from "./nineRouterTextCertificationService";

export class ShotPlanError extends Error {
  constructor(readonly category: "capability_not_verified" | "credential_missing" | "provider_failed" | "invalid_json" | "invalid_output", message: string) {
    super(message);
  }
}

export const shotPlanTimeoutMs = 180_000;

interface TextClient {
  createResponseText(input: { model: string; input: string; timeoutMs?: number }): Promise<{ text: string; returnedModelId?: string }>;
}

const shotVisualModes = ["ai_image", "ai_video", "stock_image", "stock_video", "manual_upload", "uploaded", "document", "diagram", "text_card", "reuse"] as const;
type ShotVisualMode = (typeof shotVisualModes)[number];
type ShotPlanScene = { id: string; startFrame: number; durationFrames: number; purpose?: string; narration?: string };
type ShotPlanShot = ReturnType<typeof shotPlanOutputSchema.parse>["shots"][number];

export async function runShotPlan(input: {
  scenes: ShotPlanScene[];
  fps: number;
  characterFirst?: boolean;
  promptContext?: ResolvedChannelPromptContext;
  credentialStore: ProviderCredentialStore;
  certificationStore: TextCertificationStore;
  createClient?: (config: { baseUrl: string; apiKey: string }) => TextClient;
}) {
  const certification = await loadNineRouterTextCertification({ credentialStore: input.credentialStore, certificationStore: input.certificationStore });
  if (certification.status !== "verified") throw new ShotPlanError("capability_not_verified", "A verified text-model certification is required before Shot Plan can run.");
  const settings = input.credentialStore.loadProviderCredentialSettings("9router");
  const apiKey = await input.credentialStore.resolveProviderSecret("9router");
  if (!settings?.textModel || !apiKey) throw new ShotPlanError("credential_missing", "The selected text model or credential is unavailable.");
  const characterFirst = input.characterFirst === true;
  const preferredMotionEffects = characterFirst ? motionEffectsFromGrammar(input.promptContext?.productionGrammar.preferredMotion) : [];
  if (characterFirst) validateCharacterFirstScenes(input.scenes, input.fps);
  let response: { text: string; returnedModelId?: string };
  try {
    const instruction = [
      "Create a shot plan only from the approved scenes.",
      "Return strict JSON with a shots array.",
      "Every shot must include id, sceneId, order, startFrame, durationFrames, fps, purpose, visualMode, framing, cameraAngle, cameraMovement, subjectAction, startState, endState, semanticBeat, and continuityRefs.",
      "Do not generate motion metadata; the application assigns one supported motion effect locally from the semantic beat and subject action.",
      "startState and endState must always be JSON objects; use {} when there is no state detail. continuityRefs must always be a string array; use [] when there are no references.",
      "Split narration into semantic visual beats, target 2-4 seconds per visual, and allow up to 5 seconds only when needed to preserve meaning.",
      `Use no more than ${maxAiImagesPerMinute} AI-generated images per minute; reuse assets or explanatory visuals after that budget.`,
      "Every shot must map to a supplied scene, use the supplied fps, cover each scene continuously from its start to its end, and never use endFrame. Do not create assets.",
      `Use only this channel's resolved visual and production grammar: ${JSON.stringify(input.promptContext ? { channelId: input.promptContext.channelId, visualIdentity: input.promptContext.visualIdentity, storyPattern: input.promptContext.storyPattern, productionGrammar: input.promptContext.productionGrammar } : undefined)}`,
      JSON.stringify({ scenes: input.scenes, fps: input.fps, characterFirst: input.characterFirst === true })
    ].join("\n");
    response = await (input.createClient?.({ baseUrl: settings.baseUrl, apiKey }) ?? new NineRouterClient({ baseUrl: settings.baseUrl, apiKey, timeoutMs: shotPlanTimeoutMs })).createResponseText({ model: settings.textModel, input: instruction, timeoutMs: shotPlanTimeoutMs });
  } catch (error) {
    throw new ShotPlanError("provider_failed", error instanceof NineRouterTextResponseError ? `Shot Plan provider request failed: ${error.status}.` : "Shot Plan provider request failed.");
  }
  let parsed: unknown;
  try {
    parsed = parseProviderJson(response.text);
  } catch {
    throw new ShotPlanError("invalid_json", "Shot Plan returned invalid JSON.");
  }
  const providerOutput = characterFirst
    ? normalizeCharacterFirstProviderOutput(parsed, input.scenes, input.fps)
    : normalizeProviderMotion(parsed);
  let result = shotPlanOutputSchema.safeParse(providerOutput);
  if (!result.success) {
    const issue = result.error.issues[0];
    const location = issue?.path.length ? ` at ${issue.path.join(".")}` : "";
    throw new ShotPlanError("invalid_output", `Shot Plan returned an invalid structured output${location}.`);
  }
  const normalizedShots = characterFirst
    ? normalizeCharacterFirstShotTiming(result.data.shots, input.scenes, input.fps)
    : normalizeShotTiming(result.data.shots, input.scenes);
  const normalizedOutput = shotPlanOutputSchema.parse({ shots: normalizedShots });
  if (!characterFirst) {
    const scenes = new Map(input.scenes.map((scene) => [scene.id, scene]));
    if (normalizedOutput.shots.some((shot) => {
      const scene = scenes.get(shot.sceneId);
      return !scene || shot.fps !== input.fps || shot.startFrame < scene.startFrame || shot.startFrame + shot.durationFrames > scene.startFrame + scene.durationFrames;
    })) throw new ShotPlanError("invalid_output", "Shot timing must remain within its approved scene.");
    for (const scene of input.scenes) {
      const shots = normalizedOutput.shots.filter((shot) => shot.sceneId === scene.id).sort((left, right) => left.startFrame - right.startFrame);
      if (!shots.length || shots[0]!.startFrame !== scene.startFrame || shots.at(-1)!.startFrame + shots.at(-1)!.durationFrames !== scene.startFrame + scene.durationFrames || shots.some((shot, index) => index > 0 && shot.startFrame !== shots[index - 1]!.startFrame + shots[index - 1]!.durationFrames)) {
        throw new ShotPlanError("invalid_output", "Shot timing must cover every approved scene without gaps.");
      }
    }
  }
  const targetDurationSeconds = Math.max(...input.scenes.map((scene) => scene.startFrame + scene.durationFrames), 1) / input.fps;
  const imageBudget = imageBudgetForDuration(targetDurationSeconds);
  const budgetedShots = characterFirst
    ? mergeCharacterFirstImageBudget(splitCharacterFirstLongShots(normalizedOutput.shots, input.fps), input.scenes, input.fps, imageBudget)
    : normalizedOutput.shots;
  if (characterFirst && (budgetedShots.filter((shot) => shot.visualMode === "ai_image").length > imageBudget || hasRollingImageBudgetViolation(budgetedShots, input.fps))) {
    throw new ShotPlanError("invalid_output", "Shot Plan exceeds the 20 AI-generated images per rolling minute budget.");
  }
  const output = shotPlanOutputSchema.parse({
    shots: budgetedShots.map((shot) => ({
      ...shot,
      semanticBeat: shot.semanticBeat?.trim() || shot.purpose,
      motion: shot.motion?.userOverride ? shot.motion : selectMotionEffect({ purpose: shot.purpose, subjectAction: shot.subjectAction, ...(shot.semanticBeat ? { assetRole: shot.semanticBeat } : {}), preferredEffects: preferredMotionEffects })
    }))
  });
  return { output, ...(response.returnedModelId ? { returnedModelId: response.returnedModelId } : {}) };
}

function parseProviderJson(text: string): unknown {
  let candidate = text.replace(/^\uFEFF/, "").trim();
  const fenced = candidate.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) candidate = fenced[1].trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const objectStart = candidate.indexOf("{");
    const arrayStart = candidate.indexOf("[");
    const starts = [objectStart, arrayStart].filter((index) => index >= 0);
    const start = starts.length ? Math.min(...starts) : -1;
    const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
    if (start < 0 || end <= start) throw new Error("Provider response did not contain a JSON value.");
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

function validateCharacterFirstScenes(scenes: ShotPlanScene[], fps: number): void {
  if (!Number.isInteger(fps) || fps <= 0 || fps > 120 || scenes.length === 0 || scenes.length > 500) {
    throw new ShotPlanError("invalid_output", "Approved scenes are not valid for Shot Plan.");
  }
  const ids = new Set<string>();
  for (const scene of scenes) {
    if (!scene.id.trim() || ids.has(scene.id) || !Number.isInteger(scene.startFrame) || scene.startFrame < 0 || !Number.isInteger(scene.durationFrames) || scene.durationFrames < 1) {
      throw new ShotPlanError("invalid_output", "Approved scenes are not valid for Shot Plan.");
    }
    ids.add(scene.id);
  }
}

function normalizeCharacterFirstProviderOutput(value: unknown, scenes: ShotPlanScene[], fps: number): { shots: Array<Record<string, unknown>> } {
  const rawValue = asRecord(value);
  const rawShots = (Array.isArray(value)
    ? value
    : rawValue && Array.isArray(rawValue.shots)
      ? rawValue.shots
      : []).slice(0, 500);
  const usedIds = new Set<string>();
  const grouped = new Map<string, Array<Record<string, unknown>>>();
  scenes.forEach((scene) => grouped.set(scene.id, []));

  rawShots.forEach((rawShot, index) => {
    const raw = asRecord(rawShot) ?? {};
    const scene = resolveCharacterFirstScene(raw, index, scenes);
    const purpose = textValue(raw.purpose, scene.purpose ?? scene.narration ?? "Explain the approved scene.", 2000);
    const semanticBeat = textValue(raw.semanticBeat, purpose, 2000);
    const baseId = safeShotId(textValue(raw.id, `shot-${index + 1}`, 160), `shot-${index + 1}`);
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    usedIds.add(id);
    const shot: Record<string, unknown> = {
      id,
      sceneId: scene.id,
      order: Math.max(0, integerValue(raw.order, index)),
      startFrame: Math.max(0, integerValue(raw.startFrame, scene.startFrame)),
      durationFrames: positiveIntegerValue(raw.durationFrames, Math.max(1, Math.round(scene.durationFrames / 2))),
      fps,
      purpose,
      visualMode: normalizeVisualMode(raw.visualMode, { purpose, semanticBeat, subjectAction: textValue(raw.subjectAction, "Explain the key point.", 2000) }),
      framing: textValue(raw.framing, "Medium shot", 1000),
      cameraAngle: textValue(raw.cameraAngle, "Eye level", 1000),
      cameraMovement: textValue(raw.cameraMovement, "Subtle push in", 1000),
      subjectAction: textValue(raw.subjectAction, "Explain the key point.", 2000),
      startState: normalizeState(raw.startState),
      endState: normalizeState(raw.endState),
      continuityRefs: normalizeStringArray(raw.continuityRefs),
      semanticBeat,
      motion: selectMotionEffect({ purpose, subjectAction: textValue(raw.subjectAction, "Explain the key point.", 2000), assetRole: semanticBeat })
    };
    const assetConceptIds = normalizeStringArray(raw.assetConceptIds)
      .map((item) => safeShotId(item, ""))
      .filter(Boolean)
      .slice(0, 20);
    if (assetConceptIds.length) shot.assetConceptIds = assetConceptIds;
    grouped.get(scene.id)!.push(shot);
  });

  scenes.forEach((scene, index) => {
    if (grouped.get(scene.id)!.length === 0) {
      grouped.get(scene.id)!.push(createFallbackCharacterFirstShot(scene, fps, index));
    }
  });
  return { shots: scenes.flatMap((scene) => grouped.get(scene.id)!) };
}

function normalizeCharacterFirstShotTiming(shots: ShotPlanShot[], scenes: ShotPlanScene[], fps: number): ShotPlanShot[] {
  const grouped = new Map<string, ShotPlanShot[]>();
  scenes.forEach((scene) => grouped.set(scene.id, []));
  shots.forEach((shot) => grouped.get(shot.sceneId)?.push(shot));
  const normalized: ShotPlanShot[] = [];
  scenes.forEach((scene, sceneIndex) => {
    let sceneShots = (grouped.get(scene.id) ?? []).sort((left, right) => left.order - right.order || left.startFrame - right.startFrame);
    if (sceneShots.length === 0) sceneShots = [createFallbackCharacterFirstShot(scene, fps, sceneIndex) as ShotPlanShot];
    if (sceneShots.length > scene.durationFrames) sceneShots = mergeShotTail(sceneShots, scene.durationFrames);
    let cursor = scene.startFrame;
    sceneShots.forEach((shot, index) => {
      const remainingShots = sceneShots.length - index - 1;
      const remainingFrames = scene.startFrame + scene.durationFrames - cursor;
      const durationFrames = index === sceneShots.length - 1
        ? remainingFrames
        : Math.min(Math.max(1, shot.durationFrames), Math.max(1, remainingFrames - remainingShots));
      normalized.push({ ...shot, sceneId: scene.id, fps, startFrame: cursor, durationFrames });
      cursor += durationFrames;
    });
  });
  return normalized;
}

function splitCharacterFirstLongShots(shots: ShotPlanShot[], fps: number): ShotPlanShot[] {
  const maxDurationFrames = Math.max(1, fps * 5);
  const usedIds = new Set(shots.map((shot) => shot.id));
  return shots.flatMap((shot) => {
    if (shot.durationFrames <= maxDurationFrames) return [shot];
    const parts: ShotPlanShot[] = [];
    let remainingFrames = shot.durationFrames;
    let startOffset = 0;
    let part = 0;
    while (remainingFrames > 0) {
      const durationFrames = Math.min(maxDurationFrames, remainingFrames);
      let id = part === 0 ? shot.id : `${shot.id}-part-${part + 1}`;
      let suffix = part + 1;
      while (usedIds.has(id) && id !== shot.id) id = `${shot.id}-part-${++suffix}`;
      usedIds.add(id);
      parts.push({
        ...shot,
        id,
        order: shot.order,
        startFrame: shot.startFrame + startOffset,
        durationFrames
      });
      remainingFrames -= durationFrames;
      startOffset += durationFrames;
      part += 1;
    }
    return parts;
  });
}

function mergeCharacterFirstImageBudget(shots: ShotPlanShot[], scenes: ShotPlanScene[], fps: number, imageBudget: number): ShotPlanShot[] {
  let working = [...shots];
  const maxDurationFrames = Math.max(1, fps * 5);
  while (working.filter((shot) => shot.visualMode === "ai_image").length > imageBudget || hasRollingImageBudgetViolation(working, fps)) {
    const candidates = working
      .map((shot, index) => ({ shot, index, next: working[index + 1] }))
      .filter(({ shot, next }) => Boolean(next) && shot.sceneId === next!.sceneId && shot.durationFrames + next!.durationFrames <= maxDurationFrames && (shot.visualMode === "ai_image" || next!.visualMode === "ai_image"))
      .sort((left, right) => {
        const leftBoth = left.shot.visualMode === "ai_image" && left.next!.visualMode === "ai_image";
        const rightBoth = right.shot.visualMode === "ai_image" && right.next!.visualMode === "ai_image";
        return Number(rightBoth) - Number(leftBoth);
      });
    const candidate = candidates[0];
    if (!candidate) break;
    const merged = mergeShotRecords(candidate.shot, candidate.next!);
    working.splice(candidate.index, 2, merged);
  }
  return normalizeCharacterFirstShotTiming(working, scenes, fps);
}

function hasRollingImageBudgetViolation(shots: ShotPlanShot[], fps: number): boolean {
  const windowFrames = Math.max(1, fps * 60);
  const imageShots = shots.filter((shot) => shot.visualMode === "ai_image").sort((left, right) => left.startFrame - right.startFrame);
  return imageShots.some((shot, index) => {
    let count = 0;
    for (let cursor = index; cursor >= 0 && shot.startFrame - imageShots[cursor]!.startFrame < windowFrames; cursor -= 1) count += 1;
    return count > maxAiImagesPerMinute;
  });
}

function mergeShotTail(shots: ShotPlanShot[], maxCount: number): ShotPlanShot[] {
  const kept = shots.slice(0, maxCount);
  const overflow = shots.slice(maxCount);
  if (!overflow.length) return kept;
  const last = kept[kept.length - 1]!;
  kept[kept.length - 1] = overflow.reduce((merged, shot) => mergeShotRecords(merged, shot), last);
  return kept;
}

function mergeShotRecords(left: ShotPlanShot, right: ShotPlanShot): ShotPlanShot {
  const base = left.visualMode === "ai_image" && right.visualMode !== "ai_image" ? right : left;
  return {
    ...base,
    id: left.id,
    order: Math.min(left.order, right.order),
    purpose: joinShotText(left.purpose, right.purpose, 2000),
    subjectAction: joinShotText(left.subjectAction, right.subjectAction, 2000),
    semanticBeat: joinShotText(left.semanticBeat ?? left.purpose, right.semanticBeat ?? right.purpose, 2000),
    continuityRefs: [...new Set([...left.continuityRefs, ...right.continuityRefs])].slice(0, 50),
    durationFrames: left.durationFrames + right.durationFrames
  };
}

function resolveCharacterFirstScene(raw: Record<string, unknown>, index: number, scenes: ShotPlanScene[]): ShotPlanScene {
  const explicitId = typeof raw.sceneId === "string" ? raw.sceneId.trim() : "";
  const explicit = scenes.find((scene) => scene.id === explicitId);
  if (explicit) return explicit;
  const startFrame = finiteNumber(raw.startFrame);
  const durationFrames = Math.max(1, finiteNumber(raw.durationFrames) ?? 1);
  if (startFrame !== undefined) {
    const endFrame = startFrame + durationFrames;
    const closest = scenes
      .map((scene) => ({ scene, overlap: Math.max(0, Math.min(endFrame, scene.startFrame + scene.durationFrames) - Math.max(startFrame, scene.startFrame)), distance: Math.abs(startFrame - scene.startFrame) }))
      .sort((left, right) => right.overlap - left.overlap || left.distance - right.distance)[0];
    if (closest) return closest.scene;
  }
  return scenes[index % scenes.length]!;
}

function createFallbackCharacterFirstShot(scene: ShotPlanScene, fps: number, index: number): Record<string, unknown> {
  const purpose = textValue(scene.purpose, scene.narration ?? "Explain the approved scene.", 2000);
  const semanticBeat = purpose;
  const subjectAction = "Explain the key point";
  return {
    id: `shot-fallback-${index + 1}`,
    sceneId: scene.id,
    order: 0,
    startFrame: scene.startFrame,
    durationFrames: scene.durationFrames,
    fps,
    purpose,
    visualMode: normalizeVisualMode(undefined, { purpose, semanticBeat, subjectAction }),
    framing: "Medium shot",
    cameraAngle: "Eye level",
    cameraMovement: "Subtle push in",
    subjectAction,
    startState: {},
    endState: {},
    continuityRefs: [],
    semanticBeat,
    motion: selectMotionEffect({ purpose, subjectAction, assetRole: semanticBeat })
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : undefined;
  return number !== undefined && Number.isFinite(number) ? number : undefined;
}

function integerValue(value: unknown, fallback: number): number {
  const number = finiteNumber(value);
  return number === undefined ? fallback : Math.trunc(number);
}

function positiveIntegerValue(value: unknown, fallback: number): number {
  return Math.max(1, integerValue(value, fallback));
}

function textValue(value: unknown, fallback: string, maxLength: number): string {
  const text = typeof value === "string" && value.trim() ? value.trim() : fallback;
  return text.slice(0, maxLength) || fallback.slice(0, maxLength);
}

function safeShotId(value: string, fallback: string): string {
  return value.replace(/[^A-Za-z0-9._:-]+/g, "-").slice(0, 160) || fallback;
}

function joinShotText(left: string, right: string, maxLength: number): string {
  return [...new Set([left.trim(), right.trim()].filter(Boolean))].join("; ").slice(0, maxLength) || left;
}

function normalizeProviderMotion(value: unknown): unknown {
  if (!value || typeof value !== "object" || !Array.isArray((value as { shots?: unknown }).shots)) return value;
  const shots = (value as { shots: unknown[] }).shots.map((shot) => {
    if (!shot || typeof shot !== "object") return shot;
    const normalizedShot = normalizeShotMetadata(shot as Record<string, unknown>);
    const fallback = selectMotionEffect({
      ...(typeof normalizedShot.purpose === "string" ? { purpose: normalizedShot.purpose } : {}),
      ...(typeof normalizedShot.subjectAction === "string" ? { subjectAction: normalizedShot.subjectAction } : {}),
      ...(typeof normalizedShot.semanticBeat === "string" ? { assetRole: normalizedShot.semanticBeat } : {})
    });
    return { ...normalizedShot, visualMode: normalizeVisualMode(normalizedShot.visualMode, normalizedShot), motion: fallback };
  });
  return { ...value, shots };
}

function normalizeVisualMode(value: unknown, shot: Record<string, unknown>): ShotVisualMode {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
    const aliases: Record<string, ShotVisualMode> = {
      image: "ai_image",
      illustration: "ai_image",
      ai: "ai_image",
      video: "ai_video",
      stock: "stock_video",
      stock_footage: "stock_video",
      upload: "manual_upload",
      manual: "manual_upload",
      chart: "diagram",
      flowchart: "diagram",
      text: "text_card",
      title_card: "text_card",
      reuse_asset: "reuse"
    };
    const candidate = aliases[normalized] ?? normalized;
    if ((shotVisualModes as readonly string[]).includes(candidate)) return candidate as ShotVisualMode;
  }
  const context = [shot.purpose, shot.semanticBeat, shot.subjectAction].filter((item): item is string => typeof item === "string").join(" ").toLowerCase();
  if (/quote|filing|source|document/.test(context)) return "document";
  if (/diagram|explain|timeline|chart|map|flow/.test(context)) return "diagram";
  if (/text card|title|subtitle|label/.test(context)) return "text_card";
  if (/stock|b-roll|footage/.test(context)) return "stock_video";
  return "ai_image";
}

function normalizeShotTiming<T extends { id: string; sceneId: string; order: number; startFrame: number; durationFrames: number }>(
  shots: T[],
  scenes: Array<{ id: string; startFrame: number; durationFrames: number }>
): T[] {
  const updates = new Map<string, { startFrame: number; durationFrames: number }>();
  for (const scene of scenes) {
    const sceneShots = shots
      .filter((shot) => shot.sceneId === scene.id)
      .sort((left, right) => left.order - right.order || left.startFrame - right.startFrame);
    if (!sceneShots.length || sceneShots.length > scene.durationFrames) continue;
    const sceneEnd = scene.startFrame + scene.durationFrames;
    if (sceneShots.some((shot) => shot.startFrame < scene.startFrame || shot.startFrame + shot.durationFrames > sceneEnd)) continue;
    let cursor = scene.startFrame;
    sceneShots.forEach((shot, index) => {
      const remainingShots = sceneShots.length - index - 1;
      const remainingFrames = sceneEnd - cursor;
      const durationFrames = index === sceneShots.length - 1
        ? remainingFrames
        : Math.min(shot.durationFrames, Math.max(1, remainingFrames - remainingShots));
      updates.set(shot.id, { startFrame: cursor, durationFrames });
      cursor += durationFrames;
    });
  }
  return shots.map((shot) => {
    const update = updates.get(shot.id);
    return update ? { ...shot, ...update } : shot;
  });
}

function normalizeShotMetadata(shot: Record<string, unknown>): Record<string, unknown> {
  return {
    ...shot,
    startState: normalizeState(shot.startState),
    endState: normalizeState(shot.endState),
    continuityRefs: normalizeStringArray(shot.continuityRefs)
  };
}

function normalizeState(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim()) return { description: value.trim() };
  if (Array.isArray(value) && value.length) return { items: value };
  return {};
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim().slice(0, 1000)).slice(0, 50);
  if (typeof value === "string" && value.trim()) return [value.trim().slice(0, 1000)];
  return [];
}
