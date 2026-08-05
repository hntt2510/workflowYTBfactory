import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CapCutVisualClipInput {
  inputPath: string;
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  durationFrames: number;
  inputIsVideo?: boolean;
  ffmpegPath?: string;
  ffprobePath?: string;
}

export function planCapCutVisualClipCommand(input: CapCutVisualClipInput): [string, string[]] {
  const ffmpegPath = input.ffmpegPath ?? "ffmpeg";
  const durationFrames = Math.max(1, Math.floor(input.durationFrames));
  return [ffmpegPath, [
    "-y",
    ...(input.inputIsVideo ? [] : ["-loop", "1"]),
    "-i", input.inputPath,
    ...(input.inputIsVideo ? ["-t", String(durationFrames / input.fps)] : ["-frames:v", String(durationFrames)]),
    "-vf", `scale=${input.width}:${input.height}:force_original_aspect_ratio=decrease,pad=${input.width}:${input.height}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
    "-r", String(input.fps),
    "-an",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    input.outputPath
  ]];
}

export async function prepareCapCutVisualClip(input: CapCutVisualClipInput): Promise<void> {
  if (!existsSync(input.inputPath)) throw new Error("CapCut visual source is missing.");
  const [command, args] = planCapCutVisualClipCommand(input);
  try {
    await mkdir(dirname(input.outputPath), { recursive: true });
    await execFileAsync(command, args, { encoding: "utf8", timeout: 5 * 60_000, windowsHide: true });
  } catch {
    throw new Error("FFmpeg could not prepare the CapCut visual clip.");
  }
  if (!existsSync(input.outputPath)) throw new Error("FFmpeg did not create the CapCut visual clip.");
  await validateCapCutVisualClip(input);
}

export async function validateCapCutVisualClip(input: CapCutVisualClipInput): Promise<void> {
  const ffprobePath = input.ffprobePath ?? "ffprobe";
  try {
    const { stdout } = await execFileAsync(ffprobePath, [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=codec_name,width,height,pix_fmt,r_frame_rate,nb_frames",
      "-show_entries", "format=duration",
      "-of", "json",
      input.outputPath
    ], { encoding: "utf8", timeout: 30_000, windowsHide: true });
    const payload = JSON.parse(stdout) as {
      streams?: Array<{ codec_name?: string; width?: number; height?: number; pix_fmt?: string; r_frame_rate?: string; nb_frames?: string }>;
      format?: { duration?: string };
    };
    const stream = payload.streams?.[0];
    const [numerator, denominator] = stream?.r_frame_rate?.split("/").map(Number) ?? [];
    const fps = numerator && denominator ? numerator / denominator : Number.NaN;
    const duration = Number(payload.format?.duration);
    const expectedDuration = input.durationFrames / input.fps;
    const frameCount = Number(stream?.nb_frames);
    if (!stream || stream.codec_name !== "h264" || stream.width !== input.width || stream.height !== input.height || stream.pix_fmt !== "yuv420p" || !Number.isFinite(fps) || Math.abs(fps - input.fps) > 0.01 || !Number.isFinite(duration) || Math.abs(duration - expectedDuration) > 0.2 || (Number.isFinite(frameCount) && Math.abs(frameCount - input.durationFrames) > 1)) throw new Error("invalid CapCut visual media");
  } catch {
    throw new Error("CapCut visual clip failed media validation.");
  }
}
