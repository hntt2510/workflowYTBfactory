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

  async listModels(): Promise<string[]> {
    const response = await this.fetchImpl(`${this.config.baseUrl.replace(/\/$/, "")}/models`, {
      headers: this.headers()
    });
    if (!response.ok) {
      throw new Error(`9Router model listing failed: ${response.status}`);
    }
    const payload = (await response.json()) as { data?: Array<{ id?: string }> };
    return payload.data?.map((model) => model.id).filter((id): id is string => Boolean(id)) ?? [];
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

