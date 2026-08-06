import { useEffect, useState } from "react";
import type { FactoryProject } from "@lsf/domain";
import { resolveStageEligibilities } from "@lsf/domain";
import { factoryClient } from "../../services/factoryClient";
import { DataTable, DisabledAction, EmptyState, PageHeader, SectionCard, StatusBadge, TagList } from "../../components/ui";
import type {
  AssetAcquisitionArtifact,
  AssetConceptArtifact,
  AssetReviewArtifact,
  ImageModelCertificationResponse,
  PromptPreparationArtifact,
  ScenePlanArtifact,
  ShotPlanArtifact,
  TextModelCertificationResponse,
  VisualRoutingArtifact
} from "../../types";
import { formatTimecode, safeRendererError } from "../../utils";
import { creatorStatusLabel } from "../../creatorStudioCopy";
import type { SemiAutomaticChain } from "../../semiAutomaticWorkflow";
import { AssetIntakePanel } from "../assets/AssetIntakePanel";
import { StageStatusHeader, canRetryStage } from "../../components/workflow";
import type { RouteId } from "../../navigation";

type StoryboardFrameSpec = NonNullable<PromptPreparationArtifact["payloadJson"]["scenePrompts"]>[number]["frameManifest"][number];

export function ScenesScreen(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; setRoute: (route: RouteId) => void; textCertification: TextModelCertificationResponse }) {
  const [artifacts, setArtifacts] = useState<ScenePlanArtifact[]>([]); const [running, setRunning] = useState(false); const [message, setMessage] = useState("");
  const eligibility = resolveStageEligibilities(props.project, { textVerified: props.textCertification.status === "verified" }).find((stage) => stage.stageId === "scene-plan")!;
  const refresh = () => factoryClient.listScenePlanArtifacts({ projectId: props.project.id }).then(setArtifacts);
  useEffect(() => { void refresh().catch(() => setArtifacts([])); }, [props.project.id]);
  async function perform(action: () => Promise<FactoryProject>, success: string) { setRunning(true); try { props.setSelectedProject(await action()); await refresh(); setMessage(success); } catch (error) { setMessage(safeRendererError(error)); } finally { setRunning(false); } }
  return (
    <>
      <PageHeader title="Cảnh" description="Duyệt các cảnh theo mốc thời gian từ kịch bản và kiểm tra giữ chân đã duyệt." actions={eligibility.runnable ? <button className="button primary" type="button" onClick={() => void perform(() => factoryClient.runScenePlan({ projectId: props.project.id }), "Kế hoạch cảnh đã sẵn sàng để duyệt.")} disabled={running}>Lập kế hoạch cảnh</button> : <DisabledAction reason={eligibility.blockingReasons[0]?.message ?? "Kế hoạch cảnh chưa thể chạy."}>Lập kế hoạch cảnh</DisabledAction>} />
      <StageStatusHeader stageName="Scene Plan" stageNumber={15} eligibility={eligibility} dependencies={["Approved Retention Review"]} purpose="Create frame-timed scenes without creating assets or shots." />
      <SectionCard title="Duyệt kế hoạch cảnh">{artifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge>{artifact.payloadJson.scenes.map((scene) => <p key={scene.id}>{scene.purpose}: {scene.startFrame} + {scene.durationFrames} frame</p>)}{artifact.status === "needs_review" ? <div className="button-row">{eligibility.approvable ? <button className="button compact" type="button" onClick={() => void perform(() => factoryClient.approveScenePlan({ projectId: props.project.id }), "Kế hoạch cảnh đã được duyệt.")} disabled={running}>Duyệt kế hoạch cảnh</button> : <DisabledAction reason={eligibility.blockingReasons[0]?.message ?? "Kế hoạch cảnh chưa thể duyệt."}>Duyệt kế hoạch cảnh</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void perform(() => factoryClient.rejectScenePlan({ projectId: props.project.id }), "Kế hoạch cảnh đã bị từ chối.")} disabled={running}>Từ chối kế hoạch</button></div> : null}</div>)}{message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}</SectionCard>
      <div className="card-grid">
        {props.project.scenes.map((scene) => (
          <SectionCard key={scene.id} className="compact-card">
            <SceneCard scene={scene} shots={props.project.shots.filter((shot) => shot.sceneId === scene.id)} fps={props.project.timeline.fps} status={eligibility.status} onOpenStoryboard={() => props.setRoute("shots")} />
          </SectionCard>
        ))}
      </div>
    </>
  );
}

function SceneCard(props: { scene: FactoryProject["scenes"][number]; shots: FactoryProject["shots"]; fps: number; status: string; onOpenStoryboard: () => void }) {
  const firstShot = props.shots[0];
  const lastShot = props.shots.at(-1);
  const requiredImageCount = props.shots.filter((shot) => shot.visualMode !== "reuse").length;
  const stateBefore = summarizeState(firstShot?.startState, "Thiết lập câu chuyện");
  const stateAfter = summarizeState(lastShot?.endState, "Trạng thái sau cảnh");
  const dramaticChange = props.shots.map((shot) => shot.subjectAction).filter(Boolean).join(" -> ") || "Chưa nêu thay đổi chính";
  const transition = props.scene.continuityRefs.length ? `Tiếp nối từ ${props.scene.continuityRefs.join(", ")}` : "Mở đầu cảnh mới";
  return <div className="scene-card">
    <div className="scene-card-heading"><div><strong>{props.scene.id}</strong><span>{props.scene.purpose}</span></div><StatusBadge tone={props.status === "approved" ? "success" : "info"}>{creatorStatusLabel(props.status)}</StatusBadge></div>
    <p className="scene-narration">{props.scene.narration}</p>
    <dl className="scene-details">
      <div><dt>Trạng thái trước</dt><dd>{stateBefore}</dd></div>
      <div><dt>Thay đổi chính</dt><dd>{dramaticChange}</dd></div>
      <div><dt>Trạng thái sau</dt><dd>{stateAfter}</dd></div>
      <div><dt>Cung cảm xúc</dt><dd>{props.scene.emotionalState}</dd></div>
      <div><dt>Khoảng lời dẫn</dt><dd>{formatTimecode(props.scene.startFrame, props.fps)} - {formatTimecode(props.scene.startFrame + props.scene.durationFrames, props.fps)}</dd></div>
      <div><dt>Thời lượng / ảnh</dt><dd>{(props.scene.durationFrames / props.fps).toFixed(1)}s · {requiredImageCount} ảnh mới / {props.shots.length} frame</dd></div>
      <div><dt>Ý đồ âm thanh</dt><dd>Nhấn rõ lời dẫn và tạo một nhịp thở sau bước ngoặt của cảnh.</dd></div>
      <div><dt>Chuyển cảnh</dt><dd>{transition}</dd></div>
    </dl>
    <div className="button-row"><button className="button primary compact" type="button" onClick={props.onOpenStoryboard}>Mở storyboard</button></div>
  </div>;
}

function summarizeState(state: Record<string, unknown> | undefined, fallback: string): string {
  if (!state || Object.keys(state).length === 0) return fallback;
  return Object.entries(state).slice(0, 2).map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value) ?? "set"}`).join(" · ");
}

export function ShotsScreen(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; textCertification: TextModelCertificationResponse }) {
  const [view, setView] = useState<"board" | "table" | "timeline">("board"); const [artifacts, setArtifacts] = useState<ShotPlanArtifact[]>([]); const [running, setRunning] = useState(false); const [message, setMessage] = useState("");
  const [frameSpecs, setFrameSpecs] = useState<StoryboardFrameSpec[]>([]);
  const eligibility = resolveStageEligibilities(props.project, { textVerified: props.textCertification.status === "verified" }).find((stage) => stage.stageId === "shot-plan")!;
  const refresh = async () => {
    const [nextArtifacts, promptArtifacts] = await Promise.all([
      factoryClient.listShotPlanArtifacts({ projectId: props.project.id }),
      factoryClient.listPromptPreparationArtifacts({ projectId: props.project.id })
    ]);
    setArtifacts(nextArtifacts);
    const latestPrompt = promptArtifacts.find((artifact) => artifact.status === "needs_review" || artifact.status === "approved") ?? promptArtifacts.at(-1);
    setFrameSpecs(latestPrompt?.payloadJson.scenePrompts?.flatMap((scenePrompt) => scenePrompt.frameManifest) ?? []);
  };
  useEffect(() => { void refresh().catch(() => setArtifacts([])); }, [props.project.id]);
  async function perform(action: () => Promise<FactoryProject>, success: string) { setRunning(true); try { props.setSelectedProject(await action()); await refresh(); setMessage(success); } catch (error) { setMessage(safeRendererError(error)); } finally { setRunning(false); } }
  return (
    <>
      <PageHeader
        title="Storyboard"
        description="Duyệt từng frame theo thời gian từ kế hoạch cảnh đã duyệt."
        actions={
          <><div className="segmented">{(["board", "table", "timeline"] as const).map((item) => <button className={view === item ? "active" : ""} key={item} onClick={() => setView(item)} type="button">{item === "board" ? "Bảng cảnh" : item === "table" ? "Danh sách" : "Timeline"}</button>)}</div>{eligibility.runnable ? <button className="button primary" type="button" onClick={() => void perform(() => factoryClient.runShotPlan({ projectId: props.project.id }), "Storyboard đã sẵn sàng để duyệt.")} disabled={running}>Lập storyboard</button> : <DisabledAction reason={eligibility.blockingReasons[0]?.message ?? "Storyboard chưa thể chạy."}>Lập storyboard</DisabledAction>}</>
        }
      />
      <StageStatusHeader stageName="Shot Plan" stageNumber={16} eligibility={eligibility} dependencies={["Approved Scene Plan"]} purpose="Create frame-timed shots without creating or assigning assets." />
      <SectionCard title="Duyệt storyboard">{artifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge>{artifact.payloadJson.shots.map((shot) => <p key={shot.id}>{shot.purpose}: {shot.startFrame} + {shot.durationFrames} frame</p>)}{artifact.status === "needs_review" ? <div className="button-row">{eligibility.approvable ? <button className="button compact" type="button" onClick={() => void perform(() => factoryClient.approveShotPlan({ projectId: props.project.id }), "Storyboard đã được duyệt.")} disabled={running}>Duyệt storyboard</button> : <DisabledAction reason={eligibility.blockingReasons[0]?.message ?? "Storyboard chưa thể duyệt."}>Duyệt storyboard</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void perform(() => factoryClient.rejectShotPlan({ projectId: props.project.id }), "Storyboard đã bị từ chối.")} disabled={running}>Từ chối storyboard</button></div> : null}</div>)}{message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}</SectionCard>
      {view === "board" ? (
        <div className="shot-board">
          {[...props.project.shots]
            .sort((left, right) => left.startFrame - right.startFrame || left.order - right.order)
            .map((shot, index) => <StoryboardFrameCard key={shot.id} shot={shot} frameNumber={index + 1} frameSpec={frameSpecs.find((frame) => frame.shotId === shot.id)} />)}
        </div>
      ) : (
        <DataTable label="Storyboard frame">
          <thead><tr><th>Frame</th><th>Cảnh</th><th>Bắt đầu</th><th>Thời lượng</th><th>Bố cục</th><th>Máy quay</th><th>Ảnh</th></tr></thead>
          <tbody>
            {props.project.shots.map((shot) => (
              <tr key={shot.id}>
                <td>{shot.id}</td>
                <td>{shot.sceneId}</td>
                <td>{formatTimecode(shot.startFrame, shot.fps)}</td>
                <td>{formatTimecode(shot.durationFrames, shot.fps)} / {shot.durationFrames} frames</td>
                <td>{shot.framing}</td>
                <td>{shot.cameraAngle}</td>
                <td><StatusBadge tone="warning">Chưa gán</StatusBadge></td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </>
  );
}

function StoryboardFrameCard(props: { shot: FactoryProject["shots"][number]; frameNumber: number; frameSpec: StoryboardFrameSpec | undefined }) {
  const shot = props.shot;
  const frameSpec = props.frameSpec;
  const expression = stateValue(shot.startState, ["expression", "facialExpression", "emotion"])
    ?? stateValue(shot.endState, ["expression", "facialExpression", "emotion"])
    ?? "Chưa nêu";
  const continuityRefs = frameSpec?.continuityRefs ?? shot.continuityRefs;
  const continuity = continuityRefs.length ? continuityRefs.join(", ") : "Tham chiếu mới";
  const role = frameSpec?.role ?? storyboardRole(shot);
  const displayNumber = frameSpec?.displayNumber ?? String(props.frameNumber).padStart(3, "0");
  return (
    <article className="storyboard-frame-card">
      <div className="storyboard-frame-thumb" aria-label={`Ô ảnh frame ${displayNumber}`}>
        {shot.approvedAssetId ? "Đã gán ảnh" : "Chờ tải ảnh"}
      </div>
      <div className="storyboard-frame-header">
        <div>
          <strong>{displayNumber} · {shot.id}</strong>
          <span>{shot.sceneId} · {role}</span>
        </div>
        <StatusBadge tone={shot.approvedAssetId ? "success" : "warning"}>{shot.approvedAssetId ? "Ảnh sẵn sàng" : "Cần ảnh"}</StatusBadge>
      </div>
      <dl className="storyboard-frame-details">
        <div><dt>Mục đích</dt><dd>{frameSpec?.purpose ?? shot.purpose}</dd></div>
        <div><dt>Bố cục</dt><dd>{shot.framing} · {shot.cameraAngle}</dd></div>
        <div><dt>Hành động nhân vật</dt><dd>{shot.subjectAction || "Chưa nêu"}</dd></div>
        <div><dt>Biểu cảm</dt><dd>{expression}</dd></div>
        <div><dt>Nguồn continuity</dt><dd>{continuity}</dd></div>
        <div><dt>Ý đồ chuyển động</dt><dd>{shot.motion ? motionLabel(shot.motion.effect) : shot.cameraMovement || "Không có"}</dd></div>
        <div><dt>Lời dẫn / khoảng thời gian</dt><dd>{formatTimecode(shot.startFrame, shot.fps)} - {formatTimecode(shot.startFrame + shot.durationFrames, shot.fps)} · {(shot.durationFrames / shot.fps).toFixed(1)}s</dd></div>
        <div><dt>Quan hệ chuyển cảnh</dt><dd>{continuityRefs.length ? "Tiếp nối frame được tham chiếu" : "Mở đầu cảnh"}</dd></div>
        {frameSpec?.expectedFilename ? <div><dt>Tên file gợi ý</dt><dd>{frameSpec.expectedFilename}</dd></div> : null}
      </dl>
    </article>
  );
}

function stateValue(state: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = state[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function storyboardRole(shot: FactoryProject["shots"][number]): string {
  if (shot.visualMode === "reuse") return "REUSE";
  if (shot.visualMode === "diagram" || shot.visualMode === "text_card") return "GRAPHIC";
  if (shot.visualMode === "document") return "INSERT";
  if (shot.order === 0) return "BASE";
  return "ACTION_KEYFRAME";
}

export function VisualsScreen(props: { project: FactoryProject; textCertification: TextModelCertificationResponse; imageCertification: ImageModelCertificationResponse; setSelectedProject: (project: FactoryProject | null) => void; setImageCertification: (certification: ImageModelCertificationResponse) => void; startSemiAutomatic: (chain: SemiAutomaticChain, project: FactoryProject) => Promise<void>; surface?: "prompt-studio" | "asset-intake"; showHeader?: boolean }) {
  const [artifacts, setArtifacts] = useState<VisualRoutingArtifact[]>([]);
  const [conceptArtifacts, setConceptArtifacts] = useState<AssetConceptArtifact[]>([]);
  const [promptArtifacts, setPromptArtifacts] = useState<PromptPreparationArtifact[]>([]);
  const [assetArtifacts, setAssetArtifacts] = useState<AssetAcquisitionArtifact[]>([]);
  const [assetReviewArtifacts, setAssetReviewArtifacts] = useState<AssetReviewArtifact[]>([]);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const visualModes = ["reuse", "document", "diagram", "stock_image", "stock_video", "ai_image", "ai_video", "manual_upload"] as const;
  const motionEffects = ["none", "slide_up", "slide_down", "pan_left", "pan_right", "zoom_in", "zoom_out", "pop", "dissolve"] as const;
  const characterFirst = props.project.setup.visualWorkflow === "character_first";
  const eligibility = resolveStageEligibilities(props.project).find((stage) => stage.stageId === "visual-routing")!;
  const promptEligibility = resolveStageEligibilities(props.project, { textVerified: props.textCertification.status === "verified" }).find((stage) => stage.stageId === "prompt-preparation")!;
  const conceptEligibility = resolveStageEligibilities(props.project, { textVerified: props.textCertification.status === "verified" }).find((stage) => stage.stageId === "asset-concepts")!;
  const assetEligibility = resolveStageEligibilities(props.project, { imageVerified: props.imageCertification.status === "verified" }).find((stage) => stage.stageId === "asset-acquisition")!;
  const assetReviewEligibility = resolveStageEligibilities(props.project).find((stage) => stage.stageId === "asset-review")!;
  const latestPrompt = promptArtifacts.find((artifact) => artifact.status === "needs_review" || artifact.status === "approved") ?? promptArtifacts.at(-1);
  const latestReview = assetReviewArtifacts.find((artifact) => artifact.status === "needs_review") ?? assetReviewArtifacts.find((artifact) => artifact.status === "approved") ?? assetReviewArtifacts.at(-1);
  const reviewItems = latestReview?.payloadJson.assets ?? [];
  const requiredShots = props.project.shots.filter((shot) => shot.visualMode !== "reuse");
  const itemForShot = (shotId: string) => reviewItems.find((item) => item.reviewStatus !== "rejected" && (item.assignedShotId === shotId || (!item.assignedShotId && item.asset.shotId === shotId)));
  const mappedShotIds = new Set(reviewItems.filter((item) => item.reviewStatus === "approved" && item.assignedShotId).map((item) => item.assignedShotId));
  const missingCount = requiredShots.filter((shot) => !mappedShotIds.has(shot.id)).length;
  const warningCount = reviewItems.filter((item) => item.warnings?.length).length;
  const orphanCount = reviewItems.filter((item) => !props.project.shots.some((shot) => shot.id === (item.assignedShotId ?? item.asset.shotId))).length;
  const assetConceptsReady = conceptArtifacts.some((artifact) => artifact.status === "approved");
  const refresh = async () => {
    const [routing, concepts, prompts, assets, reviews] = await Promise.all([
      factoryClient.listVisualRoutingArtifacts({ projectId: props.project.id }),
      factoryClient.listAssetConceptsArtifacts({ projectId: props.project.id }),
      factoryClient.listPromptPreparationArtifacts({ projectId: props.project.id }),
      factoryClient.listAssetAcquisitionArtifacts({ projectId: props.project.id }),
      factoryClient.listAssetReviewArtifacts({ projectId: props.project.id })
    ]);
    setArtifacts(routing); setConceptArtifacts(concepts); setPromptArtifacts(prompts); setAssetArtifacts(assets); setAssetReviewArtifacts(reviews);
  };
  useEffect(() => { void refresh().catch(() => { setArtifacts([]); setConceptArtifacts([]); setPromptArtifacts([]); setAssetArtifacts([]); setAssetReviewArtifacts([]); }); }, [props.project.id]);
  async function perform(action: () => Promise<FactoryProject>, success: string) {
    setRunning(true);
    try { props.setSelectedProject(await action()); await refresh(); setMessage(success); }
    catch (error) { setMessage(safeRendererError(error)); }
    finally { setRunning(false); }
  }

  async function copyScenePrompt(promptText: string) {
    try { await navigator.clipboard.writeText(promptText); setMessage("Đã copy prompt cho cảnh."); }
    catch { setMessage("Không thể copy tự động. Hãy chọn và copy prompt thủ công."); }
  }
  return <>
    {props.showHeader !== false ? <PageHeader title={props.surface === "asset-intake" ? "Nhập và duyệt ảnh" : props.surface === "prompt-studio" ? "Prompt Studio" : characterFirst ? "Đạo diễn & tài sản" : "Nguồn hình ảnh"} description={props.surface === "asset-intake" ? "Upload ảnh bạn đã tạo ở GG Lab, sửa mapping khi cần và duyệt từng frame." : props.surface === "prompt-studio" ? "Một prompt hoàn chỉnh cho mỗi scene, sẵn sàng copy sang GG Lab." : characterFirst ? "Chốt storyboard, copy prompt theo cảnh, rồi tải ảnh bạn đã tạo từ GG Lab lên." : "Chọn hướng hình ảnh cho storyboard trước khi tạo prompt hoặc nhập ảnh."} actions={!props.surface && canRetryStage(eligibility) ? <button className="button primary" type="button" onClick={() => void perform(() => factoryClient.runVisualRouting({ projectId: props.project.id }), eligibility.status === "failed" || eligibility.status === "needs_attention" ? "Định tuyến hình ảnh đã sẵn sàng để thử lại." : "Định tuyến hình ảnh đã sẵn sàng để duyệt.")} disabled={running}>{eligibility.status === "failed" || eligibility.status === "needs_attention" ? "Thử lại định tuyến" : "Chạy định tuyến hình ảnh"}</button> : !props.surface ? <DisabledAction reason={eligibility.blockingReasons[0]?.message ?? "Định tuyến hình ảnh chưa thể chạy."}>Chạy định tuyến hình ảnh</DisabledAction> : undefined} /> : null}
    {!props.surface ? <>
      <StageStatusHeader stageName="Visual Routing" stageNumber={16} eligibility={eligibility} dependencies={["Approved Shot Plan"]} purpose="Assign one visual strategy and one motion intent to every storyboard frame. This stage never creates an image." />
      <SectionCard title="Định tuyến storyboard" description="Mỗi frame có một mục đích rõ ràng. Chuyển động chỉ là hướng dựng trong FFmpeg/CapCut, không thay thế frame mới khi câu chuyện cần đổi trạng thái.">
        {artifacts.map((artifact) => <div key={artifact.id} className="studio-stack"><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge>{artifact.payloadJson.shots.map((shot) => <div className="storyboard-row" key={shot.id}><div><strong>{shot.id}</strong><span>{shot.sceneId} · {shot.semanticBeat ?? shot.purpose}</span></div>{artifact.status === "needs_review" ? <div className="row-actions"><select aria-label={`Visual mode for ${shot.id}`} value={shot.visualMode} disabled={running} onChange={(event) => void perform(() => factoryClient.editVisualRouting({ projectId: props.project.id, artifactId: artifact.id, shotId: shot.id, visualMode: event.target.value as FactoryProject["shots"][number]["visualMode"], ...(shot.motion ? { motionEffect: shot.motion.effect } : {}) }), "Đã lưu hướng visual.")}>{visualModes.map((mode) => <option key={mode} value={mode}>{visualLabel(mode)}</option>)}</select><select aria-label={`Motion effect for ${shot.id}`} value={shot.motion?.effect ?? "none"} disabled={running} onChange={(event) => void perform(() => factoryClient.editVisualRouting({ projectId: props.project.id, artifactId: artifact.id, shotId: shot.id, visualMode: shot.visualMode as FactoryProject["shots"][number]["visualMode"], motionEffect: event.target.value as NonNullable<FactoryProject["shots"][number]["motion"]>["effect"] }), "Đã lưu motion override.")}>{motionEffects.map((effect) => <option key={effect} value={effect}>{motionLabel(effect)}</option>)}</select></div> : <span className="storyboard-meta">{visualLabel(shot.visualMode)} · {motionLabel(shot.motion?.effect ?? "none")}</span>}</div>)}{artifact.status === "needs_review" ? <div className="button-row"><button className="button compact" type="button" onClick={() => void perform(() => factoryClient.approveVisualRouting({ projectId: props.project.id }), "Đã duyệt storyboard routing.")} disabled={running || !eligibility.approvable}>Duyệt hướng hình ảnh</button><button className="button danger compact" type="button" onClick={() => void perform(() => factoryClient.rejectVisualRouting({ projectId: props.project.id }), "Đã từ chối storyboard routing.")}>Từ chối</button></div> : null}</div>)}
        {message ? <p className={message.toLowerCase().includes("failed") || message.toLowerCase().includes("không") ? "error-message" : "safe-message"}>{message}</p> : null}
      </SectionCard>
      <StageStatusHeader stageName="Asset Concepts" stageNumber={20} eligibility={conceptEligibility} dependencies={["Approved Visual Routing", "Approved Character Pack"]} purpose="Xác định concept hình ảnh có thể tái sử dụng trước khi biên soạn prompt." />
      <SectionCard title="Concept hình ảnh" description="Các concept được tạo cục bộ cho quy trình thủ công; model chữ chỉ là tuỳ chọn ở pipeline cũ.">
        {canRetryStage(conceptEligibility) || (conceptEligibility.status === "approved" && !assetConceptsReady) ? <button className="button primary" type="button" disabled={running} onClick={() => void perform(() => factoryClient.runAssetConcepts({ projectId: props.project.id }), "Concept hình ảnh đã sẵn sàng.")}>{conceptEligibility.status === "failed" || conceptEligibility.status === "needs_attention" ? "Thử lại concept" : "Tạo concept"}</button> : null}
        {conceptArtifacts.map((artifact) => <div key={artifact.id} className="studio-stack"><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge><div className="card-grid">{artifact.payloadJson.concepts.map((concept) => <article className="shot-card studio-card" key={concept.id}><strong>{concept.role}</strong><span>{concept.shotId} · {concept.semanticBeat}</span><p>{concept.description}</p><small>{concept.motionIntent}</small><TagList items={concept.visualConstraints.concat(concept.colorPalette)} limit={6} /></article>)}</div></div>)}
      </SectionCard>
    </> : null}
    {!props.surface ? <StageStatusHeader stageName="Prompt Studio" stageNumber={21} eligibility={promptEligibility} dependencies={["Approved Asset Concepts"]} purpose="Một cảnh, một prompt hoàn chỉnh để copy sang GG Lab. Ứng dụng không tự tạo ảnh." /> : null}
    <SectionCard title="Prompt Studio theo cảnh" description="Mỗi prompt hướng dẫn GG Lab tạo nhiều frame riêng, đánh số toàn cục và dùng frame trước làm tham chiếu nội bộ.">
      {promptEligibility.runnable ? <button className="button primary" type="button" onClick={() => void perform(() => factoryClient.runPromptPreparation({ projectId: props.project.id }), "Prompt theo cảnh đã sẵn sàng để copy.")} disabled={running}>Tạo prompt theo cảnh</button> : null}
      {latestPrompt?.payloadJson.scenePrompts?.length ? <div className="prompt-studio-grid">{latestPrompt.payloadJson.scenePrompts.map((scenePrompt) => <article className="prompt-card" key={scenePrompt.sceneId}><div className="prompt-card-header"><div><strong>{scenePrompt.sceneId}</strong><span>{scenePrompt.frameNumbers.join(" · ")} · {scenePrompt.expectedAspectRatio}</span></div><div className="button-row"><button className="button compact" type="button" onClick={() => void copyScenePrompt(scenePrompt.promptText)}>Copy prompt</button><button className="button secondary compact" type="button" disabled={running || promptEligibility.status !== "approved"} title={promptEligibility.status !== "approved" ? "Hãy duyệt prompt hiện tại trước khi tạo lại riêng scene này." : undefined} onClick={() => void perform(() => factoryClient.runPromptPreparation({ projectId: props.project.id, sceneId: scenePrompt.sceneId }), `Đã tạo lại prompt cho ${scenePrompt.sceneId}.`)}>Tạo lại scene</button></div></div><textarea readOnly value={scenePrompt.promptText} aria-label={`Prompt cho ${scenePrompt.sceneId}`} /><div className="prompt-meta"><span>Tham chiếu: {scenePrompt.referenceInstructions.length}</span><span>Khoá continuity: {scenePrompt.continuityLocks.length}</span></div></article>)}</div> : latestPrompt?.payloadJson.prompts.length ? <div className="studio-stack">{latestPrompt.payloadJson.prompts.map((prompt) => <article className="prompt-card" key={prompt.shotId}><div className="prompt-card-header"><strong>{prompt.shotId}</strong><button className="button compact" type="button" onClick={() => void copyScenePrompt(prompt.positivePrompt)}>Copy prompt</button></div><p>{prompt.positivePrompt}</p></article>)}</div> : <EmptyState title="Chưa có prompt" detail="Duyệt định tuyến và tạo concept hình ảnh trước khi tạo prompt." />}
      {latestPrompt?.status === "needs_review" ? <div className="button-row"><button className="button compact" type="button" onClick={() => void perform(() => factoryClient.approvePromptPreparation({ projectId: props.project.id }), "Đã duyệt prompt theo cảnh.")} disabled={running || !promptEligibility.approvable}>Duyệt prompt</button><button className="button danger compact" type="button" onClick={() => void perform(() => factoryClient.rejectPromptPreparation({ projectId: props.project.id }), "Đã từ chối prompt theo cảnh.")} disabled={running}>Từ chối</button></div> : null}
    </SectionCard>
    {props.surface === "prompt-studio" ? null : props.surface === "asset-intake" || characterFirst ? <>
      <SectionCard title="Asset Intake" description="Tạo ảnh thủ công trong GG Lab, sau đó kéo thả hoặc chọn nhiều file tại đây. File 001, 002... sẽ tự map theo thứ tự storyboard.">
        <AssetIntakePanel
          project={props.project}
          latestPrompt={latestPrompt}
          latestReview={latestReview}
          requiredShots={requiredShots}
          reviewItems={reviewItems}
          itemForShot={itemForShot}
          missingCount={missingCount}
          warningCount={warningCount}
          orphanCount={orphanCount}
          running={running}
          perform={perform}
          onMessage={setMessage}
        />
      </SectionCard>
    </> : <>
      <StageStatusHeader stageName="Asset Acquisition" stageNumber={18} eligibility={assetEligibility} dependencies={["Approved Prompt Preparation", "Verified image model"]} purpose="Nhập ảnh từ pipeline cũ; không thuộc quy trình thủ công mặc định." />
      <SectionCard title="Tạo ảnh thử nghiệm (cũ)" description="Chỉ dùng khi bạn chủ động bật pipeline provider cũ.">{assetEligibility.runnable ? <button className="button primary" type="button" onClick={() => void perform(() => factoryClient.runAssetAcquisition({ projectId: props.project.id }), "Ảnh đã sẵn sàng để duyệt.")} disabled={running}>Tạo ảnh</button> : <DisabledAction reason={assetEligibility.blockingReasons[0]?.message ?? "Nhập ảnh chưa thể chạy."}>Tạo ảnh</DisabledAction>}{assetArtifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge>{artifact.status === "needs_review" ? <div className="button-row"><button className="button compact" type="button" onClick={() => void perform(() => factoryClient.approveAssetAcquisition({ projectId: props.project.id }), "Đã duyệt ảnh.")} disabled={running || !assetEligibility.approvable}>Duyệt ảnh</button><button className="button danger compact" type="button" onClick={() => void perform(() => factoryClient.rejectAssetAcquisition({ projectId: props.project.id }), "Đã từ chối ảnh.")} disabled={running}>Từ chối</button></div> : null}</div>)}</SectionCard>
    </>}
    {props.surface !== "prompt-studio" ? <SectionCard title="Duyệt ảnh" description="Dựng video chỉ mở khi mọi frame bắt buộc đã được map, duyệt và gán.">{latestReview ? <><StatusBadge tone={latestReview.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(latestReview.status)}</StatusBadge>{latestReview.status === "needs_review" ? <div className="button-row"><button className="button primary" type="button" disabled={running || !assetReviewEligibility.approvable || missingCount > 0} title={missingCount > 0 ? `Còn thiếu ${missingCount} frame bắt buộc. Hãy tải và duyệt đủ ảnh trước khi tiếp tục.` : undefined} aria-describedby={missingCount > 0 ? "asset-review-missing" : undefined} onClick={() => void perform(async () => { const project = await factoryClient.approveAssetReview({ projectId: props.project.id }); if (project.setup.workflowMode === "semi_automatic") void props.startSemiAutomatic("assets", project); return project; }, "Đã duyệt ảnh. Có thể chuyển sang dựng video.")}>Duyệt toàn bộ ảnh đã gán</button><button className="button danger compact" type="button" disabled={running} onClick={() => void perform(() => factoryClient.rejectAssetReview({ projectId: props.project.id }), "Đã từ chối lượt duyệt ảnh.")}>Từ chối lượt duyệt</button></div> : null}</> : <EmptyState title="Chưa bắt đầu duyệt ảnh" detail="Tải ảnh lên để tạo lượt duyệt." />}{missingCount > 0 ? <p id="asset-review-missing" className="attention-copy">Còn thiếu {missingCount} frame bắt buộc. Dựng video vẫn bị khoá.</p> : null}</SectionCard> : null}
  </>;
}

export function visualLabel(mode: string): string {
  const labels: Record<string, string> = { ai_image: "Ảnh mới (GG Lab)", ai_video: "Video", stock_image: "Ảnh stock", stock_video: "Video stock", manual_upload: "Ảnh upload", uploaded: "Đã upload", reuse: "Tái sử dụng", document: "Tài liệu", diagram: "Sơ đồ", text_card: "Text card" };
  return labels[mode] ?? mode;
}

export function motionLabel(effect: string): string {
  const labels: Record<string, string> = { none: "Không motion", slide_up: "Trượt lên", slide_down: "Trượt xuống", pan_left: "Pan trái", pan_right: "Pan phải", zoom_in: "Zoom in", zoom_out: "Zoom out", pop: "Pop", dissolve: "Dissolve" };
  return labels[effect] ?? effect;
}
