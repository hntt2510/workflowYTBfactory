import { allRoutes, type RouteId } from "../navigation";

const legacyRouteAliases: Record<string, RouteId> = {
  "new-project": "create"
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
  if (!stage) return "final-preview";
  if (stage === "project-setup") return "project-overview";
  if (/reference/.test(stage)) return "reference-intake";
  if (/competitor|opportunity|idea|originality/.test(stage)) return "idea-lab";
  if (/outline|script|fact-review|retention/.test(stage)) return "script";
  if (stage === "scene-plan") return "scenes";
  if (/shot-plan|visual-routing/.test(stage)) return "shots";
  if (/character-preparation|asset-concepts|prompt-preparation|asset-acquisition|asset-review/.test(stage)) return "assets";
  if (stage === "voice-generation") return "voice";
  if (/subtitle-preparation|timeline-assembly/.test(stage)) return "timeline";
  if (stage === "preview-render") return "final-preview";
  if (stage === "qa") return "qa";
  if (/capcut|packaging-export/.test(stage)) return "export";
  return "project-overview";
}
