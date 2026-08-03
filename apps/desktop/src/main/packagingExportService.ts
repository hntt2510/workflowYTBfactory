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

export function verifyPackagingManifest(input: {
  workspaceRoot: string;
  artifactRelativeFilePath?: string;
  reviewedRelativeFilePath: string;
  reviewedSha256: string;
  reviewedArtifactIds: string[];
  reviewedProjectId: string;
  reviewedMp4RelativeFilePath?: string;
}): void {
  if (input.artifactRelativeFilePath !== input.reviewedRelativeFilePath) {
    throw new PackagingExportError("path_mismatch", "Package manifest path does not match the reviewed artifact.");
  }
  if (isAbsolute(input.reviewedRelativeFilePath)) {
    throw new PackagingExportError("unsafe_path", "Package manifest path must be workspace-relative.");
  }
  const packagePath = resolve(input.workspaceRoot, input.reviewedRelativeFilePath);
  const pathFromWorkspace = relative(input.workspaceRoot, packagePath);
  if (!pathFromWorkspace || pathFromWorkspace.startsWith("..") || isAbsolute(pathFromWorkspace) || resolve(input.workspaceRoot) === packagePath) {
    throw new PackagingExportError("unsafe_path", "Package manifest path is outside the workspace.");
  }
  if (!existsSync(packagePath)) {
    throw new PackagingExportError("missing_manifest", "Package manifest is missing.");
  }
  const content = readFileSync(packagePath);
  const sha256 = createHash("sha256").update(content).digest("hex");
  if (sha256 !== input.reviewedSha256) {
    throw new PackagingExportError("hash_mismatch", "Package manifest hash no longer matches the reviewed artifact.");
  }
  let manifest: { schemaVersion?: unknown; artifactIds?: unknown; project?: { id?: unknown }; media?: { mp4RelativeFilePath?: unknown } };
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
    const mp4Path = resolve(input.workspaceRoot, input.reviewedMp4RelativeFilePath);
    const mp4FromWorkspace = relative(input.workspaceRoot, mp4Path);
    if (!mp4FromWorkspace || mp4FromWorkspace.startsWith("..") || isAbsolute(mp4FromWorkspace) || resolve(input.workspaceRoot) === mp4Path || !existsSync(mp4Path)) {
      throw new PackagingExportError("missing_manifest", "Final MP4 export is missing or outside the workspace.");
    }
  }
}
