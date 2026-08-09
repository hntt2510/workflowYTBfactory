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
  await credentialStore.saveProviderCredential({ providerId: "cockpit", baseUrl: "http://127.0.0.1:20128/v1", textModel: "segmenter-v1" }, "sk-secret");
  const credentialVersionRef = credentialStore.loadProviderCredentialVersionRef("cockpit");
  certificationStore.saveTextCertificationRecord({
    id: "cert-1", providerId: "cockpit", configuredModelId: "segmenter-v1",
    baseUrlFingerprint: fingerprintBaseUrl("http://127.0.0.1:20128/v1")!,
    ...(credentialVersionRef ? { credentialVersionRef } : {}), endpointStrategy: "responses",
    implementationVersion: "text-capability-v1", exactTextTest: { status: "passed", latencyMs: 1 },
    strictJsonTest: { status: "passed", latencyMs: 1 }, overallStatus: "verified", testedAt: "2026-07-30T00:00:00.000Z"
  });
  return { db, credentialStore, certificationStore };
}

describe("reference segmentation service", () => {
  it("accepts segments that exactly map to the approved cleaned transcript", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const cleanedTranscript = "Hello world. Evidence follows.";
    const result = await runReferenceSegmentation({
      referenceId: "ref-1", cleanedTranscriptArtifactId: "artifact-cleaned-1", cleanedTranscript, credentialStore, certificationStore,
      createClient: () => ({ createResponseText: async () => ({ returnedModelId: "segmenter-v1", text: JSON.stringify({
        referenceId: "ref-1", cleanedTranscriptArtifactId: "artifact-cleaned-1", excludedSegmentIds: [], segments: [
          { id: "segment-1", order: 0, startCharacter: 0, endCharacter: 12, type: "hook", text: "Hello world.", function: "Open the topic", includedForDna: true },
          { id: "segment-2", order: 1, startCharacter: 12, endCharacter: cleanedTranscript.length, type: "evidence", text: " Evidence follows.", function: "Support the opening", includedForDna: true }
        ]
      }) }) })
    });
    expect(result.output.segments).toHaveLength(2);
    db.close();
  });

  it("segments long cleaned transcripts sequentially and merges exact ranges", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const cleanedTranscript = "First paragraph.\n\nSecond paragraph.";
    let calls = 0;
    const result = await runReferenceSegmentation({
      referenceId: "ref-1", cleanedTranscriptArtifactId: "artifact-cleaned-1", cleanedTranscript, maxChunkCharacters: 18, credentialStore, certificationStore,
      createClient: () => ({ createResponseText: async ({ input }) => {
        calls += 1;
        const chunk = input.split("Approved cleaned transcript chunk follows:\n")[1] ?? "";
        return { text: JSON.stringify({ referenceId: "ref-1", cleanedTranscriptArtifactId: "artifact-cleaned-1", excludedSegmentIds: [], segments: [
          { id: "segment-1", order: 0, startCharacter: 0, endCharacter: chunk.length, type: "story", text: chunk, function: "Advance the narrative", includedForDna: true }
        ] }) };
      } })
    });
    expect(calls).toBeGreaterThan(1);
    expect(result.output.segments.map((segment) => segment.text).join("")).toBe(cleanedTranscript);
    expect(result.output.segments.every((segment, index, segments) => index === 0 ? segment.startCharacter === 0 : segment.startCharacter === segments[index - 1]!.endCharacter)).toBe(true);
    db.close();
  });

  it("fails closed when a segment invents text outside the approved transcript", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    await expect(runReferenceSegmentation({
      referenceId: "ref-1", cleanedTranscriptArtifactId: "artifact-cleaned-1", cleanedTranscript: "Hello world.", credentialStore, certificationStore,
      createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify({ referenceId: "ref-1", segments: [
        { id: "segment-1", order: 0, startCharacter: 0, endCharacter: 12, type: "hook", text: "Invented text", function: "Invalid" }
      ] }) }) })
    })).rejects.toMatchObject({ category: "invalid_output" });
    db.close();
  });
});
