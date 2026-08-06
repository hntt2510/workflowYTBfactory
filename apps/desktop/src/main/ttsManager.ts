import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ProviderCredentialStore } from "@lsf/db";
import { canonicalNineRouterTtsModel, generateNineRouterTts, listNineRouterTtsCatalog } from "./nineRouterTtsService";
import { TtsWorkerClient, TtsWorkerError } from "./ttsWorkerService";

export type TtsProviderId = "edge-tts" | "kokoro-vietnamese" | "gtts" | "nine-router-tts" | "capcut-experimental";
export type TtsHealth = "ready" | "degraded" | "unavailable" | "not_tested";

export function voiceMatchesLanguage(provider: TtsProviderId, voiceId: string, language: string): boolean {
  const aliases: Record<string, string> = { vietnamese: "vi", english: "en", japanese: "ja", korean: "ko", chinese: "zh" };
  const normalizedLanguage = aliases[language.trim().toLowerCase()] ?? language.trim().toLowerCase().split("-")[0];
  const normalizedVoiceId = voiceId.trim().replace(/^(?:edge-tts|google-tts)\//i, "").toLowerCase();
  if (provider === "gtts") return normalizedVoiceId === normalizedLanguage;
  if (provider === "kokoro-vietnamese") return normalizedLanguage === "vi";
  const voiceLanguage = normalizedVoiceId.match(/^([a-z]{2})(?:-|$)/)?.[1];
  return !voiceLanguage || voiceLanguage === normalizedLanguage;
}

export interface TtsVoice {
  key: string;
  provider: TtsProviderId;
  providerVoiceId: string;
  label: string;
  language: string;
  gender: "female" | "male" | "neutral" | "unknown";
  description?: string;
  providerType: "local" | "cloud";
  enabled: boolean;
  experimental: boolean;
}

export interface TtsProviderStatus {
  id: TtsProviderId;
  displayName: string;
  providerType: "local" | "cloud";
  health: TtsHealth;
  message: string;
  experimental: boolean;
  enabled: boolean;
  voiceCount: number;
}

export interface TtsSynthesisResult {
  requestedProvider: TtsProviderId;
  actualProvider: TtsProviderId;
  voiceId: string;
  outputPath: string;
  attemptCount: number;
  fallbackUsed: boolean;
  fallbackReason?: string;
}

export class TtsManagerError extends Error {
  constructor(readonly code: "invalid_input" | "provider_unavailable" | "provider_failed" | "provider_timeout", message: string, readonly transient = false) { super(message); }
}

const providerDefinitions: Record<TtsProviderId, Omit<TtsProviderStatus, "health" | "message" | "voiceCount">> = {
  "edge-tts": { id: "edge-tts", displayName: "Microsoft Edge Neural", providerType: "cloud", experimental: false, enabled: true },
  "kokoro-vietnamese": { id: "kokoro-vietnamese", displayName: "Kokoro Vietnamese", providerType: "local", experimental: false, enabled: true },
  gtts: { id: "gtts", displayName: "Google gTTS", providerType: "cloud", experimental: false, enabled: true },
  "nine-router-tts": { id: "nine-router-tts", displayName: "9Router TTS", providerType: "cloud", experimental: false, enabled: true },
  "capcut-experimental": { id: "capcut-experimental", displayName: "CapCut TTS", providerType: "cloud", experimental: true, enabled: false }
};

type LocalProviderId = "edge-tts" | "kokoro-vietnamese" | "gtts";

function isLocalProvider(provider: TtsProviderId): provider is LocalProviderId {
  return provider === "edge-tts" || provider === "kokoro-vietnamese" || provider === "gtts";
}

export class TtsManager {
  private readonly previewCache = new Map<string, { outputPath: string; createdAt: number; result: TtsSynthesisResult }>();

  constructor(private readonly input: {
    workspaceRoot: string;
    credentialStore: ProviderCredentialStore;
    worker: TtsWorkerClient;
    probeAudio: (outputPath: string) => Promise<{ durationSeconds: number; codec: string }>;
    previewUrl: (outputPath: string) => string;
    previewOutputDir?: () => string;
    normalizeAudio?: (inputPath: string, outputPath: string) => Promise<void>;
    previewTtlMs?: number;
  }) {}

  async listProviders(language = "vi"): Promise<{ providers: TtsProviderStatus[]; voices: TtsVoice[] }> {
    const statuses = await Promise.all((Object.keys(providerDefinitions) as TtsProviderId[]).map((provider) => this.providerStatus(provider, language)));
    const voices = (await Promise.all((Object.keys(providerDefinitions) as TtsProviderId[]).map((provider) => this.listVoices(provider, language).catch(() => [])))).flat();
    const voiceCounts = new Map<TtsProviderId, number>();
    for (const voice of voices) voiceCounts.set(voice.provider, (voiceCounts.get(voice.provider) ?? 0) + 1);
    return { providers: statuses.map((status) => ({ ...status, voiceCount: voiceCounts.get(status.id) ?? 0 })), voices };
  }

  async runHealthCheck(provider: TtsProviderId): Promise<TtsProviderStatus> {
    const status = await this.providerStatus(provider, "vi", true);
    const voices = await this.listVoices(provider, "vi").catch(() => []);
    return { ...status, voiceCount: voices.length };
  }

  async preview(input: { provider: TtsProviderId; voiceId: string; language: string; text: string; rate?: number }): Promise<TtsSynthesisResult & { cached: boolean; durationSeconds: number; codec: string; previewUrl: string }> {
    const rate = input.rate ?? 1;
    this.assertInput(input.text, input.voiceId, rate);
    const cacheKey = createHash("sha256").update(JSON.stringify({ provider: input.provider, voiceId: input.voiceId, language: input.language, rate, text: normalizeText(input.text) })).digest("hex");
    const cached = this.previewCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < (this.input.previewTtlMs ?? 60 * 60_000) && existsSync(cached.outputPath)) {
      const metadata = await this.input.probeAudio(cached.outputPath);
      return { ...cached.result, ...metadata, cached: true, previewUrl: this.input.previewUrl(cached.outputPath) };
    }
    const outputPath = join(this.input.previewOutputDir?.() ?? join(this.input.workspaceRoot, "dev-test-lab", "voice"), `preview-${cacheKey}.mp3`);
    const result = await this.synthesize({ ...input, rate, outputPath, fallbackEnabled: false, fallbackOrder: [] });
    this.previewCache.set(cacheKey, { outputPath, createdAt: Date.now(), result });
    const metadata = await this.input.probeAudio(outputPath);
    return { ...result, ...metadata, cached: false, previewUrl: this.input.previewUrl(outputPath) };
  }

  async synthesize(input: { provider: TtsProviderId; voiceId: string; language: string; text: string; rate: number; outputPath: string; fallbackEnabled: boolean; fallbackOrder: TtsProviderId[] }): Promise<TtsSynthesisResult> {
    this.assertInput(input.text, input.voiceId, input.rate);
    try {
      return await this.synthesizeOne(input.provider, input.voiceId, input.language, input.text, input.rate, input.outputPath, input.provider, false);
    } catch (error) {
      const original = toManagerError(error);
      if (!input.fallbackEnabled || !original.transient) throw original;
      for (const provider of input.fallbackOrder.filter((provider) => provider !== input.provider)) {
        const fallbackVoice = defaultVoice(provider, input.language);
        if (!fallbackVoice) continue;
        try {
          const result = await this.synthesizeOne(provider, fallbackVoice, input.language, input.text, input.rate, input.outputPath, input.provider, true);
          return { ...result, fallbackReason: original.message };
        } catch {
          // Continue only through the explicit fallback order.
        }
      }
      throw original;
    }
  }

  dispose(): void { this.input.worker.dispose(); }

  private async providerStatus(provider: TtsProviderId, language: string, probe = false): Promise<TtsProviderStatus> {
    const definition = providerDefinitions[provider];
    if (provider === "capcut-experimental") return { ...definition, health: "unavailable", message: "Experimental provider is disabled until an official CapCut API is configured.", voiceCount: 0 };
    if (isLocalProvider(provider)) {
      try {
        const result = await this.input.worker.health(provider, probe);
        return { ...definition, health: result.ready ? (probe ? "ready" : "not_tested") : "unavailable", message: result.message, voiceCount: 0 };
      } catch (error) {
        return { ...definition, health: "unavailable", message: toManagerError(error).message, voiceCount: 0 };
      }
    }
    const settings = this.input.credentialStore.loadProviderCredentialSettings("9router");
    const apiKey = await this.input.credentialStore.resolveProviderSecret("9router");
    if (!settings || !apiKey) return { ...definition, health: "unavailable", message: "A saved 9Router credential is required.", voiceCount: 0 };
    try {
      const catalog = await listNineRouterTtsCatalog({ baseUrl: settings.baseUrl, apiKey, provider: "edge-tts", language });
      return { ...definition, health: catalog.voices.length ? "ready" : "degraded", message: catalog.message, voiceCount: 0 };
    } catch (error) {
      return { ...definition, health: "degraded", message: toManagerError(error).message, voiceCount: 0 };
    }
  }

  private async listVoices(provider: TtsProviderId, language: string): Promise<TtsVoice[]> {
    const definition = providerDefinitions[provider];
    if (!definition.enabled) return [];
    if (isLocalProvider(provider)) {
      const voices = await this.input.worker.listVoices(provider, language);
      return voices.map((voice) => ({
        key: `${provider}/${voice.id}`,
        provider,
        providerVoiceId: voice.id,
        label: voice.label,
        language: voice.language,
        gender: voice.gender,
        ...(voice.description ? { description: voice.description } : {}),
        providerType: definition.providerType,
        enabled: true,
        experimental: false
      }));
    }
    if (provider !== "nine-router-tts") return [];
    const settings = this.input.credentialStore.loadProviderCredentialSettings("9router");
    const apiKey = await this.input.credentialStore.resolveProviderSecret("9router");
    if (!settings || !apiKey) return [];
    const catalogs = await Promise.all(["edge-tts", "google-tts"].map((voiceProvider) => listNineRouterTtsCatalog({ baseUrl: settings.baseUrl, apiKey, provider: voiceProvider as "edge-tts" | "google-tts", language }).catch(() => null)));
    return catalogs.flatMap((catalog) => catalog?.voices.map((voice) => ({
      key: `nine-router-tts/${voice.id}`,
      provider: "nine-router-tts" as const,
      providerVoiceId: voice.id,
      label: voice.label,
      language,
      gender: "unknown" as const,
      providerType: "cloud" as const,
      enabled: true,
      experimental: false
    })) ?? []);
  }

  private async synthesizeOne(provider: TtsProviderId, voiceId: string, language: string, text: string, rate: number, outputPath: string, requestedProvider: TtsProviderId, fallbackUsed: boolean): Promise<TtsSynthesisResult> {
    if (provider === "capcut-experimental") throw new TtsManagerError("provider_unavailable", "CapCut TTS is disabled because no official API integration is configured.");
    const attempts = provider === "edge-tts" ? 3 : 1;
    let lastError: TtsManagerError | undefined;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        if (isLocalProvider(provider)) {
          const workerOutputPath = provider === "kokoro-vietnamese"
            ? outputPath.replace(/\.[A-Za-z0-9]+$/, `.kokoro-${attempt}.wav`)
            : outputPath;
          await this.input.worker.synthesize({ provider, voiceId, language, text: normalizeText(text), rate, outputPath: workerOutputPath });
          if (workerOutputPath !== outputPath) {
            if (!this.input.normalizeAudio) throw new TtsManagerError("provider_failed", "Kokoro output requires FFmpeg audio normalization.");
            try {
              await this.input.normalizeAudio(workerOutputPath, outputPath);
            } finally {
              const { rm } = await import("node:fs/promises");
              await rm(workerOutputPath, { force: true });
            }
          }
        } else {
          const settings = this.input.credentialStore.loadProviderCredentialSettings("9router");
          const apiKey = await this.input.credentialStore.resolveProviderSecret("9router");
          if (!settings || !apiKey) throw new TtsManagerError("provider_unavailable", "A saved 9Router credential is required.");
          const source = voiceId.startsWith("google-tts/") ? "google-tts" : "edge-tts";
          await generateNineRouterTts({ baseUrl: settings.baseUrl, apiKey, model: canonicalNineRouterTtsModel(source, voiceId), text: normalizeText(text), outputPath });
        }
        await this.input.probeAudio(outputPath);
        return { requestedProvider, actualProvider: provider, voiceId, outputPath, attemptCount: attempt, fallbackUsed };
      } catch (error) {
        lastError = toManagerError(error);
        if (!lastError.transient || attempt === attempts) throw lastError;
        await delay(250 * 2 ** (attempt - 1));
      }
    }
    throw lastError ?? new TtsManagerError("provider_failed", "TTS provider failed.", true);
  }

  private assertInput(text: string, voiceId: string, rate: number): void {
    if (!text.trim()) throw new TtsManagerError("invalid_input", "TTS text cannot be empty.");
    if (!voiceId.trim()) throw new TtsManagerError("invalid_input", "A TTS voice must be selected.");
    if (!Number.isFinite(rate) || rate < 0.5 || rate > 1.8) throw new TtsManagerError("invalid_input", "TTS rate must be between 0.5 and 1.8.");
  }
}

function normalizeText(value: string): string {
  let sanitized = "";
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        sanitized += value[index]! + value[index + 1]!;
        index += 1;
      }
      continue;
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) continue;
    sanitized += value[index]!;
  }
  return sanitized.normalize("NFC").replace(/\s+/g, " ").trim();
}

function defaultVoice(provider: TtsProviderId, language: string): string | undefined {
  if (provider === "edge-tts" && language === "vi") return "vi-VN-HoaiMyNeural";
  if (provider === "gtts") return language;
  if (provider === "kokoro-vietnamese" && language === "vi") return "diem_trinh";
  return undefined;
}

function toManagerError(error: unknown): TtsManagerError {
  if (error instanceof TtsManagerError) return error;
  if (error instanceof TtsWorkerError) return new TtsManagerError(error.category === "worker_timeout" ? "provider_timeout" : "provider_failed", error.message, error.category !== "worker_failed" || !/invalid|empty|unsupported/i.test(error.message));
  const message = error instanceof Error ? error.message : "TTS provider failed.";
  return new TtsManagerError(/timed out/i.test(message) ? "provider_timeout" : "provider_failed", message, !/invalid|empty|unsupported|requires/i.test(message));
}

function delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
