import { describe, expect, it, vi } from "vitest";
import { generateCharacterVersion, retryCharacterReference } from "./characterService";

const persona = {
  role: "Finance teacher",
  ageRange: "30-40",
  appearance: "Short dark hair",
  wardrobe: "Navy blazer",
  palette: "Navy and amber",
  props: ["marker"],
  gestures: ["open palm"],
  tone: "Clear and warm"
};

function asset(shotId: string) {
  return {
    shotId,
    promptVersionId: "prompt-1",
    relativeFilePath: `characters/${shotId}.png`,
    sha256: `${shotId}-hash`.padEnd(64, "a").slice(0, 64),
    mimeType: "image/png" as const,
    byteLength: 10,
    width: 1920,
    height: 1080
  };
}

describe("character service", () => {
  it("generates the default five-view identity pack", async () => {
    const generateImage = vi.fn(async (input: { shotId: string; referenceImages?: unknown }) => asset(input.shotId));
    const version = await generateCharacterVersion({
      profileId: "profile-1",
      version: 1,
      name: "Mina",
      persona,
      invariantTraits: ["round glasses"],
      prohibitedChanges: ["wardrobe palette"],
      imageCapabilityVerified: true,
      workspaceRoot: "workspace",
      generateImage
    });

    expect(generateImage).toHaveBeenCalledTimes(5);
    expect(version.references).toHaveLength(5);
    expect(version.status).toBe("needs_review");
    expect(generateImage.mock.calls[0]?.[0]).toMatchObject({ positivePrompt: expect.stringContaining("Composition lock:") });
    expect(generateImage.mock.calls[0]?.[0]).toMatchObject({ positivePrompt: expect.stringContaining("place the subject right") });
    expect(generateImage.mock.calls[0]?.[0].referenceImages).toBeUndefined();
    expect(generateImage.mock.calls[1]?.[0].referenceImages).toEqual([{ relativeFilePath: "characters/character-hero.png", sha256: expect.any(String), mimeType: "image/png" }]);
  });

  it("retries only the selected identity view", async () => {
    const version = await generateCharacterVersion({
      profileId: "profile-1",
      version: 1,
      name: "Mina",
      persona,
      invariantTraits: ["round glasses"],
      prohibitedChanges: ["wardrobe palette"],
      imageCapabilityVerified: true,
      workspaceRoot: "workspace",
      generateImage: async (input: { shotId: string; referenceImages?: unknown }) => asset(input.shotId)
    });
    const generateImage = vi.fn(async (input: { shotId: string; referenceImages?: unknown }) => ({ ...asset(input.shotId), sha256: "b".repeat(64) }));
    const retried = await retryCharacterReference({
      profileId: "profile-1",
      version,
      view: "teaching_gesture",
      imageCapabilityVerified: true,
      workspaceRoot: "workspace",
      generateImage
    });

    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(generateImage.mock.calls[0]?.[0].referenceImages).toEqual([
      { relativeFilePath: "characters/character-hero.png", sha256: expect.any(String), mimeType: "image/png" },
      { relativeFilePath: "characters/character-half_body.png", sha256: expect.any(String), mimeType: "image/png" }
    ]);
    expect(retried.references.find((reference) => reference.view === "teaching_gesture")?.sha256).toBe("b".repeat(64));
    expect(retried.references.filter((reference) => reference.view !== "teaching_gesture")).toEqual(version.references.filter((reference) => reference.view !== "teaching_gesture"));
  });

  it("rejects retries for a view that is not in the character version", async () => {
    const version = await generateCharacterVersion({
      profileId: "profile-1",
      version: 1,
      name: "Mina",
      persona,
      invariantTraits: ["round glasses"],
      prohibitedChanges: ["wardrobe palette"],
      imageCapabilityVerified: true,
      workspaceRoot: "workspace",
      viewCount: 4,
      generateImage: async (input: { shotId: string; referenceImages?: unknown }) => asset(input.shotId)
    });

    await expect(retryCharacterReference({
      profileId: "profile-1",
      version,
      view: "profile",
      imageCapabilityVerified: true,
      workspaceRoot: "workspace",
      generateImage: async (input: { shotId: string; referenceImages?: unknown }) => asset(input.shotId)
    })).rejects.toMatchObject({ category: "invalid_input" });
  });
});
