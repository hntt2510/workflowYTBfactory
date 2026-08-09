import type { ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { scriptOutputSchema } from "@lsf/domain";
import { TextProviderError, type TextProvider } from "@lsf/providers";
import { resolveActiveTextProvider } from "./textProviderService";

type ScriptOutput = ReturnType<typeof scriptOutputSchema.parse>;
type Finding = { id: string; sectionId?: string | undefined; explanation: string; suggestedDirection: string; severity: string; category: string };

export class ScriptRevisionError extends Error {
  constructor(readonly category: "capability_not_verified" | "credential_missing" | "provider_failed" | "invalid_json" | "invalid_output", message: string) { super(message); }
}

export async function reviseScript(input: {
  script: ScriptOutput;
  findings: Finding[];
  profile: Record<string, unknown>;
  language: string;
  instructions?: string;
  credentialStore: ProviderCredentialStore;
  certificationStore: TextCertificationStore;
  createProvider?: () => Pick<TextProvider, "generateStructured">;
}): Promise<{ output: ScriptOutput; returnedModelId?: string }> {
  let configured: { provider: TextProvider; model: string };
  try {
    configured = await resolveActiveTextProvider({ credentialStore: input.credentialStore, certificationStore: input.certificationStore });
  } catch (error) {
    throw new ScriptRevisionError(error instanceof TextProviderError ? "capability_not_verified" : "credential_missing", "Verified Cockpit text capability is required before Script Revision can run.");
  }
  const selectedSectionIds = new Set(input.findings.flatMap((finding) => finding.sectionId ? [finding.sectionId] : []));
  const prompt = `Revise only the requested sections of this existing script. Do not regenerate its story strategy, outline, scenes, shots, visual prompts, or assets. The target language is ${input.language}; every human-readable script field must remain in ${input.language}. Return the complete strict script JSON with the same section IDs and outlineSectionIds. Preserve every section not named by a selected finding exactly, including its narration and metadata.\n${JSON.stringify({ script: input.script, selectedFindings: input.findings, selectedSectionIds: [...selectedSectionIds], profile: focusedProfile(input.profile), instructions: input.instructions })}`;
  try {
    const response = await (input.createProvider?.() ?? configured.provider).generateStructured({ model: configured.model, input: prompt, schema: scriptOutputSchema, timeoutMs: 180_000 });
    validateRevision(input.script, response.data, selectedSectionIds);
    return { output: response.data, ...(response.returnedModelId ? { returnedModelId: response.returnedModelId } : {}) };
  } catch (error) {
    if (error instanceof ScriptRevisionError) throw error;
    if (error instanceof TextProviderError && error.code === "invalid_json") throw new ScriptRevisionError("invalid_json", "Script Revision returned invalid JSON.");
    if (error instanceof TextProviderError && error.code === "schema_validation_failed") throw new ScriptRevisionError("invalid_output", "Script Revision returned an invalid structured output.");
    throw new ScriptRevisionError("provider_failed", "Script Revision text provider request failed.");
  }
}

function validateRevision(current: ScriptOutput, next: ScriptOutput, selectedSectionIds: ReadonlySet<string>): void {
  if (current.sections.length !== next.sections.length) throw new ScriptRevisionError("invalid_output", "Script Revision changed the section count.");
  for (const currentSection of current.sections) {
    const nextSection = next.sections.find((section) => section.id === currentSection.id);
    if (!nextSection || nextSection.outlineSectionId !== currentSection.outlineSectionId) throw new ScriptRevisionError("invalid_output", "Script Revision changed the approved outline mapping.");
    if (!selectedSectionIds.size || selectedSectionIds.has(currentSection.id)) continue;
    if (JSON.stringify(nextSection) !== JSON.stringify(currentSection)) throw new ScriptRevisionError("invalid_output", "Script Revision changed a section that was not selected for revision.");
  }
}

function focusedProfile(profile: Record<string, unknown>): Record<string, unknown> {
  const fields = ["targetAudience", "mainKeyword", "niche", "tone", "language", "positioning", "avoidList", "safetyRules"];
  return Object.fromEntries(fields.flatMap((field) => profile[field] === undefined ? [] : [[field, profile[field]]]));
}
