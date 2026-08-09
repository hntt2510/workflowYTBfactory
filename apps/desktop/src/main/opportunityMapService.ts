import type { ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { opportunityMapOutputSchema } from "@lsf/domain";
import { TextProviderError, type TextProvider } from "@lsf/providers";
import { adaptLegacyTextClient, type LegacyTextClient, resolveActiveTextProvider } from "./textProviderService";

export class OpportunityMapError extends Error { constructor(readonly category: "capability_not_verified" | "credential_missing" | "provider_failed" | "invalid_json" | "invalid_output", message: string) { super(message); } }
type TextClient = Pick<TextProvider, "generateStructured"> | LegacyTextClient;
export async function runOpportunityMap(input: { dnaArtifacts: Array<{ id: string; payload: Record<string, unknown> }>; credentialStore: ProviderCredentialStore; certificationStore: TextCertificationStore; createClient?: (config: { baseUrl: string; apiKey: string }) => TextClient }) {
  let configured: { provider: TextProvider; model: string };
  try { configured = await resolveActiveTextProvider({ credentialStore: input.credentialStore, certificationStore: input.certificationStore }); }
  catch (error) { throw new OpportunityMapError(error instanceof TextProviderError ? "capability_not_verified" : "credential_missing", "Verified Cockpit text capability is required before Opportunity Map can run."); }
  const prompt = `Create an evidence-backed Opportunity Map only from these approved Competitor DNA artifacts. Do not use raw transcripts, claim market size, or call one reference an industry consensus. Reply only strict JSON with these seven arrays: sharedPatterns, overusedPatterns, underservedViewerQuestions, evidenceGaps, differentiationDirections, riskyDirections, recommendedContentSpaces. Every item in every array must use exactly {"text":string,"sourceReferenceIds":string[],"sourceArtifactIds":string[],"confidence":"low"|"medium"|"high"}; do not use category-specific item keys such as pattern, gap, direction, space, risk, or question. Cite every item with supplied IDs and set confidence low when only one artifact exists.\n${JSON.stringify(input.dnaArtifacts)}`;
  let response: { data: ReturnType<typeof opportunityMapOutputSchema.parse>; returnedModelId?: string };
  try { const injected = input.createClient?.({ baseUrl: "", apiKey: "" }); const client = injected && ("generateStructured" in injected ? injected : adaptLegacyTextClient(injected)); response = client ? await client.generateStructured({ model: configured.model, input: prompt, schema: opportunityMapOutputSchema, normalize: normalizeOpportunityMapOutput }) : await configured.provider.generateStructured({ model: configured.model, input: prompt, schema: opportunityMapOutputSchema, normalize: normalizeOpportunityMapOutput }); }
  catch (error) { if (error instanceof TextProviderError && error.code === "invalid_json") throw new OpportunityMapError("invalid_json", "Opportunity Map returned invalid JSON."); if (error instanceof TextProviderError && error.code === "schema_validation_failed") throw new OpportunityMapError("invalid_output", "Opportunity Map returned an invalid structured output."); throw new OpportunityMapError("provider_failed", "Opportunity Map text provider request failed."); }
  const result = response.data;
  const artifactIds = new Set(input.dnaArtifacts.map((artifact) => artifact.id)); const referenceIds = new Set(input.dnaArtifacts.map((artifact) => String(artifact.payload.referenceId)));
  const entries = Object.values(result).flat();
  if (entries.some((entry) => entry.sourceArtifactIds.some((id) => !artifactIds.has(id)) || entry.sourceReferenceIds.some((id) => !referenceIds.has(id)))) throw new OpportunityMapError("invalid_output", "Opportunity Map cited unapproved DNA evidence.");
  if (input.dnaArtifacts.length === 1 && entries.some((entry) => entry.confidence !== "low")) throw new OpportunityMapError("invalid_output", "A single-reference Opportunity Map must mark every finding low confidence.");
  return { output: result, ...(response.returnedModelId ? { returnedModelId: response.returnedModelId } : {}) };
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
