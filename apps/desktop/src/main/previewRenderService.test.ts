import { describe, expect, it } from "vitest";
import { PreviewRenderError, renderPreview } from "./previewRenderService";

describe("preview rendering", () => {
  it("blocks execution when an approved source is missing", async () => {
    await expect(renderPreview({ timeline: { fps: 30, items: [{ id: "visual-1", track: "primary_visual", sourceId: "asset-1", startFrame: 0, durationFrames: 30, fps: 30 }] }, outputPath: "missing.mp4", resolution: "1080p-vertical", visualInputs: [{ filePath: "missing.png", startFrame: 0, durationFrames: 30 }], audioInputs: [{ filePath: "missing.wav" }] })).rejects.toMatchObject({ category: "missing_media" } satisfies Partial<PreviewRenderError>);
  });
});
