import { describe, expect, it } from "vitest";
import { createFixtureProject, resolveStageEligibilities } from "../src";

describe("workflow eligibility", () => {
  it("blocks reference validation until a reference is included", () => {
    const project = createFixtureProject({ topic: "Topic", format: "long", targetLanguage: "English" });
    const validation = resolveStageEligibilities(project).find((stage) => stage.stageId === "reference-validation");
    expect(validation?.status).toBe("blocked");
    expect(validation?.blockingReasons[0]?.code).toBe("NO_INCLUDED_REFERENCES");
  });

  it("makes reference validation ready after draft reference intake", () => {
    const project = createFixtureProject({
      topic: "Topic",
      format: "long",
      targetLanguage: "English",
      competitorReference: { pastedTranscript: "This transcript is long enough to be locally validated." }
    });
    const validation = resolveStageEligibilities(project).find((stage) => stage.stageId === "reference-validation");
    expect(validation?.status).toBe("ready");
    expect(validation?.runnable).toBe(true);
  });

  it("blocks transcript cleaning until the reference set is approved", () => {
    const project = createFixtureProject({
      topic: "Topic",
      format: "long",
      targetLanguage: "English",
      competitorReference: { pastedTranscript: "This transcript is long enough to be locally validated." }
    });
    const transcriptCleaning = resolveStageEligibilities(project, { textVerified: true }).find((stage) => stage.stageId === "transcript-cleaning");
    expect(transcriptCleaning?.status).toBe("blocked");
    expect(transcriptCleaning?.blockingReasons.map((reason) => reason.code)).toContain("DEPENDENCY_NOT_APPROVED");
  });

  it("blocks provider text stages when text capability is not verified", () => {
    const project = createFixtureProject({
      topic: "Topic",
      format: "long",
      targetLanguage: "English",
      competitorReference: { pastedTranscript: "This transcript is long enough to be locally validated." }
    });
    const approvedProject = {
      ...project,
      referenceSet: { status: "approved" as const },
      stages: project.stages.map((stage) => stage.id === "reference-validation" ? { ...stage, status: "approved" as const } : stage)
    };
    const transcriptCleaning = resolveStageEligibilities(approvedProject).find((stage) => stage.stageId === "transcript-cleaning");
    expect(transcriptCleaning?.status).toBe("blocked");
    expect(transcriptCleaning?.blockingReasons[0]?.code).toBe("TEXT_MODEL_NOT_VERIFIED");
  });

  it("accepts an available local OmniVoice capability for voice generation", () => {
    const project = createFixtureProject({ topic: "Topic", format: "long", targetLanguage: "English" });
    const readyForVoice = {
      ...project,
      stages: project.stages.map((stage, index) => index < 21 ? { ...stage, status: "approved" as const } : stage)
    };
    const blocked = resolveStageEligibilities(readyForVoice).find((stage) => stage.stageId === "voice-generation");
    const available = resolveStageEligibilities(readyForVoice, { localAudioAvailable: true }).find((stage) => stage.stageId === "voice-generation");
    expect(blocked?.blockingReasons[0]?.code).toBe("AUDIO_MODEL_NOT_VERIFIED");
    expect(available?.status).toBe("ready");
    expect(available?.runnable).toBe(true);
  });

  it("does not allow a needs-review stage to run", () => {
    const project = createFixtureProject({ topic: "Topic", format: "long", targetLanguage: "English" });
    const reviewProject = {
      ...project,
      stages: project.stages.map((stage) => stage.id === "reference-validation" ? { ...stage, status: "needs_review" as const } : stage)
    };
    const validation = resolveStageEligibilities(reviewProject).find((stage) => stage.stageId === "reference-validation");
    expect(validation?.runnable).toBe(false);
    expect(validation?.reviewable).toBe(true);
    expect(validation?.approvable).toBe(true);
  });
});
