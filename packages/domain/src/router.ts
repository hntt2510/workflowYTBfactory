import type { ChannelProfile, ChannelRouteDecision, ChannelRouteInput } from "./types";

export interface RouterOptions {
  confirmationThreshold?: number;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/['’]/g, "").replace(/\s+/g, " ").trim();
}

function signalMatches(haystack: string, signal: string): boolean {
  const normalizedSignal = normalizeText(signal);
  if (normalizedSignal.length <= 3) {
    return new RegExp(`\\b${normalizedSignal}\\b`).test(haystack);
  }
  return haystack.includes(normalizedSignal);
}

export function routeChannelProfile(
  profiles: ChannelProfile[],
  input: ChannelRouteInput,
  options: RouterOptions = {}
): ChannelRouteDecision {
  const threshold = options.confirmationThreshold ?? 0.55;
  const explicit = input.selectedProfileId
    ? profiles.find((profile) => profile.id === input.selectedProfileId)
    : undefined;

  if (explicit) {
    return {
      selectedProfileId: explicit.id,
      confidence: 1,
      matchedSignals: ["explicit selection"],
      rejectedProfiles: profiles
        .filter((profile) => profile.id !== explicit.id)
        .map((profile) => ({ profileId: profile.id, score: 0, reason: "explicit selection wins" })),
      requiresUserConfirmation: false
    };
  }

  const haystack = normalizeText([input.topic, input.description ?? "", input.targetLanguage, input.format].join(" "));
  const scored = profiles
    .map((profile) => {
      const routerSignals = profile.routerSignals.filter((signal) => signalMatches(haystack, signal));
      const keywords = [profile.mainKeyword, ...profile.secondaryKeywords].filter((keyword) =>
        signalMatches(haystack, keyword)
      );
      const safetyBoost =
        profile.id === "viral-case-files" && /\b(ai|copyright|creator|platform)\b/.test(haystack) ? 3 : 0;
      const rawScore = routerSignals.length * 10 + keywords.length * 4 + safetyBoost;
      return {
        profile,
        rawScore,
        matchedSignals: [...new Set([...routerSignals, ...keywords])]
      };
    })
    .sort((a, b) => b.rawScore - a.rawScore);

  const best = scored[0];
  if (!best) {
    throw new Error("No channel profiles are available.");
  }

  const totalScore = scored.reduce((sum, item) => sum + item.rawScore, 0);
  const confidence = totalScore === 0 ? 0 : Number((best.rawScore / totalScore).toFixed(3));

  return {
    selectedProfileId: best.profile.id,
    confidence,
    matchedSignals: best.matchedSignals,
    rejectedProfiles: scored.slice(1).map((item) => ({
      profileId: item.profile.id,
      score: totalScore === 0 ? 0 : Number((item.rawScore / totalScore).toFixed(3)),
      reason:
        item.matchedSignals.length === 0
          ? "No router signals matched."
          : `Matched weaker signals: ${item.matchedSignals.join(", ")}`
    })),
    requiresUserConfirmation: confidence < threshold
  };
}

