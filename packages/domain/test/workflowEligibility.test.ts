import { describe, expect, it } from "vitest";
import { createFixtureProject, resolveStageEligibilities } from "../src";

describe("workflow eligibility", () => {
  it("blocks reference validation until a reference is included", () => {
    const project = createFixtureProject({ topic: "Topic", format: "long", targetLanguage: "English" });
    const validation = resolveStageEligibilities(project).find((stage) => stage.stageId === "reference-validation");
    expect(validation?.status).toBe("blocked");
    expect(validation?.blockingReasons[0]?.code).toBe("NO_INCLUDED_REFERENCES");
  });

  it("does not block reference validation for an excluded invalid or duplicate reference", () => {
    const project = createFixtureProject({
      topic: "Topic",
      format: "long",
      targetLanguage: "English",
      competitorReference: { pastedTranscript: "This transcript is long enough to be locally validated." }
    });
    const withExcludedDuplicate = {
      ...project,
      competitorReferences: project.competitorReferences.map((reference) => ({ ...reference, included: false, status: "duplicate" as const }))
    };
    const validation = resolveStageEligibilities(withExcludedDuplicate).find((stage) => stage.stageId === "reference-validation");
    expect(validation?.blockingReasons.map((reason) => reason.code)).not.toContain("UNRESOLVED_DUPLICATES");
  });

  it("blocks an included invalid reference with an actionable reason", () => {
    const project = createFixtureProject({
      topic: "Topic",
      format: "long",
      targetLanguage: "English",
      competitorReference: { pastedTranscript: "This transcript is long enough to be locally validated." }
    });
    const withInvalid = {
      ...project,
      competitorReferences: project.competitorReferences.map((reference) => ({ ...reference, status: "invalid" as const }))
    };
    const validation = resolveStageEligibilities(withInvalid).find((stage) => stage.stageId === "reference-validation");
    expect(validation?.blockingReasons.map((reason) => reason.code)).toContain("INVALID_INCLUDED_REFERENCES");
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
      referenceSet: { status: "approved" as const },
      stages: project.stages.map((stage, index) => index < 21 ? { ...stage, status: "approved" as const } : stage)
    };
    const blocked = resolveStageEligibilities(readyForVoice).find((stage) => stage.stageId === "voice-generation");
    const available = resolveStageEligibilities(readyForVoice, { localAudioAvailable: true }).find((stage) => stage.stageId === "voice-generation");
    expect(blocked?.blockingReasons[0]?.code).toBe("AUDIO_MODEL_NOT_VERIFIED");
    expect(available?.status).toBe("ready");
    expect(available?.runnable).toBe(true);
  });

  it("blocks image provider stages until image capability is verified", () => {
    const project = createFixtureProject({ topic: "Topic", format: "long", targetLanguage: "English" });
    const readyForAssets = {
      ...project,
      referenceSet: { status: "approved" as const },
      stages: project.stages.map((stage, index) => index < 19 ? { ...stage, status: "approved" as const } : stage)
    };
    const blocked = resolveStageEligibilities(readyForAssets, { textVerified: true }).find((stage) => stage.stageId === "asset-acquisition");
    const available = resolveStageEligibilities(readyForAssets, { textVerified: true, imageVerified: true }).find((stage) => stage.stageId === "asset-acquisition");
    expect(blocked?.status).toBe("blocked");
    expect(blocked?.blockingReasons[0]?.code).toBe("IMAGE_MODEL_NOT_VERIFIED");
    expect(available?.status).toBe("ready");
    expect(available?.runnable).toBe(true);
  });

  it("allows combined provider capabilities to unlock downstream provider stages together", () => {
    const assetProject = createFixtureProject({ topic: "Topic", format: "long", targetLanguage: "English" });
    const readyForAssets = {
      ...assetProject,
      referenceSet: { status: "approved" as const },
      stages: assetProject.stages.map((stage, index) => index < 19 ? { ...stage, status: "approved" as const } : stage)
    };
    const assetEligibility = resolveStageEligibilities(readyForAssets, { textVerified: true, imageVerified: true, localAudioAvailable: true });
    expect(assetEligibility.find((stage) => stage.stageId === "asset-acquisition")?.status).toBe("ready");

    const voiceProject = createFixtureProject({ topic: "Topic", format: "long", targetLanguage: "English" });
    const readyForVoice = {
      ...voiceProject,
      referenceSet: { status: "approved" as const },
      stages: voiceProject.stages.map((stage, index) => index < 21 ? { ...stage, status: "approved" as const } : stage)
    };
    const voiceEligibility = resolveStageEligibilities(readyForVoice, { textVerified: true, imageVerified: true, localAudioAvailable: true });
    expect(voiceEligibility.find((stage) => stage.stageId === "voice-generation")?.status).toBe("ready");
  });

  it("does not allow a needs-review stage to run", () => {
    const project = createFixtureProject({
      topic: "Topic",
      format: "long",
      targetLanguage: "English",
      competitorReference: { pastedTranscript: "This transcript is long enough to be locally validated." }
    });
    const reviewProject = {
      ...project,
      stages: project.stages.map((stage) => stage.id === "reference-validation" ? { ...stage, status: "needs_review" as const } : stage)
    };
    const validation = resolveStageEligibilities(reviewProject).find((stage) => stage.stageId === "reference-validation");
    expect(validation?.runnable).toBe(false);
    expect(validation?.reviewable).toBe(true);
    expect(validation?.approvable).toBe(true);
  });

  it("allows rejected stages to be rerun without approving downstream dependencies", () => {
    const project = createFixtureProject({
      topic: "Topic",
      format: "long",
      targetLanguage: "English",
      competitorReference: { pastedTranscript: "This transcript is long enough to be locally validated." }
    });
    const rejectedProject = {
      ...project,
      stages: project.stages.map((stage) => stage.id === "reference-validation" ? { ...stage, status: "rejected" as const } : stage)
    };
    const eligibilities = resolveStageEligibilities(rejectedProject);
    const validation = eligibilities.find((stage) => stage.stageId === "reference-validation");
    const transcriptCleaning = eligibilities.find((stage) => stage.stageId === "transcript-cleaning");
    expect(validation?.status).toBe("rejected");
    expect(validation?.runnable).toBe(true);
    expect(transcriptCleaning?.status).toBe("blocked");
    expect(transcriptCleaning?.blockingReasons.map((reason) => reason.code)).toContain("DEPENDENCY_NOT_APPROVED");
  });

  it.each(["rejected", "failed", "stale"] as const)("blocks %s reruns when their upstream dependency is no longer approved", (terminalStatus) => {
    const project = createFixtureProject({
      topic: "Topic",
      format: "long",
      targetLanguage: "English",
      competitorReference: { pastedTranscript: "This transcript is long enough to be locally validated." }
    });
    const rejectedProject = {
      ...project,
      referenceSet: { status: "approved" as const },
      stages: project.stages.map((stage) => {
        if (stage.id === "reference-validation") return { ...stage, status: "approved" as const };
        if (stage.id === "reference-segmentation") return { ...stage, status: terminalStatus };
        return stage;
      })
    };
    const segmentation = resolveStageEligibilities(rejectedProject, { textVerified: true }).find((stage) => stage.stageId === "reference-segmentation");
    expect(segmentation?.status).toBe(terminalStatus);
    expect(segmentation?.runnable).toBe(false);
    expect(segmentation?.blockingReasons.map((reason) => reason.code)).toContain("DEPENDENCY_NOT_APPROVED");
  });

  it("keeps transcript cleaning blocked after reference set rejection", () => {
    const project = createFixtureProject({
      topic: "Topic",
      format: "long",
      targetLanguage: "English",
      competitorReference: { pastedTranscript: "This transcript is long enough to be locally validated." }
    });
    const rejectedProject = {
      ...project,
      referenceSet: { status: "rejected" as const },
      stages: project.stages.map((stage) => stage.id === "reference-validation" ? { ...stage, status: "rejected" as const } : stage)
    };
    const transcriptCleaning = resolveStageEligibilities(rejectedProject, { textVerified: true }).find((stage) => stage.stageId === "transcript-cleaning");
    expect(transcriptCleaning?.status).toBe("blocked");
    expect(transcriptCleaning?.blockingReasons.map((reason) => reason.code)).toContain("REFERENCE_SET_NOT_APPROVED");
  });

  it("blocks a stage when an indirect dependency is no longer approved", () => {
    const project = createFixtureProject({ topic: "Topic", format: "long", targetLanguage: "English" });
    const inconsistentProject = {
      ...project,
      stages: project.stages.map((stage) => {
        if (stage.id === "script") return { ...stage, status: "stale" as const };
        if (stage.id === "fact-review") return { ...stage, status: "approved" as const };
        return stage;
      })
    };
    const retentionReview = resolveStageEligibilities(inconsistentProject, { textVerified: true }).find((stage) => stage.stageId === "retention-review");
    expect(retentionReview?.status).toBe("blocked");
    expect(retentionReview?.runnable).toBe(false);
    expect(retentionReview?.blockingReasons.map((reason) => reason.code)).toContain("DEPENDENCY_CHAIN_NOT_APPROVED");
  });

  it("blocks downstream stages when an ancestor requires a stale reference set", () => {
    const project = createFixtureProject({ topic: "Topic", format: "long", targetLanguage: "English" });
    const inconsistentProject = {
      ...project,
      referenceSet: { status: "stale" as const },
      stages: project.stages.map((stage) => {
        if (["reference-validation", "transcript-cleaning", "reference-segmentation", "competitor-dna"].includes(stage.id)) {
          return { ...stage, status: "approved" as const };
        }
        return stage;
      })
    };
    const opportunityMap = resolveStageEligibilities(inconsistentProject, { textVerified: true }).find((stage) => stage.stageId === "opportunity-map");
    expect(opportunityMap?.status).toBe("blocked");
    expect(opportunityMap?.runnable).toBe(false);
    expect(opportunityMap?.blockingReasons.map((reason) => reason.code)).toContain("DEPENDENCY_CHAIN_NOT_APPROVED");
  });

  it("does not report an approved stage as approved when its reference set becomes stale", () => {
    const project = createFixtureProject({ topic: "Topic", format: "long", targetLanguage: "English" });
    const inconsistentProject = {
      ...project,
      referenceSet: { status: "stale" as const },
      stages: project.stages.map((stage) => {
        if (stage.id === "reference-validation" || stage.id === "transcript-cleaning") {
          return { ...stage, status: "approved" as const };
        }
        return stage;
      })
    };
    const transcriptCleaning = resolveStageEligibilities(inconsistentProject, { textVerified: true }).find((stage) => stage.stageId === "transcript-cleaning");
    expect(transcriptCleaning?.status).toBe("blocked");
    expect(transcriptCleaning?.blockingReasons.map((reason) => reason.code)).toContain("REFERENCE_SET_NOT_APPROVED");
  });

  it("does not allow approval of a needs-review stage when its upstream dependency becomes stale", () => {
    const project = createFixtureProject({ topic: "Topic", format: "long", targetLanguage: "English" });
    const inconsistentProject = {
      ...project,
      stages: project.stages.map((stage) => {
        if (stage.id === "script") return { ...stage, status: "stale" as const };
        if (stage.id === "fact-review") return { ...stage, status: "needs_review" as const };
        return stage;
      })
    };
    const factReview = resolveStageEligibilities(inconsistentProject, { textVerified: true }).find((stage) => stage.stageId === "fact-review");
    expect(factReview?.status).toBe("needs_review");
    expect(factReview?.reviewable).toBe(true);
    expect(factReview?.approvable).toBe(false);
    expect(factReview?.blockingReasons.map((reason) => reason.code)).toContain("DEPENDENCY_NOT_APPROVED");
  });

  it("blocks QA when preview render becomes stale", () => {
    const project = createFixtureProject({ topic: "Topic", format: "long", targetLanguage: "English" });
    const inconsistentProject = {
      ...project,
      referenceSet: { status: "approved" as const },
      stages: project.stages.map((stage) => {
        if (stage.id === "preview-render") return { ...stage, status: "stale" as const };
        if (stage.id === "qa") return { ...stage, status: "blocked" as const };
        if (["reference-validation", "transcript-cleaning", "reference-segmentation", "competitor-dna", "opportunity-map", "idea-lab", "originality-review", "research-source-intake", "claim-map", "outline", "script", "fact-review", "retention-review", "scene-plan", "shot-plan", "visual-routing", "prompt-preparation", "asset-acquisition", "asset-review", "voice-generation", "subtitle-preparation", "timeline-assembly"].includes(stage.id)) {
          return { ...stage, status: "approved" as const };
        }
        return stage;
      })
    };
    const qa = resolveStageEligibilities(inconsistentProject, { textVerified: true, imageVerified: true, localAudioAvailable: true }).find((stage) => stage.stageId === "qa");
    expect(qa?.status).toBe("blocked");
    expect(qa?.blockingReasons.map((reason) => reason.code)).toContain("DEPENDENCY_NOT_APPROVED");
  });

  it("keeps preview render blocked until timeline assembly is approved", () => {
    const project = createFixtureProject({ topic: "Topic", format: "long", targetLanguage: "English" });
    const previewBlockedProject = {
      ...project,
      referenceSet: { status: "approved" as const },
      stages: project.stages.map((stage) => {
        if (stage.id === "timeline-assembly") return { ...stage, status: "needs_review" as const };
        if (stage.id === "preview-render") return { ...stage, status: "blocked" as const };
        if (["project-setup", "reference-intake", "reference-validation", "transcript-cleaning", "reference-segmentation", "competitor-dna", "opportunity-map", "idea-lab", "originality-review", "research-source-intake", "claim-map", "outline", "script", "fact-review", "retention-review", "scene-plan", "shot-plan", "visual-routing", "prompt-preparation", "asset-acquisition", "asset-review", "voice-generation", "subtitle-preparation"].includes(stage.id)) {
          return { ...stage, status: "approved" as const };
        }
        return stage;
      })
    };
    const preview = resolveStageEligibilities(previewBlockedProject, { textVerified: true, imageVerified: true, localAudioAvailable: true }).find((stage) => stage.stageId === "preview-render");
    expect(preview?.status).toBe("blocked");
    expect(preview?.blockingReasons.map((reason) => reason.code)).toContain("DEPENDENCY_NOT_APPROVED");

    const previewReadyProject = {
      ...previewBlockedProject,
      stages: previewBlockedProject.stages.map((stage) => stage.id === "timeline-assembly" ? { ...stage, status: "approved" as const } : stage)
    };
    expect(resolveStageEligibilities(previewReadyProject, { textVerified: true, imageVerified: true, localAudioAvailable: true }).find((stage) => stage.stageId === "preview-render")?.status).toBe("ready");
  });

  it("keeps QA blocked until preview render is approved and keeps CapCut Draft blocked until QA is approved", () => {
    const project = createFixtureProject({ topic: "Topic", format: "long", targetLanguage: "English" });
    const upstreamStageIds = new Set([
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
      "timeline-assembly"
    ]);
    const previewBlockedProject = {
      ...project,
      referenceSet: { status: "approved" as const },
      stages: project.stages.map((stage) => {
        if (stage.id === "preview-render") return { ...stage, status: "needs_review" as const };
        if (stage.id === "qa" || stage.id === "capcut-draft") return { ...stage, status: "not_started" as const };
        if (upstreamStageIds.has(stage.id)) return { ...stage, status: "approved" as const };
        return stage;
      })
    };
    const blocked = resolveStageEligibilities(previewBlockedProject).find((stage) => stage.stageId === "qa");
    expect(blocked?.status).toBe("blocked");
    expect(blocked?.blockingReasons.map((reason) => reason.code)).toContain("DEPENDENCY_NOT_APPROVED");

    const previewApprovedProject = {
      ...previewBlockedProject,
      stages: previewBlockedProject.stages.map((stage) => stage.id === "preview-render" ? { ...stage, status: "approved" as const } : stage)
    };
    const eligibilities = resolveStageEligibilities(previewApprovedProject);
    const qa = eligibilities.find((stage) => stage.stageId === "qa");
    const capcutDraft = eligibilities.find((stage) => stage.stageId === "capcut-draft");
    expect(qa?.status).toBe("ready");
    expect(qa?.runnable).toBe(true);
    expect(capcutDraft?.status).toBe("blocked");
    expect(capcutDraft?.blockingReasons.map((reason) => reason.code)).toContain("DEPENDENCY_NOT_APPROVED");

    const qaApprovedProject = {
      ...previewApprovedProject,
      stages: previewApprovedProject.stages.map((stage) => {
        if (stage.id === "qa") return { ...stage, status: "approved" as const };
        return stage;
      })
    };
    const qaApprovedEligibilities = resolveStageEligibilities(qaApprovedProject);
    expect(qaApprovedEligibilities.find((stage) => stage.stageId === "capcut-draft")?.status).toBe("ready");
  });
});
