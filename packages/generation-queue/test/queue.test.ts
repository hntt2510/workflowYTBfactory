import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PersistentGenerationQueue, RateLimitError } from "../src";

describe("PersistentGenerationQueue", () => {
  it("runs five image workers concurrently", async () => {
    const queue = new PersistentGenerationQueue({ defaultConcurrency: 5 });
    for (let index = 0; index < 5; index += 1) {
      queue.enqueue({
        projectId: "project",
        shotId: `shot-${index}`,
        requestType: "image",
        provider: "9router",
        model: "mock",
        promptVersionId: "prompt",
        idempotencyKey: `key-${index}`,
        priority: index
      });
    }
    let maxRunning = 0;
    let running = 0;
    await queue.runUntilIdle(async (job) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return { outputAssetIds: [`asset-${job.shotId}`] };
    });
    expect(maxRunning).toBe(5);
    expect(queue.snapshotWorkers().jobs.every((job) => job.state === "succeeded")).toBe(true);
  });

  it("recovers queued jobs after restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "lsf-queue-"));
    const storagePath = join(dir, "queue.json");
    try {
      const first = new PersistentGenerationQueue({ storagePath });
      first.enqueue({
        projectId: "project",
        shotId: "shot",
        requestType: "image",
        provider: "9router",
        model: "mock",
        promptVersionId: "prompt",
        idempotencyKey: "same",
        priority: 1
      });
      const second = new PersistentGenerationQueue({ storagePath });
      expect(second.snapshotWorkers().jobs).toHaveLength(1);
      expect(second.snapshotWorkers().jobs[0]?.state).toBe("queued");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("retries rate limits with retry-after", async () => {
    const queue = new PersistentGenerationQueue({ defaultConcurrency: 1, maxAutomaticRetries: 2 });
    queue.enqueue({
      projectId: "project",
      shotId: "shot",
      requestType: "image",
      provider: "9router",
      model: "mock",
      promptVersionId: "prompt",
      idempotencyKey: "rate-limit",
      priority: 1
    });
    let attempts = 0;
    await queue.runUntilIdle(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new RateLimitError("retry later", 1);
      }
      return { outputAssetIds: ["asset"] };
    });
    expect(attempts).toBe(2);
    expect(queue.snapshotWorkers().jobs[0]?.state).toBe("succeeded");
  });
});

