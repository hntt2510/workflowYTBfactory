import { describe, expect, it } from "vitest";
import { factReviewFindingsBlockApproval, retentionReviewBlocksApproval } from "./reviewApprovalGate";

describe("review approval gates", () => {
  it("blocks fact review approval when any finding is blocked", () => {
    expect(factReviewFindingsBlockApproval([
      { verdict: "supported" },
      { verdict: "blocked" }
    ])).toBe(true);
    expect(factReviewFindingsBlockApproval([{ verdict: "needs_qualification" }])).toBe(false);
  });

  it("blocks retention review approval only when the overall verdict is blocked", () => {
    expect(retentionReviewBlocksApproval({ overallVerdict: "blocked" })).toBe(true);
    expect(retentionReviewBlocksApproval({ overallVerdict: "needs_changes" })).toBe(false);
    expect(retentionReviewBlocksApproval({ overallVerdict: "pass" })).toBe(false);
  });
});
