import { randomUUID } from "node:crypto";
import type { ProviderCredentialStore, StructuredLogger, TextCertificationStore } from "@lsf/db";
import { redactString } from "@lsf/db";
import { textCertificationJsonPayloadSchema, textModelCertificationResponseSchema, type TextCertificationErrorCategory, type TextModelCertificationRecord } from "@lsf/domain";
import { CockpitTextProvider, TextProviderError, type TextProvider } from "@lsf/providers";
import { fingerprintBaseUrl } from "./nineRouterTextCertificationService";

export const activeTextProviderId = "cockpit";
const endpointStrategy = "responses";
const implementationVersion = "text-capability-v1" as const;

export async function listActiveTextModels(input: { credentialStore: ProviderCredentialStore; logger: StructuredLogger; timeoutMs?: number }) {
  const settings = input.credentialStore.loadProviderCredentialSettings(activeTextProviderId);
  const apiKey = await input.credentialStore.resolveProviderSecret(activeTextProviderId);
  if (!settings || !apiKey) return { status: "unauthorized" as const, models: [], message: "Text provider credential is missing or unavailable." };
  try {
    const models = await new CockpitTextProvider({ baseUrl: settings.baseUrl, apiKey, ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}) }).listModels();
    return { status: models.length ? "models_discovered" as const : "empty_model_list" as const, models, message: models.length ? "Models discovered." : "Endpoint reachable, but no models were returned." };
  } catch (error) {
    const status = error instanceof TextProviderError ? ({ authentication_failed: "unauthorized", model_not_found: "endpoint_not_found", rate_limited: "rate_limited", timeout: "timeout", provider_unavailable: "network_error", request_failed: "server_error", invalid_response: "network_error", invalid_json: "network_error", schema_validation_failed: "network_error" }[error.code] ?? "network_error") : "network_error";
    input.logger.warn("text_provider_model_listing_failed", { providerId: activeTextProviderId, status });
    return { status, models: [], message: "Text provider model listing failed before models could be read." };
  }
}

export async function loadActiveTextCapability(input: { credentialStore: ProviderCredentialStore; certificationStore: TextCertificationStore }) {
  const settings = input.credentialStore.loadProviderCredentialSettings(activeTextProviderId);
  if (!settings?.textModel) return textModelCertificationResponseSchema.parse({ status: "not_tested", message: "No selected text model is available for verification.", errorCategory: "model_not_selected" });
  const fingerprint = fingerprintBaseUrl(settings.baseUrl);
  const version = input.credentialStore.loadProviderCredentialVersionRef(activeTextProviderId);
  const matching = fingerprint ? input.certificationStore.loadLatestMatchingTextCertification({ providerId: activeTextProviderId, configuredModelId: settings.textModel, baseUrlFingerprint: fingerprint, endpointStrategy, implementationVersion, ...(version ? { credentialVersionRef: version } : {}) }) : null;
  if (matching) return textModelCertificationResponseSchema.parse({ status: matching.overallStatus, record: matching, message: capabilityMessage(matching.overallStatus) });
  const latest = input.certificationStore.loadLatestTextCertification(activeTextProviderId);
  if (latest) return textModelCertificationResponseSchema.parse({ status: "stale", record: latest.overallStatus === "stale" ? latest : { ...latest, overallStatus: "stale" }, message: "Previous text capability verification does not match the current configuration." });
  return textModelCertificationResponseSchema.parse({ status: "not_tested", message: "Text capability has not been verified." });
}

export async function runActiveTextCapability(input: { credentialStore: ProviderCredentialStore; certificationStore: TextCertificationStore; logger: StructuredLogger; timeoutMs?: number }) {
  const settings = input.credentialStore.loadProviderCredentialSettings(activeTextProviderId);
  if (!settings) return failure("credential_missing", "Text provider settings are missing.");
  if (!settings.textModel) return failure("model_not_selected", "Select a text model before verification.");
  const fingerprint = fingerprintBaseUrl(settings.baseUrl);
  if (!fingerprint) return failure("invalid_base_url", "Saved text provider base URL is invalid.");
  const apiKey = await input.credentialStore.resolveProviderSecret(activeTextProviderId);
  if (!apiKey) return failure("credential_missing", "Text provider credential is missing or unavailable.");
  const provider = new CockpitTextProvider({ baseUrl: settings.baseUrl, apiKey, timeoutMs: input.timeoutMs ?? 30_000 });
  const exact = await verifyExact(provider, settings.textModel);
  const json = exact.result.status === "passed" ? await verifyStructured(provider, settings.textModel) : { result: { status: "failed" as const, latencyMs: 0, errorCategory: exact.result.errorCategory ?? "unknown_error", skipped: true } };
  const record: TextModelCertificationRecord = { id: `text-capability-${randomUUID()}`, providerId: activeTextProviderId, configuredModelId: settings.textModel, ...(exact.returnedModelId || json.returnedModelId ? { returnedModelId: exact.returnedModelId ?? json.returnedModelId } : {}), baseUrlFingerprint: fingerprint, ...(input.credentialStore.loadProviderCredentialVersionRef(activeTextProviderId) ? { credentialVersionRef: input.credentialStore.loadProviderCredentialVersionRef(activeTextProviderId) } : {}), endpointStrategy, implementationVersion, exactTextTest: exact.result, strictJsonTest: json.result, overallStatus: exact.result.status === "passed" && json.result.status === "passed" ? "verified" : "failed", testedAt: new Date().toISOString() };
  input.certificationStore.saveTextCertificationRecord(record);
  input.logger[record.overallStatus === "verified" ? "info" : "warn"]("text_provider_capability_completed", { providerId: activeTextProviderId, modelId: settings.textModel, status: record.overallStatus });
  return textModelCertificationResponseSchema.parse({ status: record.overallStatus, record, message: capabilityMessage(record.overallStatus), ...(record.overallStatus === "failed" ? { errorCategory: record.exactTextTest.errorCategory ?? record.strictJsonTest.errorCategory ?? "unknown_error" } : {}) });
}

export async function resolveActiveTextProvider(input: { credentialStore: ProviderCredentialStore; certificationStore: TextCertificationStore }): Promise<{ provider: TextProvider; model: string }> {
  const capability = await loadActiveTextCapability(input);
  if (capability.status !== "verified") throw new TextProviderError("request_failed", "Verified text capability is required.", { providerId: activeTextProviderId, operation: "health_check" });
  const settings = input.credentialStore.loadProviderCredentialSettings(activeTextProviderId);
  const apiKey = await input.credentialStore.resolveProviderSecret(activeTextProviderId);
  if (!settings?.textModel || !apiKey) throw new TextProviderError("authentication_failed", "Text provider credential is missing or unavailable.", { providerId: activeTextProviderId, operation: "health_check" });
  return { provider: new CockpitTextProvider({ baseUrl: settings.baseUrl, apiKey }), model: settings.textModel };
}

async function verifyExact(provider: TextProvider, model: string): Promise<{ result: TextModelCertificationRecord["exactTextTest"]; returnedModelId?: string }> {
  const started = Date.now();
  try { const response = await provider.generateText({ model, input: "Reply exactly: MODEL_OK" }); const ok = response.text.trim() === "MODEL_OK"; return { result: { status: ok ? "passed" : "failed", latencyMs: Date.now() - started, ...(ok ? { redactedPreview: redactString(response.text).slice(0, 2000) } : { errorCategory: "exact_text_mismatch", redactedPreview: redactString(response.text).slice(0, 2000) }) }, ...(response.returnedModelId ? { returnedModelId: response.returnedModelId } : {}) }; } catch (error) { return { result: { status: "failed", latencyMs: Date.now() - started, errorCategory: category(error) } }; }
}

async function verifyStructured(provider: TextProvider, model: string): Promise<{ result: TextModelCertificationRecord["strictJsonTest"]; returnedModelId?: string }> {
  const started = Date.now();
  try { await provider.generateStructured({ model, input: "Reply with exactly this JSON object: {\"status\":\"MODEL_OK\"}", schema: textCertificationJsonPayloadSchema }); return { result: { status: "passed", latencyMs: Date.now() - started } }; } catch (error) { return { result: { status: "failed", latencyMs: Date.now() - started, errorCategory: category(error) } }; }
}

function category(error: unknown): TextCertificationErrorCategory { return error instanceof TextProviderError ? error.code : "unknown_error"; }
function failure(errorCategory: TextCertificationErrorCategory, message: string) { return textModelCertificationResponseSchema.parse({ status: "failed", message, errorCategory }); }
function capabilityMessage(status: "verified" | "failed" | "stale") { return status === "verified" ? "Text provider capability verified." : status === "stale" ? "Previous text capability verification is stale." : "Text provider capability verification failed."; }
