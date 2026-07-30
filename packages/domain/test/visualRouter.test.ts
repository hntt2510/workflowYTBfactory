import { describe, expect, it } from "vitest";
import { applyVisualRouting } from "../src/visualRouter";
import type { Shot } from "../src/types";

function shot(overrides: Partial<Shot>): Shot { return { id: "shot-1", sceneId: "scene-1", order: 0, startFrame: 0, durationFrames: 30, fps: 30, purpose: "Illustrate", visualMode: "ai_image", framing: "Close", cameraAngle: "Eye level", cameraMovement: "Static", subjectAction: "Reveal", startState: {}, endState: {}, continuityRefs: [], ...overrides }; }

describe("visual router", () => {
  it("prioritizes approved assets and evidence shots over generated images", () => { expect(applyVisualRouting([shot({ approvedAssetId: "asset-1" }), shot({ id: "shot-2", purpose: "Quote from source" })]).map((item) => item.visualMode)).toEqual(["reuse", "document"]); });
  it("uses stock video for long motion shots", () => { expect(applyVisualRouting([shot({ durationFrames: 361 })])[0]?.visualMode).toBe("stock_video"); });
});
