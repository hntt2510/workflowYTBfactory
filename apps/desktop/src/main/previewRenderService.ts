import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { planFfmpegPreviewCommand } from "@lsf/media";
import type { Timeline } from "@lsf/domain";

const execFileAsync = promisify(execFile);

export class PreviewRenderError extends Error {
  constructor(readonly category: "missing_media" | "ffmpeg_failed" | "invalid_preview", message: string) { super(message); }
}

export async function getPreviewFileSha256(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

export async function renderPreview(input: {
  timeline: Timeline;
  outputPath: string;
  resolution: "1080p-horizontal" | "1080p-vertical";
  visualInputs: Array<{ filePath: string; startFrame: number; durationFrames: number }>;
  audioInputs: Array<{ filePath: string }>;
  ffmpegPath?: string;
  ffprobePath?: string;
}) {
  if ([...input.visualInputs, ...input.audioInputs].some((item) => !existsSync(item.filePath))) throw new PreviewRenderError("missing_media", "An approved preview input file is missing.");
  const command = planFfmpegPreviewCommand(input);
  try { await execFileAsync(command[0]!, command.slice(1), { encoding: "utf8", timeout: 10 * 60_000, windowsHide: true }); }
  catch { throw new PreviewRenderError("ffmpeg_failed", "FFmpeg preview render failed."); }
  if (!existsSync(input.outputPath)) throw new PreviewRenderError("invalid_preview", "FFmpeg completed without creating a preview.");
  const ffprobePath = input.ffprobePath ?? "ffprobe";
  try {
    const { stdout } = await execFileAsync(ffprobePath, ["-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate:format=duration", "-of", "json", input.outputPath], { encoding: "utf8", timeout: 30_000, windowsHide: true });
    const payload = JSON.parse(stdout) as { streams?: Array<{ codec_type?: string; width?: number; height?: number; r_frame_rate?: string }>; format?: { duration?: string } };
    const video = payload.streams?.find((stream) => stream.codec_type === "video"); const audio = payload.streams?.find((stream) => stream.codec_type === "audio"); const duration = Number(payload.format?.duration);
    const [numerator, denominator] = video?.r_frame_rate?.split("/").map(Number) ?? [];
    const fps = numerator && denominator ? numerator / denominator : Number.NaN;
    const expectedSize = input.resolution === "1080p-horizontal" ? [1920, 1080] : [1080, 1920];
    const narrationEndFrame = input.timeline.items.filter((item) => item.track === "narration").reduce((end, item) => Math.max(end, item.startFrame + item.durationFrames), 0);
    const expectedDuration = narrationEndFrame / input.timeline.fps;
    if (!video?.width || !video.height || video.width !== expectedSize[0] || video.height !== expectedSize[1] || !audio || !Number.isFinite(fps) || Math.abs(fps - input.timeline.fps) > 0.01 || !Number.isFinite(duration) || duration <= 0 || !expectedDuration || Math.abs(duration - expectedDuration) > 0.5) throw new Error("invalid media");
    return { outputPath: input.outputPath, durationSeconds: duration, width: video.width, height: video.height, sha256: await getPreviewFileSha256(input.outputPath) };
  } catch { throw new PreviewRenderError("invalid_preview", "Rendered preview failed FFprobe validation."); }
}
