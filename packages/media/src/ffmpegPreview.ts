import type { Timeline } from "@lsf/domain";

export function planFfmpegPreviewCommand(input: {
  ffmpegPath?: string;
  timeline: Timeline;
  outputPath: string;
  resolution: "1080p-horizontal" | "1080p-vertical";
  visualInputs: Array<{ filePath: string; startFrame: number; durationFrames: number }>;
  audioInputs: Array<{ filePath: string }>;
}): string[] {
  if (input.visualInputs.length === 0 || input.audioInputs.length === 0) throw new Error("A preview requires real approved visual and audio inputs.");
  const size = input.resolution === "1080p-horizontal" ? "1920x1080" : "1080x1920";
  const visuals = [...input.visualInputs].sort((a, b) => a.startFrame - b.startFrame);
  let expectedStart = 0;
  for (const visual of visuals) {
    if (!visual.filePath || visual.durationFrames <= 0 || visual.startFrame !== expectedStart) throw new Error("Approved visuals must provide a contiguous primary track.");
    expectedStart += visual.durationFrames;
  }
  if (expectedStart !== totalFrames(input.timeline)) throw new Error("Visual inputs do not cover the approved timeline.");
  const args = [input.ffmpegPath ?? "ffmpeg", "-y"];
  for (const visual of visuals) args.push("-loop", "1", "-framerate", String(input.timeline.fps), "-t", String(visual.durationFrames / input.timeline.fps), "-i", visual.filePath);
  for (const audio of input.audioInputs) args.push("-i", audio.filePath);
  const videoFilters = visuals.map((_, index) => `[${index}:v]scale=${size}:force_original_aspect_ratio=decrease,pad=${size}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${index}]`).join(";");
  const videoConcat = visuals.map((_, index) => `[v${index}]`).join("") + `concat=n=${visuals.length}:v=1:a=0[v]`;
  const audioOffset = visuals.length;
  const audioConcat = input.audioInputs.map((_, index) => `[${audioOffset + index}:a]`).join("") + `concat=n=${input.audioInputs.length}:v=0:a=1[a]`;
  return [...args, "-filter_complex", `${videoFilters};${videoConcat};${audioConcat}`, "-map", "[v]", "-map", "[a]", "-shortest", "-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart", input.outputPath];
}

function totalFrames(timeline: Timeline): number {
  return timeline.items.reduce((max, item) => Math.max(max, item.startFrame + item.durationFrames), 0);
}
