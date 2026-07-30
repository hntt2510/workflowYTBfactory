import { describe, expect, it } from "vitest";
import { validateReferenceSegmentationOutput } from "../src";

describe("reference segmentation validation", () => {
  const transcript = "Hook. Context follows.";

  it("accepts ordered source-aligned segments", () => {
    const result = validateReferenceSegmentationOutput({
      referenceId: "reference-1",
      segments: [
        { id: "segment-1", order: 0, startCharacter: 0, endCharacter: 5, type: "hook", text: "Hook.", function: "Open attention." },
        { id: "segment-2", order: 1, startCharacter: 6, endCharacter: transcript.length, type: "context", text: "Context follows.", function: "Set context." }
      ]
    }, transcript, "reference-1");
    expect(result.errors).toEqual([]);
  });

  it("rejects invented, overlapping, and out-of-range segments", () => {
    const result = validateReferenceSegmentationOutput({
      referenceId: "reference-1",
      segments: [
        { id: "segment-1", order: 0, startCharacter: 0, endCharacter: 5, type: "hook", text: "Invented", function: "Open attention." },
        { id: "segment-2", order: 1, startCharacter: 4, endCharacter: 999, type: "context", text: "Context", function: "Set context." }
      ]
    }, transcript, "reference-1");
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
