import type { LoadedProviderCredentialSettings, ProviderCredentialStore, StructuredLogger } from "@lsf/db";
import type { ModelListStatus } from "@lsf/domain";
import { NineRouterClient, NineRouterModelListError } from "@lsf/providers";

export interface SanitizedModelListResult {
  status: ModelListStatus;
  models: Array<{ id: string }>;
  message: string;
}

export async function listNineRouterModels(input: {
  credentialStore: ProviderCredentialStore;
  logger: StructuredLogger;
  timeoutMs?: number;
}): Promise<SanitizedModelListResult> {
  const providerId = "9router";
  const settings = input.credentialStore.loadProviderCredentialSettings(providerId);
  if (!settings) {
    return credentialMissing(input.logger);
  }
  const secret = await input.credentialStore.resolveProviderSecret(providerId);
  if (!secret) {
    return credentialMissing(input.logger);
  }
  try {
    const client = createNineRouterClient(settings, secret, input.timeoutMs ?? 10_000);
    const models = await client.listModels();
    const status: ModelListStatus = models.length > 0 ? "models_discovered" : "empty_model_list";
    input.logger.info("nine_router_model_listing_succeeded", { providerId, status, modelCount: models.length });
    return {
      status,
      models,
      message: models.length > 0 ? "Models discovered." : "Endpoint reachable, but no models were returned."
    };
  } catch (error) {
    const status = error instanceof NineRouterModelListError ? error.status : "network_error";
    input.logger.warn("nine_router_model_listing_failed", {
      providerId,
      status,
      message: error instanceof Error ? error.message : String(error)
    });
    return {
      status,
      models: [],
      message: messageForStatus(status)
    };
  }
}

function createNineRouterClient(settings: LoadedProviderCredentialSettings, apiKey: string, timeoutMs: number): NineRouterClient {
  return new NineRouterClient({
    baseUrl: settings.baseUrl,
    apiKey,
    timeoutMs
  });
}

function credentialMissing(logger: StructuredLogger): SanitizedModelListResult {
  logger.warn("nine_router_model_listing_failed", { providerId: "9router", status: "unauthorized", message: "Credential is missing or unavailable." });
  return {
    status: "unauthorized",
    models: [],
    message: "Credential is missing or unavailable."
  };
}

function messageForStatus(status: ModelListStatus): string {
  if (status === "unauthorized") return "Credential was rejected by the endpoint.";
  if (status === "endpoint_not_found") return "The 9Router models endpoint was not found.";
  if (status === "rate_limited") return "The 9Router endpoint is rate limited. Try again later.";
  if (status === "server_error") return "The 9Router endpoint returned a server error.";
  if (status === "timeout") return "The 9Router model listing request timed out.";
  return "The 9Router model listing request failed before models could be read.";
}
