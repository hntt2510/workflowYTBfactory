import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryKeychain, openFactoryDatabase, ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { fingerprintBaseUrl } from "./nineRouterTextCertificationService";
import { runTranscriptCleaning } from "./transcriptCleaningService";

async function setup() {
  const db = openFactoryDatabase(join(mkdtempSync(join(tmpdir(), "lsf-clean-")), "factory.sqlite"));
  const credentialStore = new ProviderCredentialStore(db, new MemoryKeychain());
  const certificationStore = new TextCertificationStore(db);
  await credentialStore.saveProviderCredential({ providerId: "9router", baseUrl: "http://127.0.0.1:20128/v1", textModel: "cleaner-v1" }, "sk-secret");
  const credentialVersionRef = credentialStore.loadProviderCredentialVersionRef("9router");
  certificationStore.saveTextCertificationRecord({
    id: "cert-1", providerId: "9router", configuredModelId: "cleaner-v1",
    baseUrlFingerprint: fingerprintBaseUrl("http://127.0.0.1:20128/v1")!,
    ...(credentialVersionRef ? { credentialVersionRef } : {}), endpointStrategy: "responses",
    implementationVersion: "text-certification-v1", exactTextTest: { status: "passed", latencyMs: 1 },
    strictJsonTest: { status: "passed", latencyMs: 1 }, overallStatus: "verified", testedAt: "2026-07-30T00:00:00.000Z"
  });
  return { db, credentialStore, certificationStore };
}

describe("transcript cleaning service", () => {
  it("accepts only a matching strict JSON output and reports content-loss warnings", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const transcript = "00:00 Hello Hello world";
    const cleanedTranscript = "Hello world";
    const result = await runTranscriptCleaning({
      referenceId: "ref-1", sourceTranscriptVersionId: "ref-1", transcript, credentialStore, certificationStore,
      createClient: () => ({ createResponseText: async () => ({
        returnedModelId: "cleaner-v1",
        text: JSON.stringify({ referenceId: "ref-1", sourceTranscriptVersionId: "ref-1", cleanedTranscript,
          removedSegments: [{ text: "00:00", reason: "timestamp" }], flaggedSegments: [],
          sourceCharacterCount: transcript.length, cleanedCharacterCount: cleanedTranscript.length })
      }) })
    });
    expect(result.output.cleanedTranscript).toBe(cleanedTranscript);
    expect(result.warnings).toContain("excessive_content_loss");
    db.close();
  });

  it("fails closed when the provider does not return strict JSON", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    await expect(runTranscriptCleaning({
      referenceId: "ref-1", sourceTranscriptVersionId: "ref-1", transcript: "A sufficiently long transcript.", credentialStore, certificationStore,
      createClient: () => ({ createResponseText: async () => ({ text: "```json {} ```" }) })
    })).rejects.toMatchObject({ category: "invalid_json" });
    db.close();
  });
});
