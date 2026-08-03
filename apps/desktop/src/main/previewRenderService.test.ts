import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { PreviewRenderError, renderPreview } from "./previewRenderService";

vi.mock("node:child_process", () => ({
  execFile: (_command: string, _args: readonly string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
    callback(null, "", "");
  }
}));

describe("preview rendering", () => {
  it("blocks execution when an approved source is missing", async () => {
    await expect(renderPreview({ timeline: { fps: 30, items: [{ id: "visual-1", track: "primary_visual", sourceId: "asset-1", startFrame: 0, durationFrames: 30, fps: 30 }] }, outputPath: "missing.mp4", resolution: "1080p-vertical", visualInputs: [{ filePath: "missing.png", startFrame: 0, durationFrames: 30 }], audioInputs: [{ filePath: "missing.wav" }] })).rejects.toMatchObject({ category: "missing_media" } satisfies Partial<PreviewRenderError>);
  });

  it("blocks a missing local subtitle file", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "lsf-preview-subtitles-"));
    const inputPath = join(workspace, "input.png");
    const audioPath = join(workspace, "input.wav");
    writeFileSync(inputPath, "preview-input");
    writeFileSync(audioPath, "preview-audio");

    await expect(renderPreview({
      timeline: { fps: 30, items: [{ id: "visual-1", track: "primary_visual", sourceId: "asset-1", startFrame: 0, durationFrames: 30, fps: 30 }] },
      outputPath: join(workspace, "output.mp4"),
      resolution: "1080p-vertical",
      visualInputs: [{ filePath: inputPath, startFrame: 0, durationFrames: 30 }],
      audioInputs: [{ filePath: audioPath }],
      subtitleFilePath: join(workspace, "missing.srt")
    })).rejects.toMatchObject({ category: "missing_media" } satisfies Partial<PreviewRenderError>);

    rmSync(workspace, { recursive: true, force: true });
  });

  it("treats a missing rendered file as an invalid preview", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "lsf-preview-"));
    const inputPath = join(workspace, "input.png");
    const audioPath = join(workspace, "input.wav");
    writeFileSync(inputPath, "preview-input");
    writeFileSync(audioPath, "preview-audio");

    await expect(
      renderPreview({
        timeline: { fps: 30, items: [{ id: "visual-1", track: "primary_visual", sourceId: "asset-1", startFrame: 0, durationFrames: 30, fps: 30 }] },
        outputPath: join(workspace, "output.mp4"),
        resolution: "1080p-vertical",
        visualInputs: [{ filePath: inputPath, startFrame: 0, durationFrames: 30 }],
        audioInputs: [{ filePath: audioPath }]
      })
    ).rejects.toMatchObject({ category: "invalid_preview" } satisfies Partial<PreviewRenderError>);

    rmSync(workspace, { recursive: true, force: true });
  });
});
