import { describe, expect, it } from "vitest";
import { createStageAttention, normalizeStageAttention } from "../src";

describe("stage attention metadata", () => {
  it("provides review and retry actions for deterministic failures", () => {
    const attention = createStageAttention("fact-review", "AUTO_APPROVAL_BLOCKED", "Resolve the blocked finding.");

    expect(attention).toMatchObject({
      phase: "Fact Review",
      safeReason: "Resolve the blocked finding.",
      recommendedAction: "Review stage",
      retryAction: "Retry stage"
    });
    expect(attention.actions).toEqual([
      { label: "Review stage", route: "script" },
      { label: "Retry stage", route: "script" }
    ]);
  });

  it("routes provider failures to settings and preserves failed items", () => {
    const attention = createStageAttention("voice-generation", "credential_missing", "Configure a voice provider.", {
      failedItem: "segment-02",
      retryAction: "Retry failed voice segments"
    });

    expect(attention).toMatchObject({
      phase: "Voice Generation",
      failedItem: "segment-02",
      settingsRoute: "settings",
      retryAction: "Retry failed voice segments"
    });
    expect(attention.actions).toContainEqual({ label: "Open Settings", route: "settings" });
    expect(attention.actions).toContainEqual({ label: "Retry failed voice segments", route: "voice" });
  });

  it("upgrades legacy attention payloads with safe defaults", () => {
    const attention = normalizeStageAttention("script", {
      code: "provider_failed",
      message: "The script provider failed.",
      actions: [{ label: "Review stage", route: "script" }]
    });

    expect(attention.phase).toBe("Script");
    expect(attention.safeReason).toBe("The script provider failed.");
    expect(attention.actions).toContainEqual({ label: "Retry stage", route: "script" });
    expect(attention.actions).toContainEqual({ label: "Open Settings", route: "providers" });
  });
});
