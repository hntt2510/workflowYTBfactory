import { describe, expect, it } from "vitest";
import { advancedRoutes, allRoutes, projectRoutes, routeLabel, workspaceRoutes } from "./navigation";

describe("renderer navigation model", () => {
  it("exposes required workspace screens", () => {
    expect(workspaceRoutes.map((route) => route.id)).toEqual([
      "dashboard",
      "projects",
      "asset-library",
      "settings"
    ]);
  });

  it("marks project workflow routes as project-scoped", () => {
    expect(projectRoutes.every((route) => route.requiresProject)).toBe(true);
    expect(projectRoutes.map((route) => route.id)).toEqual(["project-overview", "final-preview", "export"]);
    expect(advancedRoutes.map((route) => route.id)).toContain("advanced-pipeline");
    expect(advancedRoutes.map((route) => route.id)).toContain("reference-intake");
    expect(advancedRoutes.map((route) => route.id)).toContain("competitor-dna");
    expect(advancedRoutes.map((route) => route.id)).toContain("shots");
  });

  it("labels every route", () => {
    for (const route of allRoutes) {
      expect(routeLabel(route.id)).toBe(route.label);
    }
  });
});
