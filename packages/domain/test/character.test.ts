import { describe, expect, it } from "vitest";
import { characterReferenceViewsForCount, characterVersionIsApproved, createFixtureProject, characterVersionSchema, defaultCharacterCompositionLock, resolveCharacterCompositionLock } from "../src";

function characterVersion(status: "draft" | "approved" = "approved", referenceStatus: "needs_review" | "approved" = "approved") {
  const now = "2026-08-04T00:00:00.000Z";
  return {
    id: "character-test-v1",
    version: 1,
    status,
    name: "Mina",
    persona: {
      role: "Finance teacher",
      ageRange: "30-40",
      appearance: "Short dark hair",
      wardrobe: "Navy blazer",
      palette: "Navy and amber",
      props: ["marker"],
      gestures: ["open palm"],
      tone: "Clear and warm"
    },
    invariantTraits: ["round glasses"],
    prohibitedChanges: ["do not change wardrobe palette"],
    references: characterReferenceViewsForCount(5).map((view, index) => ({
      id: `character-reference-${index}`,
      view,
      status: referenceStatus,
      relativeFilePath: `characters/${view}.png`,
      sha256: "a".repeat(64),
      mimeType: "image/png" as const,
      width: 1920,
      height: 1080
    })),
    createdAt: now,
    updatedAt: now
  };
}

describe("character versions", () => {
  it("uses five views by default and only accepts four to six views", () => {
    expect(characterReferenceViewsForCount()).toHaveLength(5);
    expect(characterReferenceViewsForCount(4)).toHaveLength(4);
    expect(characterReferenceViewsForCount(6)).toHaveLength(6);
    expect(() => characterReferenceViewsForCount(3)).toThrow();
    expect(() => characterReferenceViewsForCount(7)).toThrow();
  });

  it("requires an approved version and approved identity references", () => {
    expect(characterVersionIsApproved(characterVersion())).toBe(true);
    expect(characterVersionIsApproved(characterVersion("draft"))).toBe(false);
    expect(characterVersionIsApproved(characterVersion("approved", "needs_review"))).toBe(false);
    expect(() => characterVersionSchema.parse({ ...characterVersion(), references: characterVersion().references.slice(0, 3) })).toThrow();
  });

  it("keeps composition framing backward-compatible and validates normalized boxes", () => {
    const legacy = characterVersion();
    expect(resolveCharacterCompositionLock({})).toEqual(defaultCharacterCompositionLock);
    expect(characterVersionSchema.parse({ ...legacy, composition: defaultCharacterCompositionLock }).composition).toEqual(defaultCharacterCompositionLock);
    expect(() => characterVersionSchema.parse({
      ...legacy,
      composition: {
        ...defaultCharacterCompositionLock,
        subjectBox: { ...defaultCharacterCompositionLock.subjectBox, x: 0.8 }
      }
    })).toThrow();
  });

  it("defaults new projects to character-first while preserving explicit legacy projects", () => {
    expect(createFixtureProject({ topic: "New", format: "short", targetLanguage: "Vietnamese" }).setup.visualWorkflow).toBe("character_first");
    expect(createFixtureProject({ topic: "Old", format: "short", targetLanguage: "Vietnamese", visualWorkflow: "legacy" }).setup.visualWorkflow).toBe("legacy");
  });
});
