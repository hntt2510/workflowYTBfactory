import { describe, expect, it } from "vitest";
import { workflowStageDefinitions } from "../src";
import type { WorkflowStageDefinition } from "../src";

describe("workflow registry", () => {
  it("keeps the canonical 28-stage order stable", () => {
    expect(workflowStageDefinitions.map((stage) => stage.id)).toEqual([
      "project-setup",
      "reference-intake",
      "reference-validation",
      "transcript-cleaning",
      "reference-segmentation",
      "competitor-dna",
      "opportunity-map",
      "idea-lab",
      "originality-review",
      "research-source-intake",
      "claim-map",
      "outline",
      "script",
      "fact-review",
      "retention-review",
      "scene-plan",
      "shot-plan",
      "visual-routing",
      "prompt-preparation",
      "asset-acquisition",
      "asset-review",
      "voice-generation",
      "subtitle-preparation",
      "timeline-assembly",
      "preview-render",
      "qa",
      "capcut-draft",
      "packaging-export"
    ]);
  });

  it("uses valid dependencies, routes and invalidation targets", () => {
    const ids = new Set<string>(workflowStageDefinitions.map((stage) => stage.id));
    for (const stage of workflowStageDefinitions) {
      expect(stage.screenRoute).toBeTruthy();
      if (stage.executionKind.startsWith("provider_")) expect((stage as WorkflowStageDefinition).requiredCapability).toBeTruthy();
      for (const dependency of stage.dependsOn) expect(ids.has(dependency)).toBe(true);
      for (const invalidated of stage.invalidates) expect(ids.has(invalidated)).toBe(true);
    }
  });

  it("declares the runner that creates each executable stage run", () => {
    const runners = Object.fromEntries(workflowStageDefinitions.map((stage) => [stage.id, stage.runnerId]));
    expect(runners).toMatchObject({
      "reference-segmentation": "reference-segmentation-9router",
      "competitor-dna": "competitor-dna-9router",
      "opportunity-map": "opportunity-map-9router",
      "idea-lab": "idea-lab-9router",
      "research-source-intake": "research-source-intake-manual",
      "claim-map": "claim-map-9router",
      outline: "outline-9router",
      "visual-routing": "visual-routing-local",
      "prompt-preparation": "prompt-preparation-9router",
      "asset-acquisition": "asset-acquisition-9router",
      "asset-review": "asset-review-user-action",
      "voice-generation": "edge-tts",
      "subtitle-preparation": "subtitle-preparation-local",
      "timeline-assembly": "timeline-assembly-local",
      "preview-render": "ffmpeg-preview",
      "packaging-export": "packaging-export-local"
    });
  });

  it("has no dependency cycles", () => {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const byId = new Map<string, (typeof workflowStageDefinitions)[number]>(workflowStageDefinitions.map((stage) => [stage.id, stage]));

    function visit(stageId: string): void {
      expect(visiting.has(stageId)).toBe(false);
      if (visited.has(stageId)) return;
      visiting.add(stageId);
      for (const dependency of byId.get(stageId)?.dependsOn ?? []) visit(dependency);
      visiting.delete(stageId);
      visited.add(stageId);
    }

    for (const stage of workflowStageDefinitions) visit(stage.id);
    expect(visited.size).toBe(workflowStageDefinitions.length);
  });
});
