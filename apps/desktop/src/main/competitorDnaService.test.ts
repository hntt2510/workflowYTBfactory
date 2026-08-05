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
  await credentialStore.saveProviderCredential({ providerId: "9router", baseUrl: "http://127.0.0.1:20128/v1", textModel: "dna-v1" }, "sk-secret");
  certificationStore.saveTextCertificationRecord({ id: "cert-1", providerId: "9router", configuredModelId: "dna-v1", baseUrlFingerprint: fingerprintBaseUrl("http://127.0.0.1:20128/v1")!, credentialVersionRef: credentialStore.loadProviderCredentialVersionRef("9router"), endpointStrategy: "responses", implementationVersion: "text-certification-v1", exactTextTest: { status: "passed", latencyMs: 1 }, strictJsonTest: { status: "passed", latencyMs: 1 }, overallStatus: "verified", testedAt: "2026-07-30T00:00:00.000Z" });
  return { db, credentialStore, certificationStore };
}

const segments = [{ id: "segment-1", order: 0, startCharacter: 0, endCharacter: 12, type: "hook" as const, text: "Hello world.", function: "Opening" }];
function output(evidenceSegmentIds = ["segment-1"]) { return { referenceId: "ref-1", hookPattern: { abstraction: "Open with a direct question", evidenceSegmentIds }, promisePattern: { abstraction: "Promise a clear answer", evidenceSegmentIds }, pacingPattern: { description: "Fast opening", evidenceSegmentIds }, proofPattern: { description: "Use a concrete example", evidenceSegmentIds }, emotionalArc: [], retentionDevices: [], visualOpportunities: [], reusablePrinciples: ["State the payoff early"], forbiddenToCopy: [{ element: "Exact phrasing", reason: "Original expression" }], uncertainties: [] }; }

describe("competitor DNA service", () => {
  it("accepts evidence-backed abstractions from approved segments", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const result = await runCompetitorDna({ referenceId: "ref-1", cleanedTranscript: "Hello world.", segments, credentialStore, certificationStore, createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify(output()) }) }) });
    expect(result.output.hookPattern.evidenceSegmentIds).toEqual(["segment-1"]); db.close();
  });
  it("fails closed for invented evidence IDs", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    await expect(runCompetitorDna({ referenceId: "ref-1", cleanedTranscript: "Hello world.", segments, credentialStore, certificationStore, createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify(output(["invented"])) }) }) })).rejects.toMatchObject({ category: "invalid_output" }); db.close();
  });
});
