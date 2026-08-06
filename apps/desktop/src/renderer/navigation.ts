export type RouteId =
  | "content"
  | "director"
  | "assets"
  | "build"
  | "projects"
  | "create"
  | "production"
  | "scene-review"
  | "final-preview"
  | "export"
  | "settings"
  | "diagnostics"
  | "dashboard"
  | "channels"
  | "new-project"
  | "project-overview"
  | "channel-profiles"
  | "reference-intake"
  | "competitor-dna"
  | "idea-lab"
  | "script"
  | "scenes"
  | "shots"
  | "visuals"
  | "voice"
  | "timeline"
  | "qa"
  | "production-queue"
  | "asset-library"
  | "providers"
  | "advanced-pipeline";

export interface NavItem {
  id: RouteId;
  label: string;
  requiresProject?: boolean;
}

export const workspaceRoutes: NavItem[] = [
  { id: "dashboard", label: "Home" },
  { id: "projects", label: "Projects" },
  { id: "channels", label: "Channels" },
  { id: "asset-library", label: "Asset Library" },
  { id: "settings", label: "Settings" }
];

export const creatorWorkspaceRoutes: NavItem[] = [
  { id: "content", label: "Nội dung", requiresProject: true },
  { id: "director", label: "Đạo diễn", requiresProject: true },
  { id: "assets", label: "Hình ảnh", requiresProject: true },
  { id: "build", label: "Dựng video", requiresProject: true }
];

export const projectRoutes: NavItem[] = [
  { id: "project-overview", label: "Project Diagnostic", requiresProject: true },
  { id: "final-preview", label: "Final Preview", requiresProject: true },
  { id: "export", label: "Export", requiresProject: true }
];

export const advancedRoutes: NavItem[] = [
  { id: "advanced-pipeline", label: "Advanced Pipeline Details", requiresProject: true },
  { id: "reference-intake", label: "Reference Intake", requiresProject: true },
  { id: "competitor-dna", label: "Competitor DNA", requiresProject: true },
  { id: "idea-lab", label: "Idea Lab", requiresProject: true },
  { id: "script", label: "Script", requiresProject: true },
  { id: "scenes", label: "Scenes", requiresProject: true },
  { id: "shots", label: "Shots", requiresProject: true },
  { id: "visuals", label: "Visuals", requiresProject: true },
  { id: "voice", label: "Voice", requiresProject: true },
  { id: "timeline", label: "Timeline", requiresProject: true },
  { id: "qa", label: "QA", requiresProject: true },
  { id: "production-queue", label: "Production Queue" },
  { id: "providers", label: "Providers" }
];

export const allRoutes = [
  ...workspaceRoutes,
  ...creatorWorkspaceRoutes,
  { id: "create", label: "Tạo dự án" } satisfies NavItem,
  { id: "new-project", label: "New Project" } satisfies NavItem,
  { id: "scene-review", label: "Duyệt cảnh", requiresProject: true } satisfies NavItem,
  ...projectRoutes,
  ...advancedRoutes
];

export function routeLabel(route: RouteId): string {
  return allRoutes.find((item) => item.id === route)?.label ?? "Tổng quan";
}
