import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFixtureProject } from "@lsf/domain";
import { ActionRunStore, openFactoryDatabase, ProjectRepository } from "../src";

function openStore() {
  const db = openFactoryDatabase(join(mkdtempSync(join(tmpdir(), "lsf-action-runs-")), "factory.sqlite"));
  const project = createFixtureProject({ topic: "Action runs", format: "short", targetLanguage: "Vietnamese" });
  new ProjectRepository(db).saveProject({ ...project, id: "project-1" });
  return { db, store: new ActionRunStore(db) };
}

function run(id: string, state: "queued" | "running" | "waiting_user" | "success" | "failed" | "cancelled" = "running") {
  return { id, projectId: "project-1", checkpointId: "idea" as const, actionId: "GENERATE_IDEAS" as const, stageId: "idea-lab", state, progress: { mode: "determinate" as const, completedUnits: 1, totalUnits: 3, message: "Working" }, retryable: true, inputFingerprint: "same-input", outputArtifactIds: [], startedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
}

describe("ActionRunStore", () => {
  it("migrates, persists progress, prevents duplicate active work, and permits retry after failure", () => {
    const { db, store } = openStore();
    store.create(run("run-1"));
    expect(store.list("project-1")).toMatchObject([{ id: "run-1", progress: { mode: "determinate", completedUnits: 1, totalUnits: 3 } }]);
    expect(() => store.create(run("run-2"))).toThrow("already active");
    const failed = { ...run("run-1", "failed"), finishedAt: "2026-01-01T00:01:00.000Z", safeErrorMessage: "Provider failed" };
    store.update(failed);
    store.create(run("run-2"));
    expect(store.list("project-1").map((item) => item.id)).toEqual(expect.arrayContaining(["run-1", "run-2"]));
    db.close();
  });

  it("recovers interrupted runs and preserves indeterminate provider progress", () => {
    const { db, store } = openStore();
    store.create({ ...run("run-1"), progress: { mode: "indeterminate", startedAt: "2026-01-01T00:00:00.000Z", message: "Waiting for provider" } });
    expect(store.recoverInterruptedRuns()).toHaveLength(1);
    expect(store.list("project-1")[0]).toMatchObject({ state: "failed", retryable: true, progress: { mode: "indeterminate", message: "Waiting for provider" } });
    db.close();
  });
});
