import { z } from "zod";
import { describe, expect, it } from "vitest";
import { CockpitTextProvider, normalizeCockpitBaseUrl } from "../src";

function provider(response: Response | (() => Response | Promise<Response>), baseUrl = "http://localhost:55773/v1/") {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  return {
    calls,
    client: new CockpitTextProvider({ baseUrl, apiKey: "test-secret", fetchImpl: async (url, init) => { calls.push({ url: String(url), ...(init ? { init } : {}) }); return typeof response === "function" ? response() : response; } })
  };
}

describe("CockpitTextProvider", () => {
  it("normalizes trailing slashes and an omitted v1 path", () => {
    expect(normalizeCockpitBaseUrl("http://localhost:55773/v1/")).toBe("http://localhost:55773/v1");
    expect(normalizeCockpitBaseUrl("http://localhost:55773/")).toBe("http://localhost:55773/v1");
  });

  it("lists models with bearer authentication", async () => {
    const { client, calls } = provider(new Response(JSON.stringify({ data: [{ id: "gpt-a" }] })));
    await expect(client.listModels()).resolves.toEqual([{ id: "gpt-a" }]);
    expect(calls[0]?.url).toBe("http://localhost:55773/v1/models");
    expect(new Headers(calls[0]?.init?.headers).get("Authorization")).toBe("Bearer test-secret");
  });

  it("rejects malformed model payloads", async () => {
    const { client } = provider(new Response(JSON.stringify({ models: [] })));
    await expect(client.listModels()).rejects.toMatchObject({ code: "invalid_response" });
  });

  it.each([
    [{ output_text: "OK", model: "gpt-returned" }, "OK"],
    [{ output: [{ content: [{ type: "output_text", text: "nested" }] }] }, "nested"],
    [{ choices: [{ message: { content: "compat" } }] }, "compat"]
  ])("generates text from supported Responses shapes", async (payload, text) => {
    const { client, calls } = provider(new Response(JSON.stringify(payload)));
    await expect(client.generateText({ model: "gpt-input", input: "hello" })).resolves.toMatchObject({ text });
    expect(calls[0]?.url).toBe("http://localhost:55773/v1/responses");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ model: "gpt-input", input: "hello" });
  });

  it("returns the model reported by Cockpit", async () => {
    const { client } = provider(new Response(JSON.stringify({ output_text: "OK", model: "gpt-returned" })));
    await expect(client.generateText({ model: "gpt-input", input: "hello" })).resolves.toEqual({ text: "OK", returnedModelId: "gpt-returned" });
  });

  it.each([[401, "authentication_failed"], [403, "authentication_failed"], [404, "model_not_found"], [429, "rate_limited"], [500, "request_failed"]] as const)("normalizes HTTP %s", async (status, code) => {
    const { client } = provider(new Response("{}", { status }));
    await expect(client.generateText({ model: "gpt", input: "hello" })).rejects.toMatchObject({ code, context: { httpStatus: status } });
  });

  it("handles malformed JSON and missing text", async () => {
    const malformed = provider(new Response("{"));
    await expect(malformed.client.generateText({ model: "gpt", input: "hello" })).rejects.toMatchObject({ code: "invalid_response" });
    const missing = provider(new Response(JSON.stringify({ output: [] })));
    await expect(missing.client.generateText({ model: "gpt", input: "hello" })).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("normalizes connection and abort failures", async () => {
    const offline = new CockpitTextProvider({ baseUrl: "http://localhost:55773/v1", fetchImpl: async () => { throw new Error("offline"); } });
    await expect(offline.listModels()).rejects.toMatchObject({ code: "provider_unavailable" });
    const timeout = new CockpitTextProvider({ baseUrl: "http://localhost:55773/v1", fetchImpl: async () => { const error = new Error("aborted"); error.name = "AbortError"; throw error; } });
    await expect(timeout.listModels()).rejects.toMatchObject({ code: "timeout" });
  });

  it("validates structured JSON centrally", async () => {
    const schema = z.object({ status: z.literal("OK") });
    const valid = provider(new Response(JSON.stringify({ output_text: "```json\n{\"status\":\"OK\"}\n```" })));
    await expect(valid.client.generateStructured({ model: "gpt", input: "json", schema })).resolves.toEqual({ data: { status: "OK" } });
    const invalidJson = provider(new Response(JSON.stringify({ output_text: "not-json" })));
    await expect(invalidJson.client.generateStructured({ model: "gpt", input: "json", schema })).rejects.toMatchObject({ code: "invalid_json" });
    const wrongSchema = provider(new Response(JSON.stringify({ output_text: "{\"status\":\"NO\"}" })));
    await expect(wrongSchema.client.generateStructured({ model: "gpt", input: "json", schema })).rejects.toMatchObject({ code: "schema_validation_failed" });
  });

  it("normalizes structured JSON before validation and retains returned model metadata", async () => {
    const schema = z.object({ status: z.literal("OK") });
    const { client } = provider(new Response(JSON.stringify({ output_text: "{\"value\":\"OK\"}", model: "gpt-returned" })));
    await expect(client.generateStructured({ model: "gpt", input: "json", schema, normalize: (value) => ({ status: (value as { value?: unknown }).value }) })).resolves.toEqual({ data: { status: "OK" }, returnedModelId: "gpt-returned" });
  });
});
