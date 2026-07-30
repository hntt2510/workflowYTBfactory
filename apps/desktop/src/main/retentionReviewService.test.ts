import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { MemoryKeychain, openFactoryDatabase, ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { fingerprintBaseUrl } from "./nineRouterTextCertificationService";
import { runRetentionReview } from "./retentionReviewService";

async function setup() { const db = openFactoryDatabase(join(mkdtempSync(join(tmpdir(), "lsf-retention-")), "factory.sqlite")); const credentialStore = new ProviderCredentialStore(db, new MemoryKeychain()); const certificationStore = new TextCertificationStore(db); await credentialStore.saveProviderCredential({ providerId: "9router", baseUrl: "http://127.0.0.1:20128/v1", textModel: "review-v1" }, "sk-secret"); certificationStore.saveTextCertificationRecord({ id: "cert-retention", providerId: "9router", configuredModelId: "review-v1", baseUrlFingerprint: fingerprintBaseUrl("http://127.0.0.1:20128/v1")!, credentialVersionRef: credentialStore.loadProviderCredentialVersionRef("9router"), endpointStrategy: "responses", implementationVersion: "text-certification-v1", exactTextTest: { status: "passed", latencyMs: 1 }, strictJsonTest: { status: "passed", latencyMs: 1 }, overallStatus: "verified", testedAt: "2026-07-30T00:00:00.000Z" }); return { db, credentialStore, certificationStore }; }

describe("retention review service", () => {
  it("accepts findings bound to approved script sections", async () => { const { db, credentialStore, certificationStore } = await setup(); const result = await runRetentionReview({ script: { sections: [{ id: "section-1", purpose: "Hook", narration: "A claim opens the story.", estimatedSeconds: 5, retentionRisk: "low" }] }, credentialStore, certificationStore, createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify({ overallVerdict: "needs_changes", findings: [{ sectionId: "section-1", severity: "medium", reason: "Promise arrives late.", recommendedChange: "Clarify the promise sooner." }] }) }) }) }); expect(result.output.findings[0]?.sectionId).toBe("section-1"); db.close(); });
  it("rejects a finding for an unknown script section", async () => { const { db, credentialStore, certificationStore } = await setup(); await expect(runRetentionReview({ script: { sections: [{ id: "section-1", purpose: "Hook", narration: "A claim opens the story.", estimatedSeconds: 5, retentionRisk: "low" }] }, credentialStore, certificationStore, createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify({ overallVerdict: "pass", findings: [{ sectionId: "missing", severity: "low", reason: "x", recommendedChange: "y" }] }) }) }) })).rejects.toMatchObject({ category: "invalid_output" }); db.close(); });
});
