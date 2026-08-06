import { describe, expect, it } from "vitest";
import { assertWorkflowStageTransition, canTransitionWorkflowStage } from "../src";

describe("workflow stage transitions", () => {
  it("permits only review-gated run transitions", () => {
    expect(canTransitionWorkflowStage("not_started", "queued")).toBe(true);
    expect(canTransitionWorkflowStage("queued", "running")).toBe(true);
    expect(canTransitionWorkflowStage("running", "needs_review")).toBe(true);
    expect(canTransitionWorkflowStage("running", "needs_attention")).toBe(true);
    expect(canTransitionWorkflowStage("needs_review", "approved")).toBe(true);
    expect(canTransitionWorkflowStage("approved", "stale")).toBe(true);
  });

  it("permits reruns after terminal review states only through a new queue", () => {
    expect(canTransitionWorkflowStage("rejected", "queued")).toBe(true);
    expect(canTransitionWorkflowStage("failed", "queued")).toBe(true);
    expect(canTransitionWorkflowStage("stale", "queued")).toBe(true);
    expect(canTransitionWorkflowStage("needs_attention", "queued")).toBe(true);
  });

  it("rejects approval shortcuts", () => {
    expect(() => assertWorkflowStageTransition("running", "approved")).toThrow();
    expect(() => assertWorkflowStageTransition("failed", "approved")).toThrow();
    expect(() => assertWorkflowStageTransition("rejected", "approved")).toThrow();
    expect(() => assertWorkflowStageTransition("stale", "approved")).toThrow();
    expect(() => assertWorkflowStageTransition("rejected", "running")).toThrow();
    expect(() => assertWorkflowStageTransition("failed", "needs_review")).toThrow();
  });
});
