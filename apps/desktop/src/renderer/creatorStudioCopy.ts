import type { RouteId } from "./navigation";

export const workflowModeOptions: Array<{ value: "guided" | "semi_automatic" | "full_automatic"; label: string; detail: string }> = [
  { value: "guided", label: "Có hướng dẫn", detail: "Hiển thị từng bước nội bộ khi bạn cần kiểm tra chi tiết." },
  { value: "semi_automatic", label: "Sản xuất đơn giản", detail: "Tự chạy các bước an toàn và chỉ dừng khi cần bạn duyệt." },
  { value: "full_automatic", label: "Tự động hoàn toàn", detail: "Chưa sẵn sàng; hãy dùng Sản xuất đơn giản cho quy trình thủ công." }
];

export const creatorPhaseDefinitions = [
  { id: "brief", label: "Brief", description: "Mục tiêu, định dạng và khán giả", route: "project-overview" as RouteId, stageIds: ["project-setup"] },
  { id: "story", label: "Story", description: "Nghiên cứu, dàn ý và kịch bản", route: "script" as RouteId, stageIds: ["idea-lab", "research-source-intake", "claim-map", "outline", "script", "fact-review", "retention-review"] },
  { id: "director", label: "Director", description: "Cảnh, storyboard và nhịp kể", route: "scenes" as RouteId, stageIds: ["scene-plan", "shot-plan", "visual-routing"] },
  { id: "assets", label: "Assets", description: "Prompt GG Lab và duyệt ảnh", route: "assets" as RouteId, stageIds: ["character-preparation", "asset-concepts", "prompt-preparation", "asset-acquisition", "asset-review"] },
  { id: "build", label: "Build", description: "Giọng, timeline, QA và xuất MP4", route: "timeline" as RouteId, stageIds: ["voice-generation", "subtitle-preparation", "timeline-assembly", "preview-render", "qa", "packaging-export"] }
] as const;

const routeLabels: Partial<Record<RouteId, string>> = {
  content: "Nội dung",
  director: "Đạo diễn",
  assets: "Hình ảnh",
  build: "Dựng video",
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

const stageLabels: Record<string, string> = {
  "project-setup": "Thiết lập dự án",
  "reference-intake": "Tài liệu tham khảo",
  "reference-validation": "Kiểm tra tài liệu",
  "transcript-cleaning": "Làm sạch nội dung",
  "reference-segmentation": "Tách nội dung tham khảo",
  "competitor-dna": "Phân tích tham khảo",
  "opportunity-map": "Bản đồ cơ hội",
  "idea-lab": "Phòng ý tưởng",
  "originality-review": "Kiểm tra tính riêng",
  "research-source-intake": "Nghiên cứu nguồn",
  "claim-map": "Bản đồ luận điểm",
  outline: "Dàn ý",
  script: "Kịch bản",
  "fact-review": "Kiểm tra sự thật",
  "retention-review": "Kiểm tra giữ chân",
  "scene-plan": "Kế hoạch cảnh",
  "shot-plan": "Storyboard",
  "character-preparation": "Bộ nhân vật",
  "visual-routing": "Định tuyến hình ảnh",
  "asset-concepts": "Ý tưởng hình ảnh",
  "prompt-preparation": "Prompt theo cảnh",
  "asset-acquisition": "Nhập ảnh",
  "asset-review": "Duyệt ảnh",
  "voice-generation": "Giọng đọc",
  "subtitle-preparation": "Phụ đề",
  "timeline-assembly": "Dựng timeline",
  "preview-render": "Bản xem trước",
  qa: "Kiểm tra cuối",
  "capcut-draft": "CapCut (tuỳ chọn)",
  "packaging-export": "Xuất MP4",
  complete: "Đã hoàn tất"
};

const stagePurposeLabels: Record<string, string> = {
  outline: "Lập các phần chính từ ý tưởng đã duyệt, chưa thêm nghiên cứu bên ngoài.",
  script: "Viết lời dẫn dựa trên dàn ý đã duyệt.",
  "fact-review": "Kiểm tra luận điểm trong kịch bản bằng các quy tắc cục bộ.",
  "retention-review": "Kiểm tra nhịp kể và rủi ro giữ chân mà không tự viết lại nội dung.",
  "scene-plan": "Chia kịch bản thành các cảnh có mốc thời gian, chưa tạo ảnh hay storyboard frame.",
  "shot-plan": "Lập storyboard frame theo thời gian, chưa tạo hoặc gán ảnh.",
  "visual-routing": "Chọn hướng hình ảnh và chuyển động cho từng storyboard frame; bước này không tạo ảnh.",
  "asset-concepts": "Xác định concept hình ảnh có thể tái sử dụng trước khi biên soạn prompt.",
  "prompt-preparation": "Tạo một prompt hoàn chỉnh cho mỗi cảnh để bạn copy sang GG Lab.",
  "asset-acquisition": "Nhập ảnh từ pipeline cũ; không thuộc quy trình thủ công mặc định.",
  "asset-review": "Kiểm tra, gán và duyệt ảnh trước khi chuyển sang dựng video.",
  "timeline-assembly": "Ghép ảnh, giọng đọc và phụ đề thành timeline để kiểm tra.",
  "preview-render": "Dựng bản xem trước thật bằng FFmpeg để bạn kiểm tra trước khi xuất.",
  qa: "Kiểm tra bằng chứng đã lưu và file media trước khi xuất MP4.",
  "capcut-draft": "Tạo gói CapCut tuỳ chọn để kiểm tra thủ công; không chặn xuất MP4.",
  "packaging-export": "Đóng gói bản xem trước đã duyệt thành MP4 và các file đi kèm.",
  "character-preparation": "Chuẩn bị và duyệt bộ nhân vật trước khi sản xuất hình ảnh."
};

const dependencyLabels: Record<string, string> = {
  "Approved idea": "Ý tưởng đã duyệt",
  "Approved Originality Review": "Kiểm tra tính riêng đã duyệt",
  "Approved Outline": "Dàn ý đã duyệt",
  "Approved Script": "Kịch bản đã duyệt",
  "Approved Fact Review": "Kiểm tra sự thật đã duyệt",
  "Approved Retention Review": "Kiểm tra giữ chân đã duyệt",
  "Approved Scene Plan": "Kế hoạch cảnh đã duyệt",
  "Approved Shot Plan": "Storyboard đã duyệt",
  "Approved Visual Routing": "Định tuyến hình ảnh đã duyệt",
  "Approved Asset Concepts": "Concept hình ảnh đã duyệt",
  "Approved Character Pack": "Bộ nhân vật đã duyệt",
  "Approved Prompt Preparation": "Prompt theo cảnh đã duyệt",
  "Approved Asset Review": "Ảnh đã duyệt",
  "Approved Voice": "Giọng đọc đã duyệt",
  "Approved Subtitles": "Phụ đề đã duyệt",
  "Approved Timeline Assembly": "Timeline đã duyệt",
  "Approved Preview Render": "Bản xem trước đã duyệt",
  "Approved Timeline": "Timeline đã duyệt",
  "Approved QA": "Kiểm tra cuối đã duyệt",
  "Approved QA, Approved Timeline": "Kiểm tra cuối và timeline đã duyệt",
  "Approved Preview, Timeline, Voice, Subtitles, and Assets": "Bản xem trước, timeline, giọng đọc, phụ đề và ảnh đã duyệt",
  "Approved Idea Lab candidate": "Ứng viên ý tưởng đã duyệt",
  "Approved Competitor DNA": "Phân tích tham khảo đã duyệt",
  "Approved Voice Generation": "Giọng đọc đã duyệt",
  "Opportunity Map": "Bản đồ cơ hội",
  "Competitor DNA": "Phân tích tham khảo",
  "Verified image model": "Model hình ảnh đã xác minh",
  "Reference Intake": "Tài liệu tham khảo",
  "Available TTS provider": "Provider giọng đọc khả dụng",
  "CapCut Draft": "Bản nháp CapCut"
};

const phaseLabels: Record<string, string> = {
  "reference-analysis": "Tham khảo",
  "content-preparation": "Nội dung",
  "scene-review": "Cảnh & hình ảnh",
  "voice-and-captions": "Giọng & phụ đề",
  "final-preview": "Bản xem trước",
  export: "Xuất video"
};

export const creatorOverviewCopy = {
  eyebrow: "Không gian sản xuất",
  description: "Theo dõi dự án, biết việc cần làm tiếp theo và chỉ mở bước duyệt khi nội dung đã sẵn sàng.",
  watchFinal: "Xem video cuối",
  openExport: "Mở xuất video",
  continue: "Tiếp tục sản xuất",
  running: "Đang xử lý...",
  complete: "Đã hoàn tất",
  status: "Trạng thái",
  progress: "Tiến độ",
  language: "Ngôn ngữ",
  currentStep: "Bước hiện tại",
  projectJourney: "Lộ trình dự án",
  phases: "Các giai đoạn",
  journeyDescription: "Các bước bắt buộc được tính vào tiến độ; đầu ra tuỳ chọn không chặn việc xuất MP4.",
  current: "Đang làm",
  waiting: "Đang chờ",
  notUsed: "Không dùng",
  optional: "Tuỳ chọn",
  actionRequired: "Cần bạn xử lý",
  reviewAvailable: "Đã sẵn sàng để duyệt",
  productionProgress: "Tiến độ sản xuất",
  details: "Thông tin dự án",
  advanced: "Điều khiển nâng cao"
} as const;

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
  attention: "Cần chú ý",
  locked: "Đang khoá",
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

export function creatorStageLabel(stage: string): string {
  const normalized = stage.trim().toLowerCase().replace(/\s+/g, "-");
  return stageLabels[stage] ?? stageLabels[normalized] ?? stageLabels[normalized.replace(/^approved-/, "")] ?? "Bước tiếp theo";
}

export function creatorNextAction(stageId?: string, status?: string): string {
  if (!stageId) return "Xem video cuối";
  const stage = creatorStageLabel(stageId);
  if (status === "needs_review") return `Duyệt ${stage}`;
  if (status === "needs_attention" || status === "blocked") return `Xử lý ${stage}`;
  if (status === "failed") return `Thử lại ${stage}`;
  if (status === "rejected") return `Sửa ${stage}`;
  if (status === "stale") return `Cập nhật ${stage}`;
  if (status === "queued" || status === "running") return `Đang xử lý ${stage}`;
  return `Bắt đầu ${stage}`;
}

export function creatorStagePurpose(stage: string, fallback: string): string {
  const normalized = stage.trim().toLowerCase().replace(/\s+/g, "-");
  return stagePurposeLabels[normalized] ?? fallback;
}

export function creatorDependencyLabel(dependency: string): string {
  return dependencyLabels[dependency] ?? dependency;
}

export function creatorBlockingMessage(message: string): string {
  const known: Record<string, string> = {
    "Text model selected but not verified. Open Providers -> Text Model Certification.": "Model chữ đã chọn chưa được xác minh. Mở Provider để kiểm tra model chữ.",
    "Image model capability is not verified.": "Model hình ảnh chưa được xác minh.",
    "Video model capability is not verified.": "Model video chưa được xác minh.",
    "Configure a verified voice provider or local OmniVoice before generating narration.": "Hãy cấu hình provider giọng đọc đã xác minh hoặc OmniVoice cục bộ trước khi tạo lời dẫn.",
    "Approve a channel character version before running character-first visual production.": "Hãy duyệt một phiên bản nhân vật kênh trước khi sản xuất hình ảnh.",
    "Add and include at least one competitor reference before validating the reference set.": "Hãy thêm và đưa vào ít nhất một tài liệu tham khảo trước khi kiểm tra bộ tài liệu.",
    "Resolve duplicate references before approving the reference set.": "Hãy xử lý tài liệu trùng trước khi duyệt bộ tài liệu.",
    "Fix or exclude invalid references before approving the reference set.": "Hãy sửa hoặc loại tài liệu không hợp lệ trước khi duyệt bộ tài liệu.",
    "Approve the current reference set before running the competitor workflow.": "Hãy duyệt bộ tài liệu tham khảo hiện tại trước khi chạy quy trình phân tích."
  };
  if (known[message]) return known[message];
  const dependency = message.match(/^Approve (.+) before running (.+)\.$/);
  if (dependency) return `Hãy duyệt ${creatorStageLabel(dependency[1]!)} trước khi chạy ${creatorStageLabel(dependency[2]!)}.`;
  const staleDependency = message.match(/^A dependency before (.+) is no longer approved\.$/);
  if (staleDependency) return `Một bước trước ${creatorStageLabel(staleDependency[1]!)} không còn được duyệt.`;
  return message;
}

export function creatorPhaseLabel(phase: string): string {
  return phaseLabels[phase] ?? "Lộ trình sản xuất";
}

export function creatorPhaseStateLabel(state: string): string {
  return statusLabels[state] ?? "Trạng thái chưa xác định";
}

export function creatorInputModeLabel(inputMode: string): string {
  return ({ topic: "Chủ đề", existing_script: "Kịch bản có sẵn", reference: "Tài liệu tham khảo" } as Record<string, string>)[inputMode] ?? "Khác";
}
