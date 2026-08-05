import type { ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { outlineOutputSchema } from "@lsf/domain";
import { NineRouterClient, NineRouterTextResponseError } from "@lsf/providers";
import { loadNineRouterTextCertification } from "./nineRouterTextCertificationService";

export class OutlineError extends Error { constructor(readonly category: "capability_not_verified" | "credential_missing" | "provider_failed" | "invalid_json" | "invalid_output", message: string) { super(message); } }
interface TextClient { createResponseText(input: { model: string; input: string }): Promise<{ text: string; returnedModelId?: string }>; }

export async function runOutline(input: { idea: Record<string, unknown>; claims: Array<{ id: string; state: string; approvalState: string }>; profile: Record<string, unknown>; targetDuration: string; credentialStore: ProviderCredentialStore; certificationStore: TextCertificationStore; createClient?: (config: { baseUrl: string; apiKey: string }) => TextClient }) {
  const certification = await loadNineRouterTextCertification({ credentialStore: input.credentialStore, certificationStore: input.certificationStore }); if (certification.status !== "verified") throw new OutlineError("capability_not_verified", "A verified text-model certification is required before Outline can run.");
  const settings = input.credentialStore.loadProviderCredentialSettings("9router"); const apiKey = await input.credentialStore.resolveProviderSecret("9router"); if (!settings?.textModel || !apiKey) throw new OutlineError("credential_missing", "The selected text model or credential is unavailable.");
  let response: { text: string; returnedModelId?: string }; try { response = await (input.createClient?.({ baseUrl: settings.baseUrl, apiKey }) ?? new NineRouterClient({ baseUrl: settings.baseUrl, apiKey, timeoutMs: 60_000 })).createResponseText({ model: settings.textModel, input: `Create an outline only from the approved idea and allowed, supported claims. Return strict JSON {sections:[...]}. Every section must link one or more provided claim IDs. Do not create scenes, shots, or image prompts. Respect the requested duration.\n${JSON.stringify({ idea: input.idea, claims: input.claims, profile: input.profile, targetDuration: input.targetDuration })}` }); } catch (error) { throw new OutlineError("provider_failed", error instanceof NineRouterTextResponseError ? `Outline provider request failed: ${error.status}.` : "Outline provider request failed."); }
  let parsed: unknown; try { parsed = JSON.parse(response.text.trim()); } catch { throw new OutlineError("invalid_json", "Outline returned invalid JSON."); }
  const result = outlineOutputSchema.safeParse(parsed); if (!result.success) throw new OutlineError("invalid_output", "Outline returned an invalid structured output.");
  const allowedClaims = new Set(input.claims.filter((claim) => claim.approvalState === "allowed" && claim.state === "verified").map((claim) => claim.id));
  if (result.data.sections.some((section) => section.linkedClaimIds.some((id) => !allowedClaims.has(id)))) throw new OutlineError("invalid_output", "Outline linked unsupported or unknown claims.");
  const orders = result.data.sections.map((section) => section.order); if (new Set(orders).size !== orders.length || orders.some((order, index) => order !== index)) throw new OutlineError("invalid_output", "Outline sections must use consecutive order values.");
  return { output: result.data, ...(response.returnedModelId ? { returnedModelId: response.returnedModelId } : {}) };
}
