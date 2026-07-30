import type { ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { opportunityMapOutputSchema } from "@lsf/domain";
import { NineRouterClient, NineRouterTextResponseError } from "@lsf/providers";
import { loadNineRouterTextCertification } from "./nineRouterTextCertificationService";

export class OpportunityMapError extends Error { constructor(readonly category: "capability_not_verified" | "credential_missing" | "provider_failed" | "invalid_json" | "invalid_output", message: string) { super(message); } }
interface TextClient { createResponseText(input: { model: string; input: string }): Promise<{ text: string; returnedModelId?: string }>; }
export async function runOpportunityMap(input: { dnaArtifacts: Array<{ id: string; payload: Record<string, unknown> }>; credentialStore: ProviderCredentialStore; certificationStore: TextCertificationStore; createClient?: (config: { baseUrl: string; apiKey: string }) => TextClient }) {
  const certification = await loadNineRouterTextCertification({ credentialStore: input.credentialStore, certificationStore: input.certificationStore });
  if (certification.status !== "verified") throw new OpportunityMapError("capability_not_verified", "A verified text-model certification is required before Opportunity Map can run.");
  const settings = input.credentialStore.loadProviderCredentialSettings("9router"); const apiKey = await input.credentialStore.resolveProviderSecret("9router");
  if (!settings?.textModel || !apiKey) throw new OpportunityMapError("credential_missing", "The selected text model or credential is unavailable.");
  let response: { text: string; returnedModelId?: string };
  try { response = await (input.createClient?.({ baseUrl: settings.baseUrl, apiKey }) ?? new NineRouterClient({ baseUrl: settings.baseUrl, apiKey, timeoutMs: 60_000 })).createResponseText({ model: settings.textModel, input: `Create an evidence-backed Opportunity Map only from these approved Competitor DNA artifacts. Do not use raw transcripts, claim market size, or call one reference an industry consensus. Cite every item with sourceReferenceIds and sourceArtifactIds; set confidence low when only one artifact exists. Reply only strict JSON with sharedPatterns, overusedPatterns, underservedViewerQuestions, evidenceGaps, differentiationDirections, riskyDirections, recommendedContentSpaces.\n${JSON.stringify(input.dnaArtifacts)}` }); }
  catch (error) { throw new OpportunityMapError("provider_failed", error instanceof NineRouterTextResponseError ? `Opportunity Map provider request failed: ${error.status}.` : "Opportunity Map provider request failed."); }
  let parsed: unknown; try { parsed = JSON.parse(response.text.trim()); } catch { throw new OpportunityMapError("invalid_json", "Opportunity Map returned invalid JSON."); }
  const result = opportunityMapOutputSchema.safeParse(parsed); if (!result.success) throw new OpportunityMapError("invalid_output", "Opportunity Map returned an invalid structured output.");
  const artifactIds = new Set(input.dnaArtifacts.map((artifact) => artifact.id)); const referenceIds = new Set(input.dnaArtifacts.map((artifact) => String(artifact.payload.referenceId)));
  const entries = Object.values(result.data).flat();
  if (entries.some((entry) => entry.sourceArtifactIds.some((id) => !artifactIds.has(id)) || entry.sourceReferenceIds.some((id) => !referenceIds.has(id)))) throw new OpportunityMapError("invalid_output", "Opportunity Map cited unapproved DNA evidence.");
  if (input.dnaArtifacts.length === 1 && entries.some((entry) => entry.confidence !== "low")) throw new OpportunityMapError("invalid_output", "A single-reference Opportunity Map must mark every finding low confidence.");
  return { output: result.data, ...(response.returnedModelId ? { returnedModelId: response.returnedModelId } : {}) };
}
