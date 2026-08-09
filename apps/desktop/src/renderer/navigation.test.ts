import { describe, expect, it } from "vitest";
import { allRoutes, routeHandlerIntent, routeLabel, routeRegistry, sidebarRouteGroups } from "./navigation";

describe("renderer audit navigation registry", () => {
  it("registers every reachable route exactly once with an intentional handler", () => {
    const expected = ["dashboard", "projects", "create", "new-project", "project-overview", "content", "reference-intake", "competitor-dna", "idea-lab", "script", "director", "scenes", "shots", "visuals", "assets", "scene-review", "build", "voice", "timeline", "qa", "final-preview", "export", "production", "production-queue", "asset-library", "channel-profiles", "providers", "settings", "diagnostics", "advanced-pipeline"];
    expect(routeRegistry.map((route) => route.id).sort()).toEqual(expected.sort());
    expect(new Set(routeRegistry.map((route) => route.id)).size).toBe(expected.length);
    expect(Object.keys(routeHandlerIntent).sort()).toEqual(expected.sort());
  });

  it("keeps the primary sidebar app-level while retaining compatibility routes in the registry", () => {
    const sidebarIds = sidebarRouteGroups.flatMap((group) => group.items.map((route) => route.id));
    expect(sidebarIds.sort()).toEqual(["dashboard", "projects", "create", "channel-profiles", "asset-library", "providers", "settings"].sort());
    expect(sidebarRouteGroups.flatMap((group) => group.items).filter((route) => route.requiresProject)).toHaveLength(0);
    expect(allRoutes.some((route) => route.id === "reference-intake")).toBe(true);
    expect(sidebarRouteGroups.flatMap((group) => group.items).find((route) => route.id === "providers")?.label).toContain("Cockpit");
  });

  it("labels every route from the same registry", () => {
    for (const route of allRoutes) expect(routeLabel(route.id)).toBe(route.label);
  });
});
