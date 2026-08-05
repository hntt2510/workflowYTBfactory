import type { ChannelProfile, FactoryProject } from "@lsf/domain";
import { resolveProductionStatus, resolveStageEligibilities, resolveWorkflowProgress, workflowStageDefinitions } from "@lsf/domain";
import { PageHeader, MetricCard, SectionCard, SettingsList, StatusBadge } from "../../components/ui";
import type { ImageModelCertificationResponse, LocalTtsSettings, TextModelCertificationResponse } from "../../types";
import { automaticChainForStage, characterVersionNeedsSetup, nextSemiAutomaticChain, type SemiAutomaticChain, type SemiAutomaticProgress } from "../../semiAutomaticWorkflow";
import { creatorPhaseStateLabel, creatorStatusLabel, workflowModeOptions } from "../../creatorStudioCopy";
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
  const nextStageName = nextStage ? workflowStageDefinitions.find((stage) => stage.id === nextStage.stageId)?.name ?? nextStage.stageId : undefined;
  const nextChain = nextSemiAutomaticChain(project, props.selectedProfile);
  const isRunning = props.semiAutomaticRunning || project.stages.some((stage) => stage.status === "queued" || stage.status === "running");
  const actionStage = attention ?? checkpoint;
  const retryChain = attention && project.setup.workflowMode === "semi_automatic" ? automaticChainForStage(attention.id) : undefined;
  const actionRoute = characterNeedsSetup ? "channel-profiles" : actionStage ? stageRoute(actionStage.id) : nextStage ? stageRoute(nextStage.stageId) : "advanced-pipeline";
  const phaseRows = progress.phases.map((phase) => ({
    ...phase,
    currentStage: phase.currentStageName ?? (phase.state === "not_applicable" ? "Not used" : phase.state === "optional" ? "Optional" : phase.state === "complete" ? "Complete" : "Waiting")
  }));
  const actionLabel = characterNeedsSetup
    ? "Set up channel character"
    : retryChain && !isRunning
      ? attention?.attention?.retryAction && attention.attention.retryAction !== "Retry stage"
        ? attention.attention.retryAction
        : "Retry automatic workflow"
      : attention
        ? `Open ${attention.name}`
        : checkpoint
          ? `Review ${checkpoint.name}`
          : nextChain && !isRunning
            ? "Continue production"
            : nextStageName
              ? `Open ${nextStageName}`
              : "Production complete";
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
        eyebrow="Project command center"
        title={project.setup.projectName}
        description="One place to see progress. The app runs safe stages automatically and opens a review screen only when you choose it."
        actions={<div className="button-row">{progress.percent === 100 ? <><button className="button secondary" type="button" onClick={() => props.setRoute("final-preview")}>Watch final video</button><button className="button secondary" type="button" onClick={() => props.setRoute("export")}>Open export</button></> : null}<button className="button primary" type="button" disabled={isRunning || (!actionStage && !nextStage && !nextChain)} onClick={() => void continueProduction()}>{isRunning ? "Production is running..." : actionLabel}</button></div>}
      />
      <section className="metric-grid">
        <MetricCard label="Status" value={creatorStatusLabel(resolveProductionStatus(project))} />
        <MetricCard label="Progress" value={`${progress.percent}%`} />
        <MetricCard label="Language" value={project.setup.language || project.targetLanguage} />
        <MetricCard label="Current step" value={progress.currentStageName ?? "Complete"} />
      </section>
      {props.semiAutomaticProgress ? (
        <SectionCard title={props.semiAutomaticRunning ? "Live progress" : "Last automatic update"} description="The current automatic phase and latest persisted result are shown here.">
          <p>{props.semiAutomaticProgress.message}</p>
          <p className="muted">{props.semiAutomaticProgress.completed}/{props.semiAutomaticProgress.total} completed - {props.semiAutomaticProgress.stageId}</p>
        </SectionCard>
      ) : null}
      {props.semiAutomaticError ? <SectionCard title="Needs attention"><p className="error-message">{props.semiAutomaticError}</p></SectionCard> : null}
      <SectionCard title="Project command center" description="Progress summary: only applicable required stages count toward progress. Optional outputs are shown separately.">
        <div className="route-result">
          <StatusBadge tone={stageTone(progress.currentStageId ? "current" : "complete")}>{progress.completedCount}/{progress.totalCount} required stages complete</StatusBadge>
          <strong>{progress.currentStageName ? `Current: ${progress.currentStageName}` : "Project complete"}</strong>
          <span>{progress.currentPhaseName ? `Current phase: ${progress.currentPhaseName}. ` : ""}{actionLabel}.</span>
        </div>
        {capcut?.state === "optional" ? <p className="muted">CapCut Draft is optional and does not block Packaging Export.</p> : null}
        {progress.percent === 100 ? <div className="button-row"><button className="button primary compact" type="button" onClick={() => props.setRoute("final-preview")}>Watch final video</button><button className="button secondary compact" type="button" onClick={() => props.setRoute("export")}>View exported files</button></div> : null}
      </SectionCard>
      <SectionCard title={attention ? "Action required" : checkpoint ? "Review available" : "Production progress"} description={attention?.attention?.message ?? (checkpoint ? "Open the review only when you are ready. Confirming it returns you here." : "Automatic stages continue until a human decision is required.")}>
        {attention || checkpoint ? (
          <div className="route-result">
            <StatusBadge tone={attention ? "danger" : "info"}>{attention ? "Needs attention" : "Needs review"}</StatusBadge>
            <strong>{attention?.name ?? checkpoint?.name}</strong>
            <span>{attention?.attention?.message ?? "A review decision is ready."}</span>
          </div>
        ) : isRunning ? (
          <p className="muted">No action is required right now. Keep this screen open to monitor the project.</p>
        ) : (
          <p className="muted">The next safe step will appear here when it is ready.</p>
        )}
      </SectionCard>
      <SectionCard title="Production phases">
        <div className="status-grid">
          {phaseRows.map((phase) => (
            <div className="status-row" key={phase.id}>
              <span>{phase.name}</span>
              <StatusBadge tone={stageTone(phase.state)}>{creatorPhaseStateLabel(phase.state)}</StatusBadge>
              <small>{phase.currentStage ?? "Complete"}</small>
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Project details">
        <SettingsList items={[
          ["Channel profile", props.selectedProfile?.name ?? project.profileId],
          ["Target duration", project.setup.targetDuration],
          ["Workflow mode", workflowModeOptions.find((option) => option.value === project.setup.workflowMode)?.label ?? project.setup.workflowMode],
          ["Scenes", String(project.scenes.length)],
          ["Shots", String(project.shots.length)],
          ["Approved idea", project.approvedIdeaId ?? "Pending"]
        ]} />
      </SectionCard>
      <SectionCard title="Advanced controls" description="Internal stages remain available for debugging, not as the normal production path.">
        <div className="button-row">
          <button className="button secondary compact" type="button" onClick={() => props.setRoute("reference-intake")}>Reference Intake</button>
          <button className="button secondary compact" type="button" onClick={() => props.setRoute("advanced-pipeline")}>Open Advanced Pipeline Details</button>
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
