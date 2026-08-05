import { Sparkles } from "lucide-react";
import type { FactoryProject } from "@lsf/domain";
import { DataTable, DisabledAction, EmptyState, MetricCard, PageHeader, SectionCard, StatusBadge } from "../../components/ui";
import type { QueueSnapshot } from "../../types";
import { factoryClient } from "../../services/factoryClient";
import { queueCounts, stageTone } from "../../utils";

export function QueueScreen(props: { queue: QueueSnapshot; selectedProject: FactoryProject | null; onRunDemo: () => Promise<void> }) {
  const counts = queueCounts(props.queue);
  async function runDemoQueue() {
    if (!props.selectedProject) return;
    await factoryClient.mockImageBatch(props.selectedProject.id);
    await props.onRunDemo();
  }
  return (
    <>
      <PageHeader
        title="Production Queue"
        description="Queue monitor reflects the real JSON-backed queue. The only runnable queue action is explicitly marked as simulation."
        actions={
          props.selectedProject ? (
            <button className="button secondary" type="button" onClick={() => void runDemoQueue()}><Sparkles size={16} /> Run Queue Simulation</button>
          ) : <DisabledAction reason="Open a project before running the explicit queue simulation.">Run Queue Simulation</DisabledAction>
        }
      />
      <SectionCard>
        <div className="route-result">
          <StatusBadge tone="demo">Queue simulation</StatusBadge>
          <span>The queue backend is real and persisted as JSON, but image workers still use the explicit mock IPC until provider execution is implemented.</span>
        </div>
      </SectionCard>
      <section className="metric-grid">
        {["queued", "running", "succeeded", "failed", "paused", "rate_limited"].map((state) => <MetricCard key={state} label={state.replace("_", " ")} value={counts[state] ?? 0} />)}
      </section>
      <SectionCard title="Five workers">
        <div className="worker-grid">
          {Array.from({ length: props.queue.concurrency }, (_, index) => (
            <div className="worker-slot" key={index}>
              <strong>Worker {index + 1}</strong>
              <span>{index < props.queue.running ? "Running" : "Idle"}</span>
              <small>No progress metadata available</small>
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Jobs">
        {props.queue.jobs.length === 0 ? (
          <EmptyState title="Queue empty" detail="No real provider jobs have been submitted. Simulated jobs are labeled and cost $0." />
        ) : (
          <DataTable label="Generation jobs">
            <thead><tr><th>Status</th><th>Job ID</th><th>Project</th><th>Shot</th><th>Type</th><th>Provider</th><th>Model</th><th>Attempt</th><th>Error</th></tr></thead>
            <tbody>
              {props.queue.jobs.map((job) => (
                <tr key={job.id}>
                  <td><StatusBadge tone={stageTone(job.state)}>{job.state}</StatusBadge></td>
                  <td>{job.id}</td>
                  <td>{job.projectId}</td>
                  <td>{job.shotId}</td>
                  <td>{job.requestType}</td>
                  <td>{job.provider}</td>
                  <td>{job.model}</td>
                  <td>{job.attemptCount}</td>
                  <td>{job.errorClassification ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </SectionCard>
    </>
  );
}
