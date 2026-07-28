import { describe, expect, it } from "vitest";
import { framesToMicroseconds, framesToTimecode, timecodeToFrames } from "../src";

describe("30 FPS timecode", () => {
  it("rolls 00:00:02:29 to 00:00:03:00 on next frame", () => {
    expect(framesToTimecode(89)).toBe("00:00:02:29");
    expect(framesToTimecode(90)).toBe("00:00:03:00");
  });

  it("round trips frames", () => {
    expect(timecodeToFrames("00:01:02:15")).toBe(1875);
    expect(framesToTimecode(1875)).toBe("00:01:02:15");
  });

  it("converts frames to CapCut microseconds only at adapter boundary", () => {
    expect(framesToMicroseconds(30)).toBe(1_000_000);
  });
});

