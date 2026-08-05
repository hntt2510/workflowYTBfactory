import { referenceSegmentationOutputSchema, type ReferenceSegmentationOutput } from "./ipcSchemas";

export interface ReferenceSegmentationValidation {
  output?: ReferenceSegmentationOutput;
  errors: string[];
}

export function validateReferenceSegmentationOutput(payload: unknown, cleanedTranscript: string, referenceId: string): ReferenceSegmentationValidation {
  const parsed = referenceSegmentationOutputSchema.safeParse(payload);
  if (!parsed.success) return { errors: ["Segmentation output does not match the required schema."] };
  const errors: string[] = [];
  if (parsed.data.referenceId !== referenceId) errors.push("Segmentation output reference does not match the approved transcript.");
  let previousEnd = 0;
  const seenIds = new Set<string>();
  const expectedExcludedIds: string[] = [];
  const canonicalSegments: ReferenceSegmentationOutput["segments"] = [];
  const excludedTypes = new Map<string, "sponsor" | "self_promotion" | "affiliate" | "disclaimer" | "non_narrative_cta">([
    ["sponsor", "sponsor"],
    ["self_promotion", "self_promotion"],
    ["affiliate", "affiliate"],
    ["disclaimer", "disclaimer"],
    ["subscribe_cta", "non_narrative_cta"],
    ["engagement_cta", "non_narrative_cta"]
  ]);
  for (let index = 0; index < parsed.data.segments.length; index += 1) {
    const segment = parsed.data.segments[index]!;
    if (seenIds.has(segment.id)) errors.push(`Segment ${segment.id} is duplicated.`);
    seenIds.add(segment.id);
    if (segment.order !== index) errors.push(`Segment ${segment.id} has an unstable order.`);
    let startCharacter = segment.startCharacter;
    let endCharacter = segment.endCharacter;
    let sourceSlice = startCharacter >= 0 && endCharacter <= cleanedTranscript.length && startCharacter < endCharacter
      ? cleanedTranscript.slice(startCharacter, endCharacter)
      : undefined;
    if (sourceSlice !== segment.text) {
      const recoveredStart = cleanedTranscript.indexOf(segment.text, previousEnd);
      if (recoveredStart >= 0) {
        const leadingGap = cleanedTranscript.slice(previousEnd, recoveredStart);
        startCharacter = /^\s*$/u.test(leadingGap) ? previousEnd : recoveredStart;
        endCharacter = recoveredStart + segment.text.length;
        sourceSlice = cleanedTranscript.slice(startCharacter, endCharacter);
      }
    }
    if (startCharacter >= endCharacter || endCharacter > cleanedTranscript.length) errors.push(`Segment ${segment.id} has an invalid character range.`);
    if (startCharacter !== previousEnd) errors.push(`Segment ${segment.id} does not continue the previous segment exactly.`);
    if (sourceSlice !== undefined && sourceSlice !== segment.text && normalizeSegmentText(sourceSlice) !== normalizeSegmentText(segment.text)) {
      errors.push(`Segment ${segment.id} text does not match the cleaned transcript.`);
    }
    const canonicalText = sourceSlice ?? segment.text;
    canonicalSegments.push({ ...segment, startCharacter, endCharacter, text: canonicalText });
    const expectedReason = excludedTypes.get(segment.type);
    const detectedExclusion = detectExcludedContent(canonicalText);
    if (detectedExclusion && (segment.type !== detectedExclusion.type || segment.includedForDna || segment.exclusionReason !== detectedExclusion.reason)) {
      errors.push(`Segment ${segment.id} contains deterministic excluded content but is not classified safely.`);
    }
    if (expectedReason) {
      expectedExcludedIds.push(segment.id);
      if (segment.includedForDna || segment.exclusionReason !== expectedReason) errors.push(`Segment ${segment.id} has an invalid DNA exclusion decision.`);
    } else if (!segment.includedForDna || segment.exclusionReason !== undefined) {
      errors.push(`Segment ${segment.id} must remain included for DNA.`);
    }
    previousEnd = endCharacter;
  }
  if (previousEnd !== cleanedTranscript.length) {
    const trailingGap = cleanedTranscript.slice(previousEnd);
    if (canonicalSegments.length > 0 && /^\s*$/u.test(trailingGap)) {
      const lastIndex = canonicalSegments.length - 1;
      const last = canonicalSegments[lastIndex]!;
      canonicalSegments[lastIndex] = {
        ...last,
        endCharacter: cleanedTranscript.length,
        text: cleanedTranscript.slice(last.startCharacter, cleanedTranscript.length)
      };
      previousEnd = cleanedTranscript.length;
    }
  }
  if (previousEnd !== cleanedTranscript.length) {
    errors.push(`Segmentation does not cover the complete cleaned transcript (missing range ${previousEnd}-${cleanedTranscript.length}).`);
  }
  if (JSON.stringify(parsed.data.excludedSegmentIds) !== JSON.stringify(expectedExcludedIds)) errors.push("Excluded segment IDs do not match deterministic exclusions.");
  return errors.length ? { errors } : { output: { ...parsed.data, segments: canonicalSegments }, errors: [] };
}

function normalizeSegmentText(text: string): string {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function detectExcludedContent(text: string): { type: string; reason: "sponsor" | "self_promotion" | "affiliate" | "disclaimer" | "non_narrative_cta" } | undefined {
  const normalized = text.toLocaleLowerCase();
  if (/\b(today'?s sponsor|this video is brought to you by|let me introduce .* sponsor|sponsored by)\b/.test(normalized)) return { type: "sponsor", reason: "sponsor" };
  if (/\b(affiliate|link in my bio|click the link|use code [a-z0-9]+)\b/.test(normalized)) return { type: "affiliate", reason: "affiliate" };
  if (/\b(disclaimer|not financial advice|results may vary|you may be entitled to)\b/.test(normalized)) return { type: "disclaimer", reason: "disclaimer" };
  if (/\b(follow my other channel)\b/.test(normalized)) return { type: "self_promotion", reason: "self_promotion" };
  if (/\b(leave a comment|let me know in the comments)\b/.test(normalized)) return { type: "engagement_cta", reason: "non_narrative_cta" };
  if (/\b(subscribe|like and subscribe)\b/.test(normalized)) return { type: "subscribe_cta", reason: "non_narrative_cta" };
  return undefined;
}
