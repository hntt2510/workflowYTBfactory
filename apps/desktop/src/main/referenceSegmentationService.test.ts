import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryKeychain, openFactoryDatabase, ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { fingerprintBaseUrl } from "./nineRouterTextCertificationService";
import { runReferenceSegmentation } from "./referenceSegmentationService";

async function setup() {
  const db = openFactoryDatabase(join(mkdtempSync(join(tmpdir(), "lsf-segment-")), "factory.sqlite"));
  const credentialStore = new ProviderCredentialStore(db, new MemoryKeychain());
  const certificationStore = new TextCertificationStore(db);
  await credentialStore.saveProviderCredential({ providerId: "9router", baseUrl: "http://127.0.0.1:20128/v1", textModel: "segmenter-v1" }, "sk-secret");
  const credentialVersionRef = credentialStore.loadProviderCredentialVersionRef("9router");
  certificationStore.saveTextCertificationRecord({
    id: "cert-1", providerId: "9router", configuredModelId: "segmenter-v1",
    baseUrlFingerprint: fingerprintBaseUrl("http://127.0.0.1:20128/v1")!,
    ...(credentialVersionRef ? { credentialVersionRef } : {}), endpointStrategy: "responses",
    implementationVersion: "text-certification-v1", exactTextTest: { status: "passed", latencyMs: 1 },
    strictJsonTest: { status: "passed", latencyMs: 1 }, overallStatus: "verified", testedAt: "2026-07-30T00:00:00.000Z"
  });
  return { db, credentialStore, certificationStore };
}

describe("reference segmentation service", () => {
  it("accepts segments that exactly map to the approved cleaned transcript", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const cleanedTranscript = "Hello world. Evidence follows.";
    const result = await runReferenceSegmentation({
      referenceId: "ref-1", cleanedTranscript, credentialStore, certificationStore,
      createClient: () => ({ createResponseText: async () => ({ returnedModelId: "segmenter-v1", text: JSON.stringify({
        referenceId: "ref-1", segments: [
          { id: "segment-1", order: 0, startCharacter: 0, endCharacter: 12, type: "hook", text: "Hello world.", function: "Open the topic" },
          { id: "segment-2", order: 1, startCharacter: 13, endCharacter: cleanedTranscript.length, type: "evidence", text: "Evidence follows.", function: "Support the opening" }
        ]
      }) }) })
    });
    expect(result.output.segments).toHaveLength(2);
    db.close();
  });

  it("fails closed when a segment invents text outside the approved transcript", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    await expect(runReferenceSegmentation({
      referenceId: "ref-1", cleanedTranscript: "Hello world.", credentialStore, certificationStore,
      createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify({ referenceId: "ref-1", segments: [
        { id: "segment-1", order: 0, startCharacter: 0, endCharacter: 12, type: "hook", text: "Invented text", function: "Invalid" }
      ] }) }) })
    })).rejects.toMatchObject({ category: "invalid_output" });
    db.close();
  });
});
