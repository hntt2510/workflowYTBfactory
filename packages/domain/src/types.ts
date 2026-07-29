export type VideoFormat = "long" | "short";
export type WorkflowMode = "guided" | "semi_automatic" | "full_automatic";

export type StageStatus = "not_started" | "running" | "needs_review" | "approved" | "failed" | "stale";

export interface ProjectSetup {
  projectName: string;
  targetDuration: string;
  language: string;
  workflowMode: WorkflowMode;
}

export interface CompetitorReference {
  id: string;
  sourceUrl?: string;
  pastedTranscript: string;
  notes?: string;
  createdAt: string;
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
  promptVersionId?: string;
  approvedAssetId?: string;
}

export interface PipelineStage {
  id: string;
  name: string;
  status: StageStatus;
  dependsOn: string[];
}

export interface TimelineItem {
  id: string;
  track: "primary_visual" | "overlay_visual" | "narration" | "music" | "sfx" | "subtitles" | "text" | "markers";
  sourceId: string;
  startFrame: number;
  durationFrames: number;
  fps: number;
}

export interface Timeline {
  fps: number;
  items: TimelineItem[];
}

export interface FactoryProject {
  id: string;
  topic: string;
  format: VideoFormat;
  targetLanguage: string;
  setup: ProjectSetup;
  profileId: string;
  routeDecision: ChannelRouteDecision;
  stages: PipelineStage[];
  ideas: IdeaCandidate[];
  approvedIdeaId?: string;
  claims: Claim[];
  competitorReferences: CompetitorReference[];
  scriptSections: ScriptSection[];
  scenes: Scene[];
  shots: Shot[];
  timeline: Timeline;
}
