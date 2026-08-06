import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryKeychain, openFactoryDatabase, ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { buildChannelPromptProfile, createDefaultChannelDna, resolveChannelPromptContext, type CharacterVersion } from "@lsf/domain";
import { NineRouterTextResponseError } from "@lsf/providers";
import { fingerprintBaseUrl } from "./nineRouterTextCertificationService";
import { runAssetConcepts } from "./assetConceptService";

async function setupProvider() {
  const db = openFactoryDatabase(join(mkdtempSync(join(tmpdir(), "lsf-asset-concepts-")), "factory.sqlite"));
  const credentialStore = new ProviderCredentialStore(db, new MemoryKeychain());
  const certificationStore = new TextCertificationStore(db);
  const baseUrl = "http://127.0.0.1:20128/v1";
  await credentialStore.saveProviderCredential({ providerId: "9router", baseUrl, textModel: "concept-model" }, "sk-test");
  certificationStore.saveTextCertificationRecord({
    id: "concept-cert",
    providerId: "9router",
    configuredModelId: "concept-model",
    baseUrlFingerprint: fingerprintBaseUrl(baseUrl)!,
    credentialVersionRef: credentialStore.loadProviderCredentialVersionRef("9router"),
    endpointStrategy: "responses",
    implementationVersion: "text-certification-v1",
    exactTextTest: { status: "passed", latencyMs: 1 },
    strictJsonTest: { status: "passed", latencyMs: 1 },
    overallStatus: "verified",
    testedAt: "2026-08-04T00:00:00.000Z"
  });
  return { db, credentialStore, certificationStore };
}

const character = {
  name: "Mina",
  persona: { role: "Finance teacher", ageRange: "30-40", appearance: "Short dark hair", wardrobe: "Navy blazer", palette: "Navy and amber", props: [], gestures: [], tone: "Clear" },
  invariantTraits: ["round glasses"],
  prohibitedChanges: ["identity"]
} as unknown as CharacterVersion;

describe("asset concept service", () => {
  it("includes character lock and validates one concept per shot", async () => {
    const { db, credentialStore, certificationStore } = await setupProvider();
    const profile = buildChannelPromptProfile({ channelId: "insurance-made-simple", channelDna: createDefaultChannelDna({ styleId: "minimal-infographic" }), niche: "Insurance education" });
    const promptContext = resolveChannelPromptContext({ channelId: profile.channelId, profile, taskType: "director" });
    const result = await runAssetConcepts({
      shots: [{ id: "shot-1", purpose: "Explain cash flow", visualMode: "ai_image", semanticBeat: "Cash rises", subjectAction: "increase", startState: {}, endState: {} }],
      character,
      promptContext,
      credentialStore,
      certificationStore,
      createClient: () => ({
        createResponseText: async ({ input }) => {
          expect(input).toContain("Character lock");
          expect(input).toContain("Mina");
          expect(input).toContain("insurance-made-simple");
          expect(input).not.toContain("milo-red-panda");
          return { text: JSON.stringify({ concepts: [{ id: "asset-1", shotId: "shot-1", semanticBeat: "Cash rises", kind: "object", role: "Money stack", description: "A rising stack of money.", visualConstraints: ["clean"], colorPalette: ["green"], motionIntent: "slide up", needsReferenceImage: false }] }) };
        }
      })
    });
    expect(result.output.concepts).toHaveLength(1);
    db.close();
  });

  it("maps concepts to approved channel assets and rejects unknown asset references", async () => {
    const { db, credentialStore, certificationStore } = await setupProvider();
    const channelDna = createDefaultChannelDna({ styleId: "minimal-infographic" });
    channelDna.assets = [{ id: "cash-stack", name: "Cash stack", kind: "prop", description: "A neat stack of cash.", tags: ["cash", "money"], approved: true }];
    const profile = buildChannelPromptProfile({ channelId: "insurance-made-simple", channelDna, niche: "Insurance education" });
    const promptContext = resolveChannelPromptContext({ channelId: profile.channelId, profile, taskType: "director" });
    let request = "";
    const concept = { id: "asset-1", shotId: "shot-1", semanticBeat: "Cash rises", kind: "object" as const, role: "Money stack", description: "A rising stack of money.", visualConstraints: ["clean"], colorPalette: ["green"], motionIntent: "slide up", needsReferenceImage: false, referenceAssetId: "cash-stack" };
    await expect(runAssetConcepts({
      shots: [{ id: "shot-1", purpose: "Explain cash flow", visualMode: "ai_image", semanticBeat: "Cash rises", subjectAction: "increase", startState: {}, endState: {} }],
      character,
      promptContext,
      credentialStore,
      certificationStore,
      createClient: () => ({ createResponseText: async ({ input }) => { request = input; return { text: JSON.stringify({ concepts: [concept] }) }; } })
    })).resolves.toMatchObject({ output: { concepts: [{ referenceAssetId: "cash-stack" }] } });
    expect(request).toContain("Cash stack");
    await expect(runAssetConcepts({
      shots: [{ id: "shot-1", purpose: "Explain cash flow", visualMode: "ai_image", subjectAction: "increase", startState: {}, endState: {} }],
      character,
      promptContext,
      credentialStore,
      certificationStore,
      createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify({ concepts: [{ ...concept, referenceAssetId: "other-channel-asset" }] }) }) })
    })).rejects.toMatchObject({ category: "invalid_output" });
    db.close();
  });

  it("rejects an output that omits a shot", async () => {
    const { db, credentialStore, certificationStore } = await setupProvider();
    await expect(runAssetConcepts({
      shots: [
        { id: "shot-1", purpose: "Explain", visualMode: "ai_image", subjectAction: "show", startState: {}, endState: {} },
        { id: "shot-2", purpose: "Explain", visualMode: "ai_image", subjectAction: "show", startState: {}, endState: {} }
      ],
      character,
      credentialStore,
      certificationStore,
      createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify({ concepts: [{ id: "asset-1", shotId: "shot-1", semanticBeat: "Beat", kind: "object", role: "Object", description: "Description", visualConstraints: [], colorPalette: [], motionIntent: "none", needsReferenceImage: false }] }) }) })
    })).rejects.toMatchObject({ category: "invalid_output" });
    db.close();
  });

  it("normalizes provider timeouts for safe retry handling", async () => {
    const { db, credentialStore, certificationStore } = await setupProvider();
    await expect(runAssetConcepts({
      shots: [{ id: "shot-1", purpose: "Explain", visualMode: "ai_image", subjectAction: "show", startState: {}, endState: {} }],
      character,
      credentialStore,
      certificationStore,
      createClient: () => ({ createResponseText: async () => { throw new NineRouterTextResponseError("timeout", "provider timeout"); } })
    })).rejects.toMatchObject({ category: "provider_failed", message: "Asset Concepts provider request failed: timeout." });
    db.close();
  });

  it("batches large shot plans before calling the provider", async () => {
    const { db, credentialStore, certificationStore } = await setupProvider();
    const shots = Array.from({ length: 5 }, (_, index) => ({ id: `shot-${index + 1}`, purpose: "Explain", visualMode: "ai_image", subjectAction: "show", startState: {}, endState: {} }));
    let calls = 0;
    const result = await runAssetConcepts({
      shots,
      character,
      credentialStore,
      certificationStore,
      createClient: () => ({
        createResponseText: async () => {
          const batch = shots.slice(calls++ * 4, calls * 4);
          return { text: JSON.stringify({ concepts: batch.map((shot, index) => ({ id: `asset-${shot.id}`, shotId: shot.id, semanticBeat: "Beat", kind: "object", role: `Object ${index}`, description: "Description", visualConstraints: [], colorPalette: [], motionIntent: "none", needsReferenceImage: false })) }) };
        }
      })
    });
    expect(calls).toBe(2);
    expect(result.output.concepts).toHaveLength(5);
    db.close();
  });
});
