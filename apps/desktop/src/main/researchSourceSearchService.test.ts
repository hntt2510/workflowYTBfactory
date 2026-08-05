import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MemoryKeychain, openFactoryDatabase, ProviderCredentialStore, TextCertificationStore } from "@lsf/db";
import { createFixtureProject } from "@lsf/domain";
import type { NineRouterWebSearchResponse } from "@lsf/providers";
import { fingerprintBaseUrl } from "./nineRouterTextCertificationService";
import { runResearchSourceSearch } from "./researchSourceSearchService";

const baseUrl = "http://127.0.0.1:20128/v1";

async function setup() {
  const db = openFactoryDatabase(join(mkdtempSync(join(tmpdir(), "lsf-research-sources-")), "factory.sqlite"));
  const credentialStore = new ProviderCredentialStore(db, new MemoryKeychain());
  const certificationStore = new TextCertificationStore(db);
  await credentialStore.saveProviderCredential({ providerId: "9router", baseUrl, textModel: "cx/gpt-5.6-sol" }, "sk-secret");
  certificationStore.saveTextCertificationRecord({
    id: "cert-research-sources",
    providerId: "9router",
    configuredModelId: "cx/gpt-5.6-sol",
    baseUrlFingerprint: fingerprintBaseUrl(baseUrl)!,
    credentialVersionRef: credentialStore.loadProviderCredentialVersionRef("9router"),
    endpointStrategy: "responses",
    implementationVersion: "text-certification-v1",
    exactTextTest: { status: "passed", latencyMs: 1 },
    strictJsonTest: { status: "passed", latencyMs: 1 },
    overallStatus: "verified",
    testedAt: "2026-08-02T00:00:00.000Z"
  });
  return { db, credentialStore, certificationStore };
}

function project() {
  return createFixtureProject({ topic: "The history of public libraries", format: "long", targetLanguage: "English", workflowMode: "semi_automatic" });
}

function searchResponse(results: NineRouterWebSearchResponse["results"] = [{
  title: "Library of Congress history",
  url: "https://www.loc.gov/about/history/",
  snippet: "An authoritative history of the Library of Congress."
}]): NineRouterWebSearchResponse {
  return { provider: "search-combo", query: "library history", results };
}

describe("research source search service", () => {
  it("selects returned search results and preserves their exact URLs", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const searchCalls: Array<{ model: string; query: string }> = [];
    const result = await runResearchSourceSearch({
      project: project(),
      credentialStore,
      certificationStore,
      createSearchClient: () => ({
        listWebSearchModels: async () => [{ id: "tavily", kind: "web-search" }, { id: "search-combo", kind: "web-search" }],
        searchWeb: async (input) => { searchCalls.push(input); return searchResponse(); }
      }),
      createTextClient: () => ({
        createResponseText: async ({ input }) => {
          expect(input).toContain("Search results:");
          return { text: '{"selected":[{"resultIndex":1,"sourceType":"primary"}]}' };
        }
      })
    });
    expect(searchCalls).toEqual([{ model: "search-combo", query: "The history of public libraries authoritative sources English", maxResults: 8 }]);
    expect(result.output.sources[0]).toMatchObject({ url: "https://www.loc.gov/about/history/", title: "Library of Congress history", sourceType: "primary" });
    db.close();
  });

  it("fails when no web-search model is configured", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    await expect(runResearchSourceSearch({
      project: project(), credentialStore, certificationStore,
      createSearchClient: () => ({ listWebSearchModels: async () => [], searchWeb: async () => searchResponse() })
    })).rejects.toMatchObject({ category: "web_search_model_missing" });
    db.close();
  });

  it("fails closed for search failures and empty search results", async () => {
    const failed = await setup();
    await expect(runResearchSourceSearch({
      project: project(), credentialStore: failed.credentialStore, certificationStore: failed.certificationStore,
      createSearchClient: () => ({ listWebSearchModels: async () => [{ id: "tavily" }], searchWeb: async () => { throw new Error("timeout"); } })
    })).rejects.toMatchObject({ category: "web_search_failed" });
    failed.db.close();

    const empty = await setup();
    await expect(runResearchSourceSearch({
      project: project(), credentialStore: empty.credentialStore, certificationStore: empty.certificationStore,
      createSearchClient: () => ({ listWebSearchModels: async () => [{ id: "tavily" }], searchWeb: async () => searchResponse([]) })
    })).rejects.toMatchObject({ category: "no_search_results" });
    empty.db.close();
  });

  it("rejects invented or out-of-range selections", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    await expect(runResearchSourceSearch({
      project: project(), credentialStore, certificationStore,
      createSearchClient: () => ({ listWebSearchModels: async () => [{ id: "tavily" }], searchWeb: async () => searchResponse() }),
      createTextClient: () => ({ createResponseText: async () => ({ text: '{"selected":[{"resultIndex":2,"sourceType":"primary"}]}' }) })
    })).rejects.toMatchObject({ category: "invalid_output" });
    db.close();
  });

  it("rejects an empty selector response instead of creating an artifact", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    await expect(runResearchSourceSearch({
      project: project(), credentialStore, certificationStore,
      createSearchClient: () => ({ listWebSearchModels: async () => [{ id: "tavily" }], searchWeb: async () => searchResponse() }),
      createTextClient: () => ({ createResponseText: async () => ({ text: "" }) })
    })).rejects.toMatchObject({ category: "invalid_output" });
    db.close();
  });

  it("accepts a markdown JSON fence without changing provider-owned source fields", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const result = await runResearchSourceSearch({
      project: project(), credentialStore, certificationStore,
      createSearchClient: () => ({ listWebSearchModels: async () => [{ id: "tavily" }], searchWeb: async () => searchResponse() }),
      createTextClient: () => ({ createResponseText: async () => ({ text: "```json\n{\"selected\":[{\"resultIndex\":1,\"sourceType\":\"secondary\"}]}\n```" }) })
    });
    expect(result.output.sources).toHaveLength(1);
    expect(result.output.sources[0]?.url).toBe("https://www.loc.gov/about/history/");
    expect(result.output.sources[0]?.sourceType).toBe("secondary");
    db.close();
  });

  it("unwraps a supported provider response wrapper", async () => {
    const { db, credentialStore, certificationStore } = await setup();
    const result = await runResearchSourceSearch({
      project: project(), credentialStore, certificationStore,
      createSearchClient: () => ({ listWebSearchModels: async () => [{ id: "tavily" }], searchWeb: async () => searchResponse() }),
      createTextClient: () => ({ createResponseText: async () => ({ text: JSON.stringify({ output: '{"selected":[{"resultIndex":1,"sourceType":"primary"}]}' }) }) })
    });
    expect(result.output.sources[0]?.url).toBe("https://www.loc.gov/about/history/");
    db.close();
  });
});
