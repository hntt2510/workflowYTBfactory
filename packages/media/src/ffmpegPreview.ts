import type { Timeline } from "@lsf/domain";

export function planFfmpegPreviewCommand(input: {
  ffmpegPath?: string;
  timeline: Timeline;
  outputPath: string;
  resolution: "1080p-horizontal" | "1080p-vertical";
}): string[] {
  const size = input.resolution === "1080p-horizontal" ? "1920x1080" : "1080x1920";
  return [
    input.ffmpegPath ?? "ffmpeg",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=black:s=${size}:r=${input.timeline.fps}`,
    "-t",
    String(totalFrames(input.timeline) / input.timeline.fps),
    input.outputPath
  ];
}

function totalFrames(timeline: Timeline): number {
  return timeline.items.reduce((max, item) => Math.max(max, item.startFrame + item.durationFrames), 0);
}

