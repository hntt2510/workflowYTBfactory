import type { StageEligibility } from "@lsf/domain";
import { workflowStageDefinitions } from "@lsf/domain";
import { SettingsList, MetricCard, SectionCard } from "./ui";
import { creatorBlockingMessage, creatorDependencyLabel, creatorStageLabel, creatorStagePurpose, creatorStatusLabel } from "../creatorStudioCopy";
import { stageTone } from "../utils";

export function StageStatusHeader(props: {
  stageName: string;
  stageNumber: number;
  eligibility: StageEligibility;
  dependencies: string[];
  purpose: string;
}) {
  const registeredStage = workflowStageDefinitions.find((stage) => stage.name === props.stageName);
  return (
    <SectionCard title={creatorStageLabel(props.stageName)} description={creatorStagePurpose(props.stageName, props.purpose)}>
      <div className="metric-grid">
        <MetricCard label="Số bước" value={registeredStage?.order ?? props.stageNumber} />
        <MetricCard label="Trạng thái hiện tại" value={creatorStatusLabel(props.eligibility.status)} tone={stageTone(props.eligibility.status)} />
        <MetricCard label="Có thể chạy" value={props.eligibility.runnable ? "Có" : "Chưa"} tone={props.eligibility.runnable ? "success" : "warning"} />
        <MetricCard label="Có thể duyệt" value={props.eligibility.approvable ? "Sẵn sàng" : "Đang khoá"} tone={props.eligibility.approvable ? "success" : "warning"} />
      </div>
      <SettingsList items={[
        ["Phụ thuộc", props.dependencies.map(creatorDependencyLabel).join(", ") || "Không có"],
        ["Có thể duyệt nội dung", props.eligibility.reviewable ? "Có" : "Chưa"],
        ["Điều đang chặn", props.eligibility.blockingReasons.map((reason) => creatorBlockingMessage(reason.message)).join(" ") || "Không có"]
      ]} />
    </SectionCard>
  );
}

export function canRetryStage(stage: StageEligibility): boolean {
  return stage.runnable || stage.status === "failed" || stage.status === "needs_attention";
}
