import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryKeychain, openFactoryDatabase, ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { fingerprintBaseUrl } from "./nineRouterTextCertificationService";
import { runCompetitorDna } from "./competitorDnaService";

async function setup() {
  const db = openFactoryDatabase(join(mkdtempSync(join(tmpdir(), "lsf-dna-")), "factory.sqlite"));
  const credentialStore = new ProviderCredentialStore(db, new MemoryKeychain());
  const certificationStore = new TextCertificationStore(db);
  await credentialStore.saveProviderCredential({ providerId: "cockpit", baseUrl: "http://127.0.0.1:20128/v1", textModel: "dna-v1" }, "sk-secret");
  certificationStore.saveTextCertificationRecord({ id: "cert-1", providerId: "cockpit", configuredModelId: "dna-v1", baseUrlFingerprint: fingerprintBaseUrl("http://127.0.0.1:20128/v1")!, credentialVersionRef: credentialStore.loadProviderCredentialVersionRef("cockpit"), endpointStrategy: "responses", implementationVersion: "text-capability-v1", exactTextTest: { status: "passed", latencyMs: 1 }, strictJsonTest: { status: "passed", latencyMs: 1 }, overallStatus: "verified", testedAt: "2026-07-30T00:00:00.000Z" });
  return { db, credentialStore, certificationStore };
}

const segments = [{ id: "segment-1", order: 0, startCharacter: 0, endCharacter: 12, type: "hook" as const, text: "Hello world.", function: "Opening", includedForDna: true }];
function output(evidenceSegmentIds = ["segment-1"], uncertainties: unknown[] = []) { return { referenceId: "ref-1", segmentationArtifactId: "artifact-seg-1", hookPattern: { abstraction: "Open with a direct question", evidenceSegmentIds }, promisePattern: { abstraction: "Promise a clear answer", evidenceSegmentIds }, narrativeStructure: [{ phase: "opening", function: "Establish the topic", evidenceSegmentIds }], pacingPattern: { description: "Fast opening", evidenceSegmentIds }, conflictAndRevealPattern: { description: "Introduce a tension before the answer", evidenceSegmentIds }, proofPattern: { description: "Use a concrete example", evidenceSegmentIds }, emotionalArc: [], retentionDevices: [], transitionPatterns: [{ abstraction: "Move directly into evidence", evidenceSegmentIds }], reusablePrinciples: [{ principle: "State the payoff early", evidenceSegmentIds }], forbiddenToCopy: [{ element: "Exact phrasing", reason: "Original expression", evidenceSegmentIds }], excludedContentSummary: { sponsorSegmentCount: 0, selfPromotionSegmentCount: 0, excludedSegmentIds: [] }, uncertainties }; }
function structuredClient(value: unknown, onInput?: (input: { input: string }) => void) { return { generateStructured: async <T>(input: { schema: { parse: (value: unknown) => T }; normalize?: (value: unknown) => unknown; input: string }) => { onInput?.(input); return { data: input.schema.parse(input.normalize ? input.normalize(value) : value) }; } }; }

describe("competitor DNA service", () => {
  it("accepts evidence-backed abstractions from approved segments", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const result = await runCompetitorDna({ referenceId: "ref-1", segmentationArtifactId: "artifact-seg-1", cleanedTranscript: "Hello world.", segments, credentialStore, certificationStore, createClient: () => structuredClient(output()) });
    expect(result.output.hookPattern.evidenceSegmentIds).toEqual(["segment-1"]); db.close();
  });
  it("fails closed for invented evidence IDs", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    await expect(runCompetitorDna({ referenceId: "ref-1", segmentationArtifactId: "artifact-seg-1", cleanedTranscript: "Hello world.", segments, credentialStore, certificationStore, createClient: () => structuredClient(output(["invented"])) })).rejects.toMatchObject({ category: "invalid_output" }); db.close();
  });

  it("normalizes descriptive uncertainty objects without weakening evidence validation", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const result = await runCompetitorDna({ referenceId: "ref-1", segmentationArtifactId: "artifact-seg-1", cleanedTranscript: "Hello world.", segments, credentialStore, certificationStore, createClient: () => structuredClient(output(["segment-1"], [{ description: "The source does not establish the publication date." }])) });
    expect(result.output.uncertainties).toEqual(["The source does not establish the publication date."]);
    db.close();
  });

  it("binds the canonical top-level schema and channel originality context to the prompt", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    let capturedPrompt = "";
    await runCompetitorDna({
      referenceId: "ref-1",
      segmentationArtifactId: "artifact-seg-1",
      cleanedTranscript: "Hello world.",
      segments,
      channelProfile: { id: "insurance-made-simple", name: "Insurance Made Simple", niche: "Insurance education", tone: "calm", avoidList: ["copied wording"], safetyRules: ["No guarantees"] },
      originalityRules: ["copied wording", "No guarantees"],
      credentialStore,
      certificationStore,
      createClient: () => structuredClient(output(), (request) => { capturedPrompt = request.input; })
    });
    expect(capturedPrompt).toContain("one top-level JSON object");
    expect(capturedPrompt).toContain('"hookPattern"');
    expect(capturedPrompt).toContain("insurance-made-simple");
    expect(capturedPrompt).toContain("No guarantees");
    db.close();
  });
});
