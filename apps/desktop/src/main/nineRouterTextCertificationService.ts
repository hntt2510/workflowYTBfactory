import { createHash, randomUUID } from "node:crypto";
import type { ProviderCredentialStore, StructuredLogger, TextCertificationStore } from "@lsf/db";
import { redactString } from "@lsf/db";
import type { TextCertificationErrorCategory, TextModelCertificationRecord } from "@lsf/domain";
import { textCertificationJsonPayloadSchema, textModelCertificationResponseSchema } from "@lsf/domain";
import { NineRouterClient, NineRouterTextResponseError } from "@lsf/providers";

const providerId = "9router";
const endpointStrategy = "responses";
const implementationVersion = "text-certification-v1";
const exactTextPrompt = "Reply exactly: MODEL_OK";
const strictJsonPrompt = "Reply with exactly this JSON object and no markdown, code fences, or explanation:\n{\"status\":\"MODEL_OK\"}";

type CertificationResponse = ReturnType<typeof textModelCertificationResponseSchema.parse>;

export async function loadNineRouterTextCertification(input: {
  credentialStore: ProviderCredentialStore;
  certificationStore: TextCertificationStore;
}): Promise<CertificationResponse> {
  const settings = input.credentialStore.loadProviderCredentialSettings(providerId);
  if (!settings?.textModel) {
    return textModelCertificationResponseSchema.parse({
      status: "not_tested",
      message: "No selected text model is available for certification.",
      errorCategory: "model_not_selected"
    });
  }

  const fingerprint = fingerprintBaseUrl(settings.baseUrl);
  const credentialVersionRef = input.credentialStore.loadProviderCredentialVersionRef(providerId);
  const matching = fingerprint
    ? input.certificationStore.loadLatestMatchingTextCertification({
        providerId,
        configuredModelId: settings.textModel,
        baseUrlFingerprint: fingerprint,
        endpointStrategy,
        implementationVersion,
        ...(credentialVersionRef ? { credentialVersionRef } : {})
      })
    : null;

  if (matching) {
    return textModelCertificationResponseSchema.parse({
      status: matching.overallStatus,
      record: matching,
      message: messageForOverallStatus(matching.overallStatus)
    });
  }

  const latest = input.certificationStore.loadLatestTextCertification(providerId);
  if (latest) {
    return textModelCertificationResponseSchema.parse({
      status: "stale",
      record: latest.overallStatus === "stale" ? latest : { ...latest, overallStatus: "stale" },
      message: "Previous text model certification does not match the current configuration."
    });
  }

  return textModelCertificationResponseSchema.parse({
    status: "not_tested",
    message: "Text model has not been certified."
  });
}

export async function runNineRouterTextCertification(input: {
  credentialStore: ProviderCredentialStore;
  certificationStore: TextCertificationStore;
  logger: StructuredLogger;
  timeoutMs?: number;
}): Promise<CertificationResponse> {
  const settings = input.credentialStore.loadProviderCredentialSettings(providerId);
  if (!settings) return failure("credential_missing", "9Router provider settings are missing.");
  if (!settings.textModel) return failure("model_not_selected", "Select a text model before certification.");
  const baseUrlFingerprint = fingerprintBaseUrl(settings.baseUrl);
  if (!baseUrlFingerprint) return failure("invalid_base_url", "Saved 9Router base URL is invalid.");
  const apiKey = await input.credentialStore.resolveProviderSecret(providerId);
  if (!apiKey) return failure("credential_missing", "Credential is missing or unavailable.");

  const credentialVersionRef = input.credentialStore.loadProviderCredentialVersionRef(providerId);
  const client = new NineRouterClient({
    baseUrl: settings.baseUrl,
    apiKey,
    timeoutMs: input.timeoutMs ?? 30_000
  });

  let returnedModelId: string | undefined;
  const exactTextTest = await runExactTextTest(client, settings.textModel);
  if (exactTextTest.returnedModelId) returnedModelId = exactTextTest.returnedModelId;

  let strictJsonTest = skippedJsonTest(exactTextTest.result.errorCategory);
  if (!shouldSkipStrictJsonTest(exactTextTest.result.errorCategory)) {
    strictJsonTest = await runStrictJsonTest(client, settings.textModel);
    if (strictJsonTest.returnedModelId) returnedModelId = strictJsonTest.returnedModelId;
  }

  const record: TextModelCertificationRecord = {
    id: `text-cert-${randomUUID()}`,
    providerId,
    configuredModelId: settings.textModel,
    ...(returnedModelId ? { returnedModelId } : {}),
    baseUrlFingerprint,
    ...(credentialVersionRef ? { credentialVersionRef } : {}),
    endpointStrategy,
    implementationVersion,
    exactTextTest: exactTextTest.result,
    strictJsonTest: strictJsonTest.result,
    overallStatus: exactTextTest.result.status === "passed" && strictJsonTest.result.status === "passed" ? "verified" : "failed",
    testedAt: new Date().toISOString()
  };

  input.certificationStore.saveTextCertificationRecord(record);
  input.logger[record.overallStatus === "verified" ? "info" : "warn"]("nine_router_text_certification_completed", {
    providerId,
    modelId: settings.textModel,
    endpointStrategy,
    status: record.overallStatus,
    exactTextStatus: record.exactTextTest.status,
    strictJsonStatus: record.strictJsonTest.status,
    exactTextError: record.exactTextTest.errorCategory,
    strictJsonError: record.strictJsonTest.errorCategory
  });

  return textModelCertificationResponseSchema.parse({
    status: record.overallStatus,
    record,
    message: messageForOverallStatus(record.overallStatus),
    ...(record.overallStatus === "failed" ? { errorCategory: record.exactTextTest.errorCategory ?? record.strictJsonTest.errorCategory ?? "unknown_error" } : {})
  });
}

export function fingerprintBaseUrl(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const normalizedPath = url.pathname.replace(/\/+$/, "");
    return createHash("sha256").update(`${url.origin}${normalizedPath}`).digest("hex");
  } catch {
    return null;
  }
}

function failure(errorCategory: TextCertificationErrorCategory, message: string): CertificationResponse {
  return textModelCertificationResponseSchema.parse({
    status: "failed",
    message,
    errorCategory
  });
}

async function runExactTextTest(client: NineRouterClient, model: string): Promise<{
  result: TextModelCertificationRecord["exactTextTest"];
  returnedModelId?: string;
}> {
  const started = Date.now();
  try {
    const response = await client.createResponseText({ model, input: exactTextPrompt });
    const normalized = normalizeText(response.text);
    if (normalized !== "MODEL_OK") {
      return {
        result: {
          status: "failed",
          latencyMs: Date.now() - started,
          errorCategory: "exact_text_mismatch",
          redactedPreview: preview(response.text)
        },
        ...(response.returnedModelId ? { returnedModelId: response.returnedModelId } : {})
      };
    }
    return {
      result: {
        status: "passed",
        latencyMs: Date.now() - started,
        redactedPreview: preview(response.text)
      },
      ...(response.returnedModelId ? { returnedModelId: response.returnedModelId } : {})
    };
  } catch (error) {
    return {
      result: {
        status: "failed",
        latencyMs: Date.now() - started,
        errorCategory: categoryFromError(error)
      }
    };
  }
}

async function runStrictJsonTest(client: NineRouterClient, model: string): Promise<{
  result: TextModelCertificationRecord["strictJsonTest"];
  returnedModelId?: string;
}> {
  const started = Date.now();
  try {
    const response = await client.createResponseText({ model, input: strictJsonPrompt });
    const normalized = normalizeText(response.text);
    if (!normalized) {
      return jsonFailure(started, "invalid_json", response.text, response.returnedModelId);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(normalized);
    } catch {
      return jsonFailure(started, "invalid_json", response.text, response.returnedModelId);
    }
    const schemaResult = textCertificationJsonPayloadSchema.safeParse(parsed);
    if (!schemaResult.success) {
      return jsonFailure(started, "json_schema_mismatch", response.text, response.returnedModelId);
    }
    return {
      result: {
        status: "passed",
        latencyMs: Date.now() - started,
        redactedPreview: preview(response.text)
      },
      ...(response.returnedModelId ? { returnedModelId: response.returnedModelId } : {})
    };
  } catch (error) {
    return {
      result: {
        status: "failed",
        latencyMs: Date.now() - started,
        errorCategory: categoryFromError(error)
      }
    };
  }
}

function jsonFailure(
  started: number,
  errorCategory: "invalid_json" | "json_schema_mismatch",
  text: string,
  returnedModelId?: string
): { result: TextModelCertificationRecord["strictJsonTest"]; returnedModelId?: string } {
  return {
    result: {
      status: "failed",
      latencyMs: Date.now() - started,
      errorCategory,
      redactedPreview: preview(text)
    },
    ...(returnedModelId ? { returnedModelId } : {})
  };
}

function skippedJsonTest(errorCategory: TextCertificationErrorCategory | undefined): {
  result: TextModelCertificationRecord["strictJsonTest"];
  returnedModelId?: string;
} {
  return {
    result: {
      status: "failed",
      latencyMs: 0,
      errorCategory: errorCategory ?? "unknown_error",
      skipped: true
    }
  };
}

function shouldSkipStrictJsonTest(errorCategory: TextCertificationErrorCategory | undefined): boolean {
  return Boolean(
    errorCategory &&
      ["credential_missing", "invalid_base_url", "unauthorized", "endpoint_not_found", "rate_limited", "server_error", "timeout", "network_error", "invalid_response_shape"].includes(errorCategory)
  );
}

function categoryFromError(error: unknown): TextCertificationErrorCategory {
  if (error instanceof NineRouterTextResponseError) return error.status;
  return "unknown_error";
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function preview(text: string): string {
  return redactString(text).slice(0, 2000);
}

function messageForOverallStatus(status: "verified" | "failed" | "stale"): string {
  if (status === "verified") return "Text model certification verified.";
  if (status === "stale") return "Previous text model certification is stale for the current configuration.";
  return "Text model certification failed.";
}
