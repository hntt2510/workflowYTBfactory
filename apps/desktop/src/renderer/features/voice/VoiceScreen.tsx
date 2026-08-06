import { useEffect, useState } from "react";
import type { FactoryProject } from "@lsf/domain";
import { resolveStageEligibilities } from "@lsf/domain";
import { DisabledAction, FormField, PageHeader, SectionCard, StatusBadge } from "../../components/ui";
import type { LocalTtsSettings, SubtitlePreparationArtifact, TtsJob, TtsProviderCatalog, VoiceGenerationArtifact } from "../../types";
import { factoryClient } from "../../services/factoryClient";
import { creatorStatusLabel } from "../../creatorStudioCopy";
import { safeRendererError } from "../../utils";
import { StageStatusHeader } from "../../components/workflow";
import type { RouteId } from "../../navigation";

export function VoiceScreen(props: {
  project: FactoryProject;
  localTtsSettings: LocalTtsSettings | null;
  onRefresh: () => Promise<void>;
  setSelectedProject: (project: FactoryProject | null) => void;
  setRoute: (route: RouteId) => void;
  languageCode: (value: string | undefined) => string;
}) {
  const [artifacts, setArtifacts] = useState<VoiceGenerationArtifact[]>([]);
  const [subtitleArtifacts, setSubtitleArtifacts] = useState<SubtitlePreparationArtifact[]>([]);
  const [ttsJob, setTtsJob] = useState<TtsJob | null>(null);
  const [voiceCatalog, setVoiceCatalog] = useState<TtsProviderCatalog>({ providers: [], voices: [] });
  const [voiceCatalogMessage, setVoiceCatalogMessage] = useState("");
  const [loadingVoiceCatalog, setLoadingVoiceCatalog] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const settingsAvailable = props.localTtsSettings?.available ?? false;
  const projectLanguage = props.languageCode(props.project.setup.language || props.project.targetLanguage);
  const configuredProvider = props.localTtsSettings?.voiceMode === "integrated-voices"
    ? props.localTtsSettings.ttsProvider ?? "edge-tts"
    : "omnivoice-local";
  const matchingVoices = voiceCatalog.voices.filter((voice) => voice.enabled && !voice.experimental && voice.provider === configuredProvider && props.languageCode(voice.language) === projectLanguage);
  const configuredVoiceId = props.localTtsSettings?.ttsVoiceId;
  const savedVoiceId = [props.project.setup.voiceId, configuredVoiceId]
    .find((voiceId): voiceId is string => Boolean(voiceId && props.languageCode(voiceId) === projectLanguage));
  const configuredVoiceMatchesLanguage = configuredProvider !== "omnivoice-local"
    && Boolean(savedVoiceId);
  const catalogAvailable = configuredProvider !== "omnivoice-local"
    && (matchingVoices.length > 0 || configuredVoiceMatchesLanguage);
  const available = settingsAvailable || catalogAvailable;
  const voiceOptions = configuredProvider === "omnivoice-local"
      ? [{ id: "omnivoice-local", label: "Configured OmniVoice voice", gender: "unknown" }]
      : matchingVoices.length
        ? matchingVoices.map((voice) => ({ id: voice.providerVoiceId, label: `${voice.label} (${voice.provider})`, gender: voice.gender }))
        : configuredVoiceMatchesLanguage && savedVoiceId
          ? [{ id: savedVoiceId, label: `Giọng đọc đã lưu của dự án (${savedVoiceId})`, gender: "unknown" as const }]
          : [];
  const eligibility = resolveStageEligibilities(props.project, { localAudioAvailable: available }).find((stage) => stage.stageId === "voice-generation")!;
  const subtitleEligibility = resolveStageEligibilities(props.project).find((stage) => stage.stageId === "subtitle-preparation")!;
  const retryableStatuses = ["approved", "needs_review", "failed", "needs_attention", "rejected", "stale"] as const;
  const hasUnmetWorkflowDependency = eligibility.blockingReasons.some((reason) => reason.code.startsWith("DEPENDENCY_") || reason.code === "REFERENCE_SET_NOT_APPROVED");
  const canGenerate = Boolean(available && selectedVoiceId && !hasUnmetWorkflowDependency && (eligibility.runnable || retryableStatuses.includes(eligibility.status as typeof retryableStatuses[number])));

  useEffect(() => {
    setSelectedVoiceId("");
    setVoiceCatalogMessage("");
    if (configuredProvider === "omnivoice-local") {
      setVoiceCatalog({ providers: [], voices: [] });
      setSelectedVoiceId("omnivoice-local");
      return;
    }
    let cancelled = false;
    setLoadingVoiceCatalog(true);
    void factoryClient.listTtsProviders({ language: projectLanguage, refresh: true })
      .then((catalog) => {
        if (cancelled) return;
        setVoiceCatalog(catalog);
        const matchingVoiceIds = catalog.voices
          .filter((voice) => voice.enabled && !voice.experimental && voice.provider === configuredProvider && props.languageCode(voice.language) === projectLanguage)
          .map((voice) => voice.providerVoiceId);
        setSelectedVoiceId((current) => {
          if (current && matchingVoiceIds.includes(current)) return current;
          const projectVoiceId = props.project.setup.voiceId;
          if (projectVoiceId && matchingVoiceIds.includes(projectVoiceId)) return projectVoiceId;
          return matchingVoiceIds[0] ?? savedVoiceId ?? "";
        });
        const provider = catalog.providers.find((item) => item.id === configuredProvider);
        const hasMatchingVoice = matchingVoiceIds.length > 0 || configuredVoiceMatchesLanguage;
        setVoiceCatalogMessage(provider?.health === "unavailable" && !hasMatchingVoice ? provider.message : "");
      })
      .catch((error) => {
        if (!cancelled) setVoiceCatalogMessage(safeRendererError(error, "Không thể tải danh sách giọng đọc."));
      })
      .finally(() => { if (!cancelled) setLoadingVoiceCatalog(false); });
    return () => { cancelled = true; };
  }, [configuredProvider, projectLanguage, props.project.id, savedVoiceId]);

  const refresh = async () => {
    const [voice, subtitles, job] = await Promise.all([
      factoryClient.listVoiceGenerationArtifacts({ projectId: props.project.id }),
      factoryClient.listSubtitlePreparationArtifacts({ projectId: props.project.id }),
      factoryClient.getProjectTtsJob({ projectId: props.project.id })
    ]);
    setArtifacts(voice);
    setSubtitleArtifacts(subtitles);
    setTtsJob(job);
  };

  useEffect(() => { void refresh().catch(() => { setArtifacts([]); setTtsJob(null); }); }, [props.project.id]);
  useEffect(() => {
    if (!ttsJob || !["queued", "running"].includes(ttsJob.state)) return;
    const timer = window.setInterval(() => { void refresh().catch(() => undefined); }, 1200);
    return () => window.clearInterval(timer);
  }, [props.project.id, ttsJob?.id, ttsJob?.state]);
  useEffect(() => {
    if (!ttsJob || ["queued", "running"].includes(ttsJob.state)) return;
    if (ttsJob.state === "success") {
      setMessage(props.project.setup.workflowMode === "semi_automatic"
        ? "Đã tạo giọng đọc. Tiếp tục sản xuất."
        : "Đã tạo giọng đọc. Hãy duyệt các đoạn giọng đọc để tiếp tục.");
    } else if (ttsJob.state === "failed") {
      setMessage(ttsJob.errorMessage ?? "Tạo giọng đọc thất bại. Hãy thử lại đoạn bị lỗi.");
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        await refresh();
        const project = await factoryClient.loadProject(props.project.id);
        if (project) {
          props.setSelectedProject(project);
          if (project.setup.workflowMode === "semi_automatic" && project.stages.find((stage) => stage.id === "voice-generation")?.status === "approved") props.setRoute("timeline");
        }
        await props.onRefresh();
      })().catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [props.project.id, ttsJob?.id, ttsJob?.state]);

  async function perform(action: () => Promise<FactoryProject>, success: string) {
    setGenerating(true);
    try {
      const project = await action();
      props.setSelectedProject(project);
      await refresh();
      await props.onRefresh();
      setMessage(success);
    } catch (error) {
      setMessage(safeRendererError(error, "Thao tác giọng đọc thất bại. Hãy kiểm tra chi tiết tác vụ bên dưới và thử lại."));
    } finally {
      setGenerating(false);
    }
  }

  async function retrySegment(segmentId: string) {
    if (!ttsJob) return;
    setGenerating(true);
    try {
      const job = await factoryClient.retryTtsJobSegment({ jobId: ttsJob.id, segmentId });
      setTtsJob(job);
      await refresh();
      setMessage(`Đã bắt đầu thử lại đoạn ${segmentId}.`);
    } catch (error) {
      setMessage(safeRendererError(error, "Không thể thử lại đoạn giọng đọc bị lỗi."));
    } finally {
      setGenerating(false);
    }
  }

  async function cancelJob() {
    if (!ttsJob) return;
    setGenerating(true);
    try {
      setTtsJob(await factoryClient.cancelTtsJob({ jobId: ttsJob.id }));
      setMessage("Đã huỷ tác vụ giọng đọc.");
    } catch (error) {
      setMessage(safeRendererError(error, "Không thể huỷ tác vụ giọng đọc."));
    } finally {
      setGenerating(false);
    }
  }

  const completedSegments = ttsJob?.segments.filter((segment) => segment.state === "success").length ?? 0;
  return (
    <>
      <PageHeader title="Giọng đọc" description="Chọn giọng đọc trước khi tạo lời dẫn. Danh sách chỉ hiển thị giọng phù hợp với ngôn ngữ dự án." />
      <StageStatusHeader stageName="Voice Generation" stageNumber={20} eligibility={eligibility} dependencies={["Approved Script", "Approved Asset Review", "Available TTS provider"]} purpose="Tạo các đoạn giọng đọc có mốc thời gian, được FFprobe kiểm tra, trước khi duyệt." />
      <SectionCard title="Chọn giọng đọc cho dự án">
        <div className="form-grid">
          <FormField label="Ngôn ngữ dự án" htmlFor="project-language"><input id="project-language" value={props.project.setup.language || props.project.targetLanguage} disabled readOnly /></FormField>
          <FormField label="Giọng đọc" htmlFor="project-voice" hint="Chỉ hiển thị giọng phù hợp với ngôn ngữ dự án.">
            <select id="project-voice" value={selectedVoiceId} onChange={(event) => setSelectedVoiceId(event.target.value)} disabled={loadingVoiceCatalog || !available}>
              <option value="">{loadingVoiceCatalog ? "Đang tải giọng phù hợp..." : "Chọn giọng đọc"}</option>
              {voiceOptions.map((voice) => <option key={voice.id} value={voice.id}>{voice.label} - {voice.gender}</option>)}
            </select>
          </FormField>
          {!available ? <p className="error-message">Dự án chưa có provider giọng đọc khả dụng.</p> : null}
          {voiceCatalogMessage ? <p className="safe-message">{voiceCatalogMessage}</p> : null}
          <div className="button-row">
            {canGenerate && ["approved", "needs_review"].includes(eligibility.status) ? <button className="button primary" type="button" onClick={() => void perform(() => factoryClient.runVoiceGeneration({ projectId: props.project.id, voiceId: selectedVoiceId, force: true }), "Tác vụ giọng đọc đã được xếp hàng. Tiến độ hiển thị bên dưới.")} disabled={generating || ttsJob?.state === "running" || ttsJob?.state === "queued"}>{generating ? "Đang bắt đầu..." : "Tạo giọng đọc"}</button> : canGenerate ? <button className="button primary" type="button" onClick={() => void perform(() => factoryClient.runVoiceGeneration({ projectId: props.project.id, voiceId: selectedVoiceId }), "Tác vụ giọng đọc đã được xếp hàng. Tiến độ hiển thị bên dưới.")} disabled={generating || ttsJob?.state === "running" || ttsJob?.state === "queued"}>{generating ? "Đang bắt đầu..." : "Tạo giọng đọc"}</button> : <DisabledAction reason={!selectedVoiceId ? "Hãy chọn giọng đọc trước." : eligibility.blockingReasons[0]?.message ?? "Hãy duyệt kịch bản và ảnh trước khi tạo giọng đọc."}>Tạo giọng đọc</DisabledAction>}
          </div>
          {ttsJob ? <div className="settings-list">
            <p><strong>Tác vụ</strong>: {creatorStatusLabel(ttsJob.state)} ({completedSegments}/{ttsJob.segments.length} đoạn), provider được chọn: {ttsJob.provider}</p>
            {ttsJob.mergedRelativeFilePath ? <p><strong>Giọng đọc đã ghép</strong>: {ttsJob.mergedRelativeFilePath}</p> : null}
            {ttsJob.errorMessage ? <p className="error-message">{ttsJob.errorMessage}</p> : null}
            {ttsJob.segments.map((segment) => <p key={segment.segmentId}><strong>{segment.segmentId}</strong>: {creatorStatusLabel(segment.state)}, provider thực tế: {segment.actualProvider ?? "đang chờ"}, số lần thử: {segment.attemptCount}{segment.fallbackUsed ? " (đã dùng fallback rõ ràng)" : ""}{segment.timingOverflowSeconds > 0 ? `, vượt thời lượng ${segment.timingOverflowSeconds.toFixed(2)}s` : ""}{segment.errorMessage ? ` - ${segment.errorMessage}` : ""}{segment.state === "failed" ? <button className="button compact" type="button" disabled={generating} onClick={() => void retrySegment(segment.segmentId)}>Thử lại đoạn này</button> : null}</p>)}
            {["queued", "running"].includes(ttsJob.state) ? <button className="button compact" type="button" disabled={generating} onClick={() => void cancelJob()}>Huỷ tác vụ</button> : null}
          </div> : null}
            {artifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : artifact.status === "rejected" ? "danger" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge><p>Provider được chọn: {artifact.payloadJson.requestedProvider ?? "artifact cũ"}</p>{artifact.payloadJson.mergedRelativeFilePath ? <p>Giọng đọc đã ghép: {artifact.payloadJson.mergedRelativeFilePath}</p> : null}{artifact.payloadJson.timingWarnings?.map((warning) => <p className="safe-message" key={warning}>{warning}</p>)}{artifact.payloadJson.segments.map((segment) => <p key={segment.scriptSectionId}><strong>{segment.scriptSectionId}</strong>: {segment.actualProvider ?? "chưa xác định"}, {segment.durationSeconds.toFixed(2)}s, SHA-256 {segment.sha256.slice(0, 12)}...</p>)}{artifact.status === "needs_review" ? <div className="button-row"><button className="button compact" type="button" disabled={generating || !eligibility.approvable} onClick={() => void perform(() => factoryClient.approveVoiceGeneration({ projectId: props.project.id }), "Đã duyệt các đoạn giọng đọc.")}>Duyệt đoạn giọng đọc</button><button className="button danger compact" type="button" disabled={generating} onClick={() => void perform(() => factoryClient.rejectVoiceGeneration({ projectId: props.project.id }), "Đã từ chối các đoạn giọng đọc.")}>Từ chối đoạn giọng đọc</button></div> : null}</div>)}
          {message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}
        </div>
      </SectionCard>
      <SectionCard title="Nhạc và âm thanh nền"><p>Chưa có: quy trình này chưa có nguồn âm thanh được duyệt. Timeline chỉ dùng lời dẫn và không tự tạo nhạc nền giả.</p></SectionCard>
      <StageStatusHeader stageName="Subtitle Preparation" stageNumber={21} eligibility={subtitleEligibility} dependencies={["Approved Script", "Approved Voice Generation"]} purpose="Tạo cue theo frame từ lời dẫn đã có mốc thời gian mà không đổi câu chữ kịch bản." />
      <SectionCard title="Duyệt phụ đề">{subtitleEligibility.runnable ? <button className="button primary" type="button" disabled={generating} onClick={() => void perform(() => factoryClient.runSubtitlePreparation({ projectId: props.project.id }), "Cue phụ đề đã sẵn sàng để duyệt.")}>Tạo phụ đề</button> : <DisabledAction reason={subtitleEligibility.blockingReasons[0]?.message ?? "Hãy duyệt giọng đọc trước khi tạo phụ đề."}>Tạo phụ đề</DisabledAction>}{subtitleArtifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : artifact.status === "rejected" ? "danger" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge><p>{artifact.payloadJson.cues.length} cue · {artifact.payloadJson.fps} fps</p>{artifact.payloadJson.cues.slice(0, 5).map((cue) => <p key={cue.id}>{cue.startFrame}: {cue.text}</p>)}{artifact.status === "needs_review" ? <div className="button-row"><button className="button compact" type="button" disabled={generating || !subtitleEligibility.approvable} onClick={() => void perform(() => factoryClient.approveSubtitlePreparation({ projectId: props.project.id }), "Phụ đề đã được duyệt.")}>Duyệt phụ đề</button><button className="button danger compact" type="button" disabled={generating} onClick={() => void perform(() => factoryClient.rejectSubtitlePreparation({ projectId: props.project.id }), "Phụ đề đã bị từ chối.")}>Từ chối phụ đề</button></div> : null}</div>)}</SectionCard>
    </>
  );
}
