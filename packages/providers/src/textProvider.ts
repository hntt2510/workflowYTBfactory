import type { ZodType } from "zod";

export type TextProviderErrorCode =
  | "provider_unavailable"
  | "authentication_failed"
  | "model_not_found"
  | "rate_limited"
  | "timeout"
  | "invalid_response"
  | "invalid_json"
  | "schema_validation_failed"
  | "request_failed";

export class TextProviderError extends Error {
  constructor(
    readonly code: TextProviderErrorCode,
    message: string,
    readonly context: { providerId: string; operation: "health_check" | "list_models" | "generate_text" | "generate_structured"; model?: string; httpStatus?: number }
  ) {
    super(message);
  }
}

export interface TextProviderModel {
  id: string;
}

export interface TextProviderHealth {
  reachable: boolean;
  modelsAvailable: boolean;
}

export interface TextProviderStructuredResult<T> {
  data: T;
  returnedModelId?: string;
}

export interface TextProvider {
  readonly providerId: string;
  healthCheck(input?: { timeoutMs?: number }): Promise<TextProviderHealth>;
  listModels(input?: { timeoutMs?: number }): Promise<TextProviderModel[]>;
  generateText(input: { model: string; input: string; timeoutMs?: number }): Promise<{ text: string; returnedModelId?: string }>;
  generateStructured<T>(input: { model: string; input: string; schema: ZodType<T>; normalize?: (value: unknown) => unknown; timeoutMs?: number }): Promise<TextProviderStructuredResult<T>>;
}

export interface CockpitTextProviderConfig {
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** OpenAI-compatible adapter for a user-configured Cockpit server. */
export class CockpitTextProvider implements TextProvider {
  readonly providerId = "cockpit";
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: CockpitTextProviderConfig) {
    this.baseUrl = normalizeCockpitBaseUrl(config.baseUrl);
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async healthCheck(input: { timeoutMs?: number } = {}): Promise<TextProviderHealth> {
    const models = await this.listModels(input);
    return { reachable: true, modelsAvailable: models.length > 0 };
  }

  async listModels(input: { timeoutMs?: number } = {}): Promise<TextProviderModel[]> {
    const payload = await this.requestJson("models", "list_models", input.timeoutMs);
    const data = isRecord(payload) ? payload.data : undefined;
    if (!Array.isArray(data)) throw this.error("invalid_response", "Cockpit model listing returned an unsupported response.", "list_models");
    return data.flatMap((entry) => isRecord(entry) && typeof entry.id === "string" && entry.id.trim() ? [{ id: entry.id.trim() }] : []);
  }

  async generateText(input: { model: string; input: string; timeoutMs?: number }): Promise<{ text: string; returnedModelId?: string }> {
    const payload = await this.requestJson("responses", "generate_text", input.timeoutMs, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: input.model, input: input.input })
    }, input.model);
    const text = extractOpenAiResponseText(payload);
    if (!text) throw this.error("invalid_response", "Cockpit response contained no usable output text.", "generate_text", input.model);
    const model = isRecord(payload) && typeof payload.model === "string" && payload.model.trim() ? payload.model.trim() : undefined;
    return { text, ...(model ? { returnedModelId: model } : {}) };
  }

  async generateStructured<T>(input: { model: string; input: string; schema: ZodType<T>; normalize?: (value: unknown) => unknown; timeoutMs?: number }): Promise<TextProviderStructuredResult<T>> {
    let response: { text: string; returnedModelId?: string };
    try {
      response = await this.generateText(input);
    } catch (error) {
      if (error instanceof TextProviderError) throw error;
      throw this.error("request_failed", "Cockpit structured generation failed.", "generate_structured", input.model);
    }
    return parseStructuredText({ ...input, response, providerId: this.providerId });
  }

  private async requestJson(path: "models" | "responses", operation: TextProviderError["context"]["operation"], timeoutMs?: number, init: RequestInit = {}, model?: string): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs ?? this.config.timeoutMs ?? 30_000);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/${path}`, {
        ...init,
        headers: { ...this.authorizationHeader(), ...(init.headers ?? {}) },
        signal: controller.signal
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw this.error("timeout", "Cockpit request timed out.", operation, model);
      throw this.error("provider_unavailable", "Cockpit could not be reached.", operation, model);
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw this.error(httpErrorCode(response.status), `Cockpit request failed with status ${response.status}.`, operation, model, response.status);
    try {
      return await response.json();
    } catch {
      throw this.error("invalid_response", "Cockpit returned malformed JSON.", operation, model);
    }
  }

  private authorizationHeader(): Record<string, string> {
    return this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {};
  }

  private error(code: TextProviderErrorCode, message: string, operation: TextProviderError["context"]["operation"], model?: string, httpStatus?: number): TextProviderError {
    return new TextProviderError(code, message, { providerId: this.providerId, operation, ...(model ? { model } : {}), ...(httpStatus ? { httpStatus } : {}) });
  }
}

/** Central structured transport boundary shared by production adapters and test seams. */
export function parseStructuredText<T>(input: { response: { text: string; returnedModelId?: string }; model: string; schema: ZodType<T>; normalize?: (value: unknown) => unknown; providerId: string }): TextProviderStructuredResult<T> {
  let json: unknown;
  const text = input.response.text.replace(/^\uFEFF/, "").trim();
  if (!text) throw new TextProviderError("invalid_response", "Structured response was empty.", { providerId: input.providerId, operation: "generate_structured", model: input.model });
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  try { json = JSON.parse(candidate); }
  catch { throw new TextProviderError("invalid_json", "Structured response was not valid JSON.", { providerId: input.providerId, operation: "generate_structured", model: input.model }); }
  for (let depth = 0; depth < 3 && isRecord(json); depth += 1) {
    const record = json;
    const wrapper = ["data", "result", "response", "output"].find((key) => isRecord(record[key]) && (Object.keys(record).length === 1 || Object.keys(record[key]).length > 0));
    if (!wrapper) break;
    json = record[wrapper];
  }
  const parsed = input.schema.safeParse(input.normalize ? input.normalize(json) : json);
  if (!parsed.success) throw new TextProviderError("schema_validation_failed", "Structured response did not match the required schema.", { providerId: input.providerId, operation: "generate_structured", model: input.model });
  return { data: parsed.data, ...(input.response.returnedModelId ? { returnedModelId: input.response.returnedModelId } : {}) };
}

export function normalizeCockpitBaseUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Cockpit base URL must use http or https.");
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/v1") ? path : `${path}/v1`;
  return url.toString().replace(/\/$/, "");
}

function httpErrorCode(status: number): TextProviderErrorCode {
  if (status === 401 || status === 403) return "authentication_failed";
  if (status === 404) return "model_not_found";
  if (status === 429) return "rate_limited";
  return "request_failed";
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

export function extractOpenAiResponseText(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  const parts: string[] = [];
  if (Array.isArray(payload.output)) for (const output of payload.output) {
    if (!isRecord(output) || !Array.isArray(output.content)) continue;
    for (const content of output.content) if (isRecord(content)) {
      if (typeof content.text === "string" && content.text.trim()) parts.push(content.text);
      else if (typeof content.output_text === "string" && content.output_text.trim()) parts.push(content.output_text);
    }
  }
  if (parts.length) return parts.join("");
  if (Array.isArray(payload.choices)) for (const choice of payload.choices) {
    const content = isRecord(choice) && isRecord(choice.message) ? choice.message.content : undefined;
    if (typeof content === "string" && content.trim()) return content;
  }
  return null;
}

function stripJsonFence(value: string): string {
  const trimmed = value.replace(/^\uFEFF/, "").trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}
