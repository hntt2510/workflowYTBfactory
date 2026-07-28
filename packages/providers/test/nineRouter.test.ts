import { describe, expect, it } from "vitest";
import { NineRouterClient, redactSecrets } from "../src";

describe("NineRouterClient", () => {
  it("parses common image result shapes", () => {
    const client = new NineRouterClient({ baseUrl: "http://localhost/v1" });
    const results = client.parseImageResults({
      data: [{ url: "https://example.com/a.png" }, { b64_json: "abc" }],
      choices: [{ message: { content: "result data:image/png;base64,AAAA" } }]
    });
    expect(results).toEqual([
      { url: "https://example.com/a.png" },
      { b64Json: "abc" },
      { dataUri: "data:image/png;base64,AAAA" }
    ]);
  });

  it("redacts bearer tokens", () => {
    expect(redactSecrets("Authorization: Bearer sk-secret")).not.toContain("sk-secret");
  });
});

