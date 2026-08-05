import { createHash } from "node:crypto";
import type { ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import type { FactoryProject } from "@lsf/domain";
import { researchSourcesOutputSchema } from "@lsf/domain";
import {
  NineRouterClient,
  NineRouterTextResponseError,
  NineRouterWebSearchError,
  type NineRouterWebSearchModel,
  type NineRouterWebSearchResponse
} from "@lsf/providers";
import { loadNineRouterTextCertification } from "./nineRouterTextCertificationService";

export type ResearchSourceSearchErrorCategory =
  | "capability_not_verified"
  | "credential_missing"
  | "web_search_model_missing"
  | "web_search_failed"
  | "text_provider_failed"
  | "no_search_results"
  | "invalid_output";

export class ResearchSourceSearchError extends Error {
  constructor(readonly category: ResearchSourceSearchErrorCategory, message: string) {
    super(message);
  }
}

interface SearchClient {
  listWebSearchModels(): Promise<NineRouterWebSearchModel[]>;
  searchWeb(input: { model: string; query: string; maxResults?: number }): Promise<NineRouterWebSearchResponse>;
}

interface TextClient {
  createResponseText(input: { model: string; input: string }): Promise<{ text: string; returnedModelId?: string }>;
}

export interface ResearchSourceSearchResult {
  output: ReturnType<typeof researchSourcesOutputSchema.parse>;
  query: string;
  searchModel: string;
  resultCount: number;
  returnedModelId?: string;
}

export function buildResearchSearchQuery(project: FactoryProject): string {
  const idea = project.ideas.find((candidate) => candidate.id === project.approvedIdeaId);
  return [
    project.topic,
    idea?.workingTitle,
    `authoritative sources ${project.targetLanguage}`
  ].filter((value): value is string => Boolean(value?.trim())).join(" ").trim();
}

export function selectWebSearchModel(models: NineRouterWebSearchModel[]): string | undefined {
  const webModels = models.filter((model) => !model.kind || /web.?search/i.test(model.kind) || /search/i.test(model.id));
  return webModels.find((model) => model.id === "search-combo")?.id
    ?? webModels.find((model) => /search-combo|\/search$/i.test(model.id))?.id
    ?? webModels[0]?.id;
}

export async function runResearchSourceSearch(input: {
  project: FactoryProject;
  credentialStore: ProviderCredentialStore;
  certificationStore: TextCertificationStore;
  createSearchClient?: (config: { baseUrl: string; apiKey: string }) => SearchClient;
  createTextClient?: (config: { baseUrl: string; apiKey: string }) => TextClient;
}): Promise<ResearchSourceSearchResult> {
  const certification = await loadNineRouterTextCertification({ credentialStore: input.credentialStore, certificationStore: input.certificationStore });
  if (certification.status !== "verified") {
    throw new ResearchSourceSearchError("capability_not_verified", "A verified text-model certification is required before automatic Research Source Intake can run.");
  }

  const settings = input.credentialStore.loadProviderCredentialSettings("9router");
  const apiKey = await input.credentialStore.resolveProviderSecret("9router");
  if (!settings?.textModel || !apiKey) {
    throw new ResearchSourceSearchError("credential_missing", "The selected text model or 9Router credential is unavailable.");
  }

  const searchClient = input.createSearchClient?.({ baseUrl: settings.baseUrl, apiKey })
    ?? new NineRouterClient({ baseUrl: settings.baseUrl, apiKey, timeoutMs: 60_000 });
  let searchModel: string | undefined;
  try {
    searchModel = selectWebSearchModel(await searchClient.listWebSearchModels());
  } catch (error) {
    throw new ResearchSourceSearchError("web_search_failed", error instanceof NineRouterWebSearchError ? `9Router web-search model discovery failed: ${error.status}.` : "9Router web-search model discovery failed.");
  }
  if (!searchModel) throw new ResearchSourceSearchError("web_search_model_missing", "9Router has no configured web-search model. Configure Tavily, Brave, Serper, or search-combo first.");

  const query = buildResearchSearchQuery(input.project);
  let searchResponse: NineRouterWebSearchResponse;
  try {
    searchResponse = await searchClient.searchWeb({ model: searchModel, query, maxResults: 8 });
  } catch (error) {
    throw new ResearchSourceSearchError("web_search_failed", error instanceof NineRouterWebSearchError ? `9Router web-search request failed: ${error.status}.` : "9Router web-search request failed.");
  }
  const candidates = searchResponse.results.filter((result) => Boolean(result.content?.trim() || result.snippet?.trim()));
  if (!candidates.length) throw new ResearchSourceSearchError("no_search_results", "The web-search provider returned no citable results for this topic.");

  const selectionPrompt = buildSelectionPrompt(input.project, candidates);
  const textClient = input.createTextClient?.({ baseUrl: settings.baseUrl, apiKey })
    ?? new NineRouterClient({ baseUrl: settings.baseUrl, apiKey, timeoutMs: 60_000 });
  let response: { text: string; returnedModelId?: string };
  try {
    response = await textClient.createResponseText({ model: settings.textModel, input: selectionPrompt });
  } catch (error) {
    throw new ResearchSourceSearchError("text_provider_failed", error instanceof NineRouterTextResponseError ? `Research source selector failed: ${error.status}.` : "Research source selector failed.");
  }

  const selected = parseSelection(response.text, candidates.length);
  if (!selected.length) throw new ResearchSourceSearchError("invalid_output", "The text model did not select any valid citable search result.");
  const sources = selected.map((item) => sourceFromSearchResult(candidates[item.resultIndex - 1]!, item.sourceType, searchResponse.provider ?? searchModel));
  const output = researchSourcesOutputSchema.safeParse({ sources });
  if (!output.success) throw new ResearchSourceSearchError("invalid_output", "The selected web-search results could not be converted into valid research sources.");
  return {
    output: output.data,
    query,
    searchModel,
    resultCount: candidates.length,
    ...(response.returnedModelId ? { returnedModelId: response.returnedModelId } : {})
  };
}

function buildSelectionPrompt(project: FactoryProject, candidates: NineRouterWebSearchResponse["results"]): string {
  const results = candidates.map((result, index) => ({
    resultIndex: index + 1,
    title: result.title,
    url: result.url,
    excerpt: result.content ?? result.snippet,
    publishedAt: result.publishedAt
  }));
  return `Select the most relevant citable sources for this YouTube research topic. Return only strict JSON: {"selected":[{"resultIndex":integer,"sourceType":"primary"|"secondary"}]}. Use 1-based resultIndex values from the supplied list, select at most 5, and do not invent or alter URLs, titles, excerpts, publishers, or facts. Prefer official, government, academic, regulatory, or first-party sources when available. Topic: ${project.topic}. Language: ${project.targetLanguage}. Search results:\n${JSON.stringify(results)}`;
}

function parseSelection(text: string, resultCount: number): Array<{ resultIndex: number; sourceType: "primary" | "secondary" }> {
  const candidates = [text.trim(), text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? ""];
  for (const candidate of [...candidates]) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      for (const key of ["output", "response", "content", "text", "output_text"]) {
        if (typeof parsed[key] !== "string") continue;
        const value = parsed[key].trim();
        if (value) candidates.push(value, value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? "");
      }
    } catch {
      // Try the direct and fenced forms below.
    }
  }
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate) as { selected?: unknown };
      if (!Array.isArray(parsed.selected)) continue;
      const seen = new Set<number>();
      const selected: Array<{ resultIndex: number; sourceType: "primary" | "secondary" }> = parsed.selected.flatMap((item): Array<{ resultIndex: number; sourceType: "primary" | "secondary" }> => {
        if (!item || typeof item !== "object") return [];
        const value = item as { resultIndex?: unknown; sourceType?: unknown };
        if (!Number.isInteger(value.resultIndex) || Number(value.resultIndex) < 1 || Number(value.resultIndex) > resultCount || seen.has(Number(value.resultIndex))) return [];
        if (value.sourceType !== "primary" && value.sourceType !== "secondary") return [];
        seen.add(Number(value.resultIndex));
        const sourceType = value.sourceType as "primary" | "secondary";
        return [{ resultIndex: Number(value.resultIndex), sourceType }];
      });
      if (selected.length) return selected.slice(0, 5);
    } catch {
      // Try the next supported response wrapper.
    }
  }
  return [];
}

function sourceFromSearchResult(result: NineRouterWebSearchResponse["results"][number], sourceType: "primary" | "secondary", provider: string) {
  let url: URL;
  try {
    url = new URL(result.url);
  } catch {
    throw new ResearchSourceSearchError("invalid_output", "The web-search provider returned an invalid source URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ResearchSourceSearchError("invalid_output", "The web-search provider returned an unsupported source URL.");
  const excerpt = result.content?.trim() || result.snippet?.trim();
  if (!excerpt) throw new ResearchSourceSearchError("invalid_output", "A selected web source did not include a citable excerpt.");
  const publisher = url.hostname.replace(/^www\./i, "");
  const id = `web-source-${createHash("sha256").update(result.url).digest("hex").slice(0, 16)}`;
  const publishedAt = result.publishedAt && !Number.isNaN(Date.parse(result.publishedAt)) ? new Date(result.publishedAt).toISOString() : undefined;
  return {
    id,
    title: result.title,
    url: result.url,
    publisher,
    excerpt,
    sourceType,
    ...(publishedAt ? { publishedAt } : {}),
    notes: `Retrieved via 9Router ${provider}. Verify the excerpt against the source before approval.`
  };
}
