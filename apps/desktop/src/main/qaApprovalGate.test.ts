import { describe, expect, it } from "vitest";
import { qaFindingsBlockApproval } from "./qaApprovalGate";

describe("QA approval gate", () => {
  it("blocks approval when any deterministic finding is blocking", () => {
    expect(qaFindingsBlockApproval([
      { severity: "warning" },
      { severity: "blocking" }
    ])).toBe(true);
  });

  it("allows approval when findings are warnings only", () => {
    expect(qaFindingsBlockApproval([
      { severity: "warning" }
    ])).toBe(false);
    expect(qaFindingsBlockApproval([])).toBe(false);
  });
});
