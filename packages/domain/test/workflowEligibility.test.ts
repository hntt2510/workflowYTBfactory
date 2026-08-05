import { describe, expect, it } from "vitest";
import { createFixtureProject as createDomainFixtureProject, normalizeProjectStages, resolveStageEligibilities } from "../src";

function createFixtureProject(input: Parameters<typeof createDomainFixtureProject>[0]) {
  return createDomainFixtureProject({ ...input, visualWorkflow: input.visualWorkflow ?? "legacy" });
}

function approveStages<T extends { stages: Array<{ id: string; status: string }> }>(project: T, stageIds: string[]): T {
  const approved = new Set(stageIds);
  return { ...project, stages: project.stages.map((stage) => approved.has(stage.id) ? { ...stage, status: "approved" } : stage) };
}

describe("workflow eligibility", () => {
  it("backfills restored research stages for legacy projects with approved downstream content", () => {
    const project = createFixtureProject({ topic: "Legacy project", format: "short", targetLanguage: "Vietnamese" });
    const legacyStages = project.stages
      .filter((stage) => !["research-source-intake", "claim-map"].includes(stage.id))
      .map((stage) => stage.id === "outline" ? { ...stage, status: "approved" as const } : stage);

    const normalized = normalizeProjectStages(legacyStages);

    expect(normalized.find((stage) => stage.id === "research-source-intake")?.status).toBe("approved");
    expect(normalized.find((stage) => stage.id === "claim-map")?.status).toBe("approved");
  });

  it("does not backfill restored research stages before legacy content reaches Outline", () => {
    const project = createFixtureProject({ topic: "Legacy draft", format: "short", targetLanguage: "Vietnamese" });
    const legacyStages = project.stages.filter((stage) => !["research-source-intake", "claim-map"].includes(stage.id));

    const normalized = normalizeProjectStages(legacyStages);

    expect(normalized.find((stage) => stage.id === "research-source-intake")?.status).toBe("not_started");
    expect(normalized.find((stage) => stage.id === "claim-map")?.status).toBe("not_started");
  });

  it("allows Topic Mode to approve ideas without Opportunity Map", () => {
    const project = createFixtureProject({ topic: "Topic", format: "short", targetLanguage: "Vietnamese", inputMode: "topic" });
    const ideaReviewProject = {
      ...project,
      stages: project.stages.map((stage) => stage.id === "idea-lab" ? { ...stage, status: "needs_review" as const } : stage)
    };
    const ideaLab = resolveStageEligibilities(ideaReviewProject, { textVerified: true }).find((stage) => stage.stageId === "idea-lab");
    expect(ideaLab?.approvable).toBe(true);
    expect(ideaLab?.blockingReasons).toEqual([]);

    const ideaApprovedProject = {
      ...ideaReviewProject,
      stages: ideaReviewProject.stages.map((stage) => stage.id === "idea-lab" ? { ...stage, status: "approved" as const } : stage)
    };
    expect(resolveStageEligibilities(ideaApprovedProject, { textVerified: true }).find((stage) => stage.stageId === "originality-review")?.status).toBe("ready");
  });

  it("allows Existing Script preparation to bypass research and claim stages", () => {
    const project = createFixtureProject({
      topic: "Existing script",
      format: "short",
      targetLanguage: "Vietnamese",
      inputMode: "existing_script",
      sourceScript: "A prepared script section."
    });
    const prepared = {
      ...project,
      stages: project.stages.map((stage) => ["outline", "script"].includes(stage.id) ? { ...stage, status: "approved" as const } : stage)
    };
    expect(resolveStageEligibilities(prepared).find((stage) => stage.stageId === "outline")?.status).toBe("approved");
    expect(resolveStageEligibilities(prepared).find((stage) => stage.stageId === "fact-review")?.status).toBe("ready");
  });

  it("allows Topic Mode to continue from Originality Review to Outline without research or Claim Map", () => {
    const project = createFixtureProject({ topic: "Topic", format: "short", targetLanguage: "Vietnamese", inputMode: "topic" });
    const prepared = {
      ...project,
      stages: project.stages.map((stage) => ["idea-lab", "originality-review", "outline"].includes(stage.id)
        ? { ...stage, status: "approved" as const }
        : stage)
    };
    const eligibilities = resolveStageEligibilities(prepared, { textVerified: true });
    expect(eligibilities.find((stage) => stage.stageId === "outline")?.status).toBe("approved");
    expect(eligibilities.find((stage) => stage.stageId === "script")?.status).toBe("ready");
  });

  it("keeps Opportunity Map required for Reference Mode Idea Lab", () => {
    const project = createFixtureProject({
      topic: "Topic",
      format: "short",
      targetLanguage: "Vietnamese",
      inputMode: "reference",
      competitorReference: { pastedTranscript: "This transcript is long enough to be locally validated." }
    });
    const ideaReviewProject = {
      ...project,
      stages: project.stages.map((stage) => stage.id === "idea-lab" ? { ...stage, status: "needs_review" as const } : stage)
    };
    const ideaLab = resolveStageEligibilities(ideaReviewProject, { textVerified: true }).find((stage) => stage.stageId === "idea-lab");
    expect(ideaLab?.approvable).toBe(false);
    expect(ideaLab?.blockingReasons.map((reason) => reason.code)).toContain("DEPENDENCY_NOT_APPROVED");
  });

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
    const readyForVoice = { ...approveStages(project, ["project-setup", "reference-intake", "reference-validation", "transcript-cleaning", "reference-segmentation", "competitor-dna", "opportunity-map", "idea-lab", "originality-review", "research-source-intake", "claim-map", "outline", "script", "fact-review", "retention-review", "scene-plan", "shot-plan", "visual-routing", "prompt-preparation", "asset-acquisition", "asset-review"]), referenceSet: { status: "approved" as const } };
    const blocked = resolveStageEligibilities(readyForVoice).find((stage) => stage.stageId === "voice-generation");
    const available = resolveStageEligibilities(readyForVoice, { localAudioAvailable: true }).find((stage) => stage.stageId === "voice-generation");
    expect(blocked?.blockingReasons[0]?.code).toBe("AUDIO_MODEL_NOT_VERIFIED");
    expect(available?.status).toBe("ready");
    expect(available?.runnable).toBe(true);
  });

  it("blocks image provider stages until image capability is verified", () => {
    const project = createFixtureProject({ topic: "Topic", format: "long", targetLanguage: "English" });
    const readyForAssets = { ...approveStages(project, ["project-setup", "reference-intake", "reference-validation", "transcript-cleaning", "reference-segmentation", "competitor-dna", "opportunity-map", "idea-lab", "originality-review", "research-source-intake", "claim-map", "outline", "script", "fact-review", "retention-review", "scene-plan", "shot-plan", "visual-routing", "prompt-preparation"]), referenceSet: { status: "approved" as const } };
    const blocked = resolveStageEligibilities(readyForAssets, { textVerified: true }).find((stage) => stage.stageId === "asset-acquisition");
    const available = resolveStageEligibilities(readyForAssets, { textVerified: true, imageVerified: true }).find((stage) => stage.stageId === "asset-acquisition");
    expect(blocked?.status).toBe("blocked");
    expect(blocked?.blockingReasons[0]?.code).toBe("IMAGE_MODEL_NOT_VERIFIED");
    expect(available?.status).toBe("ready");
    expect(available?.runnable).toBe(true);
  });

  it("does not require image certification for character-first manual asset intake", () => {
    const project = createDomainFixtureProject({
      topic: "Manual GG Lab assets",
      format: "short",
      targetLanguage: "Vietnamese",
      visualWorkflow: "character_first",
      characterVersionId: "character-v1"
    });
    const readyForManualIntake = approveStages(project, [
      "project-setup", "reference-intake", "outline", "script", "fact-review", "retention-review",
      "scene-plan", "shot-plan", "character-preparation",
      "visual-routing", "asset-concepts", "prompt-preparation"
    ]);
    const eligibility = resolveStageEligibilities(readyForManualIntake, { textVerified: false, imageVerified: false })
      .find((stage) => stage.stageId === "asset-acquisition");
    expect(eligibility?.status).toBe("ready");
    expect(eligibility?.runnable).toBe(true);
    expect(eligibility?.blockingReasons).toEqual([]);
  });

  it("blocks character-first visual stages until an approved character is bound", () => {
    const project = createDomainFixtureProject({
      topic: "Character-first",
      format: "short",
      targetLanguage: "Vietnamese",
      visualWorkflow: "character_first",
      characterVersionId: "character-v1"
    });
    const prepared = {
      ...approveStages(project, ["project-setup", "reference-intake", "shot-plan"]),
      setup: { ...project.setup, characterVersionId: "character-v1" }
    };
    const blocked = resolveStageEligibilities(prepared, { textVerified: true, imageVerified: true });
    expect(blocked.find((stage) => stage.stageId === "visual-routing")?.blockingReasons[0]?.code).toBe("CHARACTER_VERSION_NOT_APPROVED");

    const approved = approveStages(prepared, ["character-preparation"]);
    expect(resolveStageEligibilities(approved, { textVerified: true }).find((stage) => stage.stageId === "visual-routing")?.blockingReasons.map((reason) => reason.code)).not.toContain("CHARACTER_VERSION_NOT_APPROVED");
  });

  it("allows combined provider capabilities to unlock downstream provider stages together", () => {
    const assetProject = createFixtureProject({ topic: "Topic", format: "long", targetLanguage: "English" });
    const readyForAssets = { ...approveStages(assetProject, ["project-setup", "reference-intake", "reference-validation", "transcript-cleaning", "reference-segmentation", "competitor-dna", "opportunity-map", "idea-lab", "originality-review", "research-source-intake", "claim-map", "outline", "script", "fact-review", "retention-review", "scene-plan", "shot-plan", "visual-routing", "prompt-preparation"]), referenceSet: { status: "approved" as const } };
    const assetEligibility = resolveStageEligibilities(readyForAssets, { textVerified: true, imageVerified: true, localAudioAvailable: true });
    expect(assetEligibility.find((stage) => stage.stageId === "asset-acquisition")?.status).toBe("ready");

    const voiceProject = createFixtureProject({ topic: "Topic", format: "long", targetLanguage: "English" });
    const readyForVoice = { ...approveStages(voiceProject, ["project-setup", "reference-intake", "reference-validation", "transcript-cleaning", "reference-segmentation", "competitor-dna", "opportunity-map", "idea-lab", "originality-review", "research-source-intake", "claim-map", "outline", "script", "fact-review", "retention-review", "scene-plan", "shot-plan", "visual-routing", "prompt-preparation", "asset-acquisition", "asset-review"]), referenceSet: { status: "approved" as const } };
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
