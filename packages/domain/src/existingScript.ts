import type { ScriptSection } from "./types";

export interface ExistingScriptPreparation {
  sections: ScriptSection[];
  warnings: string[];
}

export function prepareExistingScript(sourceScript: string, fps = 30): ExistingScriptPreparation {
  const chunks = sourceScript
    .split(/\r?\n\s*\r?\n|(?<=[.!?])\s+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const sections = (chunks.length ? chunks : [sourceScript.trim()]).slice(0, 100).map((narration, index) => {
    const estimatedWords = narration.split(/\s+/).filter(Boolean).length;
    const estimatedSeconds = Math.max(1, Math.ceil(estimatedWords / 2.5));
    return {
      id: `existing-script-section-${String(index + 1).padStart(2, "0")}`,
      purpose: index === 0 ? "Opening context" : index === chunks.length - 1 ? "Closing point" : "Script continuation",
      narration,
      estimatedWords,
      estimatedSeconds,
      dramaticFunction: index === 0 ? "establish the topic" : "preserve the supplied meaning",
      linkedClaimIds: [],
      visualOpportunities: ["document excerpt", "diagram", "locally composited callout"],
      proofObjects: [],
      retentionRisk: estimatedSeconds > 25 ? "medium" : "low"
    } satisfies ScriptSection;
  });
  const warnings = [
    ...(sections.length === 1 ? ["The script was kept as one section because no clear scene boundary was detected."] : []),
    ...(sourceScript.length > 200000 ? ["The supplied script exceeded the maximum stored length and was truncated."] : [])
  ];
  void fps;
  return { sections, warnings };
}
