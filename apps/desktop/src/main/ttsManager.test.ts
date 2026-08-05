import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { TtsManager, TtsManagerError, voiceMatchesLanguage } from "./ttsManager";
import { TtsWorkerError } from "./ttsWorkerService";

function createWorker(options: { failEdgeAttempts?: number } = {}) {
  let calls = 0;
  let lastText = "";
  return {
    calls: () => calls,
    lastText: () => lastText,
    health: async () => ({ ready: true, message: "ready" }),
    listVoices: async (provider: string, language: string) => provider === "edge-tts"
      ? [{ id: "vi-VN-HoaiMyNeural", label: "HoaiMy", language, gender: "female" as const }]
      : [{ id: language, label: language, language, gender: "unknown" as const }],
    synthesize: async (input: { provider: string; outputPath: string; text: string }) => {
      calls += 1;
      lastText = input.text;
      if (input.provider === "edge-tts" && calls <= (options.failEdgeAttempts ?? 0)) throw new TtsWorkerError("worker_timeout", "Edge request timed out.");
      mkdirSync(dirname(input.outputPath), { recursive: true });
      writeFileSync(input.outputPath, "audio");
    },
    dispose: () => undefined
  };
}

function createManager(worker = createWorker()) {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "lsf-tts-manager-"));
  const manager = new TtsManager({
    workspaceRoot,
    worker: worker as never,
    credentialStore: {
      loadProviderCredentialSettings: () => undefined,
      resolveProviderSecret: async () => undefined
    } as never,
    probeAudio: async () => ({ durationSeconds: 1.25, codec: "mp3" }),
    previewUrl: (outputPath) => `lsf-audio://preview/${encodeURIComponent(outputPath)}`
  });
  return { manager, workspaceRoot, worker };
}

describe("TtsManager", () => {
  it("accepts only voices that match the requested language", () => {
    expect(voiceMatchesLanguage("edge-tts", "en-AU-WilliamMultilingualNeural", "en")).toBe(true);
    expect(voiceMatchesLanguage("edge-tts", "vi-VN-NamMinhNeural", "en")).toBe(false);
    expect(voiceMatchesLanguage("nine-router-tts", "edge-tts/en-AU-WilliamMultilingualNeural", "English")).toBe(true);
    expect(voiceMatchesLanguage("gtts", "en", "English")).toBe(true);
    expect(voiceMatchesLanguage("kokoro-vietnamese", "diem_trinh", "en")).toBe(false);
  });

  it("lists the five provider registry entries without exposing credentials", async () => {
    const { manager } = createManager();
    const catalog = await manager.listProviders("vi");

    expect(catalog.providers.map((provider) => provider.id)).toEqual([
      "edge-tts", "kokoro-vietnamese", "gtts", "nine-router-tts", "capcut-experimental"
    ]);
    expect(catalog.voices.some((voice) => voice.key === "edge-tts/vi-VN-HoaiMyNeural")).toBe(true);
    expect(JSON.stringify(catalog)).not.toContain("Bearer");
    expect(JSON.stringify(catalog)).not.toContain("apiKey");
  });

  it("retries Edge three times and keeps strict mode free of hidden fallback", async () => {
    const worker = createWorker({ failEdgeAttempts: 3 });
    const { manager, workspaceRoot } = createManager(worker);

    await expect(manager.synthesize({
      provider: "edge-tts",
      voiceId: "vi-VN-HoaiMyNeural",
      language: "vi",
      text: "Xin chao",
      rate: 1,
      outputPath: join(workspaceRoot, "strict.mp3"),
      fallbackEnabled: false,
      fallbackOrder: ["gtts"]
    })).rejects.toBeInstanceOf(TtsManagerError);
    expect(worker.calls()).toBe(3);
  });

  it("uses only an explicitly enabled fallback and reports the actual provider", async () => {
    const worker = createWorker({ failEdgeAttempts: 3 });
    const { manager, workspaceRoot } = createManager(worker);
    const result = await manager.synthesize({
      provider: "edge-tts",
      voiceId: "vi-VN-HoaiMyNeural",
      language: "vi",
      text: "Xin chao",
      rate: 1,
      outputPath: join(workspaceRoot, "fallback.mp3"),
      fallbackEnabled: true,
      fallbackOrder: ["gtts"]
    });

    expect(result.actualProvider).toBe("gtts");
    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackReason).toContain("timed out");
  });

  it("returns a cached preview while the cache entry is valid", async () => {
    const worker = createWorker();
    const { manager } = createManager(worker);
    const input = { provider: "edge-tts" as const, voiceId: "vi-VN-HoaiMyNeural", language: "vi", text: "Xin chao" };

    expect((await manager.preview(input)).cached).toBe(false);
    expect((await manager.preview(input)).cached).toBe(true);
    expect(worker.calls()).toBe(1);
  });

  it("removes malformed Unicode surrogates before sending text to a provider", async () => {
    const worker = createWorker();
    const { manager } = createManager(worker);

    await manager.preview({ provider: "edge-tts", voiceId: "vi-VN-HoaiMyNeural", language: "vi", text: "Xin\udc90 chao" });

    expect(worker.lastText()).toBe("Xin chao");
  });

  it("returns the provider's discovered voice count after a health check", async () => {
    const { manager } = createManager();

    await expect(manager.runHealthCheck("edge-tts")).resolves.toMatchObject({ voiceCount: 1 });
  });
});
