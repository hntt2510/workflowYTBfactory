import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { safeAssetFilename } from "@lsf/media";
import { NineRouterClient, NineRouterImageGenerationError } from "@lsf/providers";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 80_000_000;

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

export interface AssetAcquisitionPlan {
  imagePrompts: Array<{
    shotId: string;
    promptVersionId: string;
    positivePrompt: string;
    aspectRatio: "16:9" | "9:16";
  }>;
  preservedAssets: AcquiredImageAsset[];
}

export function planAssetAcquisition(input: {
  shots: Array<{ id: string; visualMode: string; promptVersionId?: string; approvedAssetId?: string }>;
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
  createImage(input: { model: string; prompt: string; aspectRatio: "16:9" | "9:16"; idempotencyKey?: string }): Promise<Array<{ url?: string; b64Json?: string; dataUri?: string }>>;
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
}): Promise<AcquiredImageAsset> {
  if (!input.imageCapabilityVerified) throw new AssetAcquisitionError("capability_not_verified", "A verified image-model certification is required before Asset Acquisition can run.");
  if (!input.imageModel || !input.apiKey || !input.baseUrl) throw new AssetAcquisitionError("credential_missing", "The selected image model or credential is unavailable.");
  let result: { url?: string; b64Json?: string; dataUri?: string };
  try {
    const results = await (input.createClient?.({ baseUrl: input.baseUrl, apiKey: input.apiKey }) ?? new NineRouterClient({ baseUrl: input.baseUrl, apiKey: input.apiKey, timeoutMs: input.providerTimeoutMs ?? 60_000 })).createImage({ model: input.imageModel, prompt: input.positivePrompt, aspectRatio: input.aspectRatio, idempotencyKey: input.idempotencyKey });
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
