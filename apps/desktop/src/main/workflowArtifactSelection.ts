import { getWorkflowStageDefinition, type WorkflowArtifact, type WorkflowStageRun } from "@lsf/domain";

export function selectCurrentBackedApprovedArtifacts(
  projectId: string,
  stageId: string,
  dependencies: {
    listRuns(projectId: string, stageId: string): WorkflowStageRun[];
    listArtifacts(projectId: string, stageId: string): WorkflowArtifact[];
    getArtifact(projectId: string, artifactId: string): WorkflowArtifact | null;
  },
  options: { perReferenceStages?: ReadonlySet<string>; visitedRunIds?: ReadonlySet<string> } = {}
): WorkflowArtifact[] {
  const approvedRunsById = new Map(
    dependencies.listRuns(projectId, stageId)
      .filter((run) => run.status === "approved")
      .map((run) => [run.id, run])
  );
  const artifacts = dependencies.listArtifacts(projectId, stageId).filter((artifact) => {
    if (artifact.status !== "approved" || !artifact.stageRunId) return false;
    const run = approvedRunsById.get(artifact.stageRunId);
    return Boolean(run?.outputArtifactIds.includes(artifact.id) && runInputArtifactsCurrent(projectId, run, dependencies, options));
  });
  if (options.perReferenceStages?.has(stageId)) {
    const seenReferenceIds = new Set<string>();
    return artifacts.filter((artifact) => {
      const referenceId = artifact.payloadJson?.referenceId;
      if (typeof referenceId !== "string" || seenReferenceIds.has(referenceId)) return false;
      seenReferenceIds.add(referenceId);
      return true;
    });
  }
  return artifacts.slice(0, 1);
}

function runInputArtifactsCurrent(
  projectId: string,
  run: WorkflowStageRun,
  dependencies: {
    listRuns(projectId: string, stageId: string): WorkflowStageRun[];
    listArtifacts(projectId: string, stageId: string): WorkflowArtifact[];
    getArtifact(projectId: string, artifactId: string): WorkflowArtifact | null;
  },
  options: { perReferenceStages?: ReadonlySet<string>; visitedRunIds?: ReadonlySet<string> }
): boolean {
  const visitedRunIds = options.visitedRunIds ?? new Set<string>();
  if (visitedRunIds.has(run.id)) return false;
  if (run.stageId === "reference-validation") return true;
  if (run.inputArtifactIds.length === 0) return !getWorkflowStageDefinition(run.stageId)?.dependsOn.length;
  const nextVisitedRunIds = new Set(visitedRunIds);
  nextVisitedRunIds.add(run.id);
  return run.inputArtifactIds.every((artifactId) => {
    const artifact = dependencies.getArtifact(projectId, artifactId);
    if (artifact?.status !== "approved" || !artifact.stageRunId) return false;
    return selectCurrentBackedApprovedArtifacts(projectId, artifact.stageId, dependencies, { ...options, visitedRunIds: nextVisitedRunIds }).some((current) => current.id === artifact.id);
  });
}
