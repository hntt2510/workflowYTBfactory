import { useEffect, useState } from "react";
import type { ChannelProfile, FactoryProject } from "@lsf/domain";
import { resolveProductionStatus, resolveWorkflowProgress, workflowProgressStateLabel, workflowStageDefinitions } from "@lsf/domain";
import type { RouteId } from "../../navigation";
import { factoryClient } from "../../services/factoryClient";
import { EmptyState, FormField, MetricCard, PageHeader, SectionCard, StatusBadge } from "../../components/ui";
import type { AssetReviewArtifact, PromptPreparationArtifact, ScenePlanArtifact, VisualRoutingArtifact, VoiceGenerationArtifact } from "../../types";
import { creatorInputModeLabel, creatorStatusLabel } from "../../creatorStudioCopy";
import { characterVersionNeedsSetup, nextSemiAutomaticChain, type SemiAutomaticChain } from "../../semiAutomaticWorkflow";
import { safeRendererError, stageTone, formatTimecode } from "../../utils";
import { stageRoute } from "../projects/ProjectOverview";
import { visualLabel } from "../director/DirectorScreens";

export function ProductionScreen(props: { project: FactoryProject; selectedProfile: ChannelProfile | undefined; setRoute: (route: RouteId) => void; startSemiAutomatic: (chain: SemiAutomaticChain, project: FactoryProject) => Promise<void> }) {
  const status = resolveProductionStatus(props.project);
  const nextChain = nextSemiAutomaticChain(props.project);
  const characterNeedsSetup = characterVersionNeedsSetup(props.project, props.selectedProfile);
  const voiceReady = props.project.stages.find((stage) => stage.id === "voice-generation")?.status === "approved";
  const nextRoute = characterNeedsSetup ? "channel-profiles" : status === "waiting_for_idea" ? "idea-lab" : status === "needs_scene_review" ? "scene-review" : !voiceReady && props.project.stages.find((stage) => stage.id === "asset-review")?.status === "approved" ? "voice" : status === "needs_final_review" ? "final-preview" : "advanced-pipeline";
  const attentionStage = props.project.stages.find((stage) => stage.status === "needs_attention" || stage.status === "failed");
  return <><PageHeader eyebrow="Sản xuất" title="Chuẩn bị video" description="Ứng dụng tự chạy các bước nội bộ và chỉ quay lại khi cần bạn nhập hoặc duyệt." actions={nextChain ? <button className="button primary" type="button" onClick={() => void props.startSemiAutomatic(nextChain, props.project)}>Tiếp tục sản xuất</button> : <button className="button secondary" type="button" onClick={() => props.setRoute(nextRoute)}>{characterNeedsSetup ? "Thiết lập nhân vật kênh" : "Mở bước tiếp theo"}</button>} /><section className="metric-grid"><MetricCard label="Trạng thái sản xuất" value={creatorStatusLabel(status)} tone={status === "needs_attention" || status === "failed" ? "warning" : status === "completed" ? "success" : "info"} /><MetricCard label="Kiểu đầu vào" value={creatorInputModeLabel(props.project.setup.inputMode ?? "topic")} /><MetricCard label="Phong cách" value="VOX Documentary" /><MetricCard label="Số cảnh" value={props.project.scenes.length} /></section><SectionCard title="Việc tiếp theo" description={characterNeedsSetup ? "Duyệt nhân vật kênh trước khi định tuyến hình ảnh tiếp tục." : status === "needs_attention" ? "Một lỗi nội bộ đã lưu cần thao tác rõ ràng trước khi sản xuất tiếp tục." : "Các bước nội bộ không chặn được ẩn khỏi luồng sản xuất mặc định."}><StatusBadge tone={status === "needs_attention" || status === "failed" ? "danger" : "info"}>{creatorStatusLabel(status)}</StatusBadge><p>{characterNeedsSetup ? "Mở Hồ sơ kênh, duyệt nhân vật đang dùng rồi quay lại sản xuất." : status === "waiting_for_idea" ? "Chọn một ý tưởng để xác lập hướng sáng tạo." : status === "needs_scene_review" ? "Duyệt cảnh và chỉ tạo lại cảnh cần thay đổi." : status === "needs_final_review" ? "Kiểm tra bản xem trước thật trước khi xuất." : status === "completed" ? "Dự án đã hoàn tất." : status === "needs_attention" || status === "failed" ? "Mở Pipeline nâng cao để xem lý do an toàn và thao tác thử lại." : "Đang chuẩn bị nội dung và sản xuất."}</p></SectionCard>{attentionStage ? <SectionCard title={`Cần xử lý: ${attentionStage.name}`} description="Sản xuất dừng ở bước này; các bước phụ thuộc sẽ không chạy cho đến khi thử lại thành công."><p><strong>Giai đoạn ảnh hưởng:</strong> {attentionStage.attention?.phase ?? attentionStage.name}</p><p><strong>Lý do an toàn:</strong> {attentionStage.attention?.safeReason ?? attentionStage.attention?.message ?? "Giai đoạn báo lỗi nhưng không có chi tiết."}</p>{attentionStage.attention?.failedItem ? <p><strong>Mục bị lỗi:</strong> {attentionStage.attention.failedItem}</p> : null}<p><strong>Đề xuất:</strong> {attentionStage.attention?.recommendedAction ?? "Kiểm tra bước"}</p><p><strong>Thao tác thử lại:</strong> {attentionStage.attention?.retryAction ?? "Thử lại bước"}</p><div className="button-row">{(attentionStage.attention?.actions ?? []).map((action) => <button className="button secondary compact" type="button" key={`${action.label}-${action.route ?? "stage"}`} onClick={() => props.setRoute(stageRoute(action.route ?? attentionStage.id))}>{action.label}</button>)}<button className="button primary compact" type="button" onClick={() => props.setRoute(stageRoute(attentionStage.id))}>Mở giai đoạn ảnh hưởng</button></div></SectionCard> : null}<AdvancedPipelineDetails project={props.project} setRoute={props.setRoute} /></>;
}

export function ProductionScriptPanel(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; setRoute: (route: RouteId) => void; startSemiAutomatic: (chain: SemiAutomaticChain, project: FactoryProject) => Promise<void> }) {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  if (!props.project.scriptSections.length) return null;
  const status = resolveProductionStatus(props.project);
  const scriptApproved = props.project.stages.find((stage) => stage.id === "script")?.status === "approved";
  const nextChain = nextSemiAutomaticChain(props.project);
  const nextRoute = status === "needs_scene_review" ? "scene-review" : status === "needs_final_review" ? "final-preview" : "advanced-pipeline";
  async function regenerateScript(): Promise<void> {
    setRunning(true);
    setMessage("");
    try {
      const project = await factoryClient.regenerateScript({ projectId: props.project.id });
      props.setSelectedProject(project);
      setMessage("Đã tạo lại kịch bản. Hãy duyệt trước khi tiếp tục sản xuất.");
    } catch (error) {
      setMessage(`Không thể tạo lại kịch bản: ${safeRendererError(error)}`);
    } finally {
      setRunning(false);
    }
  }
  function continueProduction(): void {
    if (!scriptApproved) {
      props.setRoute("script");
      return;
    }
    if (nextChain) void props.startSemiAutomatic(nextChain, props.project);
    else props.setRoute(nextRoute);
  }
  return <SectionCard title="Kịch bản đã chuẩn bị" description="Xem lời dẫn đã chuẩn bị tại đây. Chỉnh sửa và tạo lại là tuỳ chọn, trừ khi có phát hiện chặn cần xử lý."><div className="script-preview-list">{props.project.scriptSections.map((section) => <article className="script-block" key={section.id}><h3>{section.purpose}</h3><p>{section.narration}</p><small>{section.estimatedSeconds}s · {section.estimatedWords} từ</small></article>)}</div><div className="button-row"><button className="button secondary" type="button" onClick={() => props.setRoute("script")}>Sửa kịch bản</button>{props.project.setup.inputMode !== "existing_script" ? <button className="button secondary" type="button" disabled={running} onClick={() => void regenerateScript()}>{running ? "Đang tạo lại..." : "Tạo lại kịch bản"}</button> : null}<button className="button primary" type="button" onClick={continueProduction}>{scriptApproved ? "Tiếp tục" : "Duyệt kịch bản"}</button></div>{message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}</SectionCard>;
}

function AdvancedPipelineDetails(props: { project: FactoryProject; setRoute: (route: RouteId) => void }) {
  const progress = resolveWorkflowProgress(props.project);
  return <SectionCard title="Advanced Pipeline Details" description="Read-only internal stages, runs, artifacts, and safe failure state for debugging and recovery."><details><summary>Show {workflowStageDefinitions.length} internal stages</summary><div className="workflow-list">{workflowStageDefinitions.map((definition) => { const stage = props.project.stages.find((item) => item.id === definition.id); const presentation = progress.stages.find((item) => item.stageId === definition.id)!; return <div className="workflow-stage" key={definition.id}><span>{definition.order}. {definition.name}</span><StatusBadge tone={stageTone(presentation.state)}>{workflowProgressStateLabel(presentation.state)}</StatusBadge><small>{presentation.state === "not_applicable" ? "Not used for this project input." : presentation.state === "optional" ? "Optional output; it does not block Packaging Export." : `Internal status: ${creatorStatusLabel(presentation.internalStatus)}${stage?.attention?.message ? ` - ${stage.attention.message}` : stage?.dependsOn.length ? ` - Depends on: ${stage.dependsOn.join(", ")}` : ""}`}</small>{definition.id === "preview-render" ? <button className="button secondary compact" type="button" onClick={() => props.setRoute("final-preview")}>Open final preview</button> : definition.id === "capcut-draft" || definition.id === "packaging-export" ? <button className="button secondary compact" type="button" onClick={() => props.setRoute("export")}>Open export</button> : null}</div>; })}</div></details><button className="button secondary compact" type="button" onClick={() => props.setRoute("advanced-pipeline")}>Open diagnostics view</button></SectionCard>;
}

export function AdvancedPipelineScreen(props: { project: FactoryProject; setRoute: (route: RouteId) => void }) {
  return <><PageHeader title="Advanced Pipeline Details" description="Internal stages remain available for debugging, history, and manual recovery." /><AdvancedPipelineDetails project={props.project} setRoute={props.setRoute} /></>;
}

export function SceneReviewScreen(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; setRoute: (route: RouteId) => void }) {
  const [artifacts, setArtifacts] = useState<AssetReviewArtifact[]>([]);
  const [promptArtifacts, setPromptArtifacts] = useState<PromptPreparationArtifact[]>([]);
  const [routingArtifacts, setRoutingArtifacts] = useState<VisualRoutingArtifact[]>([]);
  const [scenePlanArtifacts, setScenePlanArtifacts] = useState<ScenePlanArtifact[]>([]);
  const [voiceArtifacts, setVoiceArtifacts] = useState<VoiceGenerationArtifact[]>([]);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [editingPrompt, setEditingPrompt] = useState<{ shotId: string; positivePrompt: string; negativePrompt: string } | null>(null);
  const [editingDirection, setEditingDirection] = useState<{ shotId: string; framing: string; cameraAngle: string; cameraMovement: string; subjectAction: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh(): Promise<AssetReviewArtifact[]> {
    const [next, prompts, routing, scenePlans, voices] = await Promise.all([
      factoryClient.listAssetReviewArtifacts({ projectId: props.project.id }),
      factoryClient.listPromptPreparationArtifacts({ projectId: props.project.id }),
      factoryClient.listVisualRoutingArtifacts({ projectId: props.project.id }),
      factoryClient.listScenePlanArtifacts({ projectId: props.project.id }),
      factoryClient.listVoiceGenerationArtifacts({ projectId: props.project.id })
    ]);
    setArtifacts(next);
    setPromptArtifacts(prompts);
    setRoutingArtifacts(routing);
    setScenePlanArtifacts(scenePlans);
    setVoiceArtifacts(voices);
    const reviewArtifact = next.find((artifact) => artifact.status === "needs_review") ?? next.find((artifact) => artifact.status === "approved");
    const urls = await Promise.all((reviewArtifact?.payloadJson.assets ?? []).map(async (item) => {
      try {
        return [item.asset.sha256, (await factoryClient.getAssetPreviewUrl({ projectId: props.project.id, artifactId: reviewArtifact!.id, assetSha256: item.asset.sha256 })).url] as const;
      } catch {
        return null;
      }
    }));
    setAssetUrls(Object.fromEntries(urls.filter((item): item is readonly [string, string] => item !== null)));
    return next;
  }

  useEffect(() => { void refresh(); }, [props.project.id]);

  async function perform(action: () => Promise<FactoryProject>, success: string): Promise<FactoryProject | null> {
    setRunning(true);
    setMessage("");
    try {
      const next = await action();
      const updated = await factoryClient.loadProject(props.project.id) ?? next;
      props.setSelectedProject(updated);
      await refresh();
      setMessage(success);
      return updated;
    } catch (error) {
      setMessage(safeRendererError(error, "Scene Review could not save that change. Check the selected item and retry."));
      return null;
    } finally {
      setRunning(false);
    }
  }

  async function approveScene(sceneId: string): Promise<FactoryProject> {
    let refreshed = await refresh();
    let review = refreshed.find((artifact) => artifact.status === "needs_review") ?? refreshed.find((artifact) => artifact.status === "approved");
    if (!review) throw new Error("No reviewable scene assets exist.");
    let pending = review.payloadJson.assets.find((item) => props.project.shots.some((shot) => shot.id === item.asset.shotId && shot.sceneId === sceneId) && item.reviewStatus === "needs_review");
    while (pending) {
      await factoryClient.reviseAssetReview({ projectId: props.project.id, artifactId: review.id, assetSha256: pending.asset.sha256, action: "approve" });
      refreshed = await refresh();
      review = refreshed.find((artifact) => artifact.status === "needs_review") ?? refreshed.find((artifact) => artifact.status === "approved");
      if (!review) break;
      pending = review.payloadJson.assets.find((item) => props.project.shots.some((shot) => shot.id === item.asset.shotId && shot.sceneId === sceneId) && item.reviewStatus === "needs_review");
    }
    refreshed = await refresh();
    review = refreshed.find((artifact) => artifact.status === "needs_review") ?? refreshed.find((artifact) => artifact.status === "approved");
    let unassigned = review?.payloadJson.assets.find((item) => props.project.shots.some((shot) => shot.id === item.asset.shotId && shot.sceneId === sceneId) && item.reviewStatus === "approved" && !item.assignedShotId);
    while (review && unassigned) {
      await factoryClient.reviseAssetReview({ projectId: props.project.id, artifactId: review.id, assetSha256: unassigned.asset.sha256, action: "assign", shotId: unassigned.asset.shotId });
      refreshed = await refresh();
      review = refreshed.find((artifact) => artifact.status === "needs_review") ?? refreshed.find((artifact) => artifact.status === "approved");
      unassigned = review?.payloadJson.assets.find((item) => props.project.shots.some((shot) => shot.id === item.asset.shotId && shot.sceneId === sceneId) && item.reviewStatus === "approved" && !item.assignedShotId);
    }
    refreshed = await refresh();
    const finalReview = refreshed.find((artifact) => artifact.status === "needs_review") ?? refreshed.find((artifact) => artifact.status === "approved");
    if (finalReview?.payloadJson.assets.every((item) => item.reviewStatus === "approved" && Boolean(item.assignedShotId))) {
      if (finalReview.status === "approved") return factoryClient.continueAfterSceneReview({ projectId: props.project.id });
      const approved = await factoryClient.approveAssetReview({ projectId: props.project.id });
      if (approved.setup.workflowMode === "semi_automatic") return factoryClient.continueAfterSceneReview({ projectId: props.project.id });
      return await factoryClient.loadProject(props.project.id) ?? approved;
    }
    return await factoryClient.loadProject(props.project.id) ?? props.project;
  }

  async function revise(input: Parameters<typeof factoryClient.reviseSceneReview>[0], success: string): Promise<void> {
    await perform(() => factoryClient.reviseSceneReview(input), success);
  }

  const review = artifacts.find((artifact) => artifact.status === "needs_review") ?? artifacts.find((artifact) => artifact.status === "approved");
  const promptArtifact = promptArtifacts.find((artifact) => artifact.status === "approved" || artifact.status === "needs_review");
  const routingArtifact = routingArtifacts.find((artifact) => artifact.status === "approved" || artifact.status === "needs_review");
  const scenePlanArtifact = scenePlanArtifacts.find((artifact) => artifact.status === "approved" || artifact.status === "needs_review");
  const voiceArtifact = voiceArtifacts.find((artifact) => artifact.status === "approved" || artifact.status === "needs_review");
  const visualModes = ["reuse", "document", "diagram", "stock_image", "stock_video", "ai_image", "ai_video", "manual_upload"] as const;

  return (
    <>
      <PageHeader title="Scene Review" description="Review real scene media, narration, direction, prompts, and voice readiness. Changes create persisted revisions and stay scoped to the selected scene." actions={<button className="button secondary" type="button" onClick={() => props.setRoute("visuals")}>Open detailed visual controls</button>} />
      {props.project.scenes.length ? <div className="scene-grid">{props.project.scenes.map((scene, index) => {
        const sceneShots = props.project.shots.filter((shot) => shot.sceneId === scene.id);
        const sceneShotIds = new Set(sceneShots.map((shot) => shot.id));
        const items = review?.payloadJson.assets.filter((item) => sceneShotIds.has(item.asset.shotId)) ?? [];
        const ready = items.length > 0 && items.every((item) => item.reviewStatus === "approved" && Boolean(item.assignedShotId));
        const canRegenerate = sceneShots.some((shot) => shot.visualMode === "ai_image");
        return <SectionCard title={`Scene ${index + 1}`} key={scene.id}>
          <p><strong>Narration:</strong> {scene.narration}</p>
          <p><strong>Duration:</strong> {formatTimecode(scene.durationFrames, props.project.timeline.fps)}</p>
          <p><strong>Visual purpose:</strong> {scene.purpose}</p>
          <div className="form-grid">
            <FormField label="VOX scene type" htmlFor={`scene-type-${scene.id}`}>
              <select id={`scene-type-${scene.id}`} value={scene.visualMode} disabled={running || !routingArtifact} onChange={(event) => routingArtifact ? void revise({ projectId: props.project.id, artifactId: routingArtifact.id, action: "change_scene_type", sceneId: scene.id, visualMode: event.target.value as FactoryProject["shots"][number]["visualMode"] }, "VOX scene type updated; regenerate this scene when ready.") : undefined}>
                {visualModes.map((mode) => <option key={mode} value={mode}>{visualLabel(mode)}</option>)}
              </select>
            </FormField>
          </div>
          {sceneShots.length ? sceneShots.map((shot) => {
            const item = items.find((candidate) => candidate.asset.shotId === shot.id);
            const prompt = promptArtifact?.payloadJson.prompts.find((candidate) => candidate.shotId === shot.id);
            const voiceSegment = voiceArtifact?.payloadJson.segments.find((segment) => segment.scriptSectionId === scene.scriptSectionId);
            return <div className="section-card" key={shot.id}>
              <p><strong>{shot.id}</strong> - {shot.purpose}</p>
              <p><strong>Generation prompt:</strong> {prompt?.positivePrompt ?? "Not prepared"}</p>
              <p><strong>Prompt status:</strong> {prompt ? "ready" : "missing"} - <strong>Voice segment:</strong> {voiceSegment ? (voiceArtifact?.status === "approved" ? "ready" : creatorStatusLabel(voiceArtifact?.status ?? "pending")) : "pending"}</p>
              {item ? <div><p><strong>Asset status:</strong> {creatorStatusLabel(item.reviewStatus)} {item.assignedShotId ? `- assigned to ${item.assignedShotId}` : "- unassigned"}</p>{assetUrls[item.asset.sha256] ? <img src={assetUrls[item.asset.sha256]} alt={`Preview for ${shot.id}`} style={{ maxWidth: "100%", maxHeight: 240, objectFit: "contain" }} /> : <StatusBadge tone="warning">Preview unavailable</StatusBadge>}</div> : <StatusBadge tone="warning">No generated asset yet</StatusBadge>}
              <div className="button-row">
                {promptArtifact ? <button className="button compact" type="button" disabled={running} onClick={() => setEditingPrompt({ shotId: shot.id, positivePrompt: prompt?.positivePrompt ?? "", negativePrompt: prompt?.negativePrompt ?? "" })}>Edit Prompt</button> : null}
                {routingArtifact ? <button className="button compact" type="button" disabled={running} onClick={() => setEditingDirection({ shotId: shot.id, framing: shot.framing, cameraAngle: shot.cameraAngle, cameraMovement: shot.cameraMovement, subjectAction: shot.subjectAction })}>Adjust Direction</button> : null}
                {review?.status === "needs_review" ? <button className="button secondary compact" type="button" disabled={running || !review} onClick={() => void perform(() => factoryClient.selectManualAssetUpload({ projectId: props.project.id, artifactId: review!.id, shotId: shot.id }), "Replacement image imported and ready for review.")}>Upload Replacement</button> : null}
                {item?.reviewStatus === "needs_review" && review?.status === "needs_review" ? <button className="button compact" type="button" disabled={running} onClick={() => void perform(() => factoryClient.reviseAssetReview({ projectId: props.project.id, artifactId: review!.id, assetSha256: item.asset.sha256, action: "approve" }), "Scene asset approved.")}>Approve Asset</button> : null}
                {item?.reviewStatus === "approved" && !item.assignedShotId && review?.status === "needs_review" ? <button className="button compact" type="button" disabled={running} onClick={() => void perform(() => factoryClient.reviseAssetReview({ projectId: props.project.id, artifactId: review!.id, assetSha256: item.asset.sha256, action: "assign", shotId: item.asset.shotId }), "Scene asset assigned.")}>Assign Asset</button> : null}
              </div>
              {editingPrompt?.shotId === shot.id ? <div className="form-grid"><FormField label="Positive prompt" htmlFor={`prompt-positive-${shot.id}`}><textarea id={`prompt-positive-${shot.id}`} value={editingPrompt.positivePrompt} onChange={(event) => setEditingPrompt({ ...editingPrompt, positivePrompt: event.target.value })} /></FormField><FormField label="Negative prompt" htmlFor={`prompt-negative-${shot.id}`}><textarea id={`prompt-negative-${shot.id}`} value={editingPrompt.negativePrompt} onChange={(event) => setEditingPrompt({ ...editingPrompt, negativePrompt: event.target.value })} /></FormField><div className="button-row"><button className="button primary compact" type="button" disabled={running || !promptArtifact} onClick={() => promptArtifact && void revise({ projectId: props.project.id, artifactId: promptArtifact.id, action: "edit_prompt", shotId: shot.id, positivePrompt: editingPrompt.positivePrompt, negativePrompt: editingPrompt.negativePrompt }, "Generation prompt updated; regenerate this scene when ready.").then(() => setEditingPrompt(null))}>Save Prompt</button><button className="button secondary compact" type="button" onClick={() => setEditingPrompt(null)}>Cancel</button></div></div> : null}
              {editingDirection?.shotId === shot.id ? <div className="form-grid"><FormField label="Framing" htmlFor={`direction-framing-${shot.id}`}><input id={`direction-framing-${shot.id}`} value={editingDirection.framing} onChange={(event) => setEditingDirection({ ...editingDirection, framing: event.target.value })} /></FormField><FormField label="Camera angle" htmlFor={`direction-angle-${shot.id}`}><input id={`direction-angle-${shot.id}`} value={editingDirection.cameraAngle} onChange={(event) => setEditingDirection({ ...editingDirection, cameraAngle: event.target.value })} /></FormField><FormField label="Camera movement" htmlFor={`direction-movement-${shot.id}`}><input id={`direction-movement-${shot.id}`} value={editingDirection.cameraMovement} onChange={(event) => setEditingDirection({ ...editingDirection, cameraMovement: event.target.value })} /></FormField><FormField label="Subject action" htmlFor={`direction-action-${shot.id}`}><textarea id={`direction-action-${shot.id}`} value={editingDirection.subjectAction} onChange={(event) => setEditingDirection({ ...editingDirection, subjectAction: event.target.value })} /></FormField><div className="button-row"><button className="button primary compact" type="button" disabled={running || !routingArtifact} onClick={() => routingArtifact && void revise({ projectId: props.project.id, artifactId: routingArtifact.id, action: "edit_direction", shotId: shot.id, framing: editingDirection.framing, cameraAngle: editingDirection.cameraAngle, cameraMovement: editingDirection.cameraMovement, subjectAction: editingDirection.subjectAction }, "Scene direction updated; regenerate this scene when ready.").then(() => setEditingDirection(null))}>Save Direction</button><button className="button secondary compact" type="button" onClick={() => setEditingDirection(null)}>Cancel</button></div></div> : null}
            </div>;
          }) : <StatusBadge tone="warning">No shots are assigned to this scene.</StatusBadge>}
          <div className="button-row"><button className="button secondary compact" type="button" disabled={running || !canRegenerate} title={canRegenerate ? undefined : "Regeneration is available only for scenes with AI Image media."} onClick={() => void perform(() => factoryClient.retryScene({ projectId: props.project.id, sceneId: scene.id }), "Scene regeneration is ready for review.")}>Regenerate Scene</button><button className="button primary compact" type="button" disabled={running || !ready} onClick={() => void perform(() => approveScene(scene.id), "Scene approved.").then((updated) => { if (updated?.stages.find((stage) => stage.id === "asset-review")?.status === "approved") props.setRoute("project-overview"); })}>Approve Scene</button>{scenePlanArtifact && props.project.scenes.length > 1 ? <button className="button danger compact" type="button" disabled={running} onClick={() => { if (window.confirm("Remove this scene and its dependent media?")) void revise({ projectId: props.project.id, artifactId: scenePlanArtifact.id, action: "remove_scene", sceneId: scene.id }, "Scene removed; affected media and preview are stale."); }}>Remove Scene</button> : null}</div>
        </SectionCard>;
      })}</div> : <EmptyState title="Cảnh chưa sẵn sàng" detail="Danh sách cảnh sẽ xuất hiện sau khi hoàn tất chuẩn bị nội dung." action={<button className="button primary" type="button" onClick={() => props.setRoute("production")}>Quay lại sản xuất</button>} />}
      {message ? <p className={message.toLowerCase().includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}
    </>
  );
}
