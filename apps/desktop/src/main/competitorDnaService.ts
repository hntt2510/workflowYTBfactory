import type { ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { competitorDnaOutputSchema, type CompetitorDnaOutput, type ReferenceSegmentationOutput } from "@lsf/domain";
import { TextProviderError, type TextProvider } from "@lsf/providers";
import { resolveActiveTextProvider } from "./textProviderService";

export const competitorDnaTimeoutMs = 300_000;
export const competitorDnaRunnerVersion = "competitor-dna-v6";

export class CompetitorDnaError extends Error {
  constructor(readonly category: "capability_not_verified" | "credential_missing" | "provider_failed" | "invalid_json" | "invalid_output", message: string) { super(message); }
}

type TextClient = Pick<TextProvider, "generateStructured">;

interface CompetitorDnaChannelProfile {
  id: string;
  name: string;
  niche: string;
  tone: string;
  avoidList: string[];
  safetyRules: string[];
}

export async function runCompetitorDna(input: { referenceId: string; segmentationArtifactId: string; cleanedTranscript: string; segments: ReferenceSegmentationOutput["segments"]; channelProfile?: CompetitorDnaChannelProfile; originalityRules?: string[]; credentialStore: ProviderCredentialStore; certificationStore: TextCertificationStore; createClient?: (config: { baseUrl: string; apiKey: string }) => TextClient }): Promise<{ output: CompetitorDnaOutput; returnedModelId?: string }> {
  let configured: { provider: TextProvider; model: string };
  try { configured = await resolveActiveTextProvider({ credentialStore: input.credentialStore, certificationStore: input.certificationStore }); }
  catch (error) { throw new CompetitorDnaError(error instanceof TextProviderError ? "capability_not_verified" : "credential_missing", "Verified Cockpit text capability is required before Competitor DNA can run."); }
  let response: { data: CompetitorDnaOutput; returnedModelId?: string };
  try { const client = input.createClient?.({ baseUrl: "", apiKey: "" }); response = client ? await client.generateStructured({ model: configured.model, input: prompt(input), timeoutMs: competitorDnaTimeoutMs, schema: competitorDnaOutputSchema, normalize: normalizeCompetitorDnaOutput }) : await configured.provider.generateStructured({ model: configured.model, input: prompt(input), timeoutMs: competitorDnaTimeoutMs, schema: competitorDnaOutputSchema, normalize: normalizeCompetitorDnaOutput }); }
  catch (error) { if (error instanceof TextProviderError && error.code === "invalid_json") throw new CompetitorDnaError("invalid_json", "Competitor DNA returned invalid JSON."); if (error instanceof TextProviderError && error.code === "schema_validation_failed") throw new CompetitorDnaError("invalid_output", "Competitor DNA returned an invalid structured output."); throw new CompetitorDnaError("provider_failed", "Competitor DNA text provider request failed."); }
  const result = response.data;
  if (result.referenceId !== input.referenceId || result.segmentationArtifactId !== input.segmentationArtifactId) throw new CompetitorDnaError("invalid_output", "Competitor DNA returned output for a different reference or segmentation artifact.");
  const includedSegments = input.segments.filter((segment) => segment.includedForDna);
  const includedIds = new Set(includedSegments.map((segment) => segment.id));
  const excludedSegments = input.segments.filter((segment) => !segment.includedForDna);
  const evidence = [result.hookPattern, result.promisePattern, ...result.narrativeStructure, result.pacingPattern, result.conflictAndRevealPattern, result.proofPattern, ...result.emotionalArc, ...result.retentionDevices, ...result.transitionPatterns, ...result.reusablePrinciples, ...result.forbiddenToCopy];
  if (evidence.some((item) => item.evidenceSegmentIds.some((id) => !includedIds.has(id)))) throw new CompetitorDnaError("invalid_output", "Competitor DNA cited a segment that is not included for DNA evidence.");
  const expectedSponsorCount = excludedSegments.filter((segment) => segment.type === "sponsor").length;
  const expectedSelfPromotionCount = excludedSegments.filter((segment) => segment.type === "self_promotion").length;
  const expectedExcludedIds = excludedSegments.map((segment) => segment.id);
  if (result.excludedContentSummary.sponsorSegmentCount !== expectedSponsorCount
    || result.excludedContentSummary.selfPromotionSegmentCount !== expectedSelfPromotionCount
    || JSON.stringify(result.excludedContentSummary.excludedSegmentIds) !== JSON.stringify(expectedExcludedIds)) {
  const actual = result.excludedContentSummary;
    throw new CompetitorDnaError("invalid_output", `Competitor DNA excluded-content summary does not match segmentation (expected sponsor=${expectedSponsorCount}, selfPromotion=${expectedSelfPromotionCount}, excluded=${expectedExcludedIds.length}; received sponsor=${actual.sponsorSegmentCount}, selfPromotion=${actual.selfPromotionSegmentCount}, excluded=${actual.excludedSegmentIds.length}).`);
  }
  const source = input.cleanedTranscript.toLowerCase();
  const phrases = evidence.flatMap((item) => ["abstraction" in item ? item.abstraction : "description" in item ? item.description : "function" in item ? item.function : "principle" in item ? item.principle : "element" in item ? item.element : ""]);
  if (phrases.some((phrase) => phrase.length >= 40 && source.includes(phrase.toLowerCase()))) throw new CompetitorDnaError("invalid_output", "Competitor DNA copied a long phrase instead of describing an abstraction.");
  return { output: result, ...(response.returnedModelId ? { returnedModelId: response.returnedModelId } : {}) };
}

function prompt(input: { referenceId: string; segmentationArtifactId: string; cleanedTranscript: string; segments: ReferenceSegmentationOutput["segments"]; channelProfile?: CompetitorDnaChannelProfile; originalityRules?: string[] }): string {
  const includedSegments = input.segments.filter((segment) => segment.includedForDna);
  const excludedSegments = input.segments.filter((segment) => !segment.includedForDna);
  const schema = {
    referenceId: input.referenceId,
    segmentationArtifactId: input.segmentationArtifactId,
    hookPattern: { abstraction: "string", evidenceSegmentIds: ["included-segment-id"] },
    promisePattern: { abstraction: "string", evidenceSegmentIds: ["included-segment-id"] },
    narrativeStructure: [{ phase: "string", function: "string", evidenceSegmentIds: ["included-segment-id"] }],
    pacingPattern: { description: "string", evidenceSegmentIds: ["included-segment-id"] },
    conflictAndRevealPattern: { description: "string", evidenceSegmentIds: ["included-segment-id"] },
    proofPattern: { description: "string", evidenceSegmentIds: ["included-segment-id"] },
    emotionalArc: [{ phase: "string", emotion: "string", evidenceSegmentIds: ["included-segment-id"] }],
    retentionDevices: [{ abstraction: "string", evidenceSegmentIds: ["included-segment-id"] }],
    transitionPatterns: [{ abstraction: "string", evidenceSegmentIds: ["included-segment-id"] }],
    reusablePrinciples: [{ principle: "string", evidenceSegmentIds: ["included-segment-id"] }],
    forbiddenToCopy: [{ element: "string", reason: "string", evidenceSegmentIds: ["included-segment-id"] }],
    excludedContentSummary: { sponsorSegmentCount: 0, selfPromotionSegmentCount: 0, excludedSegmentIds: input.segments.filter((segment) => !segment.includedForDna).map((segment) => segment.id) },
    uncertainties: ["string uncertainty"]
  };
  return [
    "Analyze this single approved reference for structural abstractions only. Do not copy wording, titles, thumbnails, or generate ideas.",
    "Only the supplied segments marked for DNA are evidence. Do not infer from excluded sponsor, self-promotion, affiliate, disclaimer, or CTA material.",
    "Every non-empty finding must cite one or more supplied segment IDs. Evidence IDs must be copied exactly from the supplied segments and must never be invented.",
    "Describe patterns at an abstract level. Never quote or reproduce a distinctive source phrase. Put sponsor and other excluded material only in excludedContentSummary.",
    "Use the exact field names in the schema template. In emotionalArc the field is emotion, not intensity; do not add alternate field names.",
    "uncertainties must be an array of concise JSON strings, never objects; use [] when there are no uncertainties.",
    "Return exactly one top-level JSON object. Do not wrap it in dna, data, result, output, markdown, or code fences. Use exactly the required keys shown in this schema template.",
    `Schema template: ${JSON.stringify(schema)}`,
    `referenceId: ${input.referenceId}`,
    `segmentationArtifactId: ${input.segmentationArtifactId}`,
    `currentChannelProfile: ${JSON.stringify(input.channelProfile ?? {})}`,
    `originalityRules: ${JSON.stringify(input.originalityRules ?? [])}`,
    `includedSegments: ${JSON.stringify(includedSegments)}`,
    `excludedSegmentMetadata (IDs and types only; do not infer or quote their text): ${JSON.stringify(excludedSegments.map((segment) => ({ id: segment.id, type: segment.type, exclusionReason: segment.exclusionReason })))}`,
    `excludedContentSummary must use sponsorSegmentCount=${excludedSegments.filter((segment) => segment.type === "sponsor").length}, selfPromotionSegmentCount=${excludedSegments.filter((segment) => segment.type === "self_promotion").length}, excludedSegmentIds=${JSON.stringify(excludedSegments.map((segment) => segment.id))}.`
  ].join("\n");
}

function normalizeCompetitorDnaOutput(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.uncertainties)) return value;
  return {
    ...value,
    uncertainties: value.uncertainties.map((item) => {
      if (typeof item === "string") return item;
      if (!isRecord(item)) return item;
      if (typeof item.text === "string") return item.text;
      if (typeof item.description === "string") return item.description;
      if (typeof item.uncertainty === "string") return item.uncertainty;
      if (typeof item.term === "string" && typeof item.reason === "string") return `${item.term}: ${item.reason}`;
      return item;
    })
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
