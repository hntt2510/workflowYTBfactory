import { describe, expect, it } from "vitest";
import { NineRouterClient, NineRouterModelListError, NineRouterTextResponseError, redactSecrets } from "../src";

describe("NineRouterClient", () => {
  it("parses common image result shapes", () => {
    const client = new NineRouterClient({ baseUrl: "http://localhost/v1" });
    const results = client.parseImageResults({
      data: [{ url: "https://example.com/a.png" }, { b64_json: "abc" }],
      choices: [{ message: { content: "result data:image/png;base64,AAAA" } }]
    });
    expect(results).toEqual([
      { url: "https://example.com/a.png" },
      { b64Json: "abc" },
      { dataUri: "data:image/png;base64,AAAA" }
    ]);
  });

  it("redacts bearer tokens", () => {
    expect(redactSecrets("Authorization: Bearer sk-secret")).not.toContain("sk-secret");
  });

  it("lists sanitized model ids", async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ data: [{ id: "model-a", owned_by: "x" }, { id: "" }, { other: "ignored" }, { id: "model-b" }] }));
    const client = new NineRouterClient({ baseUrl: "http://localhost/v1", apiKey: "sk-secret", fetchImpl });
    await expect(client.listModels()).resolves.toEqual([{ id: "model-a" }, { id: "model-b" }]);
  });

  it.each([
    [401, "unauthorized"],
    [403, "unauthorized"],
    [404, "endpoint_not_found"],
    [429, "rate_limited"],
    [500, "server_error"]
  ] as const)("maps HTTP %s to %s", async (httpStatus, status) => {
    const fetchImpl = async () => new Response("{}", { status: httpStatus });
    const client = new NineRouterClient({ baseUrl: "http://localhost/v1", apiKey: "sk-secret", fetchImpl });
    await expect(client.listModels()).rejects.toMatchObject({ status });
  });

  it("maps malformed JSON to network_error", async () => {
    const fetchImpl = async () => new Response("{");
    const client = new NineRouterClient({ baseUrl: "http://localhost/v1", apiKey: "sk-secret", fetchImpl });
    await expect(client.listModels()).rejects.toMatchObject({ status: "network_error" });
  });

  it("maps network failures to network_error", async () => {
    const fetchImpl = async () => {
      throw new Error("connect ECONNREFUSED");
    };
    const client = new NineRouterClient({ baseUrl: "http://localhost/v1", apiKey: "sk-secret", fetchImpl });
    await expect(client.listModels()).rejects.toMatchObject({ status: "network_error" });
  });

  it("maps abort timeout to timeout", async () => {
    const fetchImpl = (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    const client = new NineRouterClient({ baseUrl: "http://localhost/v1", apiKey: "sk-secret", fetchImpl, timeoutMs: 1 });
    await expect(client.listModels()).rejects.toBeInstanceOf(NineRouterModelListError);
    await expect(client.listModels()).rejects.toMatchObject({ status: "timeout" });
  });

  it("creates /responses text requests with internal authorization", async () => {
    const calls: Array<{ url: RequestInfo | URL; init?: RequestInit }> = [];
    const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url, ...(init ? { init } : {}) });
      return new Response(JSON.stringify({ output_text: "MODEL_OK", model: "returned-model" }));
    };
    const client = new NineRouterClient({ baseUrl: "http://localhost/v1", apiKey: "sk-secret", fetchImpl });
    const result = await client.createResponseText({ model: "model-a", input: "Reply exactly: MODEL_OK" });
    expect(String(calls[0]?.url)).toBe("http://localhost/v1/responses");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.headers).toMatchObject({
      Authorization: "Bearer sk-secret",
      "Content-Type": "application/json"
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ model: "model-a", input: "Reply exactly: MODEL_OK" });
    expect(result).toEqual({ text: "MODEL_OK", returnedModelId: "returned-model" });
    expect(JSON.stringify(result)).not.toContain("sk-secret");
  });

  it("extracts text from common /responses shapes", async () => {
    const payloads = [
      { output_text: "MODEL_OK" },
      { output: [{ content: [{ text: "MODEL" }, { output_text: "_OK" }] }] },
      { choices: [{ message: { content: "MODEL_OK" } }] }
    ];
    for (const payload of payloads) {
      const client = new NineRouterClient({ baseUrl: "http://localhost/v1", fetchImpl: async () => new Response(JSON.stringify(payload)) });
      await expect(client.createResponseText({ model: "model-a", input: "x" })).resolves.toMatchObject({ text: "MODEL_OK" });
    }
  });

  it("maps unsupported /responses shapes to invalid_response_shape", async () => {
    const client = new NineRouterClient({ baseUrl: "http://localhost/v1", fetchImpl: async () => new Response(JSON.stringify({ data: [] })) });
    await expect(client.createResponseText({ model: "model-a", input: "x" })).rejects.toMatchObject({ status: "invalid_response_shape" });
  });

  it.each([
    [401, "unauthorized"],
    [403, "unauthorized"],
    [404, "endpoint_not_found"],
    [429, "rate_limited"],
    [500, "server_error"]
  ] as const)("maps /responses HTTP %s to %s", async (httpStatus, status) => {
    const fetchImpl = async () => new Response("{}", { status: httpStatus });
    const client = new NineRouterClient({ baseUrl: "http://localhost/v1", apiKey: "sk-secret", fetchImpl });
    await expect(client.createResponseText({ model: "model-a", input: "x" })).rejects.toMatchObject({ status });
  });

  it("maps /responses network and timeout failures", async () => {
    const networkClient = new NineRouterClient({
      baseUrl: "http://localhost/v1",
      fetchImpl: async () => {
        throw new Error("connect ECONNREFUSED");
      }
    });
    await expect(networkClient.createResponseText({ model: "model-a", input: "x" })).rejects.toMatchObject({ status: "network_error" });

    const timeoutClient = new NineRouterClient({
      baseUrl: "http://localhost/v1",
      timeoutMs: 1,
      fetchImpl: (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        })
    });
    await expect(timeoutClient.createResponseText({ model: "model-a", input: "x" })).rejects.toBeInstanceOf(NineRouterTextResponseError);
    await expect(timeoutClient.createResponseText({ model: "model-a", input: "x" })).rejects.toMatchObject({ status: "timeout" });
  });
});
