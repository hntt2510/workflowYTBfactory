import { describe, expect, it } from "vitest";
import { planFfmpegPreviewCommand } from "../src";

describe("FFmpeg preview planning", () => {
  const timeline = { fps: 30, items: [{ id: "visual-1", track: "primary_visual" as const, sourceId: "asset-1", startFrame: 0, durationFrames: 30, fps: 30 }] };
  it("builds a real visual/audio plan without a black lavfi input", () => {
    const plan = planFfmpegPreviewCommand({ timeline, outputPath: "preview.mp4", resolution: "1080p-vertical", visualInputs: [{ filePath: "asset.png", startFrame: 0, durationFrames: 30 }], audioInputs: [{ filePath: "voice.wav" }] });
    expect(plan).toContain("asset.png"); expect(plan).toContain("voice.wav"); expect(plan).not.toContain("color=c=black:s=1080x1920:r=30");
  });
  it("rejects missing or non-contiguous media", () => {
    expect(() => planFfmpegPreviewCommand({ timeline, outputPath: "preview.mp4", resolution: "1080p-vertical", visualInputs: [], audioInputs: [{ filePath: "voice.wav" }] })).toThrow();
  });
});
