import { describe, expect, it } from "vitest";
import { validateAssetConcepts, type AssetConcept } from "../src";

function concept(id: string, shotId = "shot-1"): AssetConcept {
  return {
    id,
    shotId,
    semanticBeat: "Cash accumulates",
    kind: "object",
    role: "Money stack",
    description: "A stack of notes grows as money enters the account.",
    visualConstraints: ["clean silhouette"],
    colorPalette: ["green", "amber"],
    motionIntent: "rise with the cash flow",
    needsReferenceImage: false
  };
}

describe("asset concepts", () => {
  it("validates unique concepts mapped to existing shots", () => {
    expect(validateAssetConcepts([concept("asset-1")], new Set(["shot-1"]))).toHaveLength(1);
    expect(() => validateAssetConcepts([concept("asset-1")], new Set(["shot-2"]))).toThrow(/unknown shot/);
    expect(() => validateAssetConcepts([concept("asset-1"), concept("asset-1")], new Set(["shot-1"]))).toThrow(/unique/);
    expect(() => validateAssetConcepts([concept("asset-1"), concept("asset-2")], new Set(["shot-1", "shot-2"]))).toThrow(/one-to-one/);
  });

  it("rejects concepts without semantic content", () => {
    expect(() => validateAssetConcepts([{ ...concept("asset-1"), semanticBeat: "" }], new Set(["shot-1"]))).toThrow(/semantic content/);
  });
});
