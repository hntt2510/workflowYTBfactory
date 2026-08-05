import { describe, expect, it } from "vitest";
import { imageBudgetForDuration, maxAiImagesPerMinute, selectMotionEffect, visualMotionEffects } from "../src";

describe("motion routing", () => {
  it("selects an upward effect for cash-flow accumulation", () => {
    expect(selectMotionEffect({ assetRole: "cash flow stack", subjectAction: "increase" }).effect).toBe("slide_up");
  });

  it("keeps automatic effects inside the V1 catalog", () => {
    expect(visualMotionEffects).toContain(selectMotionEffect({ purpose: "explain a chart" }).effect);
    expect(maxAiImagesPerMinute).toBe(20);
    expect(imageBudgetForDuration(60)).toBe(20);
  });
});
