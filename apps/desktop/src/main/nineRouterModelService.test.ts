import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderCredentialStore, StructuredLogger } from "@lsf/db";
import { listNineRouterModels } from "./nineRouterModelService";

function logger() {
  const entries: unknown[] = [];
  const item: StructuredLogger = {
    info: (_message, data) => entries.push(data),
    warn: (_message, data) => entries.push(data),
    error: (_message, data) => entries.push(data)
  };
  return { item, entries };
}

function store(secret: string | null): ProviderCredentialStore {
  return {
    loadProviderCredentialSettings: () => ({
      providerId: "9router",
      baseUrl: "https://example.test/v1",
      hasCredential: Boolean(secret)
    }),
    resolveProviderSecret: async () => secret
  } as unknown as ProviderCredentialStore;
}

describe("listNineRouterModels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not call 9Router when credential is missing", async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);
    const log = logger();
    const result = await listNineRouterModels({ credentialStore: store(null), logger: log.item });
    expect(result).toEqual({
      status: "unauthorized",
      models: [],
      message: "Credential is missing or unavailable."
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns sanitized successful model ids", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ data: [{ id: "model-a" }] })));
    const log = logger();
    const result = await listNineRouterModels({ credentialStore: store("sk-secret"), logger: log.item });
    expect(result).toEqual({
      status: "models_discovered",
      models: [{ id: "model-a" }],
      message: "Models discovered."
    });
    expect(JSON.stringify(result)).not.toContain("sk-secret");
    expect(JSON.stringify(log.entries)).not.toContain("sk-secret");
  });

  it("returns empty_model_list for an empty successful response", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ data: [] })));
    const result = await listNineRouterModels({ credentialStore: store("sk-secret"), logger: logger().item });
    expect(result.status).toBe("empty_model_list");
    expect(result.models).toEqual([]);
  });
});
