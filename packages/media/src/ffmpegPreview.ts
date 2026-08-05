import type { ShotMotionPlan, SubtitlePreset, Timeline } from "@lsf/domain";

export type PreviewResolution = "1080p-horizontal" | "1080p-vertical" | "1080p-square" | "720p-horizontal" | "720p-vertical" | "720p-square";

export function planFfmpegPreviewCommand(input: {
  ffmpegPath?: string;
  timeline: Timeline;
  outputPath: string;
  resolution: PreviewResolution;
  visualInputs: Array<{ filePath: string; startFrame: number; durationFrames: number; motion?: ShotMotionPlan | undefined }>;
  audioInputs: Array<{ filePath: string; startFrame?: number; durationFrames?: number; kind?: "narration" | "music" | "ambient" | "sfx"; volume?: number; loop?: boolean }>;
  subtitleFilePath?: string;
  subtitlePreset?: SubtitlePreset;
}): string[] {
  if (input.visualInputs.length === 0 || input.audioInputs.length === 0) throw new Error("A preview requires real approved visual and audio inputs.");
  const [width, height] = resolutionSize(input.resolution);
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
  for (const audio of input.audioInputs) {
    if (audio.loop) args.push("-stream_loop", "-1");
    args.push("-i", audio.filePath);
  }
  const videoFilters = visuals.map((visual, index) => `[${index}:v]${motionFilter(visual.motion, width, height, size, input.timeline.fps)}[v${index}]`).join(";");
  const videoConcat = visuals.map((_, index) => `[v${index}]`).join("") + `concat=n=${visuals.length}:v=1:a=0[v]`;
  const audioOffset = visuals.length;
  const timelineDurationFrames = totalFrames(input.timeline);
  const audioFilters = input.audioInputs.map((audio, index) => {
    const delayMs = Math.max(0, Math.round((audio.startFrame ?? 0) * 1000 / input.timeline.fps));
    const durationSeconds = Math.max(1 / input.timeline.fps, (audio.durationFrames ?? timelineDurationFrames) / input.timeline.fps);
    const volume = Math.max(0, Math.min(2, audio.volume ?? 1));
    return `[${audioOffset + index}:a]aresample=async=1,atrim=duration=${durationSeconds.toFixed(6)},asetpts=PTS-STARTPTS,volume=${volume.toFixed(3)},adelay=${delayMs}:all=1[a${index}]`;
  }).join(";");
  const filterParts = [audioFilters];
  const narrationLabels = input.audioInputs.flatMap((audio, index) => (audio.kind ?? "narration") === "narration" ? [`[a${index}]`] : []);
  const bedLabels = input.audioInputs.flatMap((audio, index) => (audio.kind ?? "narration") === "music" || (audio.kind ?? "narration") === "ambient" ? [`[a${index}]`] : []);
  const sfxLabels = input.audioInputs.flatMap((audio, index) => (audio.kind ?? "narration") === "sfx" ? [`[a${index}]`] : []);
  const group = (labels: string[], name: string): string | undefined => {
    if (!labels.length) return undefined;
    if (labels.length === 1) {
      filterParts.push(`${labels[0]}anull[${name}]`);
    } else {
      filterParts.push(`${labels.join("")}amix=inputs=${labels.length}:duration=longest:dropout_transition=0[${name}]`);
    }
    return `[${name}]`;
  };
  const narrationLabel = group(narrationLabels, "narration_mix");
  const bedLabel = group(bedLabels, "bed_mix");
  const sfxLabel = group(sfxLabels, "sfx_mix");
  let finalBedLabel = bedLabel;
  if (bedLabel && narrationLabel) {
    filterParts.push(`${bedLabel}${narrationLabel}sidechaincompress=threshold=0.04:ratio=8:attack=20:release=300:makeup=1[ducked_bed]`);
    finalBedLabel = "[ducked_bed]";
  }
  const mixedLabels = [narrationLabel, finalBedLabel, sfxLabel].filter((label): label is string => Boolean(label));
  const audioMix = `${mixedLabels.join("")}amix=inputs=${mixedLabels.length}:duration=longest:dropout_transition=0[a]`;
  filterParts.push(audioMix);
  const outputVideoLabel = input.subtitleFilePath ? "vs" : "v";
  const subtitleFilter = input.subtitleFilePath
    ? `[v]subtitles='${escapeSubtitlePath(input.subtitleFilePath)}':charenc=UTF-8:force_style='${subtitleStyle(input.subtitlePreset ?? "vox-clean")}'[vs]`
    : "";
  const filters = [videoFilters, videoConcat, subtitleFilter, ...filterParts].filter(Boolean).join(";");
  return [...args, "-filter_complex", filters, "-map", `[${outputVideoLabel}]`, "-map", "[a]", "-shortest", "-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart", input.outputPath];
}

function motionFilter(motion: ShotMotionPlan | undefined, width: number, height: number, size: string, fps: number): string {
  const effect = motion?.effect ?? "none";
  const base = `scale=${size}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
  if (effect === "dissolve") return `${base},fade=t=in:st=0:d=0.18`;
  if (effect === "zoom_in" || effect === "zoom_out" || effect === "pop") {
    const expression = effect === "zoom_out" ? "if(lte(zoom,1.0),1.16,max(1.0,zoom-0.002))" : effect === "pop" ? "if(lte(zoom,1.0),1.16,zoom-0.006)" : "min(zoom+0.002,1.16)";
    return `${base},zoompan=z='${expression}':d=1:s=${size}:fps=${fps}`;
  }
  if (effect === "slide_up") return `scale=${Math.round(width * 1.12)}:${Math.round(height * 1.12)},crop=${width}:${height}:0:'(ih-oh)*0.8',setsar=1`;
  if (effect === "slide_down") return `scale=${Math.round(width * 1.12)}:${Math.round(height * 1.12)},crop=${width}:${height}:0:'(ih-oh)*0.2',setsar=1`;
  if (effect === "pan_left") return `scale=${Math.round(width * 1.12)}:${Math.round(height * 1.12)},crop=${width}:${height}:'(iw-ow)*0.8':0,setsar=1`;
  if (effect === "pan_right") return `scale=${Math.round(width * 1.12)}:${Math.round(height * 1.12)},crop=${width}:${height}:'(iw-ow)*0.2':0,setsar=1`;
  return base;
}

function escapeSubtitlePath(filePath: string): string {
  return filePath.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "'\\''");
}

function totalFrames(timeline: Timeline): number {
  return timeline.items.reduce((max, item) => Math.max(max, item.startFrame + item.durationFrames), 0);
}

function resolutionSize(resolution: PreviewResolution): [number, number] {
  if (resolution === "1080p-horizontal") return [1920, 1080];
  if (resolution === "1080p-vertical") return [1080, 1920];
  if (resolution === "1080p-square") return [1080, 1080];
  if (resolution === "720p-horizontal") return [1280, 720];
  if (resolution === "720p-vertical") return [720, 1280];
  return [720, 720];
}

function subtitleStyle(preset: SubtitlePreset): string {
  if (preset === "minimal") return "FontName=Arial,FontSize=18,Outline=1,Shadow=0,Alignment=5";
  if (preset === "high-contrast") return "FontName=Arial,FontSize=24,Outline=4,Shadow=2,Bold=1,Alignment=5";
  return "FontName=Arial,FontSize=20,Outline=2,Shadow=1,Alignment=5";
}
