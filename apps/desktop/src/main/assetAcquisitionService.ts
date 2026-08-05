import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { safeAssetFilename } from "@lsf/media";
import { NineRouterClient, NineRouterImageGenerationError } from "@lsf/providers";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 80_000_000;
export const defaultImageGenerationTimeoutMs = 180_000;

export class AssetAcquisitionError extends Error {
  constructor(
    readonly category: "capability_not_verified" | "credential_missing" | "provider_failed" | "invalid_response" | "unsafe_asset" | "prompt_missing" | "local_asset_missing" | "route_unavailable",
    message: string
  ) { super(message); }
}

export interface AcquiredImageAsset {
  shotId: string;
  promptVersionId: string;
  relativeFilePath: string;
  sha256: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  byteLength: number;
  width: number;
  height: number;
}

export interface ImageReferenceInput {
  relativeFilePath: string;
  sha256?: string;
  mimeType?: "image/png" | "image/jpeg" | "image/webp";
}

interface PreparedImageReference {
  dataUri: string;
  sha256: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}

export interface AssetAcquisitionPlan {
  imagePrompts: Array<{
    shotId: string;
    promptVersionId: string;
    positivePrompt: string;
    aspectRatio: "16:9" | "9:16";
  }>;
  preservedAssets: AcquiredImageAsset[];
}

/** Maps GG Lab's numeric filename to the storyboard slot, including REUSE gaps. */
export function mapNumericAssetFilename(input: {
  sourcePath: string;
  targetShotIds: string[];
  frameToShotId?: ReadonlyMap<string, string>;
}): string | undefined {
  const match = basename(input.sourcePath).match(/(?:^|[^0-9])(\d{1,3})(?:[^0-9]|$)/);
  if (!match?.[1]) return undefined;
  const frameNumber = match[1].padStart(3, "0");
  return input.frameToShotId?.get(frameNumber) ?? input.targetShotIds[Number(match[1]) - 1];
}

export function resolveReusableAssetAssignments(
  shots: Array<{ id: string; visualMode: string; continuityRefs: string[]; order?: number | undefined; startFrame?: number | undefined; approvedAssetId?: string | undefined }>,
  assignedAssetIds: ReadonlyMap<string, string>
): Map<string, string> {
  const resolved = new Map(assignedAssetIds);
  for (const shot of shots) {
    if (shot.approvedAssetId && !resolved.has(shot.id)) resolved.set(shot.id, shot.approvedAssetId);
  }

  const orderedShots = shots
    .map((shot, index) => ({ shot, index }))
    .sort((left, right) => (left.shot.startFrame ?? Number.POSITIVE_INFINITY) - (right.shot.startFrame ?? Number.POSITIVE_INFINITY)
      || (left.shot.order ?? Number.POSITIVE_INFINITY) - (right.shot.order ?? Number.POSITIVE_INFINITY)
      || left.index - right.index)
    .map(({ shot }) => shot);
  for (const shot of orderedShots) {
    if (shot.visualMode !== "reuse" || resolved.has(shot.id)) continue;
    const shotPosition = orderedShots.indexOf(shot);
    const sourceShotId = shot.continuityRefs.find((reference) => {
      const sourcePosition = orderedShots.findIndex((candidate) => candidate.id === reference);
      return sourcePosition >= 0 && sourcePosition < shotPosition && resolved.has(reference);
    });
    const sourceAssetId = sourceShotId ? resolved.get(sourceShotId) : undefined;
    if (sourceAssetId) resolved.set(shot.id, sourceAssetId);
  }
  return resolved;
}

export function planAssetAcquisition(input: {
  shots: Array<{ id: string; visualMode: string; promptVersionId?: string | undefined; approvedAssetId?: string | undefined }>;
  prompts: Array<{ shotId: string; promptVersionId: string; positivePrompt: string; aspectRatio: "16:9" | "9:16" }>;
  priorAssets: AcquiredImageAsset[];
}): AssetAcquisitionPlan {
  const assetsById = new Map(input.priorAssets.map((asset) => [`asset-${asset.sha256}`, asset]));
  const imagePrompts: AssetAcquisitionPlan["imagePrompts"] = [];
  const preservedAssets: AcquiredImageAsset[] = [];

  for (const shot of input.shots) {
    if (shot.visualMode === "ai_image") {
      const prompt = input.prompts.find((candidate) => candidate.shotId === shot.id && candidate.promptVersionId === shot.promptVersionId);
      if (!prompt) throw new AssetAcquisitionError("prompt_missing", `Approved AI-image prompt is missing for shot ${shot.id}.`);
      imagePrompts.push(prompt);
      continue;
    }

    const localRoute = shot.visualMode === "reuse" || shot.visualMode === "manual_upload" || shot.visualMode === "uploaded";
    const existingAsset = shot.approvedAssetId ? assetsById.get(shot.approvedAssetId) : undefined;
    const canPreserveLocalAsset = localRoute || shot.visualMode === "document" || shot.visualMode === "diagram" || shot.visualMode === "map" || shot.visualMode === "chart" || shot.visualMode === "stock_image" || shot.visualMode === "stock_video" || shot.visualMode === "text_card";
    if (canPreserveLocalAsset && existingAsset) {
      preservedAssets.push(existingAsset);
      continue;
    }

    if (localRoute) throw new AssetAcquisitionError("local_asset_missing", `A validated local asset is required for ${shot.visualMode} shot ${shot.id}.`);
    throw new AssetAcquisitionError("route_unavailable", `No verified asset acquisition adapter is configured for ${shot.visualMode} shot ${shot.id}. Provide a local replacement or choose an available visual route.`);
  }

  if (imagePrompts.length === 0 && preservedAssets.length === 0) throw new AssetAcquisitionError("route_unavailable", "No supported visual route is available for Asset Acquisition.");
  return { imagePrompts, preservedAssets };
}

interface ImageClient {
  createImage(input: { model: string; prompt: string; aspectRatio: "16:9" | "9:16"; idempotencyKey?: string; references?: PreparedImageReference[] }): Promise<Array<{ url?: string; b64Json?: string; dataUri?: string }>>;
}

export async function acquireImageAsset(input: {
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
  providerTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  createClient?: (config: { baseUrl: string; apiKey: string }) => ImageClient;
  referenceImages?: ImageReferenceInput[];
}): Promise<AcquiredImageAsset> {
  if (!input.imageCapabilityVerified) throw new AssetAcquisitionError("capability_not_verified", "A verified image-model certification is required before Asset Acquisition can run.");
  if (!input.imageModel || !input.apiKey || !input.baseUrl) throw new AssetAcquisitionError("credential_missing", "The selected image model or credential is unavailable.");
  let result: { url?: string; b64Json?: string; dataUri?: string };
  try {
    const references = await prepareImageReferences(input.workspaceRoot, input.referenceImages);
    const prompt = references.length
      ? `${input.positivePrompt} Attached reference images define the same teacher identity; preserve the face, hair, wardrobe palette, body proportions, and teaching role. Change only the requested view, gesture, action, and scene composition.`
      : input.positivePrompt;
    const request = { model: input.imageModel, prompt, aspectRatio: input.aspectRatio, idempotencyKey: input.idempotencyKey, ...(references.length ? { references } : {}) };
    const client = input.createClient?.({ baseUrl: input.baseUrl, apiKey: input.apiKey });
    const results = client
      ? await client.createImage(request)
      : references.length
        ? await createReferenceImage({ ...request, references }, input.baseUrl, input.apiKey, input.providerTimeoutMs ?? defaultImageGenerationTimeoutMs, input.fetchImpl)
        : await new NineRouterClient({ baseUrl: input.baseUrl, apiKey: input.apiKey, timeoutMs: input.providerTimeoutMs ?? defaultImageGenerationTimeoutMs }).createImage(request);
    if (results.length !== 1) throw new AssetAcquisitionError("invalid_response", "Image generation must return exactly one image per shot.");
    result = results[0]!;
  } catch (error) {
    if (error instanceof AssetAcquisitionError) throw error;
    throw new AssetAcquisitionError("provider_failed", error instanceof NineRouterImageGenerationError ? `Image provider request failed: ${error.status}.` : "Image provider request failed.");
  }
  const downloaded = await decodeImageResult(result, input.fetchImpl);
  const inspected = inspectImage(downloaded.bytes, downloaded.mimeType);
  const extension = inspected.mimeType === "image/png" ? "png" : inspected.mimeType === "image/jpeg" ? "jpg" : "webp";
  const relativeFilePath = join("assets", "images", safeAssetFilename(input.projectId), `${safeAssetFilename(input.shotId)}-${safeAssetFilename(input.promptVersionId)}-${createHash("sha256").update(downloaded.bytes).digest("hex").slice(0, 12)}.${extension}`);
  const absolutePath = join(input.workspaceRoot, relativeFilePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, downloaded.bytes, { flag: "wx" }).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  return { shotId: input.shotId, promptVersionId: input.promptVersionId, relativeFilePath, sha256: createHash("sha256").update(downloaded.bytes).digest("hex"), byteLength: downloaded.bytes.length, ...inspected };
}

async function prepareImageReferences(workspaceRoot: string, references: ImageReferenceInput[] | undefined): Promise<PreparedImageReference[]> {
  if (!references?.length) return [];
  if (references.length > 2) throw new AssetAcquisitionError("unsafe_asset", "At most two character references may be attached to one image request.");
  const workspace = resolve(workspaceRoot);
  const prepared: PreparedImageReference[] = [];
  for (const reference of references) {
    const absolutePath = resolve(workspace, reference.relativeFilePath);
    const relativePath = relative(workspace, absolutePath);
    if (!relativePath || relativePath.startsWith("..")) throw new AssetAcquisitionError("unsafe_asset", "Character reference must stay inside the workspace.");
    let bytes: Buffer;
    try {
      bytes = await readFile(absolutePath);
    } catch {
      throw new AssetAcquisitionError("unsafe_asset", "A character reference is missing from the workspace.");
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (reference.sha256 && reference.sha256 !== sha256) throw new AssetAcquisitionError("unsafe_asset", "A character reference changed after approval.");
    const inspected = inspectImage(bytes, reference.mimeType);
    prepared.push({ dataUri: `data:${inspected.mimeType};base64,${bytes.toString("base64")}`, sha256, mimeType: inspected.mimeType });
  }
  return prepared;
}

async function createReferenceImage(
  input: { model: string; prompt: string; aspectRatio: "16:9" | "9:16"; idempotencyKey?: string; references: PreparedImageReference[] },
  baseUrl: string,
  apiKey: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch
): Promise<Array<{ url?: string; b64Json?: string; dataUri?: string }>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const model = resolveReferenceImageModel(input.model);
  try {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/responses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}) },
        body: JSON.stringify({
          model,
          input: [{ role: "user", content: [...input.references.map((reference) => ({ type: "input_image", image_url: reference.dataUri })), { type: "input_text", text: input.prompt }] }],
          tools: [{ type: "image_generation", size: input.aspectRatio === "9:16" ? "1024x1792" : "1792x1024" }],
          tool_choice: { type: "image_generation" },
          stream: false
        }),
        signal: controller.signal
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new AssetAcquisitionError("provider_failed", "Image provider request failed: timeout.");
      throw new AssetAcquisitionError("provider_failed", "Image provider request failed.");
    }
    if (!response.ok) throw new AssetAcquisitionError("provider_failed", "Image provider request failed.");
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new AssetAcquisitionError("provider_failed", "Image provider request failed: timeout.");
      throw new AssetAcquisitionError("invalid_response", "Image provider returned an invalid response.");
    }
    const results = parseReferenceImageResults(payload);
    if (!results.length) throw new AssetAcquisitionError("invalid_response", "Image provider returned no image.");
    return results;
  } finally {
    clearTimeout(timeout);
  }
}

function resolveReferenceImageModel(model: string): string {
  return /^(?:cx\/)?gpt-5\.(?:3|4|5)-image$/i.test(model.trim()) ? "cx/gpt-5.6-luna" : model;
}

function parseReferenceImageResults(payload: unknown): Array<{ url?: string; b64Json?: string; dataUri?: string }> {
  const results: Array<{ url?: string; b64Json?: string; dataUri?: string }> = [];
  const seen = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== "string" || !value || seen.has(value)) return;
    if (value.startsWith("data:image/")) { seen.add(value); results.push({ dataUri: value }); return; }
    if (/^https?:\/\//i.test(value)) { seen.add(value); results.push({ url: value }); return; }
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(value)) { seen.add(value); results.push({ b64Json: value }); }
  };
  const visit = (value: unknown, depth: number) => {
    if (depth > 5 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) { for (const item of value) visit(item, depth + 1); return; }
    const record = value as Record<string, unknown>;
    add(record.b64_json);
    add(record.b64Json);
    add(record.dataUri);
    if (record.type === "image_generation_call" || record.type === "output_image") add(record.result);
    const imageUrl = record.image_url;
    if (imageUrl && typeof imageUrl === "object") add((imageUrl as Record<string, unknown>).url);
    for (const key of ["data", "output", "choices", "message", "content", "images"]) visit(record[key], depth + 1);
  };
  visit(payload, 0);
  return results;
}

export async function importLocalImageAsset(input: {
  projectId: string;
  shotId: string;
  workspaceRoot: string;
  sourcePath: string;
}): Promise<AcquiredImageAsset> {
  let bytes: Buffer;
  try {
    bytes = await readFile(input.sourcePath);
  } catch {
    throw new AssetAcquisitionError("unsafe_asset", "Selected image file could not be read.");
  }
  const inspected = inspectImage(bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const extension = inspected.mimeType === "image/png" ? "png" : inspected.mimeType === "image/jpeg" ? "jpg" : "webp";
  const relativeFilePath = join("assets", "uploads", safeAssetFilename(input.projectId), `${safeAssetFilename(input.shotId)}-${sha256.slice(0, 12)}.${extension}`);
  const absolutePath = join(input.workspaceRoot, relativeFilePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, bytes, { flag: "wx" }).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  return { shotId: input.shotId, promptVersionId: "manual-upload", relativeFilePath, sha256, byteLength: bytes.length, ...inspected };
}

async function decodeImageResult(result: { url?: string; b64Json?: string; dataUri?: string }, fetchImpl: typeof fetch = fetch): Promise<{ bytes: Buffer; mimeType?: string }> {
  if (result.b64Json) return { bytes: decodeBase64(result.b64Json) };
  if (result.dataUri) {
    const matched = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(result.dataUri);
    if (!matched) throw new AssetAcquisitionError("unsafe_asset", "Image data URI is not a supported base64 image.");
    return { bytes: decodeBase64(matched[2]!), mimeType: matched[1]! };
  }
  if (!result.url) throw new AssetAcquisitionError("invalid_response", "Image response did not include image bytes.");
  let url: URL;
  try { url = new URL(result.url); } catch { throw new AssetAcquisitionError("unsafe_asset", "Image response URL is invalid."); }
  if (url.protocol !== "https:") throw new AssetAcquisitionError("unsafe_asset", "Image download must use HTTPS.");
  const response = await fetchImpl(url, { redirect: "error" });
  const mimeType = response.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase();
  if (!response.ok || !mimeType?.match(/^image\/(png|jpeg|webp)$/)) throw new AssetAcquisitionError("unsafe_asset", "Image download did not return a supported image MIME type.");
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, mimeType };
}

function decodeBase64(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) throw new AssetAcquisitionError("unsafe_asset", "Image bytes were not valid base64.");
  return Buffer.from(value, "base64");
}

function inspectImage(bytes: Buffer, declaredMimeType?: string): { mimeType: "image/png" | "image/jpeg" | "image/webp"; width: number; height: number } {
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new AssetAcquisitionError("unsafe_asset", "Image byte length is outside safe limits.");
  let result: { mimeType: "image/png" | "image/jpeg" | "image/webp"; width: number; height: number } | null = null;
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.length >= 24) result = { mimeType: "image/png", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  else if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) result = inspectJpeg(bytes);
  else if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") result = inspectWebp(bytes);
  if (!result || result.width < 1 || result.height < 1 || result.width * result.height > MAX_IMAGE_PIXELS || (declaredMimeType && declaredMimeType !== result.mimeType)) throw new AssetAcquisitionError("unsafe_asset", "Image bytes are corrupt, unsupported, or exceed pixel limits.");
  return result;
}

function inspectJpeg(bytes: Buffer): { mimeType: "image/jpeg"; width: number; height: number } | null { for (let i = 2; i + 9 < bytes.length;) { if (bytes[i] !== 255) return null; const marker = bytes[i + 1]!; const length = bytes.readUInt16BE(i + 2); if (length < 2 || i + 2 + length > bytes.length) return null; if (marker >= 192 && marker <= 195) return { mimeType: "image/jpeg", height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) }; i += 2 + length; } return null; }
function inspectWebp(bytes: Buffer): { mimeType: "image/webp"; width: number; height: number } | null { const chunk = bytes.subarray(12, 16).toString("ascii"); if (chunk === "VP8X" && bytes.length >= 30) return { mimeType: "image/webp", width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) }; return null; }
