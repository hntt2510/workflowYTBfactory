import { randomUUID } from "node:crypto";
import type { ImageCertificationStore, ProviderCredentialStore, StructuredLogger } from "@lsf/db";
import { imageModelCertificationResponseSchema } from "@lsf/domain";
import { NineRouterClient, NineRouterImageGenerationError } from "@lsf/providers";
import { fingerprintBaseUrl } from "./nineRouterTextCertificationService";

export async function loadNineRouterImageCertification(input: { credentialStore: ProviderCredentialStore; certificationStore: ImageCertificationStore }) {
  const settings = input.credentialStore.loadProviderCredentialSettings("9router");
  if (!settings?.imageModel) return imageModelCertificationResponseSchema.parse({ status: "not_tested", message: "No selected image model is available for certification.", errorCategory: "model_not_selected" });
  const fingerprint = fingerprintBaseUrl(settings.baseUrl); const credentialVersionRef = input.credentialStore.loadProviderCredentialVersionRef("9router");
  const matching = fingerprint ? input.certificationStore.loadMatching({ configuredModelId: settings.imageModel, baseUrlFingerprint: fingerprint, ...(credentialVersionRef ? { credentialVersionRef } : {}) }) : null;
  if (matching) return imageModelCertificationResponseSchema.parse({ status: matching.overallStatus, record: matching, message: imageCertificationMessage(matching.overallStatus) });
  const latest = input.certificationStore.loadLatest();
  return imageModelCertificationResponseSchema.parse(latest ? { status: "stale", record: { ...latest, overallStatus: "stale" }, message: "Previous image model certification does not match the current configuration." } : { status: "not_tested", message: "Image model has not been certified." });
}

export async function runNineRouterImageCertification(input: { credentialStore: ProviderCredentialStore; certificationStore: ImageCertificationStore; logger: StructuredLogger }) {
  const settings = input.credentialStore.loadProviderCredentialSettings("9router");
  const apiKey = await input.credentialStore.resolveProviderSecret("9router");
  const fingerprint = settings ? fingerprintBaseUrl(settings.baseUrl) : null;
  if (!settings || !apiKey || !settings.imageModel || !fingerprint) return imageModelCertificationResponseSchema.parse({ status: "failed", message: "Image credential, model, or base URL is unavailable.", errorCategory: !settings?.imageModel ? "model_not_selected" : "credential_missing" });
  const started = Date.now(); let category: "invalid_response_shape" | "unauthorized" | "endpoint_not_found" | "rate_limited" | "server_error" | "timeout" | "network_error" | "unknown_error" | undefined; let returnedModelId: string | undefined;
  try {
    const results = await new NineRouterClient({ baseUrl: settings.baseUrl, apiKey, timeoutMs: 60_000 }).createImage({ model: settings.imageModel, prompt: "A single plain blue square. No text, people, logos, or copyrighted characters.", aspectRatio: "16:9" });
    if (results.length !== 1 || (!results[0]?.b64Json && !results[0]?.dataUri && !results[0]?.url)) category = "invalid_response_shape";
  } catch (error) { category = error instanceof NineRouterImageGenerationError ? error.status : "unknown_error"; }
  const record = { id: `image-cert-${randomUUID()}`, providerId: "9router" as const, configuredModelId: settings.imageModel, ...(returnedModelId ? { returnedModelId } : {}), baseUrlFingerprint: fingerprint, ...(input.credentialStore.loadProviderCredentialVersionRef("9router") ? { credentialVersionRef: input.credentialStore.loadProviderCredentialVersionRef("9router") } : {}), endpointStrategy: "images-generations" as const, implementationVersion: "image-certification-v1" as const, imageResponseTest: { status: category ? "failed" as const : "passed" as const, latencyMs: Date.now() - started, ...(category ? { errorCategory: category } : {}) }, overallStatus: category ? "failed" as const : "verified" as const, testedAt: new Date().toISOString() };
  input.certificationStore.save(record); input.logger[record.overallStatus === "verified" ? "info" : "warn"]("nine_router_image_certification_completed", { providerId: "9router", modelId: settings.imageModel, status: record.overallStatus, errorCategory: category });
  return imageModelCertificationResponseSchema.parse({ status: record.overallStatus, record, message: record.overallStatus === "verified" ? "Image model certification verified." : "Image model certification failed.", ...(category ? { errorCategory: category } : {}) });
}

function imageCertificationMessage(status: "verified" | "failed" | "stale"): string {
  if (status === "verified") return "Image model certification verified.";
  if (status === "stale") return "Previous image model certification is stale for the current configuration.";
  return "Image model certification failed.";
}
