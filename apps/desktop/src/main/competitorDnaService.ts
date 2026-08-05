import type { ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { competitorDnaOutputSchema, type CompetitorDnaOutput, type ReferenceSegmentationOutput } from "@lsf/domain";
import { NineRouterClient, NineRouterTextResponseError } from "@lsf/providers";
import { loadNineRouterTextCertification } from "./nineRouterTextCertificationService";

export class CompetitorDnaError extends Error {
  constructor(readonly category: "capability_not_verified" | "credential_missing" | "provider_failed" | "invalid_json" | "invalid_output", message: string) { super(message); }
}

interface TextClient { createResponseText(input: { model: string; input: string }): Promise<{ text: string; returnedModelId?: string }>; }

export async function runCompetitorDna(input: { referenceId: string; cleanedTranscript: string; segments: ReferenceSegmentationOutput["segments"]; credentialStore: ProviderCredentialStore; certificationStore: TextCertificationStore; createClient?: (config: { baseUrl: string; apiKey: string }) => TextClient }): Promise<{ output: CompetitorDnaOutput; returnedModelId?: string }> {
  const certification = await loadNineRouterTextCertification({ credentialStore: input.credentialStore, certificationStore: input.certificationStore });
  if (certification.status !== "verified") throw new CompetitorDnaError("capability_not_verified", "A verified text-model certification is required before Competitor DNA can run.");
  const settings = input.credentialStore.loadProviderCredentialSettings("9router");
  const apiKey = await input.credentialStore.resolveProviderSecret("9router");
  if (!settings?.textModel || !apiKey) throw new CompetitorDnaError("credential_missing", "The selected text model or credential is unavailable.");
  let response: { text: string; returnedModelId?: string };
  try { response = await (input.createClient?.({ baseUrl: settings.baseUrl, apiKey }) ?? new NineRouterClient({ baseUrl: settings.baseUrl, apiKey, timeoutMs: 60_000 })).createResponseText({ model: settings.textModel, input: prompt(input) }); }
  catch (error) { throw new CompetitorDnaError("provider_failed", error instanceof NineRouterTextResponseError ? `Competitor DNA provider request failed: ${error.status}.` : "Competitor DNA provider request failed."); }
  let parsed: unknown; try { parsed = JSON.parse(response.text.trim()); } catch { throw new CompetitorDnaError("invalid_json", "Competitor DNA returned invalid JSON."); }
  const result = competitorDnaOutputSchema.safeParse(parsed);
  if (!result.success || result.data.referenceId !== input.referenceId) throw new CompetitorDnaError("invalid_output", "Competitor DNA returned an invalid structured output.");
  const ids = new Set(input.segments.map((segment) => segment.id));
  const evidence = [result.data.hookPattern, result.data.promisePattern, result.data.pacingPattern, result.data.proofPattern, ...result.data.emotionalArc, ...result.data.retentionDevices, ...result.data.visualOpportunities];
  if (evidence.some((item) => item.evidenceSegmentIds.some((id) => !ids.has(id)))) throw new CompetitorDnaError("invalid_output", "Competitor DNA cited a segment that is not approved evidence.");
  const source = input.cleanedTranscript.toLowerCase();
  const phrases = evidence.flatMap((item) => ["abstraction" in item ? item.abstraction : "description" in item ? item.description : ""]);
  if (phrases.some((phrase) => phrase.length >= 40 && source.includes(phrase.toLowerCase()))) throw new CompetitorDnaError("invalid_output", "Competitor DNA copied a long phrase instead of describing an abstraction.");
  return { output: result.data, ...(response.returnedModelId ? { returnedModelId: response.returnedModelId } : {}) };
}

function prompt(input: { referenceId: string; cleanedTranscript: string; segments: ReferenceSegmentationOutput["segments"] }): string {
  return ["Analyze this single approved reference for reusable abstractions only. Do not copy wording, titles, thumbnails, or generate ideas. Every important finding must cite supplied segment IDs.", "Reply only strict JSON: {referenceId,hookPattern,promisePattern,pacingPattern,proofPattern,emotionalArc,retentionDevices,visualOpportunities,reusablePrinciples,forbiddenToCopy,uncertainties}.", `referenceId: ${input.referenceId}`, `segments: ${JSON.stringify(input.segments)}`, `cleaned transcript: ${input.cleanedTranscript}`].join("\n");
}
