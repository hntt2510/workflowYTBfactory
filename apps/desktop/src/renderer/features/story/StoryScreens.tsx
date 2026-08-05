import React, { useEffect, useState } from "react";
import type { ChannelProfile, FactoryProject, StageEligibility } from "@lsf/domain";
import { resolveStageEligibilities, workflowStageDefinitions } from "@lsf/domain";
import { factoryClient } from "../../services/factoryClient";
import type { RouteId } from "../../navigation";
import { DataTable, DisabledAction, EmptyState, FormField, MetricCard, PageHeader, SectionCard, StatusBadge, TagList } from "../../components/ui";
import type {
  CompetitorDnaArtifact,
  CompetitorWorkflowRun,
  FactReviewArtifact,
  OpportunityMapArtifact,
  OriginalityReviewArtifact,
  OutlineArtifact,
  ReferenceSegmentationArtifact,
  RetentionReviewArtifact,
  ScriptArtifact,
  TextModelCertificationResponse,
  TranscriptCleaningArtifact
} from "../../types";
import { creatorStatusLabel } from "../../creatorStudioCopy";
import { formatDate, safeRendererError, stageTone } from "../../utils";
import { hasSemiAutomaticAttention, type SemiAutomaticChain } from "../../semiAutomaticWorkflow";
import { StageStatusHeader } from "../../components/workflow";

const competitorWorkflowStageIds: CompetitorWorkflowRun["stageId"][] = ["transcript-cleaning", "reference-segmentation", "competitor-dna"];

async function loadCompetitorWorkflowRuns(projectId: string): Promise<CompetitorWorkflowRun[]> {
  const runs = await Promise.all(competitorWorkflowStageIds.map((stageId) => factoryClient.listCompetitorWorkflowRuns({ projectId, stageId })));
  return runs.flat().sort((left, right) => (right.startedAt ?? "").localeCompare(left.startedAt ?? ""));
}

function chunkProgressLabel(run: CompetitorWorkflowRun): string {
  const chunks = run.payloadJson?.chunks;
  const persistedTotal = run.payloadJson?.chunkCount;
  const firstChunk = Array.isArray(chunks) ? chunks.find((chunk) => typeof chunk === "object" && chunk !== null && "totalChunks" in chunk) : undefined;
  const total = typeof persistedTotal === "number" && persistedTotal > 0
    ? persistedTotal
    : typeof firstChunk === "object" && firstChunk !== null && "totalChunks" in firstChunk && typeof firstChunk.totalChunks === "number"
      ? firstChunk.totalChunks
      : Array.isArray(chunks) && chunks.length > 0 ? chunks.length : 0;
  if (!total) return "-";
  const completed = Array.isArray(chunks) ? chunks.filter((chunk) => typeof chunk === "object" && chunk !== null && "status" in chunk && chunk.status === "completed").length : 0;
  const failed = Array.isArray(chunks) ? chunks.filter((chunk) => typeof chunk === "object" && chunk !== null && "status" in chunk && chunk.status === "failed") : [];
  const failedLabel = failed.length ? `, failed chunk ${(failed[0] as { chunkIndex?: unknown }).chunkIndex ?? "?"}` : "";
  return `${completed}/${total} chunks completed${failedLabel}`;
}

function workflowStageLabel(stageId: CompetitorWorkflowRun["stageId"]): string {
  return stageId === "transcript-cleaning" ? "Transcript Cleaning" : stageId === "reference-segmentation" ? "Reference Segmentation" : "Competitor DNA";
}
function ActionableBlockedState(props: { eligibility: StageEligibility; setRoute: (route: RouteId) => void }) {
  if (!props.eligibility.blockingReasons.length) return null;
  return (
    <SectionCard title="Blocked prerequisites">
      <div className="status-grid">
        {props.eligibility.blockingReasons.map((reason) => (
          <div className="status-row" key={`${props.eligibility.stageId}-${reason.code}`}>
            <span>{reason.message}</span>
            <StatusBadge tone="warning">{creatorStatusLabel(reason.code)}</StatusBadge>
            {(reason.actions?.length ? reason.actions : reason.actionRoute ? [{ label: "Go to required screen", route: reason.actionRoute }] : [])
              .filter((action) => action.route)
              .map((action) => <button className="button compact" key={`${reason.code}-${action.label}`} type="button" onClick={() => props.setRoute(action.route as RouteId)}>{action.label}</button>)}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

export function ReferenceIntakeScreen(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; setRoute: (route: RouteId) => void; startSemiAutomatic: (chain: SemiAutomaticChain, project: FactoryProject) => Promise<void> }) {
  const referenceValidation = resolveStageEligibilities(props.project).find((stage) => stage.stageId === "reference-validation")!;
  const canContinue = props.project.referenceSet?.status === "approved";
  return (
    <>
      <PageHeader
        title="Reference Intake"
        description="Paste competitor links, transcripts, or analysis blocks and save them into this project."
        actions={canContinue ? (
          <button className="button primary" type="button" onClick={() => props.setRoute("competitor-dna")}>Continue to Competitor Workflow</button>
        ) : (
          <DisabledAction reason={referenceValidation.blockingReasons[0]?.message ?? "Validate and approve the reference set first."}>Continue to Competitor Workflow</DisabledAction>
        )}
      />
      <StageStatusHeader
        stageName="Reference Validation"
        stageNumber={3}
        eligibility={referenceValidation}
        dependencies={["Reference Intake"]}
        purpose="Validate references, resolve duplicates, and approve the exact reference set that unlocks the competitor workflow."
      />
      <CompetitorReferenceIntake project={props.project} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} startSemiAutomatic={props.startSemiAutomatic} />
    </>
  );
}

function CompetitorReferenceIntake(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; setRoute: (route: RouteId) => void; startSemiAutomatic: (chain: SemiAutomaticChain, project: FactoryProject) => Promise<void> }) {
  const [sourceUrl, setSourceUrl] = useState("");
  const [pastedTranscript, setPastedTranscript] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [duplicateReferenceId, setDuplicateReferenceId] = useState<string | null>(null);
  const [editingReferenceId, setEditingReferenceId] = useState<string | null>(null);
  const [replaceReferenceId, setReplaceReferenceId] = useState<string | null>(null);
  const [viewingReferenceId, setViewingReferenceId] = useState<string | null>(null);
  const [expandedVersionRootId, setExpandedVersionRootId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const referenceSetStatus = props.project.referenceSet?.status ?? "not_started";
  const includedReferences = props.project.competitorReferences.filter((reference) => reference.included !== false);
  const includedCount = includedReferences.length;
  const validCount = props.project.referenceSet?.validCount ?? includedReferences.filter((reference) => reference.status === "valid" || reference.status === "approved").length;
  const invalidCount = props.project.referenceSet?.invalidCount ?? includedReferences.filter((reference) => reference.status === "invalid").length;
  const duplicateCount = props.project.referenceSet?.duplicateCount ?? includedReferences.filter((reference) => reference.status === "duplicate").length;
  const draftCount = props.project.referenceSet?.draftCount ?? includedReferences.filter((reference) => !reference.status || reference.status === "draft").length;
  const excludedCount = props.project.referenceSet?.excludedCount ?? props.project.competitorReferences.length - includedCount;
  const hasValidReferenceSet = referenceSetStatus === "valid";
  const referenceValidation = resolveStageEligibilities(props.project).find((stage) => stage.stageId === "reference-validation");
  const canContinue = referenceSetStatus === "approved";

  function referenceRootId(reference: typeof props.project.competitorReferences[number]): string {
    const byId = new Map(props.project.competitorReferences.map((item) => [item.id, item]));
    const visited = new Set<string>();
    let current = reference;
    while (current.parentReferenceId && !visited.has(current.id)) {
      visited.add(current.id);
      const parent = byId.get(current.parentReferenceId);
      if (!parent) break;
      current = parent;
    }
    return current.id;
  }

  async function confirmApprovedChange(action: string): Promise<boolean> {
    if (props.project.referenceSet?.status !== "approved") return true;
    const impact = await factoryClient.getReferenceChangeImpact();
    const stages = impact.stageNames.length ? impact.stageNames.map((name) => `- ${name}`).join("\n") : "- Reference Validation and dependent stages";
    return window.confirm(`${action} will invalidate:\n\n${stages}\n\nContinue?`);
  }

  async function addReference() {
    setSaving(true);
    setMessage("");
    try {
      if (replaceReferenceId) {
        if (!(await confirmApprovedChange("Creating a new transcript version"))) return;
        const project = await factoryClient.replaceCompetitorReference({
          projectId: props.project.id,
          referenceId: replaceReferenceId,
          pastedTranscript,
          ...(notes.trim() ? { notes: notes.trim() } : {})
        });
        props.setSelectedProject(project);
        clearForm();
        setMessage("Transcript version created. Validate the reference set again.");
        return;
      }
      if (editingReferenceId) {
        if (!(await confirmApprovedChange("Changing this approved reference"))) return;
        const project = await factoryClient.editCompetitorReference({
          projectId: props.project.id,
          referenceId: editingReferenceId,
          ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
          pastedTranscript,
          ...(notes.trim() ? { notes: notes.trim() } : {})
        });
        props.setSelectedProject(project);
        clearForm();
        setMessage("Reference edited. Validate the reference set again.");
        return;
      }
      if (!(await confirmApprovedChange("Adding a reference to this approved set"))) return;
      const result = await factoryClient.addCompetitorReference({
        projectId: props.project.id,
        ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
        pastedTranscript,
        ...(notes.trim() ? { notes: notes.trim() } : {})
      });
      props.setSelectedProject(result.project);
      if (result.status === "duplicate") {
        setDuplicateReferenceId(result.existingReference?.id ?? null);
        setMessage(result.message);
        return;
      }
      clearForm();
      setMessage(result.message);
    } catch (error) {
      setMessage(`Competitor reference save failed: ${safeRendererError(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function replaceDuplicate() {
    if (!duplicateReferenceId) return;
    setSaving(true);
    try {
      if (!(await confirmApprovedChange("Creating a new transcript version"))) return;
      const project = await factoryClient.replaceCompetitorReference({
        projectId: props.project.id,
        referenceId: duplicateReferenceId,
        pastedTranscript,
        ...(notes.trim() ? { notes: notes.trim() } : {})
      });
      props.setSelectedProject(project);
      clearForm();
      setDuplicateReferenceId(null);
      setMessage("Duplicate transcript saved as a new reference version.");
    } catch (error) {
      setMessage(`Reference replace failed: ${safeRendererError(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function validateReferenceSet() {
    try {
      const project = await factoryClient.validateReferenceSet({ projectId: props.project.id });
      props.setSelectedProject(project);
      setMessage(project.referenceSet?.status === "valid" ? "Reference set validated. Review and approve it to continue." : "Reference set validation found issues to fix.");
    } catch (error) {
      setMessage(`Reference validation failed: ${safeRendererError(error)}`);
    }
  }

  async function approveReferenceSet() {
    try {
      const project = await factoryClient.approveReferenceSet({ projectId: props.project.id });
      props.setSelectedProject(project);
      setMessage("Reference set approved. Competitor Workflow is now available.");
      if (project.setup.workflowMode === "semi_automatic") void props.startSemiAutomatic("reference", project);
    } catch (error) {
      setMessage(`Reference approval failed: ${safeRendererError(error)}`);
    }
  }

  async function rejectReferenceSet() {
    const project = await factoryClient.rejectReferenceSet({ projectId: props.project.id });
    props.setSelectedProject(project);
    setMessage("Reference set rejected. Update references, then validate again.");
  }

  async function revokeReferenceSetApproval() {
    if (!(await confirmApprovedChange("Revoking this approval"))) return;
    const project = await factoryClient.revokeReferenceSetApproval({ projectId: props.project.id });
    props.setSelectedProject(project);
    setMessage("Reference set approval revoked. Validate the current references before continuing.");
  }

  function startEdit(referenceId: string) {
    const reference = props.project.competitorReferences.find((item) => item.id === referenceId);
    if (!reference) return;
    setEditingReferenceId(reference.id);
    setReplaceReferenceId(null);
    setSourceUrl(reference.sourceUrl ?? "");
    setPastedTranscript(reference.pastedTranscript);
    setNotes(reference.notes ?? "");
    setDuplicateReferenceId(null);
  }

  function startReplace(referenceId: string) {
    const reference = props.project.competitorReferences.find((item) => item.id === referenceId);
    if (!reference) return;
    setEditingReferenceId(null);
    setReplaceReferenceId(reference.id);
    setSourceUrl(reference.sourceUrl ?? "");
    setPastedTranscript("");
    setNotes(reference.notes ?? "");
    setDuplicateReferenceId(null);
  }

  function clearForm() {
    setSourceUrl("");
    setPastedTranscript("");
    setNotes("");
    setEditingReferenceId(null);
    setReplaceReferenceId(null);
  }

  return (
    <>
      <SectionCard title="Competitor reference intake" description="Save references as Draft, validate them locally, then explicitly approve the current reference set.">
        <div className="form-grid">
          <FormField label="Competitor video URL" htmlFor="idea-competitor-url" hint="FFmpeg is required later for local video/audio processing; pasted URL is stored now for traceability.">
            <input id="idea-competitor-url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://..." />
          </FormField>
          <FormField label="Pasted transcript / analysis" htmlFor="idea-competitor-script">
            <textarea id="idea-competitor-script" value={pastedTranscript} onChange={(event) => setPastedTranscript(event.target.value)} placeholder="Paste the full competitor transcript or analysis block here" />
          </FormField>
          <FormField label="Notes" htmlFor="idea-competitor-notes">
            <textarea id="idea-competitor-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional notes for what AI should inspect" />
          </FormField>
          <div className="button-row">
            {pastedTranscript.trim() ? (
              <button className="button primary" type="button" onClick={() => void addReference()} disabled={saving}>{saving ? "Saving..." : replaceReferenceId ? "Create transcript version" : editingReferenceId ? "Save reference edits" : "Save competitor reference"}</button>
            ) : (
              <DisabledAction reason="Paste a transcript or analysis block before saving.">Save competitor reference</DisabledAction>
            )}
            {editingReferenceId || replaceReferenceId ? <button className="button secondary" type="button" onClick={clearForm}>Cancel edit</button> : null}
          </div>
          {duplicateReferenceId ? (
            <div className="button-row">
              <button className="button secondary" type="button" onClick={() => { setViewingReferenceId(duplicateReferenceId); setDuplicateReferenceId(null); }}>Open existing</button>
              <button className="button primary" type="button" onClick={() => void replaceDuplicate()} disabled={saving}>Replace transcript as new version</button>
              <button className="button secondary" type="button" onClick={() => { setDuplicateReferenceId(null); clearForm(); }}>Cancel duplicate</button>
            </div>
          ) : null}
          {message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}
        </div>
      </SectionCard>
      <SectionCard title="Reference set controls" description="A saved reference is only Draft until local validation and reference-set approval are complete.">
        <div className="metric-grid">
          <MetricCard label="Reference set" value={creatorStatusLabel(referenceSetStatus)} tone={referenceSetStatus === "approved" ? "success" : referenceSetStatus === "stale" ? "warning" : "info"} />
          <MetricCard label="Included" value={includedCount} />
          <MetricCard label="Valid" value={validCount} tone="success" />
          <MetricCard label="Invalid" value={invalidCount} tone={invalidCount ? "warning" : "info"} />
          <MetricCard label="Duplicates" value={duplicateCount} tone={duplicateCount ? "warning" : "info"} />
          <MetricCard label="Draft" value={draftCount} tone={draftCount ? "warning" : "info"} />
          <MetricCard label="Excluded" value={excludedCount} />
        </div>
        <p className="muted">Fingerprint: {props.project.referenceSet?.currentFingerprint ? `${props.project.referenceSet.currentFingerprint.slice(0, 12)}...` : "Not validated"} · Last validated: {props.project.referenceSet?.validationRunAt ? formatDate(props.project.referenceSet.validationRunAt) : "Never"} · Last approved: {props.project.referenceSet?.approvedAt ? formatDate(props.project.referenceSet.approvedAt) : "Never"}</p>
        <div className="button-row">
          {props.project.competitorReferences.length ? (
            <button className="button secondary" type="button" onClick={() => void validateReferenceSet()}>Validate reference set</button>
          ) : (
            <DisabledAction reason="Add at least one reference first.">Validate reference set</DisabledAction>
          )}
          {hasValidReferenceSet && referenceValidation?.approvable ? (
            <button className="button primary" type="button" onClick={() => void approveReferenceSet()}>Approve reference set</button>
          ) : (
            <DisabledAction reason={referenceValidation?.blockingReasons[0]?.message ?? "Reference set must be valid before approval."}>Approve reference set</DisabledAction>
          )}
          {hasValidReferenceSet ? (
            <button className="button danger" type="button" onClick={() => void rejectReferenceSet()}>Reject reference set</button>
          ) : null}
          {referenceSetStatus === "approved" ? (
            <button className="button danger" type="button" onClick={() => void revokeReferenceSetApproval()}>Revoke reference approval</button>
          ) : null}
          {canContinue ? (
            <button className="button primary" type="button" onClick={() => props.setRoute("competitor-dna")}>Continue to Competitor Workflow</button>
          ) : (
            <DisabledAction reason="Approve the validated reference set before continuing.">Continue to Competitor Workflow</DisabledAction>
          )}
        </div>
      </SectionCard>
      <SectionCard title="Saved competitor references">
        {props.project.competitorReferences.length === 0 ? (
          <EmptyState title="No competitor references yet" detail="Paste a transcript or analysis block above. AI analysis can use it after the provider pipeline is wired." />
        ) : (
          <DataTable label="Competitor references">
              <thead><tr><th>Include</th><th>Source identity</th><th>Transcript</th><th>Status</th><th>Version</th><th>Validated</th><th>Actions</th></tr></thead>
              <tbody>
                {props.project.competitorReferences.map((reference) => (
                  <React.Fragment key={reference.id}>
                  <tr key={reference.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={reference.included !== false}
                        onChange={(event) => {
                          void confirmApprovedChange("Changing this reference inclusion").then((confirmed) => confirmed
                            ? factoryClient.setReferenceIncluded({ projectId: props.project.id, referenceId: reference.id, included: event.target.checked }).then(props.setSelectedProject)
                            : undefined);
                        }}
                        aria-label={`Include ${reference.sourceUrl ?? reference.id}`}
                      />
                    </td>
                    <td><strong>{reference.identityKey ?? "manual"}</strong><small>{reference.sourceUrl ?? "Manual paste"}</small></td>
                    <td>{reference.pastedTranscript.slice(0, 180)}{reference.pastedTranscript.length > 180 ? "..." : ""}</td>
                    <td>
                      <StatusBadge tone={reference.status === "approved" || reference.status === "valid" ? "success" : reference.status === "invalid" || reference.status === "duplicate" ? "danger" : "warning"}>
                        {creatorStatusLabel(reference.status ?? "draft")}
                      </StatusBadge>
                      {reference.validationMessage ? <small>{reference.validationMessage}</small> : null}
                      {reference.validationErrors?.length ? <small>Errors: {reference.validationErrors.join(", ")}</small> : null}
                      {reference.validationWarnings?.length ? <small>Warnings: {reference.validationWarnings.join(", ")}</small> : null}
                    </td>
                    <td>{reference.version ?? 1}</td>
                    <td>{reference.validatedAt ? formatDate(reference.validatedAt) : "Never"}</td>
                    <td className="row-actions">
                      <button className="button compact" type="button" onClick={() => setViewingReferenceId(viewingReferenceId === reference.id ? null : reference.id)}>{viewingReferenceId === reference.id ? "Hide" : "View"}</button>
                      <button className="button compact" type="button" onClick={() => startEdit(reference.id)}>Edit</button>
                      <button className="button compact" type="button" onClick={() => startReplace(reference.id)}>Replace transcript</button>
                      <button className="button compact" type="button" onClick={() => { const rootId = referenceRootId(reference); setExpandedVersionRootId(expandedVersionRootId === rootId ? null : rootId); }}>{expandedVersionRootId === referenceRootId(reference) ? "Hide versions" : "Versions"}</button>
                      <button className="button compact" type="button" onClick={() => void validateReferenceSet()}>Validate</button>
                      <button className="button compact" type="button" onClick={() => void factoryClient.setReferenceIncluded({ projectId: props.project.id, referenceId: reference.id, included: reference.included === false }).then(props.setSelectedProject)}>{reference.included === false ? "Include" : "Exclude"}</button>
                      <button
                        className="button danger compact"
                        type="button"
                        onClick={() => {
                          void confirmApprovedChange("Deleting this reference").then((confirmed) => confirmed ? factoryClient.deleteCompetitorReference({ projectId: props.project.id, referenceId: reference.id }).then(props.setSelectedProject) : undefined);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                  {viewingReferenceId === reference.id || expandedVersionRootId === referenceRootId(reference) ? (
                    <tr key={`${reference.id}-details`}><td colSpan={7}>
                      {viewingReferenceId === reference.id ? <div><strong>Current transcript</strong><p>{reference.pastedTranscript}</p><small>Identity: {reference.identityKey ?? "manual"} · Created: {formatDate(reference.createdAt)} · Updated: {reference.updatedAt ? formatDate(reference.updatedAt) : "Never"}</small></div> : null}
                      {expandedVersionRootId === referenceRootId(reference) ? <div><strong>Transcript versions</strong><p>{props.project.competitorReferences.filter((item) => referenceRootId(item) === referenceRootId(reference)).map((item) => `v${item.version ?? 1} ${item.id}${item.included === false ? " (inactive)" : " (current)"}`).join(" · ")}</p></div> : null}
                    </td></tr>
                  ) : null}
                  </React.Fragment>
                ))}
              </tbody>
            </DataTable>
        )}
      </SectionCard>
    </>
  );
}

export function CompetitorDnaScreen(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; setRoute: (route: RouteId) => void; textCertification: TextModelCertificationResponse; startSemiAutomatic: (chain: SemiAutomaticChain, project: FactoryProject) => Promise<void> }) {
  const [runningReferenceId, setRunningReferenceId] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState("");
  const [cleaningArtifacts, setCleaningArtifacts] = useState<TranscriptCleaningArtifact[]>([]);
  const [segmentationArtifacts, setSegmentationArtifacts] = useState<ReferenceSegmentationArtifact[]>([]);
  const [dnaArtifacts, setDnaArtifacts] = useState<CompetitorDnaArtifact[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<CompetitorWorkflowRun[]>([]);
  const hasReferences = props.project.competitorReferences.length > 0;
  const eligibilities = resolveStageEligibilities(props.project, { textVerified: props.textCertification.status === "verified" });
  const transcriptCleaning = eligibilities.find((stage) => stage.stageId === "transcript-cleaning")!;
  const segmentation = eligibilities.find((stage) => stage.stageId === "reference-segmentation")!;
  const competitorDna = eligibilities.find((stage) => stage.stageId === "competitor-dna")!;
  const approvedReferences = props.project.competitorReferences.filter((reference) => reference.included !== false && reference.status === "approved");
  const isSemiAutomatic = props.project.setup.workflowMode === "semi_automatic";

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      Promise.all(approvedReferences.map((reference) => factoryClient.listTranscriptCleaningArtifacts({ projectId: props.project.id, referenceId: reference.id }))),
      Promise.all(approvedReferences.map((reference) => factoryClient.listReferenceSegmentationArtifacts({ projectId: props.project.id, referenceId: reference.id }))),
      Promise.all(approvedReferences.map((reference) => factoryClient.listCompetitorDnaArtifacts({ projectId: props.project.id, referenceId: reference.id }))),
      loadCompetitorWorkflowRuns(props.project.id)
    ])
      .then(([cleaning, segmentationArtifacts, dnaArtifacts, runs]) => {
        if (!cancelled) {
          setCleaningArtifacts(cleaning.flat());
          setSegmentationArtifacts(segmentationArtifacts.flat());
          setDnaArtifacts(dnaArtifacts.flat());
          setWorkflowRuns(runs);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCleaningArtifacts([]);
          setSegmentationArtifacts([]);
          setDnaArtifacts([]);
          setWorkflowRuns([]);
        }
      });
    return () => { cancelled = true; };
  }, [props.project]);

  useEffect(() => {
    if (!runningReferenceId) return;
    let cancelled = false;
    const refresh = () => {
      void loadCompetitorWorkflowRuns(props.project.id).then((runs) => {
        if (!cancelled) setWorkflowRuns(runs);
      }).catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [runningReferenceId, props.project.id]);

  async function reloadWorkflowRuns() {
    try { setWorkflowRuns(await loadCompetitorWorkflowRuns(props.project.id)); } catch { /* keep the last persisted view */ }
  }

  function continueAutomaticReferenceChain(project: FactoryProject): void {
    if (project.setup.workflowMode === "semi_automatic") void props.startSemiAutomatic("reference", project);
  }

  async function runCleaning(referenceId: string) {
    setRunningReferenceId(referenceId);
    setRunMessage("");
    try {
      const project = await factoryClient.runTranscriptCleaning({ projectId: props.project.id, referenceId });
      props.setSelectedProject(project);
      continueAutomaticReferenceChain(project);
      const artifacts = await factoryClient.listTranscriptCleaningArtifacts({ projectId: props.project.id, referenceId });
      setCleaningArtifacts((current) => [...current.filter((artifact) => artifact.payloadJson.referenceId !== referenceId), ...artifacts]);
      const stageStatus = project.stages.find((stage) => stage.id === "transcript-cleaning")?.status;
      setRunMessage(stageStatus === "queued" || stageStatus === "running"
        ? "Transcript Cleaning is already running; no duplicate request was sent."
        : "Transcript Cleaning completed and is ready for review.");
    } catch (error) {
      setRunMessage(`Transcript Cleaning failed: ${safeRendererError(error)}`);
    } finally {
      void reloadWorkflowRuns();
      setRunningReferenceId(null);
    }
  }

  async function approveCleaning(referenceId: string) {
    setRunningReferenceId(referenceId);
    setRunMessage("");
    try {
      const project = await factoryClient.approveTranscriptCleaning({ projectId: props.project.id, referenceId });
      props.setSelectedProject(project);
      continueAutomaticReferenceChain(project);
      const artifacts = await factoryClient.listTranscriptCleaningArtifacts({ projectId: props.project.id, referenceId });
      setCleaningArtifacts((current) => [...current.filter((artifact) => artifact.payloadJson.referenceId !== referenceId), ...artifacts]);
      setRunMessage("Cleaned transcript approved.");
    } catch (error) {
      setRunMessage(`Transcript approval failed: ${safeRendererError(error)}`);
    } finally {
      void reloadWorkflowRuns();
      setRunningReferenceId(null);
    }
  }

  async function rejectCleaning(referenceId: string) {
    setRunningReferenceId(referenceId);
    setRunMessage("");
    try {
      const project = await factoryClient.rejectTranscriptCleaning({ projectId: props.project.id, referenceId });
      props.setSelectedProject(project);
      const artifacts = await factoryClient.listTranscriptCleaningArtifacts({ projectId: props.project.id, referenceId });
      setCleaningArtifacts((current) => [...current.filter((artifact) => artifact.payloadJson.referenceId !== referenceId), ...artifacts]);
      setRunMessage("Cleaned transcript rejected.");
    } catch (error) {
      setRunMessage(`Transcript rejection failed: ${safeRendererError(error)}`);
    } finally {
      void reloadWorkflowRuns();
      setRunningReferenceId(null);
    }
  }

  async function runSegmentation(referenceId: string) {
    setRunningReferenceId(referenceId);
    setRunMessage("");
    try {
      const project = await factoryClient.runReferenceSegmentation({ projectId: props.project.id, referenceId });
      props.setSelectedProject(project);
      continueAutomaticReferenceChain(project);
      const artifacts = await factoryClient.listReferenceSegmentationArtifacts({ projectId: props.project.id, referenceId });
      setSegmentationArtifacts((current) => current.filter((artifact) => artifact.payloadJson.referenceId !== referenceId).concat(artifacts));
      setRunMessage("Reference Segmentation completed and is ready for review.");
    } catch (error) {
      setRunMessage(`Reference Segmentation failed: ${safeRendererError(error)}`);
    } finally {
      void reloadWorkflowRuns();
      setRunningReferenceId(null);
    }
  }

  async function approveSegmentation(referenceId: string) {
    setRunningReferenceId(referenceId);
    setRunMessage("");
    try {
      const project = await factoryClient.approveReferenceSegmentation({ projectId: props.project.id, referenceId });
      props.setSelectedProject(project);
      continueAutomaticReferenceChain(project);
      const artifacts = await factoryClient.listReferenceSegmentationArtifacts({ projectId: props.project.id, referenceId });
      setSegmentationArtifacts((current) => current.filter((artifact) => artifact.payloadJson.referenceId !== referenceId).concat(artifacts));
      setRunMessage("Reference segmentation approved.");
    } catch (error) {
      setRunMessage(`Segmentation approval failed: ${safeRendererError(error)}`);
    } finally {
      setRunningReferenceId(null);
    }
  }

  async function rejectSegmentation(referenceId: string) {
    setRunningReferenceId(referenceId);
    setRunMessage("");
    try {
      const project = await factoryClient.rejectReferenceSegmentation({ projectId: props.project.id, referenceId });
      props.setSelectedProject(project);
      const artifacts = await factoryClient.listReferenceSegmentationArtifacts({ projectId: props.project.id, referenceId });
      setSegmentationArtifacts((current) => current.filter((artifact) => artifact.payloadJson.referenceId !== referenceId).concat(artifacts));
      setRunMessage("Reference segmentation rejected.");
    } catch (error) {
      setRunMessage(`Segmentation rejection failed: ${safeRendererError(error)}`);
    } finally {
      setRunningReferenceId(null);
    }
  }

  async function runDna(referenceId: string) {
    setRunningReferenceId(referenceId); setRunMessage("");
    try {
      const project = await factoryClient.runCompetitorDna({ projectId: props.project.id, referenceId });
      props.setSelectedProject(project);
      continueAutomaticReferenceChain(project);
      const artifacts = await factoryClient.listCompetitorDnaArtifacts({ projectId: props.project.id, referenceId });
      setDnaArtifacts((current) => current.filter((artifact) => artifact.payloadJson.referenceId !== referenceId).concat(artifacts));
      setRunMessage("Competitor DNA completed and is ready for review.");
    } catch (error) { setRunMessage(`Competitor DNA failed: ${safeRendererError(error)}`); }
    finally { void reloadWorkflowRuns(); setRunningReferenceId(null); }
  }

  async function approveDna(referenceId: string) {
    setRunningReferenceId(referenceId); setRunMessage("");
    try {
      const project = await factoryClient.approveCompetitorDna({ projectId: props.project.id, referenceId });
      props.setSelectedProject(project);
      continueAutomaticReferenceChain(project);
      const artifacts = await factoryClient.listCompetitorDnaArtifacts({ projectId: props.project.id, referenceId });
      setDnaArtifacts((current) => current.filter((artifact) => artifact.payloadJson.referenceId !== referenceId).concat(artifacts));
      setRunMessage("Competitor DNA approved.");
    } catch (error) { setRunMessage(`Competitor DNA approval failed: ${safeRendererError(error)}`); }
    finally { void reloadWorkflowRuns(); setRunningReferenceId(null); }
  }

  async function rejectDna(referenceId: string) {
    setRunningReferenceId(referenceId); setRunMessage("");
    try {
      const project = await factoryClient.rejectCompetitorDna({ projectId: props.project.id, referenceId });
      props.setSelectedProject(project);
      const artifacts = await factoryClient.listCompetitorDnaArtifacts({ projectId: props.project.id, referenceId });
      setDnaArtifacts((current) => current.filter((artifact) => artifact.payloadJson.referenceId !== referenceId).concat(artifacts));
      setRunMessage("Competitor DNA rejected.");
    } catch (error) { setRunMessage(`Competitor DNA rejection failed: ${safeRendererError(error)}`); }
    finally { void reloadWorkflowRuns(); setRunningReferenceId(null); }
  }

  function canRunStage(stage: StageEligibility): boolean {
    return stage.runnable || stage.status === "failed" || stage.status === "needs_attention";
  }

  function stageActionReason(stage: StageEligibility, fallback: string): string {
    return stage.blockingReasons[0]?.message ?? fallback;
  }

  function nextReferenceAction<T extends { status: string; payloadJson: { referenceId: string } }>(artifacts: T[]): { referenceId: string; kind: "approve" | "run" } | null {
    for (const reference of approvedReferences) {
      const current = artifacts.filter((artifact) => artifact.payloadJson.referenceId === reference.id && artifact.status !== "stale");
      if (current.some((artifact) => artifact.status === "needs_review")) return { referenceId: reference.id, kind: "approve" };
      if (!current.some((artifact) => artifact.status === "approved")) return { referenceId: reference.id, kind: "run" };
    }
    return null;
  }

  const nextSegmentationAction = nextReferenceAction(segmentationArtifacts);
  const nextDnaAction = nextReferenceAction(dnaArtifacts);
  const canRunPendingReferenceStage = (stage: StageEligibility): boolean =>
    stage.runnable || stage.status === "needs_review" || stage.status === "failed" || stage.status === "needs_attention";
  const canManuallyRunStage = (stage: StageEligibility): boolean =>
    !isSemiAutomatic || stage.status === "failed" || stage.status === "needs_attention";

  return (
    <>
      <PageHeader
        title="Competitor DNA"
        description="Competitor workflow starts with Transcript Cleaning, then Segmentation, then Competitor DNA review."
        actions={
          <>
            <button className="button secondary" type="button" onClick={() => props.setRoute("reference-intake")}>Back to references</button>
            {!isSemiAutomatic && approvedReferences.length && transcriptCleaning.runnable ? (
              <button className="button primary" type="button" onClick={() => void runCleaning(approvedReferences[0]!.id)} disabled={runningReferenceId !== null}>
                {runningReferenceId ? "Cleaning transcript..." : "Run Transcript Cleaning"}
              </button>
            ) : isSemiAutomatic && !hasSemiAutomaticAttention(props.project) ? (
              <span className="muted">Transcript Cleaning, Segmentation, and Competitor DNA run automatically.</span>
            ) : (
              <DisabledAction reason={transcriptCleaning.blockingReasons[0]?.message ?? "Transcript Cleaning is not runnable yet."}>Run Transcript Cleaning</DisabledAction>
            )}
            {!isSemiAutomatic && nextSegmentationAction?.kind === "approve" ? (
              <button className="button secondary" type="button" onClick={() => void approveSegmentation(nextSegmentationAction.referenceId)} disabled={runningReferenceId !== null || !segmentation.approvable}>Approve Segmentation</button>
            ) : !isSemiAutomatic && nextSegmentationAction?.kind === "run" && canRunPendingReferenceStage(segmentation) ? (
              <button className="button secondary" type="button" onClick={() => void runSegmentation(nextSegmentationAction.referenceId)} disabled={runningReferenceId !== null}>Run Segmentation</button>
            ) : canManuallyRunStage(segmentation) && segmentation.status !== "approved" ? (
              <DisabledAction reason={stageActionReason(segmentation, "Approve all cleaned transcripts before running Segmentation.")}>Run Segmentation</DisabledAction>
            ) : null}
            {!isSemiAutomatic && nextDnaAction?.kind === "approve" ? (
              <button className="button secondary" type="button" onClick={() => void approveDna(nextDnaAction.referenceId)} disabled={runningReferenceId !== null || !competitorDna.approvable}>Approve DNA</button>
            ) : !isSemiAutomatic && nextDnaAction?.kind === "run" && canRunPendingReferenceStage(competitorDna) ? (
              <button className="button secondary" type="button" onClick={() => void runDna(nextDnaAction.referenceId)} disabled={runningReferenceId !== null}>Run DNA</button>
            ) : canManuallyRunStage(competitorDna) && competitorDna.status !== "approved" ? (
              <DisabledAction reason={stageActionReason(competitorDna, "Approve all segmentations before running Competitor DNA.")}>Run DNA</DisabledAction>
            ) : null}
          </>
        }
      />
      <StageStatusHeader
        stageName="Transcript Cleaning"
        stageNumber={4}
        eligibility={transcriptCleaning}
        dependencies={["Reference Validation"]}
        purpose="First runnable stage in the competitor workflow. It must use the approved reference set, not raw pasted drafts."
      />
      <ActionableBlockedState eligibility={transcriptCleaning} setRoute={props.setRoute} />
      <ActionableBlockedState eligibility={segmentation} setRoute={props.setRoute} />
      <ActionableBlockedState eligibility={competitorDna} setRoute={props.setRoute} />
      <SectionCard title="Next competitor actions" description="The next runnable action is shown here so Segmentation and Competitor DNA do not get hidden below the transcript table.">
        <div className="button-row">
          {approvedReferences.map((reference) => {
            const cleaningArtifact = cleaningArtifacts.find((artifact) => artifact.payloadJson.referenceId === reference.id && artifact.status === "needs_review");
            const segmentationArtifact = segmentationArtifacts.find((artifact) => artifact.payloadJson.referenceId === reference.id && artifact.status === "needs_review");
            const dnaArtifact = dnaArtifacts.find((artifact) => artifact.payloadJson.referenceId === reference.id && artifact.status === "needs_review");
            return <React.Fragment key={`next-${reference.id}`}>
              {!isSemiAutomatic && cleaningArtifact ? <button className="button compact" type="button" onClick={() => void approveCleaning(reference.id)} disabled={runningReferenceId !== null}>Approve Cleaning</button> : null}
              {(!isSemiAutomatic || transcriptCleaning.status === "failed" || transcriptCleaning.status === "needs_attention") && !cleaningArtifact && canRunStage(transcriptCleaning) ? <button className="button compact" type="button" onClick={() => void runCleaning(reference.id)} disabled={runningReferenceId !== null}>{transcriptCleaning.status === "failed" || transcriptCleaning.status === "needs_attention" ? "Retry Cleaning" : "Run Cleaning"}</button> : null}
              {!isSemiAutomatic && segmentationArtifact ? <button className="button compact" type="button" onClick={() => void approveSegmentation(reference.id)} disabled={runningReferenceId !== null}>Approve Segmentation</button> : null}
              {(!isSemiAutomatic || segmentation.status === "failed" || segmentation.status === "needs_attention") && !segmentationArtifact ? canRunStage(segmentation) ? <button className="button compact" type="button" onClick={() => void runSegmentation(reference.id)} disabled={runningReferenceId !== null}>{segmentation.status === "failed" || segmentation.status === "needs_attention" ? "Retry Segmentation" : "Run Segmentation"}</button> : <DisabledAction reason={stageActionReason(segmentation, "Approve all cleaned transcripts before running Segmentation.")}>Run Segmentation</DisabledAction> : null}
              {!isSemiAutomatic && dnaArtifact ? <button className="button compact" type="button" onClick={() => void approveDna(reference.id)} disabled={runningReferenceId !== null}>Approve DNA</button> : null}
              {(!isSemiAutomatic || competitorDna.status === "failed" || competitorDna.status === "needs_attention") && !dnaArtifact ? canRunStage(competitorDna) ? <button className="button compact" type="button" onClick={() => void runDna(reference.id)} disabled={runningReferenceId !== null}>{competitorDna.status === "failed" || competitorDna.status === "needs_attention" ? "Retry DNA" : "Run DNA"}</button> : <DisabledAction reason={stageActionReason(competitorDna, "Approve all segmentations before running Competitor DNA.")}>Run DNA</DisabledAction> : null}
            </React.Fragment>;
          })}
          {!approvedReferences.length ? <>
            <DisabledAction reason="Approve at least one included reference before running the competitor workflow.">Run Segmentation</DisabledAction>
            <DisabledAction reason="Approve at least one included reference before running the competitor workflow.">Run DNA</DisabledAction>
          </> : null}
        </div>
      </SectionCard>
      {!hasReferences ? (
        <EmptyState
          title="No references saved"
          detail="Add at least one competitor reference before this stage can run."
          action={<button className="button primary" type="button" onClick={() => props.setRoute("reference-intake")}>Add reference</button>}
        />
      ) : (
        <SectionCard title="Current approved input" description="Only approved included references may feed Transcript Cleaning. In Semi-automatic mode the eligible chain starts automatically; controls remain available for Guided mode and failed-run recovery.">
          <DataTable label="Competitor DNA inputs">
            <thead><tr><th>Source</th><th>Raw transcript</th><th>Added</th><th>Run</th><th>Review output</th></tr></thead>
            <tbody>
              {props.project.competitorReferences.filter((reference) => reference.included !== false).map((reference) => (
                <tr key={reference.id}>
                  <td>{reference.sourceUrl ?? "Manual paste"}</td>
                  <td>{reference.pastedTranscript.slice(0, 180)}{reference.pastedTranscript.length > 180 ? "..." : ""}</td>
                  <td>{formatDate(reference.createdAt)}</td>
                  <td>
                    <StatusBadge tone={reference.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(reference.status ?? "draft")}</StatusBadge>
                    {reference.status === "approved" && !isSemiAutomatic && transcriptCleaning.runnable ? (
                      <button className="button compact" type="button" onClick={() => void runCleaning(reference.id)} disabled={runningReferenceId !== null}>
                        {runningReferenceId === reference.id ? "Running..." : "Clean"}
                      </button>
                    ) : null}
                  </td>
                  <td>
                    {cleaningArtifacts.filter((artifact) => artifact.payloadJson.referenceId === reference.id).map((artifact) => (
                      <div key={artifact.id}>
                        <StatusBadge tone={artifact.status === "approved" ? "success" : artifact.status === "needs_review" ? "warning" : "info"}>{creatorStatusLabel(artifact.status)}</StatusBadge>
                        <small>{artifact.payloadJson.cleanedTranscript.slice(0, 140)}{artifact.payloadJson.cleanedTranscript.length > 140 ? "..." : ""}</small>
                        <small>Characters: {artifact.payloadJson.sourceCharacterCount} -&gt; {artifact.payloadJson.cleanedCharacterCount}; chunks: {artifact.payloadJson.execution.chunkCount}; flagged: {artifact.payloadJson.execution.flaggedSegmentCount}; removed noise: {artifact.payloadJson.execution.removedNoise}</small>
                        {artifact.payloadJson.warnings.length ? <small>Warnings: {artifact.payloadJson.warnings.join(", ").replaceAll("_", " ")}</small> : null}
                        <details><summary>Original / cleaned comparison</summary><small>Original: {reference.pastedTranscript}</small><small>Cleaned: {artifact.payloadJson.cleanedTranscript}</small></details>
                        {artifact.status === "needs_review" ? <div className="button-row">{transcriptCleaning.approvable ? <button className="button compact" type="button" onClick={() => void approveCleaning(reference.id)} disabled={runningReferenceId !== null}>Approve cleaned transcript</button> : <DisabledAction reason={transcriptCleaning.blockingReasons[0]?.message ?? "Transcript Cleaning cannot be approved yet."}>Approve cleaned transcript</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void rejectCleaning(reference.id)} disabled={runningReferenceId !== null}>Reject cleaned transcript</button></div> : null}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </SectionCard>
      )}
      <SectionCard title="Competitor workflow stages" description="Stages are persisted separately, but Semi-automatic mode runs each eligible stage in order and stops only on a checkpoint or error.">
        <DataTable label="Competitor workflow stage status">
          <thead><tr><th>Stage</th><th>Status</th><th>Runnable</th><th>Reason</th></tr></thead>
          <tbody>
            {[transcriptCleaning, segmentation, competitorDna].map((stage) => {
              const definition = workflowStageDefinitions.find((item) => item.id === stage.stageId);
              return (
                <tr key={stage.stageId}>
                  <td>{definition?.name ?? stage.stageId}</td>
                  <td><StatusBadge tone={stageTone(stage.status)}>{creatorStatusLabel(stage.status)}</StatusBadge></td>
                  <td>{stage.runnable ? "Yes" : "No"}</td>
                  <td>{stage.blockingReasons[0]?.message ?? "No blocking reason."}</td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </SectionCard>
      <StageStatusHeader stageName="Competitor DNA" stageNumber={6} eligibility={competitorDna} dependencies={["Reference Segmentation"]} purpose="Extract evidence-backed abstractions from one approved reference at a time; it never produces reusable wording or ideas." />
      <SectionCard title="Approved segmentation evidence" description="Competitor DNA is explicit per reference and uses only approved segmentation artifacts.">
        <DataTable label="Competitor DNA inputs"><thead><tr><th>Reference</th><th>Segments</th><th>DNA review</th><th>Action</th></tr></thead><tbody>
          {approvedReferences.map((reference) => {
            const dna = dnaArtifacts.filter((artifact) => artifact.payloadJson.referenceId === reference.id);
            const hasDna = dna.some((artifact) => artifact.status !== "stale");
            const canRun = competitorDna.runnable || (competitorDna.status === "needs_review" && !hasDna);
            return <tr key={reference.id}><td>{reference.sourceUrl ?? "Manual paste"}</td><td>{segmentationArtifacts.some((artifact) => artifact.status === "approved" && artifact.payloadJson.referenceId === reference.id) ? "Approved" : "Missing"}</td><td>{dna.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge><small>{artifact.payloadJson.hookPattern.abstraction}</small>{artifact.status === "needs_review" ? <div className="button-row">{competitorDna.approvable ? <button className="button compact" type="button" onClick={() => void approveDna(reference.id)} disabled={runningReferenceId !== null}>Approve DNA</button> : <DisabledAction reason={competitorDna.blockingReasons[0]?.message ?? "Competitor DNA cannot be approved yet."}>Approve DNA</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void rejectDna(reference.id)} disabled={runningReferenceId !== null}>Reject DNA</button></div> : null}</div>)}</td><td>{canRun ? <button className="button compact" type="button" onClick={() => void runDna(reference.id)} disabled={runningReferenceId !== null}>{runningReferenceId === reference.id ? "Running..." : "Analyze"}</button> : <DisabledAction reason={competitorDna.blockingReasons[0]?.message ?? "Competitor DNA is not runnable for this reference."}>Analyze</DisabledAction>}</td></tr>;
          })}
        </tbody></DataTable>
      </SectionCard>
      <StageStatusHeader
        stageName="Reference Segmentation"
        stageNumber={5}
        eligibility={segmentation}
        dependencies={["Transcript Cleaning"]}
        purpose="Split each approved cleaned transcript into exact, non-overlapping narrative segments before any competitor analysis."
      />
      <SectionCard title="Approved cleaned transcripts" description="Each explicit run consumes only an approved cleaning artifact and preserves its structured segment output for review.">
        <DataTable label="Reference Segmentation inputs">
          <thead><tr><th>Reference</th><th>Approved cleaned input</th><th>Segments</th><th>Action</th></tr></thead>
          <tbody>
            {approvedReferences.map((reference) => {
              const hasSegment = segmentationArtifacts.some((artifact) => artifact.payloadJson.referenceId === reference.id && artifact.status !== "stale");
              const canRun = segmentation.runnable || (segmentation.status === "needs_review" && !hasSegment);
              return <tr key={reference.id}>
                <td>{reference.sourceUrl ?? "Manual paste"}</td>
                <td>{cleaningArtifacts.some((artifact) => artifact.status === "approved" && artifact.payloadJson.referenceId === reference.id) ? "Approved" : "Missing"}</td>
                <td>{segmentationArtifacts.filter((artifact) => artifact.payloadJson.referenceId === reference.id).map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge><small>{artifact.payloadJson.segments.length} exact segments</small>{artifact.status === "needs_review" ? <div className="button-row">{segmentation.approvable ? <button className="button compact" type="button" onClick={() => void approveSegmentation(reference.id)} disabled={runningReferenceId !== null}>Approve segments</button> : <DisabledAction reason={segmentation.blockingReasons[0]?.message ?? "Reference Segmentation cannot be approved yet."}>Approve segments</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void rejectSegmentation(reference.id)} disabled={runningReferenceId !== null}>Reject segments</button></div> : null}</div>)}</td>
                <td>{canRun ? <button className="button compact" type="button" onClick={() => void runSegmentation(reference.id)} disabled={runningReferenceId !== null}>{runningReferenceId === reference.id ? "Running..." : "Segment"}</button> : <DisabledAction reason={segmentation.blockingReasons[0]?.message ?? "Segmentation is not runnable for this reference."}>Segment</DisabledAction>}</td>
              </tr>;
            })}
          </tbody>
        </DataTable>
      </SectionCard>
      {runMessage ? <p className={runMessage.includes("failed") ? "error-message" : "safe-message"}>{runMessage}</p> : null}
      <SectionCard title="Run history" description="Every Stage 4-6 execution is persisted with its run ID, input fingerprint, provider/model, progress and safe failure state.">
        {workflowRuns.length ? <DataTable label="Competitor workflow run history"><thead><tr><th>Stage</th><th>Status</th><th>Run ID</th><th>Provider / model</th><th>Started</th><th>Chunks</th><th>Input fingerprint</th><th>Safe error</th></tr></thead><tbody>
          {workflowRuns.map((run) => <tr key={run.id}>
            <td>{workflowStageLabel(run.stageId)}</td>
            <td><StatusBadge tone={stageTone(run.status)}>{creatorStatusLabel(run.status)}</StatusBadge></td>
            <td><code>{run.id}</code></td>
            <td>{run.providerId ?? "local"}{run.configuredModelId ? ` / ${run.configuredModelId}` : ""}</td>
            <td>{run.startedAt ? formatDate(run.startedAt) : "-"}{run.finishedAt ? ` -> ${formatDate(run.finishedAt)}` : ""}</td>
            <td>{chunkProgressLabel(run)}</td>
            <td><code>{run.inputFingerprint.slice(0, 16)}</code></td>
            <td>{run.safeErrorCategory ? `${run.safeErrorCategory}: ${run.safeErrorMessage ?? ""}` : "-"}</td>
          </tr>)}
        </tbody></DataTable> : <EmptyState title="No runs yet" detail="Run an approved reference to create a persisted StageRun history entry." />}
      </SectionCard>
    </>
  );
}

export function IdeaLabScreen(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; setRoute: (route: RouteId) => void; textCertification: TextModelCertificationResponse; startSemiAutomatic: (chain: SemiAutomaticChain, project: FactoryProject) => Promise<void> }) {
  const [artifacts, setArtifacts] = useState<OpportunityMapArtifact[]>([]);
  const [originalityArtifacts, setOriginalityArtifacts] = useState<OriginalityReviewArtifact[]>([]);
  const [message, setMessage] = useState("");
  const opportunity = resolveStageEligibilities(props.project, { textVerified: props.textCertification.status === "verified" }).find((stage) => stage.stageId === "opportunity-map")!;
  const ideaLab = resolveStageEligibilities(props.project, { textVerified: props.textCertification.status === "verified" }).find((stage) => stage.stageId === "idea-lab")!;
  const originalityReview = resolveStageEligibilities(props.project, { textVerified: props.textCertification.status === "verified" }).find((stage) => stage.stageId === "originality-review")!;
  const topicMode = props.project.setup.inputMode === "topic" && props.project.competitorReferences.length === 0;
  const [editingIdea, setEditingIdea] = useState<FactoryProject["ideas"][number] | null>(null);
  useEffect(() => { void factoryClient.listOpportunityMapArtifacts({ projectId: props.project.id }).then(setArtifacts).catch(() => setArtifacts([])); }, [props.project]);
  useEffect(() => { void factoryClient.listOriginalityReviewArtifacts({ projectId: props.project.id }).then(setOriginalityArtifacts).catch(() => setOriginalityArtifacts([])); }, [props.project]);
  async function runOpportunity() { try { const project = await factoryClient.runOpportunityMap({ projectId: props.project.id }); props.setSelectedProject(project); setArtifacts(await factoryClient.listOpportunityMapArtifacts({ projectId: props.project.id })); setMessage("Opportunity Map is ready for review."); } catch (error) { setMessage(`Opportunity Map failed: ${safeRendererError(error)}`); } }
  async function approveOpportunity() { try { const project = await factoryClient.approveOpportunityMap({ projectId: props.project.id }); props.setSelectedProject(project); setArtifacts(await factoryClient.listOpportunityMapArtifacts({ projectId: props.project.id })); setMessage("Opportunity Map approved."); } catch (error) { setMessage(`Opportunity approval failed: ${safeRendererError(error)}`); } }
  async function rejectOpportunity() { try { const project = await factoryClient.rejectOpportunityMap({ projectId: props.project.id }); props.setSelectedProject(project); setArtifacts(await factoryClient.listOpportunityMapArtifacts({ projectId: props.project.id })); setMessage("Opportunity Map rejected."); } catch (error) { setMessage(`Opportunity rejection failed: ${safeRendererError(error)}`); } }
  async function runIdeas(force = false) { try { const project = await factoryClient.runIdeaLab({ projectId: props.project.id, ...(force ? { force: true } : {}) }); props.setSelectedProject(project); setMessage(force ? "Ideas regenerated. Choose one candidate to continue." : "Idea Lab is ready for review."); } catch (error) { setMessage(`Idea Lab failed: ${safeRendererError(error)}`); } }
  async function approveIdea(ideaId: string) { try { const project = await factoryClient.approveIdea({ projectId: props.project.id, ideaId }); props.setSelectedProject(project); props.setRoute("project-overview"); setMessage("Idea chosen as the creative direction."); if (project.setup.workflowMode === "semi_automatic") void props.startSemiAutomatic("idea", project); } catch (error) { setMessage(`Idea approval failed: ${safeRendererError(error)}`); } }
  async function saveEditedIdea() { if (!editingIdea) return; try { const project = await factoryClient.editIdea({ projectId: props.project.id, ideaId: editingIdea.id, changes: { workingTitle: editingIdea.workingTitle, angle: editingIdea.angle, corePromise: editingIdea.corePromise, viewerProblem: editingIdea.viewerProblem, dramaticQuestion: editingIdea.dramaticQuestion, targetEmotion: editingIdea.targetEmotion, thumbnailConcept: editingIdea.thumbnailConcept, noveltyExplanation: editingIdea.noveltyExplanation, productionDifficulty: editingIdea.productionDifficulty } }); props.setSelectedProject(project); setEditingIdea(null); setMessage("Idea edited. Review and choose it when ready."); } catch (error) { setMessage(`Idea edit failed: ${safeRendererError(error)}`); } }
  async function rejectIdeaLab() { try { const project = await factoryClient.rejectIdeaLab({ projectId: props.project.id }); props.setSelectedProject(project); setMessage("Idea Lab rejected."); } catch (error) { setMessage(`Idea Lab rejection failed: ${safeRendererError(error)}`); } }
  async function runOriginalityReview() { try { const project = await factoryClient.runOriginalityReview({ projectId: props.project.id }); props.setSelectedProject(project); setOriginalityArtifacts(await factoryClient.listOriginalityReviewArtifacts({ projectId: props.project.id })); setMessage("Originality Review is ready for review."); } catch (error) { setMessage(`Originality Review failed: ${safeRendererError(error)}`); } }
  async function approveOriginalityReview() { try { const project = await factoryClient.approveOriginalityReview({ projectId: props.project.id }); props.setSelectedProject(project); setOriginalityArtifacts(await factoryClient.listOriginalityReviewArtifacts({ projectId: props.project.id })); setMessage("Originality Review approved. Outline is now eligible."); } catch (error) { setMessage(`Originality approval failed: ${safeRendererError(error)}`); } }
  async function rejectOriginalityReview() { try { const project = await factoryClient.rejectOriginalityReview({ projectId: props.project.id }); props.setSelectedProject(project); setOriginalityArtifacts(await factoryClient.listOriginalityReviewArtifacts({ projectId: props.project.id })); setMessage("Originality Review rejected."); } catch (error) { setMessage(`Originality rejection failed: ${safeRendererError(error)}`); } }
  return (
    <>
      <PageHeader title="Idea Lab" description={topicMode ? "Topic mode generates original candidates directly, then pauses for one creative choice." : "Reference analysis is prepared internally; review the resulting ideas rather than approving every internal stage."} actions={props.project.ideas.length > 0 && ideaLab.status === "needs_review" ? <button className="button primary" type="button" onClick={() => void runIdeas(true)}>Regenerate Ideas</button> : topicMode || ideaLab.runnable ? <button className="button primary" type="button" onClick={() => void runIdeas()}>Generate Ideas</button> : opportunity.runnable ? <button className="button primary" type="button" onClick={() => void runOpportunity()}>Run Opportunity Map</button> : <DisabledAction reason={ideaLab.blockingReasons[0]?.message ?? opportunity.blockingReasons[0]?.message ?? "Idea generation is not ready."}>Generate Ideas</DisabledAction>} />
      {!topicMode ? <StageStatusHeader stageName="Opportunity Map" stageNumber={7} eligibility={opportunity} dependencies={["Competitor DNA"]} purpose="Internal evidence synthesis; users see its result through idea candidates." /> : null}
      {!topicMode ? <SectionCard title="Opportunity Map review" description="The map is persisted for diagnostics but is not a normal user checkpoint.">
        {artifacts.length ? artifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge><p>{artifact.payloadJson.recommendedContentSpaces.map((item) => `${item.text} (${item.confidence})`).join("; ") || "No recommended content spaces."}</p>{artifact.status === "needs_review" ? <div className="button-row"><button className="button compact" type="button" disabled={!opportunity.approvable} onClick={() => void approveOpportunity()}>Approve Opportunity Map</button><button className="button danger compact" type="button" onClick={() => void rejectOpportunity()}>Reject Opportunity Map</button></div> : null}</div>) : <EmptyState title="No Opportunity Map yet" detail="Approve Competitor DNA for every included reference, then run this stage explicitly." />}
        {message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}
      </SectionCard> : null}
      <StageStatusHeader stageName="Idea Lab" stageNumber={8} eligibility={ideaLab} dependencies={topicMode ? [] : ["Opportunity Map"]} purpose="Generate exactly six original candidates, then pause for the user to choose one." />
      <SectionCard title="Idea candidates" description="Provider-generated candidates require an explicit choice; no candidate is selected automatically.">
        {ideaLab.status === "needs_review" ? <div className="button-row"><button className="button danger compact" type="button" onClick={() => void rejectIdeaLab()}>Reject Idea Lab</button></div> : null}
        {ideaLab.status === "needs_review" || ideaLab.status === "approved" ? (
          <div className="card-grid">
            {props.project.ideas.map((idea) => <SectionCard key={idea.id} title={idea.workingTitle} description={idea.angle} className="compact-card">
              <p><strong>Core promise:</strong> {idea.corePromise}</p>
              <p><strong>Viewer question:</strong> {idea.dramaticQuestion}</p>
              <p><strong>Target emotion:</strong> {idea.targetEmotion}</p>
              <p><strong>Thumbnail concept:</strong> {idea.thumbnailConcept}</p>
              <p><strong>Estimated difficulty:</strong> {idea.productionDifficulty} / <strong>Research risk:</strong> {idea.researchRisk}</p>
              <p><strong>Originality summary:</strong> {idea.noveltyExplanation}</p>
              <div className="button-row"><StatusBadge tone={props.project.approvedIdeaId === idea.id ? "success" : ideaLab.status === "needs_review" ? "warning" : "info"}>{props.project.approvedIdeaId === idea.id ? "Chosen idea" : ideaLab.status === "needs_review" ? "Review required" : "Candidate"}</StatusBadge>{ideaLab.status === "needs_review" ? <><button className="button primary compact" type="button" disabled={!ideaLab.approvable} onClick={() => void approveIdea(idea.id)}>Choose Idea</button><button className="button secondary compact" type="button" onClick={() => setEditingIdea(idea)}>Edit</button></> : null}</div>
              {editingIdea?.id === idea.id ? <div className="form-grid"><FormField label="Working title" htmlFor={`idea-title-${idea.id}`}><input id={`idea-title-${idea.id}`} value={editingIdea.workingTitle} onChange={(event) => setEditingIdea({ ...editingIdea, workingTitle: event.target.value })} /></FormField><FormField label="Angle" htmlFor={`idea-angle-${idea.id}`}><textarea id={`idea-angle-${idea.id}`} value={editingIdea.angle} onChange={(event) => setEditingIdea({ ...editingIdea, angle: event.target.value })} /></FormField><FormField label="Core promise" htmlFor={`idea-promise-${idea.id}`}><textarea id={`idea-promise-${idea.id}`} value={editingIdea.corePromise} onChange={(event) => setEditingIdea({ ...editingIdea, corePromise: event.target.value })} /></FormField><FormField label="Viewer problem" htmlFor={`idea-problem-${idea.id}`}><textarea id={`idea-problem-${idea.id}`} value={editingIdea.viewerProblem} onChange={(event) => setEditingIdea({ ...editingIdea, viewerProblem: event.target.value })} /></FormField><FormField label="Viewer question" htmlFor={`idea-question-${idea.id}`}><textarea id={`idea-question-${idea.id}`} value={editingIdea.dramaticQuestion} onChange={(event) => setEditingIdea({ ...editingIdea, dramaticQuestion: event.target.value })} /></FormField><FormField label="Target emotion" htmlFor={`idea-emotion-${idea.id}`}><input id={`idea-emotion-${idea.id}`} value={editingIdea.targetEmotion} onChange={(event) => setEditingIdea({ ...editingIdea, targetEmotion: event.target.value })} /></FormField><FormField label="Thumbnail concept" htmlFor={`idea-thumbnail-${idea.id}`}><textarea id={`idea-thumbnail-${idea.id}`} value={editingIdea.thumbnailConcept} onChange={(event) => setEditingIdea({ ...editingIdea, thumbnailConcept: event.target.value })} /></FormField><FormField label="Originality summary" htmlFor={`idea-originality-${idea.id}`}><textarea id={`idea-originality-${idea.id}`} value={editingIdea.noveltyExplanation} onChange={(event) => setEditingIdea({ ...editingIdea, noveltyExplanation: event.target.value })} /></FormField><FormField label="Estimated difficulty" htmlFor={`idea-difficulty-${idea.id}`}><select id={`idea-difficulty-${idea.id}`} value={editingIdea.productionDifficulty} onChange={(event) => setEditingIdea({ ...editingIdea, productionDifficulty: event.target.value as typeof editingIdea.productionDifficulty })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></FormField><div className="button-row"><button className="button primary compact" type="button" onClick={() => void saveEditedIdea()}>Save Edit</button><button className="button secondary compact" type="button" onClick={() => setEditingIdea(null)}>Cancel</button></div></div> : null}
            </SectionCard>)}
          </div>
        ) : (
          <EmptyState
            title="Idea Lab is blocked"
            detail={topicMode ? "Generate ideas to choose the creative direction." : ideaLab.blockingReasons[0]?.message ?? "Reference analysis is still preparing."}
            action={topicMode || opportunity.runnable ? <button className="button primary" type="button" onClick={() => void (topicMode ? runIdeas() : runOpportunity())}>{topicMode ? "Generate ideas" : "Run Opportunity Map"}</button> : undefined}
          />
        )}
      </SectionCard>
      <StageStatusHeader stageName="Originality Review" stageNumber={9} eligibility={originalityReview} dependencies={["Approved Idea Lab candidate", "Approved Competitor DNA"]} purpose="Check phrase, structural, thumbnail, and concept overlap against stored competitor evidence before Outline begins." />
      <SectionCard title="Originality Review" description="This local deterministic review compares the selected idea to approved competitor patterns; it never claims external web-search coverage.">
        {originalityArtifacts.length ? originalityArtifacts.map((artifact) => (
          <div key={artifact.id}>
            <StatusBadge tone={artifact.payloadJson.status === "pass" ? "success" : "danger"}>{creatorStatusLabel(artifact.payloadJson.status)}</StatusBadge>
            <p>Phrase {artifact.payloadJson.phraseOverlapRisk}% | Structure {artifact.payloadJson.structuralOverlapRisk}% | Thumbnail {artifact.payloadJson.thumbnailOverlapRisk}% | Concept {artifact.payloadJson.conceptOverlapRisk}%</p>
            {artifact.payloadJson.flaggedMatches.length ? <TagList items={artifact.payloadJson.flaggedMatches} /> : <p>No material overlap was detected in the approved competitor evidence.</p>}
            {artifact.payloadJson.requiredChanges.length ? <TagList items={artifact.payloadJson.requiredChanges} /> : null}
            {artifact.status === "needs_review" ? <div className="button-row">{artifact.payloadJson.status === "pass" ? <button className="button compact" type="button" disabled={!originalityReview.approvable} onClick={() => void approveOriginalityReview()}>Approve Originality Review</button> : null}<button className="button danger compact" type="button" onClick={() => void rejectOriginalityReview()}>Reject Originality Review</button></div> : null}
          </div>
        )) : <EmptyState title="No Originality Review yet" detail="Approve an Idea Lab candidate, then run this stage explicitly." />}
        <div className="button-row">
          {originalityReview.runnable ? <button className="button primary" type="button" onClick={() => void runOriginalityReview()}>Run Originality Review</button> : <DisabledAction reason={originalityReview.blockingReasons[0]?.message ?? "Originality Review is not ready to run."}>Run Originality Review</DisabledAction>}
        </div>
      </SectionCard>
    </>
  );
}

export function ScriptScreen(props: { project: FactoryProject; selectedProfile: ChannelProfile | undefined; setSelectedProject: (project: FactoryProject | null) => void; textCertification: TextModelCertificationResponse }) {
  const [outlines, setOutlines] = useState<OutlineArtifact[]>([]);
  const [scripts, setScripts] = useState<ScriptArtifact[]>([]);
  const [factReviews, setFactReviews] = useState<FactReviewArtifact[]>([]);
  const [retentionReviews, setRetentionReviews] = useState<RetentionReviewArtifact[]>([]);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [draftNarration, setDraftNarration] = useState("");
  const eligibilities = resolveStageEligibilities(props.project, { textVerified: props.textCertification.status === "verified" });
  const outline = eligibilities.find((stage) => stage.stageId === "outline")!;
  const script = eligibilities.find((stage) => stage.stageId === "script")!;
  const factReview = eligibilities.find((stage) => stage.stageId === "fact-review")!;
  const retentionReview = eligibilities.find((stage) => stage.stageId === "retention-review")!;
  async function refreshArtifacts() {
    const [nextOutlines, nextScripts, nextFactReviews, nextRetentionReviews] = await Promise.all([
      factoryClient.listOutlineArtifacts({ projectId: props.project.id }),
      factoryClient.listScriptArtifacts({ projectId: props.project.id }),
      factoryClient.listFactReviewArtifacts({ projectId: props.project.id }),
      factoryClient.listRetentionReviewArtifacts({ projectId: props.project.id })
    ]);
    setOutlines(nextOutlines); setScripts(nextScripts); setFactReviews(nextFactReviews); setRetentionReviews(nextRetentionReviews);
  }
  useEffect(() => { void refreshArtifacts().catch(() => { setOutlines([]); setScripts([]); setFactReviews([]); setRetentionReviews([]); }); }, [props.project.id]);
  async function perform(action: () => Promise<FactoryProject>, success: string, failed: string) { setRunning(true); setMessage(""); try { props.setSelectedProject(await action()); await refreshArtifacts(); setMessage(success); } catch (error) { setMessage(`${failed}: ${safeRendererError(error)}`); } finally { setRunning(false); } }
  function runOutline() { return perform(() => factoryClient.runOutline({ projectId: props.project.id }), "Outline is ready for review.", "Outline failed"); }
  function approveOutline() { return perform(() => factoryClient.approveOutline({ projectId: props.project.id }), "Outline approved. Script is now eligible.", "Outline approval failed"); }
  function rejectOutline() { return perform(() => factoryClient.rejectOutline({ projectId: props.project.id }), "Outline rejected.", "Outline rejection failed"); }
  function runScript() { return perform(() => factoryClient.runScript({ projectId: props.project.id }), "Script is ready for review.", "Script failed"); }
  function regenerateScript() { return perform(() => factoryClient.regenerateScript({ projectId: props.project.id }), "Script regenerated and is ready for review.", "Script regeneration failed"); }
  function approveScript() { return perform(() => factoryClient.approveScript({ projectId: props.project.id }), "Script approved. Fact Review is now eligible.", "Script approval failed"); }
  function rejectScript() { return perform(() => factoryClient.rejectScript({ projectId: props.project.id }), "Script rejected.", "Script rejection failed"); }
  async function saveScriptEdit(sectionId: string): Promise<void> {
    const artifact = [...scripts].reverse().find((item) => item.status === "needs_review" || item.status === "approved");
    if (!artifact) { setMessage("Script editing requires a persisted Script artifact."); return; }
    setRunning(true);
    try {
      const project = await factoryClient.editScript({ projectId: props.project.id, artifactId: artifact.id, sectionId, narration: draftNarration });
      props.setSelectedProject(project);
      await refreshArtifacts();
      setEditingSectionId(null);
      setDraftNarration("");
      setMessage("Script edit saved. Review and approve the revised script before continuing.");
    } catch (error) {
      setMessage(`Script edit failed: ${safeRendererError(error)}`);
    } finally {
      setRunning(false);
    }
  }
  function runFactReview() { return perform(() => factoryClient.runFactReview({ projectId: props.project.id }), "Fact Review is ready for review.", "Fact Review failed"); }
  function approveFactReview() { return perform(() => factoryClient.approveFactReview({ projectId: props.project.id }), "Fact Review approved.", "Fact Review approval failed"); }
  function rejectFactReview() { return perform(() => factoryClient.rejectFactReview({ projectId: props.project.id }), "Fact Review rejected.", "Fact Review rejection failed"); }
  function runRetentionReview() { return perform(() => factoryClient.runRetentionReview({ projectId: props.project.id }), "Retention Review is ready for review.", "Retention Review failed"); }
  function approveRetentionReview() { return perform(() => factoryClient.approveRetentionReview({ projectId: props.project.id }), "Retention Review approved.", "Retention Review approval failed"); }
  function rejectRetentionReview() { return perform(() => factoryClient.rejectRetentionReview({ projectId: props.project.id }), "Retention Review rejected.", "Retention Review rejection failed"); }
  return (
    <>
      <PageHeader title="Script" description="Outline, Script, and Fact Review remain separate review checkpoints." actions={outline.runnable ? <button className="button primary" type="button" onClick={() => void runOutline()} disabled={running}>Run Outline</button> : <DisabledAction reason={outline.blockingReasons[0]?.message ?? "Outline is not runnable."}>Run Outline</DisabledAction>} />
      <StageStatusHeader stageName="Outline" stageNumber={10} eligibility={outline} dependencies={["Approved idea", "Approved Originality Review"]} purpose="Plan sections from the approved idea without external research or claim mapping." />
      <SectionCard title="Outline review">{outlines.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge>{artifact.payloadJson.sections.map((section) => <p key={section.id}>{section.purpose}: {section.keyPoint}</p>)}{artifact.status === "needs_review" ? <div className="button-row">{outline.approvable ? <button className="button compact" type="button" onClick={() => void approveOutline()} disabled={running}>Approve Outline</button> : <DisabledAction reason={outline.blockingReasons[0]?.message ?? "Outline cannot be approved yet."}>Approve Outline</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void rejectOutline()} disabled={running}>Reject Outline</button></div> : null}</div>)}</SectionCard>
      <StageStatusHeader stageName="Script" stageNumber={11} eligibility={script} dependencies={["Approved Outline"]} purpose="Draft narration only from the approved outline." />
      <SectionCard title="Script review" description="Each run is explicit and uses the certified text model; approval persists the reviewed sections.">
        {script.runnable ? <button className="button primary" type="button" onClick={() => void runScript()} disabled={running}>Run Script</button> : <DisabledAction reason={script.blockingReasons[0]?.message ?? "Script is not runnable."}>Run Script</DisabledAction>}
        {props.project.setup.inputMode !== "existing_script" && props.project.scriptSections.length ? <button className="button secondary" type="button" onClick={() => void regenerateScript()} disabled={running}>Regenerate Script</button> : null}
        {scripts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge>{artifact.payloadJson.sections.map((section) => <p key={section.id}><strong>{section.purpose}</strong>: {section.narration}</p>)}{artifact.status === "needs_review" ? <div className="button-row">{script.approvable ? <button className="button compact" type="button" onClick={() => void approveScript()} disabled={running}>Approve Script</button> : <DisabledAction reason={script.blockingReasons[0]?.message ?? "Script cannot be approved yet."}>Approve Script</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void rejectScript()} disabled={running}>Reject Script</button></div> : null}</div>)}
      </SectionCard>
      <StageStatusHeader stageName="Fact Review" stageNumber={12} eligibility={factReview} dependencies={["Approved Script"]} purpose="Review script findings locally; this stage does not perform web research." />
      <SectionCard title="Fact Review" description="Blocked findings prevent approval. Qualification findings must remain qualified in narration.">
        {factReview.runnable ? <button className="button primary" type="button" onClick={() => void runFactReview()} disabled={running}>Run Fact Review</button> : <DisabledAction reason={factReview.blockingReasons[0]?.message ?? "Fact Review is not runnable."}>Run Fact Review</DisabledAction>}
        {factReviews.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge><small>Reviewer: local deterministic</small>{artifact.payloadJson.findings.map((finding) => <p key={finding.claimId}><strong>{finding.claimId}</strong>: {creatorStatusLabel(finding.verdict)} - {finding.reason}</p>)}{artifact.status === "needs_review" ? <div className="button-row">{factReview.approvable ? <button className="button compact" type="button" onClick={() => void approveFactReview()} disabled={running}>Approve Fact Review</button> : <DisabledAction reason={factReview.blockingReasons[0]?.message ?? "Fact Review cannot be approved yet."}>Approve Fact Review</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void rejectFactReview()} disabled={running}>Reject Fact Review</button></div> : null}</div>)}
        {message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}
      </SectionCard>
      <StageStatusHeader stageName="Retention Review" stageNumber={13} eligibility={retentionReview} dependencies={["Approved Fact Review", "Approved Script"]} purpose="Review pacing and retention risks without rewriting or adding facts." />
      <SectionCard title="Retention Review" description="The certified text model returns section-bound editorial findings for human review.">
        {retentionReview.runnable ? <button className="button primary" type="button" onClick={() => void runRetentionReview()} disabled={running}>Run Retention Review</button> : <DisabledAction reason={retentionReview.blockingReasons[0]?.message ?? "Retention Review is not runnable."}>Run Retention Review</DisabledAction>}
        {retentionReviews.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge><p>Verdict: {creatorStatusLabel(artifact.payloadJson.overallVerdict)}</p>{artifact.payloadJson.findings.map((finding) => <p key={finding.sectionId}><strong>{finding.sectionId}</strong> ({creatorStatusLabel(finding.severity)}): {finding.reason} Suggested: {finding.recommendedChange}</p>)}{artifact.status === "needs_review" ? <div className="button-row">{retentionReview.approvable ? <button className="button compact" type="button" onClick={() => void approveRetentionReview()} disabled={running}>Approve Retention Review</button> : <DisabledAction reason={retentionReview.blockingReasons[0]?.message ?? "Retention Review cannot be approved yet."}>Approve Retention Review</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void rejectRetentionReview()} disabled={running}>Reject Retention Review</button></div> : null}</div>)}
      </SectionCard>
      <div className="split-grid script-layout">
        <SectionCard title="Sections">
          {props.project.scriptSections.map((section) => (
            <button className="script-section-button" key={section.id} type="button">
              <strong>{section.purpose}</strong>
              <span>{section.estimatedSeconds}s / {section.estimatedWords} words</span>
            </button>
          ))}
        </SectionCard>
        <SectionCard title="Narration editor">
          {props.project.scriptSections.map((section) => (
            <article className="script-block" key={section.id}>
              <h3>{section.purpose}</h3>
              <textarea value={editingSectionId === section.id ? draftNarration : section.narration} readOnly={editingSectionId !== section.id} onChange={(event) => setDraftNarration(event.target.value)} aria-label={`Narration ${section.id}`} />
              {editingSectionId === section.id ? <div className="button-row"><button className="button primary compact" type="button" disabled={running || !draftNarration.trim()} onClick={() => void saveScriptEdit(section.id)}>Save Script Edit</button><button className="button secondary compact" type="button" disabled={running} onClick={() => { setEditingSectionId(null); setDraftNarration(""); }}>Cancel</button></div> : <button className="button secondary compact" type="button" disabled={running} onClick={() => { setEditingSectionId(section.id); setDraftNarration(section.narration); }}>Edit Script</button>}
              <TagList items={section.visualOpportunities} limit={5} />
            </article>
          ))}
        </SectionCard>
        <SectionCard title="Inspector">
          <p><strong>Channel rules:</strong> {props.selectedProfile?.tone ?? "No profile loaded"}</p>
          <p><strong>Avoid list:</strong></p>
          <TagList items={props.selectedProfile?.avoidList ?? []} limit={8} />
        </SectionCard>
      </div>
    </>
  );
}




