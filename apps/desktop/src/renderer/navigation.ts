export type RouteId =
  | "dashboard"
  | "projects"
  | "new-project"
  | "project-overview"
  | "channel-profiles"
  | "idea-lab"
  | "research-claims"
  | "script"
  | "scenes"
  | "shots"
  | "visuals"
  | "voice"
  | "timeline"
  | "qa"
  | "export"
  | "production-queue"
  | "asset-library"
  | "providers"
  | "settings"
  | "diagnostics";

export interface NavItem {
  id: RouteId;
  label: string;
  requiresProject?: boolean;
}

export const workspaceRoutes: NavItem[] = [
  { id: "dashboard", label: "Overview" },
  { id: "projects", label: "Projects" },
  { id: "channel-profiles", label: "Channel Profiles" },
  { id: "production-queue", label: "Production Queue" },
  { id: "asset-library", label: "Asset Library" },
  { id: "providers", label: "Providers" },
  { id: "settings", label: "Settings" },
  { id: "diagnostics", label: "Diagnostics" }
];

export const projectRoutes: NavItem[] = [
  { id: "project-overview", label: "Project Overview", requiresProject: true },
  { id: "idea-lab", label: "Idea Lab", requiresProject: true },
  { id: "research-claims", label: "Research & Claims", requiresProject: true },
  { id: "script", label: "Script", requiresProject: true },
  { id: "scenes", label: "Scenes", requiresProject: true },
  { id: "shots", label: "Shots", requiresProject: true },
  { id: "visuals", label: "Visuals", requiresProject: true },
  { id: "voice", label: "Voice", requiresProject: true },
  { id: "timeline", label: "Timeline", requiresProject: true },
  { id: "qa", label: "QA", requiresProject: true },
  { id: "export", label: "Export", requiresProject: true }
];

export const allRoutes = [...workspaceRoutes, { id: "new-project", label: "New Project" } satisfies NavItem, ...projectRoutes];

export function routeLabel(route: RouteId): string {
  return allRoutes.find((item) => item.id === route)?.label ?? "Overview";
}

