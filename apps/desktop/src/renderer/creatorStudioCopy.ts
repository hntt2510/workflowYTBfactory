import type { RouteId } from "./navigation";

export const creatorPhaseDefinitions = [
  { id: "brief", label: "Brief", route: "project-overview" as RouteId, stageIds: ["project-setup"] },
  { id: "story", label: "Story", route: "script" as RouteId, stageIds: ["idea-lab", "research-source-intake", "claim-map", "outline", "script", "fact-review", "retention-review"] },
  { id: "director", label: "Director", route: "scenes" as RouteId, stageIds: ["scene-plan", "shot-plan", "visual-routing"] },
  { id: "assets", label: "Assets", route: "visuals" as RouteId, stageIds: ["character-preparation", "asset-concepts", "prompt-preparation", "asset-acquisition", "asset-review"] },
  { id: "build", label: "Build", route: "timeline" as RouteId, stageIds: ["voice-generation", "subtitle-preparation", "timeline-assembly", "preview-render", "qa", "packaging-export"] }
] as const;

const routeLabels: Partial<Record<RouteId, string>> = {
  dashboard: "Home",
  projects: "Dự án",
  create: "Tạo dự án",
  "new-project": "Tạo dự án",
  "project-overview": "Tổng quan dự án",
  "final-preview": "Xem video",
  export: "Xuất video",
  "channel-profiles": "Nhân vật & kênh",
  "reference-intake": "Tài liệu tham khảo",
  "competitor-dna": "Phân tích tham khảo",
  "idea-lab": "Ý tưởng",
  script: "Kịch bản",
  scenes: "Cảnh",
  shots: "Storyboard",
  visuals: "Prompt & Assets",
  voice: "Giọng đọc",
  timeline: "Dựng video",
  qa: "Kiểm tra cuối",
  "production-queue": "Đang chạy",
  "asset-library": "Thư viện asset",
  providers: "Provider",
  settings: "Cài đặt",
  diagnostics: "Chẩn đoán",
  "advanced-pipeline": "Pipeline nâng cao",
  production: "Sản xuất",
  "scene-review": "Duyệt cảnh"
};

const statusLabels: Record<string, string> = {
  not_started: "Chưa bắt đầu",
  blocked: "Đang chờ bước trước",
  ready: "Sẵn sàng",
  queued: "Đang xếp hàng",
  running: "Đang xử lý",
  needs_review: "Chờ bạn duyệt",
  needs_attention: "Cần xử lý",
  approved: "Đã duyệt",
  rejected: "Đã từ chối",
  failed: "Có lỗi",
  stale: "Cần cập nhật",
  complete: "Hoàn tất",
  current: "Đang làm",
  optional: "Tuỳ chọn",
  not_applicable: "Không dùng"
};

export function creatorRouteLabel(route: RouteId): string {
  return routeLabels[route] ?? route;
}

export function creatorStatusLabel(status: string): string {
  return statusLabels[status] ?? status;
}

export function creatorPhaseStateLabel(state: string): string {
  return statusLabels[state] ?? state;
}
