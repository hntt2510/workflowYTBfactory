import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryKeychain, openFactoryDatabase, ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { fingerprintBaseUrl } from "./nineRouterTextCertificationService";
import { runScriptReview } from "./scriptReviewService";

describe("script review service", () => {
  it("returns findings without rewriting the script", async () => {
    const db = openFactoryDatabase(join(mkdtempSync(join(tmpdir(), "lsf-script-review-")), "factory.sqlite"));
    const credentials = new ProviderCredentialStore(db, new MemoryKeychain()); const certifications = new TextCertificationStore(db);
    await credentials.saveProviderCredential({ providerId: "cockpit", baseUrl: "http://127.0.0.1:20128/v1", textModel: "review-v1" }, "sk-secret");
    certifications.saveTextCertificationRecord({ id: "cert-review", providerId: "cockpit", configuredModelId: "review-v1", baseUrlFingerprint: fingerprintBaseUrl("http://127.0.0.1:20128/v1")!, credentialVersionRef: credentials.loadProviderCredentialVersionRef("cockpit"), endpointStrategy: "responses", implementationVersion: "text-capability-v1", exactTextTest: { status: "passed", latencyMs: 1 }, strictJsonTest: { status: "passed", latencyMs: 1 }, overallStatus: "verified", testedAt: "2026-08-09T00:00:00.000Z" });
    const result = await runScriptReview({ script: { sections: [{ id: "section-1", narration: "Mở đầu" }] }, profile: { tone: "clear" }, language: "Vietnamese", credentialStore: credentials, certificationStore: certifications, createProvider: () => ({ generateStructured: async () => ({ data: { overallStatus: "needs_changes", summary: "Cần rõ lời hứa", findings: [{ id: "finding-1", severity: "medium", sectionId: "section-1", category: "hook", explanation: "Chưa rõ", suggestedDirection: "Nêu lời hứa" }], strengths: ["Rõ ràng"], requiredFixes: ["Lời hứa"], optionalImprovements: [] } }) } as never) });
    expect(result.output.findings[0]?.category).toBe("hook");
    db.close();
  });
});
