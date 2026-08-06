import { useEffect, useState, type ReactNode } from "react";
import { AudioLines, CheckCircle2, Film, Gauge, Mic2, Subtitles } from "lucide-react";
import { VoiceScreen } from "../voice/VoiceScreen";
import { FinalPreviewScreen } from "../build/FinalPreviewScreen";
import { ExportScreen, QaScreen, TimelineScreen } from "../build/BuildScreens";
import { PageHeader, SectionCard, StatusBadge } from "../../components/ui";
import { ttsLanguageCode } from "../projects/CreateScreens";
import type { ProjectWorkspaceProps } from "./types";

export type BuildWorkspaceTab = "voice" | "timeline" | "preview" | "qa" | "export";

export function BuildWorkspace(props: ProjectWorkspaceProps & { initialTab?: BuildWorkspaceTab }) {
  const [tab, setTab] = useState<BuildWorkspaceTab>(props.initialTab ?? "timeline");
  const assetsApproved = props.project.stages.find((stage) => stage.id === "asset-review")?.status === "approved";
  const exportApproved = props.project.stages.find((stage) => stage.id === "packaging-export")?.status === "approved";

  useEffect(() => {
    setTab(props.initialTab ?? "timeline");
  }, [props.initialTab]);

  return (
    <div className="studio-workspace studio-workspace-build">
      <PageHeader
        eyebrow="05 · Build"
        title="Từ frame đã duyệt đến một video hoàn chỉnh"
        description="Tạo giọng đọc, phụ đề và timeline, xem preview, chạy QA rồi xuất MP4. CapCut chỉ là bước tiếp theo nếu bạn muốn."
        actions={<button className="button primary" type="button" onClick={() => setTab(exportApproved ? "export" : "preview")}>{exportApproved ? "Mở file đã xuất" : "Xem preview"}</button>}
      />

      <div className={`build-gate ${assetsApproved ? "ready" : "locked"}`}>
        {assetsApproved ? <CheckCircle2 size={18} /> : <Gauge size={18} />}
        <div>
          <strong>{assetsApproved ? "Sẵn sàng dựng video" : "Build đang chờ ảnh được duyệt"}</strong>
          <span>{assetsApproved ? "Các frame bắt buộc đã qua kiểm tra. Bạn có thể tiếp tục với giọng đọc và timeline." : "Quay lại Hình ảnh để map và duyệt đủ mọi frame không phải REUSE."}</span>
        </div>
      </div>

      <div className="studio-subnav studio-build-nav" role="tablist" aria-label="Các phần dựng video">
        <BuildTab active={tab === "voice"} icon={<Mic2 size={16} />} label="Giọng & phụ đề" onClick={() => setTab("voice")} />
        <BuildTab active={tab === "timeline"} icon={<AudioLines size={16} />} label="Timeline" onClick={() => setTab("timeline")} />
        <BuildTab active={tab === "preview"} icon={<Film size={16} />} label="Preview" onClick={() => setTab("preview")} />
        <BuildTab active={tab === "qa"} icon={<CheckCircle2 size={16} />} label="QA" onClick={() => setTab("qa")} />
        <BuildTab active={tab === "export"} icon={<Subtitles size={16} />} label="Xuất MP4" onClick={() => setTab("export")} />
      </div>

      <SectionCard className="studio-build-tracks">
        <div className="build-track"><span className="track-label">VOICE</span><div className="track-fill track-voice" /><span>{props.project.setup.voiceId ? "Đã chọn giọng" : "Chưa có giọng"}</span></div>
        <div className="build-track"><span className="track-label">SUBTITLE</span><div className="track-fill track-subtitle" /><span>{props.project.scriptSections.length ? `${props.project.scriptSections.length} đoạn lời dẫn` : "Chưa có cue"}</span></div>
        <div className="build-track"><span className="track-label">VISUAL</span><div className="track-fill track-visual" /><span>{props.project.timeline.items.length ? `${props.project.timeline.items.length} item timeline` : "Chưa dựng timeline"}</span></div>
      </SectionCard>

      <div className="studio-workspace-body">
        {tab === "voice" ? <VoiceScreen project={props.project} localTtsSettings={props.localTtsSettings} onRefresh={props.onRefresh} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} languageCode={ttsLanguageCode} /> : null}
        {tab === "timeline" ? <TimelineScreen project={props.project} setSelectedProject={props.setSelectedProject} startSemiAutomatic={props.startSemiAutomatic} /> : null}
        {tab === "preview" ? <FinalPreviewScreen project={props.project} localTtsSettings={props.localTtsSettings} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} startSemiAutomatic={props.startSemiAutomatic} /> : null}
        {tab === "qa" ? <QaScreen project={props.project} setSelectedProject={props.setSelectedProject} /> : null}
        {tab === "export" ? <ExportScreen project={props.project} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} /> : null}
      </div>
    </div>
  );
}

function BuildTab(props: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className={`studio-subnav-tab ${props.active ? "active" : ""}`} type="button" role="tab" aria-selected={props.active} onClick={props.onClick}>
      {props.icon}
      <span>{props.label}</span>
    </button>
  );
}
