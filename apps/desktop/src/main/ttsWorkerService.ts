import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";

export class TtsWorkerError extends Error {
  constructor(readonly category: "worker_unavailable" | "worker_timeout" | "worker_failed", message: string) { super(message); }
}

interface WorkerReply { id: string; ok: boolean; result?: unknown; error?: string; }

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export class TtsWorkerClient {
  private child: ChildProcessWithoutNullStreams | undefined;
  private readonly pending = new Map<string, PendingRequest>();

  constructor(private readonly input: { pythonPath: string; workerPath: string }) {}

  async health(provider: "edge-tts" | "gtts" | "kokoro-vietnamese", probe = false): Promise<{ ready: boolean; message: string }> {
    return this.request({ action: "health", provider, probe }, probe ? 60_000 : 15_000) as Promise<{ ready: boolean; message: string }>;
  }

  async listVoices(provider: "edge-tts" | "gtts" | "kokoro-vietnamese", language: string): Promise<Array<{ id: string; label: string; language: string; gender: "female" | "male" | "neutral" | "unknown"; description?: string }>> {
    return this.request({ action: "listVoices", provider, language }, 30_000) as Promise<Array<{ id: string; label: string; language: string; gender: "female" | "male" | "neutral" | "unknown"; description?: string }>>;
  }

  async synthesize(input: { provider: "edge-tts" | "gtts" | "kokoro-vietnamese"; text: string; voiceId: string; language: string; rate: number; outputPath: string }, timeoutMs = 5 * 60_000): Promise<void> {
    await this.request({ action: "synthesize", ...input }, timeoutMs);
  }

  dispose(): void {
    this.reset(new TtsWorkerError("worker_unavailable", "TTS worker was stopped."));
  }

  private request(payload: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    const child = this.ensureStarted();
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.reset(new TtsWorkerError("worker_timeout", "TTS provider timed out."));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      try {
        child.stdin.write(`${JSON.stringify({ id, ...payload })}\n`);
      } catch {
        this.reset(new TtsWorkerError("worker_unavailable", "TTS worker is unavailable."));
      }
    });
  }

  private ensureStarted(): ChildProcessWithoutNullStreams {
    if (this.child && !this.child.killed) return this.child;
    const child = spawn(this.input.pythonPath, [this.input.workerPath], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    this.child = child;
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => this.handleReply(line));
    child.on("error", () => this.reset(new TtsWorkerError("worker_unavailable", "TTS Python worker could not start.")));
    child.on("close", () => this.reset(new TtsWorkerError("worker_unavailable", "TTS Python worker stopped unexpectedly.")));
    return child;
  }

  private handleReply(line: string): void {
    let reply: WorkerReply;
    try { reply = JSON.parse(line) as WorkerReply; } catch { return; }
    const pending = this.pending.get(reply.id);
    if (!pending) return;
    this.pending.delete(reply.id);
    clearTimeout(pending.timeout);
    if (!reply.ok) pending.reject(new TtsWorkerError("worker_failed", reply.error || "Local TTS provider failed."));
    else pending.resolve(reply.result);
  }

  private reset(error: Error): void {
    const child = this.child;
    this.child = undefined;
    if (child && !child.killed) child.kill();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
