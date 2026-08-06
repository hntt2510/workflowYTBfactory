import { useEffect, useState } from "react";
import { resolveStageEligibilities, type FactoryProject } from "@lsf/domain";
import { EmptyState, MetricCard, PageHeader, SectionCard } from "../../components/ui";
import { factoryClient } from "../../services/factoryClient";
import { creatorStatusLabel } from "../../creatorStudioCopy";
import { safeRendererError } from "../../utils";
import type { RouteId } from "../../navigation";
import type { LocalTtsSettings, PreviewRenderArtifact } from "../../types";
import type { SemiAutomaticChain } from "../../semiAutomaticWorkflow";

export function FinalPreviewScreen(props: {
  project: FactoryProject;
  localTtsSettings: LocalTtsSettings | null;
  setSelectedProject: (project: FactoryProject | null) => void;
  setRoute: (route: RouteId) => void;
  startSemiAutomatic: (chain: SemiAutomaticChain, project: FactoryProject) => Promise<void>;
}) {
  const [artifacts, setArtifacts] = useState<PreviewRenderArtifact[]>([]);
  const [mediaUrl, setMediaUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const preview = resolveStageEligibilities(props.project).find((stage) => stage.stageId === "preview-render");
  const currentArtifact = artifacts.find((artifact) => artifact.status === "needs_review") ?? artifacts.find((artifact) => artifact.status === "approved");
  const warnings = preview?.blockingReasons ?? [];

  async function refresh(): Promise<void> {
    const next = await factoryClient.listPreviewRenderArtifacts({ projectId: props.project.id });
    setArtifacts(next);
    const candidate = next.find((artifact) => artifact.status === "needs_review") ?? next.find((artifact) => artifact.status === "approved");
    if (!candidate) {
      setMediaUrl("");
      return;
    }
    const response = await factoryClient.getPreviewVideoUrl({ projectId: props.project.id, artifactId: candidate.id });
    setMediaUrl(response.url);
  }

  useEffect(() => {
    void refresh().catch((error) => setMessage(safeRendererError(error, "Không thể tải bản xem trước. Hãy dựng lại hoặc mở timeline.")));
  }, [props.project.id]);

  async function perform(action: () => Promise<FactoryProject>, success: string): Promise<FactoryProject | null> {
    setRunning(true);
    setMessage("");
    try {
      const next = await action();
      props.setSelectedProject(next);
      await refresh();
      setMessage(success);
      return next;
    } catch (error) {
      setMessage(safeRendererError(error, "Không thể xử lý bản xem trước. Hãy thử lại bước dựng."));
      return null;
    } finally {
      setRunning(false);
    }
  }

  async function approveFinalVideo(): Promise<FactoryProject> {
    const next = await factoryClient.approvePreviewRender({ projectId: props.project.id });
    if (next.setup.workflowMode === "semi_automatic") void props.startSemiAutomatic("preview", next);
    return next;
  }

  async function downloadVideo(): Promise<void> {
    if (!currentArtifact) return;
    setRunning(true);
    setMessage("");
    try {
      const result = await factoryClient.downloadPreviewVideo({ projectId: props.project.id, artifactId: currentArtifact.id });
      setMessage(result.canceled ? "Đã huỷ tải MP4." : `Đã lưu MP4 với tên ${result.fileName ?? "video.mp4"}.`);
    } catch (error) {
      setMessage(safeRendererError(error, "Không thể tải MP4."));
    } finally {
      setRunning(false);
    }
  }

  const canRenderAgain = Boolean(currentArtifact) && ["needs_review", "approved", "failed", "needs_attention", "stale"].includes(preview?.status ?? "");
  const voiceLabel = props.project.setup.voiceId ?? props.localTtsSettings?.ttsVoiceId ?? "Giọng đọc đã cấu hình";
  const subtitleLabel = currentArtifact?.payloadJson.subtitleRelativeFilePath
    ? currentArtifact.payloadJson.subtitlePreset === "minimal" ? "Tối giản - UTF-8 cục bộ" : currentArtifact.payloadJson.subtitlePreset === "high-contrast" ? "Tương phản cao - UTF-8 cục bộ" : "VOX Clean - UTF-8 cục bộ"
    : "Đang chờ cue phụ đề";

  return <>
    <PageHeader title="Bản xem trước" description="Xem video đã dựng và thông tin đã lưu trước khi xuất MP4." actions={<div className="button-row"><button className="button secondary" type="button" onClick={() => props.setRoute("scene-review")}>Quay lại duyệt cảnh</button><button className="button secondary" type="button" onClick={() => props.setRoute("timeline")}>Mở điều khiển phụ đề</button></div>} />
    <SectionCard title="Video đã dựng" description="Trình phát dùng URL an toàn trong workspace cho MP4 đang chờ duyệt hoặc đã duyệt.">
      {mediaUrl ? <video className="preview-video" controls preload="metadata" src={mediaUrl}>Trình duyệt không phát được bản xem trước này.</video> : <EmptyState title="Chưa có bản xem trước để duyệt" detail="Dựng timeline đã duyệt sau khi hoàn tất giọng đọc và phụ đề." action={<button className="button primary" type="button" onClick={() => props.setRoute("timeline")}>Mở timeline</button>} />}
      {message ? <p className={message.toLowerCase().includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}
    </SectionCard>
    <section className="metric-grid">
      <MetricCard label="Trạng thái xem trước" value={creatorStatusLabel(preview?.status ?? "not_started")} tone={preview?.status === "approved" ? "success" : preview?.status === "needs_review" ? "info" : "warning"} />
      <MetricCard label="Thời lượng" value={currentArtifact ? `${currentArtifact.payloadJson.durationSeconds.toFixed(2)}s` : "-"} />
      <MetricCard label="Độ phân giải" value={currentArtifact ? `${currentArtifact.payloadJson.width} x ${currentArtifact.payloadJson.height}` : "-"} />
      <MetricCard label="Số cảnh" value={props.project.scenes.length} />
    </section>
    <SectionCard title="Thông tin bản xem trước">
      <p><strong>Giọng đọc:</strong> {voiceLabel}</p>
      <p><strong>Kiểu phụ đề:</strong> {subtitleLabel}</p>
      <p><strong>File xem trước:</strong> {currentArtifact?.relativeFilePath ?? "Chưa dựng"}</p>
      {warnings.length ? <div><strong>Cảnh báo</strong>{warnings.map((warning) => <p key={`${warning.code}-${warning.message}`}>{warning.message}</p>)}</div> : <p className="safe-message">Không có cảnh báo chặn bản xem trước.</p>}
      <div className="button-row">
        {currentArtifact ? <button className="button secondary" type="button" disabled={running} onClick={() => void downloadVideo()}>Tải MP4</button> : null}
        {currentArtifact?.status === "needs_review" ? <button className="button primary" type="button" disabled={running || !preview?.approvable} onClick={() => void perform(approveFinalVideo, "Video cuối đã được duyệt.").then((updated) => { if (updated?.stages.find((stage) => stage.id === "preview-render")?.status === "approved") props.setRoute("project-overview"); })}>Duyệt video</button> : null}
        {canRenderAgain ? <button className="button secondary" type="button" disabled={running} onClick={() => void perform(() => factoryClient.runPreviewRender({ projectId: props.project.id, force: true, subtitlePreset: currentArtifact?.payloadJson.subtitlePreset ?? "vox-clean" }), "Đã dựng lại bản xem trước; bạn vẫn cần duyệt.")}>{running ? "Đang dựng..." : "Dựng lại"}</button> : null}
        <button className="button secondary" type="button" onClick={() => props.setRoute("scene-review")}>Quay lại duyệt cảnh</button>
        <button className="button secondary" type="button" disabled={running} onClick={() => props.setRoute("voice")}>Đổi giọng / tạo lại</button>
        <button className="button secondary" type="button" onClick={() => props.setRoute("timeline")}>Đổi kiểu phụ đề</button>
      </div>
    </SectionCard>
  </>;
}
