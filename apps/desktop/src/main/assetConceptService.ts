import type { ChannelDna, CharacterVersion, ResolvedChannelPromptContext } from "@lsf/domain";
import { assetConceptsOutputSchema, validateAssetConcepts } from "@lsf/domain";
import type { ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { NineRouterClient, NineRouterTextResponseError } from "@lsf/providers";

export class AssetConceptError extends Error {
  constructor(readonly category: "capability_not_verified" | "credential_missing" | "provider_failed" | "invalid_json" | "invalid_output", message: string) {
    super(message);
  }
}

interface TextClient {
  createResponseText(input: { model: string; input: string; timeoutMs?: number }): Promise<{ text: string; returnedModelId?: string }>;
}

export const assetConceptTimeoutMs = 120_000;
export const assetConceptBatchSize = 4;

type AssetConceptShot = {
  id: string;
  purpose: string;
  visualMode: string;
  semanticBeat?: string;
  subjectAction: string;
  startState: Record<string, unknown>;
  endState: Record<string, unknown>;
};

function buildAssetConceptRequest(shots: AssetConceptShot[], character: CharacterVersion, channelDna?: ChannelDna, promptContext?: ResolvedChannelPromptContext): string {
  return `Create a concise visual asset concept for every shot. Use only the resolved channel asset grammar, palette, character identity, and motion grammar. Return strict JSON {"concepts":[...]}. Each concept must use exactly {"id":string,"shotId":string,"semanticBeat":string,"kind":"object"|"diagram"|"background"|"teacher_gesture"|"text_card","role":string,"description":string,"visualConstraints":string[],"colorPalette":string[],"motionIntent":string,"needsReferenceImage":boolean,"referenceAssetId"?:string}. Set referenceAssetId only when the concept uses one of the approved channel assets listed below; otherwise omit it. Use the same character identity across teaching gestures. Do not create final image prompts or invent assets outside this channel. Character lock: ${JSON.stringify({ name: character.name, persona: character.persona, invariantTraits: character.invariantTraits, prohibitedChanges: character.prohibitedChanges })}. Channel DNA: ${JSON.stringify(channelDna)}. Approved channel assets: ${JSON.stringify(promptContext?.assets ?? [])}. Resolved Prompt Context: ${JSON.stringify(promptContext)}. Shots: ${JSON.stringify(shots)}`;
}

function parseAssetConceptBatch(text: string, shotIds: ReadonlySet<string>, allowedAssetIds: ReadonlySet<string>): ReturnType<typeof assetConceptsOutputSchema.parse>["concepts"] {
  let parsed: unknown;
  try { parsed = JSON.parse(text.trim()); } catch { throw new AssetConceptError("invalid_json", "Asset Concepts returned invalid JSON."); }
  const result = assetConceptsOutputSchema.safeParse(parsed);
  if (!result.success) throw new AssetConceptError("invalid_output", "Asset Concepts returned an invalid structured output.");
  try { validateAssetConcepts(result.data.concepts, shotIds); } catch (error) { throw new AssetConceptError("invalid_output", error instanceof Error ? error.message : "Asset Concepts referenced an invalid shot."); }
  if (result.data.concepts.some((concept) => concept.referenceAssetId && !allowedAssetIds.has(concept.referenceAssetId))) throw new AssetConceptError("invalid_output", "Asset Concepts referenced an asset outside the active channel profile.");
  if (result.data.concepts.length !== shotIds.size) throw new AssetConceptError("invalid_output", "Asset Concepts must return exactly one concept per shot.");
  return result.data.concepts;
}

export async function runAssetConcepts(input: {
  shots: AssetConceptShot[];
  character: CharacterVersion;
  channelDna?: ChannelDna;
  promptContext?: ResolvedChannelPromptContext;
  credentialStore: ProviderCredentialStore;
  certificationStore: TextCertificationStore;
  manualMode?: boolean;
  createClient?: (config: { baseUrl: string; apiKey: string }) => TextClient;
}): Promise<{ output: ReturnType<typeof assetConceptsOutputSchema.parse>; returnedModelId?: string }> {
  if (input.manualMode) {
    return { output: assetConceptsOutputSchema.parse({ concepts: input.shots.map((shot) => deterministicAssetConcept(shot, input.channelDna, input.promptContext)) }) };
  }
  const certification = await import("./nineRouterTextCertificationService").then(({ loadNineRouterTextCertification }) => loadNineRouterTextCertification({ credentialStore: input.credentialStore, certificationStore: input.certificationStore }));
  if (certification.status !== "verified") throw new AssetConceptError("capability_not_verified", "A verified text-model certification is required before Asset Concepts can run.");
  const settings = input.credentialStore.loadProviderCredentialSettings("9router");
  const apiKey = await input.credentialStore.resolveProviderSecret("9router");
  if (!settings?.textModel || !apiKey) throw new AssetConceptError("credential_missing", "The selected text model or credential is unavailable.");
  const client = input.createClient?.({ baseUrl: settings.baseUrl, apiKey }) ?? new NineRouterClient({ baseUrl: settings.baseUrl, apiKey, timeoutMs: assetConceptTimeoutMs });
  const batches = Array.from({ length: Math.ceil(input.shots.length / assetConceptBatchSize) }, (_, index) => input.shots.slice(index * assetConceptBatchSize, (index + 1) * assetConceptBatchSize));
  let responses: Array<{ text: string; returnedModelId?: string }>;
  try {
    responses = await Promise.all(batches.map((batch) => client.createResponseText({ model: settings.textModel!, timeoutMs: assetConceptTimeoutMs, input: buildAssetConceptRequest(batch, input.character, input.channelDna, input.promptContext) })));
  } catch (error) {
    throw new AssetConceptError("provider_failed", error instanceof NineRouterTextResponseError ? `Asset Concepts provider request failed: ${error.status}.` : "Asset Concepts provider request failed.");
  }
  const allowedAssetIds = new Set(input.promptContext?.assets.map((asset) => asset.assetId) ?? []);
  const concepts = responses.flatMap((response, index) => parseAssetConceptBatch(response.text, new Set(batches[index]!.map((shot) => shot.id)), allowedAssetIds));
  try { validateAssetConcepts(concepts, new Set(input.shots.map((shot) => shot.id))); } catch (error) { throw new AssetConceptError("invalid_output", error instanceof Error ? error.message : "Asset Concepts referenced an invalid shot."); }
  if (concepts.length !== input.shots.length) throw new AssetConceptError("invalid_output", "Asset Concepts must return exactly one concept per shot.");
  return { output: assetConceptsOutputSchema.parse({ concepts }), ...(responses.find((response) => response.returnedModelId)?.returnedModelId ? { returnedModelId: responses.find((response) => response.returnedModelId)!.returnedModelId } : {}) };
}

function deterministicAssetConcept(shot: AssetConceptShot, channelDna?: ChannelDna, promptContext?: ResolvedChannelPromptContext) {
  const text = `${shot.purpose} ${shot.subjectAction} ${shot.semanticBeat ?? ""}`.toLowerCase();
  const kind = /chart|graph|diagram|arrow|money|cash|number|data/.test(text)
    ? "diagram"
    : /teacher|explain|gesture|point|present/.test(text)
      ? "teacher_gesture"
      : /background|room|office|street|environment/.test(text)
        ? "background"
        : "object";
  const referenceAssetId = promptContext?.assets.find((asset) => [asset.name, ...asset.tags].some((term) => term && text.includes(term.toLowerCase())))?.assetId;
  return {
    id: `concept-${shot.id}`,
    shotId: shot.id,
    semanticBeat: shot.semanticBeat?.trim() || shot.purpose,
    kind,
    role: kind === "teacher_gesture" ? "Teacher action" : kind === "diagram" ? "Explainer graphic" : "Scene visual",
    description: `${shot.purpose}. ${shot.subjectAction}`.trim(),
    visualConstraints: ["Readable at the target aspect ratio", "Keep the visual focus aligned with the approved storyboard"],
    colorPalette: promptContext?.visualIdentity.palette.slice(0, 5) ?? channelDna?.visualStyle.palette.slice(0, 5) ?? ["warm coral accent", "charcoal", "cream"],
    motionIntent: `Use ${channelDna?.productionDefaults.defaultMotion ?? promptContext?.productionGrammar.preferredMotion[0] ?? "zoom_in"} with the channel motion grammar; do not invent a new action.`,
    needsReferenceImage: false,
    ...(referenceAssetId ? { referenceAssetId } : {})
  };
}
