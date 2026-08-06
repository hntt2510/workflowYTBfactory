import type { ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { validateReferenceSegmentationOutput, type ReferenceSegmentationOutput } from "@lsf/domain";
import { NineRouterClient, NineRouterTextResponseError } from "@lsf/providers";
import { loadNineRouterTextCertification } from "./nineRouterTextCertificationService";

const providerId = "9router";
export const referenceSegmentationTimeoutMs = 300_000;
export const defaultSegmentationChunkCharacters = 6_000;

export class ReferenceSegmentationError extends Error {
  constructor(readonly category: "capability_not_verified" | "credential_missing" | "provider_failed" | "invalid_json" | "invalid_output", message: string) {
    super(message);
  }
}

interface TextClient {
  createResponseText(input: { model: string; input: string }): Promise<{ text: string; returnedModelId?: string }>;
}

export async function runReferenceSegmentation(input: {
  referenceId: string;
  cleanedTranscriptArtifactId: string;
  cleanedTranscript: string;
  credentialStore: ProviderCredentialStore;
  certificationStore: TextCertificationStore;
  maxChunkCharacters?: number;
  createClient?: (config: { baseUrl: string; apiKey: string }) => TextClient;
}): Promise<{ output: ReferenceSegmentationOutput; returnedModelId?: string }> {
  const certification = await loadNineRouterTextCertification({ credentialStore: input.credentialStore, certificationStore: input.certificationStore });
  if (certification.status !== "verified") {
    throw new ReferenceSegmentationError("capability_not_verified", "A verified text-model certification is required before Reference Segmentation can run.");
  }
  const settings = input.credentialStore.loadProviderCredentialSettings(providerId);
  const apiKey = await input.credentialStore.resolveProviderSecret(providerId);
  if (!settings?.textModel || !apiKey) {
    throw new ReferenceSegmentationError("credential_missing", "The selected text model or credential is unavailable.");
  }

  const client = input.createClient?.({ baseUrl: settings.baseUrl, apiKey }) ?? new NineRouterClient({ baseUrl: settings.baseUrl, apiKey, timeoutMs: referenceSegmentationTimeoutMs });
  const chunks = splitTranscript(input.cleanedTranscript, input.maxChunkCharacters ?? defaultSegmentationChunkCharacters);
  const chunkOutputs: Array<{ chunk: SegmentationChunk; output: ReferenceSegmentationOutput }> = [];
  let returnedModelId: string | undefined;

  for (const chunk of chunks) {
    let response: { text: string; returnedModelId?: string };
    try {
      response = await client.createResponseText({ model: settings.textModel, input: buildPrompt({ ...input, cleanedTranscript: chunk.text, sourceStart: chunk.sourceStart, sourceEnd: chunk.sourceEnd, totalTranscriptLength: input.cleanedTranscript.length }) });
    } catch (error) {
      if (error instanceof NineRouterTextResponseError) {
        throw new ReferenceSegmentationError("provider_failed", `Reference Segmentation provider request failed: ${error.status}.`);
      }
      throw new ReferenceSegmentationError("provider_failed", "Reference Segmentation provider request failed.");
    }
    if (response.returnedModelId) returnedModelId = response.returnedModelId;
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.text.trim());
    } catch {
      throw new ReferenceSegmentationError("invalid_json", "Reference Segmentation returned invalid JSON.");
    }
    const validation = validateReferenceSegmentationOutput(parsed, chunk.text, input.referenceId);
    if (!validation.output) throw new ReferenceSegmentationError("invalid_output", validation.errors[0] ?? "Reference Segmentation returned invalid structured output.");
    if (validation.output.cleanedTranscriptArtifactId !== input.cleanedTranscriptArtifactId) throw new ReferenceSegmentationError("invalid_output", "Reference Segmentation cited a different cleaned transcript artifact.");
    chunkOutputs.push({ chunk, output: validation.output });
  }

  let order = 0;
  const segments = chunkOutputs.flatMap(({ chunk, output }, chunkIndex) => output.segments.map((segment) => ({
    ...segment,
    id: `segment-${chunkIndex}-${segment.id}`,
    order: order++,
    startCharacter: segment.startCharacter + chunk.sourceStart,
    endCharacter: segment.endCharacter + chunk.sourceStart
  })));
  const excludedSegmentIds = chunkOutputs.flatMap(({ output }, chunkIndex) => output.excludedSegmentIds.map((id) => `segment-${chunkIndex}-${id}`));
  const aggregate = validateReferenceSegmentationOutput({ referenceId: input.referenceId, cleanedTranscriptArtifactId: input.cleanedTranscriptArtifactId, segments, excludedSegmentIds }, input.cleanedTranscript, input.referenceId);
  if (!aggregate.output) throw new ReferenceSegmentationError("invalid_output", aggregate.errors[0] ?? "Reference Segmentation merge returned invalid structured output.");
  return { output: aggregate.output, ...(returnedModelId ? { returnedModelId } : {}) };
}

interface SegmentationChunk {
  sourceStart: number;
  sourceEnd: number;
  text: string;
}

function splitTranscript(text: string, maxCharacters: number): SegmentationChunk[] {
  if (!text) return [{ sourceStart: 0, sourceEnd: 0, text }];
  const chunks: SegmentationChunk[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxCharacters, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const paragraph = window.lastIndexOf("\n\n");
      const line = window.lastIndexOf("\n");
      const whitespace = window.lastIndexOf(" ");
      const boundary = paragraph > 0 ? paragraph + 2 : line > 0 ? line + 1 : whitespace > 0 ? whitespace + 1 : 0;
      if (boundary > 0) end = start + boundary;
    }
    chunks.push({ sourceStart: start, sourceEnd: end, text: text.slice(start, end) });
    start = end;
  }
  return chunks;
}

function buildPrompt(input: { referenceId: string; cleanedTranscriptArtifactId: string; cleanedTranscript: string; sourceStart: number; sourceEnd: number; totalTranscriptLength: number }): string {
  return [
    "Segment this approved cleaned transcript chunk into ordered narrative units. Do not summarize, analyze competitor strategy, alter, omit, or invent transcript text.",
    "Cover the entire supplied chunk with no gaps or overlaps: the first segment starts at 0, the last segment ends at the supplied chunk length, and every segment's startCharacter equals the previous segment's endCharacter.",
    "Each segment text must be an exact contiguous slice of the supplied chunk at [startCharacter, endCharacter). Character indexes are relative to this chunk, zero-based with endCharacter exclusive. Do not trim, normalize, or rewrite segment text.",
    "Place sponsor, self-promotion, affiliate, disclaimer, subscribe CTA, and engagement CTA text in separate segments; never mix excluded promotional text with narrative text in one segment. For example, 'Before we continue, let me introduce today\'s sponsor', 'Click the link in my bio', and 'This video is brought to you by...' must be classified as sponsor or another excluded type with includedForDna=false and the matching exclusionReason.",
    "Every segment that is not one of those excluded promotional types is narrative evidence: set includedForDna=true and omit exclusionReason.",
    "Reply with only one strict JSON object matching this shape:",
    '{"referenceId":"string","cleanedTranscriptArtifactId":"string","segments":[{"id":"string","order":0,"startCharacter":0,"endCharacter":0,"type":"hook|promise|context|story|problem|conflict|evidence|example|reveal|payoff|transition|sponsor|self_promotion|affiliate|disclaimer|subscribe_cta|engagement_cta|outro|other","text":"string","function":"string","includedForDna":true,"exclusionReason":"sponsor|self_promotion|affiliate|disclaimer|non_narrative_cta"}],"excludedSegmentIds":[]}',
    `referenceId: ${input.referenceId}`,
    `cleanedTranscriptArtifactId: ${input.cleanedTranscriptArtifactId}`,
    `chunkSourceRange: ${input.sourceStart}-${input.sourceEnd} of ${input.totalTranscriptLength}`,
    `suppliedChunkLength: ${input.cleanedTranscript.length}`,
    "Approved cleaned transcript chunk follows:",
    input.cleanedTranscript
  ].join("\n");
}
