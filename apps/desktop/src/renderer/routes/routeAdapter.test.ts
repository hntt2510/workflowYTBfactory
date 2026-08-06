import { describe, expect, it } from "vitest";
import { canonicalRoute, routeForStage, routeFromHash } from "./routeAdapter";

describe("creator route adapter", () => {
  it("redirects legacy project creation hashes to the canonical wizard", () => {
    expect(routeFromHash("#new-project")).toBe("create");
    expect(canonicalRoute("new-project")).toBe("create");
  });

  it("opens a project at the visible phase for its current stage", () => {
    expect(routeForStage("script")).toBe("script");
    expect(routeForStage("reference-validation")).toBe("reference-intake");
    expect(routeForStage("character-preparation")).toBe("channel-profiles");
    expect(routeForStage("asset-review")).toBe("assets");
    expect(routeForStage("preview-render")).toBe("final-preview");
    expect(routeForStage()).toBe("final-preview");
  });
});
