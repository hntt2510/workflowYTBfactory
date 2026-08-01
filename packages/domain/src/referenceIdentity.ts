import type { CompetitorReference, ReferenceSetState, ReferenceStatus } from "./types";

export const referenceValidationVersion = "reference-validation-v2";

export interface ReferenceValidationResult {
  status: ReferenceStatus;
  validationMessage: string;
  identityKey?: string;
  errors: string[];
  warnings: string[];
}

export function normalizeReferenceIdentity(sourceUrl?: string): string | undefined {
  const value = sourceUrl?.trim();
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtu.be") {
      const videoId = parsed.pathname.split("/").filter(Boolean)[0];
      return videoId ? `youtube:${videoId}` : undefined;
    }
    if (host === "youtube.com") {
      const videoId = parsed.searchParams.get("v");
      const pathParts = parsed.pathname.split("/").filter(Boolean);
      const pathVideoId = ["shorts", "embed"].includes(pathParts[0] ?? "") ? pathParts[1] : undefined;
      return videoId || pathVideoId ? `youtube:${videoId ?? pathVideoId}` : undefined;
    }
    return canonicalUrlIdentity(parsed);
  } catch {
    return `manual:${hashText(value)}`;
  }
}

export function validateReference(reference: CompetitorReference): ReferenceValidationResult {
  const transcript = reference.pastedTranscript.trim();
  const identityKey = normalizeReferenceIdentity(reference.sourceUrl);
  if (reference.sourceUrl?.trim() && !isValidReferenceUrl(reference.sourceUrl)) {
    return {
      status: "invalid",
      validationMessage: "Source URL must be a complete HTTP(S) URL with a video ID for YouTube sources.",
      errors: [reference.sourceUrl.includes("youtube") ? "missing_youtube_video_id" : "malformed_url"],
      warnings: [],
      ...(identityKey ? { identityKey } : {})
    };
  }
  if (!transcript) {
    return {
      status: "invalid",
      validationMessage: "Transcript or analysis block is required.",
      errors: ["empty_transcript", "missing_content"],
      warnings: [],
      ...(identityKey ? { identityKey } : {})
    };
  }
  if (transcript.length < 20) {
    return {
      status: "invalid",
      validationMessage: "Transcript is too short to analyze.",
      errors: ["short_transcript"],
      warnings: [],
      ...(identityKey ? { identityKey } : {})
    };
  }
  return {
    status: "valid",
    validationMessage: "Reference passed local validation.",
    errors: [],
    warnings: [],
    ...(identityKey ? { identityKey } : {})
  };
}

function isValidReferenceUrl(sourceUrl: string): boolean {
  try {
    const parsed = new URL(sourceUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtu.be") return Boolean(parsed.pathname.split("/").filter(Boolean)[0]);
    if (host === "youtube.com") {
      const pathParts = parsed.pathname.split("/").filter(Boolean);
      return Boolean(parsed.searchParams.get("v") || (["shorts", "embed"].includes(pathParts[0] ?? "") && pathParts[1]));
    }
    return true;
  } catch {
    return false;
  }
}

export function findDuplicateReference(references: CompetitorReference[], identityKey: string | undefined): CompetitorReference | undefined {
  if (!identityKey) return undefined;
  return references
    .filter((reference) => (reference.identityKey ?? normalizeReferenceIdentity(reference.sourceUrl)) === identityKey)
    .sort((left, right) => {
      const includedDifference = Number(right.included !== false) - Number(left.included !== false);
      if (includedDifference !== 0) return includedDifference;
      const versionDifference = (right.version ?? 1) - (left.version ?? 1);
      if (versionDifference !== 0) return versionDifference;
      return (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt);
    })[0];
}

export async function referenceSetFingerprint(references: CompetitorReference[], options: { projectId?: string } = {}): Promise<string> {
  const includedReferences = await Promise.all(references
    .filter((reference) => reference.included !== false)
    .map(async (reference) => ({
      id: reference.id,
      identityKey: reference.identityKey ?? normalizeReferenceIdentity(reference.sourceUrl) ?? `manual:${reference.id}`,
      currentVersionId: reference.id,
      version: reference.version ?? 1,
      contentFingerprint: reference.contentFingerprint ?? await canonicalSha256(reference.pastedTranscript.trim())
    })));
  const payload = {
    projectId: options.projectId ?? null,
    validatorVersion: referenceValidationVersion,
    references: includedReferences
    .sort((left, right) => left.id.localeCompare(right.id))
  };
  return canonicalSha256(payload);
}

export async function evaluateReferenceSet(references: CompetitorReference[], options: { projectId?: string } = {}): Promise<ReferenceSetState> {
  const included = references.filter((reference) => reference.included !== false);
  const counts = {
    includedCount: included.length,
    validCount: included.filter((reference) => reference.status === "valid" || reference.status === "approved").length,
    invalidCount: included.filter((reference) => reference.status === "invalid").length,
    duplicateCount: included.filter((reference) => reference.status === "duplicate").length,
    draftCount: included.filter((reference) => !reference.status || reference.status === "draft").length,
    excludedCount: references.length - included.length
  };
  if (!included.length) {
    return { status: "needs_validation", currentFingerprint: await referenceSetFingerprint(references, options), ...counts };
  }
  if (included.some((reference) => reference.status === "duplicate" || reference.status === "invalid" || !reference.status || reference.status === "draft")) {
    return { status: "needs_validation", currentFingerprint: await referenceSetFingerprint(references, options), ...counts };
  }
  return { status: "valid", validationRunAt: new Date().toISOString(), currentFingerprint: await referenceSetFingerprint(references, options), ...counts };
}

async function canonicalSha256(value: unknown): Promise<string> {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(Object.entries(input as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalize(item)]));
    }
    return input;
  };
  const bytes = new TextEncoder().encode(JSON.stringify(normalize(value)));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalUrlIdentity(parsed: URL): string {
  const ignoredParams = new Set(["t", "time_continue", "start", "list", "index", "pp", "si", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]);
  const normalized = new URL(parsed.toString());
  normalized.protocol = "https:";
  normalized.hostname = normalized.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  for (const key of [...normalized.searchParams.keys()]) {
    if (ignoredParams.has(key) || key.startsWith("utm_")) normalized.searchParams.delete(key);
  }
  normalized.hash = "";
  return `url:${normalized.toString()}`;
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
