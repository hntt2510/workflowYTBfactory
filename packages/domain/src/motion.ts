export const visualMotionEffects = [
  "none",
  "slide_up",
  "slide_down",
  "pan_left",
  "pan_right",
  "zoom_in",
  "zoom_out",
  "pop",
  "dissolve"
] as const;

export type VisualMotionEffect = (typeof visualMotionEffects)[number];

export type MotionIntensity = "subtle" | "standard" | "strong";

export interface ShotMotionPlan {
  effect: VisualMotionEffect;
  intensity: MotionIntensity;
  rationale: string;
  userOverride?: boolean | undefined;
}

export const maxAiImagesPerMinute = 20;

const motionGrammarAliases: Record<string, VisualMotionEffect> = {
  "diagram-reveal": "slide_up",
  "chart-reveal": "slide_up",
  "measured-zoom": "zoom_in",
  "slow-zoom-in": "zoom_in",
  "push-in": "zoom_in",
  "pose-change": "pop",
  "reaction-bounce": "pop",
  "hard-cut": "none",
  "graphic-transition": "dissolve",
  "foreground-wipe": "slide_up"
};

export function motionEffectsFromGrammar(grammar: readonly string[] | undefined): VisualMotionEffect[] {
  const effects = (grammar ?? []).flatMap((item) => {
    const normalized = item.trim().toLowerCase().replace(/[\s_]+/g, "-");
    const direct = visualMotionEffects.find((effect) => effect.replace(/_/g, "-") === normalized);
    if (direct) return [direct];
    const alias = motionGrammarAliases[normalized];
    return alias ? [alias] : [];
  });
  return [...new Set(effects)];
}

export function selectMotionEffect(input: {
  assetRole?: string;
  subjectAction?: string;
  purpose?: string;
  preferredEffects?: readonly VisualMotionEffect[];
}): ShotMotionPlan {
  const text = [input.assetRole, input.subjectAction, input.purpose].filter(Boolean).join(" ").toLowerCase();
  const preferredEffects = [...new Set(input.preferredEffects ?? [])];
  const prefer = (motion: ShotMotionPlan): ShotMotionPlan => {
    if (!preferredEffects.length || preferredEffects.includes(motion.effect)) return motion;
    const effect = preferredEffects[0]!;
    return { ...motion, effect, rationale: `${motion.rationale} Channel motion grammar prioritizes ${effect}.` };
  };
  if (/increase|rise|upward|cash flow|growth|stack|build/.test(text)) {
    return prefer({ effect: "slide_up", intensity: "standard", rationale: "A rising or accumulating visual benefits from upward motion." });
  }
  if (/highlight|key point|impact|reveal|emphasis|important/.test(text)) {
    return prefer({ effect: "pop", intensity: "standard", rationale: "A highlighted beat benefits from a short emphasis motion." });
  }
  if (/compare|explain|overview|diagram|chart|map/.test(text)) {
    return prefer({ effect: "pan_right", intensity: "subtle", rationale: "An explanatory visual benefits from a readable lateral scan." });
  }
  if (/transition|change|before|after/.test(text)) {
    return prefer({ effect: "dissolve", intensity: "subtle", rationale: "A state change benefits from a soft transition." });
  }
  return prefer({ effect: "zoom_in", intensity: "subtle", rationale: "A subtle push-in keeps a still visual active." });
}

export function imageBudgetForDuration(targetDurationSeconds: number): number {
  return Math.max(1, Math.ceil((Math.max(1, targetDurationSeconds) / 60) * maxAiImagesPerMinute));
}
