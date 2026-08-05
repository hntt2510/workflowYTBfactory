import { describe, expect, it } from "vitest";
import { reviewOriginality } from "../src";

const idea = {
  workingTitle: "Why your emergency fund is not enough",
  angle: "Explain the hidden gap between cash savings and real financial protection.",
  corePromise: "Give viewers a practical way to identify the gap.",
  dramaticQuestion: "What happens when savings are the only plan?",
  thumbnailConcept: "A cracked piggy bank beside a safety net"
};

describe("reviewOriginality", () => {
  it("passes an idea with distinct expression, structure, and visual concept", () => {
    const result = reviewOriginality({ idea, patterns: [{ hookPattern: "Open with a surprising policy comparison", promisePattern: "Show how deductibles work", pacingPattern: "Alternate examples and explainers", proofPattern: "Use a claim case study", visualOpportunities: ["A policy document on a desk"], forbiddenToCopy: ["The deductible trap"] }] });
    expect(result.status).toBe("pass");
    expect(result.reviewer).toBe("local_deterministic");
  });

  it("blocks substantially reused competitor structure even without an exact full-string match", () => {
    const result = reviewOriginality({ idea, patterns: [{ hookPattern: "Explain the hidden gap between cash savings and real financial protection", promisePattern: "Give viewers a practical way to identify the gap", pacingPattern: "Alternate examples", proofPattern: "Use a case", visualOpportunities: ["A policy document"], forbiddenToCopy: ["Different title"] }] });
    expect(result.structuralOverlapRisk).toBeGreaterThanOrEqual(85);
    expect(result.status).toBe("blocked");
  });
});
