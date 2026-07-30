import type { ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { claimMapOutputSchema } from "@lsf/domain";
import { NineRouterClient, NineRouterTextResponseError } from "@lsf/providers";
import { loadNineRouterTextCertification } from "./nineRouterTextCertificationService";

export class ClaimMapError extends Error { constructor(readonly category: "capability_not_verified" | "credential_missing" | "provider_failed" | "invalid_json" | "invalid_output", message: string) { super(message); } }
interface TextClient { createResponseText(input: { model: string; input: string }): Promise<{ text: string; returnedModelId?: string }>; }

export async function runClaimMap(input: { sources: Array<{ id: string; sourceType: "primary" | "secondary"; excerpt: string; title: string }>; credentialStore: ProviderCredentialStore; certificationStore: TextCertificationStore; createClient?: (config: { baseUrl: string; apiKey: string }) => TextClient }) {
  const certification = await loadNineRouterTextCertification({ credentialStore: input.credentialStore, certificationStore: input.certificationStore });
  if (certification.status !== "verified") throw new ClaimMapError("capability_not_verified", "A verified text-model certification is required before Claim Map can run.");
  const settings = input.credentialStore.loadProviderCredentialSettings("9router"); const apiKey = await input.credentialStore.resolveProviderSecret("9router");
  if (!settings?.textModel || !apiKey) throw new ClaimMapError("credential_missing", "The selected text model or credential is unavailable.");
  let response: { text: string; returnedModelId?: string };
  try { response = await (input.createClient?.({ baseUrl: settings.baseUrl, apiKey }) ?? new NineRouterClient({ baseUrl: settings.baseUrl, apiKey, timeoutMs: 60_000 })).createResponseText({ model: settings.textModel, input: `Create a Claim Map strictly from these approved source excerpts. Return only JSON {claims:[...]}. Every claim must cite sourceIds from supplied sources; do not invent facts. Allegations must be blocked and qualified, interpretations must be marked interpretive and qualified, and unsupported claims must never be allowed.\n${JSON.stringify(input.sources)}` }); }
  catch (error) { throw new ClaimMapError("provider_failed", error instanceof NineRouterTextResponseError ? `Claim Map provider request failed: ${error.status}.` : "Claim Map provider request failed."); }
  let parsed: unknown; try { parsed = JSON.parse(response.text.trim()); } catch { throw new ClaimMapError("invalid_json", "Claim Map returned invalid JSON."); }
  const result = claimMapOutputSchema.safeParse(parsed); if (!result.success) throw new ClaimMapError("invalid_output", "Claim Map returned an invalid structured output.");
  const sourceTypes = new Map(input.sources.map((source) => [source.id, source.sourceType]));
  for (const claim of result.data.claims) {
    if (claim.sourceIds.some((id) => !sourceTypes.has(id))) throw new ClaimMapError("invalid_output", "Claim Map cited an unknown source.");
    if (claim.sourceRequirement === "primary" && !claim.sourceIds.some((id) => sourceTypes.get(id) === "primary")) throw new ClaimMapError("invalid_output", "A primary-source claim lacks primary evidence.");
    if ((claim.type === "allegation" || claim.state === "unsupported") && claim.approvalState !== "blocked") throw new ClaimMapError("invalid_output", "Unsupported claims and allegations must be blocked.");
    if ((claim.type === "allegation" || claim.type === "interpretation") && !claim.qualification) throw new ClaimMapError("invalid_output", "Allegations and interpretations require qualification.");
  }
  return { output: result.data, ...(response.returnedModelId ? { returnedModelId: response.returnedModelId } : {}) };
}
