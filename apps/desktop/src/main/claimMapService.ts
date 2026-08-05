import { createHash } from "node:crypto";
import type { ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { claimMapOutputSchema } from "@lsf/domain";
import { NineRouterClient, NineRouterTextResponseError } from "@lsf/providers";
import { loadNineRouterTextCertification } from "./nineRouterTextCertificationService";

export const claimMapMaxChunkCharacters = 6_000;
export const claimMapPerChunkTimeoutMs = 120_000;
export const claimMapMaxAttempts = 2;
export const claimMapRetryBaseDelayMs = 500;
const claimMapMaxConcurrency = 2;

export class ClaimMapError extends Error { constructor(readonly category: "capability_not_verified" | "credential_missing" | "provider_failed" | "invalid_json" | "invalid_output", message: string) { super(message); } }
interface TextClient { createResponseText(input: { model: string; input: string; timeoutMs?: number; idempotencyKey?: string }): Promise<{ text: string; returnedModelId?: string }>; }

interface ClaimMapSource {
  id: string;
  sourceType: "primary" | "secondary";
  excerpt: string;
  title: string;
}

interface ClaimMapChunk {
  source: ClaimMapSource;
  chunkIndex: number;
  chunkCount: number;
  excerpt: string;
}

export function namespaceClaimMapOutput(output: unknown, projectId: string) {
  const parsed = claimMapOutputSchema.parse(output);
  return claimMapOutputSchema.parse({
    claims: parsed.claims.map((claim, index) => ({
      ...claim,
      id: `${projectId}-claim-${index + 1}`
    }))
  });
}

export async function runClaimMap(input: { sources: ClaimMapSource[]; credentialStore: ProviderCredentialStore; certificationStore: TextCertificationStore; createClient?: (config: { baseUrl: string; apiKey: string }) => TextClient }) {
  const certification = await loadNineRouterTextCertification({ credentialStore: input.credentialStore, certificationStore: input.certificationStore });
  if (certification.status !== "verified") throw new ClaimMapError("capability_not_verified", "A verified text-model certification is required before Claim Map can run.");
  const settings = input.credentialStore.loadProviderCredentialSettings("9router"); const apiKey = await input.credentialStore.resolveProviderSecret("9router");
  if (!settings?.textModel || !apiKey) throw new ClaimMapError("credential_missing", "The selected text model or credential is unavailable.");
  const chunks = input.sources.flatMap((source) => splitSourceExcerpt(source));
  if (!chunks.length) throw new ClaimMapError("invalid_output", "Claim Map requires at least one non-empty approved competitor transcript.");
  const client = input.createClient?.({ baseUrl: settings.baseUrl, apiKey }) ?? new NineRouterClient({ baseUrl: settings.baseUrl, apiKey, timeoutMs: claimMapPerChunkTimeoutMs });
  const results = await mapWithConcurrency(chunks, claimMapMaxConcurrency, async (chunk) => runClaimMapChunk(client, settings.textModel!, chunk));
  const merged = deduplicateClaims(results.flatMap((result) => result.output.claims));
  const result = claimMapOutputSchema.safeParse({ claims: merged });
  if (!result.success) throw new ClaimMapError("invalid_output", "Claim Map returned an invalid structured output after merging transcript chunks.");
  const sourceTypes = new Map(input.sources.map((source) => [source.id, source.sourceType]));
  for (const claim of result.data.claims) {
    if (claim.sourceIds.some((id) => !sourceTypes.has(id))) throw new ClaimMapError("invalid_output", "Claim Map cited an unknown source.");
    if (claim.sourceRequirement === "primary" && !claim.sourceIds.some((id) => sourceTypes.get(id) === "primary")) throw new ClaimMapError("invalid_output", "A primary-source claim lacks primary evidence.");
    if ((claim.type === "allegation" || claim.state === "unsupported") && claim.approvalState !== "blocked") throw new ClaimMapError("invalid_output", "Unsupported claims and allegations must be blocked.");
    if ((claim.type === "allegation" || claim.type === "interpretation") && !claim.qualification) throw new ClaimMapError("invalid_output", "Allegations and interpretations require qualification.");
  }
  const returnedModelId = results.find((result) => result.returnedModelId)?.returnedModelId;
  return { output: result.data, ...(returnedModelId ? { returnedModelId } : {}) };
}

async function runClaimMapChunk(client: TextClient, model: string, chunk: ClaimMapChunk): Promise<{ output: { claims: ReturnType<typeof claimMapOutputSchema.parse>["claims"] }; returnedModelId?: string }> {
  const prompt = buildClaimMapPrompt(chunk);
  const idempotencyKey = createHash("sha256").update(`${model}\n${chunk.source.id}\n${chunk.chunkIndex}\n${chunk.excerpt}`).digest("hex");
  let lastError: unknown;
  for (let attempt = 1; attempt <= claimMapMaxAttempts; attempt += 1) {
    try {
      const response = await client.createResponseText({ model, input: prompt, timeoutMs: claimMapPerChunkTimeoutMs, idempotencyKey });
      const result = claimMapOutputSchema.safeParse(parseClaimMapResponse(response.text));
      if (!result.success) throw new ClaimMapError("invalid_output", `Claim Map chunk ${chunk.chunkIndex + 1} returned an invalid structured output.`);
      return { output: result.data, ...(response.returnedModelId ? { returnedModelId: response.returnedModelId } : {}) };
    } catch (error) {
      lastError = error;
      if (!isRetryableClaimMapError(error) || attempt === claimMapMaxAttempts) break;
      await delay(claimMapRetryBaseDelayMs * (2 ** (attempt - 1)));
    }
  }
  if (lastError instanceof ClaimMapError) throw lastError;
  const status = lastError instanceof NineRouterTextResponseError ? lastError.status : "unknown";
  throw new ClaimMapError("provider_failed", `Claim Map chunk ${chunk.chunkIndex + 1} provider request failed: ${status}.`);
}

function buildClaimMapPrompt(chunk: ClaimMapChunk): string {
  return [
    "Create claims only from this approved competitor-reference transcript chunk. Return only strict JSON.",
    "The source is secondary evidence, not independently verified fact. Preserve uncertainty; do not browse, fact-check, summarize, or invent.",
    "Use exactly {claims:[{id,text,type,sourceRequirement,sourceIds,evidenceNote,confidence,qualification?,state,approvalState}]}.",
    "Every factual claim must cite the supplied source ID. Allegations, unsupported claims, and unqualified interpretations must be blocked and qualified.",
    `Source ID: ${chunk.source.id}`,
    `Source title: ${chunk.source.title}`,
    `Chunk: ${chunk.chunkIndex + 1}/${chunk.chunkCount}`,
    "Transcript chunk:",
    chunk.excerpt
  ].join("\n");
}

function splitSourceExcerpt(source: ClaimMapSource): ClaimMapChunk[] {
  const excerpt = source.excerpt.trim();
  if (!excerpt) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < excerpt.length) {
    let end = Math.min(start + claimMapMaxChunkCharacters, excerpt.length);
    if (end < excerpt.length) {
      const window = excerpt.slice(start, end);
      const paragraph = window.lastIndexOf("\n\n");
      const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
      const boundary = paragraph > 0 ? paragraph + 2 : sentence > 0 ? sentence + 2 : window.lastIndexOf(" ") + 1;
      if (boundary > 0) end = start + boundary;
    }
    chunks.push(excerpt.slice(start, end).trim());
    start = end;
  }
  return chunks.filter(Boolean).map((text, chunkIndex, all) => ({ source, chunkIndex, chunkCount: all.length, excerpt: text }));
}

function deduplicateClaims(claims: ReturnType<typeof claimMapOutputSchema.parse>["claims"]): typeof claims {
  const seen = new Set<string>();
  return claims.filter((claim) => {
    const key = `${claim.text.trim().toLowerCase()}|${[...claim.sourceIds].sort().join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let firstError: unknown;
  async function consume(): Promise<void> {
    while (!firstError && nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = await worker(items[index]!);
      } catch (error) {
        firstError ??= error;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => consume()));
  if (firstError) throw firstError;
  return results;
}

function parseClaimMapResponse(text: string): unknown {
  const candidates = [text.trim(), text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim() ?? ""];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      for (const key of ["output", "response", "content", "text", "output_text"]) {
        if (typeof parsed[key] === "string") {
          const nested = parseClaimMapResponse(parsed[key]);
          if (nested) return nested;
        }
      }
      return parsed;
    } catch {
      // Try the next supported response wrapper.
    }
  }
  throw new ClaimMapError("invalid_json", "Claim Map returned invalid JSON.");
}

function isRetryableClaimMapError(error: unknown): boolean {
  return error instanceof NineRouterTextResponseError && ["timeout", "network_error", "server_error", "rate_limited"].includes(error.status);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
