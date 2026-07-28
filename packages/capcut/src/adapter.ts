import { framesToMicroseconds, type Timeline } from "@lsf/domain";

export interface CapCutDraftAdapter {
  version: string;
  createDraft(input: CapCutDraftInput): Promise<CapCutDraftManifest>;
}

export interface CapCutDraftInput {
  projectId: string;
  draftDirectory: string;
  timeline: Timeline;
}

export interface CapCutDraftManifest {
  projectId: string;
  adapterVersion: string;
  draftDirectory: string;
  tracks: Array<{
    id: string;
    sourceId: string;
    startUs: number;
    durationUs: number;
  }>;
}

export class ManifestOnlyCapCutAdapter implements CapCutDraftAdapter {
  version = "manifest-only-v1";

  async createDraft(input: CapCutDraftInput): Promise<CapCutDraftManifest> {
    return {
      projectId: input.projectId,
      adapterVersion: this.version,
      draftDirectory: input.draftDirectory,
      tracks: input.timeline.items.map((item) => ({
        id: item.id,
        sourceId: item.sourceId,
        startUs: framesToMicroseconds(item.startFrame, item.fps),
        durationUs: framesToMicroseconds(item.durationFrames, item.fps)
      }))
    };
  }
}

