import { describe, expect, it } from "vitest";
import { buildChannelPromptProfile, channelDnaSchema, createDefaultChannelDna, createFixtureProject, getChannelStylePreset, normalizeChannelDna, recommendChannelDirection, recommendChannelIdeas, resolveChannelDna, resolveChannelPromptContext } from "../src";

describe("Channel DNA", () => {
  it("exposes the eight approved style presets", () => {
    expect(["editorial-explainer", "2d-character-animation", "cute-daily-life-cartoon", "cinematic-documentary", "motion-collage", "minimal-infographic", "meme-short-form-cartoon", "custom"].map((id) => getChannelStylePreset(id as never).id)).toHaveLength(8);
  });

  it("keeps inheritance deterministic across global, channel, project, and scene", () => {
    const global = createDefaultChannelDna({ styleId: "editorial-explainer" });
    const resolved = resolveChannelDna(global, { visualStyle: { styleId: "cute-daily-life-cartoon" } }, { productionDefaults: { defaultMotion: "pop" } }, { identity: { tone: "playful" } });
    expect(resolved.visualStyle.styleId).toBe("cute-daily-life-cartoon");
    expect(resolved.productionDefaults.defaultMotion).toBe("pop");
    expect(resolved.identity.tone).toBe("playful");
    expect(resolved.contentDirection.pillars.length).toBeGreaterThan(0);
  });

  it("produces distinct recommendation grammar for the same topic by style", () => {
    const topic = "red panda conservation";
    const editorial = recommendChannelDirection({ topic, styleId: "editorial-explainer" });
    const cute = recommendChannelDirection({ topic, styleId: "cute-daily-life-cartoon" });
    expect(editorial.sceneGrammar).not.toEqual(cute.sceneGrammar);
    expect(editorial.reason).toContain("Editorial Explainer");
    expect(cute.reason).toContain("Cute Daily-Life Cartoon");
  });

  it("normalizes an old or partially edited profile into a schema-valid snapshot", () => {
    const dna = normalizeChannelDna({ visualStyle: { styleId: "minimal-infographic" }, characters: [{ id: "teacher", name: "Teacher", role: "primary", priority: "primary" }] });
    expect(channelDnaSchema.parse(dna).visualStyle.styleId).toBe("minimal-infographic");
  });

  it("creates distinct idea cards and keeps project style overrides in the snapshot", () => {
    const editorial = recommendChannelIdeas({ topic: "cash flow", styleId: "editorial-explainer", format: "short" });
    const cute = recommendChannelIdeas({ topic: "cash flow", styleId: "cute-daily-life-cartoon", format: "short" });
    expect(editorial[0]?.title).not.toBe(cute[0]?.title);
    expect(editorial[0]?.estimatedImageCount).toBeGreaterThan(0);

    const project = createFixtureProject({ topic: "cash flow", format: "short", targetLanguage: "Vietnamese", selectedProfileId: "insurance-made-simple", projectStyleId: "motion-collage" });
    expect(project.setup.channelStyleId).toBe("motion-collage");
    expect(project.setup.channelOverrides?.visualStyle?.styleId).toBe("motion-collage");
    expect(project.setup.channelDnaSnapshot?.visualStyle.styleId).toBe("motion-collage");
    expect(project.setup.channelDnaSnapshot?.visualStyle.productionProfile.storyboardGrammar).toContain("LAYER_STACK");
    expect(project.setup.channelDnaSnapshot?.productionDefaults.defaultMotion).toBe("slide_up");
    expect(project.setup.channelPromptProfileSnapshot?.channelId).toBe("insurance-made-simple");
    expect(project.setup.channelPromptProfileSnapshot?.version).toBeGreaterThan(0);
  });

  it("compiles and resolves channel-isolated prompt context", () => {
    const insurance = buildChannelPromptProfile({ channelId: "insurance-made-simple", channelDna: createDefaultChannelDna({ name: "Insurance", styleId: "minimal-infographic" }), niche: "Insurance education" });
    const milo = buildChannelPromptProfile({ channelId: "milo-red-panda", channelDna: createDefaultChannelDna({ name: "Milo", styleId: "cute-daily-life-cartoon" }), niche: "Character daily life" });
    expect(insurance.masterPrompt).not.toBe(milo.masterPrompt);
    expect(insurance.channelId).not.toBe(milo.channelId);
    const context = resolveChannelPromptContext({ channelId: insurance.channelId, profile: insurance, taskType: "scene_image_generation" });
    expect(context.channelId).toBe("insurance-made-simple");
    expect(context.contentIdentity.niche).toBe("Insurance education");
    expect(context.visualStyle).toBe("minimal-infographic");
    expect(context.productionGrammar.preferredMotion.length).toBeGreaterThan(0);
    expect(resolveChannelPromptContext({ channelId: insurance.channelId, profile: insurance, taskType: "story" }).assets).toEqual([]);
    expect(() => resolveChannelPromptContext({ channelId: milo.channelId, profile: insurance, taskType: "scene_image_generation" })).toThrow(/active channel/);
  });

  it("drops channel-tagged characters and assets from another channel", () => {
    const dna = createDefaultChannelDna({ name: "Insurance", styleId: "minimal-infographic" });
    dna.characters = [{ id: "milo", channelId: "milo-red-panda", name: "Milo", role: "character", priority: "primary" }];
    dna.assets = [{ id: "forest", channelId: "milo-red-panda", name: "Forest", kind: "background", description: "Warm forest", tags: [] }];
    const profile = buildChannelPromptProfile({ channelId: "insurance-made-simple", channelDna: dna });
    expect(profile.characterRegistry).toEqual([]);
    expect(profile.assetRegistry).toEqual([]);
  });
});
