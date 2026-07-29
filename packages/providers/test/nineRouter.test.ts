import { describe, expect, it } from "vitest";
import { NineRouterClient, NineRouterModelListError, redactSecrets } from "../src";

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
});
