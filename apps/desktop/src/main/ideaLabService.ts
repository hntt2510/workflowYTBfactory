import type { ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { ideaLabOutputSchema } from "@lsf/domain";
import { TextProviderError, type TextProvider } from "@lsf/providers";
import { resolveActiveTextProvider } from "./textProviderService";

export class IdeaLabError extends Error { constructor(readonly category: "capability_not_verified" | "credential_missing" | "provider_failed" | "invalid_json" | "invalid_output", message: string) { super(message); } }

export async function runIdeaLab(input: { opportunityMap: Record<string, unknown>; topic: string; profile: Record<string, unknown>; format: string; language: string; targetDuration: string; credentialStore: ProviderCredentialStore; certificationStore: TextCertificationStore; createProvider?: () => TextProvider }) {
  let configured: { provider: TextProvider; model: string };
  try { configured = await resolveActiveTextProvider({ credentialStore: input.credentialStore, certificationStore: input.certificationStore }); }
  catch (error) { throw new IdeaLabError(error instanceof TextProviderError ? "capability_not_verified" : "credential_missing", "Verified Cockpit text capability is required before Idea Lab can run."); }
  let response: { data: ReturnType<typeof ideaLabOutputSchema.parse>; returnedModelId?: string };
  try {
    response = await (input.createProvider?.() ?? configured.provider).generateStructured({ model: configured.model, schema: ideaLabOutputSchema, input: `Generate exactly 6 original YouTube idea candidates from this approved Opportunity Map and active channel context: exactly 2 researchRisk low, 2 medium, and 2 high. Do not copy competitor wording or thumbnails, promise guarantees, defame, or auto-select an idea. Return only strict JSON {"candidates":[...]}. Each candidate must use exactly these fields: id, workingTitle, angle, corePromise, viewerProblem, dramaticQuestion, targetEmotion, trafficModel (browse|suggested|search|mixed), thumbnailConcept, noveltyExplanation, noveltyScore (0-100), audienceFitScore (0-100), thumbnailPotentialScore (0-100), productionFeasibilityScore (0-100), scoreExplanations {novelty,audienceFit,thumbnailPotential,productionFeasibility}, researchRisk (low|medium|high), productionDifficulty (low|medium|high), repurposePotential (string[]), whyThisCanWin. Scores are decision-support heuristics, so every score explanation must state its rationale. Use unique stable IDs and do not replace these keys with title, concept, hook, or format.\n${JSON.stringify({ opportunityMap: input.opportunityMap, topic: input.topic, profile: focusedProfile(input.profile), format: input.format, language: input.language, targetDuration: input.targetDuration })}` });
  } catch (error) { if (error instanceof TextProviderError && error.code === "invalid_json") throw new IdeaLabError("invalid_json", "Idea Lab returned invalid JSON."); if (error instanceof TextProviderError && error.code === "schema_validation_failed") throw new IdeaLabError("invalid_output", "Idea Lab returned an invalid candidate set."); throw new IdeaLabError("provider_failed", "Idea Lab text provider request failed."); }
  if (new Set(response.data.candidates.map((candidate) => candidate.id)).size !== response.data.candidates.length) throw new IdeaLabError("invalid_output", "Idea Lab returned duplicate candidate IDs.");
  return { output: response.data, ...(response.returnedModelId ? { returnedModelId: response.returnedModelId } : {}) };
}

function focusedProfile(profile: Record<string, unknown>): Record<string, unknown> { const fields = ["targetAudience", "mainKeyword", "niche", "tone", "language", "positioning", "avoidList", "safetyRules"]; return Object.fromEntries(fields.flatMap((field) => profile[field] === undefined ? [] : [[field, profile[field]]])); }
