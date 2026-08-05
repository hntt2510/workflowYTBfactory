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
      <PageHeader title="Scenes" description="Review frame-timed scenes generated only from the approved Script and Retention Review." actions={eligibility.runnable ? <button className="button primary" type="button" onClick={() => void perform(() => factoryClient.runScenePlan({ projectId: props.project.id }), "Scene Plan is ready for review.")} disabled={running}>Run Scene Plan</button> : <DisabledAction reason={eligibility.blockingReasons[0]?.message ?? "Scene Plan is not runnable."}>Run Scene Plan</DisabledAction>} />
      <StageStatusHeader stageName="Scene Plan" stageNumber={15} eligibility={eligibility} dependencies={["Approved Retention Review"]} purpose="Create frame-timed scenes without creating assets or shots." />
      <SectionCard title="Scene Plan review">{artifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge>{artifact.payloadJson.scenes.map((scene) => <p key={scene.id}>{scene.purpose}: {scene.startFrame} + {scene.durationFrames} frames</p>)}{artifact.status === "needs_review" ? <div className="button-row">{eligibility.approvable ? <button className="button compact" type="button" onClick={() => void perform(() => factoryClient.approveScenePlan({ projectId: props.project.id }), "Scene Plan approved.")} disabled={running}>Approve Scene Plan</button> : <DisabledAction reason={eligibility.blockingReasons[0]?.message ?? "Scene Plan cannot be approved yet."}>Approve Scene Plan</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void perform(() => factoryClient.rejectScenePlan({ projectId: props.project.id }), "Scene Plan rejected.")} disabled={running}>Reject Scene Plan</button></div> : null}</div>)}{message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}</SectionCard>
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
  const stateBefore = summarizeState(firstShot?.startState, "Narrative setup");
  const stateAfter = summarizeState(lastShot?.endState, "Narrative state after the scene");
  const dramaticChange = props.shots.map((shot) => shot.subjectAction).filter(Boolean).join(" -> ") || "No dramatic change specified";
  const transition = props.scene.continuityRefs.length ? `Continues from ${props.scene.continuityRefs.join(", ")}` : "Fresh scene entry";
  return <div className="scene-card">
    <div className="scene-card-heading"><div><strong>{props.scene.id}</strong><span>{props.scene.purpose}</span></div><StatusBadge tone={props.status === "approved" ? "success" : "info"}>{creatorStatusLabel(props.status)}</StatusBadge></div>
    <p className="scene-narration">{props.scene.narration}</p>
    <dl className="scene-details">
      <div><dt>State before</dt><dd>{stateBefore}</dd></div>
      <div><dt>Dramatic change</dt><dd>{dramaticChange}</dd></div>
      <div><dt>State after</dt><dd>{stateAfter}</dd></div>
      <div><dt>Emotional arc</dt><dd>{props.scene.emotionalState}</dd></div>
      <div><dt>Narration range</dt><dd>{formatTimecode(props.scene.startFrame, props.fps)} - {formatTimecode(props.scene.startFrame + props.scene.durationFrames, props.fps)}</dd></div>
      <div><dt>Duration / images</dt><dd>{(props.scene.durationFrames / props.fps).toFixed(1)}s · {requiredImageCount} new / {props.shots.length} frames</dd></div>
      <div><dt>Audio intention</dt><dd>Clear narration emphasis with a breath after the scene turn.</dd></div>
      <div><dt>Transition</dt><dd>{transition}</dd></div>
    </dl>
    <div className="button-row"><button className="button primary compact" type="button" onClick={props.onOpenStoryboard}>Open storyboard</button></div>
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
        title="Shot Board"
        description="Review frame-accurate shots generated only from the approved Scene Plan."
        actions={
          <><div className="segmented">{(["board", "table", "timeline"] as const).map((item) => <button className={view === item ? "active" : ""} key={item} onClick={() => setView(item)} type="button">{item}</button>)}</div>{eligibility.runnable ? <button className="button primary" type="button" onClick={() => void perform(() => factoryClient.runShotPlan({ projectId: props.project.id }), "Shot Plan is ready for review.")} disabled={running}>Run Shot Plan</button> : <DisabledAction reason={eligibility.blockingReasons[0]?.message ?? "Shot Plan is not runnable."}>Run Shot Plan</DisabledAction>}</>
        }
      />
      <StageStatusHeader stageName="Shot Plan" stageNumber={16} eligibility={eligibility} dependencies={["Approved Scene Plan"]} purpose="Create frame-timed shots without creating or assigning assets." />
      <SectionCard title="Shot Plan review">{artifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge>{artifact.payloadJson.shots.map((shot) => <p key={shot.id}>{shot.purpose}: {shot.startFrame} + {shot.durationFrames} frames</p>)}{artifact.status === "needs_review" ? <div className="button-row">{eligibility.approvable ? <button className="button compact" type="button" onClick={() => void perform(() => factoryClient.approveShotPlan({ projectId: props.project.id }), "Shot Plan approved.")} disabled={running}>Approve Shot Plan</button> : <DisabledAction reason={eligibility.blockingReasons[0]?.message ?? "Shot Plan cannot be approved yet."}>Approve Shot Plan</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void perform(() => factoryClient.rejectShotPlan({ projectId: props.project.id }), "Shot Plan rejected.")} disabled={running}>Reject Shot Plan</button></div> : null}</div>)}{message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}</SectionCard>
      {view === "board" ? (
        <div className="shot-board">
          {[...props.project.shots]
            .sort((left, right) => left.startFrame - right.startFrame || left.order - right.order)
            .map((shot, index) => <StoryboardFrameCard key={shot.id} shot={shot} frameNumber={index + 1} frameSpec={frameSpecs.find((frame) => frame.shotId === shot.id)} />)}
        </div>
      ) : (
        <DataTable label="Shots">
          <thead><tr><th>Shot</th><th>Scene</th><th>Start</th><th>Duration</th><th>Framing</th><th>Camera</th><th>Asset</th></tr></thead>
          <tbody>
            {props.project.shots.map((shot) => (
              <tr key={shot.id}>
                <td>{shot.id}</td>
                <td>{shot.sceneId}</td>
                <td>{formatTimecode(shot.startFrame, shot.fps)}</td>
                <td>{formatTimecode(shot.durationFrames, shot.fps)} / {shot.durationFrames} frames</td>
                <td>{shot.framing}</td>
                <td>{shot.cameraAngle}</td>
                <td><StatusBadge tone="warning">Unassigned</StatusBadge></td>
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
    ?? "Not specified";
  const continuityRefs = frameSpec?.continuityRefs ?? shot.continuityRefs;
  const continuity = continuityRefs.length ? continuityRefs.join(", ") : "New reference";
  const role = frameSpec?.role ?? storyboardRole(shot);
  const displayNumber = frameSpec?.displayNumber ?? String(props.frameNumber).padStart(3, "0");
  return (
    <article className="storyboard-frame-card">
      <div className="storyboard-frame-thumb" aria-label={`Frame ${displayNumber} asset placeholder`}>
        {shot.approvedAssetId ? "Asset assigned" : "Awaiting upload"}
      </div>
      <div className="storyboard-frame-header">
        <div>
          <strong>{displayNumber} · {shot.id}</strong>
          <span>{shot.sceneId} · {role}</span>
        </div>
        <StatusBadge tone={shot.approvedAssetId ? "success" : "warning"}>{shot.approvedAssetId ? "Asset ready" : "Needs asset"}</StatusBadge>
      </div>
      <dl className="storyboard-frame-details">
        <div><dt>Purpose</dt><dd>{frameSpec?.purpose ?? shot.purpose}</dd></div>
        <div><dt>Composition</dt><dd>{shot.framing} · {shot.cameraAngle}</dd></div>
        <div><dt>Character action</dt><dd>{shot.subjectAction || "Not specified"}</dd></div>
        <div><dt>Facial expression</dt><dd>{expression}</dd></div>
        <div><dt>Continuity source</dt><dd>{continuity}</dd></div>
        <div><dt>Motion intent</dt><dd>{shot.motion ? motionLabel(shot.motion.effect) : shot.cameraMovement || "None"}</dd></div>
        <div><dt>Narration / time range</dt><dd>{formatTimecode(shot.startFrame, shot.fps)} - {formatTimecode(shot.startFrame + shot.durationFrames, shot.fps)} · {(shot.durationFrames / shot.fps).toFixed(1)}s</dd></div>
        <div><dt>Transition relation</dt><dd>{continuityRefs.length ? "Continues from referenced frame" : "Scene entry"}</dd></div>
        {frameSpec?.expectedFilename ? <div><dt>Expected filename</dt><dd>{frameSpec.expectedFilename}</dd></div> : null}
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

export function VisualsScreen(props: { project: FactoryProject; textCertification: TextModelCertificationResponse; imageCertification: ImageModelCertificationResponse; setSelectedProject: (project: FactoryProject | null) => void; setImageCertification: (certification: ImageModelCertificationResponse) => void; startSemiAutomatic: (chain: SemiAutomaticChain, project: FactoryProject) => Promise<void> }) {
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
    <PageHeader title={characterFirst ? "Director & Assets" : "Visual Sources"} description={characterFirst ? "Chốt storyboard, copy prompt theo cảnh, rồi tải ảnh bạn đã tạo từ GG Lab lên." : "Route approved shots to visual modes before preparing prompts or acquiring assets."} actions={canRetryStage(eligibility) ? <button className="button primary" type="button" onClick={() => void perform(() => factoryClient.runVisualRouting({ projectId: props.project.id }), eligibility.status === "failed" || eligibility.status === "needs_attention" ? "Visual Routing retry is ready for review." : "Visual Routing is ready for review.")} disabled={running}>{eligibility.status === "failed" || eligibility.status === "needs_attention" ? "Retry Visual Routing" : "Run Visual Routing"}</button> : <DisabledAction reason={eligibility.blockingReasons[0]?.message ?? "Visual Routing is not runnable."}>Run Visual Routing</DisabledAction>} />
    <StageStatusHeader stageName="Visual Routing" stageNumber={16} eligibility={eligibility} dependencies={["Approved Shot Plan"]} purpose="Assign one visual strategy and one motion intent to every storyboard frame. This stage never creates an image." />
    <SectionCard title="Storyboard routing" description="Mỗi shot có một mục đích rõ ràng. Motion chỉ là hướng dựng trong FFmpeg/CapCut, không thay thế frame mới khi câu chuyện cần đổi trạng thái.">
      {artifacts.map((artifact) => <div key={artifact.id} className="studio-stack"><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge>{artifact.payloadJson.shots.map((shot) => <div className="storyboard-row" key={shot.id}><div><strong>{shot.id}</strong><span>{shot.sceneId} · {shot.semanticBeat ?? shot.purpose}</span></div>{artifact.status === "needs_review" ? <div className="row-actions"><select aria-label={`Visual mode for ${shot.id}`} value={shot.visualMode} disabled={running} onChange={(event) => void perform(() => factoryClient.editVisualRouting({ projectId: props.project.id, artifactId: artifact.id, shotId: shot.id, visualMode: event.target.value as FactoryProject["shots"][number]["visualMode"], ...(shot.motion ? { motionEffect: shot.motion.effect } : {}) }), "Đã lưu hướng visual.")}>{visualModes.map((mode) => <option key={mode} value={mode}>{visualLabel(mode)}</option>)}</select><select aria-label={`Motion effect for ${shot.id}`} value={shot.motion?.effect ?? "none"} disabled={running} onChange={(event) => void perform(() => factoryClient.editVisualRouting({ projectId: props.project.id, artifactId: artifact.id, shotId: shot.id, visualMode: shot.visualMode as FactoryProject["shots"][number]["visualMode"], motionEffect: event.target.value as NonNullable<FactoryProject["shots"][number]["motion"]>["effect"] }), "Đã lưu motion override.")}>{motionEffects.map((effect) => <option key={effect} value={effect}>{motionLabel(effect)}</option>)}</select></div> : <span className="storyboard-meta">{visualLabel(shot.visualMode)} · {motionLabel(shot.motion?.effect ?? "none")}</span>}</div>)}{artifact.status === "needs_review" ? <div className="button-row"><button className="button compact" type="button" onClick={() => void perform(() => factoryClient.approveVisualRouting({ projectId: props.project.id }), "Đã duyệt storyboard routing.")} disabled={running || !eligibility.approvable}>Approve routing</button><button className="button danger compact" type="button" onClick={() => void perform(() => factoryClient.rejectVisualRouting({ projectId: props.project.id }), "Đã từ chối storyboard routing.")} disabled={running}>Reject</button></div> : null}</div>)}
      {message ? <p className={message.toLowerCase().includes("failed") || message.toLowerCase().includes("không") ? "error-message" : "safe-message"}>{message}</p> : null}
    </SectionCard>
    <StageStatusHeader stageName="Asset Concepts" stageNumber={20} eligibility={conceptEligibility} dependencies={["Approved Visual Routing", "Approved Character Pack"]} purpose="Map each semantic beat to a reusable visual asset and motion intention before prompt compilation." />
    <SectionCard title="Asset concepts" description="Các concept được tạo local cho manual-first flow; provider text chỉ là tuỳ chọn ở pipeline legacy.">
      {canRetryStage(conceptEligibility) || (conceptEligibility.status === "approved" && !assetConceptsReady) ? <button className="button primary" type="button" disabled={running} onClick={() => void perform(() => factoryClient.runAssetConcepts({ projectId: props.project.id }), "Asset concepts đã sẵn sàng.")}>{conceptEligibility.status === "failed" || conceptEligibility.status === "needs_attention" ? "Retry concepts" : "Create concepts"}</button> : null}
      {conceptArtifacts.map((artifact) => <div key={artifact.id} className="studio-stack"><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge><div className="card-grid">{artifact.payloadJson.concepts.map((concept) => <article className="shot-card studio-card" key={concept.id}><strong>{concept.role}</strong><span>{concept.shotId} · {concept.semanticBeat}</span><p>{concept.description}</p><small>{concept.motionIntent}</small><TagList items={concept.visualConstraints.concat(concept.colorPalette)} limit={6} /></article>)}</div></div>)}
    </SectionCard>
    <StageStatusHeader stageName="Prompt Studio" stageNumber={21} eligibility={promptEligibility} dependencies={["Approved Asset Concepts"]} purpose="Một scene một prompt copy được cho GG Lab. Không tạo ảnh trong app." />
    <SectionCard title="Scene prompt studio" description="Mỗi prompt hướng dẫn GG Lab tạo nhiều frame riêng, đánh số toàn cục và dùng frame trước làm reference nội bộ.">
      {promptEligibility.runnable ? <button className="button primary" type="button" onClick={() => void perform(() => factoryClient.runPromptPreparation({ projectId: props.project.id }), "Scene prompts đã sẵn sàng để copy.")} disabled={running}>Compile scene prompts</button> : null}
      {latestPrompt?.payloadJson.scenePrompts?.length ? <div className="prompt-studio-grid">{latestPrompt.payloadJson.scenePrompts.map((scenePrompt) => <article className="prompt-card" key={scenePrompt.sceneId}><div className="prompt-card-header"><div><strong>{scenePrompt.sceneId}</strong><span>{scenePrompt.frameNumbers.join(" · ")} · {scenePrompt.expectedAspectRatio}</span></div><button className="button compact" type="button" onClick={() => void copyScenePrompt(scenePrompt.promptText)}>Copy prompt</button></div><textarea readOnly value={scenePrompt.promptText} aria-label={`Prompt for ${scenePrompt.sceneId}`} /><div className="prompt-meta"><span>References: {scenePrompt.referenceInstructions.length}</span><span>Locks: {scenePrompt.continuityLocks.length}</span></div></article>)}</div> : latestPrompt?.payloadJson.prompts.length ? <div className="studio-stack">{latestPrompt.payloadJson.prompts.map((prompt) => <article className="prompt-card" key={prompt.shotId}><div className="prompt-card-header"><strong>{prompt.shotId}</strong><button className="button compact" type="button" onClick={() => void copyScenePrompt(prompt.positivePrompt)}>Copy prompt</button></div><p>{prompt.positivePrompt}</p></article>)}</div> : <EmptyState title="Chưa có prompt" detail="Approve routing và tạo Asset Concepts trước khi compile prompt." />}
      {latestPrompt?.status === "needs_review" ? <div className="button-row"><button className="button compact" type="button" onClick={() => void perform(() => factoryClient.approvePromptPreparation({ projectId: props.project.id }), "Đã duyệt prompt package.")} disabled={running || !promptEligibility.approvable}>Approve prompts</button><button className="button danger compact" type="button" onClick={() => void perform(() => factoryClient.rejectPromptPreparation({ projectId: props.project.id }), "Đã từ chối prompt package.")} disabled={running}>Reject</button></div> : null}
    </SectionCard>
    {characterFirst ? <>
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
      <StageStatusHeader stageName="Asset Acquisition" stageNumber={18} eligibility={assetEligibility} dependencies={["Approved Prompt Preparation", "Verified image model"]} purpose="Legacy/experimental provider image generation. It is not part of the default character-first flow." />
      <SectionCard title="Legacy image generation" description="Chỉ dùng khi bạn chủ động bật pipeline provider cũ.">{assetEligibility.runnable ? <button className="button primary" type="button" onClick={() => void perform(() => factoryClient.runAssetAcquisition({ projectId: props.project.id }), "Generated assets are ready for review.")} disabled={running}>Generate images</button> : <DisabledAction reason={assetEligibility.blockingReasons[0]?.message ?? "Asset Acquisition is not runnable."}>Generate images</DisabledAction>}{assetArtifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge>{artifact.status === "needs_review" ? <div className="button-row"><button className="button compact" type="button" onClick={() => void perform(() => factoryClient.approveAssetAcquisition({ projectId: props.project.id }), "Asset acquisition approved.")} disabled={running || !assetEligibility.approvable}>Approve</button><button className="button danger compact" type="button" onClick={() => void perform(() => factoryClient.rejectAssetAcquisition({ projectId: props.project.id }), "Asset acquisition rejected.")} disabled={running}>Reject</button></div> : null}</div>)}</SectionCard>
    </>}
    <SectionCard title="Asset review" description="Build chỉ mở khi mọi frame bắt buộc đã được map, approve và assign.">{latestReview ? <><StatusBadge tone={latestReview.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(latestReview.status)}</StatusBadge>{latestReview.status === "needs_review" ? <div className="button-row"><button className="button primary" type="button" disabled={running || !assetReviewEligibility.approvable || missingCount > 0} title={missingCount > 0 ? `Còn thiếu ${missingCount} frame bắt buộc. Hãy upload và duyệt đủ ảnh trước khi tiếp tục.` : undefined} aria-describedby={missingCount > 0 ? "asset-review-missing" : undefined} onClick={() => void perform(async () => { const project = await factoryClient.approveAssetReview({ projectId: props.project.id }); if (project.setup.workflowMode === "semi_automatic") void props.startSemiAutomatic("assets", project); return project; }, "Assets approved. Build is ready.")}>Approve all mapped assets</button><button className="button danger compact" type="button" disabled={running} onClick={() => void perform(() => factoryClient.rejectAssetReview({ projectId: props.project.id }), "Asset review rejected.")}>Reject review</button></div> : null}</> : <EmptyState title="Asset review chưa bắt đầu" detail="Upload ảnh để tạo batch review." />}{missingCount > 0 ? <p id="asset-review-missing" className="attention-copy">Còn thiếu {missingCount} frame bắt buộc. Build vẫn bị khoá.</p> : null}</SectionCard>
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
