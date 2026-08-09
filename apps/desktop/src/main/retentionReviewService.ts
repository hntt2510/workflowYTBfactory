import type { ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { retentionReviewOutputSchema } from "@lsf/domain";
import { TextProviderError, type TextProvider } from "@lsf/providers";
import { adaptLegacyTextClient, type LegacyTextClient, resolveActiveTextProvider } from "./textProviderService";

export class RetentionReviewError extends Error {
  constructor(readonly category: "capability_not_verified" | "credential_missing" | "provider_failed" | "invalid_json" | "invalid_output", message: string) { super(message); }
}

type TextClient = Pick<TextProvider, "generateStructured"> | LegacyTextClient;

export async function runRetentionReview(input: { script: { sections: Array<{ id: string; purpose: string; narration: string; estimatedSeconds: number; retentionRisk: string }> }; credentialStore: ProviderCredentialStore; certificationStore: TextCertificationStore; createClient?: (config: { baseUrl: string; apiKey: string }) => TextClient }) {
  let configured: { provider: TextProvider; model: string };
  try { configured = await resolveActiveTextProvider({ credentialStore: input.credentialStore, certificationStore: input.certificationStore }); }
  catch (error) { throw new RetentionReviewError(error instanceof TextProviderError ? "capability_not_verified" : "credential_missing", "Verified Cockpit text capability is required before Retention Review can run."); }
  const prompt = `Review retention risks in this approved script. Return strict JSON {"overallVerdict":"pass"|"needs_changes"|"blocked","findings":[...]}. Every finding must use exactly {"sectionId":string,"severity":"low"|"medium"|"high","reason":string,"recommendedChange":string}; an empty findings array is allowed. Do not rewrite narration, create scenes, shots, or assets, or add facts. Every finding must reference an existing script section.\n${JSON.stringify({ script: input.script })}`;
  const injected = input.createClient?.({ baseUrl: "", apiKey: "" });
  const provider = injected ? ("generateStructured" in injected ? injected : adaptLegacyTextClient(injected)) : configured.provider;
  let result: ReturnType<typeof retentionReviewOutputSchema.parse>;
  let returnedModelId: string | undefined;
  try { const response = await provider.generateStructured({ model: configured.model, input: prompt, schema: retentionReviewOutputSchema, timeoutMs: 60_000 }); result = response.data; returnedModelId = response.returnedModelId; }
  catch (error) { if (error instanceof TextProviderError && error.code === "invalid_json") throw new RetentionReviewError("invalid_json", "Retention Review returned invalid JSON."); if (error instanceof TextProviderError && error.code === "schema_validation_failed") throw new RetentionReviewError("invalid_output", "Retention Review returned an invalid structured output."); throw new RetentionReviewError("provider_failed", "Retention Review text provider request failed."); }
  const sectionIds = new Set(input.script.sections.map((section) => section.id));
  if (result.findings.some((finding) => !sectionIds.has(finding.sectionId))) throw new RetentionReviewError("invalid_output", "Retention Review referenced a section outside the approved Script.");
  return { output: result, ...(returnedModelId ? { returnedModelId } : {}) };
}
