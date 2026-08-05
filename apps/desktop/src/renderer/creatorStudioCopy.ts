import type { RouteId } from "./navigation";

export const workflowModeOptions: Array<{ value: "guided" | "semi_automatic" | "full_automatic"; label: string; detail: string }> = [
  { value: "guided", label: "Advanced guided", detail: "Expose every internal stage for debugging." },
  { value: "semi_automatic", label: "Simple production", detail: "Runs valid internal stages automatically and pauses only at user checkpoints." },
  { value: "full_automatic", label: "Full automatic", detail: "Not implemented yet; use Guided mode for manual execution." }
];

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
  draft: "Bản nháp",
  preparing: "Đang chuẩn bị",
  waiting_for_idea: "Chờ chọn ý tưởng",
  needs_scene_review: "Chờ duyệt cảnh",
  generating_media: "Đang chuẩn bị hình ảnh",
  generating_voice: "Đang tạo giọng đọc",
  rendering_preview: "Đang dựng bản xem trước",
  needs_final_review: "Chờ duyệt bản xem trước",
  exporting: "Đang xuất video",
  completed: "Hoàn tất",
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
  not_applicable: "Không dùng",
  supported: "Đạt",
  needs_qualification: "Cần nêu rõ",
  pass: "Đạt",
  needs_changes: "Cần chỉnh sửa",
  low: "Thấp",
  medium: "Vừa",
  high: "Cao",
  blocking: "Chặn",
  warning: "Cảnh báo",
  DEPENDENCY_NOT_APPROVED: "Chưa duyệt bước trước",
  DEPENDENCY_CHAIN_NOT_APPROVED: "Chuỗi bước trước chưa hoàn tất",
  CHARACTER_VERSION_NOT_APPROVED: "Chưa duyệt nhân vật",
  NO_INCLUDED_REFERENCES: "Chưa có tài liệu tham khảo",
  UNRESOLVED_DUPLICATES: "Có tài liệu trùng cần xử lý",
  INVALID_INCLUDED_REFERENCES: "Tài liệu tham khảo chưa hợp lệ",
  REFERENCE_SET_NOT_APPROVED: "Chưa duyệt bộ tài liệu tham khảo",
  TEXT_MODEL_NOT_VERIFIED: "Chưa xác minh model chữ",
  IMAGE_MODEL_NOT_VERIFIED: "Chưa xác minh model hình ảnh",
  VIDEO_MODEL_NOT_VERIFIED: "Chưa xác minh model video",
  AUDIO_MODEL_NOT_VERIFIED: "Chưa xác minh model âm thanh"
};

export function creatorRouteLabel(route: RouteId): string {
  return routeLabels[route] ?? route;
}

export function creatorStatusLabel(status: string): string {
  return statusLabels[status] ?? "Trạng thái chưa xác định";
}

export function creatorPhaseStateLabel(state: string): string {
  return statusLabels[state] ?? "Trạng thái chưa xác định";
}

export function creatorInputModeLabel(inputMode: string): string {
  return ({ topic: "Chủ đề", existing_script: "Kịch bản có sẵn", reference: "Tài liệu tham khảo" } as Record<string, string>)[inputMode] ?? "Khác";
}
