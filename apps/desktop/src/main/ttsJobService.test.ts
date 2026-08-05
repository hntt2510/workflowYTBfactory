import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TtsJobStore, openFactoryDatabase } from "@lsf/db";
import { TtsJobService } from "./ttsJobService";

function createService(durationForText: (text: string) => number, failText?: string, mergeFails = false) {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "lsf-tts-job-"));
  const db = openFactoryDatabase(join(workspaceRoot, "factory.sqlite"));
  const store = new TtsJobStore(db);
  const fittedSpeeds: number[] = [];
  const synthesizedTexts: string[] = [];
  let allowRetry = false;
  const manager = {
    synthesize: async (input: { text: string; outputPath: string; provider: "edge-tts" }) => {
      synthesizedTexts.push(input.text);
      if (input.text === failText && !allowRetry) throw new Error("provider unavailable");
      return { requestedProvider: input.provider, actualProvider: input.provider, voiceId: "vi-VN-HoaiMyNeural", outputPath: input.outputPath, attemptCount: 1, fallbackUsed: false };
    }
  };
  const service = new TtsJobService({
    store,
    manager: manager as never,
    workspaceRoot,
    outputPathFor: (jobId, segmentId) => join(workspaceRoot, "voice", jobId, `${segmentId}.mp3`),
    mergedOutputPathFor: (jobId) => join(workspaceRoot, "voice", jobId, "voiceover.mp3"),
    probeAudio: async (path) => ({ durationSeconds: durationForText(path.includes("second") ? "second" : "first") }),
    fitAudio: async (_input, _output, speed) => { fittedSpeeds.push(speed); },
    mergeAudio: async () => { if (mergeFails) throw new Error("merge unavailable"); }
  });
  return { service, store, db, fittedSpeeds, synthesizedTexts, enableRetry: () => { allowRetry = true; } };
}

describe("TtsJobService", () => {
  it("marks a batch partial on a failed segment and completes after retry", async () => {
    const fixture = createService(() => 0.8, "second");
    const created = fixture.service.create({
      provider: "edge-tts",
      voiceId: "vi-VN-HoaiMyNeural",
      language: "vi",
      segments: [
        { id: "first", text: "first", startSeconds: 0, endSeconds: 1 },
        { id: "second", text: "second", startSeconds: 1, endSeconds: 2 }
      ]
    });
    const partial = await fixture.service.run(created.id);
    expect(partial.state).toBe("partial");
    expect(partial.segments.find((segment) => segment.segmentId === "second")?.state).toBe("failed");

    fixture.enableRetry();
    const complete = await fixture.service.retrySegment(created.id, "second");
    expect(complete.state).toBe("success");
    expect(complete.mergedRelativeFilePath).toContain("voiceover.mp3");
    fixture.db.close();
  });

  it("caps automatic fit at 1.8x and exposes unfit timing overflow", async () => {
    const fixture = createService(() => 3);
    const created = fixture.service.create({
      provider: "edge-tts",
      voiceId: "vi-VN-HoaiMyNeural",
      language: "vi",
      segments: [
        { id: "first", text: "first", startSeconds: 0, endSeconds: 1 }
      ]
    });
    const completed = await fixture.service.run(created.id);

    expect(completed.state).toBe("partial");
    expect(completed.segments[0]?.timingOverflowSeconds).toBeCloseTo(2);
    expect(fixture.fittedSpeeds).toEqual([]);
    fixture.db.close();
  });

  it("keeps successful segments reviewable when the merged voiceover fails", async () => {
    const fixture = createService(() => 0.8, undefined, true);
    const created = fixture.service.create({
      provider: "edge-tts",
      voiceId: "vi-VN-HoaiMyNeural",
      language: "vi",
      segments: [{ id: "first", text: "first", startSeconds: 0, endSeconds: 1 }]
    });
    const completed = await fixture.service.run(created.id);

    expect(completed.state).toBe("partial");
    expect(completed.errorMessage).toContain("merge unavailable");
    expect(completed.segments[0]?.state).toBe("success");
    fixture.db.close();
  });

  it("keeps OmniVoice design and clone jobs on the persistent job path", async () => {
    const fixture = createService(() => 0.8);
    const created = fixture.service.create({
      provider: "omnivoice-local",
      voiceId: "omnivoice-local",
      language: "vi",
      segments: [{ id: "first", text: "first", startSeconds: 0, endSeconds: 1 }]
    });
    const completed = await fixture.service.run(created.id);

    expect(completed.provider).toBe("omnivoice-local");
    expect(completed.segments[0]?.requestedProvider).toBe("omnivoice-local");
    fixture.db.close();
  });

  it("does not resume recovered work and retries only the explicitly selected segment", async () => {
    const fixture = createService(() => 0.8);
    const created = fixture.service.create({
      provider: "edge-tts",
      voiceId: "vi-VN-HoaiMyNeural",
      language: "vi",
      segments: [{ id: "first", text: "first", startSeconds: 0, endSeconds: 1 }]
    });
    const stored = fixture.store.get(created.id)!;
    fixture.store.updateJob(created.id, "running", stored.job.payload);
    fixture.store.updateSegment(stored.segments[0]!.id, "running", stored.segments[0]!.payload);

    expect(fixture.store.recoverInterruptedJobs()).toBe(1);
    expect(fixture.service.listQueued()).toEqual([]);
    expect(fixture.synthesizedTexts).toEqual([]);
    expect(fixture.service.get(created.id)).toMatchObject({
      state: "failed",
      errorMessage: expect.stringContaining("previous application session"),
      segments: [{ segmentId: "first", state: "failed", errorCode: "interrupted" }]
    });

    const retried = await fixture.service.retrySegment(created.id, "first");
    expect(retried.state).toBe("success");
    expect(retried.errorMessage).toBeUndefined();
    expect(fixture.synthesizedTexts).toEqual(["first"]);
    fixture.db.close();
  });
});
