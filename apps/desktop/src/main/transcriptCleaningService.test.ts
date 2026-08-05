import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryKeychain, openFactoryDatabase, ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { NineRouterTextResponseError } from "@lsf/providers";
import { fingerprintBaseUrl } from "./nineRouterTextCertificationService";
import { runTranscriptCleaning } from "./transcriptCleaningService";

async function setup() {
  const db = openFactoryDatabase(join(mkdtempSync(join(tmpdir(), "lsf-clean-")), "factory.sqlite"));
  const credentialStore = new ProviderCredentialStore(db, new MemoryKeychain());
  const certificationStore = new TextCertificationStore(db);
  await credentialStore.saveProviderCredential({ providerId: "9router", baseUrl: "http://127.0.0.1:20128/v1", textModel: "cleaner-v1" }, "sk-secret");
  const credentialVersionRef = credentialStore.loadProviderCredentialVersionRef("9router");
  certificationStore.saveTextCertificationRecord({
    id: "cert-1", providerId: "9router", configuredModelId: "cleaner-v1",
    baseUrlFingerprint: fingerprintBaseUrl("http://127.0.0.1:20128/v1")!,
    ...(credentialVersionRef ? { credentialVersionRef } : {}), endpointStrategy: "responses",
    implementationVersion: "text-certification-v1", exactTextTest: { status: "passed", latencyMs: 1 },
    strictJsonTest: { status: "passed", latencyMs: 1 }, overallStatus: "verified", testedAt: "2026-07-30T00:00:00.000Z"
  });
  return { db, credentialStore, certificationStore };
}

function output(referenceId: string, source: string, cleaned: string, mode: "single_request" | "chunked" = "single_request", chunkCount = 1) {
  return JSON.stringify({
    referenceId,
    sourceTranscriptVersionId: referenceId,
    cleanedTranscript: cleaned,
    removedSegments: [],
    flaggedSegments: [],
    sourceCharacterCount: source.length,
    cleanedCharacterCount: cleaned.length,
    execution: {
      mode,
      chunkCount,
      completedChunkCount: 1,
      estimatedInputTokens: Math.ceil(source.length / 4),
      selectedModel: "cleaner-v1",
      configuredTimeoutMs: 180000,
      removedNoise: 0,
      flaggedSegmentCount: 0
    }
  });
}

function chunkFromPrompt(input: string): string {
  return input.split("Transcript chunk follows:\n")[1] ?? "";
}

function chunkCountFromPrompt(input: string): number {
  return Number(input.match(/chunkCount: (\d+)/)?.[1] ?? 1);
}

type CleaningTestInput = Omit<Parameters<typeof runTranscriptCleaning>[0], "model"> & { model?: string };

async function run(input: CleaningTestInput) {
  return runTranscriptCleaning({
    ...input,
    referenceId: input.referenceId ?? "ref-1",
    sourceTranscriptVersionId: input.sourceTranscriptVersionId ?? "ref-1",
    model: input.model ?? "cleaner-v1"
  });
}

describe("transcript cleaning service", () => {
  it("stores model-cleaned output and the raw transcript separately", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const transcript = "hello world this is an asr sentence";
    const result = await run({
      referenceId: "ref-1", sourceTranscriptVersionId: "ref-1", transcript,
      credentialStore, certificationStore,
      createClient: () => ({ createResponseText: async () => ({ text: output("ref-1", transcript, "Hello world. This is an ASR sentence.") }) })
    });
    expect(result.output.rawTranscript).toBe(transcript);
    expect(result.output.cleanedTranscript).toBe("Hello world. This is an ASR sentence.");
    db.close();
  });

  it("accepts the minimal cleaning JSON and adds trusted run metadata locally", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const transcript = "this transcript needs punctuation";
    const result = await run({
      referenceId: "ref-1", sourceTranscriptVersionId: "ref-1", transcript,
      credentialStore, certificationStore,
      createClient: () => ({ createResponseText: async () => ({
        text: JSON.stringify({ cleanedTranscript: "This transcript needs punctuation." })
      }) })
    });
    expect(result.output.cleanedTranscript).toBe("This transcript needs punctuation.");
    expect(result.output.referenceId).toBe("ref-1");
    expect(result.output.removedSegments).toEqual([]);
    expect(result.output.execution.chunkCount).toBe(1);
    db.close();
  });

  it("fails after bounded timeout retries and never creates a cleaned result", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    let calls = 0;
    await expect(run({
      referenceId: "ref-1", sourceTranscriptVersionId: "ref-1", transcript: "A transcript that times out at the provider.",
      credentialStore, certificationStore, retryBaseDelayMs: 0,
      createClient: () => ({ createResponseText: async () => {
        calls += 1;
        throw new NineRouterTextResponseError("timeout", "timed out");
      } })
    })).rejects.toMatchObject({ category: "provider_timeout" });
    expect(calls).toBe(3);
    db.close();
  });

  it("retries a failed chunk once and then resumes with its model output", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const transcript = "first paragraph has words here\n\nsecond paragraph has more words here";
    let calls = 0;
    const result = await run({
      referenceId: "ref-1", sourceTranscriptVersionId: "ref-1", transcript, maxChunkCharacters: 38,
      credentialStore, certificationStore, retryBaseDelayMs: 0,
      createClient: () => ({ createResponseText: async ({ input }) => {
        calls += 1;
        if (calls === 1) throw new NineRouterTextResponseError("server_error", "temporary failure");
        const chunk = chunkFromPrompt(input);
        return { text: output("ref-1", chunk, `${chunk.trim()} cleaned.`, "chunked", chunkCountFromPrompt(input)) };
      } })
    });
    expect(calls).toBeGreaterThan(1);
    expect(result.chunks.every((chunk) => chunk.status === "completed")).toBe(true);
    db.close();
  });

  it("resumes a new run from the completed chunks of a failed run", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const transcript = "first paragraph has enough words here\n\nsecond paragraph has enough words too";
    const progress = new Map<number, Awaited<ReturnType<typeof runTranscriptCleaning>>["chunks"][number]>();
    let firstRunCalls = 0;
    await expect(run({
      referenceId: "ref-1", sourceTranscriptVersionId: "ref-1", transcript, maxChunkCharacters: 36,
      credentialStore, certificationStore,
      onChunkProgress: (item) => { progress.set(item.chunkIndex, item); },
      createClient: () => ({ createResponseText: async ({ input }) => {
        firstRunCalls += 1;
        const chunk = chunkFromPrompt(input);
        if (firstRunCalls > 1) throw new NineRouterTextResponseError("unauthorized", "stop this chunk");
        return { text: output("ref-1", chunk, `${chunk.trim()} cleaned.`, "chunked", chunkCountFromPrompt(input)) };
      } })
    })).rejects.toMatchObject({ category: "credential_missing" });
    expect([...progress.values()].some((item) => item.status === "completed")).toBe(true);

    let resumedCalls = 0;
    const result = await run({
      referenceId: "ref-1", sourceTranscriptVersionId: "ref-1", transcript, maxChunkCharacters: 36,
      credentialStore, certificationStore, resumeChunks: [...progress.values()],
      createClient: () => ({ createResponseText: async ({ input }) => {
        resumedCalls += 1;
        const chunk = chunkFromPrompt(input);
        return { text: output("ref-1", chunk, `${chunk.trim()} resumed.`, "chunked", chunkCountFromPrompt(input)) };
      } })
    });
    expect(resumedCalls).toBe(result.chunks.length - 1);
    expect(result.chunks.filter((item) => item.status === "completed")).toHaveLength(result.chunks.length);
    db.close();
  });

  it("fails closed for an empty provider response", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    await expect(run({
      referenceId: "ref-1", sourceTranscriptVersionId: "ref-1", transcript: "A non-empty transcript.",
      credentialStore, certificationStore,
      createClient: () => ({ createResponseText: async () => ({ text: "" }) })
    })).rejects.toMatchObject({ category: "empty_response" });
    db.close();
  });

  it("rejects a provider response that echoes the input", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const transcript = "the provider returned the raw transcript without cleaning";
    await expect(run({
      referenceId: "ref-1", sourceTranscriptVersionId: "ref-1", transcript,
      credentialStore, certificationStore,
      createClient: () => ({ createResponseText: async () => ({ text: output("ref-1", transcript, transcript) }) })
    })).rejects.toMatchObject({ category: "output_content_invalid" });
    db.close();
  });

  it("fails closed when a long transcript is changed only insignificantly", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const transcript = "word ".repeat(500).trim();
    const minimallyChanged = `Word${transcript.slice(4)}`;
    await expect(run({
      referenceId: "ref-1", sourceTranscriptVersionId: "ref-1", transcript,
      credentialStore, certificationStore,
      createClient: () => ({ createResponseText: async () => ({ text: output("ref-1", transcript, minimallyChanged) }) })
    })).rejects.toMatchObject({ category: "output_content_invalid" });
    db.close();
  });

  it("fails once for an invalid provider response shape instead of retrying it", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    let calls = 0;
    await expect(run({
      referenceId: "ref-1", sourceTranscriptVersionId: "ref-1", transcript: "A transcript with a malformed provider response.",
      credentialStore, certificationStore, retryBaseDelayMs: 0,
      createClient: () => ({ createResponseText: async () => {
        calls += 1;
        throw new NineRouterTextResponseError("invalid_response_shape", "malformed provider response");
      } })
    })).rejects.toMatchObject({ category: "invalid_response_json" });
    expect(calls).toBe(1);
    db.close();
  });

  it("checks the provider input token budget before making a request", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    let calls = 0;
    await expect(run({
      referenceId: "ref-1", sourceTranscriptVersionId: "ref-1", transcript: "A transcript that cannot fit the configured provider budget.",
      maxProviderInputTokens: 1,
      credentialStore, certificationStore,
      createClient: () => ({ createResponseText: async () => {
        calls += 1;
        return { text: "unexpected" };
      } })
    })).rejects.toMatchObject({ category: "input_token_budget_exceeded" });
    expect(calls).toBe(0);
    db.close();
  });

  it("persists locally removed formatting noise in the cleaned artifact metadata", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const transcript = "first sentence\n---\nsecond sentence";
    const result = await run({
      referenceId: "ref-1", sourceTranscriptVersionId: "ref-1", transcript,
      credentialStore, certificationStore,
      createClient: () => ({ createResponseText: async ({ input }) => {
        const chunk = chunkFromPrompt(input);
        return { text: output("ref-1", chunk, "First sentence. Second sentence.") };
      } })
    });
    expect(result.output.removedSegments).toContainEqual({ text: "---", reason: "formatting_noise" });
    expect(result.output.execution.removedNoise).toBe(1);
    db.close();
  });

  it("accepts a fenced wrapper but rejects malformed JSON", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const transcript = "this is a transcript with a clear sentence";
    const wrapped = `Here is the result:\n\`\`\`json\n${output("ref-1", transcript, "This is a transcript with a clear sentence.")}\n\`\`\``;
    const result = await run({
      referenceId: "ref-1", sourceTranscriptVersionId: "ref-1", transcript,
      credentialStore, certificationStore,
      createClient: () => ({ createResponseText: async () => ({ text: wrapped }) })
    });
    expect(result.output.cleanedTranscript).toContain("clear sentence.");
    await expect(run({
      referenceId: "ref-1", sourceTranscriptVersionId: "ref-1", transcript,
      credentialStore, certificationStore,
      createClient: () => ({ createResponseText: async () => ({ text: "not json" }) })
    })).rejects.toMatchObject({ category: "invalid_response_json" });
    db.close();
  });

  it("unwraps a response object that includes provider metadata", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const transcript = "this transcript needs punctuation and capitalization";
    const payload = JSON.parse(output("ref-1", transcript, "This transcript needs punctuation and capitalization."));
    const result = await run({
      referenceId: "ref-1", sourceTranscriptVersionId: "ref-1", transcript,
      credentialStore, certificationStore,
      createClient: () => ({ createResponseText: async () => ({ text: JSON.stringify({ response: payload, usage: { inputTokens: 1 } }) }) })
    });
    expect(result.output.cleanedTranscript).toContain("capitalization.");
    db.close();
  });

  it("sends only the current chunk with the cleaning schema prompt", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const transcript = "first chunk has enough words to split here\n\nsecond chunk has enough words to split here";
    const prompts: string[] = [];
    await run({
      referenceId: "ref-1", sourceTranscriptVersionId: "ref-1", transcript, maxChunkCharacters: 42,
      credentialStore, certificationStore,
      createClient: () => ({ createResponseText: async ({ input }) => {
        prompts.push(input);
        const chunk = chunkFromPrompt(input);
        return { text: output("ref-1", chunk, `${chunk.trim()}.`, "chunked", chunkCountFromPrompt(input)) };
      } })
    });
    expect(prompts.length).toBeGreaterThan(1);
    expect(prompts.every((prompt) => prompt.includes("Do not return rawTranscript."))).toBe(true);
    const chunks = prompts.map(chunkFromPrompt);
    expect(new Set(chunks).size).toBe(chunks.length);
    expect(chunks.every((chunk) => chunk !== transcript)).toBe(true);
    db.close();
  });

  it("merges cleaned chunks in source order and reports total progress", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const transcript = "first paragraph has enough words to split here\n\nsecond paragraph follows with more words";
    const seenProgress: Array<{ chunkIndex: number; totalChunks: number }> = [];
    const result = await run({
      referenceId: "ref-1", sourceTranscriptVersionId: "ref-1", transcript, maxChunkCharacters: 42,
      credentialStore, certificationStore,
      onChunkProgress: (progress) => { seenProgress.push({ chunkIndex: progress.chunkIndex, totalChunks: progress.totalChunks }); },
      createClient: () => ({ createResponseText: async ({ input }) => {
        const chunk = chunkFromPrompt(input);
        const cleaned = `${chunk.replace(/\s+/g, " ").trim()}.`;
        return { text: output("ref-1", chunk, cleaned, "chunked", chunkCountFromPrompt(input)) };
      } })
    });
    expect(result.output.cleanedTranscript.indexOf("first paragraph")).toBeLessThan(result.output.cleanedTranscript.indexOf("second paragraph"));
    expect(Math.max(...seenProgress.map((progress) => progress.totalChunks))).toBeGreaterThan(1);
    expect(result.output.rawTranscript).toBe(transcript);
    db.close();
  });
});
