export interface FactReviewFinding {
  verdict: "supported" | "needs_qualification" | "blocked";
}

export interface RetentionReviewOutput {
  overallVerdict: "pass" | "needs_changes" | "blocked";
}

export function factReviewFindingsBlockApproval(findings: readonly FactReviewFinding[]): boolean {
  return findings.some((finding) => finding.verdict === "blocked");
}

export function retentionReviewBlocksApproval(output: RetentionReviewOutput): boolean {
  return output.overallVerdict === "blocked";
}
