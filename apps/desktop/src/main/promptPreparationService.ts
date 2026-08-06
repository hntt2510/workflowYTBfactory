import { createHash } from "node:crypto";
import type { ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { promptPreparationOutputSchema, resolveChannelPromptContext, resolveCharacterCompositionLock, type AssetConcept, type ChannelDna, type CharacterVersion, type ResolvedChannelPromptContext, type ShotMotionPlan } from "@lsf/domain";
import { NineRouterClient, NineRouterTextResponseError } from "@lsf/providers";
import { loadNineRouterTextCertification } from "./nineRouterTextCertificationService";

export class PromptPreparationError extends Error { constructor(readonly category: "capability_not_verified" | "credential_missing" | "provider_failed" | "invalid_json" | "invalid_output", message: string) { super(message); } }
export const promptPreparationTimeoutMs = 120_000;
export const promptPreparationBatchSize = 4;
interface TextClient { createResponseText(input: { model: string; input: string; timeoutMs?: number }): Promise<{ text: string; returnedModelId?: string }>; }

type PromptShot = { id: string; sceneId?: string; purpose?: string; durationFrames?: number; visualMode: string; framing: string; cameraAngle: string; cameraMovement: string; subjectAction: string; continuityRefs: string[]; semanticBeat?: string | undefined; assetConceptIds?: string[] | undefined; motion?: ShotMotionPlan | undefined };
export type PromptContextMetadata = {
  channelId: string;
  channelProfileVersion: number;
  projectSnapshotVersion: number;
  resolvedContextHash: string;
  summary?: {
    contentLane: string;
    visualStyle: string;
    characters: string[];
    assets: string[];
    projectOverrides: string[];
    sceneOverrides: string[];
  } | undefined;
};

export async function runPromptPreparation(input: { shots: PromptShot[]; aspectRatio: "16:9" | "9:16"; character?: CharacterVersion | undefined; channelDna?: ChannelDna; assetConcepts?: AssetConcept[] | undefined; promptContext?: ResolvedChannelPromptContext; promptContextMetadata?: PromptContextMetadata; manualMode?: boolean; frameNumbersByShot?: ReadonlyMap<string, string>; credentialStore: ProviderCredentialStore; certificationStore: TextCertificationStore; createClient?: (config: { baseUrl: string; apiKey: string }) => TextClient }) {
  const channelDna = input.channelDna ?? (input.character as (CharacterVersion & { channelDna?: ChannelDna }) | undefined)?.channelDna;
  const embeddedProfile = (input.character as (CharacterVersion & { channelPromptProfile?: Parameters<typeof resolveChannelPromptContext>[0]["profile"] }) | undefined)?.channelPromptProfile;
  const promptContext = input.promptContext ?? (embeddedProfile ? resolveChannelPromptContext({ channelId: embeddedProfile.channelId, profile: embeddedProfile, taskType: "scene_image_generation", projectSnapshotVersion: embeddedProfile.version }) : undefined);
  const fallbackSummary = promptContext ? {
    contentLane: promptContext.contentLane,
    visualStyle: promptContext.visualStyle,
    characters: promptContext.characters.map((item) => item.name),
    assets: promptContext.assets.map((item) => item.name),
    projectOverrides: [],
    sceneOverrides: []
  } : undefined;
  const promptContextMetadata = input.promptContextMetadata && promptContext
    ? { ...input.promptContextMetadata, ...(input.promptContextMetadata.summary ? {} : { summary: fallbackSummary }) }
    : promptContext ? {
      channelId: promptContext.channelId,
      channelProfileVersion: promptContext.profileVersion,
      projectSnapshotVersion: promptContext.projectSnapshotVersion,
      resolvedContextHash: createHash("sha256").update(JSON.stringify(promptContext)).digest("hex"),
      summary: fallbackSummary
    } : undefined;
  const imageShots = input.shots.filter((shot) => ["ai_image", "ai_video", "stock_image", "stock_video", "manual_upload", "uploaded"].includes(shot.visualMode));
  if (input.manualMode) {
    const prompts = imageShots.map((shot) => {
      const shotCharacter = shotUsesCharacter(shot, input.character) ? input.character : undefined;
      return localPromptForShot(shot, input.aspectRatio, shotCharacter, input.assetConcepts ?? [], channelDna, promptContextForShot(shot, shotCharacter, input.assetConcepts ?? [], promptContext), promptContextMetadata);
    });
    const output = promptPreparationOutputSchema.parse({
      prompts,
      scenePrompts: compileScenePromptPackages(input.shots, prompts, input.aspectRatio, input.character, input.assetConcepts ?? [], input.frameNumbersByShot, promptContext, promptContextMetadata)
    });
    return { output };
  }
  if (imageShots.length === 0) return { output: promptPreparationOutputSchema.parse({ prompts: [], scenePrompts: [] }) };
  const aiShots = imageShots.filter((shot) => shot.visualMode === "ai_image" || shot.visualMode === "ai_video");
  const certification = await loadNineRouterTextCertification({ credentialStore: input.credentialStore, certificationStore: input.certificationStore });
  if (certification.status !== "verified") throw new PromptPreparationError("capability_not_verified", "A verified text-model certification is required before Prompt Preparation can run.");
  const settings = input.credentialStore.loadProviderCredentialSettings("9router"); const apiKey = await input.credentialStore.resolveProviderSecret("9router");
  if (!settings?.textModel || !apiKey) throw new PromptPreparationError("credential_missing", "The selected text model or credential is unavailable.");
  const client = input.createClient?.({ baseUrl: settings.baseUrl, apiKey }) ?? new NineRouterClient({ baseUrl: settings.baseUrl, apiKey, timeoutMs: promptPreparationTimeoutMs });
  const batches = Array.from({ length: Math.ceil(aiShots.length / promptPreparationBatchSize) }, (_, index) => aiShots.slice(index * promptPreparationBatchSize, (index + 1) * promptPreparationBatchSize));
  let responses: Array<{ text: string; returnedModelId?: string }>;
  try {
    responses = await Promise.all(batches.map((batch) => client.createResponseText({ model: settings.textModel!, timeoutMs: promptPreparationTimeoutMs, input: buildPromptRequest(batch, input.aspectRatio, input.character, input.assetConcepts, channelDna, promptContext) })));
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
      const shotCharacter = shot && shotUsesCharacter(shot, input.character) ? input.character : undefined;
      const contract = promptContractSuffix(shotCharacter, conceptsByShot.get(prompt.shotId) ?? [], channelDna, promptContextForShot(shot, shotCharacter, conceptsByShot.get(prompt.shotId) ?? [], promptContext));
      return {
        ...prompt,
        positivePrompt: appendPromptContract(prompt.positivePrompt, contract),
        ...(shot?.semanticBeat ? { semanticBeat: shot.semanticBeat } : {}),
        ...(shot?.assetConceptIds?.length ? { assetConceptIds: shot.assetConceptIds } : {}),
        ...(shot?.motion ? { motion: shot.motion } : {}),
        ...(promptContextMetadata ? { promptContext: promptContextMetadata } : {})
      };
    });
  const output = promptPreparationOutputSchema.parse({
    prompts: finalPrompts,
    scenePrompts: compileScenePromptPackages(input.shots, finalPrompts, input.aspectRatio, input.character, input.assetConcepts ?? [], input.frameNumbersByShot, promptContext, promptContextMetadata)
  });
  const returnedModelId = responses.find((response) => response.returnedModelId)?.returnedModelId;
  return { output, ...(returnedModelId ? { returnedModelId } : {}) };
}

function promptContractSuffix(character: CharacterVersion | undefined, concepts: AssetConcept[], channelDna?: ChannelDna, promptContext?: ResolvedChannelPromptContext): string {
  const parts: string[] = [];
  if (character) {
    const composition = resolveCharacterCompositionLock(character);
    parts.push(`Character composition lock: ${composition.aspectRatio} canvas; subject ${composition.subjectAnchor}; normalized subject box x=${composition.subjectBox.x}, y=${composition.subjectBox.y}, width=${composition.subjectBox.width}, height=${composition.subjectBox.height}; ${composition.cameraDistance}; ${composition.headroom}; preserve safe zone x=${composition.safeZone.x}, y=${composition.safeZone.y}, width=${composition.safeZone.width}, height=${composition.safeZone.height} for diagrams and subtitles.`);
  }
  if (concepts.length) {
    parts.push(`Approved asset mapping: ${concepts.map((concept) => `${concept.id} ${concept.kind} ${concept.role}: ${concept.description}`).join(" | ")}`);
  }
  if (channelDna) parts.push(`Channel DNA: style ${channelDna.visualStyle.name}; scene grammar ${channelDna.visualStyle.sceneGrammar.join(" -> ")}; motion grammar ${channelDna.visualStyle.motionGrammar.join(", ")}; palette ${channelDna.visualStyle.palette.join(", ")}; content pillars ${channelDna.contentDirection.pillars.join(" | ")}.`);
  if (promptContext) parts.push(`Resolved channel context ${promptContext.channelId} v${promptContext.projectSnapshotVersion}: style ${promptContext.visualStyle} (${promptContext.visualIdentity.styleDescription}); palette ${promptContext.visualIdentity.palette.join(", ")}; lane ${promptContext.contentLane}; characters ${promptContext.characters.map((item) => `${item.name} refs=${item.referenceIds.join(", ") || "master"} controls=${item.referenceAuthority.controls.join(", ")} does-not-control=${item.referenceAuthority.doesNotControl.join(", ")}`).join(" | ") || "none"}; assets ${promptContext.assets.map((item) => `${item.name}: ${item.promptDescription}`).join(" | ") || "none"}; locks ${promptContext.continuityLocks.join(" | ")}; forbidden ${promptContext.forbiddenChanges.join(" | ")}.`);
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
  assetConcepts: AssetConcept[] | undefined,
  channelDna?: ChannelDna,
  promptContext?: ResolvedChannelPromptContext
): string {
  const shotIds = new Set(shots.map((shot) => shot.id));
  const concepts = (assetConcepts ?? []).filter((concept) => shotIds.has(concept.shotId));
  const composition = character ? resolveCharacterCompositionLock(character) : undefined;
  return `Prepare final image prompts only for approved AI-routed shots. Return strict JSON {"prompts":[...]}. Each prompt must use exactly {"shotId":string,"promptVersionId":string,"positivePrompt":string,"negativePrompt":string,"aspectRatio":"16:9"|"9:16","continuityConstraints":string[],"prohibitedElements":string[]}. Put only the resolved channel context, character identity, subject, approved asset concept, action, semantic beat, framing, camera, lighting, mood, composition lock, and aspect ratio in positivePrompt; keep negativePrompt separate. Do not create assets or imitate copyrighted characters. Character lock: ${JSON.stringify(character ? { name: character.name, persona: character.persona, invariantTraits: character.invariantTraits, prohibitedChanges: character.prohibitedChanges, composition } : undefined)}. Channel DNA: ${JSON.stringify(channelDna)}. Resolved Prompt Context: ${JSON.stringify(promptContext)}. Asset concepts: ${JSON.stringify(concepts)}. Required aspect ratio: ${aspectRatio}. Shots: ${JSON.stringify(shots)}\n`;
}

function shotUsesCharacter(shot: PromptShot, character: CharacterVersion | undefined): boolean {
  if (!character) return false;
  const text = `${character.name} ${character.persona.role} ${shot.purpose ?? ""} ${shot.subjectAction} ${shot.semanticBeat ?? ""}`.toLowerCase();
  return [character.name, "teacher", "present", "explain", "gesture", "point", "talk", "host"].some((term) => term && text.includes(term.toLowerCase()));
}

function promptContextForShot(shot: PromptShot | undefined, character: CharacterVersion | undefined, concepts: AssetConcept[], context: ResolvedChannelPromptContext | undefined): ResolvedChannelPromptContext | undefined {
  if (!context || !shot) return context;
  const text = `${shot.purpose ?? ""} ${shot.subjectAction} ${shot.semanticBeat ?? ""}`.toLowerCase();
  const assets = character
    ? context.assets
    : context.assets.filter((asset) => [asset.name, ...asset.tags].some((term) => term && text.includes(term.toLowerCase())) || concepts.some((concept) => concept.referenceAssetId === asset.assetId));
  const characters = character ? context.characters : [];
  return {
    ...context,
    characters,
    assets,
    continuityLocks: [...new Set([...characters.flatMap((item) => item.continuityLocks), ...assets.flatMap((item) => item.continuityLocks)])],
    forbiddenChanges: [...new Set([...context.visualIdentity.forbiddenVisualChanges, ...characters.flatMap((item) => item.forbiddenChanges)])]
  };
}

function localPromptForShot(shot: PromptShot, aspectRatio: "16:9" | "9:16", character: CharacterVersion | undefined, assetConcepts: AssetConcept[], channelDna?: ChannelDna, promptContext?: ResolvedChannelPromptContext, promptContextMetadata?: PromptContextMetadata) {
  const conceptText = assetConcepts.filter((concept) => concept.shotId === shot.id).map((concept) => `${concept.role}: ${concept.description}`).join("; ");
  const composition = character ? resolveCharacterCompositionLock(character) : undefined;
  const characterText = character ? `Use the locked teacher identity ${character.name}: ${character.persona.appearance}; preserve ${character.invariantTraits.join(", ")}.` : "Use the approved visual continuity bible.";
  const styleText = channelDna ? `Channel DNA style: ${channelDna.visualStyle.name}. Scene grammar: ${channelDna.visualStyle.sceneGrammar.join(", ")}. Motion grammar: ${channelDna.visualStyle.motionGrammar.join(", ")}. Palette: ${channelDna.visualStyle.palette.join(", ")}.` : "Use the approved channel visual grammar.";
  const contextText = promptContext ? `Resolved channel context ${promptContext.channelId} v${promptContext.projectSnapshotVersion}: lane ${promptContext.contentLane}; style ${promptContext.visualStyle} (${promptContext.visualIdentity.styleDescription}); palette ${promptContext.visualIdentity.palette.join(", ")}; line treatment ${promptContext.visualIdentity.lineTreatment}; character treatment ${promptContext.visualIdentity.characterTreatment}; background treatment ${promptContext.visualIdentity.backgroundTreatment}; lighting ${promptContext.visualIdentity.lightingRules.join(" | ")}; composition ${promptContext.visualIdentity.compositionRules.join(" | ")}; approved characters ${promptContext.characters.map((item) => `${item.name} refs=${item.referenceIds.join(", ") || "master"} controls=${item.referenceAuthority.controls.join(", ")} does-not-control=${item.referenceAuthority.doesNotControl.join(", ")}`).join(" | ") || "none"}; approved assets ${promptContext.assets.map((item) => `${item.name}: ${item.promptDescription}`).join(" | ") || "none"}; locks ${promptContext.continuityLocks.join(" | ")}; forbidden ${promptContext.forbiddenChanges.join(" | ")}.` : "Use only the selected channel context; never borrow another channel's identity.";
  const compositionText = composition ? `Composition lock: ${composition.aspectRatio} canvas; ${composition.subjectAnchor}; subject box x=${composition.subjectBox.x}, y=${composition.subjectBox.y}, width=${composition.subjectBox.width}, height=${composition.subjectBox.height}; ${composition.cameraDistance}; ${composition.headroom}; keep the safe zone x=${composition.safeZone.x}, y=${composition.safeZone.y}, width=${composition.safeZone.width}, height=${composition.safeZone.height} clear for diagrams and subtitles.` : "Keep the approved composition and safe zones unchanged.";
  const continuity = shot.continuityRefs.length ? `Continuity references: ${shot.continuityRefs.join(", ")}.` : "Keep continuity with the previous storyboard frame.";
  return {
    shotId: shot.id,
    promptVersionId: `prompt-${shot.id}-manual-v1`,
    positivePrompt: `${compositionText} ${styleText} ${contextText} ${characterText} Create the approved storyboard frame for ${shot.purpose ?? shot.id}. ${shot.semanticBeat ?? "Follow the semantic beat exactly."} Subject action: ${shot.subjectAction}. Framing: ${shot.framing}; camera: ${shot.cameraAngle}; movement intent: ${shot.cameraMovement}. ${conceptText ? `Approved asset concept: ${conceptText}.` : "Use only the approved scene asset direction."} ${continuity} Output one clean ${aspectRatio} image with no text, logo, contact sheet, or watermark unless explicitly required by the storyboard.`,
    negativePrompt: "No identity drift, wardrobe drift, extra limbs, inconsistent framing, invented props, contact sheet, logo, watermark, or unrelated text.",
    aspectRatio,
    continuityConstraints: [continuity, "Preserve approved character and environment continuity."],
    prohibitedElements: ["identity drift", "unapproved text or logo", "contact sheet"],
    ...(shot.semanticBeat ? { semanticBeat: shot.semanticBeat } : {}),
    ...(shot.assetConceptIds?.length ? { assetConceptIds: shot.assetConceptIds } : {}),
    ...(shot.motion ? { motion: shot.motion } : {}),
    ...(promptContextMetadata ? { promptContext: promptContextMetadata } : {})
  };
}

function compileScenePromptPackages(shots: PromptShot[], prompts: ReturnType<typeof promptPreparationOutputSchema.parse>["prompts"], aspectRatio: "16:9" | "9:16", character: CharacterVersion | undefined, assetConcepts: AssetConcept[], frameNumbersByShot?: ReadonlyMap<string, string>, promptContext?: ResolvedChannelPromptContext, promptContextMetadata?: PromptContextMetadata) {
  const promptByShot = new Map(prompts.map((prompt) => [prompt.shotId, prompt]));
  const groups = new Map<string, PromptShot[]>();
  for (const shot of shots) {
    const sceneId = shot.sceneId ?? shot.id;
    groups.set(sceneId, [...(groups.get(sceneId) ?? []), shot]);
  }
  const existingNumbers = new Set(frameNumbersByShot ? [...frameNumbersByShot.values()] : []);
  let globalNumber = Math.max(0, ...[...existingNumbers].map((value) => Number(value)).filter(Number.isFinite)) + 1;
  return [...groups.entries()].map(([sceneId, sceneShots]) => {
    const sceneCharacter = sceneShots.some((shot) => shotUsesCharacter(shot, character)) ? character : undefined;
    const frameManifest = sceneShots.map((shot, index) => {
      const prompt = promptByShot.get(shot.id);
      const shotCharacter = shotUsesCharacter(shot, character) ? character : undefined;
      const displayNumber = frameNumbersByShot?.get(shot.id) ?? String(globalNumber++).padStart(3, "0");
      const role = /reuse/i.test(shot.visualMode) ? "REUSE" : index === 0 ? "BASE" : /expression|face/i.test(`${shot.purpose} ${shot.subjectAction}`) ? "EXPRESSION_CHANGE" : /pose|gesture|move|point/i.test(`${shot.purpose} ${shot.subjectAction}`) ? "POSE_CHANGE" : /chart|money|diagram|insert|cutaway/i.test(`${shot.purpose} ${shot.subjectAction}`) ? "INSERT" : "ACTION_KEYFRAME";
      const assetStrategy = role === "REUSE" ? "REUSE_EXISTING" : role === "BASE" ? "NEW_BASE" : role === "EXPRESSION_CHANGE" ? "EXPRESSION_VARIATION" : role === "POSE_CHANGE" ? "POSE_VARIATION" : role === "INSERT" ? "INSERT_DETAIL" : /environment|background/i.test(`${shot.purpose} ${shot.subjectAction}`) ? "BACKGROUND_VARIATION" : /diagram|graphic|text card/i.test(`${shot.visualMode} ${shot.purpose}`) ? "GRAPHIC_ASSET" : "REFERENCE_VARIATION";
      const concepts = assetConcepts.filter((concept) => concept.shotId === shot.id);
      const referenceInstructions = shot.continuityRefs.length ? shot.continuityRefs.map((ref) => `Use ${ref} as the continuity reference; keep identity, wardrobe, palette, lighting direction, and camera side unchanged.`) : shotCharacter ? [`Attach approved references for ${shotCharacter.name}: ${promptContext?.characters.find((item) => item.name === shotCharacter.name)?.referenceIds.join(", ") || "the channel character master"}.`] : ["Do not introduce a character that is not required by this shot."];
      const prohibitedChanges = shotCharacter ? [...shotCharacter.prohibitedChanges, "Do not move the teacher out of the locked subject box.", "Do not place diagrams, money, charts, or subtitles inside the teacher subject box."] : ["Do not invent new characters, props, text, or logos."];
      const delta = role === "REUSE" ? "Reuse the approved source frame without generating a new image; only apply the approved crop or motion in the timeline." : `${prompt?.positivePrompt ?? shot.subjectAction}${concepts.length ? ` Approved asset mapping: ${concepts.map((concept) => `${concept.role} - ${concept.description}`).join("; ")}.` : ""}`;
      const acceptanceChecklist = ["One separate image file, not a contact sheet", `Readable ${aspectRatio} composition`, "Approved character identity and framing remain stable", "No unapproved text, logo, or watermark"];
      return { shotId: shot.id, displayNumber, assetId: `asset-${shot.id}`, role, assetStrategy, purpose: shot.purpose ?? shot.id, durationFrames: shot.durationFrames ?? 1, delta, continuityRefs: shot.continuityRefs, referenceInstructions, prohibitedChanges, expectedFilename: `${displayNumber}.png`, acceptanceChecklist };
    });
    const locks = [
      "Create each frame as a separate image file, never a contact sheet.",
      "Do not skip frames or stop for confirmation between frames.",
      "Continue until the scene is complete and save every generated frame using its exact three-digit filename.",
      sceneCharacter ? `Keep the approved character bible unchanged: ${sceneCharacter.invariantTraits.join("; ")}.` : "Keep the approved visual bible unchanged."
    ];
    const generatedFrameNumbers = frameManifest.filter((frame) => frame.assetStrategy !== "REUSE_EXISTING" && frame.assetStrategy !== "NO_NEW_ASSET").map((frame) => frame.displayNumber);
    const composition = sceneCharacter ? resolveCharacterCompositionLock(sceneCharacter) : undefined;
    const compositionLock = composition ? ` Keep the teacher in the locked ${composition.subjectAnchor} position within normalized box x=${composition.subjectBox.x}, y=${composition.subjectBox.y}, width=${composition.subjectBox.width}, height=${composition.subjectBox.height}; preserve ${composition.headroom} and leave the safe zone x=${composition.safeZone.x}, y=${composition.safeZone.y}, width=${composition.safeZone.width}, height=${composition.safeZone.height} for explanatory assets and subtitles.` : " Keep the approved composition and subtitle safe zone unchanged.";
    const frameInstructions = frameManifest.map((frame) => frame.assetStrategy === "REUSE_EXISTING" ? `Frame ${frame.displayNumber} (${frame.role}, REUSE_EXISTING): ${frame.delta}` : `Frame ${frame.displayNumber} (${frame.role}, save as ${frame.expectedFilename}): ${frame.delta} Attach references in this order: ${frame.referenceInstructions.join(" ")}`);
    const contextText = promptContext ? `Use only channelId=${promptContext.channelId}, channel style=${promptContext.visualStyle} (${promptContext.visualIdentity.styleDescription}), palette=${promptContext.visualIdentity.palette.join(", ")}, line treatment=${promptContext.visualIdentity.lineTreatment}, character treatment=${promptContext.visualIdentity.characterTreatment}, background treatment=${promptContext.visualIdentity.backgroundTreatment}, content lane=${promptContext.contentLane}, story pattern=${promptContext.storyPattern.join(" -> ")}, approved characters=${promptContext.characters.map((item) => `${item.name} refs=${item.referenceIds.join(", ") || "master"} controls=${item.referenceAuthority.controls.join(", ")} does-not-control=${item.referenceAuthority.doesNotControl.join(", ")}`).join(" | ") || "none"}, approved assets=${promptContext.assets.map((item) => item.name).join(", ") || "none"}. Continuity locks: ${promptContext.continuityLocks.join(" | ")}. Forbidden changes: ${promptContext.forbiddenChanges.join(" | ")}.` : "Use only the approved project context and never borrow another channel's style, character, or asset.";
    const promptText = `Create scene ${sceneId} for a ${aspectRatio} YouTube scene as exactly ${generatedFrameNumbers.length} new separate image files. ${contextText} ${locks.join(" ")}${compositionLock} Use the first generated frame as the base reference and use each preceding approved frame for continuity. Do not create a contact sheet, do not combine frames, and do not add text, logos, or watermarks unless the storyboard explicitly requires them. ${frameInstructions.join(" ")} For REUSE_EXISTING frames, do not generate a file; reuse the named approved frame in the edit. Continue without asking for confirmation between frames.`;
    return { sceneId, promptVersionId: `scene-prompt-${sceneId}-v1`, targetTool: "GG Lab", compilationMode: "scene_prompt", promptText, frameNumbers: frameManifest.map((frame) => frame.displayNumber), generatedFrameNumbers, referenceInstructions: [...promptContext?.characters.map((item) => `Attach approved references for ${item.name}: ${item.referenceIds.join(", ") || "the channel character master"}; these references control ${item.referenceAuthority.controls.join(", ")} but not ${item.referenceAuthority.doesNotControl.join(", ")}.`) ?? [], "Use the previous generated frame in this scene as the internal reference for continuity."], continuityLocks: [...new Set([...locks, ...(promptContext?.continuityLocks ?? [])])], prohibitedChanges: [...new Set([...frameManifest.flatMap((frame) => frame.prohibitedChanges), ...(promptContext?.forbiddenChanges ?? [])])], expectedAspectRatio: aspectRatio, frameManifest, ...(promptContextMetadata ? { promptContext: promptContextMetadata } : {}) };
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
