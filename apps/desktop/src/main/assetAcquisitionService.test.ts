import { mkdtempSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { acquireImageAsset, importLocalImageAsset } from "./assetAcquisitionService";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+K3V3WQAAAABJRU5ErkJggg==", "base64");
describe("asset acquisition", () => {
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
