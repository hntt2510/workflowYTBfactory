export interface VideoStyleSkill {
  id: string;
  name: string;
  version: string;
  scenePlanningRules: string[];
  visualLanguageRules: string[];
  pacingRules: string[];
  compositionRules: string[];
  typographyRules: string[];
  transitionRules: string[];
  promptTemplate: string;
  negativePromptTemplate: string;
  supportedSceneTypes: string[];
}

export const voxDocumentaryStyle: VideoStyleSkill = {
  id: "vox-documentary",
  name: "VOX Documentary",
  version: "1.0.0",
  scenePlanningRules: [
    "Give each scene one clear explanatory purpose and one narration boundary.",
    "Prefer evidence objects, maps, diagrams, timelines, and document excerpts when the narration makes a claim.",
    "Keep visual beats short enough to preserve fast but understandable pacing."
  ],
  visualLanguageRules: [
    "Use an evidence-led editorial explainer language with layered 2D compositions.",
    "Use simple camera moves, cutout motion, clean diagrams, and restrained documentary illustration.",
    "Do not imitate a specific publisher, proprietary logo, exact typography, or shot."
  ],
  pacingRules: [
    "Open with a legible visual question or claim.",
    "Change the visual beat when the narration changes argument or evidence.",
    "Use short visual beats without sacrificing readable hierarchy."
  ],
  compositionRules: [
    "Keep one dominant subject or evidence object per frame.",
    "Reserve clean space for locally composited titles, labels, numbers, and subtitles.",
    "Use high contrast between background, evidence, and overlay layers."
  ],
  typographyRules: [
    "Generate backgrounds without text, subtitles, labels, logos, or lower-third wording.",
    "Render important text locally so Vietnamese Unicode remains correct.",
    "Keep typography, charts, callouts, and map labels in the local composition layer."
  ],
  transitionRules: [
    "Prefer clean cuts, simple wipes, measured zooms, and diagram reveals.",
    "Avoid decorative transitions that compete with evidence or narration."
  ],
  promptTemplate: "Create a clean editorial documentary explainer background for {{sceneType}}. Show {{visualPurpose}} with {{subjectAction}}. Use a layered 2D composition, strong visual hierarchy, evidence-led framing, and {{aspectRatio}}. Leave all labels, numbers, titles, subtitles, logos, and other text out of the generated image.",
  negativePromptTemplate: "text, subtitles, labels, logos, watermarks, malformed lettering, Vietnamese typography, brand imitation, proprietary graphics, clutter, unsupported factual details, photorealistic gore",
  supportedSceneTypes: [
    "Archival photo",
    "Document excerpt",
    "Map",
    "Timeline",
    "Chart",
    "Diagram",
    "Cutout composition",
    "Kinetic text",
    "AI illustration",
    "Simple motion-graphic scene"
  ]
};

export const videoStyleSkills: readonly VideoStyleSkill[] = [voxDocumentaryStyle];

export function getVideoStyleSkill(styleId: string): VideoStyleSkill | undefined {
  return videoStyleSkills.find((skill) => skill.id === styleId);
}
