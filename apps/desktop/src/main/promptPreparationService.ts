import type { ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { promptPreparationOutputSchema, resolveCharacterCompositionLock, type AssetConcept, type CharacterVersion, type ShotMotionPlan } from "@lsf/domain";
import { TextProviderError, type TextProvider } from "@lsf/providers";
import { adaptLegacyTextClient, type LegacyTextClient, resolveActiveTextProvider } from "./textProviderService";

export class PromptPreparationError extends Error { constructor(readonly category: "capability_not_verified" | "credential_missing" | "provider_failed" | "invalid_json" | "invalid_output", message: string) { super(message); } }
export const promptPreparationTimeoutMs = 120_000;
export const promptPreparationBatchSize = 4;
type TextClient = Pick<TextProvider, "generateStructured"> | LegacyTextClient;
const promptBatchOutputSchema = promptPreparationOutputSchema.pick({ prompts: true });

type PromptShot = { id: string; sceneId?: string; purpose?: string; durationFrames?: number; visualMode: string; framing: string; cameraAngle: string; cameraMovement: string; subjectAction: string; continuityRefs: string[]; semanticBeat?: string | undefined; assetConceptIds?: string[] | undefined; motion?: ShotMotionPlan | undefined };

export async function runPromptPreparation(input: { shots: PromptShot[]; aspectRatio: "16:9" | "9:16"; character?: CharacterVersion | undefined; assetConcepts?: AssetConcept[] | undefined; manualMode?: boolean; credentialStore: ProviderCredentialStore; certificationStore: TextCertificationStore; createClient?: (config: { baseUrl: string; apiKey: string }) => TextClient }) {
  const imageShots = input.shots.filter((shot) => ["ai_image", "ai_video", "stock_image", "stock_video", "manual_upload", "uploaded"].includes(shot.visualMode));
  if (input.manualMode) {
    const prompts = imageShots.map((shot) => localPromptForShot(shot, input.aspectRatio, input.character, input.assetConcepts ?? []));
    const output = promptPreparationOutputSchema.parse({
      prompts,
      scenePrompts: compileScenePromptPackages(input.shots, prompts, input.aspectRatio, input.character, input.assetConcepts ?? [])
    });
    return { output };
  }
  if (imageShots.length === 0) return { output: promptPreparationOutputSchema.parse({ prompts: [], scenePrompts: [] }) };
  const aiShots = imageShots.filter((shot) => shot.visualMode === "ai_image" || shot.visualMode === "ai_video");
  let configured: { provider: TextProvider; model: string };
  try { configured = await resolveActiveTextProvider({ credentialStore: input.credentialStore, certificationStore: input.certificationStore }); }
  catch (error) { throw new PromptPreparationError(error instanceof TextProviderError ? "capability_not_verified" : "credential_missing", "Verified Cockpit text capability is required before Prompt Preparation can run."); }
  const injected = input.createClient?.({ baseUrl: "", apiKey: "" });
  const client = injected && ("generateStructured" in injected ? injected : adaptLegacyTextClient(injected));
  const batches = Array.from({ length: Math.ceil(aiShots.length / promptPreparationBatchSize) }, (_, index) => aiShots.slice(index * promptPreparationBatchSize, (index + 1) * promptPreparationBatchSize));
  let responses: Array<{ data: ReturnType<typeof promptBatchOutputSchema.parse>; returnedModelId?: string }>;
  try {
    responses = await Promise.all(batches.map((batch) => client ? client.generateStructured({ model: configured.model, timeoutMs: promptPreparationTimeoutMs, input: buildPromptRequest(batch, input.aspectRatio, input.character, input.assetConcepts), schema: promptBatchOutputSchema }) : configured.provider.generateStructured({ model: configured.model, timeoutMs: promptPreparationTimeoutMs, input: buildPromptRequest(batch, input.aspectRatio, input.character, input.assetConcepts), schema: promptBatchOutputSchema })));
  } catch (error) {
    if (error instanceof TextProviderError && error.code === "invalid_json") throw new PromptPreparationError("invalid_json", "Prompt Preparation returned invalid JSON.");
    if (error instanceof TextProviderError && error.code === "schema_validation_failed") throw new PromptPreparationError("invalid_output", "Prompt Preparation returned an invalid structured output.");
    throw new PromptPreparationError("provider_failed", "Prompt Preparation text provider request failed.");
  }
  const prompts = responses.flatMap((response) => response.data.prompts);
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
    scenePrompts: compileScenePromptPackages(input.shots, finalPrompts, input.aspectRatio, input.character, input.assetConcepts ?? [])
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
  const composition = character ? resolveCharacterCompositionLock(character) : undefined;
  const characterText = character ? `Use the locked teacher identity ${character.name}: ${character.persona.appearance}; preserve ${character.invariantTraits.join(", ")}.` : "Use the approved visual continuity bible.";
  const compositionText = composition ? `Composition lock: ${composition.aspectRatio} canvas; ${composition.subjectAnchor}; subject box x=${composition.subjectBox.x}, y=${composition.subjectBox.y}, width=${composition.subjectBox.width}, height=${composition.subjectBox.height}; ${composition.cameraDistance}; ${composition.headroom}; keep the safe zone x=${composition.safeZone.x}, y=${composition.safeZone.y}, width=${composition.safeZone.width}, height=${composition.safeZone.height} clear for diagrams and subtitles.` : "Keep the approved composition and safe zones unchanged.";
  const continuity = shot.continuityRefs.length ? `Continuity references: ${shot.continuityRefs.join(", ")}.` : "Keep continuity with the previous storyboard frame.";
  return {
    shotId: shot.id,
    promptVersionId: `prompt-${shot.id}-manual-v1`,
    positivePrompt: `${compositionText} ${characterText} Create the approved storyboard frame for ${shot.purpose ?? shot.id}. ${shot.semanticBeat ?? "Follow the semantic beat exactly."} Subject action: ${shot.subjectAction}. Framing: ${shot.framing}; camera: ${shot.cameraAngle}; movement intent: ${shot.cameraMovement}. ${conceptText ? `Approved asset concept: ${conceptText}.` : "Use only the approved scene asset direction."} ${continuity} Output one clean ${aspectRatio} image with no text, logo, contact sheet, or watermark unless explicitly required by the storyboard.`,
    negativePrompt: "No identity drift, wardrobe drift, extra limbs, inconsistent framing, invented props, contact sheet, logo, watermark, or unrelated text.",
    aspectRatio,
    continuityConstraints: [continuity, "Preserve approved character and environment continuity."],
    prohibitedElements: ["identity drift", "unapproved text or logo", "contact sheet"],
    ...(shot.semanticBeat ? { semanticBeat: shot.semanticBeat } : {}),
    ...(shot.assetConceptIds?.length ? { assetConceptIds: shot.assetConceptIds } : {}),
    ...(shot.motion ? { motion: shot.motion } : {})
  };
}

function compileScenePromptPackages(shots: PromptShot[], prompts: ReturnType<typeof promptPreparationOutputSchema.parse>["prompts"], aspectRatio: "16:9" | "9:16", character: CharacterVersion | undefined, assetConcepts: AssetConcept[]) {
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
      const assetStrategy = role === "REUSE" ? "REUSE_EXISTING" : role === "BASE" ? "NEW_BASE" : role === "EXPRESSION_CHANGE" ? "EXPRESSION_VARIATION" : role === "POSE_CHANGE" ? "POSE_VARIATION" : role === "INSERT" ? "INSERT_DETAIL" : /environment|background/i.test(`${shot.purpose} ${shot.subjectAction}`) ? "BACKGROUND_VARIATION" : /diagram|graphic|text card/i.test(`${shot.visualMode} ${shot.purpose}`) ? "GRAPHIC_ASSET" : "REFERENCE_VARIATION";
      const concepts = assetConcepts.filter((concept) => concept.shotId === shot.id);
      const referenceInstructions = shot.continuityRefs.length ? shot.continuityRefs.map((ref) => `Use ${ref} as the continuity reference; keep identity, wardrobe, palette, lighting direction, and camera side unchanged.`) : ["Attach the approved character master reference when the teacher appears."];
      const prohibitedChanges = character ? [...character.prohibitedChanges, "Do not move the teacher out of the locked subject box.", "Do not place diagrams, money, charts, or subtitles inside the teacher subject box."] : ["Do not invent new characters, props, text, or logos."];
      const delta = role === "REUSE" ? "Reuse the approved source frame without generating a new image; only apply the approved crop or motion in the timeline." : `${prompt?.positivePrompt ?? shot.subjectAction}${concepts.length ? ` Approved asset mapping: ${concepts.map((concept) => `${concept.role} - ${concept.description}`).join("; ")}.` : ""}`;
      const acceptanceChecklist = ["One separate image file, not a contact sheet", `Readable ${aspectRatio} composition`, "Approved character identity and framing remain stable", "No unapproved text, logo, or watermark"];
      return { shotId: shot.id, displayNumber, assetId: `asset-${shot.id}`, role, assetStrategy, purpose: shot.purpose ?? shot.id, durationFrames: shot.durationFrames ?? 1, delta, continuityRefs: shot.continuityRefs, referenceInstructions, prohibitedChanges, expectedFilename: `${displayNumber}.png`, acceptanceChecklist };
    });
    const locks = [
      "Create each frame as a separate image file, never a contact sheet.",
      "Do not skip frames or stop for confirmation between frames.",
      "Continue until the scene is complete and save every generated frame using its exact three-digit filename.",
      character ? `Keep the approved character bible unchanged: ${character.invariantTraits.join("; ")}.` : "Keep the approved visual bible unchanged."
    ];
    const generatedFrameNumbers = frameManifest.filter((frame) => frame.assetStrategy !== "REUSE_EXISTING" && frame.assetStrategy !== "NO_NEW_ASSET").map((frame) => frame.displayNumber);
    const composition = character ? resolveCharacterCompositionLock(character) : undefined;
    const compositionLock = composition ? ` Keep the teacher in the locked ${composition.subjectAnchor} position within normalized box x=${composition.subjectBox.x}, y=${composition.subjectBox.y}, width=${composition.subjectBox.width}, height=${composition.subjectBox.height}; preserve ${composition.headroom} and leave the safe zone x=${composition.safeZone.x}, y=${composition.safeZone.y}, width=${composition.safeZone.width}, height=${composition.safeZone.height} for explanatory assets and subtitles.` : " Keep the approved composition and subtitle safe zone unchanged.";
    const frameInstructions = frameManifest.map((frame) => frame.assetStrategy === "REUSE_EXISTING" ? `Frame ${frame.displayNumber} (${frame.role}, REUSE_EXISTING): ${frame.delta}` : `Frame ${frame.displayNumber} (${frame.role}, save as ${frame.expectedFilename}): ${frame.delta} Attach references in this order: ${frame.referenceInstructions.join(" ")}`);
    const promptText = `Create scene ${sceneId} for a ${aspectRatio} YouTube explainer as exactly ${generatedFrameNumbers.length} new separate image files. ${locks.join(" ")}${compositionLock} Use the first generated frame as the base reference and use each preceding approved frame for continuity. Do not create a contact sheet, do not combine frames, and do not add text, logos, or watermarks unless the storyboard explicitly requires them. ${frameInstructions.join(" ")} For REUSE_EXISTING frames, do not generate a file; reuse the named approved frame in the edit. Continue without asking for confirmation between frames.`;
    return { sceneId, promptVersionId: `scene-prompt-${sceneId}-v1`, targetTool: "GG Lab", compilationMode: "scene_prompt", promptText, frameNumbers: frameManifest.map((frame) => frame.displayNumber), generatedFrameNumbers, referenceInstructions: ["Attach the approved character master reference when the teacher appears.", "Use the previous generated frame in this scene as the internal reference for continuity."], continuityLocks: locks, prohibitedChanges: [...new Set(frameManifest.flatMap((frame) => frame.prohibitedChanges))], expectedAspectRatio: aspectRatio, frameManifest };
  });
}
