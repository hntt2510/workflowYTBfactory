import type { ShotMotionPlan } from "./motion";

export type AssetConceptKind = "object" | "diagram" | "background" | "teacher_gesture" | "text_card";

export interface AssetConcept {
  id: string;
  shotId: string;
  semanticBeat: string;
  kind: AssetConceptKind;
  role: string;
  description: string;
  visualConstraints: string[];
  colorPalette: string[];
  motionIntent: string;
  needsReferenceImage: boolean;
  referenceAssetId?: string | undefined;
  motion?: ShotMotionPlan | undefined;
}

export interface AssetConceptOutput {
  concepts: AssetConcept[];
}

export function validateAssetConcepts(concepts: AssetConcept[], shotIds: ReadonlySet<string>): AssetConcept[] {
  const ids = new Set<string>();
  for (const concept of concepts) {
    if (ids.has(concept.id)) throw new Error(`Asset concept IDs must be unique: ${concept.id}.`);
    if (!shotIds.has(concept.shotId)) throw new Error(`Asset concept ${concept.id} references an unknown shot.`);
    if (!concept.semanticBeat.trim() || !concept.description.trim()) throw new Error(`Asset concept ${concept.id} is missing semantic content.`);
    ids.add(concept.id);
  }
  return concepts;
}
