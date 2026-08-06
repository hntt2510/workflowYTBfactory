import type { ChannelProfile, FactoryProject } from "@lsf/domain";
import { resolveProductionStatus, resolveStageEligibilities, resolveWorkflowProgress, workflowStageDefinitions } from "@lsf/domain";
import { PageHeader, MetricCard, SectionCard, SettingsList, StatusBadge } from "../../components/ui";
import type { ImageModelCertificationResponse, LocalTtsSettings, TextModelCertificationResponse } from "../../types";
import { automaticChainForStage, characterVersionNeedsSetup, nextSemiAutomaticChain, type SemiAutomaticChain, type SemiAutomaticProgress } from "../../semiAutomaticWorkflow";
import { creatorBlockingMessage, creatorOverviewCopy, creatorPhaseLabel, creatorPhaseStateLabel, creatorStageLabel, creatorStatusLabel, workflowModeOptions } from "../../creatorStudioCopy";
import { stageTone } from "../../utils";
import type { RouteId } from "../../navigation";

export function ProjectOverview(props: {
  selectedProject: FactoryProject;
  selectedProfile: ChannelProfile | undefined;
  setRoute: (route: RouteId) => void;
  startSemiAutomatic: (chain: SemiAutomaticChain, project: FactoryProject) => Promise<void>;
  textCertification: TextModelCertificationResponse;
  imageCertification: ImageModelCertificationResponse;
  localTtsSettings: LocalTtsSettings | null;
  semiAutomaticProgress: SemiAutomaticProgress | null;
  semiAutomaticRunning: boolean;
  semiAutomaticError: string | null;
}) {
  const project = props.selectedProject;
  const characterNeedsSetup = characterVersionNeedsSetup(project, props.selectedProfile);
  const eligibilities = resolveStageEligibilities(project, {
    textVerified: props.textCertification.status === "verified",
    imageVerified: props.imageCertification.status === "verified",
    localAudioAvailable: props.localTtsSettings?.available ?? false
  });
  const progress = resolveWorkflowProgress(project);
  const presentationById = new Map(progress.stages.map((stage) => [stage.stageId, stage]));
  const checkpoint = project.stages.find((stage) => stage.status === "needs_review");
  const attention = project.stages.find((stage) => stage.status === "needs_attention" || stage.status === "failed");
  const nextStage = eligibilities.find((stage) => {
    if (!stage.runnable && !stage.reviewable) return false;
    const presentation = presentationById.get(stage.stageId);
    return presentation?.state !== "not_applicable" && presentation?.state !== "optional";
  });
  const nextStageName = nextStage ? creatorStageLabel(nextStage.stageId) : undefined;
  const nextChain = nextSemiAutomaticChain(project, props.selectedProfile);
  const isRunning = props.semiAutomaticRunning || project.stages.some((stage) => stage.status === "queued" || stage.status === "running");
  const actionStage = attention ?? checkpoint;
  const retryChain = attention && project.setup.workflowMode === "semi_automatic" ? automaticChainForStage(attention.id) : undefined;
  const actionRoute = characterNeedsSetup ? "channel-profiles" : actionStage ? stageRoute(actionStage.id) : nextStage ? stageRoute(nextStage.stageId) : "advanced-pipeline";
  const phaseRows = progress.phases.map((phase) => ({
    ...phase,
    label: creatorPhaseLabel(phase.id),
    currentStage: phase.currentStageId
      ? creatorStageLabel(phase.currentStageId)
      : phase.state === "not_applicable"
        ? creatorOverviewCopy.notUsed
        : phase.state === "optional"
          ? creatorOverviewCopy.optional
          : phase.state === "complete"
            ? creatorOverviewCopy.complete
            : creatorOverviewCopy.waiting
  }));
  const currentPhaseLabel = progress.currentStageId
    ? phaseRows.find((phase) => phase.currentStageId === progress.currentStageId)?.label
    : undefined;
  const actionLabel = characterNeedsSetup
    ? "Thiết lập nhân vật kênh"
    : retryChain && !isRunning
      ? "Thử lại quy trình"
      : attention
        ? `Mở ${creatorStageLabel(attention.id)}`
        : checkpoint
          ? `Duyệt ${creatorStageLabel(checkpoint.id)}`
          : nextChain && !isRunning
            ? creatorOverviewCopy.continue
            : nextStageName
              ? `Mở ${nextStageName}`
              : creatorOverviewCopy.complete;
  const capcut = presentationById.get("capcut-draft");

  async function continueProduction(): Promise<void> {
    if (characterNeedsSetup) {
      props.setRoute("channel-profiles");
      return;
    }
    if (retryChain && !isRunning) {
      await props.startSemiAutomatic(retryChain, project);
      return;
    }
    if (actionStage) {
      props.setRoute(actionRoute);
      return;
    }
    if (nextChain && !isRunning) {
      await props.startSemiAutomatic(nextChain, project);
      return;
    }
    if (nextStage) props.setRoute(actionRoute);
  }

  return (
    <>
      <PageHeader
        eyebrow={creatorOverviewCopy.eyebrow}
        title={project.setup.projectName}
        description={creatorOverviewCopy.description}
        actions={<div className="button-row">{progress.percent === 100 ? <><button className="button secondary" type="button" onClick={() => props.setRoute("final-preview")}>{creatorOverviewCopy.watchFinal}</button><button className="button secondary" type="button" onClick={() => props.setRoute("export")}>{creatorOverviewCopy.openExport}</button></> : null}<button className="button primary" type="button" disabled={isRunning || (!characterNeedsSetup && !actionStage && !nextStage && !nextChain)} onClick={() => void continueProduction()}>{isRunning ? creatorOverviewCopy.running : actionLabel}</button></div>}
      />
      <section className="metric-grid">
        <MetricCard label={creatorOverviewCopy.status} value={creatorStatusLabel(resolveProductionStatus(project))} />
        <MetricCard label={creatorOverviewCopy.progress} value={`${progress.percent}%`} />
        <MetricCard label={creatorOverviewCopy.language} value={project.setup.language || project.targetLanguage} />
        <MetricCard label={creatorOverviewCopy.currentStep} value={progress.currentStageId ? creatorStageLabel(progress.currentStageId) : creatorOverviewCopy.complete} />
      </section>
      {props.semiAutomaticProgress ? (
        <SectionCard title={props.semiAutomaticRunning ? "Tiến độ trực tiếp" : "Cập nhật gần nhất"} description="Đây là bước đang chạy và kết quả mới nhất đã được lưu.">
          <p>{props.semiAutomaticProgress.message}</p>
          <p className="muted">{props.semiAutomaticProgress.completed}/{props.semiAutomaticProgress.total} bước - {creatorStageLabel(props.semiAutomaticProgress.stageId)}</p>
        </SectionCard>
      ) : null}
      {props.semiAutomaticError ? <SectionCard title={creatorOverviewCopy.actionRequired}><p className="error-message">{props.semiAutomaticError}</p></SectionCard> : null}
      <SectionCard title={creatorOverviewCopy.projectJourney} description={creatorOverviewCopy.journeyDescription}>
        <div className="route-result">
          <StatusBadge tone={stageTone(progress.currentStageId ? "current" : "complete")}>{progress.completedCount}/{progress.totalCount} bước bắt buộc</StatusBadge>
          <strong>{progress.currentStageId ? `Đang làm: ${creatorStageLabel(progress.currentStageId)}` : creatorOverviewCopy.complete}</strong>
          <span>{currentPhaseLabel ? `Giai đoạn hiện tại: ${currentPhaseLabel}. ` : ""}{actionLabel}.</span>
        </div>
        {capcut?.state === "optional" ? <p className="muted">CapCut là tuỳ chọn và không chặn việc xuất MP4.</p> : null}
        {progress.percent === 100 ? <div className="button-row"><button className="button primary compact" type="button" onClick={() => props.setRoute("final-preview")}>{creatorOverviewCopy.watchFinal}</button><button className="button secondary compact" type="button" onClick={() => props.setRoute("export")}>Xem file đã xuất</button></div> : null}
      </SectionCard>
      <SectionCard title={attention ? creatorOverviewCopy.actionRequired : checkpoint ? creatorOverviewCopy.reviewAvailable : creatorOverviewCopy.productionProgress} description={attention ? creatorBlockingMessage(attention.attention?.message ?? "") : checkpoint ? "Mở bước duyệt khi bạn sẵn sàng. Sau khi xác nhận, bạn sẽ quay lại đây." : "Các bước an toàn sẽ tiếp tục cho đến khi cần bạn quyết định."}>
        {attention || checkpoint ? (
          <div className="route-result">
            <StatusBadge tone={attention ? "danger" : "info"}>{attention ? "Cần xử lý" : "Chờ bạn duyệt"}</StatusBadge>
            <strong>{creatorStageLabel(attention?.id ?? checkpoint?.id ?? "")}</strong>
            <span>{attention ? creatorBlockingMessage(attention.attention?.message ?? "") : "Nội dung đã sẵn sàng để bạn duyệt."}</span>
          </div>
        ) : isRunning ? (
          <p className="muted">Chưa cần thao tác. Bạn có thể ở lại đây để theo dõi dự án.</p>
        ) : (
          <p className="muted">Bước an toàn tiếp theo sẽ xuất hiện ở đây khi sẵn sàng.</p>
        )}
      </SectionCard>
      <SectionCard title={creatorOverviewCopy.phases}>
        <div className="status-grid">
          {phaseRows.map((phase) => (
            <div className="status-row" key={phase.id}>
              <span>{phase.label}</span>
              <StatusBadge tone={stageTone(phase.state)}>{creatorPhaseStateLabel(phase.state)}</StatusBadge>
              <small>{phase.currentStage}</small>
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title={creatorOverviewCopy.details}>
        <SettingsList items={[
          ["Kênh", props.selectedProfile?.name ?? project.profileId],
          ["Thời lượng mục tiêu", project.setup.targetDuration],
          ["Cách sản xuất", workflowModeOptions.find((option) => option.value === project.setup.workflowMode)?.label ?? "Có hướng dẫn"],
          ["Số cảnh", String(project.scenes.length)],
          ["Số frame", String(project.shots.length)],
          ["Ý tưởng đã chọn", project.approvedIdeaId ? "Đã chọn" : "Chưa chọn"]
        ]} />
      </SectionCard>
      <SectionCard title={creatorOverviewCopy.advanced} description="Các bước nội bộ vẫn có trong phần nâng cao để kiểm tra và khôi phục khi cần.">
        <div className="button-row">
          <button className="button secondary compact" type="button" onClick={() => props.setRoute("reference-intake")}>Mở tài liệu tham khảo</button>
          <button className="button secondary compact" type="button" onClick={() => props.setRoute("advanced-pipeline")}>Mở chi tiết nâng cao</button>
        </div>
      </SectionCard>
    </>
  );
}

export function stageRoute(name: string): RouteId {
  if (name === "asset-review" || /asset review/i.test(name)) return "scene-review";
  if (name === "preview-render" || /preview render/i.test(name)) return "final-preview";
  const stage = workflowStageDefinitions.find((definition) => definition.id === name || definition.name === name);
  if (stage) return stage.screenRoute as RouteId;
  if (/channel|profile/i.test(name)) return "channel-profiles";
  if (/reference/i.test(name)) return "reference-intake";
  if (/competitor/i.test(name)) return "competitor-dna";
  if (/opportunity|originality|idea/i.test(name)) return "idea-lab";
  if (/idea/i.test(name)) return "idea-lab";
  if (/script|outline|retention|fact/i.test(name)) return "script";
  if (/scene/i.test(name)) return "scenes";
  if (/shot|visual/i.test(name)) return "shots";
  if (/voice/i.test(name)) return "voice";
  if (/timeline|preview/i.test(name)) return "timeline";
  if (/qa/i.test(name)) return "qa";
  if (/capcut|export|packaging/i.test(name)) return "export";
  return "project-overview";
}
