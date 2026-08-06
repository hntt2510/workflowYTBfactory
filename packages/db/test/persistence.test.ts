import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultChannelDna, createFixtureProject } from "@lsf/domain";
import { AppSettingsStore, assertForeignKeysEnabled, GenerationJobStore, ImageCertificationStore, migrations as registeredMigrations, openFactoryDatabase, ProjectRepository, runMigrations, TextCertificationStore, TtsJobStore, WorkflowRunStore } from "../src";

function openTemp() {
  const dir = mkdtempSync(join(tmpdir(), "lsf-db-"));
  const dbPath = join(dir, "factory.sqlite");
  const db = openFactoryDatabase(dbPath);
  return { dir, dbPath, db, repo: new ProjectRepository(db) };
}

describe("project persistence", () => {
  it("persists TTS jobs and marks interrupted work failed without losing segment progress", () => {
    const { db, repo } = openTemp();
    const store = new TtsJobStore(db);
    const project = createFixtureProject({ topic: "TTS persistence", format: "short", targetLanguage: "Vietnamese" });
    repo.saveProject(project);
    store.create({ id: "tts-job-01", projectId: project.id, state: "running", payload: { provider: "edge-tts" }, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }, [
      { id: "tts-segment-success", jobId: "tts-job-01", order: 0, state: "success", payload: { segmentId: "section-success", relativeFilePath: "voice/success.mp3" }, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "tts-segment-running", jobId: "tts-job-01", order: 1, state: "running", payload: { segmentId: "section-running", text: "Interrupted text" }, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "tts-segment-queued", jobId: "tts-job-01", order: 2, state: "queued", payload: { segmentId: "section-queued", text: "Queued text" }, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }
    ]);
    store.create({ id: "tts-job-queued", state: "queued", payload: { provider: "edge-tts" }, createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" }, []);

    expect(store.recoverInterruptedJobs()).toBe(1);
    expect(store.get("tts-job-01")?.job).toMatchObject({ state: "failed", payload: { errorCode: "interrupted", errorMessage: expect.stringContaining("previous application session") } });
    expect(store.get("tts-job-01")?.segments).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "tts-segment-success", state: "success", payload: expect.objectContaining({ segmentId: "section-success", relativeFilePath: "voice/success.mp3" }) }),
      expect.objectContaining({ id: "tts-segment-running", state: "failed", payload: expect.objectContaining({ segmentId: "section-running", text: "Interrupted text", errorCode: "interrupted" }) }),
      expect.objectContaining({ id: "tts-segment-queued", state: "failed", payload: expect.objectContaining({ segmentId: "section-queued", text: "Queued text", errorCode: "interrupted" }) })
    ]));
    expect(store.get("tts-job-queued")?.job.state).toBe("queued");
    expect(store.listFailed().map((job) => job.id)).toContain("tts-job-01");
    expect(store.listFailed().map((job) => job.id)).not.toContain("tts-job-queued");
    expect(store.latestForProject(project.id)?.id).toBe("tts-job-01");
    db.close();
  });

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

  it("loads text certification only for the exact current provider configuration", () => {
    const { db } = openTemp();
    const store = new TextCertificationStore(db);
    const record = {
      id: "text-cert-1",
      providerId: "9router" as const,
      configuredModelId: "model-a",
      returnedModelId: "model-a",
      baseUrlFingerprint: "a".repeat(64),
      credentialVersionRef: "credential-version-1",
      endpointStrategy: "responses" as const,
      implementationVersion: "text-certification-v1" as const,
      exactTextTest: { status: "passed" as const, latencyMs: 10 },
      strictJsonTest: { status: "passed" as const, latencyMs: 12 },
      overallStatus: "verified" as const,
      testedAt: "2026-07-30T00:00:00.000Z"
    };
    store.saveTextCertificationRecord(record);

    expect(store.loadLatestMatchingTextCertification({
      providerId: "9router",
      configuredModelId: "model-a",
      baseUrlFingerprint: "a".repeat(64),
      credentialVersionRef: "credential-version-1",
      endpointStrategy: "responses",
      implementationVersion: "text-certification-v1"
    })?.overallStatus).toBe("verified");
    expect(store.loadLatestMatchingTextCertification({
      providerId: "9router",
      configuredModelId: "model-b",
      baseUrlFingerprint: "a".repeat(64),
      credentialVersionRef: "credential-version-1",
      endpointStrategy: "responses",
      implementationVersion: "text-certification-v1"
    })).toBeNull();
    expect(store.markTextCertificationsStale("9router")).toBe(1);
    expect(store.loadLatestTextCertification("9router")?.overallStatus).toBe("stale");
    db.close();
  });

  it("marks image certifications stale without duplicating primary keys", () => {
    const { db } = openTemp();
    const store = new ImageCertificationStore(db);
    store.save({
      id: "image-cert-1",
      providerId: "9router",
      configuredModelId: "image-model-a",
      baseUrlFingerprint: "b".repeat(64),
      credentialVersionRef: "credential-version-1",
      endpointStrategy: "images-generations",
      implementationVersion: "image-certification-v1",
      imageResponseTest: { status: "passed", latencyMs: 10 },
      overallStatus: "verified",
      testedAt: "2026-07-30T00:00:00.000Z"
    });

    store.markStale();

    expect(store.loadLatest()?.overallStatus).toBe("stale");
    expect(db.prepare("SELECT COUNT(*) AS count FROM image_model_certifications").get()).toEqual({ count: 1 });
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

  it("persists custom channel profiles through create, update, and delete operations", () => {
    const { db, repo } = openTemp();
    const template = repo.listChannelProfiles()[0]!;
    const custom = { ...template, id: "channel-custom", name: "Custom Finance Lab", mainKeyword: "cash flow" };
    repo.saveChannelProfile(custom);
    expect(repo.loadChannelProfile(custom.id)?.name).toBe("Custom Finance Lab");

    const updated = { ...custom, name: "Updated Finance Lab", channelDna: createDefaultChannelDna({ name: "Updated Finance Lab", styleId: "motion-collage" }) };
    repo.saveChannelProfile(updated);
    expect(repo.loadChannelProfile(custom.id)?.channelDna?.visualStyle.styleId).toBe("motion-collage");

    repo.deleteChannelProfile(custom.id);
    expect(repo.loadChannelProfile(custom.id)).toBeUndefined();
    db.close();
  });

  it("persists synthetic project markers and records guarded approval metadata", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "synthetic approval audit", format: "short", targetLanguage: "English", synthetic: true });
    repo.saveProject(project);
    expect(repo.loadProject(project.id)?.synthetic).toBe(true);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({
      id: "run-synthetic-approval", projectId: project.id, stageId: "reference-validation", status: "needs_review",
      runnerId: "reference-validation-local", runnerVersion: "v1", inputArtifactIds: [],
      inputFingerprint: "s".repeat(64), outputArtifactIds: ["artifact-synthetic-approval"], startedAt: now, finishedAt: now
    }, {
      id: "artifact-synthetic-approval", projectId: project.id, stageId: "reference-validation", stageRunId: "run-synthetic-approval",
      type: "reference-set.validated", version: 1, status: "needs_review", payloadJson: { valid: true }, createdAt: now, updatedAt: now
    });
    const previous = process.env.LSF_MAIN_FLOW_SYNTHETIC_APPROVALS;
    process.env.LSF_MAIN_FLOW_SYNTHETIC_APPROVALS = "1";
    try {
      store.approveReviewRun("run-synthetic-approval");
    } finally {
      if (previous === undefined) delete process.env.LSF_MAIN_FLOW_SYNTHETIC_APPROVALS;
      else process.env.LSF_MAIN_FLOW_SYNTHETIC_APPROVALS = previous;
    }
    expect(store.listRuns(project.id, "reference-validation")[0]?.payloadJson?.approval).toMatchObject({
      actor: "main-flow-test-agent", mode: "synthetic-regression", isUserApproval: false
    });
    db.close();
  });

  it("records system automatic approval metadata only for Semi-automatic intermediate stages", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "automatic approval audit", format: "short", targetLanguage: "English", workflowMode: "semi_automatic" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({
      id: "run-shot-plan-approved", projectId: project.id, stageId: "shot-plan", status: "approved",
      runnerId: "shot-plan-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "u".repeat(64), outputArtifactIds: ["artifact-shot-plan-approved"], startedAt: now, finishedAt: now
    }, {
      id: "artifact-shot-plan-approved", projectId: project.id, stageId: "shot-plan", stageRunId: "run-shot-plan-approved",
      type: "shot-plan", version: 1, status: "approved", payloadJson: { shots: [] }, createdAt: now, updatedAt: now
    });
    store.completeRun({
      id: "run-visual-routing-automatic", projectId: project.id, stageId: "visual-routing", status: "needs_review",
      runnerId: "visual-routing-local", runnerVersion: "v1", inputArtifactIds: ["artifact-shot-plan-approved"], inputFingerprint: "v".repeat(64), outputArtifactIds: ["artifact-visual-routing-automatic"], startedAt: now, finishedAt: now
    }, {
      id: "artifact-visual-routing-automatic", projectId: project.id, stageId: "visual-routing", stageRunId: "run-visual-routing-automatic",
      type: "visual-routing", version: 1, status: "needs_review", payloadJson: { shots: [] }, createdAt: now, updatedAt: now
    });
    store.approveReviewRun("run-visual-routing-automatic");
    expect(store.listRuns(project.id, "visual-routing")[0]?.payloadJson?.approval).toMatchObject({
      approvedBy: "system", approvalMode: "automatic", actor: "system", mode: "automatic", isUserApproval: false
    });
    db.close();
  });

  it("records system automatic approval metadata for valid Reference Validation", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "reference validation approval", format: "short", targetLanguage: "English", workflowMode: "semi_automatic" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({
      id: "run-reference-validation-automatic", projectId: project.id, stageId: "reference-validation", status: "needs_review",
      runnerId: "reference-validation-local", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "r".repeat(64), outputArtifactIds: ["artifact-reference-validation-automatic"], startedAt: now, finishedAt: now
    }, {
      id: "artifact-reference-validation-automatic", projectId: project.id, stageId: "reference-validation", stageRunId: "run-reference-validation-automatic",
      type: "reference-set.validated", version: 1, status: "needs_review", payloadJson: {}, createdAt: now, updatedAt: now
    });
    store.approveReviewRun("run-reference-validation-automatic");
    expect(store.listRuns(project.id, "reference-validation")[0]?.payloadJson?.approval).toMatchObject({
      approvedBy: "system", approvalMode: "automatic", actor: "system", mode: "automatic", isUserApproval: false
    });
    db.close();
  });

  it("allows Topic Mode Idea Lab approval without reference input artifacts", () => {
    const { db, repo } = openTemp();
    const topicProject = createFixtureProject({ topic: "topic idea approval", format: "short", targetLanguage: "Vietnamese", inputMode: "topic" });
    repo.saveProject(topicProject);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({
      id: "run-topic-idea-approval", projectId: topicProject.id, stageId: "idea-lab", status: "needs_review",
      runnerId: "idea-lab-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "t".repeat(64), outputArtifactIds: ["artifact-topic-idea-approval"], startedAt: now, finishedAt: now
    }, {
      id: "artifact-topic-idea-approval", projectId: topicProject.id, stageId: "idea-lab", stageRunId: "run-topic-idea-approval",
      type: "idea-candidates", version: 1, status: "needs_review", payloadJson: { candidates: [] }, createdAt: now, updatedAt: now
    });

    expect(() => store.approveReviewRun("run-topic-idea-approval")).not.toThrow();
    expect(store.listRuns(topicProject.id, "idea-lab")[0]?.status).toBe("approved");

    const referenceProject = createFixtureProject({ topic: "reference idea approval", format: "short", targetLanguage: "Vietnamese", inputMode: "reference" });
    repo.saveProject(referenceProject);
    store.completeRun({
      id: "run-reference-idea-approval", projectId: referenceProject.id, stageId: "idea-lab", status: "needs_review",
      runnerId: "idea-lab-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "r".repeat(64), outputArtifactIds: ["artifact-reference-idea-approval"], startedAt: now, finishedAt: now
    }, {
      id: "artifact-reference-idea-approval", projectId: referenceProject.id, stageId: "idea-lab", stageRunId: "run-reference-idea-approval",
      type: "idea-candidates", version: 1, status: "needs_review", payloadJson: { candidates: [] }, createdAt: now, updatedAt: now
    });

    expect(() => store.approveReviewRun("run-reference-idea-approval")).toThrow("Stage run inputs are no longer approved.");
    db.close();
  });

  it("scopes project row ids while preserving domain ids in payloads", () => {
    const { db, repo } = openTemp();
    const scriptSection = {
      id: "section-hook",
      purpose: "Open the topic",
      narration: "Narration",
      estimatedWords: 1,
      estimatedSeconds: 1,
      dramaticFunction: "Create curiosity",
      linkedClaimIds: [],
      visualOpportunities: [],
      proofObjects: [],
      retentionRisk: "low" as const
    };
    const scene = {
      id: "scene-hook",
      scriptSectionId: scriptSection.id,
      narration: scriptSection.narration,
      purpose: "Open the topic",
      startFrame: 0,
      durationFrames: 30,
      visualMode: "document" as const,
      emotionalState: "curious",
      requiredAssets: [],
      continuityRefs: []
    };
    const shot = {
      id: "shot-hook",
      sceneId: scene.id,
      order: 0,
      startFrame: 0,
      durationFrames: 30,
      fps: 30,
      purpose: "Open the topic",
      visualMode: "document" as const,
      framing: "wide",
      cameraAngle: "front",
      cameraMovement: "static",
      subjectAction: "none",
      startState: {},
      endState: {},
      continuityRefs: []
    };
    const first = { ...createFixtureProject({ topic: "first scoped project", format: "short", targetLanguage: "English" }), scriptSections: [scriptSection], scenes: [scene], shots: [shot] };
    const second = { ...createFixtureProject({ topic: "second scoped project", format: "short", targetLanguage: "English" }), scriptSections: [scriptSection], scenes: [scene], shots: [shot] };

    expect(() => {
      repo.saveProject(first);
      repo.saveProject(second);
    }).not.toThrow();
    expect(repo.loadProject(first.id)?.scenes.map((item) => item.id)).toEqual([scene.id]);
    expect(repo.loadProject(second.id)?.shots.map((item) => item.id)).toEqual([shot.id]);
    expect(db.prepare("SELECT COUNT(*) AS count FROM scenes").get()).toEqual({ count: 2 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM shots").get()).toEqual({ count: 2 });
    db.close();
  });

  it("persists exact stage attention for a blocked automatic approval", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "automatic attention audit", format: "short", targetLanguage: "English", workflowMode: "semi_automatic" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({
      id: "run-fact-attention", projectId: project.id, stageId: "fact-review", status: "needs_review",
      runnerId: "fact-review-local", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "a".repeat(64), outputArtifactIds: ["artifact-fact-attention"], startedAt: now, finishedAt: now
    }, {
      id: "artifact-fact-attention", projectId: project.id, stageId: "fact-review", stageRunId: "run-fact-attention",
      type: "fact-review", version: 1, status: "needs_review", payloadJson: { findings: [] }, createdAt: now, updatedAt: now
    });
    store.markReviewAttention("run-fact-attention", "AUTO_APPROVAL_BLOCKED", "Blocked fact-review findings must be resolved.");
    expect(store.listRuns(project.id, "fact-review")[0]).toMatchObject({ status: "needs_attention", safeErrorCategory: "AUTO_APPROVAL_BLOCKED" });
    expect(store.listArtifacts(project.id, "fact-review")[0]?.status).toBe("needs_attention");
    expect(repo.loadProject(project.id)?.stages.find((stage) => stage.id === "fact-review")).toMatchObject({
      status: "needs_attention",
      attention: {
        code: "AUTO_APPROVAL_BLOCKED",
        message: "Blocked fact-review findings must be resolved.",
        phase: "Fact Review",
        safeReason: "Blocked fact-review findings must be resolved.",
        recommendedAction: "Review stage",
        retryAction: "Retry stage",
        actions: [
          { label: "Review stage", route: "script" },
          { label: "Retry stage", route: "script" }
        ]
      }
    });
    db.close();
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
    expect(store.getArtifact(project.id, "artifact-1")).toMatchObject({ id: "artifact-1", status: "needs_review" });
    expect(store.getArtifact(project.id, "missing-artifact")).toBeNull();
    store.approveReviewRun("run-1");
    expect(store.listRuns(project.id, "reference-validation")[0]?.status).toBe("approved");
    expect(store.listArtifacts(project.id, "reference-validation")[0]?.status).toBe("approved");
    store.markProjectArtifactsStale(project.id);
    expect(store.listRuns(project.id, "reference-validation")[0]?.status).toBe("stale");
    expect(store.listArtifacts(project.id, "reference-validation")[0]?.status).toBe("stale");
    db.close();
  });

  it("approves reference validation runs with raw reference inputs", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "reference raw input approval", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({
      id: "run-reference-validation", projectId: project.id, stageId: "reference-validation", status: "needs_review",
      runnerId: "reference-validation-local", runnerVersion: "v1", inputArtifactIds: ["reference-raw-1"],
      inputFingerprint: "d".repeat(64), outputArtifactIds: ["artifact-reference-validation"], startedAt: now, finishedAt: now
    }, {
      id: "artifact-reference-validation", projectId: project.id, stageId: "reference-validation", stageRunId: "run-reference-validation",
      type: "reference-set.validated", version: 1, status: "needs_review", payloadJson: { valid: true }, createdAt: now, updatedAt: now
    });
    store.approveReviewRun("run-reference-validation");
    expect(store.listRuns(project.id, "reference-validation")[0]?.status).toBe("approved");
    expect(store.listArtifacts(project.id, "reference-validation")[0]?.status).toBe("approved");
    db.close();
  });

  it("rejects duplicate pending stage runs for the same input fingerprint", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "duplicate run guard", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.createRun({ id: "run-original", projectId: project.id, stageId: "transcript-cleaning", status: "running", runnerId: "transcript-cleaning-9router", runnerVersion: "transcript-cleaning-v3", inputArtifactIds: [], inputFingerprint: "c".repeat(64), outputArtifactIds: [], startedAt: now });
    expect(() => store.createRun({ id: "run-duplicate", projectId: project.id, stageId: "transcript-cleaning", status: "running", runnerId: "transcript-cleaning-9router", runnerVersion: "transcript-cleaning-v3", inputArtifactIds: [], inputFingerprint: "c".repeat(64), outputArtifactIds: [], startedAt: now })).toThrow("A pending or accepted stage run already exists for this input.");
    expect(store.listRuns(project.id, "transcript-cleaning")).toHaveLength(1);
    db.close();
  });

  it("rejects a second active Transcript Cleaning run for the same reference", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "duplicate reference run guard", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.createRun({
      id: "run-reference-original", projectId: project.id, stageId: "transcript-cleaning", status: "running",
      runnerId: "transcript-cleaning-9router", runnerVersion: "transcript-cleaning-v3", inputArtifactIds: [],
      inputFingerprint: "f".repeat(64), outputArtifactIds: [], payloadJson: { referenceId: "reference-01" }, startedAt: now
    });
    expect(() => store.createRun({
      id: "run-reference-duplicate", projectId: project.id, stageId: "transcript-cleaning", status: "running",
      runnerId: "transcript-cleaning-9router", runnerVersion: "transcript-cleaning-v3", inputArtifactIds: [],
      inputFingerprint: "g".repeat(64), outputArtifactIds: [], payloadJson: { referenceId: "reference-01" }, startedAt: now
    })).toThrow("A pending or accepted stage run already exists for this input.");
    expect(store.listRuns(project.id, "transcript-cleaning")).toHaveLength(1);
    db.close();
  });

  it("allows rerun after a failed stage run with the same input fingerprint", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "failed rerun guard", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.createRun({ id: "run-failed-input", projectId: project.id, stageId: "script", status: "failed", runnerId: "script-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "e".repeat(64), outputArtifactIds: [], startedAt: now, finishedAt: now, safeErrorCategory: "provider_failed", safeErrorMessage: "Script failed." });
    store.createRun({ id: "run-retry-input", projectId: project.id, stageId: "script", status: "running", runnerId: "script-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "e".repeat(64), outputArtifactIds: [], startedAt: now });
    expect(store.listRuns(project.id, "script")).toHaveLength(2);
    db.close();
  });

  it("rejects a duplicate run when any older matching run is still pending", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "older duplicate guard", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.createRun({ id: "run-older-running", projectId: project.id, stageId: "script", status: "running", runnerId: "script-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "f".repeat(64), outputArtifactIds: [], startedAt: now });
    db.prepare("INSERT INTO workflow_stage_runs (id, project_id, stage_id, status, runner_id, runner_version, provider_id, configured_model_id, returned_model_id, prompt_template_id, prompt_version, input_artifact_ids_json, input_fingerprint, output_artifact_ids_json, safe_error_category, safe_error_message, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("run-newer-failed", project.id, "script", "failed", "script-9router", "v1", null, null, null, null, null, "[]", "f".repeat(64), "[]", "provider_failed", "Script failed.", now, now);
    expect(store.findLatestByInput(project.id, "script", "f".repeat(64))?.id).toBe("run-newer-failed");
    expect(() => store.createRun({ id: "run-duplicate-after-failed", projectId: project.id, stageId: "script", status: "running", runnerId: "script-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "f".repeat(64), outputArtifactIds: [], startedAt: now })).toThrow("A pending or accepted stage run already exists for this input.");
    expect(store.listRuns(project.id, "script")).toHaveLength(2);
    db.close();
  });

  it("rejects workflow artifacts that do not match their stage run", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "artifact mismatch", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    const run = {
      id: "run-mismatch", projectId: project.id, stageId: "outline", status: "needs_review" as const,
      runnerId: "outline-9router", runnerVersion: "v1", inputArtifactIds: [],
      inputFingerprint: "8".repeat(64), outputArtifactIds: ["artifact-mismatch"], startedAt: now, finishedAt: now
    };
    const artifact = {
      id: "artifact-mismatch", projectId: project.id, stageId: "script", stageRunId: run.id,
      type: "outline", version: 1, status: "needs_review" as const, payloadJson: { sections: [] }, createdAt: now, updatedAt: now
    };
    expect(() => store.completeRun(run, artifact)).toThrow("Workflow artifact does not match its stage run.");
    expect(store.listRuns(project.id, "outline")).toHaveLength(0);
    expect(() => store.completeRun(run, { ...artifact, stageId: "outline", status: "approved" })).toThrow("Review stage runs must create review artifacts.");
    expect(store.listRuns(project.id, "outline")).toHaveLength(0);
    expect(() => store.completeRun({ ...run, outputArtifactIds: ["different-artifact"] }, { ...artifact, stageId: "outline" })).toThrow("Stage run output artifact IDs must include the saved artifact.");
    expect(store.listRuns(project.id, "outline")).toHaveLength(0);
    db.close();
  });

  it("rejects a review artifact without deleting its immutable run history", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "review revision", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({ id: "run-reject", projectId: project.id, stageId: "visual-routing", status: "needs_review", runnerId: "visual-routing-local", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "b".repeat(64), outputArtifactIds: ["artifact-reject"], startedAt: now, finishedAt: now }, { id: "artifact-reject", projectId: project.id, stageId: "visual-routing", stageRunId: "run-reject", type: "visual-routing", version: 1, status: "needs_review", payloadJson: { shots: [] }, createdAt: now, updatedAt: now });
    store.rejectReviewRun("run-reject");
    expect(store.listRuns(project.id, "visual-routing")[0]).toMatchObject({ id: "run-reject", status: "rejected" });
    expect(store.listArtifacts(project.id, "visual-routing")[0]).toMatchObject({ id: "artifact-reject", status: "rejected" });
    db.close();
  });

  it("allows rerun after a rejected review run with the same input fingerprint", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "rejected rerun guard", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    const inputFingerprint = "7".repeat(64);
    store.completeRun({ id: "run-rejected-input", projectId: project.id, stageId: "outline", status: "needs_review", runnerId: "outline-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint, outputArtifactIds: ["artifact-rejected-input"], startedAt: now, finishedAt: now }, { id: "artifact-rejected-input", projectId: project.id, stageId: "outline", stageRunId: "run-rejected-input", type: "outline", version: 1, status: "needs_review", payloadJson: { sections: [] }, createdAt: now, updatedAt: now });
    store.rejectReviewRun("run-rejected-input");
    store.createRun({ id: "run-retry-rejected-input", projectId: project.id, stageId: "outline", status: "running", runnerId: "outline-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint, outputArtifactIds: [], startedAt: now });
    expect(store.listRuns(project.id, "outline")).toHaveLength(2);
    db.close();
  });

  it("does not approve or reject a review run without a review artifact", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "missing review artifact", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.createRun({ id: "run-no-artifact", projectId: project.id, stageId: "reference-validation", status: "needs_review", runnerId: "reference-validation-local", runnerVersion: "v1", inputArtifactIds: ["reference-raw-1"], inputFingerprint: "9".repeat(64), outputArtifactIds: [], startedAt: now, finishedAt: now });
    expect(() => store.approveReviewRun("run-no-artifact")).toThrow("Stage run must have exactly one review artifact awaiting review.");
    expect(store.listRuns(project.id, "reference-validation")[0]).toMatchObject({ id: "run-no-artifact", status: "needs_review" });
    expect(() => store.rejectReviewRun("run-no-artifact")).toThrow("Stage run must have exactly one review artifact awaiting review.");
    expect(store.listRuns(project.id, "reference-validation")[0]).toMatchObject({ id: "run-no-artifact", status: "needs_review" });
    db.close();
  });

  it("does not approve dependent stage runs with no input artifacts", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "missing input artifacts", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({
      id: "run-no-input-artifacts", projectId: project.id, stageId: "outline", status: "needs_review",
      runnerId: "outline-9router", runnerVersion: "v1", inputArtifactIds: [],
      inputFingerprint: "6".repeat(64), outputArtifactIds: ["artifact-no-input-artifacts"], startedAt: now, finishedAt: now
    }, {
      id: "artifact-no-input-artifacts", projectId: project.id, stageId: "outline", stageRunId: "run-no-input-artifacts",
      type: "outline", version: 1, status: "needs_review", payloadJson: { sections: [] }, createdAt: now, updatedAt: now
    });
    expect(() => store.approveReviewRun("run-no-input-artifacts")).toThrow("Stage run inputs are no longer approved.");
    expect(store.listRuns(project.id, "outline")[0]).toMatchObject({ id: "run-no-input-artifacts", status: "needs_review" });
    expect(store.listArtifacts(project.id, "outline")[0]).toMatchObject({ id: "artifact-no-input-artifacts", status: "needs_review" });
    db.close();
  });

  it("does not approve a review run with duplicate review artifacts", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "duplicate review artifacts", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({ id: "run-upstream-review", projectId: project.id, stageId: "outline", status: "approved", runnerId: "outline-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "6".repeat(64), outputArtifactIds: ["approved-upstream-review"], startedAt: now, finishedAt: now }, { id: "approved-upstream-review", projectId: project.id, stageId: "outline", stageRunId: "run-upstream-review", type: "outline", version: 1, status: "approved", payloadJson: { sections: [] }, createdAt: now, updatedAt: now });
    store.completeRun({ id: "run-duplicate-review", projectId: project.id, stageId: "script", status: "needs_review", runnerId: "script-9router", runnerVersion: "v1", inputArtifactIds: ["approved-upstream-review"], inputFingerprint: "7".repeat(64), outputArtifactIds: ["artifact-review-1"], startedAt: now, finishedAt: now }, { id: "artifact-review-1", projectId: project.id, stageId: "script", stageRunId: "run-duplicate-review", type: "script", version: 1, status: "needs_review", payloadJson: { sections: [] }, createdAt: now, updatedAt: now });
    db.prepare("INSERT INTO workflow_artifacts (id, project_id, stage_id, stage_run_id, type, version, status, payload_json, relative_file_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("artifact-review-2", project.id, "script", "run-duplicate-review", "script", 2, "needs_review", JSON.stringify({ sections: [] }), null, now, now);
    expect(() => store.approveReviewRun("run-duplicate-review")).toThrow("Stage run must have exactly one review artifact awaiting review.");
    expect(store.listRuns(project.id, "script")[0]).toMatchObject({ id: "run-duplicate-review", status: "needs_review" });
    expect(store.listArtifacts(project.id, "script").filter((artifact) => artifact.status === "needs_review")).toHaveLength(2);
    db.close();
  });

  it("does not reject a review run with duplicate review artifacts", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "duplicate reject artifacts", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({ id: "run-upstream-reject", projectId: project.id, stageId: "outline", status: "approved", runnerId: "outline-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "5".repeat(64), outputArtifactIds: ["approved-upstream-reject"], startedAt: now, finishedAt: now }, { id: "approved-upstream-reject", projectId: project.id, stageId: "outline", stageRunId: "run-upstream-reject", type: "outline", version: 1, status: "approved", payloadJson: { sections: [] }, createdAt: now, updatedAt: now });
    store.completeRun({ id: "run-duplicate-reject", projectId: project.id, stageId: "script", status: "needs_review", runnerId: "script-9router", runnerVersion: "v1", inputArtifactIds: ["approved-upstream-reject"], inputFingerprint: "8".repeat(64), outputArtifactIds: ["artifact-reject-1"], startedAt: now, finishedAt: now }, { id: "artifact-reject-1", projectId: project.id, stageId: "script", stageRunId: "run-duplicate-reject", type: "script", version: 1, status: "needs_review", payloadJson: { sections: [] }, createdAt: now, updatedAt: now });
    db.prepare("INSERT INTO workflow_artifacts (id, project_id, stage_id, stage_run_id, type, version, status, payload_json, relative_file_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("artifact-reject-2", project.id, "script", "run-duplicate-reject", "script", 2, "needs_review", JSON.stringify({ sections: [] }), null, now, now);
    expect(() => store.rejectReviewRun("run-duplicate-reject")).toThrow("Stage run must have exactly one review artifact awaiting review.");
    expect(store.listRuns(project.id, "script")[0]).toMatchObject({ id: "run-duplicate-reject", status: "needs_review" });
    expect(store.listArtifacts(project.id, "script").filter((artifact) => artifact.status === "needs_review")).toHaveLength(2);
    db.close();
  });

  it("does not approve a review run after an input artifact becomes stale", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "stale input approval", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({ id: "run-upstream", projectId: project.id, stageId: "outline", status: "approved", runnerId: "outline-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "1".repeat(64), outputArtifactIds: ["approved-upstream"], startedAt: now, finishedAt: now }, { id: "approved-upstream", projectId: project.id, stageId: "outline", stageRunId: "run-upstream", type: "outline", version: 1, status: "approved", payloadJson: { sections: [] }, createdAt: now, updatedAt: now });
    store.completeRun({ id: "run-downstream", projectId: project.id, stageId: "script", status: "needs_review", runnerId: "script-9router", runnerVersion: "v1", inputArtifactIds: ["approved-upstream"], inputFingerprint: "2".repeat(64), outputArtifactIds: ["artifact-downstream"], startedAt: now, finishedAt: now }, { id: "artifact-downstream", projectId: project.id, stageId: "script", stageRunId: "run-downstream", type: "script", version: 1, status: "needs_review", payloadJson: { sections: [] }, createdAt: now, updatedAt: now });
    db.prepare("UPDATE workflow_artifacts SET status = 'stale' WHERE id = ?").run("approved-upstream");
    expect(() => store.approveReviewRun("run-downstream")).toThrow("Stage run inputs are no longer approved.");
    expect(store.listRuns(project.id, "script")[0]).toMatchObject({ id: "run-downstream", status: "needs_review" });
    expect(store.listArtifacts(project.id, "script")[0]).toMatchObject({ id: "artifact-downstream", status: "needs_review" });
    db.close();
  });

  it("does not approve a review run when an input artifact is missing", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "missing input approval", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({ id: "run-missing-input", projectId: project.id, stageId: "script", status: "needs_review", runnerId: "script-9router", runnerVersion: "v1", inputArtifactIds: ["missing-upstream"], inputFingerprint: "3".repeat(64), outputArtifactIds: ["artifact-missing-input"], startedAt: now, finishedAt: now }, { id: "artifact-missing-input", projectId: project.id, stageId: "script", stageRunId: "run-missing-input", type: "script", version: 1, status: "needs_review", payloadJson: { sections: [] }, createdAt: now, updatedAt: now });
    expect(() => store.approveReviewRun("run-missing-input")).toThrow("Stage run inputs are no longer approved.");
    expect(store.listRuns(project.id, "script")[0]).toMatchObject({ id: "run-missing-input", status: "needs_review" });
    expect(store.listArtifacts(project.id, "script")[0]).toMatchObject({ id: "artifact-missing-input", status: "needs_review" });
    db.close();
  });

  it("does not approve a review run when an input artifact run is not approved", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "stale input run approval", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({ id: "run-upstream-stale", projectId: project.id, stageId: "outline", status: "approved", runnerId: "outline-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "4".repeat(64), outputArtifactIds: ["approved-stale-run"], startedAt: now, finishedAt: now }, { id: "approved-stale-run", projectId: project.id, stageId: "outline", stageRunId: "run-upstream-stale", type: "outline", version: 1, status: "approved", payloadJson: { sections: [] }, createdAt: now, updatedAt: now });
    store.completeRun({ id: "run-downstream-stale-run", projectId: project.id, stageId: "script", status: "needs_review", runnerId: "script-9router", runnerVersion: "v1", inputArtifactIds: ["approved-stale-run"], inputFingerprint: "5".repeat(64), outputArtifactIds: ["artifact-stale-run"], startedAt: now, finishedAt: now }, { id: "artifact-stale-run", projectId: project.id, stageId: "script", stageRunId: "run-downstream-stale-run", type: "script", version: 1, status: "needs_review", payloadJson: { sections: [] }, createdAt: now, updatedAt: now });
    db.prepare("UPDATE workflow_stage_runs SET status = 'stale' WHERE id = ?").run("run-upstream-stale");
    expect(() => store.approveReviewRun("run-downstream-stale-run")).toThrow("Stage run inputs are no longer approved.");
    expect(store.listRuns(project.id, "script")[0]).toMatchObject({ id: "run-downstream-stale-run", status: "needs_review" });
    expect(store.listArtifacts(project.id, "script")[0]).toMatchObject({ id: "artifact-stale-run", status: "needs_review" });
    db.close();
  });

  it("does not approve a review run when an input artifact is missing from its run outputs", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "detached input approval", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({ id: "run-upstream-detached", projectId: project.id, stageId: "outline", status: "approved", runnerId: "outline-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "6".repeat(64), outputArtifactIds: ["approved-detached"], startedAt: now, finishedAt: now }, { id: "approved-detached", projectId: project.id, stageId: "outline", stageRunId: "run-upstream-detached", type: "outline", version: 1, status: "approved", payloadJson: { sections: [] }, createdAt: now, updatedAt: now });
    store.completeRun({ id: "run-downstream-detached", projectId: project.id, stageId: "script", status: "needs_review", runnerId: "script-9router", runnerVersion: "v1", inputArtifactIds: ["approved-detached"], inputFingerprint: "0".repeat(64), outputArtifactIds: ["artifact-detached"], startedAt: now, finishedAt: now }, { id: "artifact-detached", projectId: project.id, stageId: "script", stageRunId: "run-downstream-detached", type: "script", version: 1, status: "needs_review", payloadJson: { sections: [] }, createdAt: now, updatedAt: now });
    db.prepare("UPDATE workflow_stage_runs SET output_artifact_ids_json = ? WHERE id = ?").run(JSON.stringify(["different-artifact"]), "run-upstream-detached");
    expect(() => store.approveReviewRun("run-downstream-detached")).toThrow("Stage run inputs are no longer approved.");
    expect(store.listRuns(project.id, "script")[0]).toMatchObject({ id: "run-downstream-detached", status: "needs_review" });
    expect(store.listArtifacts(project.id, "script")[0]).toMatchObject({ id: "artifact-detached", status: "needs_review" });
    db.close();
  });

  it("does not approve a review run when an input artifact is no longer current", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "old input approval", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({ id: "run-outline-old", projectId: project.id, stageId: "outline", status: "approved", runnerId: "outline-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "a".repeat(64), outputArtifactIds: ["outline-old"], startedAt: now, finishedAt: now }, { id: "outline-old", projectId: project.id, stageId: "outline", stageRunId: "run-outline-old", type: "outline", version: 1, status: "approved", payloadJson: { sections: [] }, createdAt: now, updatedAt: now });
    store.completeRun({ id: "run-outline-new", projectId: project.id, stageId: "outline", status: "approved", runnerId: "outline-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "b".repeat(64), outputArtifactIds: ["outline-new"], startedAt: now, finishedAt: now }, { id: "outline-new", projectId: project.id, stageId: "outline", stageRunId: "run-outline-new", type: "outline", version: 2, status: "approved", payloadJson: { sections: [] }, createdAt: now, updatedAt: now });
    store.completeRun({ id: "run-script-old-input", projectId: project.id, stageId: "script", status: "needs_review", runnerId: "script-9router", runnerVersion: "v1", inputArtifactIds: ["outline-old"], inputFingerprint: "c".repeat(64), outputArtifactIds: ["script-old-input"], startedAt: now, finishedAt: now }, { id: "script-old-input", projectId: project.id, stageId: "script", stageRunId: "run-script-old-input", type: "script", version: 1, status: "needs_review", payloadJson: { sections: [] }, createdAt: now, updatedAt: now });
    expect(() => store.approveReviewRun("run-script-old-input")).toThrow("Stage run inputs are no longer approved.");
    expect(store.listRuns(project.id, "script")[0]).toMatchObject({ id: "run-script-old-input", status: "needs_review" });
    expect(store.listArtifacts(project.id, "script")[0]).toMatchObject({ id: "script-old-input", status: "needs_review" });
    db.close();
  });

  it("does not approve a later review run when an upstream script input is no longer current", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "later review stale script", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({ id: "run-outline-current", projectId: project.id, stageId: "outline", status: "approved", runnerId: "outline-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "aa".padEnd(64, "0"), outputArtifactIds: ["outline-current"], startedAt: now, finishedAt: now }, { id: "outline-current", projectId: project.id, stageId: "outline", stageRunId: "run-outline-current", type: "outline", version: 1, status: "approved", payloadJson: { sections: [] }, createdAt: now, updatedAt: now });
    store.completeRun({ id: "run-script-old", projectId: project.id, stageId: "script", status: "approved", runnerId: "script-9router", runnerVersion: "v1", inputArtifactIds: ["outline-current"], inputFingerprint: "bb".padEnd(64, "0"), outputArtifactIds: ["script-old"], startedAt: now, finishedAt: now }, { id: "script-old", projectId: project.id, stageId: "script", stageRunId: "run-script-old", type: "script", version: 1, status: "approved", payloadJson: { sections: [] }, createdAt: now, updatedAt: now });
    store.completeRun({ id: "run-script-new", projectId: project.id, stageId: "script", status: "approved", runnerId: "script-9router", runnerVersion: "v1", inputArtifactIds: ["outline-current"], inputFingerprint: "cc".padEnd(64, "0"), outputArtifactIds: ["script-new"], startedAt: now, finishedAt: now }, { id: "script-new", projectId: project.id, stageId: "script", stageRunId: "run-script-new", type: "script", version: 2, status: "approved", payloadJson: { sections: [] }, createdAt: now, updatedAt: now });
    store.completeRun({ id: "run-fact-review-old-script", projectId: project.id, stageId: "fact-review", status: "needs_review", runnerId: "fact-review-local", runnerVersion: "v1", inputArtifactIds: ["script-old"], inputFingerprint: "dd".padEnd(64, "0"), outputArtifactIds: ["fact-review-old-script"], startedAt: now, finishedAt: now }, { id: "fact-review-old-script", projectId: project.id, stageId: "fact-review", stageRunId: "run-fact-review-old-script", type: "fact-review", version: 1, status: "needs_review", payloadJson: { reviewer: "local_deterministic", findings: [] }, createdAt: now, updatedAt: now });
    expect(() => store.approveReviewRun("run-fact-review-old-script")).toThrow("Stage run inputs are no longer approved.");
    expect(store.listRuns(project.id, "fact-review")[0]).toMatchObject({ id: "run-fact-review-old-script", status: "needs_review" });
    expect(store.listArtifacts(project.id, "fact-review")[0]).toMatchObject({ id: "fact-review-old-script", status: "needs_review" });
    db.close();
  });

  it("does not approve a scene plan when its fact-review input is backed by an old script", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "scene plan stale fact review", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({ id: "run-outline-for-scene-plan", projectId: project.id, stageId: "outline", status: "approved", runnerId: "outline-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "ee".padEnd(64, "0"), outputArtifactIds: ["outline-for-scene-plan"], startedAt: now, finishedAt: now }, { id: "outline-for-scene-plan", projectId: project.id, stageId: "outline", stageRunId: "run-outline-for-scene-plan", type: "outline", version: 1, status: "approved", payloadJson: { sections: [] }, createdAt: now, updatedAt: now });
    store.completeRun({ id: "run-script-scene-old", projectId: project.id, stageId: "script", status: "approved", runnerId: "script-9router", runnerVersion: "v1", inputArtifactIds: ["outline-for-scene-plan"], inputFingerprint: "ff".padEnd(64, "0"), outputArtifactIds: ["script-scene-old"], startedAt: now, finishedAt: now }, { id: "script-scene-old", projectId: project.id, stageId: "script", stageRunId: "run-script-scene-old", type: "script", version: 1, status: "approved", payloadJson: { sections: [] }, createdAt: now, updatedAt: now });
    store.completeRun({ id: "run-fact-review-scene-old-script", projectId: project.id, stageId: "fact-review", status: "needs_review", runnerId: "fact-review-local", runnerVersion: "v1", inputArtifactIds: ["script-scene-old"], inputFingerprint: "11".padEnd(64, "0"), outputArtifactIds: ["fact-review-scene-old-script"], startedAt: now, finishedAt: now }, { id: "fact-review-scene-old-script", projectId: project.id, stageId: "fact-review", stageRunId: "run-fact-review-scene-old-script", type: "fact-review", version: 1, status: "needs_review", payloadJson: { reviewer: "local_deterministic", findings: [] }, createdAt: now, updatedAt: now });
    store.approveReviewRun("run-fact-review-scene-old-script");
    store.completeRun({ id: "run-script-scene-new", projectId: project.id, stageId: "script", status: "approved", runnerId: "script-9router", runnerVersion: "v1", inputArtifactIds: ["outline-for-scene-plan"], inputFingerprint: "22".padEnd(64, "0"), outputArtifactIds: ["script-scene-new"], startedAt: now, finishedAt: now }, { id: "script-scene-new", projectId: project.id, stageId: "script", stageRunId: "run-script-scene-new", type: "script", version: 2, status: "approved", payloadJson: { sections: [] }, createdAt: now, updatedAt: now });
    store.completeRun({ id: "run-scene-plan-old-fact-review", projectId: project.id, stageId: "scene-plan", status: "needs_review", runnerId: "scene-plan-9router", runnerVersion: "v1", inputArtifactIds: ["fact-review-scene-old-script"], inputFingerprint: "33".padEnd(64, "0"), outputArtifactIds: ["scene-plan-old-fact-review"], startedAt: now, finishedAt: now }, { id: "scene-plan-old-fact-review", projectId: project.id, stageId: "scene-plan", stageRunId: "run-scene-plan-old-fact-review", type: "scene-plan", version: 1, status: "needs_review", payloadJson: { fps: 30, scenes: [{ id: "scene-01", scriptSectionId: "section-01", narration: "Narration", purpose: "Open", startFrame: 0, durationFrames: 30, visualMode: "ai_image", emotionalState: "clear", requiredAssets: [], continuityRefs: [] }] }, createdAt: now, updatedAt: now });
    expect(() => store.approveReviewRun("run-scene-plan-old-fact-review")).toThrow("Stage run inputs are no longer approved.");
    expect(store.listRuns(project.id, "scene-plan")[0]).toMatchObject({ id: "run-scene-plan-old-fact-review", status: "needs_review" });
    expect(store.listArtifacts(project.id, "scene-plan")[0]).toMatchObject({ id: "scene-plan-old-fact-review", status: "needs_review" });
    db.close();
  });

  it("does not treat singleton stage artifacts with referenceId payloads as per-reference current artifacts", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "singleton reference payload", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({ id: "run-outline-ref-a", projectId: project.id, stageId: "outline", status: "approved", runnerId: "outline-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "d".repeat(64), outputArtifactIds: ["outline-ref-a"], startedAt: now, finishedAt: now }, { id: "outline-ref-a", projectId: project.id, stageId: "outline", stageRunId: "run-outline-ref-a", type: "outline", version: 1, status: "approved", payloadJson: { referenceId: "ref-a", sections: [] }, createdAt: now, updatedAt: now });
    store.completeRun({ id: "run-outline-ref-b", projectId: project.id, stageId: "outline", status: "approved", runnerId: "outline-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "e".repeat(64), outputArtifactIds: ["outline-ref-b"], startedAt: now, finishedAt: now }, { id: "outline-ref-b", projectId: project.id, stageId: "outline", stageRunId: "run-outline-ref-b", type: "outline", version: 2, status: "approved", payloadJson: { referenceId: "ref-b", sections: [] }, createdAt: now, updatedAt: now });
    store.completeRun({ id: "run-script-ref-a", projectId: project.id, stageId: "script", status: "needs_review", runnerId: "script-9router", runnerVersion: "v1", inputArtifactIds: ["outline-ref-a"], inputFingerprint: "f".repeat(64), outputArtifactIds: ["script-ref-a"], startedAt: now, finishedAt: now }, { id: "script-ref-a", projectId: project.id, stageId: "script", stageRunId: "run-script-ref-a", type: "script", version: 1, status: "needs_review", payloadJson: { sections: [] }, createdAt: now, updatedAt: now });
    expect(() => store.approveReviewRun("run-script-ref-a")).toThrow("Stage run inputs are no longer approved.");
    expect(store.listRuns(project.id, "script")[0]).toMatchObject({ id: "run-script-ref-a", status: "needs_review" });
    db.close();
  });

  it("approves a per-reference review run when its lower-version input is current for that reference", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "per-reference input approval", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({ id: "run-segments-ref-a", projectId: project.id, stageId: "reference-segmentation", status: "approved", runnerId: "reference-segmentation-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "1".repeat(64), outputArtifactIds: ["segments-ref-a"], startedAt: now, finishedAt: now }, { id: "segments-ref-a", projectId: project.id, stageId: "reference-segmentation", stageRunId: "run-segments-ref-a", type: "reference-segments", version: 2, status: "approved", payloadJson: { referenceId: "ref-a", segments: [] }, createdAt: now, updatedAt: now });
    store.completeRun({ id: "run-segments-ref-b", projectId: project.id, stageId: "reference-segmentation", status: "approved", runnerId: "reference-segmentation-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "2".repeat(64), outputArtifactIds: ["segments-ref-b"], startedAt: now, finishedAt: now }, { id: "segments-ref-b", projectId: project.id, stageId: "reference-segmentation", stageRunId: "run-segments-ref-b", type: "reference-segments", version: 1, status: "approved", payloadJson: { referenceId: "ref-b", segments: [] }, createdAt: now, updatedAt: now });
    store.completeRun({ id: "run-dna-ref-b", projectId: project.id, stageId: "competitor-dna", status: "needs_review", runnerId: "competitor-dna-9router", runnerVersion: "v1", inputArtifactIds: ["segments-ref-b"], inputFingerprint: "3".repeat(64), outputArtifactIds: ["dna-ref-b"], startedAt: now, finishedAt: now }, { id: "dna-ref-b", projectId: project.id, stageId: "competitor-dna", stageRunId: "run-dna-ref-b", type: "competitor-dna-card", version: 1, status: "needs_review", payloadJson: { referenceId: "ref-b" }, createdAt: now, updatedAt: now });
    store.approveReviewRun("run-dna-ref-b");
    expect(store.listRuns(project.id, "competitor-dna")[0]).toMatchObject({ id: "run-dna-ref-b", status: "approved" });
    expect(store.listArtifacts(project.id, "competitor-dna")[0]).toMatchObject({ id: "dna-ref-b", status: "approved" });
    db.close();
  });

  it("does not approve a per-reference review run when a newer input exists for the same reference", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "stale per-reference input approval", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({ id: "run-segments-ref-a-old", projectId: project.id, stageId: "reference-segmentation", status: "approved", runnerId: "reference-segmentation-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "4".repeat(64), outputArtifactIds: ["segments-ref-a-old"], startedAt: now, finishedAt: now }, { id: "segments-ref-a-old", projectId: project.id, stageId: "reference-segmentation", stageRunId: "run-segments-ref-a-old", type: "reference-segments", version: 1, status: "approved", payloadJson: { referenceId: "ref-a", segments: [] }, createdAt: now, updatedAt: now });
    store.completeRun({ id: "run-segments-ref-a-new", projectId: project.id, stageId: "reference-segmentation", status: "approved", runnerId: "reference-segmentation-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "5".repeat(64), outputArtifactIds: ["segments-ref-a-new"], startedAt: now, finishedAt: now }, { id: "segments-ref-a-new", projectId: project.id, stageId: "reference-segmentation", stageRunId: "run-segments-ref-a-new", type: "reference-segments", version: 2, status: "approved", payloadJson: { referenceId: "ref-a", segments: [] }, createdAt: now, updatedAt: now });
    store.completeRun({ id: "run-dna-ref-a-old-input", projectId: project.id, stageId: "competitor-dna", status: "needs_review", runnerId: "competitor-dna-9router", runnerVersion: "v1", inputArtifactIds: ["segments-ref-a-old"], inputFingerprint: "6".repeat(64), outputArtifactIds: ["dna-ref-a-old-input"], startedAt: now, finishedAt: now }, { id: "dna-ref-a-old-input", projectId: project.id, stageId: "competitor-dna", stageRunId: "run-dna-ref-a-old-input", type: "competitor-dna-card", version: 1, status: "needs_review", payloadJson: { referenceId: "ref-a" }, createdAt: now, updatedAt: now });
    expect(() => store.approveReviewRun("run-dna-ref-a-old-input")).toThrow("Stage run inputs are no longer approved.");
    expect(store.listRuns(project.id, "competitor-dna")[0]).toMatchObject({ id: "run-dna-ref-a-old-input", status: "needs_review" });
    expect(store.listArtifacts(project.id, "competitor-dna")[0]).toMatchObject({ id: "dna-ref-a-old-input", status: "needs_review" });
    db.close();
  });

  it("ignores per-reference artifacts without a referenceId when selecting current inputs", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "malformed per-reference artifact", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({ id: "run-segments-missing-reference", projectId: project.id, stageId: "reference-segmentation", status: "approved", runnerId: "reference-segmentation-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "7".repeat(64), outputArtifactIds: ["segments-missing-reference"], startedAt: now, finishedAt: now }, { id: "segments-missing-reference", projectId: project.id, stageId: "reference-segmentation", stageRunId: "run-segments-missing-reference", type: "reference-segments", version: 2, status: "approved", payloadJson: { segments: [] }, createdAt: now, updatedAt: now });
    store.completeRun({ id: "run-segments-ref-a-current", projectId: project.id, stageId: "reference-segmentation", status: "approved", runnerId: "reference-segmentation-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "8".repeat(64), outputArtifactIds: ["segments-ref-a-current"], startedAt: now, finishedAt: now }, { id: "segments-ref-a-current", projectId: project.id, stageId: "reference-segmentation", stageRunId: "run-segments-ref-a-current", type: "reference-segments", version: 1, status: "approved", payloadJson: { referenceId: "ref-a", segments: [] }, createdAt: now, updatedAt: now });
    store.completeRun({ id: "run-dna-ref-a-current-input", projectId: project.id, stageId: "competitor-dna", status: "needs_review", runnerId: "competitor-dna-9router", runnerVersion: "v1", inputArtifactIds: ["segments-ref-a-current"], inputFingerprint: "9".repeat(64), outputArtifactIds: ["dna-ref-a-current-input"], startedAt: now, finishedAt: now }, { id: "dna-ref-a-current-input", projectId: project.id, stageId: "competitor-dna", stageRunId: "run-dna-ref-a-current-input", type: "competitor-dna-card", version: 1, status: "needs_review", payloadJson: { referenceId: "ref-a" }, createdAt: now, updatedAt: now });
    store.approveReviewRun("run-dna-ref-a-current-input");
    expect(store.listRuns(project.id, "competitor-dna")[0]).toMatchObject({ id: "run-dna-ref-a-current-input", status: "approved" });
    db.close();
  });

  it("approves a revised review run when its original upstream input is still approved", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "revised input approval", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({ id: "run-upstream-approved", projectId: project.id, stageId: "asset-acquisition", status: "approved", runnerId: "asset-acquisition-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "a".repeat(64), outputArtifactIds: ["artifact-upstream-approved"], startedAt: now, finishedAt: now }, { id: "artifact-upstream-approved", projectId: project.id, stageId: "asset-acquisition", stageRunId: "run-upstream-approved", type: "asset", version: 1, status: "approved", payloadJson: { assets: [] }, createdAt: now, updatedAt: now });
    store.completeRun({ id: "run-review-original", projectId: project.id, stageId: "asset-review", status: "needs_review", runnerId: "asset-review-local", runnerVersion: "v1", inputArtifactIds: ["artifact-upstream-approved"], inputFingerprint: "b".repeat(64), outputArtifactIds: ["artifact-review-original"], startedAt: now, finishedAt: now }, { id: "artifact-review-original", projectId: project.id, stageId: "asset-review", stageRunId: "run-review-original", type: "asset-review", version: 1, status: "needs_review", payloadJson: { assets: [] }, createdAt: now, updatedAt: now });
    store.rejectReviewRun("run-review-original");
    store.completeRun({ id: "run-review-revised", projectId: project.id, stageId: "asset-review", status: "needs_review", runnerId: "asset-review-user-action", runnerVersion: "v1", inputArtifactIds: ["artifact-upstream-approved"], inputFingerprint: "c".repeat(64), outputArtifactIds: ["artifact-review-revised"], startedAt: now, finishedAt: now }, { id: "artifact-review-revised", projectId: project.id, stageId: "asset-review", stageRunId: "run-review-revised", type: "asset-review", version: 2, status: "needs_review", payloadJson: { assets: [] }, createdAt: now, updatedAt: now });
    store.approveReviewRun("run-review-revised");
    expect(store.listRuns(project.id, "asset-review").find((run) => run.id === "run-review-revised")?.status).toBe("approved");
    expect(store.listArtifacts(project.id, "asset-review").find((artifact) => artifact.id === "artifact-review-revised")?.status).toBe("approved");
    db.close();
  });

  it("approves a review run through the full approved artifact chain without repeated recursion", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "long approved artifact chain", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    const stages = [
      "reference-validation", "transcript-cleaning", "reference-segmentation", "competitor-dna",
      "opportunity-map", "idea-lab", "originality-review",
      "outline", "script", "fact-review", "retention-review", "scene-plan", "shot-plan",
      "visual-routing", "prompt-preparation", "asset-acquisition"
    ] as const;
    const perReferenceStages = new Set(["transcript-cleaning", "reference-segmentation", "competitor-dna"]);
    let previousArtifactId: string | undefined;

    stages.forEach((stageId, index) => {
      const artifactId = `chain-artifact-${index}`;
      store.completeRun({
        id: `chain-run-${index}`, projectId: project.id, stageId, status: "approved", runnerId: "test-runner",
        runnerVersion: "test-v1", inputArtifactIds: previousArtifactId ? [previousArtifactId] : [],
        inputFingerprint: `chain-fingerprint-${index}`, outputArtifactIds: [artifactId], startedAt: now, finishedAt: now
      }, {
        id: artifactId, projectId: project.id, stageId, stageRunId: `chain-run-${index}`,
        type: `${stageId}.output`, version: 1, status: "approved",
        payloadJson: perReferenceStages.has(stageId) ? { referenceId: "ref-1" } : {}, createdAt: now, updatedAt: now
      });
      previousArtifactId = artifactId;
    });

    store.completeRun({
      id: "chain-asset-review-run", projectId: project.id, stageId: "asset-review", status: "needs_review", runnerId: "test-runner",
      runnerVersion: "test-v1", inputArtifactIds: [previousArtifactId!], inputFingerprint: "chain-review-fingerprint",
      outputArtifactIds: ["chain-asset-review-artifact"], startedAt: now, finishedAt: now
    }, {
      id: "chain-asset-review-artifact", projectId: project.id, stageId: "asset-review", stageRunId: "chain-asset-review-run",
      type: "asset-review", version: 1, status: "needs_review", payloadJson: {}, createdAt: now, updatedAt: now
    });

    store.approveReviewRun("chain-asset-review-run");
    expect(store.listRuns(project.id, "asset-review")[0]?.status).toBe("approved");
    db.close();
  });

  it("rejects cyclic approved artifact inputs without recursing indefinitely", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "cyclic approved artifact inputs", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({
      id: "cycle-run-a", projectId: project.id, stageId: "asset-acquisition", status: "approved", runnerId: "test-runner",
      runnerVersion: "test-v1", inputArtifactIds: ["cycle-artifact-b"], inputFingerprint: "cycle-a", outputArtifactIds: ["cycle-artifact-a"], startedAt: now, finishedAt: now
    }, {
      id: "cycle-artifact-a", projectId: project.id, stageId: "asset-acquisition", stageRunId: "cycle-run-a",
      type: "asset", version: 1, status: "approved", payloadJson: {}, createdAt: now, updatedAt: now
    });
    store.completeRun({
      id: "cycle-run-b", projectId: project.id, stageId: "prompt-preparation", status: "approved", runnerId: "test-runner",
      runnerVersion: "test-v1", inputArtifactIds: ["cycle-artifact-a"], inputFingerprint: "cycle-b", outputArtifactIds: ["cycle-artifact-b"], startedAt: now, finishedAt: now
    }, {
      id: "cycle-artifact-b", projectId: project.id, stageId: "prompt-preparation", stageRunId: "cycle-run-b",
      type: "visual-prompts", version: 1, status: "approved", payloadJson: {}, createdAt: now, updatedAt: now
    });
    store.completeRun({
      id: "cycle-review-run", projectId: project.id, stageId: "asset-review", status: "needs_review", runnerId: "test-runner",
      runnerVersion: "test-v1", inputArtifactIds: ["cycle-artifact-a"], inputFingerprint: "cycle-review", outputArtifactIds: ["cycle-review-artifact"], startedAt: now, finishedAt: now
    }, {
      id: "cycle-review-artifact", projectId: project.id, stageId: "asset-review", stageRunId: "cycle-review-run",
      type: "asset-review", version: 1, status: "needs_review", payloadJson: {}, createdAt: now, updatedAt: now
    });

    expect(() => store.approveReviewRun("cycle-review-run")).toThrow("Stage run inputs are no longer approved.");
    expect(store.listRuns(project.id, "asset-review")[0]?.status).toBe("needs_review");
    db.close();
  });

  it("approves a revised visual routing run backed by the approved shot plan", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "visual routing revision", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({ id: "run-shot-plan-approved", projectId: project.id, stageId: "shot-plan", status: "approved", runnerId: "shot-plan-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "a".repeat(64), outputArtifactIds: ["artifact-shot-plan-approved"], startedAt: now, finishedAt: now }, { id: "artifact-shot-plan-approved", projectId: project.id, stageId: "shot-plan", stageRunId: "run-shot-plan-approved", type: "shot-plan", version: 1, status: "approved", payloadJson: { shots: [] }, createdAt: now, updatedAt: now });
    store.completeRun({ id: "run-routing-original", projectId: project.id, stageId: "visual-routing", status: "needs_review", runnerId: "visual-routing-local", runnerVersion: "v1", inputArtifactIds: ["artifact-shot-plan-approved"], inputFingerprint: "b".repeat(64), outputArtifactIds: ["artifact-routing-original"], startedAt: now, finishedAt: now }, { id: "artifact-routing-original", projectId: project.id, stageId: "visual-routing", stageRunId: "run-routing-original", type: "visual-routing", version: 1, status: "needs_review", payloadJson: { shots: [] }, createdAt: now, updatedAt: now });
    store.rejectReviewRun("run-routing-original");
    store.completeRun({ id: "run-routing-revised", projectId: project.id, stageId: "visual-routing", status: "needs_review", runnerId: "visual-routing-user-edit", runnerVersion: "v1", inputArtifactIds: ["artifact-shot-plan-approved"], inputFingerprint: "c".repeat(64), outputArtifactIds: ["artifact-routing-revised"], startedAt: now, finishedAt: now }, { id: "artifact-routing-revised", projectId: project.id, stageId: "visual-routing", stageRunId: "run-routing-revised", type: "visual-routing", version: 2, status: "needs_review", payloadJson: { shots: [] }, createdAt: now, updatedAt: now });
    store.approveReviewRun("run-routing-revised");
    expect(store.listRuns(project.id, "visual-routing").find((run) => run.id === "run-routing-revised")?.status).toBe("approved");
    expect(store.listArtifacts(project.id, "visual-routing").find((artifact) => artifact.id === "artifact-routing-revised")?.status).toBe("approved");
    db.close();
  });

  it("marks pending review runs stale with their artifacts", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "stale review", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({ id: "run-stale", projectId: project.id, stageId: "script", status: "needs_review", runnerId: "script-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "d".repeat(64), outputArtifactIds: ["artifact-stale"], startedAt: now, finishedAt: now }, { id: "artifact-stale", projectId: project.id, stageId: "script", stageRunId: "run-stale", type: "script", version: 1, status: "needs_review", payloadJson: { sections: [] }, createdAt: now, updatedAt: now });
    store.markProjectArtifactsStale(project.id);
    expect(store.listRuns(project.id, "script")[0]).toMatchObject({ id: "run-stale", status: "stale" });
    expect(store.listArtifacts(project.id, "script")[0]).toMatchObject({ id: "artifact-stale", status: "stale" });
    db.close();
  });

  it("marks QA outputs and downstream export runs stale", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "qa stale chain", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({
      id: "run-qa",
      projectId: project.id,
      stageId: "qa",
      status: "needs_review",
      runnerId: "qa-local",
      runnerVersion: "v1",
      inputArtifactIds: ["artifact-preview", "artifact-timeline"],
      inputFingerprint: "a".repeat(64),
      outputArtifactIds: ["artifact-qa"],
      startedAt: now,
      finishedAt: now
    }, {
      id: "artifact-qa",
      projectId: project.id,
      stageId: "qa",
      stageRunId: "run-qa",
      type: "qa-report",
      version: 1,
      status: "needs_review",
      payloadJson: { runner: "local_deterministic", findings: [], inputArtifactIds: ["artifact-preview", "artifact-timeline"] },
      createdAt: now,
      updatedAt: now
    });
    store.completeRun({
      id: "run-capcut",
      projectId: project.id,
      stageId: "capcut-draft",
      status: "approved",
      runnerId: "pycapcut-bridge",
      runnerVersion: "v1",
      inputArtifactIds: ["artifact-qa"],
      inputFingerprint: "b".repeat(64),
      outputArtifactIds: ["artifact-capcut"],
      startedAt: now,
      finishedAt: now
    }, {
      id: "artifact-capcut",
      projectId: project.id,
      stageId: "capcut-draft",
      stageRunId: "run-capcut",
      type: "capcut-draft",
      version: 1,
      status: "approved",
      payloadJson: { draftName: "draft-1", structurallyValidated: true, trackCounts: { video: 1, audio: 1, text: 1 }, inputArtifactIds: ["artifact-qa"] },
      createdAt: now,
      updatedAt: now
    });
    store.createRun({
      id: "run-package",
      projectId: project.id,
      stageId: "packaging-export",
      status: "running",
      runnerId: "packaging-export-local",
      runnerVersion: "v1",
      inputArtifactIds: ["artifact-capcut"],
      inputFingerprint: "c".repeat(64),
      outputArtifactIds: [],
      startedAt: now
    });

    store.markProjectArtifactsStale(project.id);

    expect(store.listRuns(project.id, "qa")[0]).toMatchObject({ id: "run-qa", status: "stale" });
    expect(store.listArtifacts(project.id, "qa")[0]).toMatchObject({ id: "artifact-qa", status: "stale" });
    expect(store.listRuns(project.id, "capcut-draft")[0]).toMatchObject({ id: "run-capcut", status: "stale" });
    expect(store.listArtifacts(project.id, "capcut-draft")[0]).toMatchObject({ id: "artifact-capcut", status: "stale" });
    expect(store.listRuns(project.id, "packaging-export")[0]).toMatchObject({ id: "run-package", status: "stale" });
    db.close();
  });

  it("persists QA review artifacts with blocking findings intact", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "qa blocking findings", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({
      id: "run-qa-blocking",
      projectId: project.id,
      stageId: "qa",
      status: "needs_review",
      runnerId: "qa-local",
      runnerVersion: "v1",
      inputArtifactIds: ["artifact-preview", "artifact-timeline"],
      inputFingerprint: "d".repeat(64),
      outputArtifactIds: ["artifact-qa-blocking"],
      startedAt: now,
      finishedAt: now
    }, {
      id: "artifact-qa-blocking",
      projectId: project.id,
      stageId: "qa",
      stageRunId: "run-qa-blocking",
      type: "qa-report",
      version: 1,
      status: "needs_review",
      payloadJson: {
        runner: "local_deterministic",
        findings: [{ code: "missing_audio", severity: "blocking", message: "Narration is missing.", evidence: "timeline-assembly" }],
        inputArtifactIds: ["artifact-preview", "artifact-timeline"]
      },
      createdAt: now,
      updatedAt: now
    });

    expect(store.listRuns(project.id, "qa")[0]).toMatchObject({ id: "run-qa-blocking", status: "needs_review" });
    expect(store.listArtifacts(project.id, "qa")[0]).toMatchObject({
      id: "artifact-qa-blocking",
      status: "needs_review",
      payloadJson: {
        runner: "local_deterministic",
        findings: [{ code: "missing_audio", severity: "blocking", message: "Narration is missing.", evidence: "timeline-assembly" }],
        inputArtifactIds: ["artifact-preview", "artifact-timeline"]
      }
    });
    db.close();
  });

  it("marks only selected stage runs and artifacts stale", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "stage stale selection", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    const now = "2026-07-30T00:00:00.000Z";
    store.completeRun({ id: "run-qa-selected", projectId: project.id, stageId: "qa", status: "approved", runnerId: "qa-local", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "1".repeat(64), outputArtifactIds: ["artifact-qa-selected"], startedAt: now, finishedAt: now }, { id: "artifact-qa-selected", projectId: project.id, stageId: "qa", stageRunId: "run-qa-selected", type: "qa-report", version: 1, status: "approved", payloadJson: { runner: "local_deterministic", findings: [], inputArtifactIds: ["artifact-preview"] }, createdAt: now, updatedAt: now });
    store.completeRun({ id: "run-capcut-selected", projectId: project.id, stageId: "capcut-draft", status: "approved", runnerId: "pycapcut-bridge", runnerVersion: "v1", inputArtifactIds: ["artifact-qa-selected"], inputFingerprint: "2".repeat(64), outputArtifactIds: ["artifact-capcut-selected"], startedAt: now, finishedAt: now }, { id: "artifact-capcut-selected", projectId: project.id, stageId: "capcut-draft", stageRunId: "run-capcut-selected", type: "capcut-draft", version: 1, status: "approved", payloadJson: { draftName: "draft-selected", structurallyValidated: true, trackCounts: { video: 1, audio: 1, text: 1 }, inputArtifactIds: ["artifact-qa-selected"] }, createdAt: now, updatedAt: now });
    store.createRun({ id: "run-package-selected", projectId: project.id, stageId: "packaging-export", status: "running", runnerId: "packaging-export-local", runnerVersion: "v1", inputArtifactIds: ["artifact-capcut-selected"], inputFingerprint: "3".repeat(64), outputArtifactIds: [], startedAt: now });

    store.markStageArtifactsStale(project.id, ["qa", "packaging-export"]);

    expect(store.listRuns(project.id, "qa")[0]).toMatchObject({ id: "run-qa-selected", status: "stale" });
    expect(store.listArtifacts(project.id, "qa")[0]).toMatchObject({ id: "artifact-qa-selected", status: "stale" });
    expect(store.listRuns(project.id, "capcut-draft")[0]).toMatchObject({ id: "run-capcut-selected", status: "approved" });
    expect(store.listArtifacts(project.id, "capcut-draft")[0]).toMatchObject({ id: "artifact-capcut-selected", status: "approved" });
    expect(store.listRuns(project.id, "packaging-export")[0]).toMatchObject({ id: "run-package-selected", status: "stale" });
    db.close();
  });

  it("marks in-flight stage runs stale when project inputs are invalidated", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "stale in flight", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    store.createRun({ id: "run-running", projectId: project.id, stageId: "script", status: "running", runnerId: "script-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "e".repeat(64), outputArtifactIds: [], startedAt: "2026-07-30T00:00:00.000Z" });
    store.createRun({ id: "run-queued", projectId: project.id, stageId: "outline", status: "queued", runnerId: "outline-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "f".repeat(64), outputArtifactIds: [] });
    store.markProjectArtifactsStale(project.id);
    expect(store.listRuns(project.id, "script")[0]).toMatchObject({ id: "run-running", status: "stale" });
    expect(store.listRuns(project.id, "outline")[0]).toMatchObject({ id: "run-queued", status: "stale" });
    expect(() => store.finishRun({ id: "run-running", projectId: project.id, stageId: "script", status: "needs_review", runnerId: "script-9router", runnerVersion: "v1", inputArtifactIds: [], inputFingerprint: "e".repeat(64), outputArtifactIds: [], finishedAt: "2026-07-30T00:01:00.000Z" })).toThrow();
    db.close();
  });

  it("recovers interrupted workflow runs without deleting chunk progress", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "workflow restart", format: "short", targetLanguage: "English" });
    repo.saveProject(project);
    const store = new WorkflowRunStore(db);
    store.createRun({
      id: "run-cleaning-interrupted",
      projectId: project.id,
      stageId: "transcript-cleaning",
      status: "running",
      runnerId: "transcript-cleaning-9router",
      runnerVersion: "transcript-cleaning-v2",
      inputArtifactIds: [],
      inputFingerprint: "a".repeat(64),
      outputArtifactIds: [],
      payloadJson: { chunks: [{ chunkIndex: 0, status: "completed", chunkFingerprint: "b".repeat(64) }] }
    });

    const recovered = store.recoverInterruptedRuns();

    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({ id: "run-cleaning-interrupted", status: "failed", safeErrorCategory: "interrupted" });
    expect(store.listRuns(project.id, "transcript-cleaning")[0]).toMatchObject({
      status: "failed",
      payloadJson: { chunks: [{ chunkIndex: 0, status: "completed", chunkFingerprint: "b".repeat(64) }] }
    });
    db.close();
  });

  it("round-trips channel character versions and the project character snapshot", () => {
    const { db, repo } = openTemp();
    const profile = repo.listChannelProfiles()[0]!;
    const now = "2026-08-04T00:00:00.000Z";
    const characterVersion = {
      id: `${profile.id}-character-v1`,
      version: 1,
      status: "approved" as const,
      name: "Mina",
      persona: { role: "Finance teacher", ageRange: "30-40", appearance: "Short dark hair", wardrobe: "Navy blazer", palette: "Navy and amber", props: [], gestures: [], tone: "Clear" },
      invariantTraits: ["round glasses"],
      prohibitedChanges: ["identity"],
      references: ["hero", "half_body", "full_body", "teaching_gesture", "three_quarter"].map((view, index) => ({ id: `character-reference-${index}`, view: view as "hero" | "half_body" | "full_body" | "teaching_gesture" | "three_quarter", status: "approved" as const, relativeFilePath: `characters/${view}.png` })),
      createdAt: now,
      updatedAt: now
    };
    const savedProfile = { ...profile, characterVersions: [characterVersion], activeCharacterVersionId: characterVersion.id };
    repo.saveChannelProfile(savedProfile);
    const project = createFixtureProject({ profiles: [savedProfile], selectedProfileId: profile.id, characterVersionId: characterVersion.id, topic: "Character snapshot", format: "short", targetLanguage: "Vietnamese" });
    project.assetConcepts = [{ id: "asset-1", shotId: "shot-1", semanticBeat: "Cash rises", kind: "object", role: "Money", description: "A rising stack", visualConstraints: [], colorPalette: ["green"], motionIntent: "slide up", needsReferenceImage: false }];
    repo.saveProject(project);

    const loadedProfile = repo.loadChannelProfile(profile.id);
    const loadedProject = repo.loadProject(project.id);
    expect(loadedProfile?.activeCharacterVersionId).toBe(characterVersion.id);
    expect(loadedProfile?.characterVersions?.[0]?.references).toHaveLength(5);
    expect(loadedProject?.setup.characterVersionId).toBe(characterVersion.id);
    expect(loadedProject?.assetConcepts?.[0]?.semanticBeat).toBe("Cash rises");
    db.close();
  });

  it("round-trips Channel DNA and project channel snapshots", () => {
    const { db, repo } = openTemp();
    const profile = repo.listChannelProfiles()[0]!;
    const channelDna = createDefaultChannelDna({ name: profile.name, styleId: "cute-daily-life-cartoon" });
    repo.saveChannelProfile({ ...profile, channelDna });
    const project = createFixtureProject({ profiles: [{ ...profile, channelDna }], selectedProfileId: profile.id, topic: "Red panda money lesson", format: "short", targetLanguage: "Vietnamese" });
    repo.saveProject(project);
    expect(repo.loadChannelProfile(profile.id)?.channelDna?.visualStyle.styleId).toBe("cute-daily-life-cartoon");
    expect(repo.loadProject(project.id)?.setup.channelDnaSnapshot?.visualStyle.styleId).toBe("cute-daily-life-cartoon");
    expect(repo.loadProject(project.id)?.setup.channelPromptProfileSnapshot?.channelId).toBe(profile.id);
    expect(repo.loadProject(project.id)?.setup.channelPromptProfileSnapshot?.version).toBeGreaterThan(0);
    db.close();
  });

  it("persists idempotent generation jobs and recovers interrupted work", () => {
    const { db, repo } = openTemp();
    const project = createFixtureProject({ topic: "asset job", format: "short", targetLanguage: "English" }); repo.saveProject(project);
    const jobs = new GenerationJobStore(db);
    jobs.create({ id: "job-1", projectId: project.id, shotId: "shot-1", idempotencyKey: "c".repeat(64), state: "running", payload: { promptVersionId: "prompt-1" } });
    expect(jobs.recoverInterruptedJobs()).toBe(1);
    expect(jobs.findByIdempotencyKey("c".repeat(64))).toMatchObject({ id: "job-1", state: "failed", shotId: "shot-1" });
    jobs.restart("job-1", { promptVersionId: "prompt-1" }); jobs.finish("job-1", "succeeded", { asset: { shotId: "shot-1" } });
    expect(jobs.findByIdempotencyKey("c".repeat(64))?.state).toBe("succeeded");
    expect(() => jobs.create({ id: "job-2", projectId: project.id, shotId: "shot-1", idempotencyKey: "c".repeat(64), state: "running", payload: {} })).toThrow();
    db.close();
  });
});
