import type { CharacterVersion } from "./character";

export const channelStyleIds = [
  "editorial-explainer",
  "2d-character-animation",
  "cute-daily-life-cartoon",
  "cinematic-documentary",
  "motion-collage",
  "minimal-infographic",
  "meme-short-form-cartoon",
  "custom"
] as const;

export type ChannelStyleId = (typeof channelStyleIds)[number];
export type ChannelCharacterPriority = "primary" | "supporting";
export type ChannelContentType = "explainer" | "documentary" | "story" | "daily-life" | "comedy" | "mystery" | "listicle" | "news-recap" | "tutorial" | "character-adventure" | "emotional-story";

export interface ChannelIdentityDna {
  description: string;
  mainTopic: string;
  secondaryTopics: string[];
  channelPromise: string;
  audience: string;
  language: string;
  tone: string;
  keywords: string[];
  prohibitedTopics: string[];
  formats: Array<"long" | "short">;
  goals: Array<"education" | "entertainment" | "storytelling" | "documentary" | "commercial" | "character-branding">;
}

export interface ChannelContentDirectionDna {
  primary: ChannelContentType;
  secondary: ChannelContentType[];
  contentTypes: ChannelContentType[];
  pillars: string[];
  defaultAngles: string[];
  hookPatterns: string[];
  payoffPatterns: string[];
  evidenceStyle: string;
}

export interface ChannelStyleProductionProfile {
  visualGrammar: string[];
  storytellingGrammar: string[];
  storyboardGrammar: string[];
  promptGrammar: string[];
  frameDensity: { min: number; max: number; label: string };
  referenceStrategy: string[];
  motionGrammar: string[];
  audioTendency: string[];
  recommendedContentTypes: ChannelContentType[];
  unsuitableContentTypes: ChannelContentType[];
  requiredAssets: string[];
}

export interface ChannelVisualStyleDna {
  styleId: ChannelStyleId;
  name: string;
  description: string;
  palette: string[];
  sceneGrammar: string[];
  motionGrammar: string[];
  assetGrammar: string[];
  productionProfile: ChannelStyleProductionProfile;
  customConfig?: {
    referenceImagePaths: string[];
    description: string;
    colors: string[];
    lineArt: string;
    texture: string;
    lighting: string;
    camera: string;
    characterTreatment: string;
    backgroundTreatment: string;
    promptLocks: string[];
  };
}

export interface ChannelCharacterSlot {
  channelId?: string;
  id: string;
  name: string;
  role: string;
  priority: ChannelCharacterPriority;
  species?: string;
  personality?: string;
  relationship?: string;
  usageRules?: string[];
  characterVersionId?: string;
}

export interface ChannelAssetLibraryItem {
  channelId?: string;
  id: string;
  name: string;
  kind: "prop" | "background" | "diagram" | "sound" | "overlay";
  description: string;
  tags: string[];
  category?: "character" | "background" | "location" | "prop" | "foreground" | "icon" | "map" | "texture" | "logo" | "font" | "palette" | "music" | "ambient" | "sfx" | "reference-image";
  approved?: boolean;
  relativeFilePath?: string;
}

export interface ChannelProductionDefaultsDna {
  aspectRatio: "16:9" | "9:16" | "1:1";
  fps: number;
  targetDuration: string;
  visualBeatSeconds: number;
  maxAiImagesPerMinute: number;
  defaultMotion: "none" | "slide_up" | "slide_down" | "pan_left" | "pan_right" | "zoom_in" | "zoom_out" | "pop" | "dissolve";
  subtitlePreset: "vox-clean" | "minimal" | "high-contrast";
  frameDensity?: { min: number; max: number };
  motionIntensity?: "subtle" | "standard" | "strong";
  transitionStyle?: string;
  voiceId?: string;
  musicPath?: string;
  ambientPath?: string;
  sfxPath?: string;
}

export interface ChannelDna {
  version: 1;
  identity: ChannelIdentityDna;
  contentDirection: ChannelContentDirectionDna;
  visualStyle: ChannelVisualStyleDna;
  characters: ChannelCharacterSlot[];
  assets: ChannelAssetLibraryItem[];
  productionDefaults: ChannelProductionDefaultsDna;
  updatedAt: string;
}

export interface ChannelPromptCharacterProfile {
  channelId: string;
  characterId: string;
  characterVersionId?: string;
  name: string;
  role: string;
  priority: ChannelCharacterPriority;
  species?: string;
  personality?: string;
  relationship?: string;
  usageRules: string[];
  referenceIds: string[];
  referenceAuthority: {
    controls: string[];
    doesNotControl: string[];
  };
  continuityLocks: string[];
  forbiddenChanges: string[];
}

export interface ChannelPromptAssetProfile {
  channelId: string;
  assetId: string;
  name: string;
  kind: ChannelAssetLibraryItem["kind"];
  role: string;
  requiredOrOptional: "required" | "optional";
  allowedScenes: string[];
  continuityLocks: string[];
  promptDescription: string;
  referenceFile?: string;
  tags: string[];
}

export type ChannelPromptTaskType = "story" | "director" | "scene_prompt" | "scene_image_generation" | "build";

export interface ChannelPromptProfile {
  channelId: string;
  version: number;
  masterPrompt: string;
  contentIdentity: {
    topic: string;
    niche: string;
    audience: string;
    language: string;
    promise: string;
    contentLane: string;
    pillars: string[];
    preferredAngles: string[];
    tone: string[];
    forbiddenTopics: string[];
  };
  visualIdentity: {
    styleId: ChannelStyleId;
    styleDescription: string;
    palette: string[];
    lineTreatment: string;
    characterTreatment: string;
    backgroundTreatment: string;
    lightingRules: string[];
    compositionRules: string[];
    forbiddenVisualChanges: string[];
  };
  characterRegistry: ChannelPromptCharacterProfile[];
  assetRegistry: ChannelPromptAssetProfile[];
  productionGrammar: {
    storyPattern: string[];
    frameRoles: string[];
    frameDensity: { min: number; max: number };
    preferredMotion: string[];
    preferredTransitions: string[];
    averageVisualBeatSeconds: number;
    motionIntensity: string;
  };
}

export interface ResolvedChannelPromptContext {
  channelId: string;
  projectId?: string;
  sceneId?: string;
  profileVersion: number;
  projectSnapshotVersion: number;
  taskType: ChannelPromptTaskType;
  contentLane: string;
  contentIdentity: ChannelPromptProfile["contentIdentity"];
  visualStyle: string;
  visualIdentity: ChannelPromptProfile["visualIdentity"];
  characters: ChannelPromptCharacterProfile[];
  assets: ChannelPromptAssetProfile[];
  storyPattern: string[];
  productionGrammar: ChannelPromptProfile["productionGrammar"];
  continuityLocks: string[];
  forbiddenChanges: string[];
  source: {
    channelProfile: string;
    projectSnapshot: string;
    scene: string;
  };
}

export type ChannelDnaOverrides = Partial<{
  identity: Partial<ChannelIdentityDna>;
  contentDirection: Partial<ChannelContentDirectionDna>;
  visualStyle: Partial<ChannelVisualStyleDna>;
  characters: ChannelCharacterSlot[];
  assets: ChannelAssetLibraryItem[];
  productionDefaults: Partial<ChannelProductionDefaultsDna>;
}>;

export interface ChannelStylePreset {
  id: ChannelStyleId;
  name: string;
  description: string;
  sceneGrammar: string[];
  contentGrammar: string[];
  motionGrammar: string[];
  defaultPalette: string[];
  defaultPillars: string[];
  productionProfile?: ChannelStyleProductionProfile;
}

export const channelStylePresets: readonly ChannelStylePreset[] = [
  {
    id: "editorial-explainer",
    name: "Editorial Explainer",
    description: "Clear cause-and-effect explanations built around evidence and diagrams.",
    sceneGrammar: ["claim", "evidence", "cause_and_effect", "conclusion"],
    contentGrammar: ["facts", "science", "conservation", "systems"],
    motionGrammar: ["diagram_reveal", "slide_up", "measured_zoom"],
    defaultPalette: ["ink", "paper", "signal_red", "warm_gold"],
    defaultPillars: ["Explain the mechanism", "Show the evidence", "End with a useful takeaway"]
  },
  {
    id: "2d-character-animation",
    name: "2D Character Animation",
    description: "Character-led teaching with expressive poses and simple supporting graphics.",
    sceneGrammar: ["character_setup", "demonstration", "reaction", "lesson_payoff"],
    contentGrammar: ["lessons", "how_to", "character_story", "reaction"],
    motionGrammar: ["pop", "pose_change", "pan_right"],
    defaultPalette: ["cream", "sky", "coral", "charcoal"],
    defaultPillars: ["Teach through a recurring character", "Show one behavior per beat", "Reward attention with a reaction"]
  },
  {
    id: "cute-daily-life-cartoon",
    name: "Cute Daily-Life Cartoon",
    description: "Warm everyday stories that turn a topic into a relatable character moment.",
    sceneGrammar: ["daily_problem", "misunderstanding", "playful_attempt", "reaction_payoff"],
    contentGrammar: ["daily-life", "comedy", "character story", "reaction/payoff"],
    motionGrammar: ["pop", "zoom_in", "dissolve"],
    defaultPalette: ["peach", "mint", "butter", "ink"],
    defaultPillars: ["Start from a relatable moment", "Make the lesson visible through behavior", "Land a warm or funny payoff"]
  },
  {
    id: "cinematic-documentary",
    name: "Cinematic Documentary",
    description: "Atmospheric chronology, stakes, and evidence with restrained cinematic movement.",
    sceneGrammar: ["cold_open", "context", "turning_point", "aftermath"],
    contentGrammar: ["history", "investigation", "human stakes", "timeline"],
    motionGrammar: ["dissolve", "pan_left", "slow_zoom_in"],
    defaultPalette: ["midnight", "stone", "amber", "fog"],
    defaultPillars: ["Establish the stakes", "Reveal context in sequence", "Close on consequences"]
  },
  {
    id: "motion-collage",
    name: "Motion Collage",
    description: "Layered cutouts, screenshots, symbols, and type-safe local overlays for fast ideas.",
    sceneGrammar: ["headline", "layer_stack", "contrast", "rapid_summary"],
    contentGrammar: ["trends", "internet culture", "comparisons", "commentary"],
    motionGrammar: ["slide_up", "slide_down", "pan_left", "pop"],
    defaultPalette: ["black", "white", "electric_blue", "acid_green"],
    defaultPillars: ["Lead with a visual contradiction", "Stack proof objects", "Summarize before the next cut"]
  },
  {
    id: "minimal-infographic",
    name: "Minimal Infographic",
    description: "High-legibility numbers, diagrams, and clean spatial hierarchy.",
    sceneGrammar: ["question", "number", "comparison", "decision"],
    contentGrammar: ["finance", "data", "definitions", "checklists"],
    motionGrammar: ["slide_up", "zoom_in", "none"],
    defaultPalette: ["white", "navy", "teal", "orange"],
    defaultPillars: ["Make the number legible", "Compare only what matters", "Give a concrete next step"]
  },
  {
    id: "meme-short-form-cartoon",
    name: "Meme / Short-form Cartoon",
    description: "Fast setup, exaggerated reaction, and a compact punchline for short attention spans.",
    sceneGrammar: ["hook", "escalation", "reaction", "punchline"],
    contentGrammar: ["memes", "quick facts", "myths", "creator commentary"],
    motionGrammar: ["pop", "zoom_in", "slide_up"],
    defaultPalette: ["white", "black", "hot_pink", "yellow"],
    defaultPillars: ["Deliver the premise immediately", "Escalate one visual joke", "End on a memorable reaction"]
  },
  {
    id: "custom",
    name: "Custom Style",
    description: "A user-defined visual grammar with the same structured production controls.",
    sceneGrammar: ["setup", "development", "payoff"],
    contentGrammar: ["topic-specific", "creator-defined", "repeatable"],
    motionGrammar: ["zoom_in", "zoom_out", "dissolve"],
    defaultPalette: ["creator-defined"],
    defaultPillars: ["Keep the promise visible", "Repeat the signature grammar", "Protect readability"]
  }
];

const styleProductionProfiles: Record<ChannelStyleId, ChannelStyleProductionProfile> = {
  "editorial-explainer": {
    visualGrammar: ["editorial illustration", "collage", "map", "diagram", "icon", "visual metaphor"],
    storytellingGrammar: ["claim", "evidence", "cause and effect", "takeaway"],
    storyboardGrammar: ["ESTABLISH", "DIAGRAM", "MAP", "OBJECT_INSERT", "METAPHOR", "TEXTLESS_GRAPHIC"],
    promptGrammar: ["Use one dominant evidence object", "Reserve clean space for local labels", "Do not imitate a publisher"],
    frameDensity: { min: 2, max: 5, label: "2-5 assets per information beat" },
    referenceStrategy: ["Reuse approved channel diagrams", "Attach character master only when the teacher appears"],
    motionGrammar: ["pan", "zoom", "crop", "parallax", "mask reveal", "graphic transition"],
    audioTendency: ["clear narration", "restrained documentary bed", "small evidence accents"],
    recommendedContentTypes: ["explainer", "documentary", "tutorial", "listicle"],
    unsuitableContentTypes: ["daily-life", "meme-short-form-cartoon" as ChannelContentType],
    requiredAssets: ["diagram", "icon", "chart", "local text overlay"]
  },
  "2d-character-animation": {
    visualGrammar: ["recurring mascot", "clean background", "readable pose", "simple prop"],
    storytellingGrammar: ["character setup", "objective", "action", "reaction", "lesson payoff"],
    storyboardGrammar: ["BASE", "EXPRESSION_CHANGE", "POSE_CHANGE", "ACTION_KEYFRAME", "REACTION"],
    promptGrammar: ["Create a base frame first", "Keep silhouette and wardrobe locked", "Change one pose or expression per beat"],
    frameDensity: { min: 3, max: 6, label: "3-6 images per scene prompt" },
    referenceStrategy: ["Use character master reference", "Use the previous approved frame as internal continuity reference"],
    motionGrammar: ["hard cut expression", "push-in", "pop", "foreground wipe", "reaction shake"],
    audioTendency: ["expressive narration", "light character accents", "short reaction SFX"],
    recommendedContentTypes: ["story", "daily-life", "character-adventure", "tutorial", "emotional-story"],
    unsuitableContentTypes: ["news-recap"],
    requiredAssets: ["primary character", "consistent locations", "recurring props", "expression variants"]
  },
  "cute-daily-life-cartoon": {
    visualGrammar: ["bright palette", "small everyday action", "cute expression", "cozy location"],
    storytellingGrammar: ["character objective", "small obstacle", "comedy escalation", "reaction", "warm payoff"],
    storyboardGrammar: ["DAILY_PROBLEM", "ATTEMPT", "ESCALATION", "REACTION", "PAYOFF"],
    promptGrammar: ["Keep action simple and readable", "Favor warm facial expressions", "Keep background continuity stable"],
    frameDensity: { min: 3, max: 5, label: "3-5 images per daily-life beat" },
    referenceStrategy: ["Reuse character master", "Reuse home, school, and forest backgrounds"],
    motionGrammar: ["pop", "zoom_in", "dissolve", "gentle pan", "reaction bounce"],
    audioTendency: ["light music", "cute foley", "comedy pop SFX"],
    recommendedContentTypes: ["daily-life", "comedy", "story", "character-adventure"],
    unsuitableContentTypes: ["news-recap", "listicle"],
    requiredAssets: ["mascot", "home/location", "favorite prop", "reaction variants"]
  },
  "cinematic-documentary": {
    visualGrammar: ["depth", "environment detail", "wide shot", "close-up", "atmospheric lighting"],
    storytellingGrammar: ["cold open", "context", "threat", "turning point", "consequence"],
    storyboardGrammar: ["COLD_OPEN", "ENVIRONMENT", "DETAIL", "REVEAL", "AFTERMATH"],
    promptGrammar: ["Specify lens and lighting intent", "Use environment before close-up", "Keep realism level consistent"],
    frameDensity: { min: 1, max: 3, label: "1-3 images per atmospheric beat" },
    referenceStrategy: ["Reuse location references", "Keep weather, season, and time of day locked"],
    motionGrammar: ["slow zoom", "pan_left", "dissolve", "environment reveal"],
    audioTendency: ["atmospheric bed", "natural ambience", "measured narration"],
    recommendedContentTypes: ["documentary", "story", "mystery", "emotional-story"],
    unsuitableContentTypes: ["meme-short-form-cartoon" as ChannelContentType],
    requiredAssets: ["locations", "environment details", "ambience", "archival references"]
  },
  "motion-collage": {
    visualGrammar: ["paper texture", "cutout", "archive", "foreground layers", "type-safe local overlays"],
    storytellingGrammar: ["headline", "layer stack", "contrast", "rapid summary"],
    storyboardGrammar: ["HEADLINE", "LAYER_STACK", "CONTRAST", "INSERT", "SUMMARY"],
    promptGrammar: ["Generate separate layers when possible", "Keep backgrounds textless", "Use approved collage pieces"],
    frameDensity: { min: 3, max: 8, label: "3-8 visual layers per beat" },
    referenceStrategy: ["Prioritize channel cutouts and archive assets", "Use reference images for texture matching"],
    motionGrammar: ["slide_up", "slide_down", "pan_left", "pop", "parallax", "paper wipe"],
    audioTendency: ["rhythmic music", "paper and click SFX", "fast narration"],
    recommendedContentTypes: ["news-recap", "listicle", "mystery", "explainer"],
    unsuitableContentTypes: [],
    requiredAssets: ["paper texture", "cutouts", "icons", "archive images", "foreground elements"]
  },
  "minimal-infographic": {
    visualGrammar: ["geometry", "icon", "chart", "high contrast", "clean hierarchy"],
    storytellingGrammar: ["question", "number", "comparison", "decision"],
    storyboardGrammar: ["QUESTION", "NUMBER", "COMPARISON", "PROCESS", "DECISION"],
    promptGrammar: ["Keep one number or relationship dominant", "Leave text to local composition", "Use consistent grid"],
    frameDensity: { min: 2, max: 5, label: "2-5 diagrams per information beat" },
    referenceStrategy: ["Reuse approved icon and color system", "Prefer local charts over generated text"],
    motionGrammar: ["slide_up", "zoom_in", "none", "chart reveal"],
    audioTendency: ["clean narration", "subtle clicks", "low music density"],
    recommendedContentTypes: ["tutorial", "explainer", "listicle", "news-recap"],
    unsuitableContentTypes: ["emotional-story"],
    requiredAssets: ["icons", "charts", "color palette", "grid", "local typography"]
  },
  "meme-short-form-cartoon": {
    visualGrammar: ["simple framing", "strong reaction", "visual punchline", "minimal background"],
    storytellingGrammar: ["hook", "escalation", "reaction", "punchline"],
    storyboardGrammar: ["HOOK", "ESCALATION", "REACTION", "PUNCHLINE"],
    promptGrammar: ["Make the premise readable in one frame", "Exaggerate the reaction", "Avoid visual clutter"],
    frameDensity: { min: 3, max: 8, label: "3-8 fast frames per short" },
    referenceStrategy: ["Reuse expression and reaction assets", "Keep character silhouette stable"],
    motionGrammar: ["pop", "zoom_in", "slide_up", "shake", "hard cut"],
    audioTendency: ["fast narration", "punchline SFX", "music hits"],
    recommendedContentTypes: ["comedy", "daily-life", "mystery", "listicle"],
    unsuitableContentTypes: ["documentary", "emotional-story"],
    requiredAssets: ["reaction poses", "simple background", "punchline overlay", "SFX"]
  },
  custom: {
    visualGrammar: ["creator-defined visual language"],
    storytellingGrammar: ["creator-defined setup", "development", "payoff"],
    storyboardGrammar: ["SETUP", "DEVELOPMENT", "PAYOFF"],
    promptGrammar: ["Follow custom style bible", "Keep explicit prompt locks unchanged"],
    frameDensity: { min: 2, max: 6, label: "2-6 frames per beat" },
    referenceStrategy: ["Use uploaded style references", "Reuse approved channel assets"],
    motionGrammar: ["zoom_in", "zoom_out", "dissolve"],
    audioTendency: ["creator-defined audio identity"],
    recommendedContentTypes: ["explainer", "story", "tutorial"],
    unsuitableContentTypes: [],
    requiredAssets: ["style references", "color palette", "prompt locks"]
  }
};

export const globalChannelDna: ChannelDna = createDefaultChannelDna();

export function getChannelStyleProductionProfile(styleId: ChannelStyleId): ChannelStyleProductionProfile {
  return styleProductionProfiles[styleId] ?? styleProductionProfiles.custom;
}

export function getChannelStylePreset(styleId: ChannelStyleId): ChannelStylePreset & { productionProfile: ChannelStyleProductionProfile } {
  const preset = channelStylePresets.find((candidate) => candidate.id === styleId) ?? channelStylePresets[0]!;
  return { ...preset, productionProfile: getChannelStyleProductionProfile(styleId) };
}

export function createDefaultChannelDna(input: Partial<{
  name: string;
  audience: string;
  language: string;
  styleId: ChannelStyleId;
  channelPromise: string;
  tone: string;
}> = {}): ChannelDna {
  const preset = getChannelStylePreset(input.styleId ?? "editorial-explainer");
  const productionProfile = getChannelStyleProductionProfile(preset.id);
  return {
    version: 1,
    identity: {
      description: "A repeatable channel identity for clear, memorable videos.",
      mainTopic: "General education",
      secondaryTopics: [],
      channelPromise: input.channelPromise ?? "Make complicated topics easy to understand.",
      audience: input.audience ?? "Curious viewers who want a clear explanation.",
      language: input.language ?? "English",
      tone: input.tone ?? "Clear, practical, curious",
      keywords: input.name ? [input.name] : [],
      prohibitedTopics: [],
      formats: ["long", "short"],
      goals: ["education"]
    },
    contentDirection: {
      primary: "explainer",
      secondary: [],
      contentTypes: ["explainer"],
      pillars: [...preset.defaultPillars],
      defaultAngles: [...preset.contentGrammar],
      hookPatterns: ["Open with a concrete question or visual contradiction."],
      payoffPatterns: ["Close with one useful implication for the viewer."],
      evidenceStyle: "Use concrete examples, diagrams, and locally composed labels."
    },
    visualStyle: {
      styleId: preset.id,
      name: preset.name,
      description: preset.description,
      palette: [...preset.defaultPalette],
      sceneGrammar: [...preset.sceneGrammar],
      motionGrammar: [...preset.motionGrammar],
      assetGrammar: ["One dominant visual idea per beat", "Keep text out of generated images"],
      productionProfile
    },
    characters: [],
    assets: [],
    productionDefaults: {
      aspectRatio: "9:16",
      fps: 30,
      targetDuration: "45-60 seconds",
      visualBeatSeconds: 3,
      maxAiImagesPerMinute: 20,
      defaultMotion: "zoom_in",
      subtitlePreset: "vox-clean",
      frameDensity: { min: productionProfile.frameDensity.min, max: productionProfile.frameDensity.max },
      motionIntensity: "subtle",
      transitionStyle: preset.motionGrammar[0] ?? "cut"
    },
    updatedAt: new Date().toISOString()
  };
}

export function normalizeChannelDna(value: ChannelDna | ChannelDnaOverrides | undefined, fallback: ChannelDna = globalChannelDna): ChannelDna {
  const styleId = value?.visualStyle?.styleId ?? fallback.visualStyle.styleId;
  const preset = getChannelStylePreset(styleId);
  return {
    version: 1,
    identity: { ...fallback.identity, ...(value?.identity ?? {}), description: value?.identity?.description ?? fallback.identity.description, mainTopic: value?.identity?.mainTopic ?? fallback.identity.mainTopic, secondaryTopics: [...(value?.identity?.secondaryTopics ?? fallback.identity.secondaryTopics)], keywords: [...(value?.identity?.keywords ?? fallback.identity.keywords)], prohibitedTopics: [...(value?.identity?.prohibitedTopics ?? fallback.identity.prohibitedTopics)], formats: [...(value?.identity?.formats ?? fallback.identity.formats)], goals: [...(value?.identity?.goals ?? fallback.identity.goals)] },
    contentDirection: { ...fallback.contentDirection, ...(value?.contentDirection ?? {}), primary: value?.contentDirection?.primary ?? fallback.contentDirection.primary, secondary: [...(value?.contentDirection?.secondary ?? fallback.contentDirection.secondary)], contentTypes: [...(value?.contentDirection?.contentTypes ?? fallback.contentDirection.contentTypes)], pillars: [...(value?.contentDirection?.pillars ?? fallback.contentDirection.pillars)], defaultAngles: [...(value?.contentDirection?.defaultAngles ?? fallback.contentDirection.defaultAngles)], hookPatterns: [...(value?.contentDirection?.hookPatterns ?? fallback.contentDirection.hookPatterns)], payoffPatterns: [...(value?.contentDirection?.payoffPatterns ?? fallback.contentDirection.payoffPatterns)] },
    visualStyle: { ...fallback.visualStyle, ...(value?.visualStyle ?? {}), styleId, name: value?.visualStyle?.name ?? preset.name, description: value?.visualStyle?.description ?? preset.description, palette: [...(value?.visualStyle?.palette ?? fallback.visualStyle.palette)], sceneGrammar: [...(value?.visualStyle?.sceneGrammar ?? preset.sceneGrammar)], motionGrammar: [...(value?.visualStyle?.motionGrammar ?? fallback.visualStyle.motionGrammar)], assetGrammar: [...(value?.visualStyle?.assetGrammar ?? fallback.visualStyle.assetGrammar)], productionProfile: value?.visualStyle?.productionProfile ?? getChannelStyleProductionProfile(styleId), ...(value?.visualStyle?.customConfig ? { customConfig: value.visualStyle.customConfig } : fallback.visualStyle.customConfig ? { customConfig: fallback.visualStyle.customConfig } : {}) },
    characters: (value?.characters ?? fallback.characters).map((character) => ({ ...(character.channelId ? { channelId: character.channelId } : {}), id: character.id, name: character.name, role: character.role, priority: character.priority, ...(character.species ? { species: character.species } : {}), ...(character.personality ? { personality: character.personality } : {}), ...(character.relationship ? { relationship: character.relationship } : {}), ...(character.usageRules ? { usageRules: [...character.usageRules] } : {}), ...(character.characterVersionId ? { characterVersionId: character.characterVersionId } : {}) })),
    assets: (value?.assets ?? fallback.assets).map((asset) => ({ ...(asset.channelId ? { channelId: asset.channelId } : {}), id: asset.id, name: asset.name, kind: asset.kind, description: asset.description, tags: [...asset.tags], ...(asset.category ? { category: asset.category } : {}), ...(asset.approved !== undefined ? { approved: asset.approved } : {}), ...(asset.relativeFilePath ? { relativeFilePath: asset.relativeFilePath } : {}) })),
    productionDefaults: { ...fallback.productionDefaults, ...(value?.productionDefaults ?? {}), ...(value?.productionDefaults?.frameDensity ? { frameDensity: value.productionDefaults.frameDensity } : fallback.productionDefaults.frameDensity ? { frameDensity: fallback.productionDefaults.frameDensity } : {}) },
    updatedAt: value && "updatedAt" in value && value.updatedAt ? value.updatedAt : fallback.updatedAt
  };
}

export function buildChannelPromptProfile(input: {
  channelId: string;
  channelDna: ChannelDna;
  version?: number;
  niche?: string;
  characterVersions?: readonly CharacterVersion[];
  activeCharacterVersionId?: string;
}): ChannelPromptProfile {
  const channelId = input.channelId.trim();
  if (!channelId) throw new Error("Channel Prompt Profile requires a channelId.");
  const dna = normalizeChannelDna(input.channelDna, input.channelDna);
  const versions = new Map((input.characterVersions ?? []).map((version) => [version.id, version] as const));
  const slots = dna.characters.filter((slot) => !slot.channelId || slot.channelId === channelId);
  const activeVersion = input.activeCharacterVersionId ? versions.get(input.activeCharacterVersionId) : undefined;
  if (!slots.length && activeVersion) {
    slots.push({ id: activeVersion.id, name: activeVersion.name, role: activeVersion.persona.role, priority: "primary", characterVersionId: activeVersion.id });
  }
  const characterRegistry = slots.map((slot) => {
    const version = slot.characterVersionId ? versions.get(slot.characterVersionId) : undefined;
    const referenceIds = version?.references.filter((reference) => reference.status === "approved").map((reference) => reference.id) ?? [];
    const continuityLocks = [...new Set([
      ...(version?.invariantTraits ?? []),
      ...(slot.usageRules ?? []),
      "Preserve the approved silhouette and identity across every frame."
    ])];
    const forbiddenChanges = [...new Set([
      ...(version?.prohibitedChanges ?? []),
      "Do not replace this character with another channel character.",
      "Do not redesign species, body proportions, costume, or palette."
    ])];
    return {
      channelId,
      characterId: slot.id,
      name: slot.name,
      role: slot.role,
      priority: slot.priority,
      ...(slot.characterVersionId ? { characterVersionId: slot.characterVersionId } : {}),
      ...(slot.species ? { species: slot.species } : {}),
      ...(slot.personality ? { personality: slot.personality } : {}),
      ...(slot.relationship ? { relationship: slot.relationship } : {}),
      usageRules: [...(slot.usageRules ?? [])],
      referenceIds,
      referenceAuthority: {
        controls: ["species", "face identity", "markings", "body proportions", "wardrobe and palette", "illustration treatment"],
        doesNotControl: ["current pose", "facial expression", "camera angle", "scene background"]
      },
      continuityLocks,
      forbiddenChanges
    } satisfies ChannelPromptCharacterProfile;
  });
  const assetRegistry = dna.assets.filter((asset) => !asset.channelId || asset.channelId === channelId).map((asset) => ({
    channelId,
    assetId: asset.id,
    name: asset.name,
    kind: asset.kind,
    role: asset.category ?? asset.kind,
    requiredOrOptional: asset.approved === false ? "optional" as const : "required" as const,
    allowedScenes: [],
    continuityLocks: [asset.description],
    promptDescription: asset.description,
    ...(asset.relativeFilePath ? { referenceFile: asset.relativeFilePath } : {}),
    tags: [...asset.tags]
  }));
  const custom = dna.visualStyle.customConfig;
  const production = dna.visualStyle.productionProfile;
  const contentLane = [dna.contentDirection.primary, ...dna.contentDirection.secondary].join("+");
  const visualIdentity = {
    styleId: dna.visualStyle.styleId,
    styleDescription: dna.visualStyle.description,
    palette: [...dna.visualStyle.palette],
    lineTreatment: custom?.lineArt || production.visualGrammar.join(", "),
    characterTreatment: custom?.characterTreatment || production.referenceStrategy.join(", "),
    backgroundTreatment: custom?.backgroundTreatment || production.visualGrammar.join(", "),
    lightingRules: [custom?.lighting || "Keep lighting consistent across the scene."],
    compositionRules: [
      ...dna.visualStyle.assetGrammar,
      ...(custom?.camera ? [custom.camera] : []),
      ...(custom?.promptLocks ?? [])
    ],
    forbiddenVisualChanges: [
      "No photorealism or unrelated visual style drift.",
      "No logos, watermarks, contact sheets, or unapproved text.",
      ...(custom?.promptLocks ?? [])
    ]
  } satisfies ChannelPromptProfile["visualIdentity"];
  const profile: ChannelPromptProfile = {
    channelId,
    version: Math.max(1, Math.floor(input.version ?? 1)),
    contentIdentity: {
      topic: dna.identity.mainTopic,
      niche: input.niche ?? dna.identity.description,
      audience: dna.identity.audience,
      language: dna.identity.language,
      promise: dna.identity.channelPromise,
      contentLane,
      pillars: [...dna.contentDirection.pillars],
      preferredAngles: [...dna.contentDirection.defaultAngles],
      tone: dna.identity.tone.split(",").map((item) => item.trim()).filter(Boolean),
      forbiddenTopics: [...dna.identity.prohibitedTopics]
    },
    visualIdentity,
    characterRegistry,
    assetRegistry,
    productionGrammar: {
      storyPattern: [...production.storytellingGrammar],
      frameRoles: [...production.storyboardGrammar],
      frameDensity: { min: production.frameDensity.min, max: production.frameDensity.max },
      preferredMotion: [...production.motionGrammar],
      preferredTransitions: [dna.productionDefaults.transitionStyle ?? "cut"],
      averageVisualBeatSeconds: dna.productionDefaults.visualBeatSeconds,
      motionIntensity: dna.productionDefaults.motionIntensity ?? "subtle"
    },
    masterPrompt: ""
  };
  profile.masterPrompt = [
    `You are directing content exclusively for channelId=${channelId}.`,
    `Topic: ${profile.contentIdentity.topic}. Niche: ${profile.contentIdentity.niche}. Audience: ${profile.contentIdentity.audience}. Language: ${profile.contentIdentity.language}.`,
    `Promise: ${profile.contentIdentity.promise}. Content lane: ${profile.contentIdentity.contentLane}.`,
    `Story pattern: ${profile.productionGrammar.storyPattern.join(" -> ")}.`,
    `Visual style: ${profile.visualIdentity.styleDescription}. Palette: ${profile.visualIdentity.palette.join(", ")}.`,
    `Line treatment: ${profile.visualIdentity.lineTreatment}. Character treatment: ${profile.visualIdentity.characterTreatment}. Background treatment: ${profile.visualIdentity.backgroundTreatment}.`,
    `Composition rules: ${profile.visualIdentity.compositionRules.join(" | ")}.`,
    profile.characterRegistry.length
      ? `Approved characters: ${profile.characterRegistry.map((character) => `${character.name} (${character.role}); locks: ${character.continuityLocks.join(", ")}`).join(" | ")}.`
      : "No fixed character is configured; do not invent a recurring character.",
    profile.assetRegistry.length
      ? `Approved channel assets: ${profile.assetRegistry.map((asset) => `${asset.name} (${asset.role}): ${asset.promptDescription}`).join(" | ")}.`
      : "No channel asset is configured; do not borrow assets from another channel.",
    `Forbidden changes: ${[...profile.visualIdentity.forbiddenVisualChanges, ...profile.characterRegistry.flatMap((character) => character.forbiddenChanges)].join(" | ")}.`
  ].join(" ");
  return profile;
}

export function resolveChannelPromptContext(input: {
  channelId: string;
  profile: ChannelPromptProfile;
  taskType: ChannelPromptTaskType;
  projectId?: string;
  sceneId?: string;
  projectSnapshotVersion?: number;
  scene?: {
    characterIds?: string[];
    assetIds?: string[];
    continuityLocks?: string[];
    forbiddenChanges?: string[];
  };
}): ResolvedChannelPromptContext {
  const channelId = input.channelId.trim();
  if (!channelId || input.profile.channelId !== channelId) throw new Error("Channel Prompt Profile does not belong to the active channel.");
  const requestedCharacters = input.scene?.characterIds;
  const rawRequestedAssets = input.scene?.assetIds;
  const requestedAssets = rawRequestedAssets?.filter((id) => !id.startsWith("concept-"));
  const sceneScoped = Boolean(input.scene);
  const characters = requestedCharacters
    ? input.profile.characterRegistry.filter((character) => requestedCharacters.includes(character.characterId))
    : sceneScoped || input.taskType === "story"
      ? []
      : input.profile.characterRegistry.filter((character) => character.priority === "primary");
  const assets = requestedAssets
    ? input.profile.assetRegistry.filter((asset) => requestedAssets.includes(asset.assetId))
    : sceneScoped || input.taskType === "story"
      ? []
      : input.profile.assetRegistry.filter((asset) => asset.requiredOrOptional === "required");
  const selectedCharacterIds = new Set(characters.map((character) => character.characterId));
  const selectedAssetIds = new Set(assets.map((asset) => asset.assetId));
  if (requestedCharacters?.some((id) => !selectedCharacterIds.has(id)) || rawRequestedAssets?.some((id) => !id.startsWith("concept-") && !selectedAssetIds.has(id))) {
    throw new Error("Resolved Prompt Context referenced data outside the active channel profile.");
  }
  return {
    channelId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.sceneId ? { sceneId: input.sceneId } : {}),
    profileVersion: input.profile.version,
    projectSnapshotVersion: input.projectSnapshotVersion ?? input.profile.version,
    taskType: input.taskType,
    contentLane: input.profile.contentIdentity.contentLane,
    contentIdentity: {
      ...input.profile.contentIdentity,
      pillars: [...input.profile.contentIdentity.pillars],
      preferredAngles: [...input.profile.contentIdentity.preferredAngles],
      tone: [...input.profile.contentIdentity.tone],
      forbiddenTopics: [...input.profile.contentIdentity.forbiddenTopics]
    },
    visualStyle: input.profile.visualIdentity.styleId,
    visualIdentity: {
      ...input.profile.visualIdentity,
      palette: [...input.profile.visualIdentity.palette],
      lightingRules: [...input.profile.visualIdentity.lightingRules],
      compositionRules: [...input.profile.visualIdentity.compositionRules],
      forbiddenVisualChanges: [...input.profile.visualIdentity.forbiddenVisualChanges]
    },
    characters,
    assets,
    storyPattern: [...input.profile.productionGrammar.storyPattern],
    productionGrammar: {
      ...input.profile.productionGrammar,
      frameRoles: [...input.profile.productionGrammar.frameRoles],
      preferredMotion: [...input.profile.productionGrammar.preferredMotion],
      preferredTransitions: [...input.profile.productionGrammar.preferredTransitions],
      frameDensity: { ...input.profile.productionGrammar.frameDensity }
    },
    continuityLocks: [...new Set([
      ...characters.flatMap((character) => character.continuityLocks),
      ...assets.flatMap((asset) => asset.continuityLocks),
      ...(input.scene?.continuityLocks ?? [])
    ])],
    forbiddenChanges: [...new Set([
      ...input.profile.visualIdentity.forbiddenVisualChanges,
      ...characters.flatMap((character) => character.forbiddenChanges),
      ...(input.scene?.forbiddenChanges ?? [])
    ])],
    source: {
      channelProfile: `channel:${channelId}:v${input.profile.version}`,
      projectSnapshot: `project-snapshot:v${input.projectSnapshotVersion ?? input.profile.version}`,
      scene: input.sceneId ?? (input.scene ? "scene-context" : "none")
    }
  };
}

export function resolveChannelDna(global: ChannelDna = globalChannelDna, channel?: ChannelDnaOverrides, project?: ChannelDnaOverrides, scene?: ChannelDnaOverrides): ChannelDna {
  const channelResolved = normalizeChannelDna(channel, global);
  const projectResolved = applyChannelDnaOverrides(channelResolved, project);
  return applyChannelDnaOverrides(projectResolved, scene);
}

function applyChannelDnaOverrides(base: ChannelDna, override?: ChannelDnaOverrides): ChannelDna {
  if (!override) return base;
  return normalizeChannelDna({ ...base, ...override, identity: { ...base.identity, ...(override.identity ?? {}) }, contentDirection: { ...base.contentDirection, ...(override.contentDirection ?? {}) }, visualStyle: { ...base.visualStyle, ...(override.visualStyle ?? {}) }, productionDefaults: { ...base.productionDefaults, ...(override.productionDefaults ?? {}) } }, base);
}

export interface ChannelRecommendation {
  styleId: ChannelStyleId;
  angle: string;
  sceneGrammar: string[];
  hook: string;
  payoff: string;
  reason: string;
}

export interface ChannelIdeaRecommendation {
  id: string;
  title: string;
  angle: string;
  whyItFits: string;
  recommendedFormat: "long" | "short";
  mainCharacterUsage: string;
  visualTreatment: string;
  estimatedSceneCount: number;
  estimatedImageCount: number;
  difficulty: "low" | "medium" | "high";
  hook: string;
}

export function recommendChannelDirection(input: { topic: string; styleId: ChannelStyleId; contentDirection?: Partial<ChannelContentDirectionDna> }): ChannelRecommendation {
  const preset = getChannelStylePreset(input.styleId);
  const topic = input.topic.trim() || "this topic";
  const angle = input.contentDirection?.defaultAngles?.[0] ?? preset.contentGrammar[0] ?? "clear explanation";
  const hook = input.contentDirection?.hookPatterns?.[0] ?? `Open with a concrete ${topic} question.`;
  const payoff = input.contentDirection?.payoffPatterns?.[0] ?? preset.defaultPillars[preset.defaultPillars.length - 1]!;
  return {
    styleId: input.styleId,
    angle,
    sceneGrammar: [...preset.sceneGrammar],
    hook,
    payoff,
    reason: `${preset.name} treats ${topic} as ${angle}; its visual grammar is ${preset.sceneGrammar.join(" -> ")}.`
  };
}

export function recommendChannelIdeas(input: { topic: string; styleId: ChannelStyleId; contentDirection?: Partial<ChannelContentDirectionDna>; channelDna?: ChannelDna; format?: "long" | "short"; durationSeconds?: number; existingAssetCount?: number }): ChannelIdeaRecommendation[] {
  const topic = input.topic.trim() || "this topic";
  const preset = getChannelStylePreset(input.styleId);
  const production = preset.productionProfile;
  const format = input.format ?? "short";
  const durationSeconds = input.durationSeconds ?? (format === "short" ? 60 : 300);
  const sceneCount = Math.max(3, Math.round(durationSeconds / 8));
  const imageCount = Math.min(Math.max(sceneCount, Math.round(durationSeconds / Math.max(1, 60 / production.frameDensity.max))), 20 * Math.max(1, Math.ceil(durationSeconds / 60)));
  const primary = input.contentDirection?.primary ?? input.channelDna?.contentDirection.primary ?? production.recommendedContentTypes[0] ?? "explainer";
  const character = input.channelDna?.characters.find((item) => item.priority === "primary")?.name ?? "the channel character";
  const hasAssets = (input.existingAssetCount ?? input.channelDna?.assets.length ?? 0) > 0;
  const templates: Record<ChannelStyleId, Array<{ title: string; angle: string; usage: string; treatment: string; hook: string; difficulty: "low" | "medium" | "high" }>> = {
    "editorial-explainer": [
      { title: `Why ${topic} is changing`, angle: "cause and effect", usage: "Teacher appears only for framing and takeaway.", treatment: "Evidence object, diagram, map, and local labels.", hook: `What is really causing ${topic}?`, difficulty: "medium" },
      { title: `The science behind ${topic}`, angle: "science and mechanism", usage: "Teacher points to a clean explanatory diagram.", treatment: "Diagram reveal with object inserts.", hook: `The surprising mechanism behind ${topic}.`, difficulty: "medium" },
      { title: `The biggest myth about ${topic}`, angle: "myth versus reality", usage: "Teacher introduces the claim, then evidence takes over.", treatment: "Split comparison and visual metaphor.", hook: `Most people misunderstand ${topic}.`, difficulty: "low" },
      { title: `What happens if ${topic} continues?`, angle: "consequence and scenario", usage: "Teacher anchors transitions between consequence beats.", treatment: "Timeline, chart, and consequence montage.", hook: `The next consequence of ${topic} is easier to miss than you think.`, difficulty: "high" },
      { title: `${topic}: the short visual guide`, angle: "definition and checklist", usage: "Teacher gives a concise checklist at the end.", treatment: "Minimal diagrams and numbered evidence cards.", hook: `Here is ${topic} in one clear visual guide.`, difficulty: "low" }
    ],
    "2d-character-animation": [
      { title: `${character} tries to understand ${topic}`, angle: "character lesson", usage: `${character} is present as the recurring teacher and learner.`, treatment: "Base pose, action keyframes, and readable reactions.", hook: `${character} thought ${topic} would be easy.`, difficulty: "medium" },
      { title: `A small adventure about ${topic}`, angle: "character adventure", usage: `${character} leads the audience through a simple objective.`, treatment: "Consistent location, prop, pose, and reaction changes.", hook: `${character} has one problem and one chance to solve it.`, difficulty: "medium" },
      { title: `${character} makes the ${topic} mistake`, angle: "mistake and explanation", usage: `${character} demonstrates the wrong approach, then teaches the fix.`, treatment: "Expression change, mistake insert, and lesson payoff.", hook: `This is the mistake almost everyone makes with ${topic}.`, difficulty: "low" },
      { title: `${character} answers three questions about ${topic}`, angle: "question-led tutorial", usage: `${character} answers each question with a distinct pose.`, treatment: "Three action/reaction mini-scenes.", hook: `${character} has three answers you can see, not just hear.`, difficulty: "low" },
      { title: `The day ${character} discovered ${topic}`, angle: "discovery story", usage: `${character} is the emotional point of view.`, treatment: "Environment reveal, discovery insert, and warm reaction.", hook: `One ordinary day changed how ${character} saw ${topic}.`, difficulty: "high" }
    ],
    "cute-daily-life-cartoon": [
      { title: `A day in the life of ${character}`, angle: "daily life", usage: `${character} carries the whole story through small actions.`, treatment: "Cozy background, cute prop, reaction, and gentle zoom.", hook: `What does ${character} do before anyone else wakes up?`, difficulty: "low" },
      { title: `${character} tries to hide ${topic}`, angle: "comedy obstacle", usage: `${character} creates the problem and reacts to each escalation.`, treatment: "Simple setup, escalating attempts, punchy reaction.", hook: `${character} had one job: keep ${topic} secret.`, difficulty: "medium" },
      { title: `${character} goes to school to learn ${topic}`, angle: "character story", usage: `${character} learns through a relatable everyday situation.`, treatment: "School background, prop continuity, expression changes.", hook: `${character} forgot the one thing needed for today's lesson.`, difficulty: "medium" },
      { title: `${character} meets a friend because of ${topic}`, angle: "friendship payoff", usage: `${character} and one supporting character share the payoff.`, treatment: "Two-character staging with clear reaction beats.", hook: `${character} wanted to solve ${topic} alone.`, difficulty: "high" },
      { title: `${character} refuses to deal with ${topic}`, angle: "small emotional story", usage: `${character} changes from avoidance to a warm decision.`, treatment: "Cozy lighting, close reaction, and dissolve payoff.", hook: `Sometimes the smallest problem feels enormous to ${character}.`, difficulty: "medium" }
    ],
    "cinematic-documentary": [
      { title: `Inside the world of ${topic}`, angle: "environment and stakes", usage: "Character is optional; environment carries the story.", treatment: "Wide environment, detail close-up, atmosphere, and slow reveal.", hook: `Before we understand ${topic}, we need to see where it lives.`, difficulty: "high" },
      { title: `The last refuge of ${topic}`, angle: "survival and conservation", usage: "Human or animal subject appears as a grounded point of view.", treatment: "Location continuity, weather, and restrained camera motion.", hook: `What remains when the world around ${topic} disappears?`, difficulty: "high" },
      { title: `One night with ${topic}`, angle: "immersive timeline", usage: "Subject appears in environment details rather than presenter shots.", treatment: "Night atmosphere, close detail, and slow dissolve.", hook: `For one night, every sound around ${topic} matters.`, difficulty: "high" },
      { title: `How ${topic} became a crisis`, angle: "historical chronology", usage: "Presenter appears only for chapter transitions.", treatment: "Archival reference, timeline, turning point, aftermath.", hook: `The crisis did not begin where most people think.`, difficulty: "medium" },
      { title: `A quiet portrait of ${topic}`, angle: "emotional portrait", usage: "Subject remains the emotional center.", treatment: "Close-up details, environment, and reflective pacing.", hook: `The quietest stories about ${topic} can change how we see it.`, difficulty: "medium" }
    ],
    "motion-collage": [
      { title: `${topic} in five visual layers`, angle: "rapid summary", usage: "Character or mascot appears as a cutout guide.", treatment: "Paper texture, archive, icons, foreground parallax.", hook: `${topic} makes sense once you stack the right evidence.`, difficulty: "medium" },
      { title: `The internet argument about ${topic}`, angle: "contrast and commentary", usage: "Mascot reacts to each side without becoming the evidence.", treatment: "Headline, comment cards, timeline, and reaction cutout.", hook: `Everyone is arguing about ${topic}, but the visual evidence says more.`, difficulty: "medium" },
      { title: `The timeline of ${topic}`, angle: "chronology", usage: "Presenter cutout marks the turning points.", treatment: "Archive cards, arrows, paper wipes, and local typography.", hook: `Here is the whole ${topic} timeline in under a minute.`, difficulty: "low" },
      { title: `Three objects that explain ${topic}`, angle: "object-led explanation", usage: "Character introduces each object, then exits.", treatment: "Object inserts, labels, texture, and punchy transitions.", hook: `You only need three objects to understand ${topic}.`, difficulty: "low" },
      { title: `What everyone missed about ${topic}`, angle: "hidden detail", usage: "Mascot signals the reveal and reaction.", treatment: "Contrast stack, zoom, mask reveal, and payoff card.", hook: `The most important part of ${topic} is easy to miss.`, difficulty: "medium" }
    ],
    "minimal-infographic": [
      { title: `${topic}: the numbers that matter`, angle: "data explanation", usage: "Character optional; icons and numbers lead.", treatment: "Grid, chart, comparison, and decision card.", hook: `Ignore the noise. These are the numbers behind ${topic}.`, difficulty: "low" },
      { title: `How ${topic} works in four steps`, angle: "process tutorial", usage: "Teacher points to one step at a time.", treatment: "Numbered cards, arrows, and clean zooms.", hook: `If you can follow four steps, you can understand ${topic}.`, difficulty: "low" },
      { title: `${topic}: before and after`, angle: "comparison", usage: "Presenter frames the comparison, then diagrams take over.", treatment: "Split screen, chart, and local labels.", hook: `The difference in ${topic} is visible when you compare these two states.`, difficulty: "medium" },
      { title: `The checklist for ${topic}`, angle: "practical checklist", usage: "Teacher confirms each item with a gesture.", treatment: "Icon cards, checkmarks, and subtle slide-up motion.", hook: `Use this checklist before you make a decision about ${topic}.`, difficulty: "low" },
      { title: `One diagram explains ${topic}`, angle: "single-model explanation", usage: "Teacher appears once to frame the diagram.", treatment: "One dominant diagram with progressive reveals.", hook: `This one diagram makes ${topic} much easier to see.`, difficulty: "medium" }
    ],
    "meme-short-form-cartoon": [
      { title: `${character} gets ${topic} completely wrong`, angle: "mistake reaction", usage: `${character} drives setup, escalation, and punchline.`, treatment: "Simple framing, exaggerated face, zoom and shake.", hook: `${character} was confident for exactly three seconds.`, difficulty: "low" },
      { title: `When someone says ${topic} is easy`, angle: "expectation versus reality", usage: "Character reacts to the contradiction.", treatment: "Hard cut setup, reaction, visual punchline.", hook: `Sure, ${topic} is easy... until this happens.`, difficulty: "low" },
      { title: `${topic} explained by one chaotic character`, angle: "comic explainer", usage: "Character is both teacher and source of the joke.", treatment: "Pose change, pop, and local punchline overlay.", hook: `This explanation went off the rails immediately.`, difficulty: "medium" },
      { title: `Three reactions to ${topic}`, angle: "reaction listicle", usage: "One character with three distinct expressions.", treatment: "Expression keyframes and fast cuts.", hook: `Which reaction is you when ${topic} happens?`, difficulty: "low" },
      { title: `The tiny problem that became ${topic}`, angle: "escalation", usage: "Character visibly loses control of the situation.", treatment: "Minimal background, escalating props, punchline.", hook: `It started with one tiny problem.`, difficulty: "medium" }
    ],
    custom: [
      { title: `A signature story about ${topic}`, angle: primary, usage: "Use the configured primary character and channel asset rules.", treatment: production.visualGrammar.join(", "), hook: `Here is ${topic} in the channel's signature style.`, difficulty: "medium" },
      { title: `The visual guide to ${topic}`, angle: "custom explainer", usage: "Use the channel teacher or mascot according to the character rules.", treatment: production.storyboardGrammar.join(" -> "), hook: `See ${topic} through the channel's own visual grammar.`, difficulty: "medium" },
      { title: `A short character moment about ${topic}`, angle: "custom story", usage: "Keep the primary character and approved asset library central.", treatment: production.motionGrammar.join(", "), hook: `One small moment can explain ${topic}.`, difficulty: "low" },
      { title: `What the channel believes about ${topic}`, angle: "channel promise", usage: "Presenter frames the channel point of view.", treatment: production.visualGrammar.join(", "), hook: `This is the channel's clearest answer about ${topic}.`, difficulty: "medium" },
      { title: `The repeatable format for ${topic}`, angle: "series format", usage: hasAssets ? "Reuse channel assets before creating new ones." : "Create the first reusable channel assets.", treatment: production.storyboardGrammar.join(" -> "), hook: `Turn ${topic} into a repeatable series format.`, difficulty: "low" }
    ]
  };
  return templates[input.styleId].map((template, index) => ({
    id: `idea-${input.styleId}-${index + 1}`,
    title: template.title,
    angle: template.angle,
    whyItFits: `${preset.name} uses ${template.angle}; ${preset.description}`,
    recommendedFormat: format,
    mainCharacterUsage: template.usage,
    visualTreatment: template.treatment,
    estimatedSceneCount: sceneCount,
    estimatedImageCount: imageCount,
    difficulty: template.difficulty,
    hook: template.hook
  }));
}
