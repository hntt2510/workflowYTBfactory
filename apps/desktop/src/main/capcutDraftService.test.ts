import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CapCutDraftError, runCapCutDraftBridge } from "./capcutDraftService";

let validBridge = "";
let invalidBridge = "";

beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), "lsf-capcut-"));
  validBridge = join(directory, "valid.cjs");
  invalidBridge = join(directory, "invalid.cjs");
  await writeFile(validBridge, 'process.stdin.resume(); process.stdin.on("end", () => console.log(JSON.stringify({ ok: true, structurallyValidated: true, draftDirectory: "draft", contentPath: "draft/draft_content.json", trackCounts: { video: 1, audio: 1, text: 0 } })));');
  await writeFile(invalidBridge, 'process.stdin.resume(); process.stdin.on("end", () => console.log("not-json"));');
});

describe("CapCut bridge runner", () => {
  it("accepts only structural draft responses", async () => {
    await expect(runCapCutDraftBridge({ pythonPath: process.execPath, bridgePath: validBridge, payload: {} })).resolves.toMatchObject({ trackCounts: { video: 1, audio: 1, text: 0 } });
  });

  it("rejects malformed bridge output", async () => {
    await expect(runCapCutDraftBridge({ pythonPath: process.execPath, bridgePath: invalidBridge, payload: {} })).rejects.toMatchObject({ category: "invalid_output" } satisfies Partial<CapCutDraftError>);
  });
});
