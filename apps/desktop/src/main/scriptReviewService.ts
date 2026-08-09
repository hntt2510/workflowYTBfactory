import type { ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { scriptReviewOutputSchema } from "@lsf/domain";
import { TextProviderError, type TextProvider } from "@lsf/providers";
import { resolveActiveTextProvider } from "./textProviderService";

export class ScriptReviewError extends Error {
  constructor(readonly category: "capability_not_verified" | "credential_missing" | "provider_failed" | "invalid_json" | "invalid_output", message: string) { super(message); }
}

export async function runScriptReview(input: { script: Record<string, unknown>; profile: Record<string, unknown>; language: string; credentialStore: ProviderCredentialStore; certificationStore: TextCertificationStore; createProvider?: () => Pick<TextProvider, "generateStructured"> }) {
  let configured: { provider: TextProvider; model: string };
  try { configured = await resolveActiveTextProvider({ credentialStore: input.credentialStore, certificationStore: input.certificationStore }); }
  catch (error) { throw new ScriptReviewError(error instanceof TextProviderError ? "capability_not_verified" : "credential_missing", "Verified Cockpit text capability is required before Script Review can run."); }
  const prompt = `Review this script; do not rewrite it. The target language is ${input.language}. Return strict JSON with overallStatus, summary, findings, strengths, requiredFixes, optionalImprovements. Each finding needs id, severity, optional sectionId, category, explanation, suggestedDirection. Check hook, promise, pacing, density, repetition, open loops, payoff, clarity, unsupported claims, originality, tone, and retention. Findings must reference an existing section when section-specific. Do not create Director, visual, shots, prompts, or assets.\n${JSON.stringify({ script: input.script, profile: input.profile })}`;
  try {
    const response = await (input.createProvider?.() ?? configured.provider).generateStructured({ model: configured.model, input: prompt, schema: scriptReviewOutputSchema, timeoutMs: 90_000 });
    return { output: response.data, ...(response.returnedModelId ? { returnedModelId: response.returnedModelId } : {}) };
  } catch (error) {
    if (error instanceof TextProviderError && error.code === "invalid_json") throw new ScriptReviewError("invalid_json", "Script Review returned invalid JSON.");
    if (error instanceof TextProviderError && error.code === "schema_validation_failed") throw new ScriptReviewError("invalid_output", "Script Review returned an invalid structured output.");
    throw new ScriptReviewError("provider_failed", "Script Review text provider request failed.");
  }
}
