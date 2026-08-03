import { describe, expect, it } from "vitest";
import {
  channelRouteInputSchema,
  createProjectRequestSchema,
  factoryProjectResponseSchema,
  listNineRouterModelsRequestSchema,
  modelListStatusSchema,
  nineRouterModelListResponseSchema,
  projectIdRequestSchema,
  run9RouterTextCertificationRequestSchema,
  save9RouterModelConfigurationRequestSchema,
  editCompetitorReferenceRequestSchema,
  referenceStatusSchema,
  workflowStageStatusSchema,
  textModelCertificationRecordSchema,
  textModelCertificationResponseSchema,
  cleanedTranscriptOutputSchema,
  referenceValidationArtifactResponseSchema,
  runTranscriptCleaningRequestSchema,
  originalityReviewOutputSchema,
  researchSourcesOutputSchema,
  editVisualRoutingRequestSchema,
  sceneReviewRevisionRequestSchema,
  assetPreviewMediaRequestSchema,
  shotPlanOutputSchema,
  visualRoutingOutputSchema,
  assetReviewOutputSchema,
  reviseAssetReviewRequestSchema
  , voiceGenerationOutputSchema
  , subtitlePreparationOutputSchema
  , timelineAssemblyOutputSchema
  , previewRenderRequestSchema
  , previewMediaRequestSchema
  , previewMediaUrlResponseSchema
  , previewRenderOutputSchema
  , previewRenderArtifactResponseSchema
  , previewRenderArtifactsResponseSchema
  , qaRequestSchema
  , qaOutputSchema
  , qaArtifactResponseSchema
  , qaArtifactsResponseSchema
  , capcutDraftRequestSchema
  , capcutDraftApprovalRequestSchema
  , capcutDraftOutputSchema
  , packagingExportRequestSchema
  , packagingExportOutputSchema
  , devVoiceTestRequestSchema
  , devVoiceTestResponseSchema
  , runTtsProviderHealthCheckRequestSchema
  , runTtsProviderHealthCheckResponseSchema
  , devCapcutTestRequestSchema
  , devCapcutTestResponseSchema
  , devIdeaTestRequestSchema
  , devIdeaTestResponseSchema
  , devImageTestRequestSchema
  , devImageTestResponseSchema
  , devStockTestRequestSchema
  , devStockTestResponseSchema
  , localTtsSettingsSchema
  , localTtsReferenceAudioResponseSchema
} from "../src";
import { createFixtureProject } from "../src";

describe("ipc schemas", () => {
  it("accepts valid project and route payloads", () => {
    const parsed = createProjectRequestSchema.parse({
      topic: "Bible topic",
      projectName: "Bible channel",
      targetDuration: "10-12 minutes",
      workflowMode: "semi_automatic"
    });
    expect(parsed.format).toBe("long");
    expect(parsed.projectName).toBe("Bible channel");
    expect(parsed.targetDuration).toBe("10-12 minutes");
    expect(parsed.workflowMode).toBe("semi_automatic");
    expect(channelRouteInputSchema.parse({ topic: "term life", format: "long", targetLanguage: "English" }).topic).toBe("term life");
  });

  it("rejects invalid project ids", () => {
    expect(() => projectIdRequestSchema.parse({ projectId: "../bad" })).toThrow();
  });

  it("keeps voice cloning settings local and validates their reference fields", () => {
    expect(localTtsSettingsSchema.parse({ omnivoiceBinPath: "D:/OmniVoice/omnivoice-infer.exe", outputDir: "D:/workspace/tts", referenceAudioPath: "D:/voices/narrator.wav", referenceTranscript: "Reference words" }).referenceAudioPath).toContain("narrator.wav");
    expect(localTtsReferenceAudioResponseSchema.parse({ referenceAudioPath: "D:/voices/narrator.wav" }).referenceAudioPath).toContain("narrator.wav");
    expect(() => localTtsSettingsSchema.parse({ omnivoiceBinPath: "D:/OmniVoice/omnivoice-infer.exe", outputDir: "D:/workspace/tts", referenceTranscript: "x".repeat(12001) })).toThrow();
  });

  it("rejects absolute or protocol-based safe paths", () => {
    expect(() => previewRenderOutputSchema.parse({ relativeFilePath: "C:/outside.mp4", durationSeconds: 1, width: 1920, height: 1080, inputArtifactIds: ["artifact-1", "artifact-2", "artifact-3"] })).toThrow();
    expect(() => previewRenderOutputSchema.parse({ relativeFilePath: "/outside.mp4", durationSeconds: 1, width: 1920, height: 1080, inputArtifactIds: ["artifact-1", "artifact-2", "artifact-3"] })).toThrow();
    expect(() => previewRenderOutputSchema.parse({ relativeFilePath: "file:///outside.mp4", durationSeconds: 1, width: 1920, height: 1080, inputArtifactIds: ["artifact-1", "artifact-2", "artifact-3"] })).toThrow();
  });

  it("accepts subtitle-backed preview renders and safe media requests", () => {
    expect(previewRenderRequestSchema.parse({ projectId: "project-1", force: true }).force).toBe(true);
    expect(previewRenderOutputSchema.parse({
      relativeFilePath: "previews/project-1/render.mp4",
      subtitleRelativeFilePath: "previews/project-1/render.srt",
      durationSeconds: 2,
      width: 1920,
      height: 1080,
      inputArtifactIds: ["artifact-1", "artifact-2", "artifact-3", "artifact-4"]
    }).subtitleRelativeFilePath).toContain("render.srt");
    expect(previewMediaRequestSchema.parse({ projectId: "project-1", artifactId: "artifact-1" }).artifactId).toBe("artifact-1");
    expect(previewMediaUrlResponseSchema.parse({ url: "lsf-media://preview/token" }).url).toContain("lsf-media://");
  });

  it("validates workflow and reference status contracts", () => {
    expect(workflowStageStatusSchema.parse("blocked")).toBe("blocked");
    expect(workflowStageStatusSchema.parse("rejected")).toBe("rejected");
    expect(workflowStageStatusSchema.parse("stale")).toBe("stale");
    expect(referenceStatusSchema.parse("draft")).toBe("draft");
    expect(referenceStatusSchema.parse("rejected")).toBe("rejected");
    expect(referenceStatusSchema.parse("stale")).toBe("stale");
    expect(editCompetitorReferenceRequestSchema.parse({
      projectId: "project-1",
      referenceId: "reference-1",
      sourceUrl: "https://youtu.be/3GKC4kC3iQ0",
      pastedTranscript: "Transcript long enough to validate."
    }).referenceId).toBe("reference-1");
    expect(() => editCompetitorReferenceRequestSchema.parse({
      projectId: "project-1",
      referenceId: "reference-1",
      pastedTranscript: "Transcript long enough to validate.",
      apiKey: "sk-secret"
    })).toThrow();
  });

  it("validates fixture project responses", () => {
    const project = createFixtureProject({
      topic: "term life",
      format: "long",
      targetLanguage: "English",
      projectName: "Term Life Desk",
      targetDuration: "12-15 minutes"
    });
    expect(factoryProjectResponseSchema.parse(project).id).toBe(project.id);
    const rejectedReferenceProject = factoryProjectResponseSchema.parse({
      ...project,
      referenceSet: { status: "rejected" }
    });
    expect((rejectedReferenceProject.referenceSet as { status: string }).status).toBe("rejected");
  });

  it("validates 9Router model list contracts", () => {
    expect(listNineRouterModelsRequestSchema.parse({ providerId: "9router" })).toEqual({ providerId: "9router" });
    expect(modelListStatusSchema.parse("models_discovered")).toBe("models_discovered");
    expect(nineRouterModelListResponseSchema.parse({
      status: "models_discovered",
      models: [{ id: "model-a" }],
      message: "Models discovered."
    }).models).toEqual([{ id: "model-a" }]);
    expect(() => nineRouterModelListResponseSchema.parse({
      status: "models_discovered",
      models: [{ id: "model-a" }],
      message: "Models discovered.",
      apiKey: "sk-secret"
    })).toThrow();
  });

  it("requires a bounded, traceable Originality Review artifact", () => {
    expect(originalityReviewOutputSchema.parse({
      ideaId: "idea-1",
      reviewer: "local_deterministic",
      phraseOverlapRisk: 0,
      structuralOverlapRisk: 10,
      thumbnailOverlapRisk: 20,
      conceptOverlapRisk: 15,
      flaggedMatches: [],
      requiredChanges: [],
      status: "pass",
      competitorDnaArtifactIds: ["artifact-1"]
    }).status).toBe("pass");
  });

  it("allows Topic Mode originality reviews without competitor DNA artifacts", () => {
    expect(originalityReviewOutputSchema.parse({
      ideaId: "idea-topic-1",
      reviewer: "local_deterministic",
      phraseOverlapRisk: 0,
      structuralOverlapRisk: 0,
      thumbnailOverlapRisk: 0,
      conceptOverlapRisk: 0,
      flaggedMatches: [],
      requiredChanges: [],
      status: "pass",
      competitorDnaArtifactIds: []
    }).competitorDnaArtifactIds).toEqual([]);
  });

  it("requires unique cited research source identifiers and URLs", () => {
    expect(researchSourcesOutputSchema.parse({ sources: [{ id: "source-1", title: "Primary document", url: "https://example.com/source", publisher: "Example publisher", excerpt: "A quoted source excerpt.", sourceType: "primary" }] }).sources).toHaveLength(1);
    expect(() => researchSourcesOutputSchema.parse({ sources: [{ id: "source-1", title: "One", url: "https://example.com/source", publisher: "Example", excerpt: "First excerpt.", sourceType: "primary" }, { id: "source-1", title: "Two", url: "https://example.com/source", publisher: "Example", excerpt: "Second excerpt.", sourceType: "secondary" }] })).toThrow();
  });

  it("validates 9Router model configuration contracts", () => {
    expect(save9RouterModelConfigurationRequestSchema.parse({
      providerId: "9router",
      textModel: "model-a",
      imageModel: "model-b",
      videoModel: "model-a",
      ttsModel: "model-c",
      sttModel: "model-d"
    })).toEqual({
      providerId: "9router",
      textModel: "model-a",
      imageModel: "model-b",
      videoModel: "model-a",
      ttsModel: "model-c",
      sttModel: "model-d"
    });
    expect(() => save9RouterModelConfigurationRequestSchema.parse({ providerId: "openai", textModel: "model-a" })).toThrow();
    expect(() => save9RouterModelConfigurationRequestSchema.parse({ providerId: "9router", textModel: "" })).toThrow();
    for (const forbiddenField of ["apiKey", "credentialRef", "Authorization", "baseUrl"]) {
      expect(() => save9RouterModelConfigurationRequestSchema.parse({
        providerId: "9router",
        textModel: "model-a",
        [forbiddenField]: "sk-secret"
      })).toThrow();
    }
  });

  it("validates 9Router text certification contracts", () => {
    const record = {
      id: "text-cert-1",
      providerId: "9router",
      configuredModelId: "cx/gpt-5.5",
      returnedModelId: "cx/gpt-5.5",
      baseUrlFingerprint: "a".repeat(64),
      credentialVersionRef: "credential:version-1",
      endpointStrategy: "responses",
      implementationVersion: "text-certification-v1",
      exactTextTest: { status: "passed", latencyMs: 100 },
      strictJsonTest: { status: "passed", latencyMs: 120 },
      overallStatus: "verified",
      testedAt: "2026-07-29T00:00:00.000Z"
    };
    expect(run9RouterTextCertificationRequestSchema.parse({
      providerId: "9router",
      confirmation: "Run 2 certification requests"
    }).confirmation).toBe("Run 2 certification requests");
    expect(textModelCertificationRecordSchema.parse(record).overallStatus).toBe("verified");
    expect(textModelCertificationResponseSchema.parse({
      status: "verified",
      record,
      message: "Text model certification verified."
    }).status).toBe("verified");
    expect(() => run9RouterTextCertificationRequestSchema.parse({ providerId: "9router" })).toThrow();
    for (const forbiddenField of ["apiKey", "Authorization", "requestConfig", "rawHeaders"]) {
      expect(() => textModelCertificationResponseSchema.parse({
        status: "verified",
        record,
        message: "Text model certification verified.",
        [forbiddenField]: "sk-secret"
      })).toThrow();
    }
  });

  it("requires exact transcript-cleaning output contracts", () => {
    const transcript = "Transcript source";
    expect(runTranscriptCleaningRequestSchema.parse({ projectId: "project-1", referenceId: "reference-1" }).referenceId).toBe("reference-1");
    expect(cleanedTranscriptOutputSchema.parse({
      referenceId: "reference-1",
      sourceTranscriptVersionId: "reference-1",
      rawTranscript: transcript,
      cleanedTranscript: transcript,
      removedSegments: [],
      flaggedSegments: [],
      sourceCharacterCount: transcript.length,
      cleanedCharacterCount: transcript.length,
      execution: {
        mode: "single_request",
        chunkCount: 1,
        completedChunkCount: 1,
        estimatedInputTokens: 4,
        selectedModel: "cleaner-v1",
        configuredTimeoutMs: 120000,
        removedNoise: 0,
        flaggedSegmentCount: 0
      }
    }).cleanedTranscript).toBe(transcript);
    expect(() => cleanedTranscriptOutputSchema.parse({
      referenceId: "reference-1",
      sourceTranscriptVersionId: "reference-1",
      rawTranscript: transcript,
      cleanedTranscript: transcript,
      removedSegments: [],
      flaggedSegments: [],
      sourceCharacterCount: transcript.length,
      cleanedCharacterCount: transcript.length,
      execution: {
        mode: "single_request",
        chunkCount: 1,
        completedChunkCount: 1,
        estimatedInputTokens: 4,
        selectedModel: "cleaner-v1",
        configuredTimeoutMs: 120000,
        removedNoise: 0,
        flaggedSegmentCount: 0
      },
      unexpected: true
    })).toThrow();
  });

  it("requires structured reference validation review artifacts", () => {
    expect(referenceValidationArtifactResponseSchema.parse({
      id: "artifact-reference-validation",
      stageRunId: "run-reference-validation",
      status: "needs_review",
      payloadJson: {
        referenceSet: { status: "valid", currentFingerprint: "f".repeat(64) },
        references: [{
          id: "reference-1",
          pastedTranscript: "Transcript long enough to validate.",
          status: "valid",
          validationMessage: "Reference passed local validation.",
          included: true,
          createdAt: "2026-07-30T00:00:00.000Z"
        }]
      },
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:00.000Z"
    }).payloadJson.references).toHaveLength(1);
    expect(() => referenceValidationArtifactResponseSchema.parse({
      id: "artifact-reference-validation",
      status: "needs_review",
      payloadJson: { valid: true },
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:00.000Z"
    })).toThrow();
  });

  it("allows only a supported visual-mode revision for a review artifact", () => {
    expect(editVisualRoutingRequestSchema.parse({ projectId: "project-1", artifactId: "artifact-1", shotId: "shot-1", visualMode: "document" }).visualMode).toBe("document");
    expect(editVisualRoutingRequestSchema.parse({ projectId: "project-1", artifactId: "artifact-1", shotId: "shot-1", visualMode: "manual_upload" }).visualMode).toBe("manual_upload");
    expect(() => editVisualRoutingRequestSchema.parse({ projectId: "project-1", artifactId: "artifact-1", shotId: "shot-1", visualMode: "unknown_mode" })).toThrow();
  });

  it("keeps Asset Review decisions explicit and free of URLs or secrets", () => {
    const asset = { shotId: "shot-1", promptVersionId: "prompt-1", relativeFilePath: "assets/images/project-1/shot-1.png", sha256: "d".repeat(64), mimeType: "image/png", byteLength: 10, width: 1, height: 1 };
    expect(assetReviewOutputSchema.parse({ acquisitionArtifactId: "artifact-1", assets: [{ asset, reviewStatus: "needs_review" }] }).assets).toHaveLength(1);
    expect(reviseAssetReviewRequestSchema.parse({ projectId: "project-1", artifactId: "artifact-2", assetSha256: "d".repeat(64), action: "assign", shotId: "shot-1" }).action).toBe("assign");
    expect(() => assetReviewOutputSchema.parse({ acquisitionArtifactId: "artifact-1", assets: [{ asset: { ...asset, signedUrl: "https://example.com" }, reviewStatus: "needs_review" }] })).toThrow();
    expect(() => assetReviewOutputSchema.parse({ acquisitionArtifactId: "artifact-1", assets: [{ asset, reviewStatus: "approved", assignedShotId: "shot-2" }] })).toThrow();
    expect(() => assetReviewOutputSchema.parse({ acquisitionArtifactId: "artifact-1", assets: [{ asset, reviewStatus: "approved", assignedShotId: "shot-1" }, { asset: { ...asset, sha256: "e".repeat(64) }, reviewStatus: "approved", assignedShotId: "shot-1" }] })).toThrow();
  });

  it("requires nonempty, portable, validated voice segment metadata", () => {
    expect(voiceGenerationOutputSchema.parse({ segments: [{ scriptSectionId: "section-1", relativeFilePath: "assets/voice/project-1/section-1.wav", durationSeconds: 1.25, codec: "pcm_s16le", byteLength: 100, sha256: "e".repeat(64) }] }).segments).toHaveLength(1);
    expect(() => voiceGenerationOutputSchema.parse({ segments: [{ scriptSectionId: "section-1", relativeFilePath: "C:/outside.wav", durationSeconds: 0, codec: "", byteLength: 0, sha256: "e".repeat(64) }] })).toThrow();
  });

  it("keeps development probes independent from project artifacts", () => {
    expect(devVoiceTestRequestSchema.parse({ text: "Test voice", provider: "kokoro-vietnamese", voiceId: "storyvert" }).voiceId).toBe("storyvert");
    expect(devVoiceTestResponseSchema.parse({ provider: "omnivoice-local", previewUrl: "file:///D:/workspace/dev-test-lab/voice/test.wav", relativeFilePath: "dev-test-lab/voice/test.wav", durationSeconds: 1, codec: "pcm_s16le", byteLength: 44, sha256: "d".repeat(64) }).provider).toBe("omnivoice-local");
    expect(devCapcutTestRequestSchema.parse({ subtitleText: "Test subtitle" }).subtitleText).toBe("Test subtitle");
    expect(devCapcutTestResponseSchema.parse({ draftDirectory: "D:/CapCut/test", contentPath: "D:/CapCut/test/draft_content.json", fixtureDirectory: "dev-test-lab/capcut/test", trackCounts: { video: 1, audio: 1, text: 1 } }).trackCounts.text).toBe(1);
    expect(devIdeaTestRequestSchema.parse({ topic: "Test topic" }).topic).toBe("Test topic");
    expect(devIdeaTestResponseSchema.parse({ model: "test-model", responseText: "1. Test", relativeFilePath: "dev-test-lab/ideas/test.json" }).model).toBe("test-model");
    expect(devImageTestRequestSchema.parse({ prompt: "Test image", aspectRatio: "9:16" }).aspectRatio).toBe("9:16");
    expect(devImageTestResponseSchema.parse({ relativeFilePath: "assets/images/dev-test/test.png", sha256: "c".repeat(64), mimeType: "image/png", byteLength: 100, width: 10, height: 10 }).mimeType).toBe("image/png");
    expect(devStockTestRequestSchema.parse({ query: "library", mediaType: "image" }).query).toBe("library");
    expect(devStockTestResponseSchema.parse({ mediaType: "video", results: [{ id: "1", url: "https://www.pexels.com/video/1", previewUrl: "https://images.pexels.com/video.jpg" }] }).results).toHaveLength(1);
  });

  it("validates the explicit TTS provider health-check contract", () => {
    expect(runTtsProviderHealthCheckRequestSchema.parse({ provider: "edge-tts" }).provider).toBe("edge-tts");
    expect(runTtsProviderHealthCheckResponseSchema.parse({
      id: "edge-tts",
      displayName: "Microsoft Edge Neural",
      providerType: "cloud",
      health: "ready",
      message: "Ready",
      experimental: false,
      enabled: true,
      voiceCount: 1
    }).voiceCount).toBe(1);
  });

  it("requires ordered frame-valid subtitle cues with original text", () => {
    expect(subtitlePreparationOutputSchema.parse({ fps: 30, cues: [{ id: "cue-1", scriptSectionId: "section-1", startFrame: 0, durationFrames: 15, text: "Original sentence." }] }).cues[0]?.text).toBe("Original sentence.");
    expect(() => subtitlePreparationOutputSchema.parse({ fps: 30, cues: [{ id: "cue-1", scriptSectionId: "section-1", startFrame: -1, durationFrames: 0, text: "" }] })).toThrow();
  });

  it("requires integer-frame timeline media items", () => {
    expect(timelineAssemblyOutputSchema.parse({ fps: 30, items: [{ id: "visual-shot-1", track: "primary_visual", sourceId: "asset-1", startFrame: 0, durationFrames: 30, fps: 30 }] }).items).toHaveLength(1);
    expect(() => timelineAssemblyOutputSchema.parse({ fps: 30, items: [{ id: "visual-shot-1", track: "primary_visual", sourceId: "asset-1", startFrame: -1, durationFrames: 0, fps: 30 }] })).toThrow();
  });

  it("rejects duplicate shot IDs in shot and visual routing outputs", () => {
    const shot = { id: "shot-1", sceneId: "scene-1", order: 0, startFrame: 0, durationFrames: 30, fps: 30, purpose: "Open", visualMode: "ai_image" as const, framing: "wide", cameraAngle: "front", cameraMovement: "static", subjectAction: "talk", startState: {}, endState: {}, continuityRefs: [] };
    expect(() => shotPlanOutputSchema.parse({ shots: [shot, { ...shot, sceneId: "scene-2" }] })).toThrow();
    expect(() => visualRoutingOutputSchema.parse({ shots: [shot, { ...shot, sceneId: "scene-2" }] })).toThrow();
  });

  it("allows factory project timeline source IDs to reference workspace media paths", () => {
    const project = createFixtureProject({ topic: "timeline path", format: "short", targetLanguage: "English" });
    expect(factoryProjectResponseSchema.parse({ ...project, timeline: { fps: 30, items: [{ id: "voice-section-1", track: "narration", sourceId: "voice/project-1/section-1.wav", startFrame: 0, durationFrames: 30, fps: 30 }] } }).timeline.items[0]?.sourceId).toContain("/");
  });

  it("keeps Preview Render output local, validated, and tied to approved inputs", () => {
    expect(previewRenderRequestSchema.parse({ projectId: "project-1" }).projectId).toBe("project-1");
    expect(previewRenderOutputSchema.parse({ relativeFilePath: "previews/project-1/run-1.mp4", durationSeconds: 3.2, width: 1080, height: 1920, sha256: "a".repeat(64), inputArtifactIds: ["artifact-timeline", "artifact-assets", "artifact-voice"] }).relativeFilePath).toContain("previews/");
    expect(() => previewRenderOutputSchema.parse({ relativeFilePath: "../outside.mp4", durationSeconds: 0, width: 0, height: 0, inputArtifactIds: [] })).toThrow();
    expect(previewRenderArtifactResponseSchema.parse({ id: "artifact-preview", stageRunId: "stage-run-1", status: "needs_review", payloadJson: { relativeFilePath: "previews/project-1/run-1.mp4", durationSeconds: 3.2, width: 1080, height: 1920, sha256: "a".repeat(64), inputArtifactIds: ["artifact-timeline", "artifact-assets", "artifact-voice"] }, relativeFilePath: "previews/project-1/run-1.mp4", createdAt: "2026-07-30T00:00:00.000Z", updatedAt: "2026-07-30T00:00:00.000Z" }).status).toBe("needs_review");
    expect(previewRenderArtifactsResponseSchema.parse([{ id: "artifact-preview", status: "needs_review", payloadJson: { relativeFilePath: "previews/project-1/run-1.mp4", durationSeconds: 3.2, width: 1080, height: 1920, sha256: "a".repeat(64), inputArtifactIds: ["artifact-timeline", "artifact-assets", "artifact-voice"] }, relativeFilePath: "previews/project-1/run-1.mp4", createdAt: "2026-07-30T00:00:00.000Z", updatedAt: "2026-07-30T00:00:00.000Z" }])).toHaveLength(1);
  });

  it("keeps deterministic QA findings bounded and reviewable", () => {
    expect(qaRequestSchema.parse({ projectId: "project-1" }).projectId).toBe("project-1");
    expect(qaOutputSchema.parse({ runner: "local_deterministic", inputArtifactIds: ["artifact-preview"], findings: [{ code: "missing_audio", severity: "blocking", message: "Narration is missing.", evidence: "timeline-assembly" }] }).findings[0]?.severity).toBe("blocking");
    expect(() => qaOutputSchema.parse({ runner: "ai", inputArtifactIds: [], findings: [] })).toThrow();
    expect(qaArtifactResponseSchema.parse({ id: "artifact-qa", stageRunId: "stage-run-1", status: "needs_review", payloadJson: { runner: "local_deterministic", inputArtifactIds: ["artifact-preview"], findings: [{ code: "missing_audio", severity: "blocking", message: "Narration is missing.", evidence: "timeline-assembly" }] }, createdAt: "2026-07-30T00:00:00.000Z", updatedAt: "2026-07-30T00:00:00.000Z" }).payloadJson.runner).toBe("local_deterministic");
    expect(qaArtifactsResponseSchema.parse([{ id: "artifact-qa", status: "needs_review", payloadJson: { runner: "local_deterministic", inputArtifactIds: ["artifact-preview"], findings: [{ code: "missing_audio", severity: "blocking", message: "Narration is missing.", evidence: "timeline-assembly" }] }, createdAt: "2026-07-30T00:00:00.000Z", updatedAt: "2026-07-30T00:00:00.000Z" }])).toHaveLength(1);
  });

  it("keeps CapCut Draft artifacts structurally validated but explicitly reviewable", () => {
    expect(capcutDraftRequestSchema.parse({ projectId: "project-1" }).projectId).toBe("project-1");
    expect(capcutDraftApprovalRequestSchema.parse({ projectId: "project-1", confirmation: "I opened the draft in CapCut and verified editable tracks" }).confirmation).toContain("verified");
    expect(() => capcutDraftApprovalRequestSchema.parse({ projectId: "project-1", confirmation: "looks ok" })).toThrow();
    expect(capcutDraftOutputSchema.parse({ draftName: "project-1-run-1", structurallyValidated: true, trackCounts: { video: 1, audio: 1, text: 2 }, inputArtifactIds: ["artifact-qa", "artifact-timeline", "artifact-preview"] }).trackCounts.text).toBe(2);
    expect(() => capcutDraftOutputSchema.parse({ draftName: "../draft", structurallyValidated: false, trackCounts: { video: 0, audio: 0, text: 0 }, inputArtifactIds: [] })).toThrow();
  });

  it("keeps package manifests portable and artifact-only", () => {
    expect(packagingExportRequestSchema.parse({ projectId: "project-1" }).projectId).toBe("project-1");
    expect(packagingExportOutputSchema.parse({ relativeFilePath: "exports/project-1/package.json", artifactIds: ["a1", "a2", "a3", "a4", "a5", "a6"], sha256: "f".repeat(64) }).artifactIds).toHaveLength(6);
    expect(() => packagingExportOutputSchema.parse({ relativeFilePath: "exports/project-1/package.json", artifactIds: ["a1", "a1", "a3", "a4", "a5", "a6"], sha256: "f".repeat(64) })).toThrow();
    expect(() => packagingExportOutputSchema.parse({ relativeFilePath: "../secret.json", artifactIds: [], sha256: "bad" })).toThrow();
  });

  it("validates Scene Review revisions as typed user actions", () => {
    expect(sceneReviewRevisionRequestSchema.parse({
      projectId: "project-1",
      artifactId: "artifact-1",
      action: "edit_direction",
      shotId: "shot-1",
      framing: "wide",
      cameraAngle: "front",
      cameraMovement: "slow push",
      subjectAction: "map unfolds"
    }).action).toBe("edit_direction");
    expect(() => sceneReviewRevisionRequestSchema.parse({ projectId: "project-1", artifactId: "artifact-1", action: "remove_scene", sceneId: "scene-1", extra: true })).toThrow();
    expect(assetPreviewMediaRequestSchema.parse({ projectId: "project-1", artifactId: "artifact-1", assetSha256: "a".repeat(64) }).assetSha256).toHaveLength(64);
  });
});
