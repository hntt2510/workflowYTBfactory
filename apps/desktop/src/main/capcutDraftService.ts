import { spawn } from "node:child_process";

export class CapCutDraftError extends Error {
  constructor(readonly category: "bridge_failed" | "bridge_timeout" | "invalid_output", message: string) { super(message); }
}

export async function runCapCutDraftBridge(input: {
  pythonPath: string;
  bridgePath: string;
  payload: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<{ draftDirectory: string; contentPath: string; trackCounts: { video: number; audio: number; text: number } }> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.pythonPath, [input.bridgePath], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (callback: () => void) => { if (!settled) { settled = true; clearTimeout(timeout); callback(); } };
    const timeout = setTimeout(() => {
      child.kill();
      finish(() => reject(new CapCutDraftError("bridge_timeout", "CapCut bridge timed out.")));
    }, input.timeoutMs ?? 60_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout = (stdout + chunk).slice(0, 16_384); });
    child.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(0, 4_096); });
    child.on("error", () => finish(() => reject(new CapCutDraftError("bridge_failed", "CapCut bridge could not start."))));
    child.on("close", (code) => finish(() => {
      if (code !== 0) return reject(new CapCutDraftError("bridge_failed", "CapCut bridge failed."));
      try {
        const result = JSON.parse(stdout) as { ok?: boolean; structurallyValidated?: boolean; draftDirectory?: string; contentPath?: string; trackCounts?: { video?: number; audio?: number; text?: number } };
        const video = result.trackCounts?.video;
        const audio = result.trackCounts?.audio;
        const text = result.trackCounts?.text;
        if (!result.ok || !result.structurallyValidated || !result.draftDirectory || !result.contentPath || typeof video !== "number" || !Number.isInteger(video) || video < 1 || typeof audio !== "number" || !Number.isInteger(audio) || audio < 1 || typeof text !== "number" || !Number.isInteger(text) || text < 0) throw new Error("invalid bridge response");
        resolve({ draftDirectory: result.draftDirectory, contentPath: result.contentPath, trackCounts: { video, audio, text } });
      } catch { reject(new CapCutDraftError("invalid_output", "CapCut bridge returned invalid structural validation.")); }
    }));
    child.stdin.end(JSON.stringify(input.payload));
  });
}
