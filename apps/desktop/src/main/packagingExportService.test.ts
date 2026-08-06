import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PackagingExportError, packagingExportRequiredStageIds, verifyFinalMp4, verifyPackagingManifest } from "./packagingExportService";

describe("packaging export review gate", () => {
  it("accepts the reviewed package manifest only when the file hash still matches", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lsf-package-"));
    const relativeFilePath = "exports/project-1/package.json";
    const text = JSON.stringify({ schemaVersion: 1, project: { id: "project-1" }, artifactIds: ["a1", "a2", "a3", "a4", "a5", "a6"] });
    await mkdir(join(workspaceRoot, "exports", "project-1"), { recursive: true });
    await writeFile(join(workspaceRoot, relativeFilePath), text, "utf8");

    expect(() => verifyPackagingManifest({
      workspaceRoot,
      artifactRelativeFilePath: relativeFilePath,
      reviewedRelativeFilePath: relativeFilePath,
      reviewedSha256: createHash("sha256").update(text).digest("hex"),
      reviewedArtifactIds: ["a1", "a2", "a3", "a4", "a5", "a6"],
      reviewedProjectId: "project-1"
    })).not.toThrow();
  });

  it("rejects a package manifest edited after review", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lsf-package-"));
    const relativeFilePath = "exports/project-1/package.json";
    await mkdir(join(workspaceRoot, "exports", "project-1"), { recursive: true });
    await writeFile(join(workspaceRoot, relativeFilePath), "reviewed", "utf8");
    const reviewedSha256 = createHash("sha256").update("reviewed").digest("hex");
    await writeFile(join(workspaceRoot, relativeFilePath), "tampered", "utf8");

    expect(() => verifyPackagingManifest({
      workspaceRoot,
      artifactRelativeFilePath: relativeFilePath,
      reviewedRelativeFilePath: relativeFilePath,
      reviewedSha256,
      reviewedArtifactIds: ["a1", "a2", "a3", "a4", "a5", "a6"],
      reviewedProjectId: "project-1"
    })).toThrowError(PackagingExportError);
  });

  it("rejects a package manifest whose artifact IDs differ from the reviewed payload", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lsf-package-"));
    const relativeFilePath = "exports/project-1/package.json";
    const text = JSON.stringify({ schemaVersion: 1, project: { id: "project-1" }, artifactIds: ["a1", "a2", "a3", "a4", "a5", "other"] });
    await mkdir(join(workspaceRoot, "exports", "project-1"), { recursive: true });
    await writeFile(join(workspaceRoot, relativeFilePath), text, "utf8");

    expect(() => verifyPackagingManifest({
      workspaceRoot,
      artifactRelativeFilePath: relativeFilePath,
      reviewedRelativeFilePath: relativeFilePath,
      reviewedSha256: createHash("sha256").update(text).digest("hex"),
      reviewedArtifactIds: ["a1", "a2", "a3", "a4", "a5", "a6"],
      reviewedProjectId: "project-1"
    })).toThrowError(PackagingExportError);
  });

  it("rejects a package manifest whose project ID differs from the reviewed project", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lsf-package-"));
    const relativeFilePath = "exports/project-1/package.json";
    const text = JSON.stringify({ schemaVersion: 1, project: { id: "other-project" }, artifactIds: ["a1", "a2", "a3", "a4", "a5", "a6"] });
    await mkdir(join(workspaceRoot, "exports", "project-1"), { recursive: true });
    await writeFile(join(workspaceRoot, relativeFilePath), text, "utf8");

    expect(() => verifyPackagingManifest({
      workspaceRoot,
      artifactRelativeFilePath: relativeFilePath,
      reviewedRelativeFilePath: relativeFilePath,
      reviewedSha256: createHash("sha256").update(text).digest("hex"),
      reviewedArtifactIds: ["a1", "a2", "a3", "a4", "a5", "a6"],
      reviewedProjectId: "project-1"
    })).toThrowError(PackagingExportError);
  });

  it("rejects a package manifest with a stale schema version", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lsf-package-"));
    const relativeFilePath = "exports/project-1/package.json";
    const text = JSON.stringify({ schemaVersion: 0, project: { id: "project-1" }, artifactIds: ["a1", "a2", "a3", "a4", "a5", "a6"] });
    await mkdir(join(workspaceRoot, "exports", "project-1"), { recursive: true });
    await writeFile(join(workspaceRoot, relativeFilePath), text, "utf8");

    expect(() => verifyPackagingManifest({
      workspaceRoot,
      artifactRelativeFilePath: relativeFilePath,
      reviewedRelativeFilePath: relativeFilePath,
      reviewedSha256: createHash("sha256").update(text).digest("hex"),
      reviewedArtifactIds: ["a1", "a2", "a3", "a4", "a5", "a6"],
      reviewedProjectId: "project-1"
    })).toThrowError(PackagingExportError);
  });

  it("rejects a package manifest that is not valid JSON", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lsf-package-"));
    const relativeFilePath = "exports/project-1/package.json";
    const text = "{not-json";
    await mkdir(join(workspaceRoot, "exports", "project-1"), { recursive: true });
    await writeFile(join(workspaceRoot, relativeFilePath), text, "utf8");

    expect(() => verifyPackagingManifest({
      workspaceRoot,
      artifactRelativeFilePath: relativeFilePath,
      reviewedRelativeFilePath: relativeFilePath,
      reviewedSha256: createHash("sha256").update(text).digest("hex"),
      reviewedArtifactIds: ["a1", "a2", "a3", "a4", "a5", "a6"],
      reviewedProjectId: "project-1"
    })).toThrowError(PackagingExportError);
  });

  it("rejects a package manifest that is not a JSON object", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lsf-package-"));
    const relativeFilePath = "exports/project-1/package.json";
    const text = "null";
    await mkdir(join(workspaceRoot, "exports", "project-1"), { recursive: true });
    await writeFile(join(workspaceRoot, relativeFilePath), text, "utf8");

    expect(() => verifyPackagingManifest({
      workspaceRoot,
      artifactRelativeFilePath: relativeFilePath,
      reviewedRelativeFilePath: relativeFilePath,
      reviewedSha256: createHash("sha256").update(text).digest("hex"),
      reviewedArtifactIds: ["a1", "a2", "a3", "a4", "a5", "a6"],
      reviewedProjectId: "project-1"
    })).toThrowError(PackagingExportError);
  });

  it("rejects absolute manifest paths", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lsf-package-"));
    const absoluteFilePath = join(workspaceRoot, "exports", "project-1", "package.json");

    expect(() => verifyPackagingManifest({
      workspaceRoot,
      artifactRelativeFilePath: absoluteFilePath,
      reviewedRelativeFilePath: absoluteFilePath,
      reviewedSha256: "0".repeat(64),
      reviewedArtifactIds: ["a1", "a2", "a3", "a4", "a5", "a6"],
      reviewedProjectId: "project-1"
    })).toThrowError(PackagingExportError);
  });

  it("verifies an MP4-only export when the manifest is disabled", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lsf-package-mp4-"));
    const relativeFilePath = "exports/project-1/final.mp4";
    const content = "real mp4 bytes";
    await mkdir(join(workspaceRoot, "exports", "project-1"), { recursive: true });
    await writeFile(join(workspaceRoot, relativeFilePath), content, "utf8");

    expect(() => verifyFinalMp4({
      workspaceRoot,
      artifactRelativeFilePath: relativeFilePath,
      reviewedRelativeFilePath: relativeFilePath,
      reviewedSha256: createHash("sha256").update(content).digest("hex"),
      reviewedMp4RelativeFilePath: relativeFilePath
    })).not.toThrow();
  });

  it("validates an optional subtitle file referenced by the manifest", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "lsf-package-subtitles-"));
    const manifestPath = "exports/project-1/package.json";
    const subtitlePath = "exports/project-1/final.srt";
    const text = JSON.stringify({ schemaVersion: 1, project: { id: "project-1" }, artifactIds: ["a1", "a2", "a3", "a4", "a5", "a6"], media: { subtitleRelativeFilePath: subtitlePath } });
    await mkdir(join(workspaceRoot, "exports", "project-1"), { recursive: true });
    await writeFile(join(workspaceRoot, manifestPath), text, "utf8");
    await writeFile(join(workspaceRoot, subtitlePath), "1\n00:00:00,000 --> 00:00:01,000\nXin chao\n", "utf8");

    expect(() => verifyPackagingManifest({
      workspaceRoot,
      artifactRelativeFilePath: manifestPath,
      reviewedRelativeFilePath: manifestPath,
      reviewedSha256: createHash("sha256").update(text).digest("hex"),
      reviewedArtifactIds: ["a1", "a2", "a3", "a4", "a5", "a6"],
      reviewedProjectId: "project-1",
      reviewedSubtitleRelativeFilePath: subtitlePath
    })).not.toThrow();
  });

  it("requires the full reviewed handoff artifact set", () => {
    expect(packagingExportRequiredStageIds).toEqual([
      "qa",
      "preview-render",
      "timeline-assembly",
      "subtitle-preparation",
      "voice-generation",
      "asset-review",
      "asset-acquisition",
      "prompt-preparation",
      "script"
    ]);
  });
});
