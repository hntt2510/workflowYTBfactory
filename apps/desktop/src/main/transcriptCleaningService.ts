import type { ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { cleanedTranscriptOutputSchema, type CleanedTranscriptOutput } from "@lsf/domain";
import { NineRouterClient, NineRouterTextResponseError } from "@lsf/providers";
import { loadNineRouterTextCertification } from "./nineRouterTextCertificationService";

const providerId = "9router";

export class TranscriptCleaningError extends Error {
  constructor(readonly category: "capability_not_verified" | "credential_missing" | "provider_failed" | "invalid_json" | "invalid_output", message: string) {
    super(message);
  }
}

export interface TranscriptCleaningResult {
  output: CleanedTranscriptOutput;
  returnedModelId?: string;
  warnings: Array<"excessive_content_loss" | "content_expansion">;
}

interface TextClient {
  createResponseText(input: { model: string; input: string }): Promise<{ text: string; returnedModelId?: string }>;
}

export async function runTranscriptCleaning(input: {
  referenceId: string;
  sourceTranscriptVersionId: string;
  transcript: string;
  credentialStore: ProviderCredentialStore;
  certificationStore: TextCertificationStore;
  createClient?: (config: { baseUrl: string; apiKey: string }) => TextClient;
}): Promise<TranscriptCleaningResult> {
  const certification = await loadNineRouterTextCertification({
    credentialStore: input.credentialStore,
    certificationStore: input.certificationStore
  });
  if (certification.status !== "verified") {
    throw new TranscriptCleaningError("capability_not_verified", "A verified text-model certification is required before Transcript Cleaning can run.");
  }
  const settings = input.credentialStore.loadProviderCredentialSettings(providerId);
  const apiKey = await input.credentialStore.resolveProviderSecret(providerId);
  if (!settings?.textModel || !apiKey) {
    throw new TranscriptCleaningError("credential_missing", "The selected text model or credential is unavailable.");
  }

  let response: { text: string; returnedModelId?: string };
  try {
    const client = input.createClient?.({ baseUrl: settings.baseUrl, apiKey }) ?? new NineRouterClient({ baseUrl: settings.baseUrl, apiKey, timeoutMs: 60_000 });
    response = await client.createResponseText({ model: settings.textModel, input: buildPrompt(input) });
  } catch (error) {
    if (error instanceof NineRouterTextResponseError) {
      throw new TranscriptCleaningError("provider_failed", `Transcript Cleaning provider request failed: ${error.status}.`);
    }
    throw new TranscriptCleaningError("provider_failed", "Transcript Cleaning provider request failed.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text.trim());
  } catch {
    throw new TranscriptCleaningError("invalid_json", "Transcript Cleaning returned invalid JSON.");
  }
  const result = cleanedTranscriptOutputSchema.safeParse(parsed);
  if (!result.success) throw new TranscriptCleaningError("invalid_output", "Transcript Cleaning returned an invalid structured output.");
  const output = result.data;
  if (output.referenceId !== input.referenceId || output.sourceTranscriptVersionId !== input.sourceTranscriptVersionId) {
    throw new TranscriptCleaningError("invalid_output", "Transcript Cleaning output does not match the requested reference version.");
  }
  if (output.sourceCharacterCount !== input.transcript.length || output.cleanedCharacterCount !== output.cleanedTranscript.length) {
    throw new TranscriptCleaningError("invalid_output", "Transcript Cleaning character counts do not match the supplied content.");
  }
  const warnings: TranscriptCleaningResult["warnings"] = [];
  if (output.cleanedCharacterCount < output.sourceCharacterCount * 0.5) warnings.push("excessive_content_loss");
  if (output.cleanedCharacterCount > output.sourceCharacterCount * 1.2) warnings.push("content_expansion");
  return { output, ...(response.returnedModelId ? { returnedModelId: response.returnedModelId } : {}), warnings };
}

function buildPrompt(input: { referenceId: string; sourceTranscriptVersionId: string; transcript: string }): string {
  return [
    "Clean this transcript without summarizing, rewriting its story, adding facts, translating, or removing claims.",
    "Normalize whitespace, remove only timestamps, duplicate caption fragments, formatting noise, and empty fragments.",
    "Preserve quotations and uncertain wording. Flag unclear or possibly erroneous fragments instead of changing them.",
    "Reply with only one strict JSON object matching this exact shape:",
    '{"referenceId":"string","sourceTranscriptVersionId":"string","cleanedTranscript":"string","removedSegments":[{"text":"string","reason":"timestamp|duplicate_caption|formatting_noise|empty_fragment"}],"flaggedSegments":[{"text":"string","reason":"unclear_audio|possible_transcription_error|language_mismatch"}],"sourceCharacterCount":0,"cleanedCharacterCount":0}',
    `referenceId: ${input.referenceId}`,
    `sourceTranscriptVersionId: ${input.sourceTranscriptVersionId}`,
    "Transcript follows:",
    input.transcript
  ].join("\n");
}
