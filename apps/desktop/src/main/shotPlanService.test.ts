import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryKeychain, openFactoryDatabase, ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { buildChannelPromptProfile, createDefaultChannelDna, resolveChannelPromptContext } from "@lsf/domain";
import { fingerprintBaseUrl } from "./nineRouterTextCertificationService";
import { runShotPlan, shotPlanTimeoutMs } from "./shotPlanService";

async function setup() { const db = openFactoryDatabase(join(mkdtempSync(join(tmpdir(), "lsf-shots-")), "factory.sqlite")); const credentialStore = new ProviderCredentialStore(db, new MemoryKeychain()); const certificationStore = new TextCertificationStore(db); await credentialStore.saveProviderCredential({ providerId: "9router", baseUrl: "http://127.0.0.1:20128/v1", textModel: "shots-v1" }, "sk-secret"); certificationStore.saveTextCertificationRecord({ id: "cert-shots", providerId: "9router", configuredModelId: "shots-v1", baseUrlFingerprint: fingerprintBaseUrl("http://127.0.0.1:20128/v1")!, credentialVersionRef: credentialStore.loadProviderCredentialVersionRef("9router"), endpointStrategy: "responses", implementationVersion: "text-certification-v1", exactTextTest: { status: "passed", latencyMs: 1 }, strictJsonTest: { status: "passed", latencyMs: 1 }, overallStatus: "verified", testedAt: "2026-07-30T00:00:00.000Z" }); return { db, credentialStore, certificationStore }; }

describe("shot plan service", () => {
  it("uses the extended timeout for long shot-plan responses", async () => { const { db, credentialStore, certificationStore } = await setup(); const output = { shots: [{ id: "shot-1", sceneId: "scene-1", order: 0, startFrame: 0, durationFrames: 60, fps: 30, purpose: "Open", visualMode: "document", framing: "Close", cameraAngle: "Eye level", cameraMovement: "Static", subjectAction: "Reveal", startState: {}, endState: {}, continuityRefs: [] }] }; let timeoutMs: number | undefined; await expect(runShotPlan({ scenes: [{ id: "scene-1", startFrame: 0, durationFrames: 60 }], fps: 30, credentialStore, certificationStore, createClient: () => ({ createResponseText: async (input: { timeoutMs?: number }) => { timeoutMs = input.timeoutMs; return { text: JSON.stringify(output) }; } }) })).resolves.toMatchObject({ output }); expect(timeoutMs).toBe(shotPlanTimeoutMs); db.close(); });
  it("passes the resolved channel visual grammar to the shot provider", async () => { const { db, credentialStore, certificationStore } = await setup(); const profile = buildChannelPromptProfile({ channelId: "insurance-made-simple", channelDna: createDefaultChannelDna({ styleId: "minimal-infographic" }) }); const promptContext = resolveChannelPromptContext({ channelId: profile.channelId, profile, taskType: "director" }); const output = { shots: [{ id: "shot-1", sceneId: "scene-1", order: 0, startFrame: 0, durationFrames: 60, fps: 30, purpose: "Open", visualMode: "document", framing: "Close", cameraAngle: "Eye level", cameraMovement: "Static", subjectAction: "Reveal", startState: {}, endState: {}, continuityRefs: [] }] }; let request = ""; await runShotPlan({ scenes: [{ id: "scene-1", startFrame: 0, durationFrames: 60 }], fps: 30, promptContext, credentialStore, certificationStore, createClient: () => ({ createResponseText: async (input) => { request = input.input; return { text: JSON.stringify(output) }; } }) }); expect(request).toContain("insurance-made-simple"); expect(request).toContain("minimal-infographic"); db.close(); });
  it("accepts BOM-prefixed JSON wrapped in a provider markdown fence", async () => { const { db, credentialStore, certificationStore } = await setup(); const output = { shots: [{ id: "shot-1", sceneId: "scene-1", order: 0, startFrame: 0, durationFrames: 60, fps: 30, purpose: "Open", visualMode: "document", framing: "Close", cameraAngle: "Eye level", cameraMovement: "Static", subjectAction: "Reveal", startState: {}, endState: {}, continuityRefs: [] }] }; const response = `\uFEFF\n\`\`\`json\n${JSON.stringify(output)}\n\`\`\``; await expect(runShotPlan({ scenes: [{ id: "scene-1", startFrame: 0, durationFrames: 60 }], fps: 30, credentialStore, certificationStore, createClient: () => ({ createResponseText: async () => ({ text: response }) }) })).resolves.toMatchObject({ output }); db.close(); });
  it("assigns a local motion plan when the provider omits motion rationale", async () => { const { db, credentialStore, certificationStore } = await setup(); const output = { shots: [{ id: "shot-1", sceneId: "scene-1", order: 0, startFrame: 0, durationFrames: 60, fps: 30, purpose: "Cash flow rises", visualMode: "ai_image", framing: "Close", cameraAngle: "Eye level", cameraMovement: "Static", subjectAction: "Increase", startState: {}, endState: {}, continuityRefs: [], motion: { effect: "slide_up", intensity: "standard" } }] }; const result = await runShotPlan({ scenes: [{ id: "scene-1", startFrame: 0, durationFrames: 60 }], fps: 30, credentialStore, certificationStore, createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify(output) }) }) }); expect(result.output.shots[0]?.motion?.effect).toBe("slide_up"); expect(result.output.shots[0]?.motion?.rationale).toBeTruthy(); db.close(); });
  it("falls back safely when a provider returns an unsupported motion effect", async () => { const { db, credentialStore, certificationStore } = await setup(); const output = { shots: [{ id: "shot-1", sceneId: "scene-1", order: 0, startFrame: 0, durationFrames: 60, fps: 30, purpose: "Cash flow rises", visualMode: "ai_image", framing: "Close", cameraAngle: "Eye level", cameraMovement: "Static", subjectAction: "Increase", startState: {}, endState: {}, continuityRefs: [], motion: { effect: "rise_magic", intensity: "invalid", rationale: "" } }] }; const result = await runShotPlan({ scenes: [{ id: "scene-1", startFrame: 0, durationFrames: 60 }], fps: 30, credentialStore, certificationStore, createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify(output) }) }) }); expect(result.output.shots[0]?.motion).toMatchObject({ effect: "slide_up", intensity: "standard" }); expect(result.output.shots[0]?.motion?.rationale).toBeTruthy(); db.close(); });
  it("normalizes visual-mode aliases and unsupported provider values", async () => { const { db, credentialStore, certificationStore } = await setup(); const output = { shots: [{ id: "shot-1", sceneId: "scene-1", order: 0, startFrame: 0, durationFrames: 30, fps: 30, purpose: "Explain the cash flow chart", visualMode: "chart", framing: "Close", cameraAngle: "Eye level", cameraMovement: "Static", subjectAction: "Reveal", startState: {}, endState: {}, continuityRefs: [] }, { id: "shot-2", sceneId: "scene-1", order: 1, startFrame: 30, durationFrames: 30, fps: 30, purpose: "Teacher presents", visualMode: "unsupported-provider-mode", framing: "Close", cameraAngle: "Eye level", cameraMovement: "Static", subjectAction: "Talk", startState: {}, endState: {}, continuityRefs: [] }] }; const result = await runShotPlan({ scenes: [{ id: "scene-1", startFrame: 0, durationFrames: 60 }], fps: 30, credentialStore, certificationStore, createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify(output) }) }) }); expect(result.output.shots.map((shot) => shot.visualMode)).toEqual(["diagram", "ai_image"]); db.close(); });
  it("normalizes missing or textual state metadata from the provider", async () => { const { db, credentialStore, certificationStore } = await setup(); const output = { shots: [{ id: "shot-1", sceneId: "scene-1", order: 0, startFrame: 0, durationFrames: 60, fps: 30, purpose: "Open", visualMode: "document", framing: "Close", cameraAngle: "Eye level", cameraMovement: "Static", subjectAction: "Reveal", startState: "Before the reveal", continuityRefs: "same teacher", endState: undefined }] }; const result = await runShotPlan({ scenes: [{ id: "scene-1", startFrame: 0, durationFrames: 60 }], fps: 30, credentialStore, certificationStore, createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify(output) }) }) }); expect(result.output.shots[0]?.startState).toEqual({ description: "Before the reveal" }); expect(result.output.shots[0]?.endState).toEqual({}); expect(result.output.shots[0]?.continuityRefs).toEqual(["same teacher"]); db.close(); });
  it("accepts shots fully contained within approved scenes", async () => { const { db, credentialStore, certificationStore } = await setup(); const output = { shots: [{ id: "shot-1", sceneId: "scene-1", order: 0, startFrame: 0, durationFrames: 60, fps: 30, purpose: "Open", visualMode: "document", framing: "Close", cameraAngle: "Eye level", cameraMovement: "Static", subjectAction: "Reveal", startState: {}, endState: {}, continuityRefs: [] }] }; await expect(runShotPlan({ scenes: [{ id: "scene-1", startFrame: 0, durationFrames: 60 }], fps: 30, credentialStore, certificationStore, createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify(output) }) }) })).resolves.toMatchObject({ output }); db.close(); });
  it("rejects shots outside an approved scene", async () => { const { db, credentialStore, certificationStore } = await setup(); const output = { shots: [{ id: "shot-1", sceneId: "scene-1", order: 0, startFrame: 45, durationFrames: 30, fps: 30, purpose: "Overrun", visualMode: "document", framing: "Close", cameraAngle: "Eye level", cameraMovement: "Static", subjectAction: "Reveal", startState: {}, endState: {}, continuityRefs: [] }] }; await expect(runShotPlan({ scenes: [{ id: "scene-1", startFrame: 0, durationFrames: 60 }], fps: 30, credentialStore, certificationStore, createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify(output) }) }) })).rejects.toMatchObject({ category: "invalid_output" }); db.close(); });
  it("repairs timing gaps inside an approved scene", async () => { const { db, credentialStore, certificationStore } = await setup(); const output = { shots: [{ id: "shot-1", sceneId: "scene-1", order: 0, startFrame: 15, durationFrames: 30, fps: 30, purpose: "Gap", visualMode: "document", framing: "Close", cameraAngle: "Eye level", cameraMovement: "Static", subjectAction: "Reveal", startState: {}, endState: {}, continuityRefs: [] }] }; const result = await runShotPlan({ scenes: [{ id: "scene-1", startFrame: 0, durationFrames: 60 }], fps: 30, credentialStore, certificationStore, createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify(output) }) }) }); expect(result.output.shots[0]).toMatchObject({ startFrame: 0, durationFrames: 60 }); db.close(); });
  it("rejects shot plans that skip an approved scene", async () => { const { db, credentialStore, certificationStore } = await setup(); const output = { shots: [{ id: "shot-1", sceneId: "scene-1", order: 0, startFrame: 0, durationFrames: 60, fps: 30, purpose: "Open", visualMode: "document", framing: "Close", cameraAngle: "Eye level", cameraMovement: "Static", subjectAction: "Reveal", startState: {}, endState: {}, continuityRefs: [] }] }; await expect(runShotPlan({ scenes: [{ id: "scene-1", startFrame: 0, durationFrames: 60 }, { id: "scene-2", startFrame: 60, durationFrames: 30 }], fps: 30, credentialStore, certificationStore, createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify(output) }) }) })).rejects.toMatchObject({ category: "invalid_output" }); db.close(); });

  it("surfaces invalid character-first JSON instead of creating fallback shots", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    await expect(runShotPlan({
      scenes: [{ id: "scene-1", startFrame: 0, durationFrames: 60, purpose: "Open" }, { id: "scene-2", startFrame: 60, durationFrames: 30, purpose: "Explain" }],
      fps: 30,
      characterFirst: true,
      credentialStore,
      certificationStore,
      createClient: () => ({ createResponseText: async () => ({ text: "not json" }) })
    })).rejects.toMatchObject({ category: "invalid_json" });
    db.close();
  });

  it("repairs malformed character-first fields and scene assignments", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const output = { shots: [
      { id: "duplicate", sceneId: "unknown", order: "bad", startFrame: -20, durationFrames: 500, fps: "bad", purpose: null, visualMode: "unsupported", motion: { effect: "not-a-real-effect" }, framing: null, cameraAngle: null, cameraMovement: null, subjectAction: null, startState: "Before", endState: ["After"], continuityRefs: "same teacher" },
      { id: "duplicate", sceneId: "scene-2", order: 1, startFrame: 60, durationFrames: 60, fps: 1, purpose: "Second beat", visualMode: "chart", framing: "Close", cameraAngle: "Eye", cameraMovement: "Static", subjectAction: "Reveal", startState: {}, endState: {}, continuityRefs: [] }
    ] };
    const result = await runShotPlan({
      scenes: [{ id: "scene-1", startFrame: 0, durationFrames: 60, purpose: "First" }, { id: "scene-2", startFrame: 60, durationFrames: 30, purpose: "Second" }],
      fps: 30,
      characterFirst: true,
      credentialStore,
      certificationStore,
      createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify(output) }) })
    });
    expect(result.output.shots).toHaveLength(2);
    expect(new Set(result.output.shots.map((shot) => shot.id)).size).toBe(2);
    expect(result.output.shots.map((shot) => shot.sceneId)).toEqual(["scene-1", "scene-2"]);
    expect(result.output.shots.every((shot) => shot.fps === 30 && shot.motion?.effect && String(shot.motion.effect) !== "not-a-real-effect")).toBe(true);
    expect(result.output.shots[0]).toMatchObject({ startFrame: 0, durationFrames: 60, startState: { description: "Before" }, continuityRefs: ["same teacher"] });
    expect(result.output.shots[1]).toMatchObject({ startFrame: 60, durationFrames: 30, visualMode: "diagram" });
    db.close();
  });

  it("repairs character-first timing overflow, gaps, and missing scenes", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const output = { shots: [
      { id: "shot-1", sceneId: "scene-1", order: 2, startFrame: 45, durationFrames: 100, fps: 30, purpose: "Late", visualMode: "document", framing: "Close", cameraAngle: "Eye", cameraMovement: "Static", subjectAction: "Reveal", startState: {}, endState: {}, continuityRefs: [] },
      { id: "shot-2", sceneId: "scene-1", order: 1, startFrame: -30, durationFrames: 10, fps: 30, purpose: "Early", visualMode: "document", framing: "Close", cameraAngle: "Eye", cameraMovement: "Static", subjectAction: "Reveal", startState: {}, endState: {}, continuityRefs: [] }
    ] };
    const result = await runShotPlan({
      scenes: [{ id: "scene-1", startFrame: 0, durationFrames: 60 }, { id: "scene-2", startFrame: 60, durationFrames: 30 }],
      fps: 30,
      characterFirst: true,
      credentialStore,
      certificationStore,
      createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify(output) }) })
    });
    for (const scene of [{ id: "scene-1", startFrame: 0, durationFrames: 60 }, { id: "scene-2", startFrame: 60, durationFrames: 30 }]) {
      const shots = result.output.shots.filter((shot) => shot.sceneId === scene.id).sort((left, right) => left.startFrame - right.startFrame);
      expect(shots[0]?.startFrame).toBe(scene.startFrame);
      expect(shots.at(-1)!.startFrame + shots.at(-1)!.durationFrames).toBe(scene.startFrame + scene.durationFrames);
      expect(shots.every((shot, index) => index === 0 || shot.startFrame === shots[index - 1]!.startFrame + shots[index - 1]!.durationFrames)).toBe(true);
    }
    db.close();
  });

  it("merges adjacent character-first AI shots instead of failing the image budget", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const output = { shots: Array.from({ length: 3 }, (_, index) => ({ id: `shot-${index}`, sceneId: "scene-1", order: index, startFrame: index * 30, durationFrames: 30, fps: 30, purpose: `Beat ${index}`, visualMode: "ai_image", framing: "Medium", cameraAngle: "Eye", cameraMovement: "Static", subjectAction: "Explain", startState: {}, endState: {}, continuityRefs: [] })) };
    const result = await runShotPlan({
      scenes: [{ id: "scene-1", startFrame: 0, durationFrames: 90 }],
      fps: 30,
      characterFirst: true,
      credentialStore,
      certificationStore,
      createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify(output) }) })
    });
    expect(result.output.shots.filter((shot) => shot.visualMode === "ai_image")).toHaveLength(1);
    expect(result.output.shots[0]).toMatchObject({ startFrame: 0, durationFrames: 90 });
    db.close();
  });

  it("splits character-first beats that exceed the five-second maximum", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const output = { shots: [{ id: "long-shot", sceneId: "scene-1", order: 0, startFrame: 0, durationFrames: 360, fps: 30, purpose: "Explain", visualMode: "ai_image", framing: "Medium", cameraAngle: "Eye", cameraMovement: "Static", subjectAction: "Explain", startState: {}, endState: {}, continuityRefs: [] }] };
    const result = await runShotPlan({
      scenes: [{ id: "scene-1", startFrame: 0, durationFrames: 360 }],
      fps: 30,
      characterFirst: true,
      credentialStore,
      certificationStore,
      createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify(output) }) })
    });
    expect(result.output.shots.length).toBeGreaterThan(1);
    expect(result.output.shots.every((shot) => shot.durationFrames <= 150)).toBe(true);
    expect(result.output.shots[0]?.startFrame).toBe(0);
    expect(result.output.shots.at(-1)!.startFrame + result.output.shots.at(-1)!.durationFrames).toBe(360);
    db.close();
  });

  it("keeps later shots after every split part", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const output = { shots: [
      { id: "long-shot", sceneId: "scene-1", order: 0, startFrame: 0, durationFrames: 360, fps: 30, purpose: "Explain", visualMode: "ai_image", framing: "Medium", cameraAngle: "Eye", cameraMovement: "Static", subjectAction: "Explain", startState: {}, endState: {}, continuityRefs: [] },
      { id: "after-shot", sceneId: "scene-1", order: 1, startFrame: 360, durationFrames: 90, fps: 30, purpose: "After", visualMode: "document", framing: "Wide", cameraAngle: "Eye", cameraMovement: "Static", subjectAction: "Hold", startState: {}, endState: {}, continuityRefs: [] }
    ] };
    const result = await runShotPlan({
      scenes: [{ id: "scene-1", startFrame: 0, durationFrames: 450 }],
      fps: 30,
      characterFirst: true,
      credentialStore,
      certificationStore,
      createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify(output) }) })
    });
    expect(result.output.shots.map((shot) => shot.id)).toEqual(["long-shot", "long-shot-part-2", "long-shot-part-3", "after-shot"]);
    expect(result.output.shots.map((shot) => [shot.startFrame, shot.durationFrames])).toEqual([[0, 150], [150, 150], [300, 60], [360, 90]]);
    db.close();
  });

  it("keeps provider timeout as a retryable provider failure", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    await expect(runShotPlan({
      scenes: [{ id: "scene-1", startFrame: 0, durationFrames: 60 }],
      fps: 30,
      characterFirst: true,
      credentialStore,
      certificationStore,
      createClient: () => ({ createResponseText: async () => { throw new Error("timeout"); } })
    })).rejects.toMatchObject({ category: "provider_failed" });
    db.close();
  });
});
