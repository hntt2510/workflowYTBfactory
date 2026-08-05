import { describe, expect, it } from "vitest";
import { prepareExistingScript } from "../src";

describe("existing script preparation", () => {
  it("preserves supplied narration while creating scene-ready sections", () => {
    const result = prepareExistingScript("First point.\n\nSecond point with more context.");
    expect(result.sections.map((section) => section.narration)).toEqual(["First point.", "Second point with more context."]);
    expect(result.sections.every((section) => section.linkedClaimIds.length === 0)).toBe(true);
  });
});
