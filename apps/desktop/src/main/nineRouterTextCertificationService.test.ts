import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderCredentialStore, StructuredLogger, TextCertificationStore } from "@lsf/db";
import type { TextModelCertificationRecord } from "@lsf/domain";
import { fingerprintBaseUrl, loadNineRouterTextCertification, runNineRouterTextCertification } from "./nineRouterTextCertificationService";

function logger() {
  const entries: unknown[] = [];
  const item: StructuredLogger = {
    info: (_message, data) => entries.push(data),
    warn: (_message, data) => entries.push(data),
    error: (_message, data) => entries.push(data)
  };
  return { item, entries };
}

function credentialStore(input: {
  secret: string | null;
  textModel?: string;
  baseUrl?: string;
  credentialVersionRef?: string;
}): ProviderCredentialStore {
  return {
    loadProviderCredentialSettings: () => ({
      providerId: "9router",
      baseUrl: input.baseUrl ?? "https://example.test/v1",
      ...(input.textModel ? { textModel: input.textModel } : {}),
      hasCredential: Boolean(input.secret)
    }),
    resolveProviderSecret: async () => input.secret,
    loadProviderCredentialVersionRef: () => input.credentialVersionRef
  } as unknown as ProviderCredentialStore;
}

function certificationStore() {
  const records: TextModelCertificationRecord[] = [];
  const item = {
    saveTextCertificationRecord: (record: TextModelCertificationRecord) => records.push(record),
    loadLatestTextCertification: () => records.at(-1) ?? null,
    loadLatestMatchingTextCertification: () => records.at(-1) ?? null,
    markTextCertificationsStale: () => 0
  } as unknown as TextCertificationStore;
  return { item, records };
}

describe("nineRouterTextCertificationService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not call 9Router when credential or selected text model is missing", async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);
    const certs = certificationStore();
    const missingCredential = await runNineRouterTextCertification({
      credentialStore: credentialStore({ secret: null, textModel: "cx/gpt-5.5" }),
      certificationStore: certs.item,
      logger: logger().item
    });
    const missingModel = await runNineRouterTextCertification({
      credentialStore: credentialStore({ secret: "sk-secret" }),
      certificationStore: certs.item,
      logger: logger().item
    });
    expect(missingCredential.errorCategory).toBe("credential_missing");
    expect(missingModel.errorCategory).toBe("model_not_selected");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("verifies when exact text and strict JSON tests pass", async () => {
    vi.stubGlobal("fetch", async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { input: string };
      const text = body.input.includes("Reply exactly") ? " \r\nMODEL_OK\n" : "{\"status\":\"MODEL_OK\"}";
      return new Response(JSON.stringify({ output_text: text, model: "returned-model" }));
    });
    const certs = certificationStore();
    const log = logger();
    const result = await runNineRouterTextCertification({
      credentialStore: credentialStore({ secret: "sk-secret", textModel: "cx/gpt-5.5", credentialVersionRef: "credential:v1" }),
      certificationStore: certs.item,
      logger: log.item
    });
    expect(result.status).toBe("verified");
    expect(result.record?.exactTextTest.status).toBe("passed");
    expect(result.record?.strictJsonTest.status).toBe("passed");
    expect(result.record?.returnedModelId).toBe("returned-model");
    expect(JSON.stringify(result)).not.toContain("sk-secret");
    expect(JSON.stringify(log.entries)).not.toContain("sk-secret");
    expect(JSON.stringify(certs.records)).not.toContain("sk-secret");
  });

  it("runs JSON test after exact text mismatch but skips it for transport failures", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { input: string };
      calls.push(body.input);
      if (body.input.includes("Reply exactly")) return new Response(JSON.stringify({ output_text: "MODEL_OK." }));
      return new Response(JSON.stringify({ output_text: "{\"status\":\"MODEL_OK\"}" }));
    });
    const mismatchCerts = certificationStore();
    const mismatch = await runNineRouterTextCertification({
      credentialStore: credentialStore({ secret: "sk-secret", textModel: "cx/gpt-5.5" }),
      certificationStore: mismatchCerts.item,
      logger: logger().item
    });
    expect(mismatch.status).toBe("failed");
    expect(mismatch.record?.exactTextTest.errorCategory).toBe("exact_text_mismatch");
    expect(mismatch.record?.strictJsonTest.status).toBe("passed");
    expect(calls).toHaveLength(2);

    vi.stubGlobal("fetch", async () => new Response("{}", { status: 401 }));
    const transportCerts = certificationStore();
    const transport = await runNineRouterTextCertification({
      credentialStore: credentialStore({ secret: "sk-secret", textModel: "cx/gpt-5.5" }),
      certificationStore: transportCerts.item,
      logger: logger().item
    });
    expect(transport.record?.exactTextTest.errorCategory).toBe("unauthorized");
    expect(transport.record?.strictJsonTest.skipped).toBe(true);
  });

  it("fails strict JSON for code fences, extra fields, wrong values, and empty responses", async () => {
    for (const text of ["```json\n{\"status\":\"MODEL_OK\"}\n```", "{\"status\":\"MODEL_OK\",\"extra\":true}", "{\"status\":\"NO\"}", ""]) {
      vi.stubGlobal("fetch", async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { input: string };
        return new Response(JSON.stringify({ output_text: body.input.includes("Reply exactly") ? "MODEL_OK" : text }));
      });
      const certs = certificationStore();
      const result = await runNineRouterTextCertification({
        credentialStore: credentialStore({ secret: "sk-secret", textModel: "cx/gpt-5.5" }),
        certificationStore: certs.item,
        logger: logger().item
      });
      expect(result.status).toBe("failed");
      expect(result.record?.strictJsonTest.status).toBe("failed");
    }
  });

  it("bounds redacted previews and loads stale certification when current config does not match", async () => {
    vi.stubGlobal("fetch", async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { input: string };
      return new Response(JSON.stringify({ output_text: body.input.includes("Reply exactly") ? `MODEL_OK ${"x".repeat(3000)}` : "{\"status\":\"MODEL_OK\"}" }));
    });
    const certs = certificationStore();
    const result = await runNineRouterTextCertification({
      credentialStore: credentialStore({ secret: "sk-secret", textModel: "cx/gpt-5.5" }),
      certificationStore: certs.item,
      logger: logger().item
    });
    expect(result.record?.exactTextTest.redactedPreview?.length).toBeLessThanOrEqual(2000);
    expect(fingerprintBaseUrl("https://example.test/v1/")).toBe(fingerprintBaseUrl("https://example.test/v1"));

    const loaded = await loadNineRouterTextCertification({
      credentialStore: credentialStore({ secret: "sk-secret", textModel: "cx/gpt-5.5" }),
      certificationStore: {
        ...certs.item,
        loadLatestMatchingTextCertification: () => null
      } as unknown as TextCertificationStore
    });
    expect(loaded.status).toBe("stale");
  });

  it("loads certification by exact model, base URL fingerprint, and credential version", async () => {
    const expectedFingerprint = fingerprintBaseUrl("https://example.test/v1")!;
    const loadLatestMatchingTextCertification = vi.fn(() => null);
    const result = await loadNineRouterTextCertification({
      credentialStore: credentialStore({ secret: "sk-secret", textModel: "model-a", credentialVersionRef: "credential:v2" }),
      certificationStore: {
        ...certificationStore().item,
        loadLatestMatchingTextCertification
      } as unknown as TextCertificationStore
    });

    expect(result.status).toBe("not_tested");
    expect(loadLatestMatchingTextCertification).toHaveBeenCalledWith({
      providerId: "9router",
      configuredModelId: "model-a",
      baseUrlFingerprint: expectedFingerprint,
      credentialVersionRef: "credential:v2",
      endpointStrategy: "responses",
      implementationVersion: "text-certification-v1"
    });
  });
});
