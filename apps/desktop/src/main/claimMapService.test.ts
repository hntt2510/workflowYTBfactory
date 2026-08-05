import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryKeychain, openFactoryDatabase, ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { NineRouterTextResponseError } from "@lsf/providers";
import { fingerprintBaseUrl } from "./nineRouterTextCertificationService";
import { claimMapMaxChunkCharacters, namespaceClaimMapOutput, runClaimMap } from "./claimMapService";

async function setup() { const db = openFactoryDatabase(join(mkdtempSync(join(tmpdir(), "lsf-claims-")), "factory.sqlite")); const credentialStore = new ProviderCredentialStore(db, new MemoryKeychain()); const certificationStore = new TextCertificationStore(db); await credentialStore.saveProviderCredential({ providerId: "9router", baseUrl: "http://127.0.0.1:20128/v1", textModel: "claims-v1" }, "sk-secret"); certificationStore.saveTextCertificationRecord({ id: "cert-claims", providerId: "9router", configuredModelId: "claims-v1", baseUrlFingerprint: fingerprintBaseUrl("http://127.0.0.1:20128/v1")!, credentialVersionRef: credentialStore.loadProviderCredentialVersionRef("9router"), endpointStrategy: "responses", implementationVersion: "text-certification-v1", exactTextTest: { status: "passed", latencyMs: 1 }, strictJsonTest: { status: "passed", latencyMs: 1 }, overallStatus: "verified", testedAt: "2026-07-30T00:00:00.000Z" }); return { db, credentialStore, certificationStore }; }
const sources = [{ id: "source-1", sourceType: "primary" as const, title: "Official source", excerpt: "The policy begins on January 1." }];
const claim = { id: "claim-1", text: "The policy begins on January 1.", type: "fact", sourceRequirement: "primary", sourceIds: ["source-1"], evidenceNote: "Direct quotation.", confidence: 0.95, state: "verified", approvalState: "allowed" };
describe("claim map service", () => {
  it("namespaces model claim IDs so projects cannot collide in SQLite", () => {
    const output = namespaceClaimMapOutput({ claims: [claim] }, "project-alpha");
    const otherOutput = namespaceClaimMapOutput({ claims: [claim] }, "project-beta");
    expect(output.claims[0]?.id).toBe("project-alpha-claim-1");
    expect(otherOutput.claims[0]?.id).toBe("project-beta-claim-1");
    expect(output.claims[0]?.sourceIds).toEqual(["source-1"]);
  });

  it("accepts a source-linked supported claim", async () => { const { db, credentialStore, certificationStore } = await setup(); const result = await runClaimMap({ sources, credentialStore, certificationStore, createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify({ claims: [claim] }) }) }) }); expect(result.output.claims[0]?.sourceIds).toEqual(["source-1"]); db.close(); });
  it("splits long transcript input instead of sending the full excerpt in one request", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const longExcerpt = Array.from({ length: claimMapMaxChunkCharacters * 2 }, (_, index) => index % 12 === 0 ? "Fact." : "word").join(" ");
    let calls = 0;
    let largestInput = 0;
    const result = await runClaimMap({
      sources: [{ ...sources[0]!, excerpt: longExcerpt }],
      credentialStore,
      certificationStore,
      createClient: () => ({
        createResponseText: async (request) => {
          calls += 1;
          largestInput = Math.max(largestInput, request.input.length);
          return { text: JSON.stringify({ claims: [{ ...claim, id: `claim-${calls}`, text: `Claim ${calls}` }] }) };
        }
      })
    });
    expect(calls).toBeGreaterThan(1);
    expect(largestInput).toBeLessThan(longExcerpt.length);
    expect(result.output.claims).toHaveLength(calls);
    db.close();
  });

  it("retries a transient chunk timeout once with a bounded attempt count", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    let attempts = 0;
    const result = await runClaimMap({
      sources,
      credentialStore,
      certificationStore,
      createClient: () => ({
        createResponseText: async () => {
          attempts += 1;
          if (attempts === 1) throw new NineRouterTextResponseError("timeout", "timed out");
          return { text: JSON.stringify({ claims: [claim] }) };
        }
      })
    });
    expect(attempts).toBe(2);
    expect(result.output.claims[0]?.text).toBe(claim.text);
    db.close();
  });
  it("fails closed when an allegation is allowed", async () => { const { db, credentialStore, certificationStore } = await setup(); await expect(runClaimMap({ sources, credentialStore, certificationStore, createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify({ claims: [{ ...claim, type: "allegation", qualification: "Reported allegation.", approvalState: "allowed" }] }) }) }) })).rejects.toMatchObject({ category: "invalid_output" }); db.close(); });
});
