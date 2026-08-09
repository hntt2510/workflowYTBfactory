import type { ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { scriptOutputSchema } from "@lsf/domain";
import { TextProviderError, type TextProvider } from "@lsf/providers";
import { adaptLegacyTextClient, type LegacyTextClient, resolveActiveTextProvider } from "./textProviderService";

const scriptProviderTimeoutMs = 180_000;
export class ScriptError extends Error { constructor(readonly category: "capability_not_verified" | "credential_missing" | "provider_failed" | "invalid_json" | "invalid_output", message: string) { super(message); } }
type TextClient = Pick<TextProvider, "generateStructured"> | LegacyTextClient;

export async function runScript(input: { outline: { sections: Array<{ id: string; linkedClaimIds: string[] }> }; storyArchitecture?: Record<string, unknown>; profile?: Record<string, unknown>; claims: Array<{ id: string; state: string; approvalState: string }>; language: string; credentialStore: ProviderCredentialStore; certificationStore: TextCertificationStore; createClient?: (config: { baseUrl: string; apiKey: string }) => TextClient }) {
  let configured: { provider: TextProvider; model: string };
  try { configured = await resolveActiveTextProvider({ credentialStore: input.credentialStore, certificationStore: input.certificationStore }); } catch (error) { throw new ScriptError(error instanceof TextProviderError ? "capability_not_verified" : "credential_missing", "Verified Cockpit text capability is required before Script can run."); }
  const prompt = `Write a section-level script that executes the approved Story Architecture and Outline without changing their strategy. The target language is ${input.language}. This is a hard requirement: write every human-readable field, especially narration, in ${input.language}; do not write the script in English unless English is the target language. Return strict JSON {"sections":[...]}. Each section must use exactly {"id":string,"outlineSectionId":string,"purpose":string,"narration":string,"estimatedWords":positive integer,"estimatedSeconds":positive integer,"linkedClaimIds":string[],"dramaticFunction":string,"openLoop"?:string,"visualOpportunities":string[],"proofObjects":string[],"retentionRisk":"low"|"medium"|"high"}. Every section must map to an outlineSectionId. linkedClaimIds may be empty because this workflow does not use web research or Claim Map. Do not use compact keys such as script, content, or text. Do not create scenes, shots, or assets.\n${JSON.stringify({ outline: input.outline, storyArchitecture: input.storyArchitecture, channelProfile: focusedProfile(input.profile), targetLanguage: input.language })}`;
  const injected = input.createClient?.({ baseUrl: "", apiKey: "" }); const provider = injected ? ("generateStructured" in injected ? injected : adaptLegacyTextClient(injected)) : configured.provider;
  let response: { data: ReturnType<typeof scriptOutputSchema.parse>; returnedModelId?: string };
  try { response = await provider.generateStructured({ model: configured.model, input: prompt, schema: scriptOutputSchema, timeoutMs: scriptProviderTimeoutMs }); } catch (error) { if (error instanceof TextProviderError && error.code === "invalid_json") throw new ScriptError("invalid_json", "Script returned invalid JSON."); if (error instanceof TextProviderError && error.code === "schema_validation_failed") throw new ScriptError("invalid_output", "Script returned an invalid structured output."); throw new ScriptError("provider_failed", "Script text provider request failed."); }
  const outlineClaims = new Map(input.outline.sections.map((section) => [section.id, new Set(section.linkedClaimIds)])); const allowed = new Set(input.claims.filter((claim) => claim.state === "verified" && claim.approvalState === "allowed").map((claim) => claim.id));
  if (response.data.sections.some((section) => !outlineClaims.has(section.outlineSectionId) || section.linkedClaimIds.some((id) => !allowed.has(id) || !outlineClaims.get(section.outlineSectionId)?.has(id)))) throw new ScriptError("invalid_output", "Script introduced unsupported claims or outline links.");
  return { output: response.data, ...(response.returnedModelId ? { returnedModelId: response.returnedModelId } : {}) };
}

function focusedProfile(profile: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!profile) return undefined;
  const fields = ["targetAudience", "mainKeyword", "niche", "tone", "language", "positioning", "avoidList", "safetyRules"];
  return Object.fromEntries(fields.flatMap((field) => profile[field] === undefined ? [] : [[field, profile[field]]]));
}
