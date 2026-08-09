import { describe, expect, it } from "vitest";
import { canonicalRoute, routeForStage, routeFromHash } from "./routeAdapter";

describe("creator route adapter", () => {
  it("keeps both project creation screens addressable for the UI audit", () => {
    expect(routeFromHash("#new-project")).toBe("new-project");
    expect(canonicalRoute("new-project")).toBe("new-project");
  });

  it("opens a project at the visible phase for its current stage", () => {
    expect(routeForStage("script")).toBe("script");
    expect(routeForStage("reference-validation")).toBe("reference-intake");
    expect(routeForStage("asset-review")).toBe("assets");
    expect(routeForStage("preview-render")).toBe("final-preview");
    expect(routeForStage()).toBe("project-overview");
  });
});
