import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryKeychain, openFactoryDatabase, ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { fingerprintBaseUrl } from "./nineRouterTextCertificationService";
import { runScript } from "./scriptService";
import { buildChannelPromptProfile, createDefaultChannelDna, resolveChannelPromptContext } from "@lsf/domain";

async function setup() { const db = openFactoryDatabase(join(mkdtempSync(join(tmpdir(), "lsf-script-")), "factory.sqlite")); const credentialStore = new ProviderCredentialStore(db, new MemoryKeychain()); const certificationStore = new TextCertificationStore(db); await credentialStore.saveProviderCredential({ providerId: "9router", baseUrl: "http://127.0.0.1:20128/v1", textModel: "script-v1" }, "sk-secret"); certificationStore.saveTextCertificationRecord({ id: "cert-script", providerId: "9router", configuredModelId: "script-v1", baseUrlFingerprint: fingerprintBaseUrl("http://127.0.0.1:20128/v1")!, credentialVersionRef: credentialStore.loadProviderCredentialVersionRef("9router"), endpointStrategy: "responses", implementationVersion: "text-certification-v1", exactTextTest: { status: "passed", latencyMs: 1 }, strictJsonTest: { status: "passed", latencyMs: 1 }, overallStatus: "verified", testedAt: "2026-07-30T00:00:00.000Z" }); return { db, credentialStore, certificationStore }; }
const output = { sections: [{ id: "script-1", outlineSectionId: "outline-1", purpose: "Hook", narration: "The approved claim opens the story.", estimatedWords: 8, estimatedSeconds: 5, linkedClaimIds: ["claim-1"], dramaticFunction: "Open question", visualOpportunities: [], proofObjects: [], retentionRisk: "low" }] };
describe("script service", () => {
  it("accepts a script bound to its outline claim", async () => { const { db, credentialStore, certificationStore } = await setup(); const result = await runScript({ outline: { sections: [{ id: "outline-1", linkedClaimIds: ["claim-1"] }] }, claims: [{ id: "claim-1", state: "verified", approvalState: "allowed" }], language: "Vietnamese", credentialStore, certificationStore, createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify(output) }) }) }); expect(result.output.sections[0]?.outlineSectionId).toBe("outline-1"); db.close(); });

  it("does not serialize provider stores into the model prompt", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    let prompt = "";
    await runScript({ outline: { sections: [{ id: "outline-1", linkedClaimIds: ["claim-1"] }] }, claims: [{ id: "claim-1", state: "verified", approvalState: "allowed" }], language: "Vietnamese", credentialStore, certificationStore, createClient: () => ({ createResponseText: async (request) => { prompt = request.input; return { text: JSON.stringify(output) }; } }) });
    expect(prompt).not.toContain("credentialStore");
    expect(prompt).not.toContain("certificationStore");
    expect(prompt).toContain("target language is Vietnamese");
    db.close();
  });

  it("rejects a claim that the outline does not link", async () => { const { db, credentialStore, certificationStore } = await setup(); await expect(runScript({ outline: { sections: [{ id: "outline-1", linkedClaimIds: [] }] }, claims: [{ id: "claim-1", state: "verified", approvalState: "allowed" }], language: "Vietnamese", credentialStore, certificationStore, createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify(output) }) }) })).rejects.toMatchObject({ category: "invalid_output" }); db.close(); });

  it("accepts a script without claims", async () => { const { db, credentialStore, certificationStore } = await setup(); const result = await runScript({ outline: { sections: [{ id: "outline-1", linkedClaimIds: [] }] }, claims: [], language: "Vietnamese", credentialStore, certificationStore, createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify({ sections: [{ ...output.sections[0], linkedClaimIds: [] }] }) }) }) }); expect(result.output.sections[0]?.linkedClaimIds).toEqual([]); db.close(); });

  it("passes only the selected channel content context to the script provider", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const profile = buildChannelPromptProfile({ channelId: "milo-red-panda", channelDna: createDefaultChannelDna({ styleId: "cute-daily-life-cartoon" }), niche: "Character daily life" });
    const promptContext = resolveChannelPromptContext({ channelId: profile.channelId, profile, taskType: "story" });
    let prompt = "";
    await runScript({ outline: { sections: [{ id: "outline-1", linkedClaimIds: [] }] }, claims: [], language: "Vietnamese", promptContext, credentialStore, certificationStore, createClient: () => ({ createResponseText: async (request) => { prompt = request.input; return { text: JSON.stringify({ sections: [{ ...output.sections[0], linkedClaimIds: [] }] }) }; } }) });
    expect(prompt).toContain("milo-red-panda");
    expect(prompt).toContain("Character daily life");
    expect(prompt).not.toContain("Insurance Made Simple");
    db.close();
  });
});
