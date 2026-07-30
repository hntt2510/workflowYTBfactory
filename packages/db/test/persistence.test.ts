import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFixtureProject } from "@lsf/domain";
import { AppSettingsStore, assertForeignKeysEnabled, migrations as registeredMigrations, openFactoryDatabase, ProjectRepository, runMigrations, WorkflowRunStore } from "../src";

function openTemp() {
  const dir = mkdtempSync(join(tmpdir(), "lsf-db-"));
  const dbPath = join(dir, "factory.sqlite");
  const db = openFactoryDatabase(dbPath);
  return { dir, dbPath, db, repo: new ProjectRepository(db) };
}

describe("project persistence", () => {
  it("runs migrations on a fresh DB and re-runs safely", () => {
    const { db } = openTemp();
    expect(assertForeignKeysEnabled(db)).toBe(true);
    runMigrations(db);
    const appliedMigrations = db.prepare("SELECT id FROM schema_migrations").all();
    expect(appliedMigrations).toHaveLength(registeredMigrations.length);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'workflow_stage_runs'").get()).toBeTruthy();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'workflow_artifacts'").get()).toBeTruthy();
    db.close();
  });

  it("saves, reloads, updates, and deletes a project without touching workspace files", () => {
    const { dbPath, dir, db, repo } = openTemp();
    const unrelatedPath = join(dir, "unrelated.txt");
    writeFileSync(unrelatedPath, "keep");
    const project = createFixtureProject({
      topic: "What did Aaron's breastpiece symbolize?",
      format: "long",
      targetLanguage: "Vietnamese",
      projectName: "Bible channel",
      targetDuration: "11-13 minutes",
      workflowMode: "semi_automatic"
    });
    repo.saveProject(project);
    db.close();

    const reopened = openFactoryDatabase(dbPath);
    const reopenedRepo = new ProjectRepository(reopened);
    const loaded = reopenedRepo.loadProject(project.id);
    expect(loaded?.id).toBe(project.id);
    expect(loaded?.setup).toEqual(project.setup);
    expect(loaded?.stages.filter((stage) => stage.status === "approved").map((stage) => stage.id)).toEqual(["project-setup"]);
    expect(loaded?.ideas).toEqual([]);
    expect(loaded?.scriptSections).toEqual([]);
    expect(loaded?.scenes).toEqual([]);
    expect(loaded?.shots).toEqual([]);
    expect(loaded?.timeline.items).toEqual(project.timeline.items);

    const updated = {
      ...loaded!,
      competitorReferences: [{
        id: "competitor-01",
        pastedTranscript: "competitor transcript",
        createdAt: new Date().toISOString()
      }]
    };
    reopenedRepo.saveProject(updated);
    const reloaded = reopenedRepo.loadProject(project.id)!;
    expect(reloaded.competitorReferences).toHaveLength(1);
    expect(reloaded.competitorReferences[0]?.pastedTranscript).toBe("competitor transcript");

    reopenedRepo.deleteProject(project.id);
    expect(reopenedRepo.loadProject(project.id)).toBeUndefined();
    expect(existsSync(unrelatedPath)).toBe(true);
    reopened.close();
  });

  it("rolls back the project transaction on a partial save failure", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "term life vs whole life", format: "long", targetLanguage: "English" });
    const broken = {
      ...project,
      scenes: [{
        id: "scene-01",
        scriptSectionId: "missing-section",
        narration: "broken",
        purpose: "broken",
        startFrame: 0,
        durationFrames: 30,
        visualMode: "ai_image" as const,
        emotionalState: "broken",
        requiredAssets: [],
        continuityRefs: []
      }]
    };
    expect(() => repo.saveProject(broken)).toThrow();
    expect(repo.loadProject(project.id)).toBeUndefined();
    db.close();
  });

  it("persists local integration settings", () => {
    const { db } = openTemp();
    const store = new AppSettingsStore(db);
    store.save("local-tts", {
      omnivoiceBinPath: "D:\\tools\\OmniVoice\\.venv\\Scripts\\omnivoice-infer.exe",
      outputDir: "D:\\workspace\\assets\\tts",
      language: "Vietnamese"
    });
    expect(store.load("local-tts", { omnivoiceBinPath: "", outputDir: "", language: "" })).toEqual({
      omnivoiceBinPath: "D:\\tools\\OmniVoice\\.venv\\Scripts\\omnivoice-infer.exe",
      outputDir: "D:\\workspace\\assets\\tts",
      language: "Vietnamese"
    });
    db.close();
  });

  it("persists immutable stage runs and review artifacts", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "reference run", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({
      id: "run-1", projectId: project.id, stageId: "reference-validation", status: "needs_review",
      runnerId: "reference-validation-local", runnerVersion: "v1", inputArtifactIds: [],
      inputFingerprint: "a".repeat(64), outputArtifactIds: ["artifact-1"], startedAt: now, finishedAt: now
    }, {
      id: "artifact-1", projectId: project.id, stageId: "reference-validation", stageRunId: "run-1",
      type: "reference-set.validated", version: 1, status: "needs_review", payloadJson: { valid: true }, createdAt: now, updatedAt: now
    });
    expect(store.findLatestByInput(project.id, "reference-validation", "a".repeat(64))?.id).toBe("run-1");
    expect(store.listRuns(project.id, "reference-validation")).toHaveLength(1);
    expect(store.listArtifacts(project.id, "reference-validation")[0]).toMatchObject({ id: "artifact-1", status: "needs_review" });
    store.approveReviewRun("run-1");
    expect(store.listRuns(project.id, "reference-validation")[0]?.status).toBe("approved");
    expect(store.listArtifacts(project.id, "reference-validation")[0]?.status).toBe("approved");
    store.markProjectArtifactsStale(project.id);
    expect(store.listRuns(project.id, "reference-validation")[0]?.status).toBe("stale");
    expect(store.listArtifacts(project.id, "reference-validation")[0]?.status).toBe("stale");
    db.close();
  });
});
