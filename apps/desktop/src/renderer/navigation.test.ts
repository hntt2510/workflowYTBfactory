import { describe, expect, it } from "vitest";
import { allRoutes, projectRoutes, routeLabel, workspaceRoutes } from "./navigation";

describe("renderer navigation model", () => {
  it("exposes required workspace screens", () => {
    expect(workspaceRoutes.map((route) => route.id)).toEqual([
      "dashboard",
      "projects",
      "channel-profiles",
      "production-queue",
      "asset-library",
      "providers",
      "settings",
      "diagnostics"
    ]);
  });

  it("marks project workflow routes as project-scoped", () => {
    expect(projectRoutes.every((route) => route.requiresProject)).toBe(true);
    expect(projectRoutes.map((route) => route.id)).toContain("reference-intake");
    expect(projectRoutes.map((route) => route.id)).toContain("competitor-dna");
    expect(projectRoutes.map((route) => route.id)).toContain("shots");
    expect(projectRoutes.map((route) => route.id)).toContain("export");
  });

  it("labels every route", () => {
    for (const route of allRoutes) {
      expect(routeLabel(route.id)).toBe(route.label);
    }
  });
});
