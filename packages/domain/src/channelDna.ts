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

export interface ChannelIdentityDna {
  channelPromise: string;
  audience: string;
  language: string;
  tone: string;
  keywords: string[];
  prohibitedTopics: string[];
}

export interface ChannelContentDirectionDna {
  pillars: string[];
  defaultAngles: string[];
  hookPatterns: string[];
  payoffPatterns: string[];
  evidenceStyle: string;
}

export interface ChannelVisualStyleDna {
  styleId: ChannelStyleId;
  name: string;
  description: string;
  palette: string[];
  sceneGrammar: string[];
  motionGrammar: string[];
  assetGrammar: string[];
}

export interface ChannelCharacterSlot {
  id: string;
  name: string;
  role: string;
  priority: ChannelCharacterPriority;
  characterVersionId?: string;
}

export interface ChannelAssetLibraryItem {
  id: string;
  name: string;
  kind: "prop" | "background" | "diagram" | "sound" | "overlay";
  description: string;
  tags: string[];
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

export const globalChannelDna: ChannelDna = createDefaultChannelDna();

export function getChannelStylePreset(styleId: ChannelStyleId): ChannelStylePreset {
  return channelStylePresets.find((preset) => preset.id === styleId) ?? channelStylePresets[0]!;
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
  return {
    version: 1,
    identity: {
      channelPromise: input.channelPromise ?? "Make complicated topics easy to understand.",
      audience: input.audience ?? "Curious viewers who want a clear explanation.",
      language: input.language ?? "English",
      tone: input.tone ?? "Clear, practical, curious",
      keywords: input.name ? [input.name] : [],
      prohibitedTopics: []
    },
    contentDirection: {
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
      assetGrammar: ["One dominant visual idea per beat", "Keep text out of generated images"]
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
      subtitlePreset: "vox-clean"
    },
    updatedAt: new Date().toISOString()
  };
}

export function normalizeChannelDna(value: ChannelDna | ChannelDnaOverrides | undefined, fallback: ChannelDna = globalChannelDna): ChannelDna {
  const styleId = value?.visualStyle?.styleId ?? fallback.visualStyle.styleId;
  const preset = getChannelStylePreset(styleId);
  return {
    version: 1,
    identity: { ...fallback.identity, ...(value?.identity ?? {}), keywords: [...(value?.identity?.keywords ?? fallback.identity.keywords)], prohibitedTopics: [...(value?.identity?.prohibitedTopics ?? fallback.identity.prohibitedTopics)] },
    contentDirection: { ...fallback.contentDirection, ...(value?.contentDirection ?? {}), pillars: [...(value?.contentDirection?.pillars ?? fallback.contentDirection.pillars)], defaultAngles: [...(value?.contentDirection?.defaultAngles ?? fallback.contentDirection.defaultAngles)], hookPatterns: [...(value?.contentDirection?.hookPatterns ?? fallback.contentDirection.hookPatterns)], payoffPatterns: [...(value?.contentDirection?.payoffPatterns ?? fallback.contentDirection.payoffPatterns)] },
    visualStyle: { ...fallback.visualStyle, ...(value?.visualStyle ?? {}), styleId, name: value?.visualStyle?.name ?? preset.name, description: value?.visualStyle?.description ?? preset.description, palette: [...(value?.visualStyle?.palette ?? fallback.visualStyle.palette)], sceneGrammar: [...(value?.visualStyle?.sceneGrammar ?? preset.sceneGrammar)], motionGrammar: [...(value?.visualStyle?.motionGrammar ?? preset.motionGrammar)], assetGrammar: [...(value?.visualStyle?.assetGrammar ?? fallback.visualStyle.assetGrammar)] },
    characters: (value?.characters ?? fallback.characters).map((character) => character.characterVersionId ? { ...character, characterVersionId: character.characterVersionId } : { id: character.id, name: character.name, role: character.role, priority: character.priority }),
    assets: (value?.assets ?? fallback.assets).map((asset) => asset.relativeFilePath ? { ...asset, relativeFilePath: asset.relativeFilePath } : { id: asset.id, name: asset.name, kind: asset.kind, description: asset.description, tags: [...asset.tags] }),
    productionDefaults: { ...fallback.productionDefaults, ...(value?.productionDefaults ?? {}) },
    updatedAt: value && "updatedAt" in value && value.updatedAt ? value.updatedAt : fallback.updatedAt
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
