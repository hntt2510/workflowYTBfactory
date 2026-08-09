import { describe, expect, it } from "vitest";
import { createFixtureProject } from "@lsf/domain";
import { currentStage, projectProgress } from "./utils";
import { safeRendererError } from "./utils";

describe("safeRendererError", () => {
  it("hides raw IPC and renderer implementation errors", () => {
    expect(safeRendererError(new Error("Error invoking remote method 'run-preview-render': invalid input"), "Retry preview.")).toBe("Retry preview.");
    expect(safeRendererError(new Error("The selected voice is unavailable."))).toBe("The selected voice is unavailable.");
  });

  it("keeps known workflow errors actionable when IPC wraps them", () => {
    expect(safeRendererError(new Error("Error invoking remote method 'retry-scene': The selected scene has no AI image media to regenerate."))).toContain("no AI image");
    expect(safeRendererError(new Error("Error invoking remote method 'continue-after-scene-review': Production is already running for this project."))).toContain("still running");
    expect(safeRendererError(new Error("Error invoking remote method 'run-voice-generation': Selected Edge voice (vi-VN-NamMinhNeural) does not match language (en). Refresh voices and choose a matching voice."))).toContain("does not match");
  });
});

describe("workflow progress helpers", () => {
  it("uses the applicable path instead of raw 28-stage status for topic projects", () => {
    const project = createFixtureProject({ topic: "Topic", format: "short", targetLanguage: "Vietnamese", inputMode: "topic" });
    expect(currentStage(project)).toBe("Idea Lab");
    expect(projectProgress(project)).toBe(8);
  });
});
