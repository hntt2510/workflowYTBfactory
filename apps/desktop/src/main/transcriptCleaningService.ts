import { createHash } from "node:crypto";
import type { ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { cleanedTranscriptOutputSchema, type CleanedTranscriptOutput } from "@lsf/domain";
import { TextProviderError, type TextProvider } from "@lsf/providers";
import { loadActiveTextCapability, resolveActiveTextProvider } from "./textProviderService";

const providerId = "cockpit";
export const transcriptCleaningRunnerVersion = "transcript-cleaning-v3";
export const transcriptCleaningPromptTemplateId = "02_transcript_cleaner";
export const transcriptCleaningPromptVersion = "v3";
export const defaultMaxChunkCharacters = 8_000;
export const defaultPerChunkTimeoutMs = 180_000;
export const defaultAggregateTimeoutMs = 15 * 60_000;
export const defaultMaxProviderInputTokens = 4_000;
export const maxTranscriptCleaningAttempts = 3;
export const defaultRetryBaseDelayMs = 500;

export type TranscriptCleaningErrorCategory =
  | "credential_missing"
  | "endpoint_unreachable"
  | "model_missing"
  | "certification_missing"
  | "certification_stale"
  | "provider_timeout"
  | "provider_http_error"
  | "provider_transport_error"
  | "input_token_budget_exceeded"
  | "empty_response"
  | "invalid_response_json"
  | "output_schema_invalid"
  | "output_content_invalid"
  | "chunk_failed"
  | "merge_failed"
  | "interrupted"
  | "internal_error";

export class TranscriptCleaningError extends Error {
  constructor(readonly category: TranscriptCleaningErrorCategory, message: string) {
    super(message);
  }
}

export interface TranscriptCleaningChunk {
  chunkIndex: number;
  sourceStart: number;
  sourceEnd: number;
  sourceHash: string;
  chunkFingerprint?: string;
  text: string;
}

export interface TranscriptCleaningChunkProgress {
  chunkIndex: number;
  totalChunks: number;
  sourceStart: number;
  sourceEnd: number;
  sourceHash: string;
  chunkFingerprint: string;
  status: "queued" | "running" | "completed" | "failed";
  attemptCount: number;
  providerRequestId?: string;
  startedAt?: string;
  finishedAt?: string;
  safeErrorCategory?: TranscriptCleaningErrorCategory;
  output?: CleanedTranscriptOutput;
}

export interface TranscriptCleaningPlan {
  preparedTranscript: string;
  sourceCharacterCount: number;
  estimatedInputTokens: number;
  removedNoise: string[];
  chunks: TranscriptCleaningChunk[];
  mode: "single_request" | "chunked";
}

export interface TranscriptCleaningResult {
  output: CleanedTranscriptOutput;
  returnedModelId?: string;
  warnings: Array<"excessive_content_loss" | "content_expansion">;
  execution: CleanedTranscriptOutput["execution"];
  chunks: TranscriptCleaningChunkProgress[];
}

interface TextClient {
  createResponseText(input: { model: string; input: string; timeoutMs?: number; idempotencyKey?: string }): Promise<{ text: string; returnedModelId?: string }>;
}

export function planTranscriptCleaning(transcript: string, options: { maxChunkCharacters?: number } = {}): TranscriptCleaningPlan {
  const sourceCharacterCount = transcript.length;
  const normalized = transcript.normalize("NFC").replace(/\r\n?/g, "\n");
  const removedNoise: string[] = [];
  const lines = normalized.split("\n").flatMap((line) => {
    const trimmed = line.trim();
    if (trimmed && /^[\-=_*~.]{3,}$/.test(trimmed)) {
      removedNoise.push(trimmed);
      return [];
    }
    const cleanedLine = line.replace(/[ \t]+/g, " ").replace(/[ \t]+$/g, "");
    if (cleanedLine !== line && line.length > 0) removedNoise.push(line);
    return [cleanedLine];
  });
  const joined = lines.join("\n");
  const compacted = joined.replace(/\n{3,}/g, (match) => {
    removedNoise.push(match);
    return "\n\n";
  });
  const preparedTranscript = compacted.trim();
  if (compacted !== preparedTranscript) {
    const leadingWhitespaceLength = compacted.length - compacted.trimStart().length;
    const removedOuterWhitespace = compacted.slice(0, leadingWhitespaceLength)
      + compacted.slice(leadingWhitespaceLength + preparedTranscript.length);
    if (removedOuterWhitespace) removedNoise.push(removedOuterWhitespace);
  }
  const maxChunkCharacters = options.maxChunkCharacters ?? defaultMaxChunkCharacters;
  const chunks = splitTranscript(preparedTranscript, maxChunkCharacters);
  return {
    preparedTranscript,
    sourceCharacterCount,
    estimatedInputTokens: Math.ceil(preparedTranscript.length / 4),
    removedNoise,
    chunks,
    mode: chunks.length === 1 ? "single_request" : "chunked"
  };
}

export async function runTranscriptCleaning(input: {
  referenceId: string;
  sourceTranscriptVersionId: string;
  transcript: string;
  model: string;
  configuredTimeoutMs?: number;
  maxChunkCharacters?: number;
  perChunkTimeoutMs?: number;
  aggregateTimeoutMs?: number;
  maxProviderInputTokens?: number;
  credentialStore: ProviderCredentialStore;
  certificationStore: TextCertificationStore;
  resumeChunks?: TranscriptCleaningChunkProgress[];
  onChunkProgress?: (progress: TranscriptCleaningChunkProgress) => void | Promise<void>;
  retryBaseDelayMs?: number;
  createClient?: (config: { baseUrl: string; apiKey: string }) => TextClient;
}): Promise<TranscriptCleaningResult> {
  if (!input.transcript.trim()) throw new TranscriptCleaningError("output_content_invalid", "Transcript Cleaning requires a non-empty raw transcript.");
  const certification = await loadActiveTextCapability({
    credentialStore: input.credentialStore,
    certificationStore: input.certificationStore
  });
  if (certification.status === "not_tested") throw new TranscriptCleaningError("certification_missing", "Text model certification is required before Transcript Cleaning can run.");
  if (certification.status === "stale") throw new TranscriptCleaningError("certification_stale", "The selected text model certification is stale.");
  if (certification.status !== "verified") throw new TranscriptCleaningError("internal_error", "The selected text model is not certified for Transcript Cleaning.");

  const settings = input.credentialStore.loadProviderCredentialSettings(providerId);
  const apiKey = await input.credentialStore.resolveProviderSecret(providerId);
  if (!settings) throw new TranscriptCleaningError("credential_missing", "Cockpit text provider settings are missing.");
  if (!settings.textModel) throw new TranscriptCleaningError("model_missing", "Select a text model before running Transcript Cleaning.");
  if (!apiKey) throw new TranscriptCleaningError("credential_missing", "Cockpit credential is missing or unavailable.");
  if (settings.textModel !== input.model) throw new TranscriptCleaningError("model_missing", "The selected text model changed; reload the workflow before retrying.");

  const basePlan = input.maxChunkCharacters === undefined
    ? planTranscriptCleaning(input.transcript)
    : planTranscriptCleaning(input.transcript, { maxChunkCharacters: input.maxChunkCharacters });
  const credentialVersionRef = input.credentialStore.loadProviderCredentialVersionRef(providerId) ?? "";
  const providerConfigurationFingerprint = hashText(JSON.stringify({ providerId, baseUrl: settings.baseUrl, credentialVersionRef }));
  const plan: TranscriptCleaningPlan = {
    ...basePlan,
    chunks: basePlan.chunks.map((chunk) => ({
      ...chunk,
      chunkFingerprint: hashText(JSON.stringify({
        referenceId: input.referenceId,
        sourceTranscriptVersionId: input.sourceTranscriptVersionId,
        sourceStart: chunk.sourceStart,
        sourceEnd: chunk.sourceEnd,
        sourceHash: chunk.sourceHash,
        promptVersion: transcriptCleaningPromptVersion,
        selectedModel: settings.textModel,
        providerConfigurationFingerprint,
        runnerVersion: transcriptCleaningRunnerVersion
      }))
    }))
  };
  const perChunkTimeoutMs = input.perChunkTimeoutMs ?? defaultPerChunkTimeoutMs;
  const aggregateDeadline = Date.now() + (input.aggregateTimeoutMs ?? defaultAggregateTimeoutMs);
  const maxProviderInputTokens = input.maxProviderInputTokens ?? defaultMaxProviderInputTokens;
  const retryBaseDelayMs = input.retryBaseDelayMs ?? defaultRetryBaseDelayMs;
  let configured: { provider: TextProvider; model: string };
  try { configured = await resolveActiveTextProvider({ credentialStore: input.credentialStore, certificationStore: input.certificationStore }); }
  catch { throw new TranscriptCleaningError("certification_missing", "Verified Cockpit text capability is required before Transcript Cleaning can run."); }
  const client = input.createClient?.({ baseUrl: "", apiKey: "" });
  const resumeByIndex = new Map((input.resumeChunks ?? []).map((chunk) => [chunk.chunkIndex, chunk]));
  const progress: TranscriptCleaningChunkProgress[] = [];
  const completed: Array<{ chunk: TranscriptCleaningChunk; output: CleanedTranscriptOutput }> = [];
  let returnedModelId: string | undefined;

  for (const chunk of plan.chunks) {
    if (Date.now() >= aggregateDeadline) throw new TranscriptCleaningError("provider_timeout", "Transcript Cleaning exceeded the aggregate execution timeout.");
    const resumed = resumeByIndex.get(chunk.chunkIndex);
    if (resumed?.status === "completed" && resumed.output && resumed.sourceHash === chunk.sourceHash && resumed.chunkFingerprint === chunk.chunkFingerprint) {
      completed.push({ chunk, output: resumed.output });
      progress.push(resumed);
      continue;
    }

    let output: CleanedTranscriptOutput | undefined;
    let attemptCount = 0;
    const startedAt = new Date().toISOString();
    await reportProgress(input.onChunkProgress, progress, {
      chunkIndex: chunk.chunkIndex,
      totalChunks: plan.chunks.length,
      sourceStart: chunk.sourceStart,
      sourceEnd: chunk.sourceEnd,
      sourceHash: chunk.sourceHash,
      chunkFingerprint: chunk.chunkFingerprint!,
      status: "queued",
      attemptCount: 0,
      startedAt
    });

    while (!output && attemptCount < maxTranscriptCleaningAttempts) {
      attemptCount += 1;
      await reportProgress(input.onChunkProgress, progress, {
        chunkIndex: chunk.chunkIndex,
        totalChunks: plan.chunks.length,
        sourceStart: chunk.sourceStart,
        sourceEnd: chunk.sourceEnd,
        sourceHash: chunk.sourceHash,
        chunkFingerprint: chunk.chunkFingerprint!,
        status: "running",
        attemptCount,
        startedAt
      });
      try {
        const remainingMs = aggregateDeadline - Date.now();
        if (remainingMs <= 0) throw new TranscriptCleaningError("provider_timeout", "Transcript Cleaning exceeded the aggregate execution timeout.");
        const configuredTimeoutMs = input.configuredTimeoutMs ?? perChunkTimeoutMs;
        const prompt = buildPrompt({
          chunk,
          plan
        });
        if (estimateInputTokens(prompt) > maxProviderInputTokens) {
          throw new TranscriptCleaningError("input_token_budget_exceeded", `Transcript Cleaning chunk ${chunk.chunkIndex + 1} exceeds the configured provider input token budget.`);
        }
        const response = client
          ? await client.createResponseText({ model: configured.model, input: prompt, timeoutMs: Math.min(perChunkTimeoutMs, remainingMs), ...(chunk.chunkFingerprint ? { idempotencyKey: chunk.chunkFingerprint } : {}) })
          : await configured.provider.generateText({ model: configured.model, input: prompt, timeoutMs: Math.min(perChunkTimeoutMs, remainingMs) });
        if (response.returnedModelId) returnedModelId = response.returnedModelId;
        output = parseChunkOutput(response.text, input.referenceId, input.sourceTranscriptVersionId, chunk, {
          mode: plan.mode,
          chunkCount: plan.chunks.length,
          selectedModel: settings.textModel,
          configuredTimeoutMs
        });
      } catch (error) {
        const mapped = mapProviderError(error);
        if (mapped && isRetryable(mapped) && attemptCount < maxTranscriptCleaningAttempts) {
          const remainingMs = aggregateDeadline - Date.now();
          if (remainingMs <= 0) throw new TranscriptCleaningError("provider_timeout", "Transcript Cleaning exceeded the aggregate execution timeout.");
          await delay(Math.min(retryBaseDelayMs * (2 ** (attemptCount - 1)), remainingMs));
          continue;
        }
        const finishedAt = new Date().toISOString();
        await reportProgress(input.onChunkProgress, progress, {
          chunkIndex: chunk.chunkIndex,
          totalChunks: plan.chunks.length,
          sourceStart: chunk.sourceStart,
          sourceEnd: chunk.sourceEnd,
          sourceHash: chunk.sourceHash,
          chunkFingerprint: chunk.chunkFingerprint!,
          status: "failed",
          attemptCount,
          startedAt,
          finishedAt,
          safeErrorCategory: mapped ?? (error instanceof TranscriptCleaningError ? error.category : "internal_error")
        });
        if (error instanceof TranscriptCleaningError) throw error;
        if (mapped) throw new TranscriptCleaningError(mapped, `Transcript Cleaning chunk ${chunk.chunkIndex + 1} failed: ${providerMessage(mapped)}.`);
        throw new TranscriptCleaningError("chunk_failed", `Transcript Cleaning chunk ${chunk.chunkIndex + 1} failed.`);
      }
    }
    if (!output) throw new TranscriptCleaningError("chunk_failed", `Transcript Cleaning chunk ${chunk.chunkIndex + 1} failed.`);
    completed.push({ chunk, output });
    const finishedAt = new Date().toISOString();
    await reportProgress(input.onChunkProgress, progress, {
      chunkIndex: chunk.chunkIndex,
      totalChunks: plan.chunks.length,
      sourceStart: chunk.sourceStart,
      sourceEnd: chunk.sourceEnd,
      sourceHash: chunk.sourceHash,
      chunkFingerprint: chunk.chunkFingerprint!,
      status: "completed",
      attemptCount,
      startedAt,
      finishedAt,
      output
    });
  }

  try {
    const mergedTranscript = mergeChunkOutputs(completed.map((item) => item.output.cleanedTranscript));
    if (!mergedTranscript.trim()) throw new TranscriptCleaningError("merge_failed", "Transcript Cleaning produced an empty merged transcript.");
    const removedSegments = [
      ...plan.removedNoise.map((text) => ({ text, reason: "formatting_noise" as const })),
      ...completed.flatMap(({ chunk, output }) => output.removedSegments.map((segment) => ({
        ...segment,
        ...(segment.sourceStart !== undefined ? { sourceStart: segment.sourceStart + chunk.sourceStart } : {}),
        ...(segment.sourceEnd !== undefined ? { sourceEnd: segment.sourceEnd + chunk.sourceStart } : {})
      })))
    ];
    const flaggedSegments = completed.flatMap(({ chunk, output }) => output.flaggedSegments.map((segment) => ({
      ...segment,
      ...(segment.sourceStart !== undefined ? { sourceStart: segment.sourceStart + chunk.sourceStart } : {}),
      ...(segment.sourceEnd !== undefined ? { sourceEnd: segment.sourceEnd + chunk.sourceStart } : {})
    })));
    const warnings: TranscriptCleaningResult["warnings"] = [];
    if (mergedTranscript.length < input.transcript.length * 0.5) warnings.push("excessive_content_loss");
    if (mergedTranscript.length > input.transcript.length * 1.2) warnings.push("content_expansion");
    const execution = {
      mode: plan.mode,
      chunkCount: plan.chunks.length,
      completedChunkCount: completed.length,
      estimatedInputTokens: plan.estimatedInputTokens,
      selectedModel: settings.textModel,
      configuredTimeoutMs: input.configuredTimeoutMs ?? perChunkTimeoutMs,
      removedNoise: removedSegments.length,
      flaggedSegmentCount: flaggedSegments.length
    } as const;
    const output = cleanedTranscriptOutputSchema.parse({
      referenceId: input.referenceId,
      sourceTranscriptVersionId: input.sourceTranscriptVersionId,
      rawTranscript: input.transcript,
      cleanedTranscript: mergedTranscript,
      removedSegments,
      flaggedSegments,
      sourceCharacterCount: input.transcript.length,
      cleanedCharacterCount: mergedTranscript.length,
      execution
    });
    return { output, warnings, execution, chunks: progress, ...(returnedModelId ? { returnedModelId } : {}) };
  } catch (error) {
    if (error instanceof TranscriptCleaningError) throw error;
    throw new TranscriptCleaningError("merge_failed", "Transcript Cleaning could not merge chunk outputs safely.");
  }
}

function splitTranscript(text: string, maxCharacters: number): TranscriptCleaningChunk[] {
  if (!text) return [{ chunkIndex: 0, sourceStart: 0, sourceEnd: 0, sourceHash: hashText(text), text }];
  const chunks: TranscriptCleaningChunk[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxCharacters, text.length);
    if (end < text.length) {
      const boundary = findBoundary(text, start, end);
      if (boundary > start) end = boundary;
    }
    const chunkText = text.slice(start, end);
    chunks.push({ chunkIndex: chunks.length, sourceStart: start, sourceEnd: end, sourceHash: hashText(chunkText), text: chunkText });
    start = end;
  }
  return chunks;
}

function findBoundary(text: string, start: number, end: number): number {
  const window = text.slice(start, end);
  const paragraph = window.lastIndexOf("\n\n");
  if (paragraph > 0) return start + paragraph + 2;
  const line = window.lastIndexOf("\n");
  if (line > 0) return start + line + 1;
  const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
  if (sentence > 0) return start + sentence + 2;
  const whitespace = window.lastIndexOf(" ");
  return whitespace > 0 ? start + whitespace + 1 : end;
}

function normalizeChunkProviderOutput(parsed: unknown, chunk: TranscriptCleaningChunk): unknown {
  if (!isRecord(parsed)) return parsed;
  const normalized = { ...parsed };
  if (!("sourceCharacterCount" in normalized)) normalized.sourceCharacterCount = chunk.text.length;
  if (!("cleanedCharacterCount" in normalized) && typeof normalized.cleanedTranscript === "string") {
    normalized.cleanedCharacterCount = normalized.cleanedTranscript.length;
  }
  if (Array.isArray(normalized.flaggedSegments)) {
    normalized.flaggedSegments = normalized.flaggedSegments.map((segment) => normalizeSegment(segment, {
      unclear_audio: "unclear_transcription",
      possible_transcription_error: "possible_term_error"
    }));
  }
  if (Array.isArray(normalized.removedSegments)) {
    normalized.removedSegments = normalized.removedSegments.map((segment) => normalizeSegment(segment, {
      noise: "formatting_noise",
      formatting: "formatting_noise",
      duplicate: "duplicate_caption",
      timestamp_marker: "timestamp"
    }));
  }
  if (isRecord(normalized.execution)) {
    const execution = normalized.execution;
    normalized.execution = Object.fromEntries([
      "mode", "chunkCount", "completedChunkCount", "estimatedInputTokens", "selectedModel",
      "configuredTimeoutMs", "removedNoise", "flaggedSegmentCount"
    ].filter((key) => key in execution).map((key) => [key, execution[key]]));
  }
  delete normalized.chunkIndex;
  delete normalized.sourceStart;
  delete normalized.sourceEnd;
  delete normalized.chunkCount;
  return normalized;
}

function normalizeSegment(segment: unknown, reasonAliases: Record<string, string>): unknown {
  if (!isRecord(segment)) return segment;
  const normalized: Record<string, unknown> = {
    text: segment.text,
    reason: typeof segment.reason === "string" ? reasonAliases[segment.reason] ?? segment.reason : segment.reason
  };
  if (typeof segment.sourceStart === "number") normalized.sourceStart = segment.sourceStart;
  if (typeof segment.sourceEnd === "number") normalized.sourceEnd = segment.sourceEnd;
  if (typeof segment.suggestion === "string") normalized.suggestion = segment.suggestion;
  return normalized;
}

function parseChunkOutput(
  text: string,
  referenceId: string,
  sourceTranscriptVersionId: string,
  chunk: TranscriptCleaningChunk,
  expected: { mode: TranscriptCleaningPlan["mode"]; chunkCount: number; selectedModel: string; configuredTimeoutMs: number }
): CleanedTranscriptOutput {
  const parsed = parseProviderJson(text);
  const normalized = normalizeChunkProviderOutput(parsed, chunk);
  if (isRecord(normalized)) {
    if (!("referenceId" in normalized)) normalized.referenceId = referenceId;
    if (!("sourceTranscriptVersionId" in normalized)) normalized.sourceTranscriptVersionId = sourceTranscriptVersionId;
    if (!("removedSegments" in normalized)) normalized.removedSegments = [];
    if (!("flaggedSegments" in normalized)) normalized.flaggedSegments = [];
    if (!("sourceCharacterCount" in normalized)) normalized.sourceCharacterCount = chunk.text.length;
    if (!("cleanedCharacterCount" in normalized) && typeof normalized.cleanedTranscript === "string") {
      normalized.cleanedCharacterCount = normalized.cleanedTranscript.length;
    }
    if (!("execution" in normalized)) {
      normalized.execution = {
        mode: expected.mode,
        chunkCount: expected.chunkCount,
        completedChunkCount: 1,
        estimatedInputTokens: estimateInputTokens(chunk.text),
        selectedModel: expected.selectedModel,
        configuredTimeoutMs: expected.configuredTimeoutMs,
        removedNoise: Array.isArray(normalized.removedSegments) ? normalized.removedSegments.length : 0,
        flaggedSegmentCount: Array.isArray(normalized.flaggedSegments) ? normalized.flaggedSegments.length : 0
      };
    }
  }
  const result = cleanedTranscriptOutputSchema.omit({ rawTranscript: true }).safeParse(normalized);
  if (!result.success) {
    const issue = result.error.issues[0];
    const location = issue?.path.length ? issue.path.join(".") : "response";
    throw new TranscriptCleaningError("output_schema_invalid", `Transcript Cleaning returned invalid ${location}: ${issue?.message ?? "schema mismatch"}.`);
  }
  const output = result.data;
  if (output.referenceId !== referenceId || output.sourceTranscriptVersionId !== sourceTranscriptVersionId) {
    throw new TranscriptCleaningError("output_content_invalid", "Transcript Cleaning output does not match the requested reference version.");
  }
  if (output.cleanedTranscript.trim().length === 0) throw new TranscriptCleaningError("empty_response", "Transcript Cleaning returned an empty cleaned transcript.");
  if (output.sourceCharacterCount !== chunk.text.length) {
    throw new TranscriptCleaningError("output_content_invalid", "Transcript Cleaning source character count does not match the supplied chunk.");
  }
  if (output.cleanedCharacterCount !== output.cleanedTranscript.length) {
    throw new TranscriptCleaningError("output_content_invalid", "Transcript Cleaning cleaned character count does not match the returned text.");
  }
  if (
    output.execution.mode !== expected.mode ||
    output.execution.chunkCount !== expected.chunkCount ||
    output.execution.completedChunkCount !== 1 ||
    output.execution.estimatedInputTokens !== estimateInputTokens(chunk.text) ||
    output.execution.selectedModel !== expected.selectedModel ||
    output.execution.configuredTimeoutMs !== expected.configuredTimeoutMs ||
    output.execution.removedNoise !== output.removedSegments.length ||
    output.execution.flaggedSegmentCount !== output.flaggedSegments.length
  ) {
    throw new TranscriptCleaningError("output_content_invalid", "Transcript Cleaning execution metadata does not match the requested chunk.");
  }
  if (!hasMeaningfulCleaningChange(chunk.text, output.cleanedTranscript)) {
    throw new TranscriptCleaningError("output_content_invalid", "Transcript Cleaning output is identical or only normalizes insignificant whitespace; no cleaning was produced.");
  }
  validateContentPreservation(chunk.text, output.cleanedTranscript);
  if (/^(cleaned transcript|transcript)\s*:/i.test(output.cleanedTranscript.trim())) {
    throw new TranscriptCleaningError("output_content_invalid", "Transcript Cleaning returned commentary instead of cleaned transcript text.");
  }
  return { ...output, rawTranscript: chunk.text, sourceCharacterCount: chunk.text.length, cleanedCharacterCount: output.cleanedTranscript.length };
}

function buildPrompt(input: {
  chunk: TranscriptCleaningChunk;
  plan: TranscriptCleaningPlan;
}): string {
  return [
    "Clean only this transcript chunk. Return exactly one JSON object, with no markdown or commentary.",
    "Preserve every fact, number, quote, language, meaning, and narration. Do not summarize, translate, fact-check, add facts, or rewrite.",
    "Fix only clear ASR errors, punctuation, capitalization, paragraph breaks, and certain names. Mark uncertain terms instead of guessing.",
    "Keep sponsor, self-promotion, affiliate, and disclaimer text; flag it. Remove only timestamps, exact caption artifacts, formatting noise, or empty fragments; record removals.",
    "Never summarize, deduplicate, shorten, or remove repeated sentences or paragraphs merely because they repeat. Repetition is source content unless it is clearly a caption artifact.",
    "The cleaned transcript must retain essentially every source word in the same order; do not use removedSegments to hide omitted narration.",
    "Return only these fields: cleanedTranscript, removedSegments, flaggedSegments. The application adds run metadata. Do not return rawTranscript.",
    "Use the exact fields and enum reasons below. If no clear correction is possible, preserve the text rather than inventing changes.",
    `chunkIndex: ${input.chunk.chunkIndex}`,
    `chunkCount: ${input.plan.chunks.length}`,
    "removedSegments reasons: timestamp | duplicate_caption | formatting_noise | empty_fragment.",
    "flaggedSegments reasons: unclear_transcription | possible_name_error | possible_term_error | language_mismatch | sponsor | self_promotion | affiliate | disclaimer.",
    "Transcript chunk follows:",
    input.chunk.text
  ].join("\n");
}

async function reportProgress(callback: ((progress: TranscriptCleaningChunkProgress) => void | Promise<void>) | undefined, progress: TranscriptCleaningChunkProgress[], next: TranscriptCleaningChunkProgress): Promise<void> {
  const index = progress.findIndex((item) => item.chunkIndex === next.chunkIndex);
  if (index >= 0) progress[index] = next;
  else progress.push(next);
  if (callback) await callback(next);
}

function mapProviderError(error: unknown): TranscriptCleaningErrorCategory | undefined {
  if (!(error instanceof TextProviderError)) return undefined;
  if (error.code === "timeout") return "provider_timeout";
  if (error.code === "provider_unavailable") return "provider_transport_error";
  if (error.code === "model_not_found") return "endpoint_unreachable";
  if (error.code === "authentication_failed") return "credential_missing";
  if (error.code === "invalid_response" || error.code === "invalid_json") return "invalid_response_json";
  return "provider_http_error";
}

function providerMessage(category: TranscriptCleaningErrorCategory): string {
  return category.replaceAll("_", " ");
}

function isRetryable(category: TranscriptCleaningErrorCategory): boolean {
  return category === "provider_timeout" || category === "provider_transport_error" || category === "provider_http_error";
}

function parseProviderJson(text: string): unknown {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) throw new TranscriptCleaningError("empty_response", "Transcript Cleaning provider returned an empty response.");
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const unfenced = (fenced?.[1] ?? trimmed).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start < 0 || end <= start) throw new TranscriptCleaningError("invalid_response_json", "Transcript Cleaning returned invalid JSON.");
    try {
      parsed = JSON.parse(unfenced.slice(start, end + 1));
    } catch {
      throw new TranscriptCleaningError("invalid_response_json", "Transcript Cleaning returned invalid JSON.");
    }
  }
  for (let depth = 0; depth < 3; depth += 1) {
    if (!isRecord(parsed)) break;
    const record = parsed;
    const wrappers = ["data", "result", "response", "output"] as const;
    const wrapper = wrappers.find((key) => {
      const value = record[key];
      if (!isRecord(value)) return false;
      return Object.keys(record).length === 1 || "cleanedTranscript" in value || "sourceTranscriptVersionId" in value;
    });
    if (!wrapper) break;
    parsed = parsed[wrapper];
  }
  return parsed;
}

function hasMeaningfulCleaningChange(source: string, output: string): boolean {
  if (source === output) return false;
  const normalizeLayout = (value: string) => value.normalize("NFC").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (normalizeLayout(source) === normalizeLayout(output)) return false;
  const prefix = commonPrefixLength(source, output);
  let suffix = 0;
  while (
    suffix < source.length - prefix &&
    suffix < output.length - prefix &&
    source[source.length - suffix - 1] === output[output.length - suffix - 1]
  ) {
    suffix += 1;
  }
  const changedRegionLength = Math.max(source.length - prefix - suffix, output.length - prefix - suffix);
  const minimumChange = source.length < 200 ? 1 : Math.max(8, Math.ceil(source.length * 0.002));
  return changedRegionLength >= minimumChange;
}

function commonPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) index += 1;
  return index;
}

function validateContentPreservation(source: string, output: string): void {
  const sourceTokens = source.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  const outputTokens = output.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  if (!sourceTokens.length || !outputTokens.length) throw new TranscriptCleaningError("output_content_invalid", "Transcript Cleaning returned no usable transcript content.");
  const sourceSet = new Set(sourceTokens);
  const outputSet = new Set(outputTokens);
  const matchedSourceTokens = sourceTokens.filter((token) => outputSet.has(token)).length;
  const outputLengthRatio = outputTokens.length / sourceTokens.length;
  if (sourceTokens.length >= 20 && (matchedSourceTokens / sourceTokens.length < 0.55 || outputLengthRatio < 0.55 || outputLengthRatio > 1.6)) {
    throw new TranscriptCleaningError("output_content_invalid", "Transcript Cleaning changed or omitted too much source content.");
  }
  if (!outputTokens.some((token) => sourceSet.has(token))) throw new TranscriptCleaningError("output_content_invalid", "Transcript Cleaning returned unrelated content.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeChunkOutputs(outputs: string[]): string {
  return outputs.reduce((merged, next) => {
    if (!merged) return next;
    const overlap = findOverlap(merged, next);
    if (overlap) return `${merged}${next.slice(overlap)}`;
    if (/\s$/.test(merged) || /^\s/.test(next)) return `${merged}${next}`;
    return `${merged}\n\n${next}`;
  }, "");
}

function findOverlap(left: string, right: string): number {
  const max = Math.min(500, left.length, right.length);
  for (let length = max; length >= 8; length -= 1) {
    if (left.slice(-length) === right.slice(0, length)) return length;
  }
  return 0;
}

function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function estimateInputTokens(value: string): number {
  return Math.ceil(value.length / 4);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
