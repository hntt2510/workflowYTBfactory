import type { Timeline } from "@lsf/domain";

export function planFfmpegPreviewCommand(input: {
  ffmpegPath?: string;
  timeline: Timeline;
  outputPath: string;
  resolution: "1080p-horizontal" | "1080p-vertical";
  visualInputs: Array<{ filePath: string; startFrame: number; durationFrames: number }>;
  audioInputs: Array<{ filePath: string; startFrame?: number }>;
  subtitleFilePath?: string;
}): string[] {
  if (input.visualInputs.length === 0 || input.audioInputs.length === 0) throw new Error("A preview requires real approved visual and audio inputs.");
  const [width, height] = input.resolution === "1080p-horizontal" ? [1920, 1080] : [1080, 1920];
  const size = `${width}x${height}`;
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
  const videoFilters = visuals.map((_, index) => `[${index}:v]scale=${size}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${index}]`).join(";");
  const videoConcat = visuals.map((_, index) => `[v${index}]`).join("") + `concat=n=${visuals.length}:v=1:a=0[v]`;
  const audioOffset = visuals.length;
  const audioFilters = input.audioInputs.map((audio, index) => {
    const delayMs = Math.max(0, Math.round((audio.startFrame ?? 0) * 1000 / input.timeline.fps));
    return `[${audioOffset + index}:a]adelay=${delayMs}:all=1[a${index}]`;
  }).join(";");
  const audioMix = input.audioInputs.map((_, index) => `[a${index}]`).join("") + `amix=inputs=${input.audioInputs.length}:duration=longest:dropout_transition=0[a]`;
  const outputVideoLabel = input.subtitleFilePath ? "vs" : "v";
  const subtitleFilter = input.subtitleFilePath
    ? `[v]subtitles='${escapeSubtitlePath(input.subtitleFilePath)}':charenc=UTF-8:force_style='FontName=Arial,FontSize=20,Outline=2,Shadow=1,Alignment=2'[vs]`
    : "";
  const filters = [videoFilters, videoConcat, subtitleFilter, audioFilters, audioMix].filter(Boolean).join(";");
  return [...args, "-filter_complex", filters, "-map", `[${outputVideoLabel}]`, "-map", "[a]", "-shortest", "-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart", input.outputPath];
}

function escapeSubtitlePath(filePath: string): string {
  return filePath.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "'\\''");
}

function totalFrames(timeline: Timeline): number {
  return timeline.items.reduce((max, item) => Math.max(max, item.startFrame + item.durationFrames), 0);
}
