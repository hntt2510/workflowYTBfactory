import { describe, expect, it } from "vitest";
import type { WorkflowArtifact, WorkflowStageRun } from "@lsf/domain";
import { selectCurrentBackedApprovedArtifacts } from "./workflowArtifactSelection";

const now = "2026-07-30T00:00:00.000Z";

function run(input: Partial<WorkflowStageRun> & Pick<WorkflowStageRun, "id" | "stageId" | "outputArtifactIds">): WorkflowStageRun {
  return {
    projectId: "project-1",
    status: "approved",
    runnerId: `${input.stageId}-runner`,
    runnerVersion: "v1",
    inputArtifactIds: [],
    inputFingerprint: input.id.padEnd(64, "0").slice(0, 64),
    startedAt: now,
    finishedAt: now,
    ...input
  };
}

function artifact(input: Partial<WorkflowArtifact> & Pick<WorkflowArtifact, "id" | "stageId" | "stageRunId" | "version">): WorkflowArtifact {
  return {
    projectId: "project-1",
    type: input.stageId,
    status: "approved",
    payloadJson: {},
    createdAt: now,
    updatedAt: now,
    ...input
  };
}

function store(runs: WorkflowStageRun[], artifacts: WorkflowArtifact[]) {
  return {
    listRuns: (_projectId: string, stageId: string) => runs.filter((item) => item.stageId === stageId),
    listArtifacts: (_projectId: string, stageId: string) => artifacts.filter((item) => item.stageId === stageId).sort((a, b) => b.version - a.version),
    getArtifact: (_projectId: string, artifactId: string) => artifacts.find((item) => item.id === artifactId) ?? null
  };
}

function approvedInput(
  stageId: string,
  id: string
): { run: WorkflowStageRun; artifact: WorkflowArtifact; runs: WorkflowStageRun[]; artifacts: WorkflowArtifact[] } {
  const runId = `run-${id}`;
  if (stageId === "project-setup" || stageId === "reference-validation") {
    const inputRun = run({ id: runId, stageId, inputArtifactIds: [], outputArtifactIds: [id] });
    const inputArtifact = artifact({ id, stageId, stageRunId: runId, version: 1 });
    return { run: inputRun, artifact: inputArtifact, runs: [inputRun], artifacts: [inputArtifact] };
  }

  const backingArtifactId = `${id}-reference-set`;
  const backingRunId = `run-${backingArtifactId}`;
  const backingRun = run({
    id: backingRunId,
    stageId: "reference-validation",
    inputArtifactIds: [],
    outputArtifactIds: [backingArtifactId]
  });
  const inputRun = run({ id: runId, stageId, inputArtifactIds: [backingArtifactId], outputArtifactIds: [id] });
  const inputArtifact = artifact({ id, stageId, stageRunId: runId, version: 1 });
  const backingArtifact = artifact({
    id: backingArtifactId,
    stageId: "reference-validation",
    stageRunId: backingRunId,
    version: 1
  });
  return {
    run: inputRun,
    artifact: inputArtifact,
    runs: [backingRun, inputRun],
    artifacts: [backingArtifact, inputArtifact]
  };
}

describe("workflow artifact selection", () => {
  it("keeps only the latest singleton artifact backed by current approved inputs", () => {
    const input = approvedInput("outline", "outline-input");
    const upstreamOldRun = run({ id: "run-outline-old", stageId: "outline", inputArtifactIds: ["outline-input"], outputArtifactIds: ["outline-old"] });
    const upstreamNewRun = run({ id: "run-outline-new", stageId: "outline", inputArtifactIds: ["outline-input"], outputArtifactIds: ["outline-new"] });
    const downstreamOldRun = run({ id: "run-script-old", stageId: "script", inputArtifactIds: ["outline-old"], outputArtifactIds: ["script-old"] });
    const downstreamNewRun = run({ id: "run-script-new", stageId: "script", inputArtifactIds: ["outline-new"], outputArtifactIds: ["script-new"] });
    const dependencies = store(
      [...input.runs, upstreamOldRun, upstreamNewRun, downstreamOldRun, downstreamNewRun],
      [
        ...input.artifacts,
        artifact({ id: "outline-old", stageId: "outline", stageRunId: "run-outline-old", version: 1 }),
        artifact({ id: "outline-new", stageId: "outline", stageRunId: "run-outline-new", version: 2 }),
        artifact({ id: "script-old", stageId: "script", stageRunId: "run-script-old", version: 1 }),
        artifact({ id: "script-new", stageId: "script", stageRunId: "run-script-new", version: 2 })
      ]
    );

    expect(selectCurrentBackedApprovedArtifacts("project-1", "script", dependencies).map((item) => item.id)).toEqual(["script-new"]);
  });

  it("keeps only the latest transcript cleaning artifact backed by the current reference validation run", () => {
    const oldReferenceValidationRun = run({ id: "run-reference-validation-old", stageId: "reference-validation", outputArtifactIds: ["reference-set-old"] });
    const newReferenceValidationRun = run({ id: "run-reference-validation-new", stageId: "reference-validation", outputArtifactIds: ["reference-set-new"] });
    const oldTranscriptCleaningRun = run({ id: "run-transcript-cleaning-old", stageId: "transcript-cleaning", inputArtifactIds: ["reference-set-old"], outputArtifactIds: ["transcript-old"] });
    const newTranscriptCleaningRun = run({ id: "run-transcript-cleaning-new", stageId: "transcript-cleaning", inputArtifactIds: ["reference-set-new"], outputArtifactIds: ["transcript-new"] });
    const dependencies = store(
      [oldReferenceValidationRun, newReferenceValidationRun, oldTranscriptCleaningRun, newTranscriptCleaningRun],
      [
        artifact({ id: "reference-set-old", stageId: "reference-validation", stageRunId: "run-reference-validation-old", version: 1 }),
        artifact({ id: "reference-set-new", stageId: "reference-validation", stageRunId: "run-reference-validation-new", version: 2 }),
        artifact({ id: "transcript-old", stageId: "transcript-cleaning", stageRunId: "run-transcript-cleaning-old", version: 1 }),
        artifact({ id: "transcript-new", stageId: "transcript-cleaning", stageRunId: "run-transcript-cleaning-new", version: 2 })
      ]
    );

    expect(selectCurrentBackedApprovedArtifacts("project-1", "transcript-cleaning", dependencies).map((item) => item.id)).toEqual(["transcript-new"]);
  });

  it("keeps only the latest singleton artifact even when payloads include referenceId", () => {
    const input = approvedInput("claim-map", "claim-map-input");
    const dependencies = store(
      [
        ...input.runs,
        run({ id: "run-outline-ref-a", stageId: "outline", inputArtifactIds: ["claim-map-input"], outputArtifactIds: ["outline-ref-a"] }),
        run({ id: "run-outline-ref-b", stageId: "outline", inputArtifactIds: ["claim-map-input"], outputArtifactIds: ["outline-ref-b"] })
      ],
      [
        ...input.artifacts,
        artifact({ id: "outline-ref-a", stageId: "outline", stageRunId: "run-outline-ref-a", version: 1, payloadJson: { referenceId: "ref-a", sections: [] } }),
        artifact({ id: "outline-ref-b", stageId: "outline", stageRunId: "run-outline-ref-b", version: 2, payloadJson: { referenceId: "ref-b", sections: [] } })
      ]
    );

    expect(selectCurrentBackedApprovedArtifacts("project-1", "outline", dependencies, { perReferenceStages: new Set(["competitor-dna"]) }).map((item) => item.id)).toEqual(["outline-ref-b"]);
  });

  it("ignores approved artifacts whose stage run is no longer approved", () => {
    const input = approvedInput("claim-map", "claim-map-current");
    const dependencies = store(
      [
        ...input.runs,
        run({ id: "run-outline-rejected", stageId: "outline", status: "rejected", inputArtifactIds: ["claim-map-current"], outputArtifactIds: ["outline-rejected"] }),
        run({ id: "run-outline-current", stageId: "outline", inputArtifactIds: ["claim-map-current"], outputArtifactIds: ["outline-current"] })
      ],
      [
        ...input.artifacts,
        artifact({ id: "outline-rejected", stageId: "outline", stageRunId: "run-outline-rejected", version: 2 }),
        artifact({ id: "outline-current", stageId: "outline", stageRunId: "run-outline-current", version: 1 })
      ]
    );

    expect(selectCurrentBackedApprovedArtifacts("project-1", "outline", dependencies).map((item) => item.id)).toEqual(["outline-current"]);
  });

  it("ignores stale artifacts even when their stage run is still approved", () => {
    const input = approvedInput("claim-map", "claim-map-for-stale");
    const dependencies = store(
      [
        ...input.runs,
        run({ id: "run-outline-stale", stageId: "outline", inputArtifactIds: ["claim-map-for-stale"], outputArtifactIds: ["outline-stale"] }),
        run({ id: "run-outline-current", stageId: "outline", inputArtifactIds: ["claim-map-for-stale"], outputArtifactIds: ["outline-current"] })
      ],
      [
        ...input.artifacts,
        artifact({ id: "outline-stale", stageId: "outline", stageRunId: "run-outline-stale", version: 2, status: "stale" }),
        artifact({ id: "outline-current", stageId: "outline", stageRunId: "run-outline-current", version: 1 })
      ]
    );

    expect(selectCurrentBackedApprovedArtifacts("project-1", "outline", dependencies).map((item) => item.id)).toEqual(["outline-current"]);
  });

  it("ignores dependent stage artifacts from runs without input artifacts", () => {
    const dependencies = store(
      [
        run({ id: "run-script-no-inputs", stageId: "script", inputArtifactIds: [], outputArtifactIds: ["script-no-inputs"] }),
        run({ id: "run-project-setup", stageId: "project-setup", inputArtifactIds: [], outputArtifactIds: ["project-setup-current"] })
      ],
      [
        artifact({ id: "script-no-inputs", stageId: "script", stageRunId: "run-script-no-inputs", version: 1 }),
        artifact({ id: "project-setup-current", stageId: "project-setup", stageRunId: "run-project-setup", version: 1 })
      ]
    );

    expect(selectCurrentBackedApprovedArtifacts("project-1", "script", dependencies)).toEqual([]);
    expect(selectCurrentBackedApprovedArtifacts("project-1", "project-setup", dependencies).map((item) => item.id)).toEqual(["project-setup-current"]);
  });

  it("ignores approved artifacts missing from their stage run outputs", () => {
    const input = approvedInput("claim-map", "claim-map-for-detached");
    const dependencies = store(
      [
        ...input.runs,
        run({ id: "run-outline-detached", stageId: "outline", inputArtifactIds: ["claim-map-for-detached"], outputArtifactIds: ["different-artifact"] }),
        run({ id: "run-outline-current", stageId: "outline", inputArtifactIds: ["claim-map-for-detached"], outputArtifactIds: ["outline-current"] })
      ],
      [
        ...input.artifacts,
        artifact({ id: "outline-detached", stageId: "outline", stageRunId: "run-outline-detached", version: 2 }),
        artifact({ id: "outline-current", stageId: "outline", stageRunId: "run-outline-current", version: 1 })
      ]
    );

    expect(selectCurrentBackedApprovedArtifacts("project-1", "outline", dependencies).map((item) => item.id)).toEqual(["outline-current"]);
  });

  it("keeps the latest approved artifact per reference", () => {
    const input = approvedInput("reference-segmentation", "segments-input");
    const dependencies = store(
      [
        ...input.runs,
        run({ id: "run-dna-ref-a-old", stageId: "competitor-dna", inputArtifactIds: ["segments-input"], outputArtifactIds: ["dna-ref-a-old"] }),
        run({ id: "run-dna-ref-a-new", stageId: "competitor-dna", inputArtifactIds: ["segments-input"], outputArtifactIds: ["dna-ref-a-new"] }),
        run({ id: "run-dna-ref-b", stageId: "competitor-dna", inputArtifactIds: ["segments-input"], outputArtifactIds: ["dna-ref-b"] })
      ],
      [
        ...input.artifacts,
        artifact({ id: "dna-ref-a-old", stageId: "competitor-dna", stageRunId: "run-dna-ref-a-old", version: 1, payloadJson: { referenceId: "ref-a" } }),
        artifact({ id: "dna-ref-a-new", stageId: "competitor-dna", stageRunId: "run-dna-ref-a-new", version: 3, payloadJson: { referenceId: "ref-a" } }),
        artifact({ id: "dna-ref-b", stageId: "competitor-dna", stageRunId: "run-dna-ref-b", version: 2, payloadJson: { referenceId: "ref-b" } })
      ]
    );

    expect(selectCurrentBackedApprovedArtifacts("project-1", "competitor-dna", dependencies, { perReferenceStages: new Set(["competitor-dna"]) }).map((item) => item.id)).toEqual(["dna-ref-a-new", "dna-ref-b"]);
  });

  it("validates per-reference input artifacts against the current artifact for that reference", () => {
    const perReferenceStages = new Set(["reference-segmentation", "competitor-dna"]);
    const dependencies = store(
      [
        run({ id: "run-reference-validation-current", stageId: "reference-validation", outputArtifactIds: ["reference-set-current"] }),
        run({ id: "run-segments-ref-a", stageId: "reference-segmentation", inputArtifactIds: ["reference-set-current"], outputArtifactIds: ["segments-ref-a"] }),
        run({ id: "run-segments-ref-b", stageId: "reference-segmentation", inputArtifactIds: ["reference-set-current"], outputArtifactIds: ["segments-ref-b"] }),
        run({ id: "run-dna-ref-b", stageId: "competitor-dna", inputArtifactIds: ["segments-ref-b"], outputArtifactIds: ["dna-ref-b"] })
      ],
      [
        artifact({ id: "reference-set-current", stageId: "reference-validation", stageRunId: "run-reference-validation-current", version: 1 }),
        artifact({ id: "segments-ref-a", stageId: "reference-segmentation", stageRunId: "run-segments-ref-a", version: 2, payloadJson: { referenceId: "ref-a" } }),
        artifact({ id: "segments-ref-b", stageId: "reference-segmentation", stageRunId: "run-segments-ref-b", version: 1, payloadJson: { referenceId: "ref-b" } }),
        artifact({ id: "dna-ref-b", stageId: "competitor-dna", stageRunId: "run-dna-ref-b", version: 1, payloadJson: { referenceId: "ref-b" } })
      ]
    );

    expect(selectCurrentBackedApprovedArtifacts("project-1", "competitor-dna", dependencies, { perReferenceStages }).map((item) => item.id)).toEqual(["dna-ref-b"]);
  });

  it("ignores per-reference artifacts without a referenceId", () => {
    const input = approvedInput("reference-segmentation", "segments-ref-input");
    const dependencies = store(
      [
        ...input.runs,
        run({ id: "run-dna-missing-reference", stageId: "competitor-dna", inputArtifactIds: ["segments-ref-input"], outputArtifactIds: ["dna-missing-reference"] }),
        run({ id: "run-dna-ref-a", stageId: "competitor-dna", inputArtifactIds: ["segments-ref-input"], outputArtifactIds: ["dna-ref-a"] })
      ],
      [
        ...input.artifacts,
        artifact({ id: "dna-missing-reference", stageId: "competitor-dna", stageRunId: "run-dna-missing-reference", version: 2, payloadJson: {} }),
        artifact({ id: "dna-ref-a", stageId: "competitor-dna", stageRunId: "run-dna-ref-a", version: 1, payloadJson: { referenceId: "ref-a" } })
      ]
    );

    expect(selectCurrentBackedApprovedArtifacts("project-1", "competitor-dna", dependencies, { perReferenceStages: new Set(["competitor-dna"]) }).map((item) => item.id)).toEqual(["dna-ref-a"]);
  });
});
