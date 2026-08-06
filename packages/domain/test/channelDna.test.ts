import { describe, expect, it } from "vitest";
import { channelDnaSchema, createDefaultChannelDna, getChannelStylePreset, normalizeChannelDna, recommendChannelDirection, resolveChannelDna } from "../src";

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
});
