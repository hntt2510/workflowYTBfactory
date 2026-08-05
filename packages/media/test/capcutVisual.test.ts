import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { planCapCutVisualClipCommand, prepareCapCutVisualClip } from "../src";

describe("CapCut visual clips", () => {
  it("plans render-safe H.264 image clips with the timeline contract", () => {
    const [command, args] = planCapCutVisualClipCommand({
      inputPath: "asset.png",
      outputPath: "visual.mp4",
      width: 1080,
      height: 1920,
      fps: 30,
      durationFrames: 75
    });
    expect(command).toBe("ffmpeg");
    expect(args).toEqual(expect.arrayContaining([
      "-loop", "1",
      "-frames:v", "75",
      "-r", "30",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart"
    ]));
    expect(args.join(" ")).toContain("scale=1080:1920");
    expect(args.at(-1)).toBe("visual.mp4");
  });

  it("converts a PNG into a validated CapCut MP4 clip", async () => {
    const root = mkdtempSync(join(tmpdir(), "lsf-capcut-visual-"));
    try {
      const inputPath = join(root, "asset.png");
      const outputPath = join(root, "visual.mp4");
      writeFileSync(inputPath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
      await prepareCapCutVisualClip({ inputPath, outputPath, width: 1080, height: 1920, fps: 30, durationFrames: 30 });
      expect(outputPath.endsWith(".mp4")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
