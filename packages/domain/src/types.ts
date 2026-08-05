import type { AssetConcept } from "./assetConcepts";
import type { CharacterVersion } from "./character";
import type { ShotMotionPlan } from "./motion";

export type VideoFormat = "long" | "short";
export type WorkflowMode = "guided" | "semi_automatic" | "full_automatic";
export type ProductionInputMode = "topic" | "existing_script" | "reference";
export type VisualWorkflowMode = "legacy" | "character_first";
export type SubtitlePreset = "vox-clean" | "minimal" | "high-contrast";
export type ProductionStatus =
  | "draft"
  | "preparing"
  | "waiting_for_idea"
  | "generating_media"
  | "needs_scene_review"
  | "generating_voice"
  | "rendering_preview"
  | "needs_final_review"
  | "exporting"
  | "completed"
  | "needs_attention"
  | "failed";

export type WorkflowStageStatus =
  | "not_started"
  | "blocked"
  | "ready"
  | "queued"
  | "running"
  | "needs_review"
  | "needs_attention"
  | "approved"
  | "rejected"
  | "failed"
  | "stale";

export type StageStatus = WorkflowStageStatus;

export type ReferenceStatus = "draft" | "duplicate" | "invalid" | "valid" | "approved" | "rejected" | "stale";

export interface ProjectSetup {
  projectName: string;
  targetDuration: string;
  language: string;
  workflowMode: WorkflowMode;
  visualWorkflow?: VisualWorkflowMode;
  characterVersionId?: string;
  inputMode?: ProductionInputMode;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  visualStyle?: "vox-documentary";
  voiceId?: string;
  outputResolution?: "1080p" | "720p";
  sourceScript?: string;
  referenceUrl?: string;
}

export interface CompetitorReference {
  id: string;
  identityKey?: string;
  sourceUrl?: string;
  pastedTranscript: string;
  notes?: string;
  status?: ReferenceStatus;
  included?: boolean;
  validationMessage?: string;
  validationErrors?: string[];
  validationWarnings?: string[];
  validatedAt?: string;
  validatorVersion?: string;
  contentFingerprint?: string;
  version?: number;
  createdAt: string;
  updatedAt?: string;
  parentReferenceId?: string;
}

export interface ReferenceSetState {
  status: "not_started" | "needs_validation" | "valid" | "approved" | "rejected" | "stale";
  approvedAt?: string;
  approvalActor?: string;
  validationRunAt?: string;
  currentFingerprint?: string;
  includedCount?: number;
  validCount?: number;
  invalidCount?: number;
  duplicateCount?: number;
  draftCount?: number;
  excludedCount?: number;
}

export interface ChannelProfile {
  id: string;
  name: string;
  mainKeyword: string;
  secondaryKeywords: string[];
  niche: string;
  contentType: string;
  targetAudience: string;
  language: string;
  tone: string;
  visualStyle: string;
  imageStyleModel: {
    name: string;
    description: string;
  };
  voiceStyle: string;
  ttsEmotionStyle: string[];
  ttsUsage: string[];
  coreHashtags: string[];
  secondaryHashtags: string[];
  positioning?: string;
  avoidList: string[];
  routerSignals: string[];
  safetyRules: string[];
  characterVersions?: CharacterVersion[];
  activeCharacterVersionId?: string;
}

export interface ChannelRouteInput {
  topic: string;
  description?: string;
  format: VideoFormat;
  targetLanguage: string;
  selectedProfileId?: string;
}

export interface ChannelRouteDecision {
  selectedProfileId: string;
  confidence: number;
  matchedSignals: string[];
  rejectedProfiles: Array<{
    profileId: string;
    score: number;
    reason: string;
  }>;
  requiresUserConfirmation: boolean;
}

export interface IdeaCandidate {
  id: string;
  workingTitle: string;
  angle: string;
  corePromise: string;
  viewerProblem: string;
  dramaticQuestion: string;
  targetEmotion: string;
  trafficModel: "browse" | "suggested" | "search" | "mixed";
  thumbnailConcept: string;
  noveltyExplanation: string;
  noveltyScore: number;
  audienceFitScore: number;
  thumbnailPotentialScore: number;
  researchRisk: "low" | "medium" | "high";
  productionDifficulty: "low" | "medium" | "high";
  estimatedValidationCost?: number;
  repurposePotential: string[];
  whyThisCanWin: string;
}

export type ClaimState =
  | "verified"
  | "needs_qualification"
  | "disputed"
  | "unsupported"
  | "interpretive";

export type ClaimType = "fact" | "estimate" | "opinion" | "interpretation" | "allegation";

export interface Claim {
  id: string;
  text: string;
  type: ClaimType;
  sourceRequirement: "primary" | "secondary" | "either" | "none";
  sourceIds: string[];
  evidenceNote?: string;
  confidence: number;
  qualification?: string;
  state: ClaimState;
  approvalState: "allowed" | "blocked";
}

export interface ScriptSection {
  id: string;
  purpose: string;
  narration: string;
  estimatedWords: number;
  estimatedSeconds: number;
  dramaticFunction: string;
  openLoop?: string;
  linkedClaimIds: string[];
  visualOpportunities: string[];
  proofObjects: string[];
  retentionRisk: "low" | "medium" | "high";
}

export interface Scene {
  id: string;
  scriptSectionId: string;
  narration: string;
  purpose: string;
  startFrame: number;
  durationFrames: number;
  visualMode: Shot["visualMode"];
  proofObject?: string;
  emotionalState: string;
  requiredAssets: string[];
  continuityRefs: string[];
}

export interface Shot {
  id: string;
  sceneId: string;
  order: number;
  startFrame: number;
  durationFrames: number;
  fps: number;
  purpose: string;
  visualMode:
    | "ai_image"
    | "ai_video"
    | "stock_image"
    | "stock_video"
    | "manual_upload"
    | "uploaded"
    | "document"
    | "diagram"
    | "text_card"
    | "reuse";
  framing: string;
  cameraAngle: string;
  cameraMovement: string;
  subjectAction: string;
  startState: Record<string, unknown>;
  endState: Record<string, unknown>;
  continuityRefs: string[];
  semanticBeat?: string | undefined;
  assetConceptIds?: string[] | undefined;
  motion?: ShotMotionPlan | undefined;
  promptVersionId?: string | undefined;
  approvedAssetId?: string | undefined;
}

export interface PipelineStage {
  id: string;
  name: string;
  status: StageStatus;
  dependsOn: string[];
  attention?: StageAttention;
}

export interface StageAttentionAction {
  label: string;
  route?: string;
}

export interface StageAttention {
  code: string;
  message: string;
  phase: string;
  safeReason: string;
  failedItem?: string;
  recommendedAction: string;
  retryAction: string;
  settingsRoute?: string;
  actions: StageAttentionAction[];
}

export type WorkflowExecutionKind =
  | "manual_input"
  | "local_deterministic"
  | "provider_text"
  | "provider_image"
  | "provider_video"
  | "provider_audio"
  | "media_process"
  | "export";

export interface WorkflowStageDefinition {
  id: string;
  name: string;
  order: number;
  screenRoute: string;
  dependsOn: string[];
  requiredInputTypes: string[];
  outputArtifactTypes: string[];
  runnerId: string | null;
  executionKind: WorkflowExecutionKind;
  requiredCapability?: string;
  approvalRequired: boolean;
  invalidates: string[];
}

export interface WorkflowStageRun {
  id: string;
  projectId: string;
  stageId: string;
  status: WorkflowStageStatus;
  runnerId: string;
  runnerVersion: string;
  providerId?: string;
  configuredModelId?: string;
  returnedModelId?: string;
  promptTemplateId?: string;
  promptVersion?: string;
  inputArtifactIds: string[];
  inputFingerprint: string;
  outputArtifactIds: string[];
  payloadJson?: Record<string, unknown>;
  startedAt?: string;
  finishedAt?: string;
  safeErrorCategory?: string;
  safeErrorMessage?: string;
}

export interface WorkflowArtifact {
  id: string;
  projectId: string;
  stageId: string;
  stageRunId?: string;
  type: string;
  version: number;
  status: "draft" | "needs_review" | "needs_attention" | "approved" | "rejected" | "stale";
  payloadJson?: Record<string, unknown>;
  relativeFilePath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StageEligibility {
  stageId: string;
  status: WorkflowStageStatus;
  viewable: boolean;
  runnable: boolean;
  reviewable: boolean;
  approvable: boolean;
  blockingReasons: Array<{
    code: string;
    message: string;
    actionRoute?: string;
    actions?: StageAttentionAction[];
  }>;
}

export interface TimelineItem {
  id: string;
  track: "primary_visual" | "overlay_visual" | "narration" | "music" | "sfx" | "subtitles" | "text" | "markers";
  sourceId: string;
  startFrame: number;
  durationFrames: number;
  fps: number;
  motion?: ShotMotionPlan | undefined;
}

export interface Timeline {
  fps: number;
  items: TimelineItem[];
}

export interface FactoryProject {
  id: string;
  synthetic?: boolean;
  topic: string;
  format: VideoFormat;
  targetLanguage: string;
  setup: ProjectSetup;
  profileId: string;
  routeDecision: ChannelRouteDecision;
  stages: PipelineStage[];
  referenceSet?: ReferenceSetState;
  ideas: IdeaCandidate[];
  approvedIdeaId?: string;
  claims: Claim[];
  competitorReferences: CompetitorReference[];
  scriptSections: ScriptSection[];
  scenes: Scene[];
  shots: Shot[];
  assetConcepts?: AssetConcept[] | undefined;
  timeline: Timeline;
}
