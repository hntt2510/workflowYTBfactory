import { describe, expect, it } from "vitest";
import { evaluateReferenceSet, findDuplicateReference, normalizeReferenceIdentity, validateReference } from "../src";
import type { CompetitorReference } from "../src";

describe("reference identity and validation", () => {
  it("normalizes equivalent YouTube URLs to the same identity", () => {
    expect(normalizeReferenceIdentity("https://www.youtube.com/watch?v=3GKC4kC3iQ0&utm_source=x")).toBe("youtube:3GKC4kC3iQ0");
    expect(normalizeReferenceIdentity("http://youtube.com/watch?v=3GKC4kC3iQ0&t=30")).toBe("youtube:3GKC4kC3iQ0");
    expect(normalizeReferenceIdentity("https://youtu.be/3GKC4kC3iQ0?si=abc")).toBe("youtube:3GKC4kC3iQ0");
    expect(normalizeReferenceIdentity("https://m.youtube.com/watch?v=3GKC4kC3iQ0&list=PL1")).toBe("youtube:3GKC4kC3iQ0");
  });

  it("keeps different YouTube IDs separate and handles malformed URLs safely", () => {
    expect(normalizeReferenceIdentity("https://youtu.be/aaa")).not.toBe(normalizeReferenceIdentity("https://youtu.be/bbb"));
    expect(normalizeReferenceIdentity("not a url")).toMatch(/^manual:/);
  });

  it("finds duplicates by normalized source identity", () => {
    const identityKey = normalizeReferenceIdentity("https://www.youtube.com/watch?v=3GKC4kC3iQ0");
    const reference: CompetitorReference = {
      id: "reference-1",
      ...(identityKey ? { identityKey } : {}),
      sourceUrl: "https://www.youtube.com/watch?v=3GKC4kC3iQ0",
      pastedTranscript: "Transcript long enough to validate.",
      createdAt: "2026-07-30T00:00:00.000Z"
    };
    expect(findDuplicateReference([reference], normalizeReferenceIdentity("http://youtube.com/watch?v=3GKC4kC3iQ0"))?.id).toBe("reference-1");
  });

  it("requires included valid references before approval", () => {
    const draft: CompetitorReference = {
      id: "reference-1",
      pastedTranscript: "Transcript long enough to validate.",
      status: "draft",
      included: true,
      createdAt: "2026-07-30T00:00:00.000Z"
    };
    expect(evaluateReferenceSet([draft]).status).toBe("needs_validation");
    const validation = validateReference(draft);
    expect(evaluateReferenceSet([{ ...draft, status: validation.status }]).status).toBe("valid");
  });

  it("rejects malformed and incomplete YouTube source URLs", () => {
    const reference: CompetitorReference = {
      id: "reference-1",
      pastedTranscript: "Transcript long enough to validate.",
      createdAt: "2026-07-30T00:00:00.000Z"
    };
    expect(validateReference({ ...reference, sourceUrl: "not a URL" }).status).toBe("invalid");
    expect(validateReference({ ...reference, sourceUrl: "https://www.youtube.com/watch" }).status).toBe("invalid");
    expect(validateReference({ ...reference, sourceUrl: "ftp://example.com/video" }).status).toBe("invalid");
  });
});
