import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MemoryKeychain, openFactoryDatabase, ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { characterReferenceViewsForCount, type CharacterVersion } from "@lsf/domain";
import { fingerprintBaseUrl } from "./nineRouterTextCertificationService";
import { promptPreparationTimeoutMs, runPromptPreparation } from "./promptPreparationService";

describe("prompt preparation service", () => {
  it("returns an empty output without provider access when no shots are AI-routed", async () => { const db = openFactoryDatabase(join(mkdtempSync(join(tmpdir(), "lsf-prompts-empty-")), "factory.sqlite")); const credentials = new ProviderCredentialStore(db, new MemoryKeychain()); const createResponseText = vi.fn(); await expect(runPromptPreparation({ shots: [{ id: "shot-1", visualMode: "document", framing: "Close", cameraAngle: "Eye", cameraMovement: "Static", subjectAction: "Reveal", continuityRefs: [] }], aspectRatio: "16:9", credentialStore: credentials, certificationStore: new TextCertificationStore(db), createClient: () => ({ createResponseText }) })).resolves.toMatchObject({ output: { prompts: [] } }); expect(createResponseText).not.toHaveBeenCalled(); db.close(); });
  it("keeps every manual storyboard frame in the scene prompt package", async () => {
    const db = openFactoryDatabase(join(mkdtempSync(join(tmpdir(), "lsf-prompts-scene-")), "factory.sqlite"));
    const result = await runPromptPreparation({
      manualMode: true,
      shots: [
        { id: "shot-1", sceneId: "scene-1", visualMode: "ai_image", framing: "Medium", cameraAngle: "Eye", cameraMovement: "Static", subjectAction: "Explain", continuityRefs: [] },
        { id: "shot-2", sceneId: "scene-1", visualMode: "reuse", framing: "Medium", cameraAngle: "Eye", cameraMovement: "Static", subjectAction: "Hold", continuityRefs: ["shot-1"] },
        { id: "shot-3", sceneId: "scene-1", visualMode: "text_card", framing: "Wide", cameraAngle: "Front", cameraMovement: "Static", subjectAction: "Show", continuityRefs: [] }
      ],
      aspectRatio: "16:9",
      credentialStore: new ProviderCredentialStore(db, new MemoryKeychain()),
      certificationStore: new TextCertificationStore(db)
    });
    expect(result.output.scenePrompts?.[0]?.frameNumbers).toEqual(["001", "002", "003"]);
    expect(result.output.scenePrompts?.[0]?.generatedFrameNumbers).toEqual(["001", "003"]);
    expect(result.output.scenePrompts?.[0]?.frameManifest[0]?.expectedFilename).toBe("001.png");
    expect(result.output.scenePrompts?.[0]?.targetTool).toBe("GG Lab");
    expect(result.output.scenePrompts?.[0]?.frameManifest.map((frame) => frame.role)).toEqual(["BASE", "REUSE", "ACTION_KEYFRAME"]);
    db.close();
  });
  it("uses the extended provider timeout and rejects prompts not bound exactly to approved AI-routed shots", async () => { const db = openFactoryDatabase(join(mkdtempSync(join(tmpdir(), "lsf-prompts-")), "factory.sqlite")); const credentials = new ProviderCredentialStore(db, new MemoryKeychain()); const certifications = new TextCertificationStore(db); await credentials.saveProviderCredential({ providerId: "cockpit", baseUrl: "http://127.0.0.1:20128/v1", textModel: "prompt-v1" }, "sk-secret"); certifications.saveTextCertificationRecord({ id: "cert-prompts", providerId: "cockpit", configuredModelId: "prompt-v1", baseUrlFingerprint: fingerprintBaseUrl("http://127.0.0.1:20128/v1")!, credentialVersionRef: credentials.loadProviderCredentialVersionRef("cockpit"), endpointStrategy: "responses", implementationVersion: "text-capability-v1", exactTextTest: { status: "passed", latencyMs: 1 }, strictJsonTest: { status: "passed", latencyMs: 1 }, overallStatus: "verified", testedAt: "2026-07-30T00:00:00.000Z" }); const input = { shots: [{ id: "shot-1", visualMode: "ai_image", framing: "Close", cameraAngle: "Eye", cameraMovement: "Static", subjectAction: "Reveal", continuityRefs: [] }], aspectRatio: "16:9" as const, credentialStore: credentials, certificationStore: certifications, createClient: () => ({ createResponseText: async (request: { timeoutMs?: number }) => { expect(request.timeoutMs).toBe(promptPreparationTimeoutMs); return { text: JSON.stringify({ prompts: [{ shotId: "missing", promptVersionId: "prompt-1", positivePrompt: "subject", negativePrompt: "text", aspectRatio: "16:9", continuityConstraints: [], prohibitedElements: [] }] }) }; } }) }; await expect(runPromptPreparation(input)).rejects.toMatchObject({ category: "invalid_output" }); db.close(); });

  it("reports completed provider batches using real batch counts", async () => {
    const db = openFactoryDatabase(join(mkdtempSync(join(tmpdir(), "lsf-prompts-progress-")), "factory.sqlite"));
    const credentials = new ProviderCredentialStore(db, new MemoryKeychain());
    const certifications = new TextCertificationStore(db);
    await credentials.saveProviderCredential({ providerId: "cockpit", baseUrl: "http://127.0.0.1:20128/v1", textModel: "prompt-v1" }, "sk-secret");
    certifications.saveTextCertificationRecord({ id: "cert-prompts-progress", providerId: "cockpit", configuredModelId: "prompt-v1", baseUrlFingerprint: fingerprintBaseUrl("http://127.0.0.1:20128/v1")!, credentialVersionRef: credentials.loadProviderCredentialVersionRef("cockpit"), endpointStrategy: "responses", implementationVersion: "text-capability-v1", exactTextTest: { status: "passed", latencyMs: 1 }, strictJsonTest: { status: "passed", latencyMs: 1 }, overallStatus: "verified", testedAt: "2026-07-30T00:00:00.000Z" });
    let batch = 0;
    const seen: Array<{ completedBatches: number; totalBatches: number }> = [];
    const shots = Array.from({ length: 5 }, (_, index) => ({ id: `shot-${index + 1}`, visualMode: "ai_image", framing: "Close", cameraAngle: "Eye", cameraMovement: "Static", subjectAction: "Reveal", continuityRefs: [] }));
    await runPromptPreparation({ shots, aspectRatio: "16:9", credentialStore: credentials, certificationStore: certifications, onBatchProgress: ({ completedBatches, totalBatches }) => { seen.push({ completedBatches, totalBatches }); }, createClient: () => ({ createResponseText: async () => { const current = shots.slice(batch * 4, ++batch * 4); return { text: JSON.stringify({ prompts: current.map((shot) => ({ shotId: shot.id, promptVersionId: `prompt-${shot.id}`, positivePrompt: "subject", negativePrompt: "text", aspectRatio: "16:9", continuityConstraints: [], prohibitedElements: [] })) }) }; } }) });
    expect(seen).toHaveLength(2);
    expect(seen.every((progress) => progress.totalBatches === 2)).toBe(true);
    expect(seen.map((progress) => progress.completedBatches).sort()).toEqual([1, 2]);
    db.close();
  });

  it("appends the character framing and approved asset mapping to every AI prompt", async () => {
    const db = openFactoryDatabase(join(mkdtempSync(join(tmpdir(), "lsf-prompts-contract-")), "factory.sqlite"));
    const credentials = new ProviderCredentialStore(db, new MemoryKeychain());
    const certifications = new TextCertificationStore(db);
    await credentials.saveProviderCredential({ providerId: "cockpit", baseUrl: "http://127.0.0.1:20128/v1", textModel: "prompt-v1" }, "sk-secret");
    certifications.saveTextCertificationRecord({ id: "cert-prompts-contract", providerId: "cockpit", configuredModelId: "prompt-v1", baseUrlFingerprint: fingerprintBaseUrl("http://127.0.0.1:20128/v1")!, credentialVersionRef: credentials.loadProviderCredentialVersionRef("cockpit"), endpointStrategy: "responses", implementationVersion: "text-capability-v1", exactTextTest: { status: "passed", latencyMs: 1 }, strictJsonTest: { status: "passed", latencyMs: 1 }, overallStatus: "verified", testedAt: "2026-07-30T00:00:00.000Z" });
    const character: CharacterVersion = {
      id: "character-1", version: 1, status: "approved", name: "Mina",
      persona: { role: "Teacher", ageRange: "30-40", appearance: "Short dark hair", wardrobe: "Navy blazer", palette: "Navy and amber", props: [], gestures: [], tone: "Clear" },
      invariantTraits: ["round glasses"], prohibitedChanges: ["identity changes"],
      references: characterReferenceViewsForCount(4).map((view) => ({ id: `reference-${view}`, view, status: "approved" as const })),
      createdAt: "2026-08-04T00:00:00.000Z", updatedAt: "2026-08-04T00:00:00.000Z"
    };
    const result = await runPromptPreparation({
      shots: [{ id: "shot-1", visualMode: "ai_image", framing: "Close", cameraAngle: "Eye", cameraMovement: "Static", subjectAction: "Reveal", continuityRefs: [], semanticBeat: "Cash rises", assetConceptIds: ["asset-money"] }],
      aspectRatio: "9:16", character, assetConcepts: [{ id: "asset-money", shotId: "shot-1", semanticBeat: "Cash rises", kind: "object", role: "money stack", description: "A stack of notes rises from the lower frame.", visualConstraints: ["left safe zone"], colorPalette: ["green"], motionIntent: "slide_up", needsReferenceImage: false }],
      credentialStore: credentials, certificationStore: certifications,
      createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify({ prompts: [{ shotId: "shot-1", promptVersionId: "prompt-1", positivePrompt: "teacher explaining", negativePrompt: "text", aspectRatio: "9:16", continuityConstraints: [], prohibitedElements: [] }] }) }) })
    });
    expect(result.output.prompts[0]?.positivePrompt).toContain("Character composition lock:");
    expect(result.output.prompts[0]?.positivePrompt).toContain("Approved asset mapping: asset-money");
    db.close();
  });
});
