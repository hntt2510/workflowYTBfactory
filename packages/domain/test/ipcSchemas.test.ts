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
  runTranscriptCleaningRequestSchema,
  originalityReviewOutputSchema,
  researchSourcesOutputSchema
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

  it("validates workflow and reference status contracts", () => {
    expect(workflowStageStatusSchema.parse("blocked")).toBe("blocked");
    expect(referenceStatusSchema.parse("draft")).toBe("draft");
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
      cleanedTranscript: transcript,
      removedSegments: [],
      flaggedSegments: [],
      sourceCharacterCount: transcript.length,
      cleanedCharacterCount: transcript.length
    }).cleanedTranscript).toBe(transcript);
    expect(() => cleanedTranscriptOutputSchema.parse({
      referenceId: "reference-1",
      sourceTranscriptVersionId: "reference-1",
      cleanedTranscript: transcript,
      removedSegments: [],
      flaggedSegments: [],
      sourceCharacterCount: transcript.length,
      cleanedCharacterCount: transcript.length,
      unexpected: true
    })).toThrow();
  });
});
