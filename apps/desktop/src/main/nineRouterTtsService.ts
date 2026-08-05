export type NineRouterTtsVoiceProvider = "edge-tts" | "google-tts";

export function canonicalNineRouterTtsModel(provider: NineRouterTtsVoiceProvider, model: string): string {
  const normalizedModel = model.trim();
  return normalizedModel.includes("/") ? normalizedModel : `${provider}/${normalizedModel}`;
}

interface NineRouterTtsClient {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
}

function endpoint(baseUrl: string, path: string): string {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, "").replace(/\/v1$/, "")}${path}`;
  url.search = "";
  return url.href;
}

function headers(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

async function request(input: NineRouterTtsClient, url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 60_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const detail = body.replace(/\s+/g, " ").trim().slice(0, 300);
      throw new Error(`9Router TTS request failed (${response.status})${detail ? `: ${detail}` : "."}`);
    }
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("9Router TTS request timed out.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function listNineRouterTtsCatalog(input: NineRouterTtsClient & { provider: NineRouterTtsVoiceProvider; language: string }): Promise<{ models: Array<{ id: string }>; voices: Array<{ id: string; label: string }>; message: string }> {
  const [modelsResponse, voicesResponse] = await Promise.all([
    request(input, endpoint(input.baseUrl, "/v1/models/tts"), { headers: headers(input.apiKey) }),
    request(input, `${endpoint(input.baseUrl, "/v1/audio/voices")}?provider=${encodeURIComponent(input.provider)}&lang=${encodeURIComponent(input.language)}`, { headers: headers(input.apiKey) })
  ]);
  const modelsPayload = await modelsResponse.json() as { data?: Array<{ id?: unknown }> };
  const voicesPayload = await voicesResponse.json() as { data?: Array<{ model?: unknown; name?: unknown; label?: unknown }> };
  const models = (modelsPayload.data ?? []).flatMap((item) => typeof item.id === "string" && item.id.trim() ? [{ id: item.id }] : []);
  const voices = (voicesPayload.data ?? []).flatMap((item) => {
    if (typeof item.model !== "string" || !item.model.trim()) return [];
    const model = canonicalNineRouterTtsModel(input.provider, item.model);
    const name = typeof item.label === "string" ? item.label.trim() : typeof item.name === "string" ? item.name.trim() : "";
    return [{ id: model, label: name && name !== model ? `${name} (${model})` : model }];
  });
  if (!voices.length) throw new Error(`9Router returned no ${input.language} voices for ${input.provider}.`);
  return { models, voices, message: `${voices.length} ${input.language} voices discovered from 9Router.` };
}

export async function generateNineRouterTts(input: NineRouterTtsClient & { model: string; text: string; outputPath: string }): Promise<void> {
  const response = await request(input, `${endpoint(input.baseUrl, "/v1/audio/speech")}?response_format=mp3`, {
    method: "POST",
    headers: { ...headers(input.apiKey), "Content-Type": "application/json" },
    body: JSON.stringify({ model: input.model, input: input.text.normalize("NFC") })
  });
  if (response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    const body = await response.text().catch(() => "");
    throw new Error(`9Router TTS returned JSON instead of MP3${body ? `: ${body.replace(/\s+/g, " ").slice(0, 300)}` : "."}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length <= 100) throw new Error("9Router TTS returned an empty audio response.");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(input.outputPath, bytes);
}
