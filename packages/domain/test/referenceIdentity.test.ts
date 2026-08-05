import { describe, expect, it } from "vitest";
import { evaluateReferenceSet, findDuplicateReference, normalizeReferenceIdentity, referenceSetFingerprint, validateReference } from "../src";
import type { CompetitorReference } from "../src";

describe("reference identity and validation", () => {
  it("normalizes equivalent YouTube URLs to the same identity", () => {
    expect(normalizeReferenceIdentity("https://www.youtube.com/watch?v=3GKC4kC3iQ0&utm_source=x")).toBe("youtube:3GKC4kC3iQ0");
    expect(normalizeReferenceIdentity("http://youtube.com/watch?v=3GKC4kC3iQ0&t=30")).toBe("youtube:3GKC4kC3iQ0");
    expect(normalizeReferenceIdentity("https://youtu.be/3GKC4kC3iQ0?si=abc")).toBe("youtube:3GKC4kC3iQ0");
    expect(normalizeReferenceIdentity("https://m.youtube.com/watch?v=3GKC4kC3iQ0&list=PL1")).toBe("youtube:3GKC4kC3iQ0");
    expect(normalizeReferenceIdentity("https://www.youtube.com/shorts/3GKC4kC3iQ0?t=30")).toBe("youtube:3GKC4kC3iQ0");
    expect(normalizeReferenceIdentity("https://www.youtube.com/embed/3GKC4kC3iQ0?si=abc")).toBe("youtube:3GKC4kC3iQ0");
  });

  it("keeps different YouTube IDs separate and handles malformed URLs safely", () => {
    expect(normalizeReferenceIdentity("https://youtu.be/aaa")).not.toBe(normalizeReferenceIdentity("https://youtu.be/bbb"));
    expect(normalizeReferenceIdentity("not a url")).toMatch(/^manual:/);
    expect(normalizeReferenceIdentity("https://www.youtube.com/watch")).toBeUndefined();
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

  it("prefers the included latest transcript version as the duplicate target", () => {
    const identityKey = normalizeReferenceIdentity("https://youtu.be/3GKC4kC3iQ0");
    const older: CompetitorReference = {
      id: "reference-v1",
      ...(identityKey ? { identityKey } : {}),
      sourceUrl: "https://youtu.be/3GKC4kC3iQ0",
      pastedTranscript: "Older transcript version with enough content.",
      version: 1,
      included: false,
      createdAt: "2026-07-30T00:00:00.000Z"
    };
    const current: CompetitorReference = {
      ...older,
      id: "reference-v2",
      pastedTranscript: "Current transcript version with enough content.",
      version: 2,
      included: true,
      updatedAt: "2026-07-30T01:00:00.000Z"
    };
    expect(findDuplicateReference([older, current], identityKey)?.id).toBe("reference-v2");
  });

  it("requires included valid references before approval", async () => {
    const draft: CompetitorReference = {
      id: "reference-1",
      pastedTranscript: "Transcript long enough to validate.",
      status: "draft",
      included: true,
      createdAt: "2026-07-30T00:00:00.000Z"
    };
    expect((await evaluateReferenceSet([draft])).status).toBe("needs_validation");
    const validation = validateReference(draft);
    expect((await evaluateReferenceSet([{ ...draft, status: validation.status }])).status).toBe("valid");
  });

  it("uses a canonical SHA-256 fingerprint for the included validation input", async () => {
    const reference: CompetitorReference = {
      id: "reference-1",
      pastedTranscript: "Transcript long enough to validate.",
      status: "valid",
      included: true,
      createdAt: "2026-07-30T00:00:00.000Z"
    };
    const first = await referenceSetFingerprint([reference]);
    const reordered = await referenceSetFingerprint([{ ...reference, updatedAt: "2026-07-30T01:00:00.000Z" }]);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(reordered).toBe(first);
    expect(await referenceSetFingerprint([reference], { projectId: "project-a" })).not.toBe(await referenceSetFingerprint([reference], { projectId: "project-b" }));
    expect(await referenceSetFingerprint([{ ...reference, included: false }, reference])).toBe(first);
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
