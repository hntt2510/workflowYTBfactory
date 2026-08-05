import { describe, expect, it } from "vitest";
import { validateReferenceSegmentationOutput } from "../src";

describe("reference segmentation validation", () => {
  const transcript = "Hook. Context follows.";

  it("accepts ordered source-aligned segments", () => {
    const result = validateReferenceSegmentationOutput({
      referenceId: "reference-1",
      cleanedTranscriptArtifactId: "artifact-cleaned-1",
      excludedSegmentIds: [],
      segments: [
        { id: "segment-1", order: 0, startCharacter: 0, endCharacter: 5, type: "hook", text: "Hook.", function: "Open attention.", includedForDna: true },
        { id: "segment-2", order: 1, startCharacter: 5, endCharacter: transcript.length, type: "context", text: " Context follows.", function: "Set context.", includedForDna: true }
      ]
    }, transcript, "reference-1");
    expect(result.errors).toEqual([]);
  });

  it("rejects invented, overlapping, and out-of-range segments", () => {
    const result = validateReferenceSegmentationOutput({
      referenceId: "reference-1",
      cleanedTranscriptArtifactId: "artifact-cleaned-1",
      excludedSegmentIds: [],
      segments: [
        { id: "segment-1", order: 0, startCharacter: 0, endCharacter: 5, type: "hook", text: "Invented", function: "Open attention.", includedForDna: true },
        { id: "segment-2", order: 1, startCharacter: 4, endCharacter: 999, type: "context", text: "Context", function: "Set context.", includedForDna: true }
      ]
    }, transcript, "reference-1");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("recovers boundaries when the model trims edge whitespace from segment indexes", () => {
    const result = validateReferenceSegmentationOutput({
      referenceId: "reference-1",
      cleanedTranscriptArtifactId: "artifact-cleaned-1",
      excludedSegmentIds: [],
      segments: [
        { id: "segment-1", order: 0, startCharacter: 0, endCharacter: 4, type: "hook", text: "Hook.", function: "Open attention.", includedForDna: true },
        { id: "segment-2", order: 1, startCharacter: 4, endCharacter: transcript.length, type: "context", text: " Context follows.", function: "Set context.", includedForDna: true }
      ]
    }, transcript, "reference-1");
    expect(result.errors).toEqual([]);
    expect(result.output?.segments.map((segment) => [segment.startCharacter, segment.endCharacter])).toEqual([[0, 5], [5, transcript.length]]);
  });

  it("preserves whitespace gaps when the model trims segment text", () => {
    const whitespaceTranscript = "Opening line.\n\nClosing line.\n";
    const result = validateReferenceSegmentationOutput({
      referenceId: "reference-1",
      cleanedTranscriptArtifactId: "artifact-cleaned-1",
      excludedSegmentIds: [],
      segments: [
        { id: "segment-1", order: 0, startCharacter: 0, endCharacter: 13, type: "hook", text: "Opening line.", function: "Open attention.", includedForDna: true },
        { id: "segment-2", order: 1, startCharacter: 13, endCharacter: whitespaceTranscript.length - 1, type: "payoff", text: "Closing line.", function: "Close the point.", includedForDna: true }
      ]
    }, whitespaceTranscript, "reference-1");
    expect(result.errors).toEqual([]);
    expect(result.output?.segments.map((segment) => segment.text).join(""))
      .toBe(whitespaceTranscript);
    expect(result.output?.segments.map((segment) => [segment.startCharacter, segment.endCharacter]))
      .toEqual([[0, 13], [13, whitespaceTranscript.length]]);
  });

  it("requires deterministic sponsor exclusion while preserving the source slice", () => {
    const sponsorTranscript = "Story. Before we continue, let me introduce today's sponsor. Payoff.";
    const sponsorStart = sponsorTranscript.indexOf("Before");
    const payoffStart = sponsorTranscript.indexOf("Payoff.");
    const result = validateReferenceSegmentationOutput({
      referenceId: "reference-1",
      cleanedTranscriptArtifactId: "artifact-cleaned-1",
      excludedSegmentIds: ["segment-sponsor"],
      segments: [
        { id: "segment-story", order: 0, startCharacter: 0, endCharacter: sponsorStart, type: "story", text: sponsorTranscript.slice(0, sponsorStart), function: "Set up the story.", includedForDna: true },
        { id: "segment-sponsor", order: 1, startCharacter: sponsorStart, endCharacter: payoffStart, type: "sponsor", text: sponsorTranscript.slice(sponsorStart, payoffStart), function: "Sponsor disclosure.", includedForDna: false, exclusionReason: "sponsor" },
        { id: "segment-payoff", order: 2, startCharacter: payoffStart, endCharacter: sponsorTranscript.length, type: "payoff", text: sponsorTranscript.slice(payoffStart), function: "Deliver the payoff.", includedForDna: true }
      ]
    }, sponsorTranscript, "reference-1");
    expect(result.errors).toEqual([]);
  });
});
