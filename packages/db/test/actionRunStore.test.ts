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
    store.create({ ...run("run-changed"), inputFingerprint: "changed-input" });
    expect(store.list("project-1").map((item) => item.id)).toContain("run-changed");
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

  it("persists waiting, successful, and cancelled action states across a database reopen", () => {
    const directory = mkdtempSync(join(tmpdir(), "lsf-action-reopen-"));
    const databasePath = join(directory, "factory.sqlite");
    const db = openFactoryDatabase(databasePath);
    const project = createFixtureProject({ topic: "Lifecycle", format: "short", targetLanguage: "Vietnamese" });
    new ProjectRepository(db).saveProject({ ...project, id: "project-1" });
    const store = new ActionRunStore(db);
    store.create({ ...run("waiting", "waiting_user"), progress: { mode: "indeterminate", startedAt: "2026-01-01T00:00:00.000Z", message: "Import images from GG Lab" } });
    store.create({ ...run("success", "success"), inputFingerprint: "success-input", finishedAt: "2026-01-01T00:01:00.000Z" });
    store.create({ ...run("cancelled", "cancelled"), inputFingerprint: "cancelled-input", finishedAt: "2026-01-01T00:01:00.000Z" });
    db.close();
    const reopened = openFactoryDatabase(databasePath);
    expect(new ActionRunStore(reopened).list("project-1")).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "waiting", state: "waiting_user", progress: expect.objectContaining({ mode: "indeterminate" }) }),
      expect.objectContaining({ id: "success", state: "success" }),
      expect.objectContaining({ id: "cancelled", state: "cancelled" })
    ]));
    reopened.close();
  });

  it("lists active runtime work across projects without resurfacing completed actions", () => {
    const { db, store } = openStore();
    store.create(run("running"));
    store.create({ ...run("failed", "failed"), inputFingerprint: "failed-input", finishedAt: "2026-01-01T00:01:00.000Z" });
    store.create({ ...run("success", "success"), inputFingerprint: "success-input", finishedAt: "2026-01-01T00:01:00.000Z" });
    expect(store.listActive().map((item) => item.id)).toEqual(expect.arrayContaining(["running", "failed"]));
    expect(store.listActive().map((item) => item.id)).not.toContain("success");
    db.close();
  });

  it("cancels active action runs when their downstream stage becomes stale without deleting prior outputs", () => {
    const { db, store } = openStore();
    store.create({ ...run("stale-run"), stageId: "script", outputArtifactIds: ["saved-artifact"] });
    expect(store.markStaleForStages("project-1", ["script"])).toBe(1);
    expect(store.list("project-1")).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "stale-run", state: "cancelled", outputArtifactIds: ["saved-artifact"] })
    ]));
    db.close();
  });
});
