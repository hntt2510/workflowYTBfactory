import type { Claim } from "./types";

export interface FactReviewFinding { claimId: string; verdict: "supported" | "needs_qualification" | "blocked"; reason: string; }

export function reviewFacts(claims: Claim[]): FactReviewFinding[] {
  return claims.map((claim) => {
    if (claim.approvalState !== "allowed" || claim.state === "unsupported") return { claimId: claim.id, verdict: "blocked", reason: "Claim is not approved for narration." };
    if (claim.type === "allegation" || claim.type === "interpretation" || claim.state === "needs_qualification") return { claimId: claim.id, verdict: "needs_qualification", reason: "Narration must preserve the claim qualification." };
    return { claimId: claim.id, verdict: "supported", reason: "Claim is approved and source-linked." };
  });
}
