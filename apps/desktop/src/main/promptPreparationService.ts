import type { ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { promptPreparationOutputSchema } from "@lsf/domain";
import { NineRouterClient, NineRouterTextResponseError } from "@lsf/providers";
import { loadNineRouterTextCertification } from "./nineRouterTextCertificationService";

export class PromptPreparationError extends Error { constructor(readonly category: "capability_not_verified" | "credential_missing" | "provider_failed" | "invalid_json" | "invalid_output", message: string) { super(message); } }
interface TextClient { createResponseText(input: { model: string; input: string }): Promise<{ text: string; returnedModelId?: string }>; }

export async function runPromptPreparation(input: { shots: Array<{ id: string; visualMode: string; framing: string; cameraAngle: string; cameraMovement: string; subjectAction: string; continuityRefs: string[] }>; aspectRatio: "16:9" | "9:16"; credentialStore: ProviderCredentialStore; certificationStore: TextCertificationStore; createClient?: (config: { baseUrl: string; apiKey: string }) => TextClient }) {
  const aiShots = input.shots.filter((shot) => shot.visualMode === "ai_image" || shot.visualMode === "ai_video");
  if (aiShots.length === 0) return { output: promptPreparationOutputSchema.parse({ prompts: [] }) };
  const certification = await loadNineRouterTextCertification({ credentialStore: input.credentialStore, certificationStore: input.certificationStore });
  if (certification.status !== "verified") throw new PromptPreparationError("capability_not_verified", "A verified text-model certification is required before Prompt Preparation can run.");
  const settings = input.credentialStore.loadProviderCredentialSettings("9router"); const apiKey = await input.credentialStore.resolveProviderSecret("9router");
  if (!settings?.textModel || !apiKey) throw new PromptPreparationError("credential_missing", "The selected text model or credential is unavailable.");
  let response: { text: string; returnedModelId?: string };
  try { response = await (input.createClient?.({ baseUrl: settings.baseUrl, apiKey }) ?? new NineRouterClient({ baseUrl: settings.baseUrl, apiKey, timeoutMs: 60_000 })).createResponseText({ model: settings.textModel, input: `Prepare generation prompts only for approved AI-routed shots. Return strict JSON {prompts:[...]}. Include subject, action, framing, camera, continuity, aspect ratio, and prohibited elements. Do not claim unsupported facts, imitate copyrighted characters, or create assets.\n${JSON.stringify({ shots: aiShots, aspectRatio: input.aspectRatio })}` }); } catch (error) { throw new PromptPreparationError("provider_failed", error instanceof NineRouterTextResponseError ? `Prompt Preparation provider request failed: ${error.status}.` : "Prompt Preparation provider request failed."); }
  let parsed: unknown; try { parsed = JSON.parse(response.text.trim()); } catch { throw new PromptPreparationError("invalid_json", "Prompt Preparation returned invalid JSON."); }
  const result = promptPreparationOutputSchema.safeParse(parsed); if (!result.success) throw new PromptPreparationError("invalid_output", "Prompt Preparation returned an invalid structured output.");
  const ids = new Set(aiShots.map((shot) => shot.id));
  if (result.data.prompts.some((prompt) => !ids.has(prompt.shotId) || prompt.aspectRatio !== input.aspectRatio) || new Set(result.data.prompts.map((prompt) => prompt.shotId)).size !== result.data.prompts.length || result.data.prompts.length !== aiShots.length) throw new PromptPreparationError("invalid_output", "Prompt Preparation must return exactly one correctly sized prompt for every approved AI-routed shot.");
  return { output: result.data, ...(response.returnedModelId ? { returnedModelId: response.returnedModelId } : {}) };
}
