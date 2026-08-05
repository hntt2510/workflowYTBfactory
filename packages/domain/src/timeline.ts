import type { Shot, Timeline } from "./types";

export function assembleTimeline(shots: Shot[], fps = 30): Timeline {
  return {
    fps,
    items: shots.map((shot) => ({
      id: `timeline-${shot.id}`,
      track: "primary_visual",
      sourceId: shot.approvedAssetId ?? shot.id,
      startFrame: shot.startFrame,
      durationFrames: shot.durationFrames,
      fps,
      ...(shot.motion ? { motion: shot.motion } : {})
    }))
  };
}
