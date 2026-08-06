import { useEffect, useState } from "react";
import type { FactoryProject, SubtitlePreset } from "@lsf/domain";
import { resolveStageEligibilities } from "@lsf/domain";
import { DisabledAction, FormField, PageHeader, SectionCard, StatusBadge } from "../../components/ui";
import type {
  CapCutDraftArtifact,
  PackagingExportArtifact,
  PreviewRenderArtifact,
  QaArtifact,
  TimelineAssemblyArtifact
} from "../../types";
import { factoryClient } from "../../services/factoryClient";
import { creatorStatusLabel } from "../../creatorStudioCopy";
import { safeRendererError } from "../../utils";
import { nextSemiAutomaticChain, type SemiAutomaticChain } from "../../semiAutomaticWorkflow";
import { StageStatusHeader, canRetryStage } from "../../components/workflow";
import type { RouteId } from "../../navigation";

export function TimelineScreen(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; startSemiAutomatic: (chain: SemiAutomaticChain, project: FactoryProject) => Promise<void> }) {
  const [artifacts, setArtifacts] = useState<TimelineAssemblyArtifact[]>([]); const [previewArtifacts, setPreviewArtifacts] = useState<PreviewRenderArtifact[]>([]); const [subtitlePreset, setSubtitlePreset] = useState<SubtitlePreset>("vox-clean"); const [running, setRunning] = useState(false); const [message, setMessage] = useState("");
  const eligibility = resolveStageEligibilities(props.project).find((stage) => stage.stageId === "timeline-assembly")!;
  const previewEligibility = resolveStageEligibilities(props.project).find((stage) => stage.stageId === "preview-render")!;
  const nextChain = nextSemiAutomaticChain(props.project);
  const refresh = async () => { const [timeline, previews] = await Promise.all([factoryClient.listTimelineAssemblyArtifacts({ projectId: props.project.id }), factoryClient.listPreviewRenderArtifacts({ projectId: props.project.id })]); setArtifacts(timeline); setPreviewArtifacts(previews); const currentPreview = previews.find((artifact) => artifact.status === "needs_review") ?? previews.find((artifact) => artifact.status === "approved"); setSubtitlePreset(currentPreview?.payloadJson.subtitlePreset ?? "vox-clean"); };
  useEffect(() => { void refresh().catch(() => setArtifacts([])); }, [props.project.id]);
  async function perform(action: () => Promise<FactoryProject>, success: string) { setRunning(true); try { props.setSelectedProject(await action()); await refresh(); setMessage(success); } catch (error) { setMessage(safeRendererError(error)); } finally { setRunning(false); } }
  async function selectAudio(kind: "music" | "ambient" | "sfx"): Promise<void> {
    await perform(() => factoryClient.selectProjectAudio({ projectId: props.project.id, kind }), `Đã lưu ${kind === "music" ? "nhạc" : kind === "ambient" ? "âm thanh nền" : "hiệu ứng"}. Hãy dựng lại timeline để thêm vào.`);
  }
  const totalFrames = Math.max(...props.project.timeline.items.map((item) => item.startFrame + item.durationFrames), 1);
  return (
    <>
      <PageHeader title="Dựng video" description="Ghép ảnh, giọng đọc và phụ đề đã duyệt thành timeline để kiểm tra." actions={canRetryStage(eligibility) ? <button className="button primary" type="button" disabled={running} onClick={() => void perform(() => factoryClient.runTimelineAssembly({ projectId: props.project.id }), eligibility.status === "failed" || eligibility.status === "needs_attention" ? "Timeline đã sẵn sàng để thử lại." : "Timeline đã sẵn sàng để duyệt.")}>{eligibility.status === "failed" || eligibility.status === "needs_attention" ? "Thử lại timeline" : "Dựng timeline"}</button> : <DisabledAction reason={eligibility.blockingReasons[0]?.message ?? "Timeline chưa thể chạy."}>Dựng timeline</DisabledAction>} />
      <StageStatusHeader stageName="Timeline Assembly" stageNumber={22} eligibility={eligibility} dependencies={["Approved Asset Review", "Approved Voice", "Approved Subtitles"]} purpose="Ghép media đã duyệt thành timeline để kiểm tra; bước này chưa xuất video." />
      <SectionCard title="Các track âm thanh" description="Nhạc, âm thanh nền và hiệu ứng là tuỳ chọn. Nhạc và âm thanh nền sẽ chạy dưới lời dẫn ở mức âm lượng thấp hơn.">
        <div className="button-row"><button className="button secondary" type="button" disabled={running} onClick={() => void selectAudio("music")}>{props.project.setup.musicPath ? "Thay nhạc" : "Thêm nhạc"}</button><button className="button secondary" type="button" disabled={running} onClick={() => void selectAudio("ambient")}>{props.project.setup.ambientPath ? "Thay âm thanh nền" : "Thêm âm thanh nền"}</button><button className="button secondary" type="button" disabled={running} onClick={() => void selectAudio("sfx")}>{props.project.setup.sfxPath ? "Thay hiệu ứng" : "Thêm hiệu ứng"}</button></div>
        <p className="muted">Nhạc: {props.project.setup.musicPath ?? "chưa có"} · Nền: {props.project.setup.ambientPath ?? "chưa có"} · Hiệu ứng: {props.project.setup.sfxPath ?? "chưa có"}</p>
      </SectionCard>
<SectionCard title="Duyệt timeline">{artifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : artifact.status === "rejected" ? "danger" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge><p>{artifact.payloadJson.items.length} media item · {artifact.payloadJson.fps} fps</p>{artifact.status === "needs_review" ? <div className="button-row"><button className="button compact" type="button" disabled={running || !eligibility.approvable} onClick={() => void perform(() => factoryClient.approveTimelineAssembly({ projectId: props.project.id }), "Timeline đã được duyệt.")}>Duyệt timeline</button><button className="button danger compact" type="button" disabled={running} onClick={() => void perform(() => factoryClient.rejectTimelineAssembly({ projectId: props.project.id }), "Timeline đã bị từ chối.")}>Từ chối timeline</button></div> : null}</div>)}{message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}</SectionCard>
      <StageStatusHeader stageName="Preview Render" stageNumber={23} eligibility={previewEligibility} dependencies={["Approved Timeline Assembly"]} purpose="Dựng media hình ảnh và lời dẫn đã duyệt bằng FFmpeg, sau đó kiểm tra bản xem trước." />
      <SectionCard title="Kiểu phụ đề" description="Chọn một kiểu phụ đề cho bản xem trước. Lớp chữ tiếng Việt được ghép cục bộ bằng UTF-8."><FormField label="Kiểu phụ đề" htmlFor="subtitle-preset"><select id="subtitle-preset" value={subtitlePreset} onChange={(event) => setSubtitlePreset(event.target.value as SubtitlePreset)}><option value="vox-clean">VOX Clean</option><option value="minimal">Tối giản</option><option value="high-contrast">Tương phản cao</option></select></FormField></SectionCard>
      <SectionCard title="Duyệt bản xem trước" description="FFmpeg chỉ chạy sau khi bạn bấm nút. Renderer không tự chọn đường dẫn hoặc gọi process.">
        {canRetryStage(previewEligibility) ? <button className="button primary" type="button" disabled={running} onClick={() => void perform(() => factoryClient.runPreviewRender({ projectId: props.project.id, subtitlePreset }), previewEligibility.status === "failed" || previewEligibility.status === "needs_attention" ? "Bản xem trước đã sẵn sàng để thử lại." : "Bản xem trước đã sẵn sàng để duyệt.")}>{running ? "Đang dựng bản xem trước..." : previewEligibility.status === "failed" || previewEligibility.status === "needs_attention" ? "Thử lại bản xem trước" : "Dựng bản xem trước"}</button> : <DisabledAction reason={previewEligibility.blockingReasons[0]?.message ?? "Bản xem trước cần timeline đã duyệt."}>Dựng bản xem trước</DisabledAction>}
        {previewArtifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : artifact.status === "rejected" ? "danger" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge><p>{artifact.payloadJson.width}x{artifact.payloadJson.height}, {artifact.payloadJson.durationSeconds.toFixed(2)}s</p><p>{artifact.relativeFilePath}</p><p>SHA-256: {artifact.payloadJson.sha256 ?? "Chưa có; hãy dựng lại trước khi duyệt."}</p>{artifact.status === "needs_review" ? <div className="button-row"><button className="button compact" type="button" disabled={running || !previewEligibility.approvable} onClick={() => void perform(async () => { const project = await factoryClient.approvePreviewRender({ projectId: props.project.id }); if (project.setup.workflowMode === "semi_automatic") void props.startSemiAutomatic("preview", project); return project; }, "Đã duyệt bản xem trước.")}>Duyệt bản xem trước</button><button className="button danger compact" type="button" disabled={running} onClick={() => void perform(() => factoryClient.rejectPreviewRender({ projectId: props.project.id }), "Đã từ chối bản xem trước. Hãy dựng lại timeline đã duyệt khi sẵn sàng.")}>Từ chối bản xem trước</button></div> : null}</div>)}
      </SectionCard>
      {props.project.setup.workflowMode === "semi_automatic" && nextChain === "preview" && previewEligibility.status === "approved" ? <SectionCard title="Tiếp tục sản xuất tự động" description="Bản xem trước đã được duyệt. Kiểm tra cuối và xuất MP4 sẽ chạy tiếp; CapCut vẫn là tuỳ chọn."><button className="button primary" type="button" disabled={running} onClick={() => void props.startSemiAutomatic("preview", props.project)}>Tiếp tục kiểm tra và xuất</button></SectionCard> : null}
      <SectionCard>
        <div className="timeline-view">
          {props.project.timeline.items.map((item) => (
            <div className="timeline-item" key={item.id} style={{ left: `${(item.startFrame / totalFrames) * 100}%`, width: `${(item.durationFrames / totalFrames) * 100}%` }}>
              {item.track} / {item.sourceId}
            </div>
          ))}
        </div>
      </SectionCard>
    </>
  );
}

export function QaScreen(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void }) {
  const [artifacts, setArtifacts] = useState<QaArtifact[]>([]); const [running, setRunning] = useState(false); const [message, setMessage] = useState("");
  const eligibility = resolveStageEligibilities(props.project).find((stage) => stage.stageId === "qa")!;
  const canRunQa = canRetryStage(eligibility);
  const refresh = () => factoryClient.listQaArtifacts({ projectId: props.project.id }).then(setArtifacts);
  useEffect(() => { void refresh().catch(() => setArtifacts([])); }, [props.project.id]);
  async function perform(action: () => Promise<FactoryProject>, success: string) { setRunning(true); try { props.setSelectedProject(await action()); await refresh(); setMessage(success); } catch (error) { setMessage(safeRendererError(error)); } finally { setRunning(false); } }
  return <><PageHeader title="Kiểm tra cuối" description="Chạy các kiểm tra bằng chứng xác định sau khi bản xem trước đã được duyệt. Không tự tạo phát hiện AI hoặc tự duyệt dự án." actions={canRunQa ? <button className="button primary" type="button" disabled={running} onClick={() => void perform(() => factoryClient.runQa({ projectId: props.project.id }), eligibility.status === "failed" || eligibility.status === "needs_attention" ? "Đã sẵn sàng thử lại kiểm tra cuối." : "Báo cáo kiểm tra cuối đã sẵn sàng để duyệt.")}>{eligibility.status === "failed" || eligibility.status === "needs_attention" ? "Thử lại kiểm tra" : "Chạy kiểm tra cuối"}</button> : <DisabledAction reason={eligibility.blockingReasons[0]?.message ?? "Cần bản xem trước đã duyệt để kiểm tra."}>Chạy kiểm tra cuối</DisabledAction>} /><StageStatusHeader stageName="QA" stageNumber={25} eligibility={eligibility} dependencies={["Approved Preview Render"]} purpose="Kiểm tra artifact đã lưu và bằng chứng media cục bộ trước khi xuất MP4 hoặc tạo gói CapCut tuỳ chọn." /><SectionCard title="Báo cáo kiểm tra">{artifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge>{artifact.payloadJson.findings.length ? artifact.payloadJson.findings.map((finding, index) => <p key={`${finding.code}-${index}`}><strong>{creatorStatusLabel(finding.severity)}</strong> {finding.code}: {finding.message}</p>) : <p>Không có phát hiện từ kiểm tra xác định.</p>}{artifact.status === "needs_review" ? <div className="button-row"><button className="button compact" disabled={running || !eligibility.approvable || artifact.payloadJson.findings.some((finding) => finding.severity === "blocking")} type="button" onClick={() => void perform(() => factoryClient.approveQa({ projectId: props.project.id }), "Đã duyệt kiểm tra cuối.")}>Duyệt kiểm tra</button><button className="button danger compact" disabled={running} type="button" onClick={() => void perform(() => factoryClient.rejectQa({ projectId: props.project.id }), "Đã từ chối kiểm tra cuối.")}>Từ chối kiểm tra</button></div> : null}</div>)}{message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}</SectionCard></>;
}

export function ExportScreen(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; setRoute: (route: RouteId) => void }) {
  const [artifacts, setArtifacts] = useState<PackagingExportArtifact[]>([]);
  const [capcutArtifacts, setCapcutArtifacts] = useState<CapCutDraftArtifact[]>([]);
  const [previewArtifacts, setPreviewArtifacts] = useState<PreviewRenderArtifact[]>([]);
  const [resolution, setResolution] = useState<"1080p" | "720p">(props.project.setup.outputResolution ?? "1080p");
  const [includeSubtitles, setIncludeSubtitles] = useState(true);
  const [exportSubtitleFile, setExportSubtitleFile] = useState(true);
  const [createCapCutDraft, setCreateCapCutDraft] = useState(false);
  const [includeProjectManifest, setIncludeProjectManifest] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const eligibility = resolveStageEligibilities(props.project).find((stage) => stage.stageId === "packaging-export")!;
  const capcutEligibility = resolveStageEligibilities(props.project).find((stage) => stage.stageId === "capcut-draft")!;
  const canRunCapcut = canRetryStage(capcutEligibility);
  const currentPreview = previewArtifacts.find((artifact) => artifact.status === "approved" || artifact.status === "needs_review");
  const previewHasSubtitles = Boolean(currentPreview?.payloadJson.subtitleRelativeFilePath);
  const previewOptionsChanged = resolution !== (props.project.setup.outputResolution ?? "1080p") || includeSubtitles !== previewHasSubtitles;
  const canRunPackaging = canRetryStage(eligibility) && !previewOptionsChanged;

  const refresh = async () => {
    const [exports, drafts, previews] = await Promise.all([
      factoryClient.listPackagingExportArtifacts({ projectId: props.project.id }),
      factoryClient.listCapCutDraftArtifacts({ projectId: props.project.id }),
      factoryClient.listPreviewRenderArtifacts({ projectId: props.project.id })
    ]);
    setArtifacts(exports);
    setCapcutArtifacts(drafts);
    setPreviewArtifacts(previews);
    if (previews[0]) setIncludeSubtitles(Boolean(previews[0].payloadJson.subtitleRelativeFilePath));
  };

  useEffect(() => {
    setResolution(props.project.setup.outputResolution ?? "1080p");
    void refresh().catch(() => {
      setArtifacts([]);
      setCapcutArtifacts([]);
      setPreviewArtifacts([]);
    });
  }, [props.project.id]);

  async function perform(action: () => Promise<FactoryProject>, success: string) {
    setRunning(true);
    try {
      props.setSelectedProject(await action());
      await refresh();
      setMessage(success);
    } catch (error) {
      setMessage(safeRendererError(error, "Không thể hoàn tất thao tác xuất. Hãy kiểm tra tuỳ chọn và thử lại."));
    } finally {
      setRunning(false);
    }
  }

  async function applyPreviewOptions() {
    setRunning(true);
    try {
      const next = await factoryClient.runPreviewRender({ projectId: props.project.id, force: true, resolution, includeSubtitles, subtitlePreset: currentPreview?.payloadJson.subtitlePreset ?? "vox-clean" });
      props.setSelectedProject(next);
      props.setRoute("final-preview");
    } catch (error) {
      setMessage(safeRendererError(error, "Không thể áp dụng tuỳ chọn xem trước. Hãy dựng lại bản xem trước và thử lại."));
    } finally {
      setRunning(false);
    }
  }

  async function createPackage() {
    setRunning(true);
    try {
      let next = await factoryClient.runPackagingExport({ projectId: props.project.id, exportSubtitleFile, includeProjectManifest });
      let success = includeProjectManifest ? "MP4 cuối và manifest dự án đã sẵn sàng để duyệt." : "MP4 cuối đã sẵn sàng để duyệt, không kèm manifest dự án.";
      if (createCapCutDraft) {
        try {
          next = await factoryClient.runCapCutDraft({ projectId: props.project.id });
          success += " Gói CapCut đã sẵn sàng để bạn kiểm tra tuỳ chọn.";
        } catch (error) {
          success += ` Không tạo được gói CapCut: ${safeRendererError(error, "không thể tạo gói CapCut tuỳ chọn")}`;
        }
      }
      props.setSelectedProject(next);
      await refresh();
      setMessage(success);
    } catch (error) {
      setMessage(safeRendererError(error, "Không thể hoàn tất thao tác xuất. Hãy kiểm tra tuỳ chọn và thử lại."));
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <PageHeader title="Xuất video" description="Chọn tuỳ chọn đầu ra rồi tạo gói MP4 cục bộ để duyệt." actions={<div className="button-row"><button className="button secondary" type="button" onClick={() => props.setRoute("final-preview")}>Xem video cuối</button>{canRunPackaging ? <button className="button primary" type="button" disabled={running} onClick={() => void createPackage()}>{eligibility.status === "failed" || eligibility.status === "needs_attention" ? "Thử lại xuất MP4" : "Tạo gói MP4 cuối"}</button> : <DisabledAction reason={previewOptionsChanged ? "Hãy áp dụng tuỳ chọn xem trước và duyệt bản xem trước trước khi xuất." : eligibility.blockingReasons[0]?.message ?? "Cần kiểm tra cuối và artifact sản xuất đã duyệt; CapCut là tuỳ chọn."}>Tạo gói MP4 cuối</DisabledAction>}</div>} />
      <SectionCard title="Tuỳ chọn xuất" description="Đổi độ phân giải hoặc phụ đề sẽ tạo lại mốc bản xem trước. File phụ đề, manifest và gói CapCut là tuỳ chọn.">
        <div className="form-grid">
          <FormField label="Độ phân giải" htmlFor="export-resolution"><select id="export-resolution" value={resolution} onChange={(event) => setResolution(event.target.value as "1080p" | "720p")}><option value="1080p">1080p</option><option value="720p">720p</option></select></FormField>
          <label><input type="checkbox" checked={includeSubtitles} onChange={(event) => setIncludeSubtitles(event.target.checked)} /> Ghép phụ đề vào video</label>
          <label><input type="checkbox" checked={exportSubtitleFile} onChange={(event) => setExportSubtitleFile(event.target.checked)} /> Xuất file phụ đề</label>
          <label><input type="checkbox" checked={createCapCutDraft} onChange={(event) => setCreateCapCutDraft(event.target.checked)} /> Tạo gói CapCut</label>
          <label><input type="checkbox" checked={includeProjectManifest} onChange={(event) => setIncludeProjectManifest(event.target.checked)} /> Kèm manifest dự án</label>
        </div>
        {previewOptionsChanged ? <div className="button-row"><button className="button secondary" type="button" disabled={running} onClick={() => void applyPreviewOptions()}>Dựng bản xem trước theo tuỳ chọn</button><span className="muted">Cần duyệt bản xem trước trước khi xuất.</span></div> : null}
      </SectionCard>
      <StageStatusHeader stageName="CapCut Draft" stageNumber={26} eligibility={capcutEligibility} dependencies={["Approved QA", "Approved Timeline"]} purpose="Gói cấu trúc tuỳ chọn để kiểm tra thủ công trong CapCut; không bao giờ bắt buộc để xuất MP4." />
      <SectionCard title="Kiểm tra gói CapCut">
        {canRunCapcut ? <button className="button primary" type="button" disabled={running} onClick={() => void perform(() => factoryClient.runCapCutDraft({ projectId: props.project.id }), capcutEligibility.status === "failed" || capcutEligibility.status === "needs_attention" ? "Đã sẵn sàng thử lại gói CapCut để kiểm tra thủ công." : "Gói CapCut đã sẵn sàng để kiểm tra thủ công.")}>{capcutEligibility.status === "failed" || capcutEligibility.status === "needs_attention" ? "Thử lại gói CapCut" : "Tạo gói CapCut"}</button> : <DisabledAction reason={capcutEligibility.blockingReasons[0]?.message ?? "Gói CapCut cần kiểm tra cuối và điều kiện runtime đã đạt."}>Tạo gói CapCut</DisabledAction>}
        {capcutArtifacts.map((artifact) => <p key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : artifact.status === "rejected" ? "danger" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge> {artifact.payloadJson.draftName}: {artifact.payloadJson.trackCounts.video} video, {artifact.payloadJson.trackCounts.audio} audio, {artifact.payloadJson.trackCounts.text} track phụ đề; {artifact.payloadJson.mediaValidated ? `${artifact.payloadJson.visualClipCount ?? artifact.payloadJson.trackCounts.video} clip hình ảnh đã kiểm tra` : "media hình ảnh cũ chưa được kiểm tra lại"}. {artifact.status === "needs_review" ? <span className="button-row"><button className="button compact" disabled={running || !capcutEligibility.approvable} type="button" onClick={() => { if (window.confirm("Xác nhận bạn đã mở gói này trong CapCut và kiểm tra rằng track video, audio và phụ đề có thể chỉnh sửa.")) void perform(() => factoryClient.approveCapCutDraft({ projectId: props.project.id, confirmation: "I opened the draft in CapCut and verified editable tracks" }), "Đã duyệt gói CapCut sau khi kiểm tra thủ công."); }}>Xác nhận đã kiểm tra CapCut</button><button className="button danger compact" disabled={running} type="button" onClick={() => void perform(() => factoryClient.rejectCapCutDraft({ projectId: props.project.id }), "Đã từ chối gói CapCut.")}>Từ chối gói</button></span> : null}</p>)}
      </SectionCard>
      <StageStatusHeader stageName="Packaging Export" stageNumber={27} eligibility={eligibility} dependencies={["Approved QA", "Approved Preview, Timeline, Voice, Subtitles, and Assets"]} purpose="Đóng gói bản xem trước đã duyệt thành MP4 cuối và có thể kèm file phụ đề cùng manifest dự án." />
      <SectionCard title="Manifest gói xuất">
        {artifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge><p>Manifest: {artifact.payloadJson.manifestRelativeFilePath ?? "Không kèm"}</p><p>MP4 cuối: {artifact.payloadJson.mp4RelativeFilePath ?? "Chưa có"}</p>{artifact.payloadJson.subtitleRelativeFilePath ? <p>File phụ đề: {artifact.payloadJson.subtitleRelativeFilePath}</p> : null}<p>{artifact.payloadJson.artifactIds.length} artifact đã duyệt, SHA-256 {artifact.payloadJson.sha256.slice(0, 12)}...</p>{artifact.status === "needs_review" ? <div className="button-row"><button className="button compact" disabled={running || !eligibility.approvable} type="button" onClick={() => void perform(() => factoryClient.approvePackagingExport({ projectId: props.project.id }), "Đã duyệt gói MP4 cuối.")}>Duyệt gói</button><button className="button danger compact" disabled={running} type="button" onClick={() => void perform(() => factoryClient.rejectPackagingExport({ projectId: props.project.id }), "Đã từ chối gói xuất.")}>Từ chối gói</button></div> : null}</div>)}
        {message ? <p className={message.toLowerCase().includes("failed") || message.toLowerCase().includes("not created") ? "error-message" : "safe-message"}>{message}</p> : null}
      </SectionCard>
    </>
  );
}
