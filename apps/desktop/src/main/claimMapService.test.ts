import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryKeychain, openFactoryDatabase, ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { fingerprintBaseUrl } from "./nineRouterTextCertificationService";
import { runClaimMap } from "./claimMapService";

async function setup() { const db = openFactoryDatabase(join(mkdtempSync(join(tmpdir(), "lsf-claims-")), "factory.sqlite")); const credentialStore = new ProviderCredentialStore(db, new MemoryKeychain()); const certificationStore = new TextCertificationStore(db); await credentialStore.saveProviderCredential({ providerId: "9router", baseUrl: "http://127.0.0.1:20128/v1", textModel: "claims-v1" }, "sk-secret"); certificationStore.saveTextCertificationRecord({ id: "cert-claims", providerId: "9router", configuredModelId: "claims-v1", baseUrlFingerprint: fingerprintBaseUrl("http://127.0.0.1:20128/v1")!, credentialVersionRef: credentialStore.loadProviderCredentialVersionRef("9router"), endpointStrategy: "responses", implementationVersion: "text-certification-v1", exactTextTest: { status: "passed", latencyMs: 1 }, strictJsonTest: { status: "passed", latencyMs: 1 }, overallStatus: "verified", testedAt: "2026-07-30T00:00:00.000Z" }); return { db, credentialStore, certificationStore }; }
const sources = [{ id: "source-1", sourceType: "primary" as const, title: "Official source", excerpt: "The policy begins on January 1." }];
const claim = { id: "claim-1", text: "The policy begins on January 1.", type: "fact", sourceRequirement: "primary", sourceIds: ["source-1"], evidenceNote: "Direct quotation.", confidence: 0.95, state: "verified", approvalState: "allowed" };
describe("claim map service", () => {
  it("accepts a source-linked supported claim", async () => { const { db, credentialStore, certificationStore } = await setup(); const result = await runClaimMap({ sources, credentialStore, certificationStore, createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify({ claims: [claim] }) }) }) }); expect(result.output.claims[0]?.sourceIds).toEqual(["source-1"]); db.close(); });
  it("fails closed when an allegation is allowed", async () => { const { db, credentialStore, certificationStore } = await setup(); await expect(runClaimMap({ sources, credentialStore, certificationStore, createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify({ claims: [{ ...claim, type: "allegation", qualification: "Reported allegation.", approvalState: "allowed" }] }) }) }) })).rejects.toMatchObject({ category: "invalid_output" }); db.close(); });
});
