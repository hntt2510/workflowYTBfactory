import { describe, expect, it, vi } from "vitest";
import type { ImageCertificationStore, ProviderCredentialStore } from "@lsf/db";
import type { ImageModelCertificationRecord } from "@lsf/domain";
import { fingerprintBaseUrl } from "./nineRouterTextCertificationService";
import { loadNineRouterImageCertification } from "./nineRouterImageCertificationService";

function credentialStore(input: {
  imageModel?: string;
  baseUrl?: string;
  credentialVersionRef?: string;
}): ProviderCredentialStore {
  return {
    loadProviderCredentialSettings: () => ({
      providerId: "9router",
      baseUrl: input.baseUrl ?? "https://example.test/v1",
      ...(input.imageModel ? { imageModel: input.imageModel } : {}),
      hasCredential: true
    }),
    loadProviderCredentialVersionRef: () => input.credentialVersionRef
  } as unknown as ProviderCredentialStore;
}

function certificationRecord(input: Partial<ImageModelCertificationRecord> = {}): ImageModelCertificationRecord {
  return {
    id: "image-cert-1",
    providerId: "9router",
    configuredModelId: "image-model-a",
    baseUrlFingerprint: fingerprintBaseUrl("https://example.test/v1")!,
    credentialVersionRef: "credential:v1",
    endpointStrategy: "images-generations",
    implementationVersion: "image-certification-v1",
    imageResponseTest: { status: "passed", latencyMs: 10 },
    overallStatus: "verified",
    testedAt: "2026-07-30T00:00:00.000Z",
    ...input
  };
}

describe("nineRouterImageCertificationService", () => {
  it("loads image certification by exact model, base URL fingerprint, and credential version", async () => {
    const expectedFingerprint = fingerprintBaseUrl("https://example.test/v1")!;
    const loadMatching = vi.fn(() => null);
    const result = await loadNineRouterImageCertification({
      credentialStore: credentialStore({ imageModel: "image-model-a", credentialVersionRef: "credential:v2" }),
      certificationStore: {
        loadMatching,
        loadLatest: () => null
      } as unknown as ImageCertificationStore
    });

    expect(result.status).toBe("not_tested");
    expect(loadMatching).toHaveBeenCalledWith({
      configuredModelId: "image-model-a",
      baseUrlFingerprint: expectedFingerprint,
      credentialVersionRef: "credential:v2"
    });
  });

  it("returns stale when latest image certification does not match current config", async () => {
    const result = await loadNineRouterImageCertification({
      credentialStore: credentialStore({ imageModel: "image-model-b", credentialVersionRef: "credential:v2" }),
      certificationStore: {
        loadMatching: () => null,
        loadLatest: () => certificationRecord()
      } as unknown as ImageCertificationStore
    });

    expect(result.status).toBe("stale");
    expect(result.record?.overallStatus).toBe("stale");
  });

  it("reports matching stale image certifications as stale, not failed", async () => {
    const result = await loadNineRouterImageCertification({
      credentialStore: credentialStore({ imageModel: "image-model-a", credentialVersionRef: "credential:v1" }),
      certificationStore: {
        loadMatching: () => certificationRecord({ overallStatus: "stale" }),
        loadLatest: () => null
      } as unknown as ImageCertificationStore
    });

    expect(result.status).toBe("stale");
    expect(result.message).toContain("stale");
  });
});
