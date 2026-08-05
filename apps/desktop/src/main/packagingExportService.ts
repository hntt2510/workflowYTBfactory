import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";

const currentPackagingManifestSchemaVersion = 1;

export const packagingExportRequiredStageIds = [
  "qa",
  "preview-render",
  "timeline-assembly",
  "subtitle-preparation",
  "voice-generation",
  "asset-review",
  "asset-acquisition",
  "prompt-preparation",
  "script"
] as const;

export class PackagingExportError extends Error {
  constructor(readonly category: "path_mismatch" | "unsafe_path" | "missing_manifest" | "hash_mismatch" | "manifest_mismatch", message: string) { super(message); }
}

function resolveSafeWorkspaceFile(input: { workspaceRoot: string; artifactRelativeFilePath?: string; reviewedRelativeFilePath: string }): string {
  if (input.artifactRelativeFilePath !== undefined && input.artifactRelativeFilePath !== input.reviewedRelativeFilePath) {
    throw new PackagingExportError("path_mismatch", "Package output path does not match the reviewed artifact.");
  }
  if (isAbsolute(input.reviewedRelativeFilePath)) throw new PackagingExportError("unsafe_path", "Package output path must be workspace-relative.");
  const resolvedPath = resolve(input.workspaceRoot, input.reviewedRelativeFilePath);
  const pathFromWorkspace = relative(input.workspaceRoot, resolvedPath);
  if (!pathFromWorkspace || pathFromWorkspace.startsWith("..") || isAbsolute(pathFromWorkspace) || resolve(input.workspaceRoot) === resolvedPath) {
    throw new PackagingExportError("unsafe_path", "Package output path is outside the workspace.");
  }
  if (!existsSync(resolvedPath)) throw new PackagingExportError("missing_manifest", "Package output file is missing.");
  return resolvedPath;
}

function verifyFileHash(filePath: string, expectedSha256: string): void {
  const sha256 = createHash("sha256").update(readFileSync(filePath)).digest("hex");
  if (sha256 !== expectedSha256) throw new PackagingExportError("hash_mismatch", "Package output hash no longer matches the reviewed artifact.");
}

export function verifyPackagingManifest(input: {
  workspaceRoot: string;
  artifactRelativeFilePath?: string;
  reviewedRelativeFilePath: string;
  reviewedSha256: string;
  reviewedArtifactIds: string[];
  reviewedProjectId: string;
  reviewedMp4RelativeFilePath?: string;
  reviewedSubtitleRelativeFilePath?: string;
}): void {
  const packagePath = resolveSafeWorkspaceFile(input);
  const content = readFileSync(packagePath);
  verifyFileHash(packagePath, input.reviewedSha256);
  let manifest: { schemaVersion?: unknown; artifactIds?: unknown; project?: { id?: unknown }; media?: { mp4RelativeFilePath?: unknown; subtitleRelativeFilePath?: unknown } };
  try {
    manifest = JSON.parse(content.toString("utf8")) as { schemaVersion?: unknown; artifactIds?: unknown; project?: { id?: unknown } };
  } catch {
    throw new PackagingExportError("manifest_mismatch", "Package manifest is not valid JSON.");
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new PackagingExportError("manifest_mismatch", "Package manifest must be a JSON object.");
  }
  if (manifest.schemaVersion !== currentPackagingManifestSchemaVersion) {
    throw new PackagingExportError("manifest_mismatch", "Package manifest schema version does not match the current verifier.");
  }
  if (manifest.project?.id !== input.reviewedProjectId) {
    throw new PackagingExportError("manifest_mismatch", "Package manifest project ID does not match the reviewed project.");
  }
  if (!Array.isArray(manifest.artifactIds) || manifest.artifactIds.length !== input.reviewedArtifactIds.length || manifest.artifactIds.some((id, index) => id !== input.reviewedArtifactIds[index])) {
    throw new PackagingExportError("manifest_mismatch", "Package manifest artifact IDs do not match the reviewed artifact.");
  }
  if (input.reviewedMp4RelativeFilePath) {
    if (manifest.media?.mp4RelativeFilePath !== input.reviewedMp4RelativeFilePath || isAbsolute(input.reviewedMp4RelativeFilePath)) {
      throw new PackagingExportError("manifest_mismatch", "Package manifest MP4 path does not match the reviewed export.");
    }
    resolveSafeWorkspaceFile({ workspaceRoot: input.workspaceRoot, reviewedRelativeFilePath: input.reviewedMp4RelativeFilePath });
  }
  if (input.reviewedSubtitleRelativeFilePath) {
    if (manifest.media?.subtitleRelativeFilePath !== input.reviewedSubtitleRelativeFilePath || isAbsolute(input.reviewedSubtitleRelativeFilePath)) {
      throw new PackagingExportError("manifest_mismatch", "Package manifest subtitle path does not match the reviewed export.");
    }
    resolveSafeWorkspaceFile({ workspaceRoot: input.workspaceRoot, reviewedRelativeFilePath: input.reviewedSubtitleRelativeFilePath });
  }
}

export function verifyFinalMp4(input: {
  workspaceRoot: string;
  artifactRelativeFilePath?: string;
  reviewedRelativeFilePath: string;
  reviewedSha256: string;
  reviewedMp4RelativeFilePath: string;
}): void {
  if (input.reviewedRelativeFilePath !== input.reviewedMp4RelativeFilePath) {
    throw new PackagingExportError("path_mismatch", "Final MP4 path does not match the reviewed package output.");
  }
  const mp4Path = resolveSafeWorkspaceFile(input);
  verifyFileHash(mp4Path, input.reviewedSha256);
}
