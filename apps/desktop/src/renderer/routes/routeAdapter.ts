import { allRoutes, type RouteId } from "../navigation";
import { getWorkflowStageDefinition } from "@lsf/domain";

const legacyRouteAliases: Record<string, RouteId> = {
  "new-project": "create"
};
const legacyStageRoutes: Record<string, RouteId> = {
  "reference-validation": "reference-intake", "transcript-cleaning": "reference-intake", "reference-segmentation": "reference-intake",
  "competitor-dna": "idea-lab", "opportunity-map": "idea-lab", "originality-review": "idea-lab",
  "outline": "script", "fact-review": "script", "retention-review": "script", "visual-routing": "shots",
  "character-preparation": "assets", "asset-concepts": "assets", "asset-acquisition": "assets",
  "voice-generation": "voice", "subtitle-preparation": "timeline", "timeline-assembly": "timeline",
  "preview-render": "final-preview", "qa": "qa", "capcut-draft": "export", "packaging-export": "export"
};

export function routeFromHash(hash = window.location.hash): RouteId {
  const rawRoute = hash.replace(/^#/, "");
  const aliasedRoute = legacyRouteAliases[rawRoute] ?? rawRoute;
  return allRoutes.some((route) => route.id === aliasedRoute) ? aliasedRoute as RouteId : "dashboard";
}

export function canonicalRoute(route: RouteId): RouteId {
  return legacyRouteAliases[route] ?? route;
}

export function routeForStage(stageId?: string): RouteId {
  const stage = stageId?.trim().toLowerCase() ?? "";
  if (!stage) return "project-overview";
  const route = getWorkflowStageDefinition(stage)?.screenRoute;
  if (route && allRoutes.some((item) => item.id === route)) return route as RouteId;
  if (legacyStageRoutes[stage]) return legacyStageRoutes[stage];
  return "project-overview";
}
