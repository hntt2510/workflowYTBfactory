import { spawn } from "node:child_process";

export class TtsBridgeError extends Error {
  constructor(readonly category: "bridge_failed" | "bridge_timeout" | "invalid_output", message: string) { super(message); }
}

export async function runTtsBridge(input: {
  pythonPath: string;
  bridgePath: string;
  payload: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.pythonPath, [input.bridgePath], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (callback: () => void) => { if (!settled) { settled = true; clearTimeout(timeout); callback(); } };
    const timeout = setTimeout(() => {
      child.kill();
      finish(() => reject(new TtsBridgeError("bridge_timeout", "TTS provider timed out.")));
    }, input.timeoutMs ?? 5 * 60_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout = (stdout + chunk).slice(0, 16_384); });
    child.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(0, 1_000); });
    child.on("error", () => finish(() => reject(new TtsBridgeError("bridge_failed", "TTS Python bridge could not start."))));
    child.on("close", (code) => finish(() => {
      if (code !== 0) {
        const detail = stderr.trim().split("\n").at(-1);
        return reject(new TtsBridgeError("bridge_failed", detail ? `TTS provider failed: ${detail}` : "TTS provider failed. Install the selected provider in the configured Python environment."));
      }
      try {
        const result = JSON.parse(stdout) as { ok?: boolean };
        if (!result.ok) throw new Error("invalid bridge response");
        resolve();
      } catch {
        reject(new TtsBridgeError("invalid_output", "TTS Python bridge returned invalid output."));
      }
    }));
    child.stdin.end(JSON.stringify(input.payload));
  });
}
