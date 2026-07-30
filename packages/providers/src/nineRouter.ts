export interface ProviderCapabilities {
  chat: boolean;
  responses: boolean;
  structuredOutput: boolean;
  imageGeneration: boolean;
  imageEditing: boolean;
  videoGeneration: boolean;
  tts: boolean;
  stt: boolean;
  modelListing: boolean;
  supportedAspectRatios?: string[];
  maxImagesPerRequest?: number;
  maxConcurrency?: number;
}

export interface NineRouterConfig {
  baseUrl: string;
  apiKey?: string;
  textModel?: string;
  imageModel?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type NineRouterModelListFailure =
  | "unauthorized"
  | "endpoint_not_found"
  | "rate_limited"
  | "server_error"
  | "timeout"
  | "network_error";

export type NineRouterTextResponseFailure =
  | "unauthorized"
  | "endpoint_not_found"
  | "rate_limited"
  | "server_error"
  | "timeout"
  | "network_error"
  | "invalid_response_shape";

export class NineRouterModelListError extends Error {
  constructor(
    readonly status: NineRouterModelListFailure,
    message: string,
    readonly httpStatus?: number
  ) {
    super(message);
  }
}

export class NineRouterTextResponseError extends Error {
  constructor(
    readonly status: NineRouterTextResponseFailure,
    message: string,
    readonly httpStatus?: number
  ) {
    super(message);
  }
}

export interface NineRouterTextResponse {
  text: string;
  returnedModelId?: string;
}

export interface ImageResult {
  url?: string;
  b64Json?: string;
  dataUri?: string;
}

export class NineRouterClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: NineRouterConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async listModels(): Promise<Array<{ id: string }>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 10_000);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.baseUrl.replace(/\/$/, "")}/models`, {
        headers: this.headers(),
        signal: controller.signal
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new NineRouterModelListError("timeout", "9Router model listing timed out.");
      }
      throw new NineRouterModelListError("network_error", "9Router model listing network error.");
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      throw new NineRouterModelListError(mapHttpStatus(response.status), `9Router model listing failed: ${response.status}`, response.status);
    }
    try {
      const payload = (await response.json()) as { data?: Array<{ id?: unknown }> };
      return payload.data
        ?.map((model) => model.id)
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        .map((id) => ({ id })) ?? [];
    } catch {
      throw new NineRouterModelListError("network_error", "9Router model listing returned malformed JSON.");
    }
  }

  async createResponseText(input: { model: string; input: string }): Promise<NineRouterTextResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 30_000);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.baseUrl.replace(/\/$/, "")}/responses`, {
        method: "POST",
        headers: {
          ...this.headers(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: input.model,
          input: input.input
        }),
        signal: controller.signal
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new NineRouterTextResponseError("timeout", "9Router text response timed out.");
      }
      throw new NineRouterTextResponseError("network_error", "9Router text response network error.");
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new NineRouterTextResponseError(mapHttpStatus(response.status), `9Router text response failed: ${response.status}`, response.status);
    }

    try {
      const payload = await response.json();
      const text = extractResponseText(payload);
      const returnedModelId = extractReturnedModelId(payload);
      if (text === null) {
        throw new NineRouterTextResponseError("invalid_response_shape", "9Router text response shape was not supported.");
      }
      return {
        text,
        ...(returnedModelId ? { returnedModelId } : {})
      };
    } catch (error) {
      if (error instanceof NineRouterTextResponseError) throw error;
      throw new NineRouterTextResponseError("invalid_response_shape", "9Router text response returned malformed JSON.");
    }
  }

  inferCapabilities(models: string[]): ProviderCapabilities {
    return {
      chat: models.length > 0,
      responses: models.some((model) => /response|gpt|o\d/i.test(model)),
      structuredOutput: true,
      imageGeneration: models.some((model) => /image|vision|imagine|flux|sd/i.test(model)),
      imageEditing: models.some((model) => /edit|image/i.test(model)),
      videoGeneration: models.some((model) => /video|veo|sora|imagine/i.test(model)),
      tts: models.some((model) => /tts|voice|audio/i.test(model)),
      stt: models.some((model) => /stt|whisper|transcribe/i.test(model)),
      modelListing: true,
      maxConcurrency: 5
    };
  }

  parseImageResults(payload: unknown): ImageResult[] {
    const record = payload as {
      data?: Array<{ url?: string; b64_json?: string }>;
      choices?: Array<{
        message?: {
          images?: Array<{ url?: string; b64_json?: string }>;
          content?: string | Array<{ type?: string; text?: string; image_url?: { url?: string } }>;
        };
      }>;
    };
    const results: ImageResult[] = [];
    for (const item of record.data ?? []) {
      if (item.url) results.push({ url: item.url });
      if (item.b64_json) results.push({ b64Json: item.b64_json });
    }
    for (const choice of record.choices ?? []) {
      for (const image of choice.message?.images ?? []) {
        if (image.url) results.push({ url: image.url });
        if (image.b64_json) results.push({ b64Json: image.b64_json });
      }
      const content = choice.message?.content;
      if (typeof content === "string") {
        const dataUri = content.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/)?.[0];
        if (dataUri) results.push({ dataUri });
      } else {
        for (const part of content ?? []) {
          if (part.image_url?.url) results.push({ url: part.image_url.url });
          const dataUri = part.text?.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/)?.[0];
          if (dataUri) results.push({ dataUri });
        }
      }
    }
    return results;
  }

  private headers(): Record<string, string> {
    return this.config.apiKey
      ? { Authorization: `Bearer ${this.config.apiKey}` }
      : {};
  }
}

function mapHttpStatus(status: number): NineRouterModelListFailure {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "endpoint_not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500 && status <= 599) return "server_error";
  return "network_error";
}

function extractResponseText(payload: unknown): string | null {
  const record = payload as {
    output_text?: unknown;
    output?: Array<{
      content?: Array<{ text?: unknown; output_text?: unknown }>;
    }>;
    choices?: Array<{
      message?: { content?: unknown };
    }>;
  };

  if (typeof record.output_text === "string") return record.output_text;

  const outputParts: string[] = [];
  for (const item of record.output ?? []) {
    for (const part of item.content ?? []) {
      if (typeof part.text === "string") outputParts.push(part.text);
      if (typeof part.output_text === "string") outputParts.push(part.output_text);
    }
  }
  if (outputParts.length > 0) return outputParts.join("");

  const choiceParts = record.choices
    ?.map((choice) => choice.message?.content)
    .filter((content): content is string => typeof content === "string") ?? [];
  return choiceParts.length > 0 ? choiceParts.join("") : null;
}

function extractReturnedModelId(payload: unknown): string | undefined {
  const model = (payload as { model?: unknown }).model;
  return typeof model === "string" && model.trim().length > 0 ? model : undefined;
}
