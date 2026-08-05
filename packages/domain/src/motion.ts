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

export function selectMotionEffect(input: {
  assetRole?: string;
  subjectAction?: string;
  purpose?: string;
}): ShotMotionPlan {
  const text = [input.assetRole, input.subjectAction, input.purpose].filter(Boolean).join(" ").toLowerCase();
  if (/increase|rise|upward|cash flow|growth|stack|build/.test(text)) {
    return { effect: "slide_up", intensity: "standard", rationale: "A rising or accumulating visual benefits from upward motion." };
  }
  if (/highlight|key point|impact|reveal|emphasis|important/.test(text)) {
    return { effect: "pop", intensity: "standard", rationale: "A highlighted beat benefits from a short emphasis motion." };
  }
  if (/compare|explain|overview|diagram|chart|map/.test(text)) {
    return { effect: "pan_right", intensity: "subtle", rationale: "An explanatory visual benefits from a readable lateral scan." };
  }
  if (/transition|change|before|after/.test(text)) {
    return { effect: "dissolve", intensity: "subtle", rationale: "A state change benefits from a soft transition." };
  }
  return { effect: "zoom_in", intensity: "subtle", rationale: "A subtle push-in keeps a still visual active." };
}

export function imageBudgetForDuration(targetDurationSeconds: number): number {
  return Math.max(1, Math.ceil((Math.max(1, targetDurationSeconds) / 60) * maxAiImagesPerMinute));
}
