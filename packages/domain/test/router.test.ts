import { describe, expect, it } from "vitest";
import { routeChannelProfile, seedChannelProfiles } from "../src";

describe("channel profile router", () => {
  it("routes insurance acceptance sample", () => {
    const decision = routeChannelProfile(seedChannelProfiles, {
      topic: "term life vs whole life",
      format: "long",
      targetLanguage: "English"
    });
    expect(decision.selectedProfileId).toBe("insurance-made-simple");
    expect(decision.requiresUserConfirmation).toBe(false);
  });

  it("routes bible acceptance sample", () => {
    const decision = routeChannelProfile(seedChannelProfiles, {
      topic: "What did Aaron's breastpiece symbolize?",
      format: "long",
      targetLanguage: "English"
    });
    expect(decision.selectedProfileId).toBe("bible-mysteries-revealed");
    expect(decision.matchedSignals).toContain("aaron");
  });

  it("routes viral case files acceptance sample", () => {
    const decision = routeChannelProfile(seedChannelProfiles, {
      topic: "AI copyright lawsuit between a creator and a platform",
      format: "long",
      targetLanguage: "English"
    });
    expect(decision.selectedProfileId).toBe("viral-case-files");
  });

  it("lets explicit selection win", () => {
    const decision = routeChannelProfile(seedChannelProfiles, {
      topic: "Moses and the ark",
      format: "long",
      targetLanguage: "English",
      selectedProfileId: "insurance-made-simple"
    });
    expect(decision.selectedProfileId).toBe("insurance-made-simple");
    expect(decision.confidence).toBe(1);
  });
});

