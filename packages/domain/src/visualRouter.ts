import type { Shot } from "./types";
import type { ChannelDna, ChannelStyleId } from "./channelDna";

export interface VisualRoutingOptions {
  visualStyle?: "vox-documentary" | ChannelStyleId;
  channelDna?: ChannelDna;
}

export function routeShotVisual(shot: Shot): Shot["visualMode"] {
  if (shot.approvedAssetId) {
    return "reuse";
  }
  if (/quote|filing|source|document/i.test(shot.purpose)) {
    return "document";
  }
  if (/diagram|explain|timeline/i.test(shot.purpose)) {
    return "diagram";
  }
  if (shot.durationFrames > shot.fps * 12) {
    return "stock_video";
  }
  return "ai_image";
}

export function applyVisualRouting(shots: Shot[], options: VisualRoutingOptions = {}): Shot[] {
  return shots.map((shot) => ({
    ...shot,
    visualMode: options.visualStyle === "vox-documentary" || options.channelDna?.visualStyle.styleId === "editorial-explainer" || options.channelDna?.visualStyle.styleId === "minimal-infographic"
      ? (shot.approvedAssetId ? "reuse" : /diagram|chart|timeline|explain/i.test(shot.purpose) ? "diagram" : "ai_image")
      : routeShotVisual(shot)
  }));
}
