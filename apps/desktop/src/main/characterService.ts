import type { CharacterPersona, CharacterReferenceView, CharacterVersion } from "@lsf/domain";
import { characterReferenceViewsForCount, resolveCharacterCompositionLock } from "@lsf/domain";
import { acquireImageAsset, type AcquiredImageAsset, type ImageReferenceInput } from "./assetAcquisitionService";

export class CharacterGenerationError extends Error {
  constructor(readonly category: "provider_failed" | "credential_missing" | "capability_not_verified" | "invalid_input", message: string) {
    super(message);
  }
}

interface CharacterImageAssetInput {
  projectId: string;
  shotId: string;
  promptVersionId: string;
  idempotencyKey: string;
  positivePrompt: string;
  aspectRatio: "16:9" | "9:16";
  imageModel?: string;
  apiKey?: string | null;
  baseUrl?: string;
  imageCapabilityVerified: boolean;
  workspaceRoot: string;
  referenceImages?: ImageReferenceInput[];
}

type CharacterImageGenerator = (input: CharacterImageAssetInput) => Promise<AcquiredImageAsset>;

const defaultCharacterImageGenerator: CharacterImageGenerator = (input) => acquireImageAsset(input);

function characterImageAspectRatio(version: { composition?: CharacterVersion["composition"] }): "16:9" | "9:16" {
  return resolveCharacterCompositionLock(version).aspectRatio === "9:16" ? "9:16" : "16:9";
}

function characterPrompt(input: { name: string; persona: CharacterPersona; invariantTraits: string[]; prohibitedChanges: string[]; composition?: CharacterVersion["composition"]; view: CharacterReferenceView }): string {
  const composition = resolveCharacterCompositionLock(input);
  return [
    `Create a consistent educational YouTube teacher character named ${input.name}.`,
    `View: ${input.view.replaceAll("_", " ")}.`,
    `Role: ${input.persona.role}. Age range: ${input.persona.ageRange}.`,
    `Appearance: ${input.persona.appearance}. Wardrobe: ${input.persona.wardrobe}. Palette: ${input.persona.palette}.`,
    `Props: ${input.persona.props.join(", ") || "none"}. Gestures: ${input.persona.gestures.join(", ") || "none"}. Tone: ${input.persona.tone}.`,
    `Invariant traits: ${input.invariantTraits.join("; ") || "keep the same identity across views"}.`,
    `Do not change: ${input.prohibitedChanges.join("; ") || "identity, wardrobe palette, or teaching role"}.`,
    `Composition lock: ${composition.aspectRatio} canvas; ${composition.cameraDistance}; place the subject ${composition.subjectAnchor} inside normalized box x=${composition.subjectBox.x}, y=${composition.subjectBox.y}, width=${composition.subjectBox.width}, height=${composition.subjectBox.height}; preserve ${composition.headroom}; keep the opposite safe zone clear for diagrams and subtitles at x=${composition.safeZone.x}, y=${composition.safeZone.y}, width=${composition.safeZone.width}, height=${composition.safeZone.height}.`,
    "Clean documentary illustration, clear silhouette, no text, no logos, no copyrighted character imitation."
  ].join(" ");
}

function toReference(view: CharacterReferenceView, asset: AcquiredImageAsset): CharacterVersion["references"][number] {
  return {
    id: `character-reference-${view}`,
    view,
    status: "needs_review",
    relativeFilePath: asset.relativeFilePath,
    sha256: asset.sha256,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height
  };
}

export async function generateCharacterVersion(input: {
  profileId: string;
  version: number;
  name: string;
  persona: CharacterPersona;
  invariantTraits: string[];
  prohibitedChanges: string[];
  composition?: CharacterVersion["composition"];
  viewCount?: number;
  imageModel?: string;
  apiKey?: string | null;
  baseUrl?: string;
  imageCapabilityVerified: boolean;
  workspaceRoot: string;
  generateImage?: CharacterImageGenerator;
}): Promise<CharacterVersion> {
  const views = characterReferenceViewsForCount(input.viewCount ?? 5);
  const generateImage = input.generateImage ?? defaultCharacterImageGenerator;
  const now = new Date().toISOString();
  const references: CharacterVersion["references"] = [];
  let identityReference: ImageReferenceInput | undefined;
  for (const view of views) {
    const asset = await generateImage({
      projectId: `channel-${input.profileId}`,
      shotId: `character-${view}`,
      promptVersionId: `character-v${input.version}-${view}`,
      idempotencyKey: `character:${input.profileId}:${input.version}:${view}`,
      positivePrompt: characterPrompt({ ...input, view }),
      aspectRatio: characterImageAspectRatio(input),
      ...(input.imageModel ? { imageModel: input.imageModel } : {}),
      ...(input.apiKey !== undefined ? { apiKey: input.apiKey } : {}),
      ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
      imageCapabilityVerified: input.imageCapabilityVerified,
      workspaceRoot: input.workspaceRoot,
      ...(identityReference ? { referenceImages: [identityReference] } : {})
    });
    references.push(toReference(view, asset));
    if (!identityReference) identityReference = { relativeFilePath: asset.relativeFilePath, sha256: asset.sha256, mimeType: asset.mimeType };
  }
  return {
    id: `character-${input.profileId}-v${input.version}`,
    version: input.version,
    status: "needs_review",
    name: input.name,
    persona: input.persona,
    invariantTraits: input.invariantTraits,
    prohibitedChanges: input.prohibitedChanges,
    composition: resolveCharacterCompositionLock(input),
    references,
    createdAt: now,
    updatedAt: now
  };
}

export async function retryCharacterReference(input: {
  profileId: string;
  version: CharacterVersion;
  view: CharacterReferenceView;
  imageModel?: string;
  apiKey?: string | null;
  baseUrl?: string;
  imageCapabilityVerified: boolean;
  workspaceRoot: string;
  generateImage?: CharacterImageGenerator;
}): Promise<CharacterVersion> {
  const generateImage = input.generateImage ?? defaultCharacterImageGenerator;
  const referenceImages = input.version.references
    .filter((reference) => reference.view !== input.view && reference.relativeFilePath)
    .sort((left, right) => (left.view === "hero" ? -1 : right.view === "hero" ? 1 : left.view === "half_body" ? -1 : right.view === "half_body" ? 1 : 0))
    .slice(0, 2)
    .map((reference) => ({ relativeFilePath: reference.relativeFilePath!, ...(reference.sha256 ? { sha256: reference.sha256 } : {}), ...(reference.mimeType ? { mimeType: reference.mimeType } : {}) }));
  const asset = await generateImage({
    projectId: `channel-${input.profileId}`,
    shotId: `character-${input.view}`,
    promptVersionId: `character-v${input.version.version}-${input.view}`,
    idempotencyKey: `character:${input.profileId}:${input.version.version}:${input.view}:${Date.now()}`,
    positivePrompt: characterPrompt({ ...input.version, view: input.view }),
    aspectRatio: characterImageAspectRatio(input.version),
    ...(input.imageModel ? { imageModel: input.imageModel } : {}),
    ...(input.apiKey !== undefined ? { apiKey: input.apiKey } : {}),
    ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
    imageCapabilityVerified: input.imageCapabilityVerified,
    workspaceRoot: input.workspaceRoot,
    ...(referenceImages.length ? { referenceImages } : {})
  });
  const references = input.version.references.map((reference) => reference.view === input.view ? toReference(input.view, asset) : reference);
  return { ...input.version, status: "needs_review", references, updatedAt: new Date().toISOString() };
}
