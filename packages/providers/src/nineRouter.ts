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

export type NineRouterWebSearchFailure = NineRouterModelListFailure | "invalid_response_shape";

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

export class NineRouterWebSearchError extends Error {
  constructor(
    readonly status: NineRouterWebSearchFailure,
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

export interface NineRouterWebSearchModel {
  id: string;
  kind?: string;
}

export interface NineRouterWebSearchResult {
  title: string;
  url: string;
  displayUrl?: string;
  snippet?: string;
  content?: string;
  publishedAt?: string;
  position?: number;
  citation?: { provider?: string; retrievedAt?: string };
}

export interface NineRouterWebSearchResponse {
  provider?: string;
  query: string;
  results: NineRouterWebSearchResult[];
}

export interface ImageResult {
  url?: string;
  b64Json?: string;
  dataUri?: string;
}

export class NineRouterImageGenerationError extends Error {
  constructor(
    readonly status: NineRouterTextResponseFailure,
    message: string,
    readonly httpStatus?: number
  ) {
    super(message);
  }
}

export class NineRouterClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: NineRouterConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async listModels(): Promise<Array<{ id: string }>> {
    return this.listModelsAt("models");
  }

  async listImageModels(): Promise<Array<{ id: string }>> {
    return this.listModelsAt("models/image");
  }

  async listWebSearchModels(): Promise<NineRouterWebSearchModel[]> {
    const payload = await this.requestJson("models/web", new NineRouterModelListError("network_error", "9Router web-search model listing failed."));
    const models = (payload as { data?: Array<{ id?: unknown; kind?: unknown }> }).data;
    if (!Array.isArray(models)) throw new NineRouterModelListError("network_error", "9Router web-search model listing returned malformed JSON.");
    return models.flatMap((model) => {
      if (typeof model.id !== "string" || !model.id.trim()) return [];
      return [{ id: model.id.trim(), ...(typeof model.kind === "string" && model.kind.trim() ? { kind: model.kind.trim() } : {}) }];
    });
  }

  async searchWeb(input: { model: string; query: string; maxResults?: number; searchType?: "web" | "news"; timeoutMs?: number }): Promise<NineRouterWebSearchResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? this.config.timeoutMs ?? 60_000);
    try {
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.config.baseUrl.replace(/\/$/, "")}/search`, {
          method: "POST",
          headers: { ...this.headers(), "Content-Type": "application/json" },
          body: JSON.stringify({
            model: input.model,
            query: input.query,
            max_results: input.maxResults ?? 8,
            ...(input.searchType ? { search_type: input.searchType } : {})
          }),
          signal: controller.signal
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw new NineRouterWebSearchError("timeout", "9Router web search timed out.");
        throw new NineRouterWebSearchError("network_error", "9Router web search network error.");
      }
      if (!response.ok) throw new NineRouterWebSearchError(mapHttpStatus(response.status), `9Router web search failed: ${response.status}`, response.status);
      try {
        const payload = await response.json() as {
          provider?: unknown;
          query?: unknown;
          results?: Array<{
            title?: unknown;
            url?: unknown;
            display_url?: unknown;
            snippet?: unknown;
            content?: unknown;
            published_at?: unknown;
            position?: unknown;
            citation?: { provider?: unknown; retrieved_at?: unknown };
          }>;
        };
        if (!Array.isArray(payload.results) || typeof payload.query !== "string") throw new Error("missing search results");
        const results = payload.results.flatMap((result) => {
          if (typeof result.title !== "string" || !result.title.trim() || typeof result.url !== "string" || !result.url.trim()) return [];
          return [{
            title: result.title.trim(),
            url: result.url.trim(),
            ...(typeof result.display_url === "string" && result.display_url.trim() ? { displayUrl: result.display_url.trim() } : {}),
            ...(typeof result.snippet === "string" && result.snippet.trim() ? { snippet: result.snippet.trim() } : {}),
            ...(typeof result.content === "string" && result.content.trim() ? { content: result.content.trim() } : {}),
            ...(typeof result.published_at === "string" && result.published_at.trim() ? { publishedAt: result.published_at } : {}),
            ...(typeof result.position === "number" ? { position: result.position } : {}),
            ...(result.citation ? {
              citation: {
                ...(typeof result.citation.provider === "string" ? { provider: result.citation.provider } : {}),
                ...(typeof result.citation.retrieved_at === "string" ? { retrievedAt: result.citation.retrieved_at } : {})
              }
            } : {})
          }];
        });
        return {
          ...(typeof payload.provider === "string" && payload.provider.trim() ? { provider: payload.provider } : {}),
          query: payload.query,
          results
        };
      } catch (error) {
        if (error instanceof NineRouterWebSearchError) throw error;
        if (error instanceof Error && error.name === "AbortError") throw new NineRouterWebSearchError("timeout", "9Router web search timed out.");
        throw new NineRouterWebSearchError("invalid_response_shape", "9Router web search returned malformed JSON.");
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private async listModelsAt(path: string): Promise<Array<{ id: string }>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 10_000);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.baseUrl.replace(/\/$/, "")}/${path}`, {
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

  async createResponseText(input: { model: string; input: string; timeoutMs?: number; idempotencyKey?: string }): Promise<NineRouterTextResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? this.config.timeoutMs ?? 30_000);
    try {
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.config.baseUrl.replace(/\/$/, "")}/responses`, {
          method: "POST",
          headers: {
            ...this.headers(),
            "Content-Type": "application/json",
            ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {})
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
        if (error instanceof Error && error.name === "AbortError") {
          throw new NineRouterTextResponseError("timeout", "9Router text response timed out.");
        }
        throw new NineRouterTextResponseError("invalid_response_shape", "9Router text response returned malformed JSON.");
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  async createChatCompletionText(input: { model: string; prompt: string }): Promise<NineRouterTextResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 30_000);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { ...this.headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ model: input.model, messages: [{ role: "user", content: input.prompt }], stream: false }),
        signal: controller.signal
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new NineRouterTextResponseError("timeout", "9Router chat completion timed out.");
      throw new NineRouterTextResponseError("network_error", "9Router chat completion network error.");
    } finally { clearTimeout(timeout); }
    if (!response.ok) throw new NineRouterTextResponseError(mapHttpStatus(response.status), `9Router chat completion failed: ${response.status}`, response.status);
    try {
      const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }>; model?: unknown };
      const text = payload.choices?.map((choice) => choice.message?.content).find((value): value is string => typeof value === "string" && value.trim().length > 0);
      if (!text) throw new NineRouterTextResponseError("invalid_response_shape", "9Router chat completion response shape was not supported.");
      return { text, ...(typeof payload.model === "string" && payload.model.trim() ? { returnedModelId: payload.model } : {}) };
    } catch (error) {
      if (error instanceof NineRouterTextResponseError) throw error;
      throw new NineRouterTextResponseError("invalid_response_shape", "9Router chat completion returned malformed JSON.");
    }
  }

  async createImage(input: { model: string; prompt: string; aspectRatio: "16:9" | "9:16"; idempotencyKey?: string }): Promise<ImageResult[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 60_000);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.baseUrl.replace(/\/$/, "")}/images/generations`, {
        method: "POST",
        headers: { ...this.headers(), "Content-Type": "application/json", ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}) },
        // Request inline bytes where available so transient signed URLs never become persisted data.
        body: JSON.stringify({ model: input.model, prompt: input.prompt, size: input.aspectRatio === "9:16" ? "1024x1792" : "1792x1024", response_format: "b64_json" }),
        signal: controller.signal
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new NineRouterImageGenerationError("timeout", "9Router image generation timed out.");
      }
      throw new NineRouterImageGenerationError("network_error", "9Router image generation network error.");
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      throw new NineRouterImageGenerationError(mapHttpStatus(response.status), `9Router image generation failed: ${response.status}`, response.status);
    }
    try {
      const results = this.parseImageResults(await response.json());
      if (results.length === 0) throw new Error("missing image result");
      return results;
    } catch (error) {
      if (error instanceof NineRouterImageGenerationError) throw error;
      throw new NineRouterImageGenerationError("invalid_response_shape", "9Router image response shape was not supported.");
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

  private async requestJson(path: string, fallbackError: NineRouterModelListError): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 10_000);
    try {
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.config.baseUrl.replace(/\/$/, "")}/${path}`, { headers: this.headers(), signal: controller.signal });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw new NineRouterModelListError("timeout", "9Router request timed out.");
        throw fallbackError;
      }
      if (!response.ok) throw new NineRouterModelListError(mapHttpStatus(response.status), `9Router request failed: ${response.status}`, response.status);
      try {
        return await response.json();
      } catch {
        throw new NineRouterModelListError("network_error", "9Router request returned malformed JSON.");
      }
    } finally {
      clearTimeout(timeout);
    }
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
