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
import { creatorBlockingMessage, creatorStatusLabel } from "../../creatorStudioCopy";
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
  const failedLabel = failed.length ? `, lỗi ở đoạn ${(failed[0] as { chunkIndex?: unknown }).chunkIndex ?? "?"}` : "";
  return `${completed}/${total} đoạn đã hoàn tất${failedLabel}`;
}

function workflowStageLabel(stageId: CompetitorWorkflowRun["stageId"]): string {
  return stageId === "transcript-cleaning" ? "Làm sạch transcript" : stageId === "reference-segmentation" ? "Tách tài liệu tham khảo" : "Phân tích tham khảo";
}
function ActionableBlockedState(props: { eligibility: StageEligibility; setRoute: (route: RouteId) => void }) {
  if (!props.eligibility.blockingReasons.length) return null;
  return (
    <SectionCard title="Điều kiện đang chặn">
      <div className="status-grid">
        {props.eligibility.blockingReasons.map((reason) => (
          <div className="status-row" key={`${props.eligibility.stageId}-${reason.code}`}>
            <span>{creatorBlockingMessage(reason.message)}</span>
            <StatusBadge tone="warning">{creatorStatusLabel(reason.code)}</StatusBadge>
            {(reason.actions?.length ? reason.actions : reason.actionRoute ? [{ label: "Mở bước cần thiết", route: reason.actionRoute }] : [])
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
        title="Tài liệu tham khảo"
        description="Dán liên kết, transcript hoặc khối phân tích tham khảo rồi lưu vào dự án."
        actions={canContinue ? (
          <button className="button primary" type="button" onClick={() => props.setRoute("competitor-dna")}>Tiếp tục phân tích tham khảo</button>
        ) : (
          <DisabledAction reason={referenceValidation.blockingReasons[0]?.message ?? "Hãy kiểm tra và duyệt bộ tài liệu tham khảo trước."}>Tiếp tục phân tích tham khảo</DisabledAction>
        )}
      />
      <StageStatusHeader
        stageName="Reference Validation"
        stageNumber={3}
        eligibility={referenceValidation}
        dependencies={["Reference Intake"]}
        purpose="Kiểm tra tài liệu, xử lý bản trùng và duyệt đúng bộ tài liệu để mở bước phân tích tham khảo."
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
    return window.confirm(`${action} sẽ làm mất hiệu lực:\n\n${stages}\n\nTiếp tục?`);
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
        setMessage("Đã tạo phiên bản transcript. Hãy kiểm tra lại bộ tài liệu.");
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
        setMessage("Đã chỉnh sửa tài liệu. Hãy kiểm tra lại bộ tài liệu.");
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
      setMessage(`Không thể lưu tài liệu tham khảo: ${safeRendererError(error)}`);
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
      setMessage("Đã lưu transcript trùng dưới dạng phiên bản tài liệu mới.");
    } catch (error) {
      setMessage(`Không thể thay phiên bản tài liệu: ${safeRendererError(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function validateReferenceSet() {
    try {
      const project = await factoryClient.validateReferenceSet({ projectId: props.project.id });
      props.setSelectedProject(project);
      setMessage(project.referenceSet?.status === "valid" ? "Bộ tài liệu đã hợp lệ. Hãy duyệt để tiếp tục." : "Kiểm tra bộ tài liệu phát hiện vấn đề cần xử lý.");
    } catch (error) {
      setMessage(`Kiểm tra bộ tài liệu thất bại: ${safeRendererError(error)}`);
    }
  }

  async function approveReferenceSet() {
    try {
      const project = await factoryClient.approveReferenceSet({ projectId: props.project.id });
      props.setSelectedProject(project);
      setMessage("Đã duyệt bộ tài liệu. Có thể tiếp tục phân tích tham khảo.");
      if (project.setup.workflowMode === "semi_automatic") void props.startSemiAutomatic("reference", project);
    } catch (error) {
      setMessage(`Không thể duyệt bộ tài liệu: ${safeRendererError(error)}`);
    }
  }

  async function rejectReferenceSet() {
    const project = await factoryClient.rejectReferenceSet({ projectId: props.project.id });
    props.setSelectedProject(project);
    setMessage("Đã từ chối bộ tài liệu. Hãy cập nhật rồi kiểm tra lại.");
  }

  async function revokeReferenceSetApproval() {
    if (!(await confirmApprovedChange("Revoking this approval"))) return;
    const project = await factoryClient.revokeReferenceSetApproval({ projectId: props.project.id });
    props.setSelectedProject(project);
    setMessage("Đã thu hồi duyệt bộ tài liệu. Hãy kiểm tra tài liệu hiện tại trước khi tiếp tục.");
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
      <SectionCard title="Nhập tài liệu tham khảo" description="Lưu tài liệu ở trạng thái bản nháp, kiểm tra cục bộ rồi duyệt rõ ràng bộ tài liệu hiện tại.">
        <div className="form-grid">
          <FormField label="URL video tham khảo" htmlFor="idea-competitor-url" hint="FFmpeg chỉ cần ở bước xử lý video/audio cục bộ sau này; URL được lưu để truy xuất nguồn.">
            <input id="idea-competitor-url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://..." />
          </FormField>
          <FormField label="Transcript / phân tích đã dán" htmlFor="idea-competitor-script">
            <textarea id="idea-competitor-script" value={pastedTranscript} onChange={(event) => setPastedTranscript(event.target.value)} placeholder="Dán toàn bộ transcript hoặc khối phân tích tham khảo vào đây" />
          </FormField>
          <FormField label="Ghi chú" htmlFor="idea-competitor-notes">
            <textarea id="idea-competitor-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ghi chú tuỳ chọn về điều cần kiểm tra" />
          </FormField>
          <div className="button-row">
            {pastedTranscript.trim() ? (
              <button className="button primary" type="button" onClick={() => void addReference()} disabled={saving}>{saving ? "Đang lưu..." : replaceReferenceId ? "Tạo phiên bản transcript" : editingReferenceId ? "Lưu chỉnh sửa tài liệu" : "Lưu tài liệu tham khảo"}</button>
            ) : (
              <DisabledAction reason="Hãy dán transcript hoặc khối phân tích trước khi lưu.">Lưu tài liệu tham khảo</DisabledAction>
            )}
            {editingReferenceId || replaceReferenceId ? <button className="button secondary" type="button" onClick={clearForm}>Huỷ chỉnh sửa</button> : null}
          </div>
          {duplicateReferenceId ? (
            <div className="button-row">
              <button className="button secondary" type="button" onClick={() => { setViewingReferenceId(duplicateReferenceId); setDuplicateReferenceId(null); }}>Mở tài liệu hiện có</button>
              <button className="button primary" type="button" onClick={() => void replaceDuplicate()} disabled={saving}>Thay transcript bằng phiên bản mới</button>
              <button className="button secondary" type="button" onClick={() => { setDuplicateReferenceId(null); clearForm(); }}>Huỷ bản trùng</button>
            </div>
          ) : null}
          {message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}
        </div>
      </SectionCard>
      <SectionCard title="Điều khiển bộ tài liệu" description="Tài liệu đã lưu chỉ là bản nháp cho đến khi kiểm tra cục bộ và duyệt bộ tài liệu hoàn tất.">
        <div className="metric-grid">
          <MetricCard label="Bộ tài liệu" value={creatorStatusLabel(referenceSetStatus)} tone={referenceSetStatus === "approved" ? "success" : referenceSetStatus === "stale" ? "warning" : "info"} />
          <MetricCard label="Được chọn" value={includedCount} />
          <MetricCard label="Hợp lệ" value={validCount} tone="success" />
          <MetricCard label="Không hợp lệ" value={invalidCount} tone={invalidCount ? "warning" : "info"} />
          <MetricCard label="Bản trùng" value={duplicateCount} tone={duplicateCount ? "warning" : "info"} />
          <MetricCard label="Bản nháp" value={draftCount} tone={draftCount ? "warning" : "info"} />
          <MetricCard label="Loại trừ" value={excludedCount} />
        </div>
        <p className="muted">Fingerprint: {props.project.referenceSet?.currentFingerprint ? `${props.project.referenceSet.currentFingerprint.slice(0, 12)}...` : "Chưa kiểm tra"} · Kiểm tra gần nhất: {props.project.referenceSet?.validationRunAt ? formatDate(props.project.referenceSet.validationRunAt) : "Chưa có"} · Duyệt gần nhất: {props.project.referenceSet?.approvedAt ? formatDate(props.project.referenceSet.approvedAt) : "Chưa có"}</p>
        <div className="button-row">
          {props.project.competitorReferences.length ? (
            <button className="button secondary" type="button" onClick={() => void validateReferenceSet()}>Kiểm tra bộ tài liệu</button>
          ) : (
            <DisabledAction reason="Hãy thêm ít nhất một tài liệu trước.">Kiểm tra bộ tài liệu</DisabledAction>
          )}
          {hasValidReferenceSet && referenceValidation?.approvable ? (
            <button className="button primary" type="button" onClick={() => void approveReferenceSet()}>Duyệt bộ tài liệu</button>
          ) : (
            <DisabledAction reason={referenceValidation?.blockingReasons[0]?.message ?? "Bộ tài liệu phải hợp lệ trước khi duyệt."}>Duyệt bộ tài liệu</DisabledAction>
          )}
          {hasValidReferenceSet ? (
            <button className="button danger" type="button" onClick={() => void rejectReferenceSet()}>Từ chối bộ tài liệu</button>
          ) : null}
          {referenceSetStatus === "approved" ? (
            <button className="button danger" type="button" onClick={() => void revokeReferenceSetApproval()}>Thu hồi duyệt tài liệu</button>
          ) : null}
          {canContinue ? (
            <button className="button primary" type="button" onClick={() => props.setRoute("competitor-dna")}>Tiếp tục phân tích tham khảo</button>
          ) : (
            <DisabledAction reason="Hãy duyệt bộ tài liệu đã kiểm tra trước khi tiếp tục.">Tiếp tục phân tích tham khảo</DisabledAction>
          )}
        </div>
      </SectionCard>
      <SectionCard title="Tài liệu tham khảo đã lưu">
        {props.project.competitorReferences.length === 0 ? (
          <EmptyState title="Chưa có tài liệu tham khảo" detail="Dán transcript hoặc khối phân tích ở trên. Phân tích AI có thể dùng dữ liệu này khi pipeline provider sẵn sàng." />
        ) : (
          <DataTable label="Tài liệu tham khảo">
              <thead><tr><th>Chọn</th><th>Nguồn</th><th>Transcript</th><th>Trạng thái</th><th>Phiên bản</th><th>Đã kiểm tra</th><th>Thao tác</th></tr></thead>
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
                        aria-label={`Chọn ${reference.sourceUrl ?? reference.id}`}
                      />
                    </td>
                    <td><strong>{reference.identityKey ?? "thủ công"}</strong><small>{reference.sourceUrl ?? "Dán thủ công"}</small></td>
                    <td>{reference.pastedTranscript.slice(0, 180)}{reference.pastedTranscript.length > 180 ? "..." : ""}</td>
                    <td>
                      <StatusBadge tone={reference.status === "approved" || reference.status === "valid" ? "success" : reference.status === "invalid" || reference.status === "duplicate" ? "danger" : "warning"}>
                        {creatorStatusLabel(reference.status ?? "draft")}
                      </StatusBadge>
                      {reference.validationMessage ? <small>{reference.validationMessage}</small> : null}
                      {reference.validationErrors?.length ? <small>Lỗi: {reference.validationErrors.join(", ")}</small> : null}
                      {reference.validationWarnings?.length ? <small>Cảnh báo: {reference.validationWarnings.join(", ")}</small> : null}
                    </td>
                    <td>{reference.version ?? 1}</td>
                    <td>{reference.validatedAt ? formatDate(reference.validatedAt) : "Chưa có"}</td>
                    <td className="row-actions">
                      <button className="button compact" type="button" onClick={() => setViewingReferenceId(viewingReferenceId === reference.id ? null : reference.id)}>{viewingReferenceId === reference.id ? "Ẩn" : "Xem"}</button>
                      <button className="button compact" type="button" onClick={() => startEdit(reference.id)}>Sửa</button>
                      <button className="button compact" type="button" onClick={() => startReplace(reference.id)}>Thay transcript</button>
                      <button className="button compact" type="button" onClick={() => { const rootId = referenceRootId(reference); setExpandedVersionRootId(expandedVersionRootId === rootId ? null : rootId); }}>{expandedVersionRootId === referenceRootId(reference) ? "Ẩn phiên bản" : "Phiên bản"}</button>
                      <button className="button compact" type="button" onClick={() => void validateReferenceSet()}>Kiểm tra</button>
                      <button className="button compact" type="button" onClick={() => void factoryClient.setReferenceIncluded({ projectId: props.project.id, referenceId: reference.id, included: reference.included === false }).then(props.setSelectedProject)}>{reference.included === false ? "Chọn vào" : "Loại ra"}</button>
                      <button
                        className="button danger compact"
                        type="button"
                        onClick={() => {
                          void confirmApprovedChange("Deleting this reference").then((confirmed) => confirmed ? factoryClient.deleteCompetitorReference({ projectId: props.project.id, referenceId: reference.id }).then(props.setSelectedProject) : undefined);
                        }}
                      >
                        Xoá
                      </button>
                    </td>
                  </tr>
                  {viewingReferenceId === reference.id || expandedVersionRootId === referenceRootId(reference) ? (
                    <tr key={`${reference.id}-details`}><td colSpan={7}>
                      {viewingReferenceId === reference.id ? <div><strong>Transcript hiện tại</strong><p>{reference.pastedTranscript}</p><small>Nguồn: {reference.identityKey ?? "thủ công"} · Tạo: {formatDate(reference.createdAt)} · Cập nhật: {reference.updatedAt ? formatDate(reference.updatedAt) : "Chưa có"}</small></div> : null}
                      {expandedVersionRootId === referenceRootId(reference) ? <div><strong>Các phiên bản transcript</strong><p>{props.project.competitorReferences.filter((item) => referenceRootId(item) === referenceRootId(reference)).map((item) => `v${item.version ?? 1} ${item.id}${item.included === false ? " (không dùng)" : " (hiện tại)"}`).join(" · ")}</p></div> : null}
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
      setRunMessage("Đã duyệt transcript đã làm sạch.");
    } catch (error) {
      setRunMessage(`Không thể duyệt transcript: ${safeRendererError(error)}`);
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
      setRunMessage("Đã từ chối transcript đã làm sạch.");
    } catch (error) {
      setRunMessage(`Không thể từ chối transcript: ${safeRendererError(error)}`);
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
      setRunMessage("Đã tách tài liệu tham khảo và sẵn sàng để duyệt.");
    } catch (error) {
      setRunMessage(`Tách tài liệu tham khảo thất bại: ${safeRendererError(error)}`);
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
      setRunMessage("Đã duyệt phân đoạn tài liệu tham khảo.");
    } catch (error) {
      setRunMessage(`Không thể duyệt phân đoạn: ${safeRendererError(error)}`);
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
      setRunMessage("Đã từ chối phân đoạn tài liệu tham khảo.");
    } catch (error) {
      setRunMessage(`Không thể từ chối phân đoạn: ${safeRendererError(error)}`);
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
      setRunMessage("Đã hoàn tất phân tích tham khảo và sẵn sàng để duyệt.");
    } catch (error) { setRunMessage(`Phân tích tham khảo thất bại: ${safeRendererError(error)}`); }
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
      setRunMessage("Đã duyệt phân tích tham khảo.");
    } catch (error) { setRunMessage(`Không thể duyệt phân tích tham khảo: ${safeRendererError(error)}`); }
    finally { void reloadWorkflowRuns(); setRunningReferenceId(null); }
  }

  async function rejectDna(referenceId: string) {
    setRunningReferenceId(referenceId); setRunMessage("");
    try {
      const project = await factoryClient.rejectCompetitorDna({ projectId: props.project.id, referenceId });
      props.setSelectedProject(project);
      const artifacts = await factoryClient.listCompetitorDnaArtifacts({ projectId: props.project.id, referenceId });
      setDnaArtifacts((current) => current.filter((artifact) => artifact.payloadJson.referenceId !== referenceId).concat(artifacts));
      setRunMessage("Đã từ chối phân tích tham khảo.");
    } catch (error) { setRunMessage(`Không thể từ chối phân tích tham khảo: ${safeRendererError(error)}`); }
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
        title="Phân tích tham khảo"
        description="Quy trình bắt đầu bằng làm sạch transcript, sau đó tách phân đoạn và duyệt phân tích tham khảo."
        actions={
          <>
            <button className="button secondary" type="button" onClick={() => props.setRoute("reference-intake")}>Quay lại tài liệu</button>
            {!isSemiAutomatic && approvedReferences.length && transcriptCleaning.runnable ? (
              <button className="button primary" type="button" onClick={() => void runCleaning(approvedReferences[0]!.id)} disabled={runningReferenceId !== null}>
                {runningReferenceId ? "Đang làm sạch transcript..." : "Làm sạch transcript"}
              </button>
            ) : isSemiAutomatic && !hasSemiAutomaticAttention(props.project) ? (
              <span className="muted">Làm sạch transcript, tách phân đoạn và phân tích tham khảo sẽ tự chạy.</span>
            ) : (
              <DisabledAction reason={transcriptCleaning.blockingReasons[0]?.message ?? "Chưa thể làm sạch transcript."}>Làm sạch transcript</DisabledAction>
            )}
            {!isSemiAutomatic && nextSegmentationAction?.kind === "approve" ? (
              <button className="button secondary" type="button" onClick={() => void approveSegmentation(nextSegmentationAction.referenceId)} disabled={runningReferenceId !== null || !segmentation.approvable}>Duyệt phân đoạn</button>
            ) : !isSemiAutomatic && nextSegmentationAction?.kind === "run" && canRunPendingReferenceStage(segmentation) ? (
              <button className="button secondary" type="button" onClick={() => void runSegmentation(nextSegmentationAction.referenceId)} disabled={runningReferenceId !== null}>Chạy tách phân đoạn</button>
            ) : canManuallyRunStage(segmentation) && segmentation.status !== "approved" ? (
              <DisabledAction reason={stageActionReason(segmentation, "Hãy duyệt mọi transcript đã làm sạch trước khi tách phân đoạn.")}>Chạy tách phân đoạn</DisabledAction>
            ) : null}
            {!isSemiAutomatic && nextDnaAction?.kind === "approve" ? (
              <button className="button secondary" type="button" onClick={() => void approveDna(nextDnaAction.referenceId)} disabled={runningReferenceId !== null || !competitorDna.approvable}>Duyệt phân tích</button>
            ) : !isSemiAutomatic && nextDnaAction?.kind === "run" && canRunPendingReferenceStage(competitorDna) ? (
              <button className="button secondary" type="button" onClick={() => void runDna(nextDnaAction.referenceId)} disabled={runningReferenceId !== null}>Chạy phân tích</button>
            ) : canManuallyRunStage(competitorDna) && competitorDna.status !== "approved" ? (
              <DisabledAction reason={stageActionReason(competitorDna, "Hãy duyệt mọi phân đoạn trước khi chạy phân tích tham khảo.")}>Chạy phân tích</DisabledAction>
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
      <SectionCard title="Thao tác tiếp theo" description="Thao tác có thể chạy tiếp theo được hiển thị ở đây để không bị khuất dưới bảng transcript.">
        <div className="button-row">
          {approvedReferences.map((reference) => {
            const cleaningArtifact = cleaningArtifacts.find((artifact) => artifact.payloadJson.referenceId === reference.id && artifact.status === "needs_review");
            const segmentationArtifact = segmentationArtifacts.find((artifact) => artifact.payloadJson.referenceId === reference.id && artifact.status === "needs_review");
            const dnaArtifact = dnaArtifacts.find((artifact) => artifact.payloadJson.referenceId === reference.id && artifact.status === "needs_review");
            return <React.Fragment key={`next-${reference.id}`}>
              {!isSemiAutomatic && cleaningArtifact ? <button className="button compact" type="button" onClick={() => void approveCleaning(reference.id)} disabled={runningReferenceId !== null}>Duyệt làm sạch</button> : null}
              {(!isSemiAutomatic || transcriptCleaning.status === "failed" || transcriptCleaning.status === "needs_attention") && !cleaningArtifact && canRunStage(transcriptCleaning) ? <button className="button compact" type="button" onClick={() => void runCleaning(reference.id)} disabled={runningReferenceId !== null}>{transcriptCleaning.status === "failed" || transcriptCleaning.status === "needs_attention" ? "Thử lại làm sạch" : "Chạy làm sạch"}</button> : null}
              {!isSemiAutomatic && segmentationArtifact ? <button className="button compact" type="button" onClick={() => void approveSegmentation(reference.id)} disabled={runningReferenceId !== null}>Duyệt phân đoạn</button> : null}
              {(!isSemiAutomatic || segmentation.status === "failed" || segmentation.status === "needs_attention") && !segmentationArtifact ? canRunStage(segmentation) ? <button className="button compact" type="button" onClick={() => void runSegmentation(reference.id)} disabled={runningReferenceId !== null}>{segmentation.status === "failed" || segmentation.status === "needs_attention" ? "Thử lại phân đoạn" : "Chạy tách phân đoạn"}</button> : <DisabledAction reason={stageActionReason(segmentation, "Hãy duyệt mọi transcript đã làm sạch trước khi tách phân đoạn.")}>Chạy tách phân đoạn</DisabledAction> : null}
              {!isSemiAutomatic && dnaArtifact ? <button className="button compact" type="button" onClick={() => void approveDna(reference.id)} disabled={runningReferenceId !== null}>Duyệt phân tích</button> : null}
              {(!isSemiAutomatic || competitorDna.status === "failed" || competitorDna.status === "needs_attention") && !dnaArtifact ? canRunStage(competitorDna) ? <button className="button compact" type="button" onClick={() => void runDna(reference.id)} disabled={runningReferenceId !== null}>{competitorDna.status === "failed" || competitorDna.status === "needs_attention" ? "Thử lại phân tích" : "Chạy phân tích"}</button> : <DisabledAction reason={stageActionReason(competitorDna, "Hãy duyệt mọi phân đoạn trước khi chạy phân tích tham khảo.")}>Chạy phân tích</DisabledAction> : null}
            </React.Fragment>;
          })}
          {!approvedReferences.length ? <>
            <DisabledAction reason="Hãy duyệt ít nhất một tài liệu được chọn trước khi chạy quy trình phân tích.">Chạy tách phân đoạn</DisabledAction>
            <DisabledAction reason="Hãy duyệt ít nhất một tài liệu được chọn trước khi chạy quy trình phân tích.">Chạy phân tích</DisabledAction>
          </> : null}
        </div>
      </SectionCard>
      {!hasReferences ? (
        <EmptyState
          title="Chưa có tài liệu tham khảo"
          detail="Hãy thêm ít nhất một tài liệu tham khảo trước khi chạy bước này."
          action={<button className="button primary" type="button" onClick={() => props.setRoute("reference-intake")}>Thêm tài liệu</button>}
        />
      ) : (
        <SectionCard title="Đầu vào đã duyệt hiện tại" description="Chỉ tài liệu được chọn và đã duyệt mới được đưa vào bước làm sạch transcript. Chế độ sản xuất đơn giản tự chạy chuỗi đủ điều kiện; các nút vẫn có cho chế độ hướng dẫn và khôi phục lỗi.">
          <DataTable label="Đầu vào phân tích tham khảo">
            <thead><tr><th>Nguồn</th><th>Transcript gốc</th><th>Đã thêm</th><th>Chạy</th><th>Kết quả duyệt</th></tr></thead>
            <tbody>
              {props.project.competitorReferences.filter((reference) => reference.included !== false).map((reference) => (
                <tr key={reference.id}>
                  <td>{reference.sourceUrl ?? "Dán thủ công"}</td>
                  <td>{reference.pastedTranscript.slice(0, 180)}{reference.pastedTranscript.length > 180 ? "..." : ""}</td>
                  <td>{formatDate(reference.createdAt)}</td>
                  <td>
                    <StatusBadge tone={reference.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(reference.status ?? "draft")}</StatusBadge>
                    {reference.status === "approved" && !isSemiAutomatic && transcriptCleaning.runnable ? (
                      <button className="button compact" type="button" onClick={() => void runCleaning(reference.id)} disabled={runningReferenceId !== null}>
                        {runningReferenceId === reference.id ? "Đang chạy..." : "Làm sạch"}
                      </button>
                    ) : null}
                  </td>
                  <td>
                    {cleaningArtifacts.filter((artifact) => artifact.payloadJson.referenceId === reference.id).map((artifact) => (
                      <div key={artifact.id}>
                        <StatusBadge tone={artifact.status === "approved" ? "success" : artifact.status === "needs_review" ? "warning" : "info"}>{creatorStatusLabel(artifact.status)}</StatusBadge>
                        <small>{artifact.payloadJson.cleanedTranscript.slice(0, 140)}{artifact.payloadJson.cleanedTranscript.length > 140 ? "..." : ""}</small>
                        <small>Ký tự: {artifact.payloadJson.sourceCharacterCount} -&gt; {artifact.payloadJson.cleanedCharacterCount}; đoạn: {artifact.payloadJson.execution.chunkCount}; bị đánh dấu: {artifact.payloadJson.execution.flaggedSegmentCount}; nhiễu đã bỏ: {artifact.payloadJson.execution.removedNoise}</small>
                        {artifact.payloadJson.warnings.length ? <small>Cảnh báo: {artifact.payloadJson.warnings.join(", ").replaceAll("_", " ")}</small> : null}
                        <details><summary>So sánh gốc / đã làm sạch</summary><small>Gốc: {reference.pastedTranscript}</small><small>Đã làm sạch: {artifact.payloadJson.cleanedTranscript}</small></details>
                        {artifact.status === "needs_review" ? <div className="button-row">{transcriptCleaning.approvable ? <button className="button compact" type="button" onClick={() => void approveCleaning(reference.id)} disabled={runningReferenceId !== null}>Duyệt transcript đã làm sạch</button> : <DisabledAction reason={transcriptCleaning.blockingReasons[0]?.message ?? "Chưa thể duyệt transcript đã làm sạch."}>Duyệt transcript đã làm sạch</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void rejectCleaning(reference.id)} disabled={runningReferenceId !== null}>Từ chối transcript đã làm sạch</button></div> : null}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </SectionCard>
      )}
      <SectionCard title="Các bước phân tích" description="Các bước được lưu riêng; chế độ sản xuất đơn giản chạy tuần tự và chỉ dừng ở checkpoint hoặc khi có lỗi.">
        <DataTable label="Trạng thái các bước phân tích">
          <thead><tr><th>Bước</th><th>Trạng thái</th><th>Có thể chạy</th><th>Lý do</th></tr></thead>
          <tbody>
            {[transcriptCleaning, segmentation, competitorDna].map((stage) => {
              const definition = workflowStageDefinitions.find((item) => item.id === stage.stageId);
              return (
                <tr key={stage.stageId}>
                  <td>{definition?.name ?? stage.stageId}</td>
                  <td><StatusBadge tone={stageTone(stage.status)}>{creatorStatusLabel(stage.status)}</StatusBadge></td>
                  <td>{stage.runnable ? "Có" : "Chưa"}</td>
                  <td>{stage.blockingReasons[0]?.message ?? "Không có lý do chặn."}</td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </SectionCard>
      <StageStatusHeader stageName="Competitor DNA" stageNumber={6} eligibility={competitorDna} dependencies={["Reference Segmentation"]} purpose="Extract evidence-backed abstractions from one approved reference at a time; it never produces reusable wording or ideas." />
      <SectionCard title="Bằng chứng phân đoạn đã duyệt" description="Phân tích tham khảo được thực hiện riêng theo từng tài liệu và chỉ dùng artifact phân đoạn đã duyệt.">
        <DataTable label="Đầu vào phân tích tham khảo"><thead><tr><th>Tài liệu</th><th>Phân đoạn</th><th>Duyệt phân tích</th><th>Thao tác</th></tr></thead><tbody>
          {approvedReferences.map((reference) => {
            const dna = dnaArtifacts.filter((artifact) => artifact.payloadJson.referenceId === reference.id);
            const hasDna = dna.some((artifact) => artifact.status !== "stale");
            const canRun = competitorDna.runnable || (competitorDna.status === "needs_review" && !hasDna);
            return <tr key={reference.id}><td>{reference.sourceUrl ?? "Dán thủ công"}</td><td>{segmentationArtifacts.some((artifact) => artifact.status === "approved" && artifact.payloadJson.referenceId === reference.id) ? "Đã duyệt" : "Thiếu"}</td><td>{dna.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge><small>{artifact.payloadJson.hookPattern.abstraction}</small>{artifact.status === "needs_review" ? <div className="button-row">{competitorDna.approvable ? <button className="button compact" type="button" onClick={() => void approveDna(reference.id)} disabled={runningReferenceId !== null}>Duyệt phân tích</button> : <DisabledAction reason={competitorDna.blockingReasons[0]?.message ?? "Chưa thể duyệt phân tích tham khảo."}>Duyệt phân tích</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void rejectDna(reference.id)} disabled={runningReferenceId !== null}>Từ chối phân tích</button></div> : null}</div>)}</td><td>{canRun ? <button className="button compact" type="button" onClick={() => void runDna(reference.id)} disabled={runningReferenceId !== null}>{runningReferenceId === reference.id ? "Đang chạy..." : "Phân tích"}</button> : <DisabledAction reason={competitorDna.blockingReasons[0]?.message ?? "Chưa thể chạy phân tích tham khảo cho tài liệu này."}>Phân tích</DisabledAction>}</td></tr>;
          })}
        </tbody></DataTable>
      </SectionCard>
      <StageStatusHeader
        stageName="Reference Segmentation"
        stageNumber={5}
        eligibility={segmentation}
        dependencies={["Transcript Cleaning"]}
        purpose="Tách mỗi transcript đã làm sạch thành các phân đoạn kể chuyện chính xác, không chồng lấn trước khi phân tích tham khảo."
      />
      <SectionCard title="Transcript đã làm sạch và duyệt" description="Mỗi lần chạy chỉ dùng artifact làm sạch đã duyệt và giữ lại phân đoạn có cấu trúc để kiểm tra.">
        <DataTable label="Đầu vào phân đoạn tài liệu">
          <thead><tr><th>Tài liệu</th><th>Đầu vào đã làm sạch</th><th>Phân đoạn</th><th>Thao tác</th></tr></thead>
          <tbody>
            {approvedReferences.map((reference) => {
              const hasSegment = segmentationArtifacts.some((artifact) => artifact.payloadJson.referenceId === reference.id && artifact.status !== "stale");
              const canRun = segmentation.runnable || (segmentation.status === "needs_review" && !hasSegment);
              return <tr key={reference.id}>
                <td>{reference.sourceUrl ?? "Dán thủ công"}</td>
                <td>{cleaningArtifacts.some((artifact) => artifact.status === "approved" && artifact.payloadJson.referenceId === reference.id) ? "Đã duyệt" : "Thiếu"}</td>
                <td>{segmentationArtifacts.filter((artifact) => artifact.payloadJson.referenceId === reference.id).map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge><small>{artifact.payloadJson.segments.length} phân đoạn</small>{artifact.status === "needs_review" ? <div className="button-row">{segmentation.approvable ? <button className="button compact" type="button" onClick={() => void approveSegmentation(reference.id)} disabled={runningReferenceId !== null}>Duyệt phân đoạn</button> : <DisabledAction reason={segmentation.blockingReasons[0]?.message ?? "Chưa thể duyệt phân đoạn tài liệu."}>Duyệt phân đoạn</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void rejectSegmentation(reference.id)} disabled={runningReferenceId !== null}>Từ chối phân đoạn</button></div> : null}</div>)}</td>
                <td>{canRun ? <button className="button compact" type="button" onClick={() => void runSegmentation(reference.id)} disabled={runningReferenceId !== null}>{runningReferenceId === reference.id ? "Đang chạy..." : "Tách phân đoạn"}</button> : <DisabledAction reason={segmentation.blockingReasons[0]?.message ?? "Chưa thể tách phân đoạn cho tài liệu này."}>Tách phân đoạn</DisabledAction>}</td>
              </tr>;
            })}
          </tbody>
        </DataTable>
      </SectionCard>
      {runMessage ? <p className={runMessage.includes("failed") ? "error-message" : "safe-message"}>{runMessage}</p> : null}
      <SectionCard title="Lịch sử chạy" description="Mỗi lần chạy bước 4-6 được lưu cùng mã chạy, fingerprint đầu vào, provider/model, tiến độ và trạng thái lỗi an toàn.">
        {workflowRuns.length ? <DataTable label="Lịch sử chạy quy trình phân tích"><thead><tr><th>Bước</th><th>Trạng thái</th><th>Mã chạy</th><th>Provider / model</th><th>Bắt đầu</th><th>Đoạn</th><th>Fingerprint đầu vào</th><th>Lỗi an toàn</th></tr></thead><tbody>
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
        </tbody></DataTable> : <EmptyState title="Chưa có lần chạy" detail="Hãy chạy một tài liệu đã duyệt để tạo lịch sử bước được lưu." />}
      </SectionCard>
    </>
  );
}

export function IdeaLabScreen(props: { project: FactoryProject; setSelectedProject: (project: FactoryProject | null) => void; setRoute: (route: RouteId) => void; textCertification: TextModelCertificationResponse; startSemiAutomatic: (chain: SemiAutomaticChain, project: FactoryProject) => Promise<void> }) {
  const [artifacts, setArtifacts] = useState<OpportunityMapArtifact[]>([]);
  const [originalityArtifacts, setOriginalityArtifacts] = useState<OriginalityReviewArtifact[]>([]);
  const [message, setMessage] = useState("");
  const textEligibilities = resolveStageEligibilities(props.project, { textVerified: props.textCertification.status === "verified" });
  const ideaLab = textEligibilities.find((stage) => stage.stageId === "idea-lab")!;
  // These two stages are legacy-only and are intentionally absent from a preproduction project.
  const opportunity = textEligibilities.find((stage) => stage.stageId === "opportunity-map") ?? ideaLab;
  const originalityReview = textEligibilities.find((stage) => stage.stageId === "originality-review") ?? ideaLab;
  const topicMode = props.project.setup.inputMode === "topic" && props.project.competitorReferences.length === 0;
  const [editingIdea, setEditingIdea] = useState<FactoryProject["ideas"][number] | null>(null);
  useEffect(() => { void factoryClient.listOpportunityMapArtifacts({ projectId: props.project.id }).then(setArtifacts).catch(() => setArtifacts([])); }, [props.project]);
  useEffect(() => { void factoryClient.listOriginalityReviewArtifacts({ projectId: props.project.id }).then(setOriginalityArtifacts).catch(() => setOriginalityArtifacts([])); }, [props.project]);
  async function runOpportunity() { try { const project = await factoryClient.runOpportunityMap({ projectId: props.project.id }); props.setSelectedProject(project); setArtifacts(await factoryClient.listOpportunityMapArtifacts({ projectId: props.project.id })); setMessage("Bản đồ cơ hội đã sẵn sàng để duyệt."); } catch (error) { setMessage(`Bản đồ cơ hội thất bại: ${safeRendererError(error)}`); } }
  async function approveOpportunity() { try { const project = await factoryClient.approveOpportunityMap({ projectId: props.project.id }); props.setSelectedProject(project); setArtifacts(await factoryClient.listOpportunityMapArtifacts({ projectId: props.project.id })); setMessage("Đã duyệt bản đồ cơ hội."); } catch (error) { setMessage(`Không thể duyệt bản đồ cơ hội: ${safeRendererError(error)}`); } }
  async function rejectOpportunity() { try { const project = await factoryClient.rejectOpportunityMap({ projectId: props.project.id }); props.setSelectedProject(project); setArtifacts(await factoryClient.listOpportunityMapArtifacts({ projectId: props.project.id })); setMessage("Đã từ chối bản đồ cơ hội."); } catch (error) { setMessage(`Không thể từ chối bản đồ cơ hội: ${safeRendererError(error)}`); } }
  async function runIdeas(force = false) { try { const project = await factoryClient.runIdeaLab({ projectId: props.project.id, ...(force ? { force: true } : {}) }); props.setSelectedProject(project); setMessage(force ? "Đã tạo lại ý tưởng. Hãy chọn một ứng viên để tiếp tục." : "Phòng ý tưởng đã sẵn sàng để duyệt."); } catch (error) { setMessage(`Phòng ý tưởng thất bại: ${safeRendererError(error)}`); } }
  async function approveIdea(ideaId: string) { try { const project = await factoryClient.approveIdea({ projectId: props.project.id, ideaId }); props.setSelectedProject(project); props.setRoute("project-overview"); setMessage("Đã chọn ý tưởng làm hướng sáng tạo."); if (project.setup.workflowMode === "semi_automatic") void props.startSemiAutomatic("idea", project); } catch (error) { setMessage(`Không thể duyệt ý tưởng: ${safeRendererError(error)}`); } }
  async function saveEditedIdea() { if (!editingIdea) return; try { const project = await factoryClient.editIdea({ projectId: props.project.id, ideaId: editingIdea.id, changes: { workingTitle: editingIdea.workingTitle, angle: editingIdea.angle, corePromise: editingIdea.corePromise, viewerProblem: editingIdea.viewerProblem, dramaticQuestion: editingIdea.dramaticQuestion, targetEmotion: editingIdea.targetEmotion, thumbnailConcept: editingIdea.thumbnailConcept, noveltyExplanation: editingIdea.noveltyExplanation, productionDifficulty: editingIdea.productionDifficulty } }); props.setSelectedProject(project); setEditingIdea(null); setMessage("Đã sửa ý tưởng. Hãy duyệt và chọn khi sẵn sàng."); } catch (error) { setMessage(`Không thể sửa ý tưởng: ${safeRendererError(error)}`); } }
  async function rejectIdeaLab() { try { const project = await factoryClient.rejectIdeaLab({ projectId: props.project.id }); props.setSelectedProject(project); setMessage("Đã từ chối lượt ý tưởng."); } catch (error) { setMessage(`Không thể từ chối lượt ý tưởng: ${safeRendererError(error)}`); } }
  async function runOriginalityReview() { try { const project = await factoryClient.runOriginalityReview({ projectId: props.project.id }); props.setSelectedProject(project); setOriginalityArtifacts(await factoryClient.listOriginalityReviewArtifacts({ projectId: props.project.id })); setMessage("Kiểm tra tính riêng đã sẵn sàng để duyệt."); } catch (error) { setMessage(`Kiểm tra tính riêng thất bại: ${safeRendererError(error)}`); } }
  async function approveOriginalityReview() { try { const project = await factoryClient.approveOriginalityReview({ projectId: props.project.id }); props.setSelectedProject(project); setOriginalityArtifacts(await factoryClient.listOriginalityReviewArtifacts({ projectId: props.project.id })); setMessage("Đã duyệt kiểm tra tính riêng. Dàn ý đã đủ điều kiện."); } catch (error) { setMessage(`Không thể duyệt kiểm tra tính riêng: ${safeRendererError(error)}`); } }
  async function rejectOriginalityReview() { try { const project = await factoryClient.rejectOriginalityReview({ projectId: props.project.id }); props.setSelectedProject(project); setOriginalityArtifacts(await factoryClient.listOriginalityReviewArtifacts({ projectId: props.project.id })); setMessage("Đã từ chối kiểm tra tính riêng."); } catch (error) { setMessage(`Không thể từ chối kiểm tra tính riêng: ${safeRendererError(error)}`); } }
  return (
    <>
      <PageHeader title="Phòng ý tưởng" description={topicMode ? "Chế độ chủ đề tạo trực tiếp các ứng viên mới rồi dừng để bạn chọn một hướng sáng tạo." : "Phân tích tài liệu tham khảo được chuẩn bị nội bộ; bạn chỉ cần duyệt các ý tưởng kết quả."} actions={props.project.ideas.length > 0 && ideaLab.status === "needs_review" ? <button className="button primary" type="button" onClick={() => void runIdeas(true)}>Tạo lại ý tưởng</button> : topicMode || ideaLab.runnable ? <button className="button primary" type="button" onClick={() => void runIdeas()}>Tạo ý tưởng</button> : opportunity.runnable ? <button className="button primary" type="button" onClick={() => void runOpportunity()}>Chạy bản đồ cơ hội</button> : <DisabledAction reason={ideaLab.blockingReasons[0]?.message ?? opportunity.blockingReasons[0]?.message ?? "Chưa thể tạo ý tưởng."}>Tạo ý tưởng</DisabledAction>} />
      {!topicMode ? <StageStatusHeader stageName="Opportunity Map" stageNumber={7} eligibility={opportunity} dependencies={["Competitor DNA"]} purpose="Tổng hợp bằng chứng nội bộ; kết quả được thể hiện qua các ứng viên ý tưởng." /> : null}
      {!topicMode ? <SectionCard title="Bản đồ cơ hội" description="Bản đồ được lưu để chẩn đoán; đây không phải là checkpoint bắt buộc trong luồng chính.">
        {artifacts.length ? artifacts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge><p>{artifact.payloadJson.recommendedContentSpaces.map((item) => `${item.text} (${item.confidence})`).join("; ") || "Chưa có không gian nội dung được đề xuất."}</p>{artifact.status === "needs_review" ? <div className="button-row"><button className="button compact" type="button" disabled={!opportunity.approvable} onClick={() => void approveOpportunity()}>Duyệt bản đồ cơ hội</button><button className="button danger compact" type="button" onClick={() => void rejectOpportunity()}>Từ chối bản đồ cơ hội</button></div> : null}</div>) : <EmptyState title="Chưa có bản đồ cơ hội" detail="Hãy duyệt phân tích tham khảo cho mọi tài liệu được chọn rồi chạy bước này." />}
        {message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}
      </SectionCard> : null}
      <StageStatusHeader stageName="Idea Lab" stageNumber={8} eligibility={ideaLab} dependencies={topicMode ? [] : ["Opportunity Map"]} purpose="Tạo đúng sáu ứng viên mới rồi dừng để bạn chọn một hướng." />
      <SectionCard title="Các ứng viên ý tưởng" description="Các ứng viên cần được bạn chọn rõ ràng; hệ thống không tự chọn.">
        {ideaLab.status === "needs_review" ? <div className="button-row"><button className="button danger compact" type="button" onClick={() => void rejectIdeaLab()}>Từ chối lượt ý tưởng</button></div> : null}
        {ideaLab.status === "needs_review" || ideaLab.status === "approved" ? (
          <div className="card-grid">
            {props.project.ideas.map((idea) => <SectionCard key={idea.id} title={idea.workingTitle} description={idea.angle} className="compact-card">
              <p><strong>Lời hứa cốt lõi:</strong> {idea.corePromise}</p>
              <p><strong>Câu hỏi của người xem:</strong> {idea.dramaticQuestion}</p>
              <p><strong>Cảm xúc mục tiêu:</strong> {idea.targetEmotion}</p>
              <p><strong>Concept thumbnail:</strong> {idea.thumbnailConcept}</p>
              <p><strong>Độ khó dự kiến:</strong> {creatorStatusLabel(idea.productionDifficulty)} / <strong>Rủi ro nghiên cứu:</strong> {idea.researchRisk}</p>
              <p><strong>Tóm tắt tính riêng:</strong> {idea.noveltyExplanation}</p>
              <div className="button-row"><StatusBadge tone={props.project.approvedIdeaId === idea.id ? "success" : ideaLab.status === "needs_review" ? "warning" : "info"}>{props.project.approvedIdeaId === idea.id ? "Ý tưởng đã chọn" : ideaLab.status === "needs_review" ? "Cần duyệt" : "Ứng viên"}</StatusBadge>{ideaLab.status === "needs_review" ? <><button className="button primary compact" type="button" disabled={!ideaLab.approvable} onClick={() => void approveIdea(idea.id)}>Chọn ý tưởng</button><button className="button secondary compact" type="button" onClick={() => setEditingIdea(idea)}>Sửa</button></> : null}</div>
              {editingIdea?.id === idea.id ? <div className="form-grid"><FormField label="Tên làm việc" htmlFor={`idea-title-${idea.id}`}><input id={`idea-title-${idea.id}`} value={editingIdea.workingTitle} onChange={(event) => setEditingIdea({ ...editingIdea, workingTitle: event.target.value })} /></FormField><FormField label="Góc tiếp cận" htmlFor={`idea-angle-${idea.id}`}><textarea id={`idea-angle-${idea.id}`} value={editingIdea.angle} onChange={(event) => setEditingIdea({ ...editingIdea, angle: event.target.value })} /></FormField><FormField label="Lời hứa cốt lõi" htmlFor={`idea-promise-${idea.id}`}><textarea id={`idea-promise-${idea.id}`} value={editingIdea.corePromise} onChange={(event) => setEditingIdea({ ...editingIdea, corePromise: event.target.value })} /></FormField><FormField label="Vấn đề của người xem" htmlFor={`idea-problem-${idea.id}`}><textarea id={`idea-problem-${idea.id}`} value={editingIdea.viewerProblem} onChange={(event) => setEditingIdea({ ...editingIdea, viewerProblem: event.target.value })} /></FormField><FormField label="Câu hỏi của người xem" htmlFor={`idea-question-${idea.id}`}><textarea id={`idea-question-${idea.id}`} value={editingIdea.dramaticQuestion} onChange={(event) => setEditingIdea({ ...editingIdea, dramaticQuestion: event.target.value })} /></FormField><FormField label="Cảm xúc mục tiêu" htmlFor={`idea-emotion-${idea.id}`}><input id={`idea-emotion-${idea.id}`} value={editingIdea.targetEmotion} onChange={(event) => setEditingIdea({ ...editingIdea, targetEmotion: event.target.value })} /></FormField><FormField label="Concept thumbnail" htmlFor={`idea-thumbnail-${idea.id}`}><textarea id={`idea-thumbnail-${idea.id}`} value={editingIdea.thumbnailConcept} onChange={(event) => setEditingIdea({ ...editingIdea, thumbnailConcept: event.target.value })} /></FormField><FormField label="Tóm tắt tính riêng" htmlFor={`idea-originality-${idea.id}`}><textarea id={`idea-originality-${idea.id}`} value={editingIdea.noveltyExplanation} onChange={(event) => setEditingIdea({ ...editingIdea, noveltyExplanation: event.target.value })} /></FormField><FormField label="Độ khó dự kiến" htmlFor={`idea-difficulty-${idea.id}`}><select id={`idea-difficulty-${idea.id}`} value={editingIdea.productionDifficulty} onChange={(event) => setEditingIdea({ ...editingIdea, productionDifficulty: event.target.value as typeof editingIdea.productionDifficulty })}><option value="low">Thấp</option><option value="medium">Vừa</option><option value="high">Cao</option></select></FormField><div className="button-row"><button className="button primary compact" type="button" onClick={() => void saveEditedIdea()}>Lưu chỉnh sửa</button><button className="button secondary compact" type="button" onClick={() => setEditingIdea(null)}>Huỷ</button></div></div> : null}
            </SectionCard>)}
          </div>
        ) : (
          <EmptyState
            title="Phòng ý tưởng đang bị chặn"
            detail={topicMode ? "Hãy tạo ý tưởng để chọn hướng sáng tạo." : ideaLab.blockingReasons[0]?.message ?? "Phân tích tài liệu tham khảo vẫn đang được chuẩn bị."}
            action={topicMode || opportunity.runnable ? <button className="button primary" type="button" onClick={() => void (topicMode ? runIdeas() : runOpportunity())}>{topicMode ? "Tạo ý tưởng" : "Chạy bản đồ cơ hội"}</button> : undefined}
          />
        )}
      </SectionCard>
      <StageStatusHeader stageName="Originality Review" stageNumber={9} eligibility={originalityReview} dependencies={["Approved Idea Lab candidate", "Approved Competitor DNA"]} purpose="Kiểm tra mức trùng lặp về câu chữ, cấu trúc, thumbnail và concept với bằng chứng tham khảo đã lưu trước khi lập dàn ý." />
      <SectionCard title="Kiểm tra tính riêng" description="Kiểm tra xác định cục bộ này so sánh ý tưởng đã chọn với mẫu tham khảo đã duyệt; không khẳng định đã bao phủ tìm kiếm web bên ngoài.">
        {originalityArtifacts.length ? originalityArtifacts.map((artifact) => (
          <div key={artifact.id}>
            <StatusBadge tone={artifact.payloadJson.status === "pass" ? "success" : "danger"}>{creatorStatusLabel(artifact.payloadJson.status)}</StatusBadge>
            <p>Câu chữ {artifact.payloadJson.phraseOverlapRisk}% | Cấu trúc {artifact.payloadJson.structuralOverlapRisk}% | Thumbnail {artifact.payloadJson.thumbnailOverlapRisk}% | Concept {artifact.payloadJson.conceptOverlapRisk}%</p>
            {artifact.payloadJson.flaggedMatches.length ? <TagList items={artifact.payloadJson.flaggedMatches} /> : <p>Không phát hiện trùng lặp đáng kể trong bằng chứng tham khảo đã duyệt.</p>}
            {artifact.payloadJson.requiredChanges.length ? <TagList items={artifact.payloadJson.requiredChanges} /> : null}
            {artifact.status === "needs_review" ? <div className="button-row">{artifact.payloadJson.status === "pass" ? <button className="button compact" type="button" disabled={!originalityReview.approvable} onClick={() => void approveOriginalityReview()}>Duyệt kiểm tra tính riêng</button> : null}<button className="button danger compact" type="button" onClick={() => void rejectOriginalityReview()}>Từ chối kiểm tra tính riêng</button></div> : null}
          </div>
        )) : <EmptyState title="Chưa có kiểm tra tính riêng" detail="Hãy duyệt một ứng viên ý tưởng rồi chạy bước này." />}
        <div className="button-row">
          {originalityReview.runnable ? <button className="button primary" type="button" onClick={() => void runOriginalityReview()}>Chạy kiểm tra tính riêng</button> : <DisabledAction reason={originalityReview.blockingReasons[0]?.message ?? "Kiểm tra tính riêng chưa sẵn sàng để chạy."}>Chạy kiểm tra tính riêng</DisabledAction>}
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
  function runOutline() { return perform(() => factoryClient.runOutline({ projectId: props.project.id }), "Dàn ý đã sẵn sàng để duyệt.", "Không thể tạo dàn ý"); }
  function approveOutline() { return perform(() => factoryClient.approveOutline({ projectId: props.project.id }), "Dàn ý đã được duyệt. Có thể viết kịch bản.", "Không thể duyệt dàn ý"); }
  function rejectOutline() { return perform(() => factoryClient.rejectOutline({ projectId: props.project.id }), "Dàn ý đã bị từ chối.", "Không thể từ chối dàn ý"); }
  function runScript() { return perform(() => factoryClient.runScript({ projectId: props.project.id }), "Kịch bản đã sẵn sàng để duyệt.", "Không thể tạo kịch bản"); }
  function regenerateScript() { return perform(() => factoryClient.regenerateScript({ projectId: props.project.id }), "Kịch bản đã được tạo lại và sẵn sàng để duyệt.", "Không thể tạo lại kịch bản"); }
  function approveScript() { return perform(() => factoryClient.approveScript({ projectId: props.project.id }), "Kịch bản đã được duyệt. Có thể kiểm tra sự thật.", "Không thể duyệt kịch bản"); }
  function rejectScript() { return perform(() => factoryClient.rejectScript({ projectId: props.project.id }), "Kịch bản đã bị từ chối.", "Không thể từ chối kịch bản"); }
  async function saveScriptEdit(sectionId: string): Promise<void> {
    const artifact = [...scripts].reverse().find((item) => item.status === "needs_review" || item.status === "approved");
    if (!artifact) { setMessage("Cần có bản kịch bản đã lưu trước khi chỉnh sửa."); return; }
    setRunning(true);
    try {
      const project = await factoryClient.editScript({ projectId: props.project.id, artifactId: artifact.id, sectionId, narration: draftNarration });
      props.setSelectedProject(project);
      await refreshArtifacts();
      setEditingSectionId(null);
      setDraftNarration("");
      setMessage("Đã lưu chỉnh sửa kịch bản. Hãy duyệt lại trước khi tiếp tục.");
    } catch (error) {
      setMessage(`Không thể lưu chỉnh sửa kịch bản: ${safeRendererError(error)}`);
    } finally {
      setRunning(false);
    }
  }
  function runFactReview() { return perform(() => factoryClient.runFactReview({ projectId: props.project.id }), "Kiểm tra sự thật đã sẵn sàng để duyệt.", "Không thể chạy kiểm tra sự thật"); }
  function approveFactReview() { return perform(() => factoryClient.approveFactReview({ projectId: props.project.id }), "Kiểm tra sự thật đã được duyệt.", "Không thể duyệt kiểm tra sự thật"); }
  function rejectFactReview() { return perform(() => factoryClient.rejectFactReview({ projectId: props.project.id }), "Kiểm tra sự thật đã bị từ chối.", "Không thể từ chối kiểm tra sự thật"); }
  function runRetentionReview() { return perform(() => factoryClient.runRetentionReview({ projectId: props.project.id }), "Kiểm tra giữ chân đã sẵn sàng để duyệt.", "Không thể chạy kiểm tra giữ chân"); }
  function approveRetentionReview() { return perform(() => factoryClient.approveRetentionReview({ projectId: props.project.id }), "Kiểm tra giữ chân đã được duyệt.", "Không thể duyệt kiểm tra giữ chân"); }
  function rejectRetentionReview() { return perform(() => factoryClient.rejectRetentionReview({ projectId: props.project.id }), "Kiểm tra giữ chân đã bị từ chối.", "Không thể từ chối kiểm tra giữ chân"); }
  return (
    <>
      <PageHeader title="Câu chuyện" description="Dàn ý, kịch bản và các lượt kiểm tra được duyệt riêng để bạn luôn biết bước tiếp theo." actions={outline.runnable ? <button className="button primary" type="button" onClick={() => void runOutline()} disabled={running}>Lập dàn ý</button> : <DisabledAction reason={outline.blockingReasons[0]?.message ?? "Dàn ý chưa thể chạy."}>Lập dàn ý</DisabledAction>} />
      <StageStatusHeader stageName="Outline" stageNumber={10} eligibility={outline} dependencies={["Approved idea", "Approved Originality Review"]} purpose="Lập các phần chính từ ý tưởng đã duyệt, chưa thêm nghiên cứu bên ngoài." />
      <SectionCard title="Duyệt dàn ý">{outlines.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge>{artifact.payloadJson.sections.map((section) => <p key={section.id}>{section.purpose}: {section.keyPoint}</p>)}{artifact.status === "needs_review" ? <div className="button-row">{outline.approvable ? <button className="button compact" type="button" onClick={() => void approveOutline()} disabled={running}>Duyệt dàn ý</button> : <DisabledAction reason={outline.blockingReasons[0]?.message ?? "Dàn ý chưa thể duyệt."}>Duyệt dàn ý</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void rejectOutline()} disabled={running}>Từ chối dàn ý</button></div> : null}</div>)}</SectionCard>
      <StageStatusHeader stageName="Script" stageNumber={11} eligibility={script} dependencies={["Approved Outline"]} purpose="Viết lời dẫn dựa trên dàn ý đã duyệt." />
      <SectionCard title="Duyệt kịch bản" description="Mỗi lần tạo đều được lưu lại; bạn duyệt nội dung trước khi chuyển sang kiểm tra sự thật.">
        {script.runnable ? <button className="button primary" type="button" onClick={() => void runScript()} disabled={running}>Tạo kịch bản</button> : <DisabledAction reason={script.blockingReasons[0]?.message ?? "Kịch bản chưa thể chạy."}>Tạo kịch bản</DisabledAction>}
        {props.project.setup.inputMode !== "existing_script" && props.project.scriptSections.length ? <button className="button secondary" type="button" onClick={() => void regenerateScript()} disabled={running}>Tạo lại kịch bản</button> : null}
        {scripts.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge>{artifact.payloadJson.sections.map((section) => <p key={section.id}><strong>{section.purpose}</strong>: {section.narration}</p>)}{artifact.status === "needs_review" ? <div className="button-row">{script.approvable ? <button className="button compact" type="button" onClick={() => void approveScript()} disabled={running}>Duyệt kịch bản</button> : <DisabledAction reason={script.blockingReasons[0]?.message ?? "Kịch bản chưa thể duyệt."}>Duyệt kịch bản</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void rejectScript()} disabled={running}>Từ chối kịch bản</button></div> : null}</div>)}
      </SectionCard>
      <StageStatusHeader stageName="Fact Review" stageNumber={12} eligibility={factReview} dependencies={["Approved Script"]} purpose="Kiểm tra luận điểm trong kịch bản bằng các quy tắc cục bộ." />
      <SectionCard title="Kiểm tra sự thật" description="Luận điểm bị chặn sẽ không thể duyệt. Các luận điểm cần diễn giải phải giữ nguyên mức độ chắc chắn trong lời dẫn.">
        {factReview.runnable ? <button className="button primary" type="button" onClick={() => void runFactReview()} disabled={running}>Chạy kiểm tra sự thật</button> : <DisabledAction reason={factReview.blockingReasons[0]?.message ?? "Kiểm tra sự thật chưa thể chạy."}>Chạy kiểm tra sự thật</DisabledAction>}
        {factReviews.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge><small>Người kiểm tra: quy tắc cục bộ</small>{artifact.payloadJson.findings.map((finding) => <p key={finding.claimId}><strong>{finding.claimId}</strong>: {creatorStatusLabel(finding.verdict)} - {finding.reason}</p>)}{artifact.status === "needs_review" ? <div className="button-row">{factReview.approvable ? <button className="button compact" type="button" onClick={() => void approveFactReview()} disabled={running}>Duyệt kiểm tra sự thật</button> : <DisabledAction reason={factReview.blockingReasons[0]?.message ?? "Kiểm tra sự thật chưa thể duyệt."}>Duyệt kiểm tra sự thật</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void rejectFactReview()} disabled={running}>Từ chối kiểm tra</button></div> : null}</div>)}
        {message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}
      </SectionCard>
      <StageStatusHeader stageName="Retention Review" stageNumber={13} eligibility={retentionReview} dependencies={["Approved Fact Review", "Approved Script"]} purpose="Kiểm tra nhịp kể và rủi ro giữ chân mà không tự viết lại nội dung." />
      <SectionCard title="Kiểm tra giữ chân" description="Model chữ trả về các nhận xét theo từng phần để bạn tự quyết định chỉnh sửa.">
        {retentionReview.runnable ? <button className="button primary" type="button" onClick={() => void runRetentionReview()} disabled={running}>Chạy kiểm tra giữ chân</button> : <DisabledAction reason={retentionReview.blockingReasons[0]?.message ?? "Kiểm tra giữ chân chưa thể chạy."}>Chạy kiểm tra giữ chân</DisabledAction>}
        {retentionReviews.map((artifact) => <div key={artifact.id}><StatusBadge tone={artifact.status === "approved" ? "success" : "warning"}>{creatorStatusLabel(artifact.status)}</StatusBadge><p>Kết luận: {creatorStatusLabel(artifact.payloadJson.overallVerdict)}</p>{artifact.payloadJson.findings.map((finding) => <p key={finding.sectionId}><strong>{finding.sectionId}</strong> ({creatorStatusLabel(finding.severity)}): {finding.reason} Gợi ý: {finding.recommendedChange}</p>)}{artifact.status === "needs_review" ? <div className="button-row">{retentionReview.approvable ? <button className="button compact" type="button" onClick={() => void approveRetentionReview()} disabled={running}>Duyệt kiểm tra giữ chân</button> : <DisabledAction reason={retentionReview.blockingReasons[0]?.message ?? "Kiểm tra giữ chân chưa thể duyệt."}>Duyệt kiểm tra giữ chân</DisabledAction>}<button className="button danger compact" type="button" onClick={() => void rejectRetentionReview()} disabled={running}>Từ chối kiểm tra</button></div> : null}</div>)}
      </SectionCard>
      <div className="split-grid script-layout">
        <SectionCard title="Các phần">
          {props.project.scriptSections.map((section) => (
            <button className="script-section-button" key={section.id} type="button">
              <strong>{section.purpose}</strong>
              <span>{section.estimatedSeconds}s / {section.estimatedWords} words</span>
            </button>
          ))}
        </SectionCard>
        <SectionCard title="Biên tập lời dẫn">
          {props.project.scriptSections.map((section) => (
            <article className="script-block" key={section.id}>
              <h3>{section.purpose}</h3>
              <textarea value={editingSectionId === section.id ? draftNarration : section.narration} readOnly={editingSectionId !== section.id} onChange={(event) => setDraftNarration(event.target.value)} aria-label={`Lời dẫn ${section.id}`} />
              {editingSectionId === section.id ? <div className="button-row"><button className="button primary compact" type="button" disabled={running || !draftNarration.trim()} onClick={() => void saveScriptEdit(section.id)}>Lưu chỉnh sửa</button><button className="button secondary compact" type="button" disabled={running} onClick={() => { setEditingSectionId(null); setDraftNarration(""); }}>Huỷ</button></div> : <button className="button secondary compact" type="button" disabled={running} onClick={() => { setEditingSectionId(section.id); setDraftNarration(section.narration); }}>Sửa lời dẫn</button>}
              <TagList items={section.visualOpportunities} limit={5} />
            </article>
          ))}
        </SectionCard>
        <SectionCard title="Thanh kiểm tra">
          <p><strong>Giọng kênh:</strong> {props.selectedProfile?.tone ?? "Chưa có hồ sơ kênh"}</p>
          <p><strong>Danh sách cần tránh:</strong></p>
          <TagList items={props.selectedProfile?.avoidList ?? []} limit={8} />
        </SectionCard>
      </div>
    </>
  );
}
