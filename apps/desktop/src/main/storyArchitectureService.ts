import type { ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { storyArchitectureOutputSchema } from "@lsf/domain";
import { TextProviderError, type TextProvider } from "@lsf/providers";
import { resolveActiveTextProvider } from "./textProviderService";

export class StoryArchitectureError extends Error {
  constructor(readonly category: "capability_not_verified" | "credential_missing" | "provider_failed" | "invalid_json" | "invalid_output", message: string) { super(message); }
}

export async function runStoryArchitecture(input: { idea: Record<string, unknown>; profile: Record<string, unknown>; language: string; targetDuration: string; credentialStore: ProviderCredentialStore; certificationStore: TextCertificationStore; createProvider?: () => Pick<TextProvider, "generateStructured"> }) {
  let configured: { provider: TextProvider; model: string };
  try { configured = await resolveActiveTextProvider({ credentialStore: input.credentialStore, certificationStore: input.certificationStore }); }
  catch (error) { throw new StoryArchitectureError(error instanceof TextProviderError ? "capability_not_verified" : "credential_missing", "Verified Cockpit text capability is required before Story Architecture can run."); }
  const prompt = `Design narrative strategy for one approved YouTube idea. The target language is ${input.language}; every human-readable field must use that language. Return strict JSON matching the requested story architecture: premise, viewerPromise, dramaticQuestion, audienceStartingState, audienceEndingState, narrativeStrategy, beats, openLoops, payoff, emotionalArc. Each beat needs id, order starting at 0, purpose, information, tensionRole, revealRole, viewerQuestion. Do not write narration, camera, shots, visuals, prompts, or production instructions. Respect target duration ${input.targetDuration}.\n${JSON.stringify({ idea: input.idea, profile: input.profile })}`;
  try {
    const response = await (input.createProvider?.() ?? configured.provider).generateStructured({ model: configured.model, input: prompt, schema: storyArchitectureOutputSchema, timeoutMs: 90_000 });
    return { output: response.data, ...(response.returnedModelId ? { returnedModelId: response.returnedModelId } : {}) };
  } catch (error) {
    if (error instanceof TextProviderError && error.code === "invalid_json") throw new StoryArchitectureError("invalid_json", "Story Architecture returned invalid JSON.");
    if (error instanceof TextProviderError && error.code === "schema_validation_failed") throw new StoryArchitectureError("invalid_output", "Story Architecture returned an invalid structured output.");
    throw new StoryArchitectureError("provider_failed", "Story Architecture text provider request failed.");
  }
}
