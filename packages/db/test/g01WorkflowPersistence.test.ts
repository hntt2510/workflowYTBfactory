import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFixtureProject, resolveWorkflowProgress } from "@lsf/domain";
import { openFactoryDatabase, ProjectRepository } from "../src";

describe("G01 project persistence", () => {
  it("round-trips Topic, Existing Script, and Reference modes", () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), "lsf-g01-")), "project.sqlite");
    const db = openFactoryDatabase(dbPath);
    const repo = new ProjectRepository(db);
    const projects = [
      createFixtureProject({ topic: "topic", format: "short", targetLanguage: "Vietnamese", inputMode: "topic" }),
      createFixtureProject({ topic: "script", format: "short", targetLanguage: "Vietnamese", inputMode: "existing_script", sourceScript: "saved script" }),
      createFixtureProject({ topic: "reference", format: "short", targetLanguage: "Vietnamese", inputMode: "reference", competitorReference: { pastedTranscript: "saved reference" } })
    ];
    projects.forEach((project) => repo.saveProject(project));
    db.close();

    const reopened = openFactoryDatabase(dbPath);
    const loaded = projects.map((project) => reopened.prepare("SELECT id FROM projects WHERE id = ?").get(project.id));
    expect(loaded).toHaveLength(3);
    expect(new ProjectRepository(reopened).loadProject(projects[1]!.id)?.setup.inputMode).toBe("existing_script");
    expect(new ProjectRepository(reopened).loadProject(projects[2]!.id)?.competitorReferences).toHaveLength(1);
    reopened.close();
  });

  it("normalizes a legacy stage without deleting it or inventing completion", () => {
    const db = openFactoryDatabase(join(mkdtempSync(join(tmpdir(), "lsf-g01-legacy-")), "project.sqlite"));
    const repo = new ProjectRepository(db);
    const project = createFixtureProject({ topic: "legacy", format: "short", targetLanguage: "English" });
    repo.saveProject({ ...project, stages: project.stages.map((stage) => stage.id === "fact-review" ? { ...stage, status: "approved" as const } : stage) });
    const loaded = repo.loadProject(project.id)!;
    expect(loaded.stages.find((stage) => stage.id === "fact-review")?.status).toBe("approved");
    expect(resolveWorkflowProgress(loaded).stages.find((stage) => stage.stageId === "production-handoff")?.state).toBe("not_started");
    db.close();
  });
});
