import type { ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { promptPreparationOutputSchema, resolveCharacterCompositionLock, type AssetConcept, type CharacterVersion, type ShotMotionPlan } from "@lsf/domain";
import { NineRouterClient, NineRouterTextResponseError } from "@lsf/providers";
import { loadNineRouterTextCertification } from "./nineRouterTextCertificationService";

export class PromptPreparationError extends Error { constructor(readonly category: "capability_not_verified" | "credential_missing" | "provider_failed" | "invalid_json" | "invalid_output", message: string) { super(message); } }
export const promptPreparationTimeoutMs = 120_000;
export const promptPreparationBatchSize = 4;
interface TextClient { createResponseText(input: { model: string; input: string; timeoutMs?: number }): Promise<{ text: string; returnedModelId?: string }>; }

type PromptShot = { id: string; sceneId?: string; purpose?: string; durationFrames?: number; visualMode: string; framing: string; cameraAngle: string; cameraMovement: string; subjectAction: string; continuityRefs: string[]; semanticBeat?: string | undefined; assetConceptIds?: string[] | undefined; motion?: ShotMotionPlan | undefined };

export async function runPromptPreparation(input: { shots: PromptShot[]; aspectRatio: "16:9" | "9:16"; character?: CharacterVersion | undefined; assetConcepts?: AssetConcept[] | undefined; manualMode?: boolean; credentialStore: ProviderCredentialStore; certificationStore: TextCertificationStore; createClient?: (config: { baseUrl: string; apiKey: string }) => TextClient }) {
  const imageShots = input.shots.filter((shot) => ["ai_image", "ai_video", "stock_image", "stock_video", "manual_upload", "uploaded"].includes(shot.visualMode));
  if (imageShots.length === 0) return { output: promptPreparationOutputSchema.parse({ prompts: [], scenePrompts: [] }) };
  if (input.manualMode) {
    const output = promptPreparationOutputSchema.parse({
      prompts: imageShots.map((shot) => localPromptForShot(shot, input.aspectRatio, input.character, input.assetConcepts ?? [])),
      scenePrompts: compileScenePromptPackages(imageShots, imageShots.map((shot) => localPromptForShot(shot, input.aspectRatio, input.character, input.assetConcepts ?? [])), input.aspectRatio, input.character)
    });
    return { output };
  }
  const aiShots = imageShots.filter((shot) => shot.visualMode === "ai_image" || shot.visualMode === "ai_video");
  const certification = await loadNineRouterTextCertification({ credentialStore: input.credentialStore, certificationStore: input.certificationStore });
  if (certification.status !== "verified") throw new PromptPreparationError("capability_not_verified", "A verified text-model certification is required before Prompt Preparation can run.");
  const settings = input.credentialStore.loadProviderCredentialSettings("9router"); const apiKey = await input.credentialStore.resolveProviderSecret("9router");
  if (!settings?.textModel || !apiKey) throw new PromptPreparationError("credential_missing", "The selected text model or credential is unavailable.");
  const client = input.createClient?.({ baseUrl: settings.baseUrl, apiKey }) ?? new NineRouterClient({ baseUrl: settings.baseUrl, apiKey, timeoutMs: promptPreparationTimeoutMs });
  const batches = Array.from({ length: Math.ceil(aiShots.length / promptPreparationBatchSize) }, (_, index) => aiShots.slice(index * promptPreparationBatchSize, (index + 1) * promptPreparationBatchSize));
  let responses: Array<{ text: string; returnedModelId?: string }>;
  try {
    responses = await Promise.all(batches.map((batch) => client.createResponseText({ model: settings.textModel!, timeoutMs: promptPreparationTimeoutMs, input: buildPromptRequest(batch, input.aspectRatio, input.character, input.assetConcepts) })));
  } catch (error) {
    throw new PromptPreparationError("provider_failed", error instanceof NineRouterTextResponseError ? `Prompt Preparation provider request failed: ${error.status}.` : "Prompt Preparation provider request failed.");
  }
  const prompts = responses.flatMap((response, index) => parsePromptBatch(response.text, batches[index]!, input.aspectRatio));
  const ids = new Set(aiShots.map((shot) => shot.id));
  if (prompts.some((prompt) => !ids.has(prompt.shotId) || prompt.aspectRatio !== input.aspectRatio) || new Set(prompts.map((prompt) => prompt.shotId)).size !== prompts.length || prompts.length !== aiShots.length) throw new PromptPreparationError("invalid_output", "Prompt Preparation must return exactly one correctly sized prompt for every approved AI-routed shot.");
  const shotMap = new Map(aiShots.map((shot) => [shot.id, shot]));
  const conceptsByShot = new Map<string, AssetConcept[]>();
  for (const concept of input.assetConcepts ?? []) conceptsByShot.set(concept.shotId, [...(conceptsByShot.get(concept.shotId) ?? []), concept]);
  const finalPrompts = prompts.map((prompt) => {
      const shot = shotMap.get(prompt.shotId);
      const contract = promptContractSuffix(input.character, conceptsByShot.get(prompt.shotId) ?? []);
      return {
        ...prompt,
        positivePrompt: appendPromptContract(prompt.positivePrompt, contract),
        ...(shot?.semanticBeat ? { semanticBeat: shot.semanticBeat } : {}),
        ...(shot?.assetConceptIds?.length ? { assetConceptIds: shot.assetConceptIds } : {}),
        ...(shot?.motion ? { motion: shot.motion } : {})
      };
    });
  const output = promptPreparationOutputSchema.parse({
    prompts: finalPrompts,
    scenePrompts: compileScenePromptPackages(aiShots, finalPrompts, input.aspectRatio, input.character)
  });
  const returnedModelId = responses.find((response) => response.returnedModelId)?.returnedModelId;
  return { output, ...(returnedModelId ? { returnedModelId } : {}) };
}

function promptContractSuffix(character: CharacterVersion | undefined, concepts: AssetConcept[]): string {
  const parts: string[] = [];
  if (character) {
    const composition = resolveCharacterCompositionLock(character);
    parts.push(`Character composition lock: ${composition.aspectRatio} canvas; subject ${composition.subjectAnchor}; normalized subject box x=${composition.subjectBox.x}, y=${composition.subjectBox.y}, width=${composition.subjectBox.width}, height=${composition.subjectBox.height}; ${composition.cameraDistance}; ${composition.headroom}; preserve safe zone x=${composition.safeZone.x}, y=${composition.safeZone.y}, width=${composition.safeZone.width}, height=${composition.safeZone.height} for diagrams and subtitles.`);
  }
  if (concepts.length) {
    parts.push(`Approved asset mapping: ${concepts.map((concept) => `${concept.id} ${concept.kind} ${concept.role}: ${concept.description}`).join(" | ")}`);
  }
  return parts.join(" ");
}

function appendPromptContract(prompt: string, contract: string): string {
  if (!contract) return prompt;
  const suffix = ` ${contract}`;
  const available = Math.max(1, 10_000 - suffix.length);
  return `${prompt.slice(0, available).trim()}${suffix}`.trim();
}

function buildPromptRequest(
  shots: PromptShot[],
  aspectRatio: "16:9" | "9:16",
  character: CharacterVersion | undefined,
  assetConcepts: AssetConcept[] | undefined
): string {
  const shotIds = new Set(shots.map((shot) => shot.id));
  const concepts = (assetConcepts ?? []).filter((concept) => shotIds.has(concept.shotId));
  const composition = character ? resolveCharacterCompositionLock(character) : undefined;
  return `Prepare final image prompts only for approved AI-routed shots. Return strict JSON {"prompts":[...]}. Each prompt must use exactly {"shotId":string,"promptVersionId":string,"positivePrompt":string,"negativePrompt":string,"aspectRatio":"16:9"|"9:16","continuityConstraints":string[],"prohibitedElements":string[]}. Put character identity, subject, approved asset concept, action, semantic beat, framing, camera, lighting, mood, composition lock, and aspect ratio in positivePrompt; keep negativePrompt separate. Do not create assets or imitate copyrighted characters. Character lock: ${JSON.stringify(character ? { name: character.name, persona: character.persona, invariantTraits: character.invariantTraits, prohibitedChanges: character.prohibitedChanges, composition } : undefined)}. Asset concepts: ${JSON.stringify(concepts)}. Required aspect ratio: ${aspectRatio}. Shots: ${JSON.stringify(shots)}\n`;
}

function localPromptForShot(shot: PromptShot, aspectRatio: "16:9" | "9:16", character: CharacterVersion | undefined, assetConcepts: AssetConcept[]) {
  const conceptText = assetConcepts.filter((concept) => concept.shotId === shot.id).map((concept) => `${concept.role}: ${concept.description}`).join("; ");
  const characterText = character ? `Use the locked teacher identity ${character.name}: ${character.persona.appearance}; preserve ${character.invariantTraits.join(", ")}.` : "Use the approved visual continuity bible.";
  const continuity = shot.continuityRefs.length ? `Continuity references: ${shot.continuityRefs.join(", ")}.` : "Keep continuity with the previous storyboard frame.";
  return {
    shotId: shot.id,
    promptVersionId: `prompt-${shot.id}-manual-v1`,
    positivePrompt: `${characterText} Create the approved storyboard frame for ${shot.purpose ?? shot.id}. ${shot.semanticBeat ?? "Follow the semantic beat exactly."} Subject action: ${shot.subjectAction}. Framing: ${shot.framing}; camera: ${shot.cameraAngle}; movement intent: ${shot.cameraMovement}. ${conceptText ? `Approved asset concept: ${conceptText}.` : "Use only the approved scene asset direction."} ${continuity} Output a clean ${aspectRatio} image with no text, logo, contact sheet, or watermark unless explicitly required by the storyboard.`,
    negativePrompt: "No identity drift, wardrobe drift, extra limbs, inconsistent framing, invented props, contact sheet, logo, watermark, or unrelated text.",
    aspectRatio,
    continuityConstraints: [continuity, "Preserve approved character and environment continuity."],
    prohibitedElements: ["identity drift", "unapproved text or logo", "contact sheet"],
    ...(shot.semanticBeat ? { semanticBeat: shot.semanticBeat } : {}),
    ...(shot.assetConceptIds?.length ? { assetConceptIds: shot.assetConceptIds } : {}),
    ...(shot.motion ? { motion: shot.motion } : {})
  };
}

function compileScenePromptPackages(shots: PromptShot[], prompts: ReturnType<typeof promptPreparationOutputSchema.parse>["prompts"], aspectRatio: "16:9" | "9:16", character: CharacterVersion | undefined) {
  const promptByShot = new Map(prompts.map((prompt) => [prompt.shotId, prompt]));
  const groups = new Map<string, PromptShot[]>();
  for (const shot of shots) {
    const sceneId = shot.sceneId ?? shot.id;
    groups.set(sceneId, [...(groups.get(sceneId) ?? []), shot]);
  }
  let globalNumber = 1;
  return [...groups.entries()].map(([sceneId, sceneShots]) => {
    const frameManifest = sceneShots.map((shot, index) => {
      const prompt = promptByShot.get(shot.id);
      const displayNumber = String(globalNumber++).padStart(3, "0");
      const role = /reuse/i.test(shot.visualMode) ? "REUSE" : index === 0 ? "BASE" : /expression|face/i.test(`${shot.purpose} ${shot.subjectAction}`) ? "EXPRESSION_CHANGE" : /pose|gesture|move|point/i.test(`${shot.purpose} ${shot.subjectAction}`) ? "POSE_CHANGE" : /chart|money|diagram|insert|cutaway/i.test(`${shot.purpose} ${shot.subjectAction}`) ? "INSERT" : "ACTION_KEYFRAME";
      return { shotId: shot.id, displayNumber, role, purpose: shot.purpose ?? shot.id, durationFrames: shot.durationFrames ?? 1, delta: prompt?.positivePrompt ?? shot.subjectAction, continuityRefs: shot.continuityRefs };
    });
    const locks = [
      "Create each frame as a separate image file, never a contact sheet.",
      "Do not skip frames or stop for confirmation between frames.",
      character ? `Keep the approved character bible unchanged: ${character.invariantTraits.join("; ")}.` : "Keep the approved visual bible unchanged."
    ];
    const promptText = `Create scene ${sceneId} as exactly ${frameManifest.length} separate ${aspectRatio} images. ${locks.join(" ")} Use the first frame as the base reference for later frames in this scene. ${frameManifest.map((frame) => `Frame ${frame.displayNumber} (${frame.role}): ${frame.delta}`).join(" ")} Save each result separately using the frame number, and continue until the scene is complete.`;
    return { sceneId, promptVersionId: `scene-prompt-${sceneId}-v1`, promptText, frameNumbers: frameManifest.map((frame) => frame.displayNumber), referenceInstructions: ["Attach the approved character master reference when the teacher appears.", "Use the previous frame in this scene as the internal reference for continuity."], continuityLocks: locks, expectedAspectRatio: aspectRatio, frameManifest };
  });
}

function parsePromptBatch(text: string, shots: Array<{ id: string }>, aspectRatio: "16:9" | "9:16") {
  let parsed: unknown;
  try { parsed = JSON.parse(text.trim()); } catch { throw new PromptPreparationError("invalid_json", "Prompt Preparation returned invalid JSON."); }
  const result = promptPreparationOutputSchema.safeParse(parsed);
  if (!result.success) throw new PromptPreparationError("invalid_output", "Prompt Preparation returned an invalid structured output.");
  const ids = new Set(shots.map((shot) => shot.id));
  if (result.data.prompts.some((prompt) => !ids.has(prompt.shotId) || prompt.aspectRatio !== aspectRatio) || new Set(result.data.prompts.map((prompt) => prompt.shotId)).size !== result.data.prompts.length || result.data.prompts.length !== shots.length) throw new PromptPreparationError("invalid_output", "Prompt Preparation must return exactly one correctly sized prompt for every approved AI-routed shot.");
  return result.data.prompts;
}
