import type { ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { retentionReviewOutputSchema } from "@lsf/domain";
import { NineRouterClient, NineRouterTextResponseError } from "@lsf/providers";
import { loadNineRouterTextCertification } from "./nineRouterTextCertificationService";

export class RetentionReviewError extends Error {
  constructor(readonly category: "capability_not_verified" | "credential_missing" | "provider_failed" | "invalid_json" | "invalid_output", message: string) { super(message); }
}

interface TextClient { createResponseText(input: { model: string; input: string }): Promise<{ text: string; returnedModelId?: string }>; }

export async function runRetentionReview(input: { script: { sections: Array<{ id: string; purpose: string; narration: string; estimatedSeconds: number; retentionRisk: string }> }; credentialStore: ProviderCredentialStore; certificationStore: TextCertificationStore; createClient?: (config: { baseUrl: string; apiKey: string }) => TextClient }) {
  const certification = await loadNineRouterTextCertification({ credentialStore: input.credentialStore, certificationStore: input.certificationStore });
  if (certification.status !== "verified") throw new RetentionReviewError("capability_not_verified", "A verified text-model certification is required before Retention Review can run.");
  const settings = input.credentialStore.loadProviderCredentialSettings("9router"); const apiKey = await input.credentialStore.resolveProviderSecret("9router");
  if (!settings?.textModel || !apiKey) throw new RetentionReviewError("credential_missing", "The selected text model or credential is unavailable.");
  let response: { text: string; returnedModelId?: string };
  try { response = await (input.createClient?.({ baseUrl: settings.baseUrl, apiKey }) ?? new NineRouterClient({ baseUrl: settings.baseUrl, apiKey, timeoutMs: 60_000 })).createResponseText({ model: settings.textModel, input: `Review retention risks in this approved script. Return strict JSON {overallVerdict, findings:[{sectionId,severity,reason,recommendedChange}]}. Do not rewrite narration, create scenes, or add facts. Every finding must reference an existing script section.\n${JSON.stringify({ script: input.script })}` }); }
  catch (error) { throw new RetentionReviewError("provider_failed", error instanceof NineRouterTextResponseError ? `Retention Review provider request failed: ${error.status}.` : "Retention Review provider request failed."); }
  let parsed: unknown; try { parsed = JSON.parse(response.text.trim()); } catch { throw new RetentionReviewError("invalid_json", "Retention Review returned invalid JSON."); }
  const result = retentionReviewOutputSchema.safeParse(parsed); if (!result.success) throw new RetentionReviewError("invalid_output", "Retention Review returned an invalid structured output.");
  const sectionIds = new Set(input.script.sections.map((section) => section.id));
  if (result.data.findings.some((finding) => !sectionIds.has(finding.sectionId))) throw new RetentionReviewError("invalid_output", "Retention Review referenced a section outside the approved Script.");
  return { output: result.data, ...(response.returnedModelId ? { returnedModelId: response.returnedModelId } : {}) };
}
