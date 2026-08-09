export type RouteId =
  | "dashboard" | "projects" | "create" | "new-project" | "project-overview" | "content"
  | "reference-intake" | "competitor-dna" | "idea-lab" | "script" | "director" | "scenes"
  | "shots" | "visuals" | "assets" | "scene-review" | "build" | "voice" | "timeline"
  | "qa" | "final-preview" | "export" | "production" | "production-queue" | "asset-library"
  | "channel-profiles" | "providers" | "settings" | "diagnostics" | "advanced-pipeline";

export type RouteGroup = "workspace" | "content" | "director" | "assets" | "build" | "system";

export interface RouteDefinition {
  id: RouteId;
  label: string;
  group: RouteGroup;
  requiresProject: boolean;
  visibility: "audit";
  legacy?: boolean;
}

export const routeRegistry: readonly RouteDefinition[] = [
  { id: "dashboard", label: "Trang chủ", group: "workspace", requiresProject: false, visibility: "audit" },
  { id: "projects", label: "Dự án", group: "workspace", requiresProject: false, visibility: "audit" },
  { id: "create", label: "Tạo dự án", group: "workspace", requiresProject: false, visibility: "audit" },
  { id: "new-project", label: "Trình tạo dự án nâng cao", group: "workspace", requiresProject: false, visibility: "audit", legacy: true },
  { id: "project-overview", label: "Tổng quan dự án", group: "workspace", requiresProject: true, visibility: "audit" },
  { id: "channel-profiles", label: "Hồ sơ kênh", group: "workspace", requiresProject: false, visibility: "audit" },
  { id: "asset-library", label: "Thư viện asset", group: "workspace", requiresProject: false, visibility: "audit" },
  { id: "content", label: "Nội dung", group: "content", requiresProject: true, visibility: "audit" },
  { id: "reference-intake", label: "Nguồn tham khảo", group: "content", requiresProject: true, visibility: "audit" },
  { id: "competitor-dna", label: "Phân tích đối thủ", group: "content", requiresProject: true, visibility: "audit" },
  { id: "idea-lab", label: "Ý tưởng", group: "content", requiresProject: true, visibility: "audit" },
  { id: "script", label: "Kịch bản", group: "content", requiresProject: true, visibility: "audit" },
  { id: "director", label: "Đạo diễn", group: "director", requiresProject: true, visibility: "audit" },
  { id: "scenes", label: "Cảnh", group: "director", requiresProject: true, visibility: "audit" },
  { id: "shots", label: "Storyboard / Shot", group: "director", requiresProject: true, visibility: "audit" },
  { id: "visuals", label: "Visual / Prompt Studio", group: "director", requiresProject: true, visibility: "audit" },
  { id: "assets", label: "Assets", group: "assets", requiresProject: true, visibility: "audit" },
  { id: "scene-review", label: "Duyệt cảnh", group: "assets", requiresProject: true, visibility: "audit" },
  { id: "build", label: "Dựng video", group: "build", requiresProject: true, visibility: "audit", legacy: true },
  { id: "voice", label: "Giọng đọc", group: "build", requiresProject: true, visibility: "audit", legacy: true },
  { id: "timeline", label: "Timeline", group: "build", requiresProject: true, visibility: "audit", legacy: true },
  { id: "qa", label: "QA", group: "build", requiresProject: true, visibility: "audit", legacy: true },
  { id: "final-preview", label: "Xem trước cuối", group: "build", requiresProject: true, visibility: "audit", legacy: true },
  { id: "export", label: "Xuất", group: "build", requiresProject: true, visibility: "audit", legacy: true },
  { id: "production", label: "Production", group: "build", requiresProject: true, visibility: "audit", legacy: true },
  { id: "production-queue", label: "Hàng đợi production", group: "build", requiresProject: false, visibility: "audit", legacy: true },
  { id: "advanced-pipeline", label: "Pipeline nâng cao", group: "build", requiresProject: true, visibility: "audit", legacy: true },
  { id: "providers", label: "Text Provider / Cockpit", group: "system", requiresProject: false, visibility: "audit" },
  { id: "settings", label: "Cài đặt", group: "system", requiresProject: false, visibility: "audit" },
  { id: "diagnostics", label: "Chẩn đoán", group: "system", requiresProject: false, visibility: "audit", legacy: true }
];

export const allRoutes = routeRegistry;
export const routeGroups: ReadonlyArray<{ id: RouteGroup; label: string }> = [
  { id: "workspace", label: "KHÔNG GIAN LÀM VIỆC" },
  { id: "content", label: "NỘI DUNG / CÂU CHUYỆN" },
  { id: "director", label: "ĐẠO DIỄN" },
  { id: "assets", label: "ASSETS" },
  { id: "build", label: "DỰNG / PRODUCTION KẾ THỪA" },
  { id: "system", label: "HỆ THỐNG" }
];
/** Primary creator navigation is deliberately app-level only. Stage routes remain hash-compatible tools. */
const primarySidebarRouteIds: readonly RouteId[] = ["dashboard", "projects", "create", "channel-profiles", "asset-library", "providers", "settings"];
export const sidebarRouteGroups = routeGroups.map((group) => ({ ...group, items: routeRegistry.filter((route) => route.group === group.id && primarySidebarRouteIds.includes(route.id)) })).filter((group) => group.items.length > 0);

/** Compatibility exports; all are derived from the single route registry. */
export const workspaceRoutes = routeRegistry.filter((route) => route.group === "workspace");
export const creatorWorkspaceRoutes = routeRegistry.filter((route) => ["content", "director", "assets", "build"].includes(route.group));
export const projectRoutes = routeRegistry.filter((route) => route.requiresProject && route.group === "workspace");
export const advancedRoutes = routeRegistry.filter((route) => route.legacy);

export function routeLabel(route: RouteId): string {
  return routeRegistry.find((item) => item.id === route)?.label ?? "Tuyến không khả dụng";
}

export function routeDefinition(route: RouteId): RouteDefinition {
  const definition = routeRegistry.find((item) => item.id === route);
  if (!definition) throw new Error(`Unknown route: ${route}`);
  return definition;
}

/** Intentional RouteScreen outcome for each registered route. */
export const routeHandlerIntent: Record<RouteId, "screen" | "alias" | "legacy"> = {
  dashboard: "screen", projects: "screen", create: "screen", "new-project": "screen", "project-overview": "alias", "channel-profiles": "screen", "asset-library": "screen",
  content: "alias", "reference-intake": "alias", "competitor-dna": "screen", "idea-lab": "alias", script: "alias",
  director: "alias", scenes: "alias", shots: "alias", visuals: "alias", assets: "alias", "scene-review": "screen",
  build: "alias", voice: "alias", timeline: "alias", qa: "alias", "final-preview": "screen", export: "screen", production: "legacy", "production-queue": "legacy", "advanced-pipeline": "legacy",
  providers: "screen", settings: "screen", diagnostics: "legacy"
};
