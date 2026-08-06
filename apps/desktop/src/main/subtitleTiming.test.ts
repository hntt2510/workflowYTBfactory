import { describe, expect, it } from "vitest";
import { createWordLevelSubtitleCues } from "./subtitleTiming";

describe("word-level subtitle timing", () => {
  it("creates one positive-duration cue per word and ends at the section boundary", () => {
    const cues = createWordLevelSubtitleCues({ sectionId: "section-1", narration: "Xin ch\u00e0o Vi\u1ec7t Nam", startFrame: 10, durationFrames: 30 });

    expect(cues.map((cue) => cue.text)).toEqual(["Xin", "ch\u00e0o", "Vi\u1ec7t", "Nam"]);
    expect(cues.every((cue) => cue.durationFrames > 0)).toBe(true);
    expect(cues[0]?.startFrame).toBe(10);
    expect(cues.at(-1)!.startFrame + cues.at(-1)!.durationFrames).toBe(40);
  });
});
