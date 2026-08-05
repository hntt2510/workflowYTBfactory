export const characterReferenceViews = [
  "hero",
  "half_body",
  "full_body",
  "teaching_gesture",
  "three_quarter",
  "profile"
] as const;

export type CharacterReferenceView = (typeof characterReferenceViews)[number];
export type CharacterVersionStatus = "draft" | "needs_review" | "approved" | "archived";
export type CharacterSubjectAnchor = "left" | "center" | "right";

export interface CharacterCompositionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CharacterCompositionLock {
  aspectRatio: "16:9" | "9:16" | "1:1";
  subjectAnchor: CharacterSubjectAnchor;
  subjectBox: CharacterCompositionBox;
  cameraDistance: string;
  headroom: string;
  safeZone: CharacterCompositionBox;
}

export interface CharacterPersona {
  role: string;
  ageRange: string;
  appearance: string;
  wardrobe: string;
  palette: string;
  props: string[];
  gestures: string[];
  tone: string;
}

export interface CharacterReference {
  id: string;
  view: CharacterReferenceView;
  status: "needs_review" | "approved" | "rejected";
  promptText?: string;
  relativeFilePath?: string;
  sha256?: string;
  mimeType?: "image/png" | "image/jpeg" | "image/webp";
  width?: number;
  height?: number;
}

export interface CharacterVersion {
  id: string;
  version: number;
  status: CharacterVersionStatus;
  name: string;
  persona: CharacterPersona;
  invariantTraits: string[];
  prohibitedChanges: string[];
  composition?: CharacterCompositionLock;
  references: CharacterReference[];
  createdAt: string;
  updatedAt: string;
}

export const defaultCharacterCompositionLock: CharacterCompositionLock = {
  aspectRatio: "9:16",
  subjectAnchor: "right",
  subjectBox: { x: 0.52, y: 0.14, width: 0.42, height: 0.66 },
  cameraDistance: "half-body medium shot",
  headroom: "10 percent above the head",
  safeZone: { x: 0.04, y: 0.05, width: 0.46, height: 0.84 }
};

export function resolveCharacterCompositionLock(version: { composition?: CharacterCompositionLock | undefined } | undefined): CharacterCompositionLock {
  return version?.composition ?? defaultCharacterCompositionLock;
}

export function characterVersionIsApproved(version: CharacterVersion | undefined): boolean {
  return Boolean(version && version.status === "approved" && version.references.length >= 4 && version.references.every((reference) => (
    reference.status === "approved"
    && Boolean(reference.relativeFilePath && reference.sha256 && reference.mimeType)
  )));
}

/** Resolve the requested character first, then the channel's active approved version. */
export function resolveApprovedCharacterVersion(
  profile: { characterVersions?: CharacterVersion[]; activeCharacterVersionId?: string } | undefined,
  requestedVersionId?: string
): CharacterVersion | undefined {
  const versions = profile?.characterVersions ?? [];
  const requested = requestedVersionId ? versions.find((version) => version.id === requestedVersionId) : undefined;
  if (characterVersionIsApproved(requested)) return requested;
  const active = profile?.activeCharacterVersionId
    ? versions.find((version) => version.id === profile.activeCharacterVersionId)
    : undefined;
  if (characterVersionIsApproved(active)) return active;
  return versions.find((version) => characterVersionIsApproved(version));
}

export function characterReferenceViewsForCount(count = 5): CharacterReferenceView[] {
  if (!Number.isInteger(count) || count < 4 || count > characterReferenceViews.length) throw new Error("Character identity packs must contain 4 to 6 views.");
  return characterReferenceViews.slice(0, count);
}
