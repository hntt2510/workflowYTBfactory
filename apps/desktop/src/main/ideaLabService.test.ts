import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryKeychain, openFactoryDatabase, ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { generateIdeaLab } from "@lsf/domain";
import { TextProviderError, type TextProvider } from "@lsf/providers";
import { fingerprintBaseUrl } from "./nineRouterTextCertificationService";
import { runIdeaLab } from "./ideaLabService";

async function setup() {
  const db = openFactoryDatabase(join(mkdtempSync(join(tmpdir(), "lsf-ideas-")), "factory.sqlite"));
  const credentialStore = new ProviderCredentialStore(db, new MemoryKeychain());
  const certificationStore = new TextCertificationStore(db);
  await credentialStore.saveProviderCredential({ providerId: "cockpit", baseUrl: "http://127.0.0.1:20128/v1", textModel: "ideas-v1" }, "sk-secret");
  certificationStore.saveTextCertificationRecord({ id: "cert-ideas", providerId: "cockpit", configuredModelId: "ideas-v1", baseUrlFingerprint: fingerprintBaseUrl("http://127.0.0.1:20128/v1")!, credentialVersionRef: credentialStore.loadProviderCredentialVersionRef("cockpit"), endpointStrategy: "responses", implementationVersion: "text-capability-v1", exactTextTest: { status: "passed", latencyMs: 1 }, strictJsonTest: { status: "passed", latencyMs: 1 }, overallStatus: "verified", testedAt: "2026-07-30T00:00:00.000Z" });
  return { db, credentialStore, certificationStore };
}

const profile = { id: "profile-1", name: "Test channel", mainKeyword: "testing" };
const candidates = generateIdeaLab("A safe topic", profile as never).map(({ estimatedValidationCost: _ignored, ...candidate }) => candidate);
const input = { opportunityMap: { recommendedContentSpaces: [] }, topic: "A safe topic", profile, format: "long", language: "en", targetDuration: "10 minutes" };
function structuredProvider(data: unknown): TextProvider { return { providerId: "test", healthCheck: async () => ({ reachable: true, modelsAvailable: true }), listModels: async () => [], generateText: async () => ({ text: "unused" }), generateStructured: async () => ({ data: data as never }) }; }

describe("idea lab service", () => {
  it("accepts the required two-by-two-by-two candidate distribution", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const result = await runIdeaLab({ ...input, credentialStore, certificationStore, createProvider: () => structuredProvider({ candidates }) });
    expect(result.output.candidates).toHaveLength(6);
    db.close();
  });

  it("fails closed when provider output has an invalid research-risk distribution", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const invalidCandidates = candidates.map((candidate) => ({ ...candidate, researchRisk: "low" }));
    await expect(runIdeaLab({ ...input, credentialStore, certificationStore, createProvider: () => ({ ...structuredProvider({}), generateStructured: async () => { throw new TextProviderError("schema_validation_failed", "invalid", { providerId: "test", operation: "generate_structured" }); } }) })).rejects.toMatchObject({ category: "invalid_output" });
    db.close();
  });

  it("fails closed when provider output reuses a candidate ID", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const duplicatedCandidates = candidates.map((candidate, index) => index === 1 ? { ...candidate, id: candidates[0]!.id } : candidate);
    await expect(runIdeaLab({ ...input, credentialStore, certificationStore, createProvider: () => structuredProvider({ candidates: duplicatedCandidates }) })).rejects.toMatchObject({ category: "invalid_output" });
    db.close();
  });
});
