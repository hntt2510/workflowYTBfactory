import { mkdtempSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { acquireImageAsset, importLocalImageAsset, planAssetAcquisition } from "./assetAcquisitionService";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+K3V3WQAAAABJRU5ErkJggg==", "base64");
describe("asset acquisition", () => {
  const localAsset = {
    shotId: "shot-local",
    promptVersionId: "manual-upload",
    relativeFilePath: "assets/uploads/project-1/local.png",
    sha256: "a".repeat(64),
    mimeType: "image/png" as const,
    byteLength: 68,
    width: 1,
    height: 1
  };

  it("plans mixed AI and reusable routes without asking the provider to regenerate local media", () => {
    const plan = planAssetAcquisition({
      shots: [
        { id: "shot-ai", visualMode: "ai_image", promptVersionId: "prompt-1" },
        { id: "shot-local", visualMode: "reuse", approvedAssetId: `asset-${localAsset.sha256}` }
      ],
      prompts: [{ shotId: "shot-ai", promptVersionId: "prompt-1", positivePrompt: "safe image", aspectRatio: "16:9" }],
      priorAssets: [localAsset]
    });

    expect(plan.imagePrompts.map((prompt) => prompt.shotId)).toEqual(["shot-ai"]);
    expect(plan.preservedAssets).toEqual([localAsset]);
  });

  it("supports an all-local route without requiring an image prompt", () => {
    expect(planAssetAcquisition({
      shots: [{ id: "shot-local", visualMode: "uploaded", approvedAssetId: `asset-${localAsset.sha256}` }],
      prompts: [],
      priorAssets: [localAsset]
    })).toMatchObject({ imagePrompts: [], preservedAssets: [localAsset] });
  });

  it("preserves a validated local asset for a document route", () => {
    expect(planAssetAcquisition({
      shots: [{ id: "shot-local", visualMode: "document", approvedAssetId: `asset-${localAsset.sha256}` }],
      prompts: [],
      priorAssets: [localAsset]
    }).preservedAssets).toEqual([localAsset]);
  });

  it("fails closed for unsupported routes before media generation", () => {
    expect(() => planAssetAcquisition({
      shots: [{ id: "shot-document", visualMode: "document" }],
      prompts: [],
      priorAssets: []
    })).toThrowError(expect.objectContaining({ category: "route_unavailable" }));
  });

  it("requires the exact approved prompt for an AI-image shot", () => {
    expect(() => planAssetAcquisition({
      shots: [{ id: "shot-ai", visualMode: "ai_image", promptVersionId: "prompt-current" }],
      prompts: [{ shotId: "shot-ai", promptVersionId: "prompt-stale", positivePrompt: "stale", aspectRatio: "16:9" }],
      priorAssets: []
    })).toThrowError(expect.objectContaining({ category: "prompt_missing" }));
  });

  it("stores only validated bytes and never keeps a source URL", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "lsf-assets-"));
    const asset = await acquireImageAsset({ projectId: "project-1", shotId: "shot-1", promptVersionId: "prompt-1", idempotencyKey: "asset-key-1", positivePrompt: "safe image", aspectRatio: "9:16", imageModel: "image-v1", apiKey: "secret", baseUrl: "https://gateway.example/v1", imageCapabilityVerified: true, workspaceRoot, createClient: () => ({ createImage: async () => [{ b64Json: png.toString("base64") }] }) });
    expect(asset.relativeFilePath).not.toContain("https:");
    expect(asset.mimeType).toBe("image/png");
    expect(existsSync(join(workspaceRoot, asset.relativeFilePath))).toBe(true);
  });
  it("attaches approved character reference bytes to a custom image client", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "lsf-ref-assets-"));
    mkdirSync(join(workspaceRoot, "characters"), { recursive: true });
    writeFileSync(join(workspaceRoot, "characters", "hero.png"), png);
    let request: { references?: Array<{ dataUri: string }> } | undefined;
    await acquireImageAsset({
      projectId: "project-1",
      shotId: "shot-1",
      promptVersionId: "prompt-1",
      idempotencyKey: "asset-ref-key-1",
      positivePrompt: "teacher explaining cash flow",
      aspectRatio: "9:16",
      imageModel: "image-v1",
      apiKey: "secret",
      baseUrl: "https://gateway.example/v1",
      imageCapabilityVerified: true,
      workspaceRoot,
      referenceImages: [{ relativeFilePath: "characters/hero.png", sha256: createSha256(png), mimeType: "image/png" }],
      createClient: () => ({ createImage: async (input) => { request = input; return [{ b64Json: png.toString("base64") }]; } })
    });
    expect(request?.references).toHaveLength(1);
    expect(request?.references?.[0]?.dataUri).toBe(`data:image/png;base64,${png.toString("base64")}`);
  });
  it("uses the Responses image tool when approved references are present", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "lsf-responses-ref-"));
    mkdirSync(join(workspaceRoot, "characters"), { recursive: true });
    writeFileSync(join(workspaceRoot, "characters", "hero.png"), png);
    let body: Record<string, unknown> | undefined;
    const asset = await acquireImageAsset({
      projectId: "project-1",
      shotId: "shot-1",
      promptVersionId: "prompt-1",
      idempotencyKey: "asset-responses-ref-1",
      positivePrompt: "teacher explaining cash flow",
      aspectRatio: "9:16",
      imageModel: "cx/gpt-5.5-image",
      apiKey: "secret",
      baseUrl: "https://gateway.example/v1",
      imageCapabilityVerified: true,
      workspaceRoot,
      referenceImages: [{ relativeFilePath: "characters/hero.png", sha256: createSha256(png), mimeType: "image/png" }],
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ output: [{ type: "image_generation_call", result: png.toString("base64") }] }));
      }
    });
    const content = ((body?.input as Array<{ content: unknown }>)[0]?.content as Array<{ type: string }>);
    expect(body?.model).toBe("cx/gpt-5.6-luna");
    expect(content[0]?.type).toBe("input_image");
    expect(content.at(-1)?.type).toBe("input_text");
    expect((content.at(-1) as { text?: string }).text).toContain("same teacher identity");
    expect(asset.mimeType).toBe("image/png");
  });
  it("rejects HTML masquerading as an image", async () => {
    await expect(acquireImageAsset({ projectId: "project-1", shotId: "shot-1", promptVersionId: "prompt-1", idempotencyKey: "asset-key-1", positivePrompt: "safe image", aspectRatio: "9:16", imageModel: "image-v1", apiKey: "secret", baseUrl: "https://gateway.example/v1", imageCapabilityVerified: true, workspaceRoot: mkdtempSync(join(tmpdir(), "lsf-assets-")), createClient: () => ({ createImage: async () => [{ b64Json: Buffer.from("<html>no</html>").toString("base64") }] }) })).rejects.toMatchObject({ category: "unsafe_asset" });
  });
  it("imports a validated local image into the workspace without retaining its source path", async () => {
    const sourceRoot = mkdtempSync(join(tmpdir(), "lsf-upload-source-"));
    const workspaceRoot = mkdtempSync(join(tmpdir(), "lsf-upload-workspace-"));
    const sourcePath = join(sourceRoot, "manual.png");
    writeFileSync(sourcePath, png);
    const asset = await importLocalImageAsset({ projectId: "project-1", shotId: "shot-1", workspaceRoot, sourcePath });
    expect(asset.relativeFilePath).toMatch(/^assets[\\/]uploads[\\/]/);
    expect(asset.relativeFilePath).not.toContain(sourceRoot);
    expect(existsSync(join(workspaceRoot, asset.relativeFilePath))).toBe(true);
  });
});

function createSha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
