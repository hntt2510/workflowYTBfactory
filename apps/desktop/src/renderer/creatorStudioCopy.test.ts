import { describe, expect, it } from "vitest";
import { creatorBlockingMessage, creatorDependencyLabel, creatorNextAction, creatorPhaseDefinitions, creatorPhaseLabel, creatorStageLabel, creatorStagePurpose, workflowModeOptions } from "./creatorStudioCopy";

describe("creator studio copy", () => {
  it("maps stage IDs and registry names to creator-facing labels", () => {
    expect(creatorStageLabel("idea-lab")).toBe("Phòng ý tưởng");
    expect(creatorStageLabel("Project Setup")).toBe("Thiết lập dự án");
    expect(creatorStageLabel("Complete")).toBe("Đã hoàn tất");
    expect(creatorStageLabel("Scene Plan")).toBe("Kế hoạch cảnh");
  });

  it("keeps workflow options Vietnamese-first", () => {
    expect(workflowModeOptions.map((option) => option.label)).toEqual([
      "Có hướng dẫn",
      "Sản xuất đơn giản",
      "Tự động hoàn toàn"
    ]);
  });

  it("exposes the five creator-facing phases", () => {
    expect(creatorPhaseDefinitions.map((phase) => phase.id)).toEqual(["brief", "story", "director", "assets", "build"]);
    expect(creatorPhaseDefinitions.map((phase) => phase.route)).toEqual(["project-overview", "script", "scenes", "assets", "timeline"]);
  });

  it("maps internal progress phases without exposing IDs", () => {
    expect(creatorPhaseLabel("content-preparation")).toBe("Nội dung");
    expect(creatorPhaseLabel("unknown-phase")).toBe("Lộ trình sản xuất");
  });

  it("turns persisted workflow status into an actionable next step", () => {
    expect(creatorNextAction("asset-review", "needs_review")).toContain("Duyệt");
    expect(creatorNextAction("script", "failed")).toContain("Thử lại");
    expect(creatorNextAction()).toContain("Xem video");
  });

  it("keeps workflow headers and dependencies creator-facing", () => {
    expect(creatorStagePurpose("Timeline Assembly", "fallback")).toContain("timeline");
    expect(creatorDependencyLabel("Approved Shot Plan")).toBe("Storyboard đã duyệt");
    expect(creatorBlockingMessage("Text model selected but not verified. Open Providers -> Text Model Certification.")).toContain("Model chữ");
  });
});
