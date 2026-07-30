import type { IdeaCandidate } from "./types";

export interface OriginalityReviewResult {
  reviewer: "local_deterministic";
  phraseOverlapRisk: number;
  structuralOverlapRisk: number;
  thumbnailOverlapRisk: number;
  conceptOverlapRisk: number;
  flaggedMatches: string[];
  requiredChanges: string[];
  status: "pass" | "needs_changes" | "blocked";
}

export interface OriginalityPatternSource {
  hookPattern: string;
  promisePattern: string;
  pacingPattern: string;
  proofPattern: string;
  visualOpportunities: string[];
  forbiddenToCopy: string[];
}

export function reviewOriginality(input: { idea: Pick<IdeaCandidate, "workingTitle" | "angle" | "corePromise" | "dramaticQuestion" | "thumbnailConcept">; patterns: OriginalityPatternSource[] }): OriginalityReviewResult {
  const structuralSources = input.patterns.flatMap((pattern) => [pattern.hookPattern, pattern.promisePattern, pattern.pacingPattern, pattern.proofPattern]);
  const phraseSources = input.patterns.flatMap((pattern) => pattern.forbiddenToCopy);
  const thumbnailSources = input.patterns.flatMap((pattern) => [...pattern.visualOpportunities, ...pattern.forbiddenToCopy]);
  const phraseOverlapRisk = highestOverlap(input.idea.workingTitle, phraseSources);
  const structuralOverlapRisk = Math.max(
    highestOverlap(input.idea.angle, structuralSources),
    highestOverlap(input.idea.corePromise, structuralSources),
    highestOverlap(input.idea.dramaticQuestion, structuralSources)
  );
  const thumbnailOverlapRisk = highestOverlap(input.idea.thumbnailConcept, thumbnailSources);
  const conceptOverlapRisk = Math.round((structuralOverlapRisk + thumbnailOverlapRisk) / 2);
  const flaggedMatches = [
    phraseOverlapRisk >= 85 ? "Title substantially overlaps a forbidden competitor expression." : "",
    structuralOverlapRisk >= 85 ? "Idea structure substantially overlaps a recorded competitor pattern." : "",
    thumbnailOverlapRisk >= 85 ? "Thumbnail concept substantially overlaps a recorded competitor visual pattern." : ""
  ].filter(Boolean);
  const maximumRisk = Math.max(phraseOverlapRisk, structuralOverlapRisk, thumbnailOverlapRisk);
  const status = maximumRisk >= 85 ? "blocked" : maximumRisk >= 50 ? "needs_changes" : "pass";
  const requiredChanges = status === "pass" ? [] : ["Revise the flagged expression, structure, or visual concept and rerun Idea Lab before approval."];
  return { reviewer: "local_deterministic", phraseOverlapRisk, structuralOverlapRisk, thumbnailOverlapRisk, conceptOverlapRisk, flaggedMatches, requiredChanges, status };
}

function highestOverlap(value: string, candidates: string[]): number {
  return candidates.reduce((highest, candidate) => Math.max(highest, tokenOverlapPercent(value, candidate)), 0);
}

function tokenOverlapPercent(left: string, right: string): number {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return Math.round((shared / Math.min(leftTokens.size, rightTokens.size)) * 100);
}

function tokenize(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
}
