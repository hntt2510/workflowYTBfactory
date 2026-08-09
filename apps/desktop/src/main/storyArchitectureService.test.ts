import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryKeychain, openFactoryDatabase, ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { fingerprintBaseUrl } from "./nineRouterTextCertificationService";
import { runStoryArchitecture } from "./storyArchitectureService";

async function setup() {
  const db = openFactoryDatabase(join(mkdtempSync(join(tmpdir(), "lsf-story-")), "factory.sqlite"));
  const credentialStore = new ProviderCredentialStore(db, new MemoryKeychain());
  const certificationStore = new TextCertificationStore(db);
  await credentialStore.saveProviderCredential({ providerId: "cockpit", baseUrl: "http://127.0.0.1:20128/v1", textModel: "story-v1" }, "sk-secret");
  certificationStore.saveTextCertificationRecord({ id: "cert-story", providerId: "cockpit", configuredModelId: "story-v1", baseUrlFingerprint: fingerprintBaseUrl("http://127.0.0.1:20128/v1")!, credentialVersionRef: credentialStore.loadProviderCredentialVersionRef("cockpit"), endpointStrategy: "responses", implementationVersion: "text-capability-v1", exactTextTest: { status: "passed", latencyMs: 1 }, strictJsonTest: { status: "passed", latencyMs: 1 }, overallStatus: "verified", testedAt: "2026-08-09T00:00:00.000Z" });
  return { db, credentialStore, certificationStore };
}

describe("story architecture service", () => {
  it("requires ordered narrative beats and never asks for visual direction", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    let prompt = "";
    const result = await runStoryArchitecture({ idea: { id: "idea-1", workingTitle: "Why it changed" }, profile: { niche: "history" }, language: "Vietnamese", targetDuration: "5 minutes", credentialStore, certificationStore, createProvider: () => ({ generateStructured: async (request: { input: string }) => { prompt = request.input; return { data: { premise: "Tiền đề", viewerPromise: "Lời hứa", dramaticQuestion: "Câu hỏi", audienceStartingState: "Chưa biết", audienceEndingState: "Hiểu", narrativeStrategy: "Tăng dần", beats: [{ id: "beat-1", order: 0, purpose: "Mở", information: "Bối cảnh", tensionRole: "Mở căng thẳng", revealRole: "Chưa hé lộ", viewerQuestion: "Vì sao?" }, { id: "beat-2", order: 1, purpose: "Trả lời", information: "Nguyên nhân", tensionRole: "Giải tỏa", revealRole: "Hé lộ", viewerQuestion: "Điều gì tiếp?" }], openLoops: ["Vì sao?"], payoff: "Kết luận", emotionalArc: ["Tò mò", "Thỏa mãn"] } }; } } as never) });
    expect(result.output.beats).toHaveLength(2);
    expect(prompt).toContain("Do not write narration, camera, shots, visuals");
    db.close();
  });
});
