import type { StageEligibility } from "@lsf/domain";
import { workflowStageDefinitions } from "@lsf/domain";
import { SettingsList, MetricCard, SectionCard } from "./ui";
import { creatorStatusLabel } from "../creatorStudioCopy";
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
    <SectionCard title={props.stageName} description={props.purpose}>
      <div className="metric-grid">
        <MetricCard label="Stage number" value={registeredStage?.order ?? props.stageNumber} />
        <MetricCard label="Current status" value={creatorStatusLabel(props.eligibility.status)} tone={stageTone(props.eligibility.status)} />
        <MetricCard label="Runnable" value={props.eligibility.runnable ? "Yes" : "No"} tone={props.eligibility.runnable ? "success" : "warning"} />
        <MetricCard label="Approval" value={props.eligibility.approvable ? "Available" : "Locked"} tone={props.eligibility.approvable ? "success" : "warning"} />
      </div>
      <SettingsList items={[
        ["Dependencies", props.dependencies.join(", ") || "None"],
        ["Reviewable", props.eligibility.reviewable ? "Yes" : "No"],
        ["Blocking reasons", props.eligibility.blockingReasons.map((reason) => reason.message).join(" ") || "None"]
      ]} />
    </SectionCard>
  );
}

export function canRetryStage(stage: StageEligibility): boolean {
  return stage.runnable || stage.status === "failed" || stage.status === "needs_attention";
}
