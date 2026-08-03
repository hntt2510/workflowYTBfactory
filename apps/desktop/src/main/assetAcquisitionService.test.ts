import { mkdtempSync, existsSync, writeFileSync } from "node:fs";
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
