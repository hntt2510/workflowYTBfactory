import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryKeychain, openFactoryDatabase, ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { scriptOutputSchema } from "@lsf/domain";
import { fingerprintBaseUrl } from "./nineRouterTextCertificationService";
import { reviseScript } from "./scriptRevisionService";

const script = scriptOutputSchema.parse({ sections: [
  { id: "section-a", outlineSectionId: "outline-a", purpose: "Hook", narration: "Mở đầu", estimatedWords: 2, estimatedSeconds: 1, linkedClaimIds: [], dramaticFunction: "Hook", visualOpportunities: [], proofObjects: [], retentionRisk: "low" },
  { id: "section-b", outlineSectionId: "outline-b", purpose: "Payoff", narration: "Kết thúc", estimatedWords: 2, estimatedSeconds: 1, linkedClaimIds: [], dramaticFunction: "Payoff", visualOpportunities: [], proofObjects: [], retentionRisk: "low" }
] });

async function setup() {
  const db = openFactoryDatabase(join(mkdtempSync(join(tmpdir(), "lsf-script-revision-")), "factory.sqlite"));
  const credentials = new ProviderCredentialStore(db, new MemoryKeychain());
  const certifications = new TextCertificationStore(db);
  await credentials.saveProviderCredential({ providerId: "cockpit", baseUrl: "http://127.0.0.1:20128/v1", textModel: "revision-v1" }, "sk-secret");
  certifications.saveTextCertificationRecord({ id: "cert-revision", providerId: "cockpit", configuredModelId: "revision-v1", baseUrlFingerprint: fingerprintBaseUrl("http://127.0.0.1:20128/v1")!, credentialVersionRef: credentials.loadProviderCredentialVersionRef("cockpit"), endpointStrategy: "responses", implementationVersion: "text-capability-v1", exactTextTest: { status: "passed", latencyMs: 1 }, strictJsonTest: { status: "passed", latencyMs: 1 }, overallStatus: "verified", testedAt: "2026-08-09T00:00:00.000Z" });
  return { db, credentials, certifications };
}

describe("script revision service", () => {
  it("preserves sections outside selected findings", async () => {
    const { db, credentials, certifications } = await setup();
    const result = await reviseScript({ script, findings: [{ id: "finding-a", sectionId: "section-a", severity: "medium", category: "hook", explanation: "Weak", suggestedDirection: "Clarify" }], profile: {}, language: "Vietnamese", credentialStore: credentials, certificationStore: certifications, createProvider: () => ({ generateStructured: async () => ({ data: { ...script, sections: [{ ...script.sections[0]!, narration: "Mở đầu rõ hơn" }, script.sections[1]!] } }) } as never) });
    expect(result.output.sections[1]?.narration).toBe("Kết thúc");
    db.close();
  });
});
