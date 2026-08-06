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
  try { response = await (input.createClient?.({ baseUrl: settings.baseUrl, apiKey }) ?? new NineRouterClient({ baseUrl: settings.baseUrl, apiKey, timeoutMs: 60_000 })).createResponseText({ model: settings.textModel, input: `Create an evidence-backed Opportunity Map only from these approved Competitor DNA artifacts. Do not use raw transcripts, claim market size, or call one reference an industry consensus. Reply only strict JSON with these seven arrays: sharedPatterns, overusedPatterns, underservedViewerQuestions, evidenceGaps, differentiationDirections, riskyDirections, recommendedContentSpaces. Every item in every array must use exactly {"text":string,"sourceReferenceIds":string[],"sourceArtifactIds":string[],"confidence":"low"|"medium"|"high"}; do not use category-specific item keys such as pattern, gap, direction, space, risk, or question. Cite every item with supplied IDs and set confidence low when only one artifact exists.\n${JSON.stringify(input.dnaArtifacts)}` }); }
  catch (error) { throw new OpportunityMapError("provider_failed", error instanceof NineRouterTextResponseError ? `Opportunity Map provider request failed: ${error.status}.` : "Opportunity Map provider request failed."); }
  let parsed: unknown; try { parsed = JSON.parse(response.text.trim()); } catch { throw new OpportunityMapError("invalid_json", "Opportunity Map returned invalid JSON."); }
  const result = opportunityMapOutputSchema.safeParse(normalizeOpportunityMapOutput(parsed)); if (!result.success) throw new OpportunityMapError("invalid_output", "Opportunity Map returned an invalid structured output.");
  const artifactIds = new Set(input.dnaArtifacts.map((artifact) => artifact.id)); const referenceIds = new Set(input.dnaArtifacts.map((artifact) => String(artifact.payload.referenceId)));
  const entries = Object.values(result.data).flat();
  if (entries.some((entry) => entry.sourceArtifactIds.some((id) => !artifactIds.has(id)) || entry.sourceReferenceIds.some((id) => !referenceIds.has(id)))) throw new OpportunityMapError("invalid_output", "Opportunity Map cited unapproved DNA evidence.");
  if (input.dnaArtifacts.length === 1 && entries.some((entry) => entry.confidence !== "low")) throw new OpportunityMapError("invalid_output", "A single-reference Opportunity Map must mark every finding low confidence.");
  return { output: result.data, ...(response.returnedModelId ? { returnedModelId: response.returnedModelId } : {}) };
}

function normalizeOpportunityMapOutput(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const categories = ["sharedPatterns", "overusedPatterns", "underservedViewerQuestions", "evidenceGaps", "differentiationDirections", "riskyDirections", "recommendedContentSpaces"] as const;
  return Object.fromEntries(categories.map((category) => [category, Array.isArray(value[category]) ? value[category].map(normalizeOpportunityItem) : value[category]]));
}

function normalizeOpportunityItem(value: unknown): unknown {
  if (!isRecord(value) || typeof value.text === "string") return value;
  const textKey = ["pattern", "gap", "direction", "space", "question", "risk", "opportunity"]
    .find((key) => typeof value[key] === "string");
  if (!textKey) return value;
  return {
    text: value[textKey],
    sourceReferenceIds: value.sourceReferenceIds,
    sourceArtifactIds: value.sourceArtifactIds,
    confidence: value.confidence
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
