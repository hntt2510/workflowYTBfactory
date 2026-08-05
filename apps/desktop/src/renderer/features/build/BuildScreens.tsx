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
    await perform(() => factoryClient.selectProjectAudio({ projectId: props.project.id, kind }), `${kind} audio saved. Rebuild the timeline to include it.`);
  }
  const totalFrames = Math.max(...props.project.timeline.items.map((item) => item.startFrame + item.durationFrames), 1);
  return (
    <>
      <PageHeader title="Timeline" description="Assemble approved visuals, voice, and subtitles into an integer-frame review timeline." actions={canRetryStage(eligibility) ? <button className="button primary" type="button" disabled={running} onClick={() => void perform(() => factoryClient.runTimelineAssembly({ projectId: props.project.id }), eligibility.status === "failed" || eligibility.status === "needs_attention" ? "Timeline Assembly retry is ready for review." : "Timeline Assembly is ready for review.")}>{eligibility.status === "failed" || eligibility.status === "needs_attention" ? "Retry Timeline Assembly" : "Assemble timeline"}</button> : <DisabledAction reason={eligibility.blockingReasons[0]?.message ?? "Timeline Assembly is not runnable."}>Assemble timeline</DisabledAction>} />
      <StageStatusHeader stageName="Timeline Assembly" stageNumber={22} eligibility={eligibility} dependencies={["Approved Asset Review", "Approved Voice", "Approved Subtitles"]} purpose="Create a reviewable timeline only from approved media; it does not render or export." />
      <SectionCard title="Audio tracks" description="Optional music, ambience, and SFX are copied into the workspace. Music and ambience loop under narration at reduced volume; SFX stays a separate CapCut audio item.">
        <div className="button-row"><button className="button secondary" type="button" disabled={running} onClick={() => void selectAudio("music")}>{props.project.setup.musicPath ? "Replace music" : "Add music"}</button><button className="button secondary" type="button" disabled={running} onClick={() => void selectAudio("ambient")}>{props.project.setup.ambientPath ? "Replace ambience" : "Add ambience"}</button><button className="button secondary" type="button" disabled={running} onClick={() => void selectAudio("sfx")}>{props.project.setup.sfxPath ? "Replace SFX" : "Add SFX"}</button></div>
        <p className="muted">Music: {props.project.setup.musicPath ?? "not supplied"} · Ambience: {props.project.setup.ambientPath ?? "not supplied"} · SFX: {props.project.setup.sfxPath ?? "not supplied"}</p>
      </SectionCard>
<SectionCard title="Timeline Assembly review">{artifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : artifact.status === "rejected" ? "danger" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge><p>{artifact.payloadJson.items.length} media items at {artifact.payloadJson.fps} fps</p>{artifact.status === "needs_review" ? <div className="button-row"><button className="button compact" type="button" disabled={running || !eligibility.approvable} onClick={() => void perform(() => factoryClient.approveTimelineAssembly({ projectId: props.project.id }), "Timeline Assembly approved.")}>Approve timeline</button><button className="button danger compact" type="button" disabled={running} onClick={() => void perform(() => factoryClient.rejectTimelineAssembly({ projectId: props.project.id }), "Timeline Assembly rejected.")}>Reject timeline</button></div> : null}</div>)}{message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}</SectionCard>
      <StageStatusHeader stageName="Preview Render" stageNumber={23} eligibility={previewEligibility} dependencies={["Approved Timeline Assembly"]} purpose="Render real approved visual and narration media with FFmpeg, then review the validated local preview before QA." />
      <SectionCard title="Subtitle preset" description="Important Vietnamese text stays in the local UTF-8 compositing layer. Choose one global subtitle style before rendering the preview."><FormField label="Subtitle preset" htmlFor="subtitle-preset"><select id="subtitle-preset" value={subtitlePreset} onChange={(event) => setSubtitlePreset(event.target.value as SubtitlePreset)}><option value="vox-clean">VOX Clean</option><option value="minimal">Minimal</option><option value="high-contrast">High Contrast</option></select></FormField></SectionCard>
      <SectionCard title="Preview Render review" description="This runs FFmpeg only after you click it. The renderer cannot select paths or invoke a process directly.">
        {canRetryStage(previewEligibility) ? <button className="button primary" type="button" disabled={running} onClick={() => void perform(() => factoryClient.runPreviewRender({ projectId: props.project.id, subtitlePreset }), previewEligibility.status === "failed" || previewEligibility.status === "needs_attention" ? "Preview Render retry is ready for review." : "Preview Render is ready for review.")}>{running ? "Rendering preview..." : previewEligibility.status === "failed" || previewEligibility.status === "needs_attention" ? "Retry Preview Render" : "Render approved preview"}</button> : <DisabledAction reason={previewEligibility.blockingReasons[0]?.message ?? "Preview Render requires an approved timeline."}>Render approved preview</DisabledAction>}
        {previewArtifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : artifact.status === "rejected" ? "danger" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge><p>{artifact.payloadJson.width}x{artifact.payloadJson.height}, {artifact.payloadJson.durationSeconds.toFixed(2)}s</p><p>{artifact.relativeFilePath}</p><p>SHA-256: {artifact.payloadJson.sha256 ?? "Unavailable; render again before approval."}</p>{artifact.status === "needs_review" ? <div className="button-row"><button className="button compact" type="button" disabled={running || !previewEligibility.approvable} onClick={() => void perform(async () => { const project = await factoryClient.approvePreviewRender({ projectId: props.project.id }); if (project.setup.workflowMode === "semi_automatic") void props.startSemiAutomatic("preview", project); return project; }, "Preview Render approved.")}>Approve preview</button><button className="button danger compact" type="button" disabled={running} onClick={() => void perform(() => factoryClient.rejectPreviewRender({ projectId: props.project.id }), "Preview Render rejected. Render another approved timeline when ready.")}>Reject preview</button></div> : null}</div>)}
      </SectionCard>
      {props.project.setup.workflowMode === "semi_automatic" && nextChain === "preview" && previewEligibility.status === "approved" ? <SectionCard title="Continue automatic production" description="The final Preview Render is approved. QA and Packaging Export will run automatically; an optional CapCut Draft remains available from Export."><button className="button primary" type="button" disabled={running} onClick={() => void props.startSemiAutomatic("preview", props.project)}>Continue to QA and Packaging</button></SectionCard> : null}
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
  return <><PageHeader title="QA" description="Run deterministic evidence checks after an approved preview. QA never fabricates AI findings or auto-approves the project." actions={canRunQa ? <button className="button primary" type="button" disabled={running} onClick={() => void perform(() => factoryClient.runQa({ projectId: props.project.id }), eligibility.status === "failed" || eligibility.status === "needs_attention" ? "QA retry is ready for review." : "QA report is ready for review.")}>{eligibility.status === "failed" || eligibility.status === "needs_attention" ? "Retry QA" : "Run QA"}</button> : <DisabledAction reason={eligibility.blockingReasons[0]?.message ?? "QA requires an approved preview."}>Run QA</DisabledAction>} /><StageStatusHeader stageName="QA" stageNumber={25} eligibility={eligibility} dependencies={["Approved Preview Render"]} purpose="Inspect persisted artifacts and local media evidence before optional CapCut or final packaging." /><SectionCard title="QA reports">{artifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge>{artifact.payloadJson.findings.length ? artifact.payloadJson.findings.map((finding, index) => <p key={`${finding.code}-${index}`}><strong>{finding.severity}</strong> {finding.code}: {finding.message}</p>) : <p>No deterministic findings.</p>}{artifact.status === "needs_review" ? <div className="button-row"><button className="button compact" disabled={running || !eligibility.approvable || artifact.payloadJson.findings.some((finding) => finding.severity === "blocking")} type="button" onClick={() => void perform(() => factoryClient.approveQa({ projectId: props.project.id }), "QA approved.")}>Approve QA</button><button className="button danger compact" disabled={running} type="button" onClick={() => void perform(() => factoryClient.rejectQa({ projectId: props.project.id }), "QA rejected.")}>Reject QA</button></div> : null}</div>)}{message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}</SectionCard></>;
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
      setMessage(safeRendererError(error, "The export operation could not be completed. Check the selected options and retry."));
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
      setMessage(safeRendererError(error, "The preview options could not be applied. Render the preview again and retry."));
    } finally {
      setRunning(false);
    }
  }

  async function createPackage() {
    setRunning(true);
    try {
      let next = await factoryClient.runPackagingExport({ projectId: props.project.id, exportSubtitleFile, includeProjectManifest });
      let success = includeProjectManifest ? "Final MP4 and project manifest are ready for review." : "Final MP4 is ready for review without a project manifest.";
      if (createCapCutDraft) {
        try {
          next = await factoryClient.runCapCutDraft({ projectId: props.project.id });
          success += " CapCut Draft is ready for optional review.";
        } catch (error) {
          success += ` CapCut Draft was not created: ${safeRendererError(error, "the optional CapCut draft could not be created")}`;
        }
      }
      props.setSelectedProject(next);
      await refresh();
      setMessage(success);
    } catch (error) {
      setMessage(safeRendererError(error, "The export operation could not be completed. Check the selected options and retry."));
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <PageHeader title="Export" description="Choose final output options, then create a reviewed workspace-local MP4 package." actions={<div className="button-row"><button className="button secondary" type="button" onClick={() => props.setRoute("final-preview")}>Watch final video</button>{canRunPackaging ? <button className="button primary" type="button" disabled={running} onClick={() => void createPackage()}>{eligibility.status === "failed" || eligibility.status === "needs_attention" ? "Retry Packaging Export" : "Create final MP4 package"}</button> : <DisabledAction reason={previewOptionsChanged ? "Apply the selected preview options and approve Final Preview before exporting." : eligibility.blockingReasons[0]?.message ?? "Packaging requires approved QA and production artifacts; CapCut Draft is optional."}>Create final MP4 package</DisabledAction>}</div>} />
      <SectionCard title="Export options" description="Resolution and subtitle burn-in changes create a new Final Preview checkpoint. Subtitle file, manifest, and CapCut draft are package options.">
        <div className="form-grid">
          <FormField label="Resolution" htmlFor="export-resolution"><select id="export-resolution" value={resolution} onChange={(event) => setResolution(event.target.value as "1080p" | "720p")}><option value="1080p">1080p</option><option value="720p">720p</option></select></FormField>
          <label><input type="checkbox" checked={includeSubtitles} onChange={(event) => setIncludeSubtitles(event.target.checked)} /> Include subtitles in video</label>
          <label><input type="checkbox" checked={exportSubtitleFile} onChange={(event) => setExportSubtitleFile(event.target.checked)} /> Export subtitle file</label>
          <label><input type="checkbox" checked={createCapCutDraft} onChange={(event) => setCreateCapCutDraft(event.target.checked)} /> Create CapCut draft</label>
          <label><input type="checkbox" checked={includeProjectManifest} onChange={(event) => setIncludeProjectManifest(event.target.checked)} /> Include project manifest</label>
        </div>
        {previewOptionsChanged ? <div className="button-row"><button className="button secondary" type="button" disabled={running} onClick={() => void applyPreviewOptions()}>Render preview with selected video options</button><span className="muted">Final Preview approval is required before export.</span></div> : null}
      </SectionCard>
      <StageStatusHeader stageName="CapCut Draft" stageNumber={26} eligibility={capcutEligibility} dependencies={["Approved QA", "Approved Timeline"]} purpose="Optional structural draft for manual CapCut desktop review; it is never required for final MP4 packaging." />
      <SectionCard title="CapCut Draft review">
        {canRunCapcut ? <button className="button primary" type="button" disabled={running} onClick={() => void perform(() => factoryClient.runCapCutDraft({ projectId: props.project.id }), capcutEligibility.status === "failed" || capcutEligibility.status === "needs_attention" ? "CapCut Draft retry is ready for manual desktop review." : "CapCut draft is ready for manual desktop review.")}>{capcutEligibility.status === "failed" || capcutEligibility.status === "needs_attention" ? "Retry CapCut draft" : "Create CapCut draft"}</button> : <DisabledAction reason={capcutEligibility.blockingReasons[0]?.message ?? "CapCut Draft requires approved QA and runtime prerequisites."}>Create CapCut draft</DisabledAction>}
        {capcutArtifacts.map((artifact) => <p key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : artifact.status === "rejected" ? "danger" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge> {artifact.payloadJson.draftName}: {artifact.payloadJson.trackCounts.video} video, {artifact.payloadJson.trackCounts.audio} audio, {artifact.payloadJson.trackCounts.text} subtitle tracks; {artifact.payloadJson.mediaValidated ? `${artifact.payloadJson.visualClipCount ?? artifact.payloadJson.trackCounts.video} visual clips validated` : "legacy visual media not revalidated"}. {artifact.status === "needs_review" ? <span className="button-row"><button className="button compact" disabled={running || !capcutEligibility.approvable} type="button" onClick={() => { if (window.confirm("Confirm that you opened this draft in CapCut and verified that video, audio, and subtitle tracks are editable.")) void perform(() => factoryClient.approveCapCutDraft({ projectId: props.project.id, confirmation: "I opened the draft in CapCut and verified editable tracks" }), "CapCut Draft approved after manual verification."); }}>Confirm CapCut review</button><button className="button danger compact" disabled={running} type="button" onClick={() => void perform(() => factoryClient.rejectCapCutDraft({ projectId: props.project.id }), "CapCut Draft rejected.")}>Reject draft</button></span> : null}</p>)}
      </SectionCard>
      <StageStatusHeader stageName="Packaging Export" stageNumber={27} eligibility={eligibility} dependencies={["Approved QA", "Approved Preview, Timeline, Voice, Subtitles, and Assets"]} purpose="Copy the approved preview into a final MP4 and optionally include its subtitle file and project manifest." />
      <SectionCard title="Package manifests">
        {artifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge><p>Manifest: {artifact.payloadJson.manifestRelativeFilePath ?? "Not included"}</p><p>Final MP4: {artifact.payloadJson.mp4RelativeFilePath ?? "Not available"}</p>{artifact.payloadJson.subtitleRelativeFilePath ? <p>Subtitle file: {artifact.payloadJson.subtitleRelativeFilePath}</p> : null}<p>{artifact.payloadJson.artifactIds.length} approved artifacts, SHA-256 {artifact.payloadJson.sha256.slice(0, 12)}...</p>{artifact.status === "needs_review" ? <div className="button-row"><button className="button compact" disabled={running || !eligibility.approvable} type="button" onClick={() => void perform(() => factoryClient.approvePackagingExport({ projectId: props.project.id }), "Final MP4 package approved.")}>Approve package</button><button className="button danger compact" disabled={running} type="button" onClick={() => void perform(() => factoryClient.rejectPackagingExport({ projectId: props.project.id }), "Package export rejected.")}>Reject package</button></div> : null}</div>)}
        {message ? <p className={message.toLowerCase().includes("failed") || message.toLowerCase().includes("not created") ? "error-message" : "safe-message"}>{message}</p> : null}
      </SectionCard>
    </>
  );
}
