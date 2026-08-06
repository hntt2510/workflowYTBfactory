import { describe, expect, it } from "vitest";
import { planFfmpegPreviewCommand } from "../src";

describe("FFmpeg preview planning", () => {
  const timeline = { fps: 30, items: [{ id: "visual-1", track: "primary_visual" as const, sourceId: "asset-1", startFrame: 0, durationFrames: 30, fps: 30 }] };
  it("builds a real visual/audio plan without a black lavfi input", () => {
    const plan = planFfmpegPreviewCommand({ timeline, outputPath: "preview.mp4", resolution: "1080p-vertical", visualInputs: [{ filePath: "asset.png", startFrame: 0, durationFrames: 30 }], audioInputs: [{ filePath: "voice.wav", startFrame: 30 }] });
    expect(plan).toContain("asset.png"); expect(plan).toContain("voice.wav"); expect(plan).not.toContain("color=c=black:s=1080x1920:r=30");
    expect(plan.join(" ")).toContain("pad=1080:1920");
    expect(plan.join(" ")).not.toContain("pad=1080x1920");
    expect(plan.join(" ")).toContain("adelay=1000:all=1");
    expect(plan.join(" ")).toContain("amix=inputs=1:duration=longest");
    expect(plan.join(" ")).toContain("apad=whole_dur=1.000000");
  });
  it("rejects missing or non-contiguous media", () => {
    expect(() => planFfmpegPreviewCommand({ timeline, outputPath: "preview.mp4", resolution: "1080p-vertical", visualInputs: [], audioInputs: [{ filePath: "voice.wav" }] })).toThrow();
  });

  it("adds a local UTF-8 subtitle filter when a subtitle file is supplied", () => {
    const plan = planFfmpegPreviewCommand({ timeline, outputPath: "preview.mp4", resolution: "1080p-vertical", visualInputs: [{ filePath: "asset.png", startFrame: 0, durationFrames: 30 }], audioInputs: [{ filePath: "voice.wav" }], subtitleFilePath: "C:\\workspace\\subtitles\\scene.srt" });
    const command = plan.join(" ");
    expect(command).toContain("subtitles='");
    expect(command).toContain("charenc=UTF-8");
    expect(command).toContain("FontName=Arial");
    expect(command).toContain("[vs]");
  });

  it("plans the requested 720p square output and subtitle preset", () => {
    const plan = planFfmpegPreviewCommand({
      timeline,
      outputPath: "preview.mp4",
      resolution: "720p-square",
      visualInputs: [{ filePath: "asset.png", startFrame: 0, durationFrames: 30 }],
      audioInputs: [{ filePath: "voice.wav" }],
      subtitleFilePath: "C:\\workspace\\subtitles\\scene.srt",
      subtitlePreset: "high-contrast"
    });
    const command = plan.join(" ");
    expect(command).toContain("scale=720x720");
    expect(command).toContain("FontSize=24");
    expect(command).toContain("Outline=4");
  });

  it("approximates the V1 motion catalog in the visual filter graph", () => {
    const plan = planFfmpegPreviewCommand({
      timeline,
      outputPath: "preview.mp4",
      resolution: "1080p-horizontal",
      visualInputs: [{ filePath: "asset.png", startFrame: 0, durationFrames: 30, motion: { effect: "slide_up", intensity: "standard", rationale: "Cash rises" } }],
      audioInputs: [{ filePath: "voice.wav" }]
    });
    expect(plan.join(" ")).toContain("crop=1920:1080");
    expect(plan.join(" ")).toContain("(ih-oh)*0.8");
  });
});
