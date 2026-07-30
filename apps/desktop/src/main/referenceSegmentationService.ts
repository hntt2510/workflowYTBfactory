import type { ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { validateReferenceSegmentationOutput, type ReferenceSegmentationOutput } from "@lsf/domain";
import { NineRouterClient, NineRouterTextResponseError } from "@lsf/providers";
import { loadNineRouterTextCertification } from "./nineRouterTextCertificationService";

const providerId = "9router";

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
  cleanedTranscript: string;
  credentialStore: ProviderCredentialStore;
  certificationStore: TextCertificationStore;
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

  let response: { text: string; returnedModelId?: string };
  try {
    const client = input.createClient?.({ baseUrl: settings.baseUrl, apiKey }) ?? new NineRouterClient({ baseUrl: settings.baseUrl, apiKey, timeoutMs: 60_000 });
    response = await client.createResponseText({ model: settings.textModel, input: buildPrompt(input) });
  } catch (error) {
    if (error instanceof NineRouterTextResponseError) {
      throw new ReferenceSegmentationError("provider_failed", `Reference Segmentation provider request failed: ${error.status}.`);
    }
    throw new ReferenceSegmentationError("provider_failed", "Reference Segmentation provider request failed.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text.trim());
  } catch {
    throw new ReferenceSegmentationError("invalid_json", "Reference Segmentation returned invalid JSON.");
  }
  const validation = validateReferenceSegmentationOutput(parsed, input.cleanedTranscript, input.referenceId);
  if (!validation.output) throw new ReferenceSegmentationError("invalid_output", validation.errors[0] ?? "Reference Segmentation returned invalid structured output.");
  return { output: validation.output, ...(response.returnedModelId ? { returnedModelId: response.returnedModelId } : {}) };
}

function buildPrompt(input: { referenceId: string; cleanedTranscript: string }): string {
  return [
    "Segment this approved cleaned transcript into ordered narrative units. Do not summarize, analyze competitor strategy, alter, omit, or invent transcript text.",
    "Each segment text must be an exact contiguous slice of the transcript. Character indexes are zero-based with endCharacter exclusive. Segments must be ordered and non-overlapping.",
    "Reply with only one strict JSON object matching this shape:",
    '{"referenceId":"string","segments":[{"id":"string","order":0,"startCharacter":0,"endCharacter":0,"type":"hook|promise|context|problem|conflict|evidence|example|reveal|payoff|cta|other","text":"string","function":"string"}]}',
    `referenceId: ${input.referenceId}`,
    "Approved cleaned transcript follows:",
    input.cleanedTranscript
  ].join("\n");
}
