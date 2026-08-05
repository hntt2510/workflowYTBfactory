import { describe, expect, it } from "vitest";
import { getDownstreamWorkflowStageIds, getWorkflowStageImpactIds, perReferenceArtifactStages, workflowStageDefinitions } from "../src";
import type { WorkflowStageDefinition } from "../src";

describe("workflow registry", () => {
  it("keeps the canonical 30-stage order stable", () => {
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
      "character-preparation",
      "visual-routing",
      "asset-concepts",
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

  it("declares only canonical per-reference artifact stages", () => {
    const ids = new Set<string>(workflowStageDefinitions.map((stage) => stage.id));
    expect([...perReferenceArtifactStages]).toEqual(["transcript-cleaning", "reference-segmentation", "competitor-dna"]);
    for (const stageId of perReferenceArtifactStages) expect(ids.has(stageId)).toBe(true);
  });

  it("invalidates the downstream visual-production chain from scene and shot planning", () => {
    const byId = new Map(workflowStageDefinitions.map((stage) => [stage.id, stage]));
    expect(byId.get("scene-plan")?.invalidates).toEqual(["shot-plan"]);
    expect(byId.get("shot-plan")?.invalidates).toEqual(["visual-routing"]);
    expect(byId.get("character-preparation")?.invalidates).toEqual(["asset-concepts"]);
    expect(byId.get("visual-routing")?.invalidates).toEqual(["asset-concepts"]);
    expect(byId.get("asset-concepts")?.invalidates).toEqual(["prompt-preparation"]);
    expect(byId.get("prompt-preparation")?.invalidates).toEqual(["asset-acquisition"]);
    expect(byId.get("asset-acquisition")?.invalidates).toEqual(["asset-review"]);
    expect(byId.get("asset-review")?.invalidates).toEqual(["voice-generation"]);
  });

  it("collects transitive downstream invalidations for stage approvals", () => {
    expect([...getDownstreamWorkflowStageIds("scene-plan")]).toEqual([
      "shot-plan",
      "visual-routing",
      "asset-concepts",
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

  it("includes the changed stage in its trusted impact set", () => {
    expect([...getWorkflowStageImpactIds("reference-validation")]).toContain("reference-validation");
    expect([...getWorkflowStageImpactIds("reference-validation")]).toContain("transcript-cleaning");
  });

  it("collects QA downstream invalidations through packaging export", () => {
    expect([...getDownstreamWorkflowStageIds("qa")]).toEqual([
      "capcut-draft",
      "packaging-export"
    ]);
  });

  it("collects preview downstream invalidations through packaging export", () => {
    expect([...getDownstreamWorkflowStageIds("preview-render")]).toEqual([
      "qa",
      "capcut-draft",
      "packaging-export"
    ]);
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
