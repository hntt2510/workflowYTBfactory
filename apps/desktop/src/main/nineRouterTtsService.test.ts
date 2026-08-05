import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalNineRouterTtsModel, generateNineRouterTts, listNineRouterTtsCatalog } from "./nineRouterTtsService";

describe("nineRouterTtsService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefixes a provider-less discovered voice for the 9Router speech endpoint", () => {
    expect(canonicalNineRouterTtsModel("edge-tts", "vi-VN-NamMinhNeural")).toBe("edge-tts/vi-VN-NamMinhNeural");
    expect(canonicalNineRouterTtsModel("google-tts", "vi")).toBe("google-tts/vi");
  });

  it("discovers only the selected provider and language", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "edge-tts/vi-VN-HoaiMyNeural" }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ model: "vi-VN-HoaiMyNeural", name: "HoaiMy" }] })));
    vi.stubGlobal("fetch", fetchImpl);

    const catalog = await listNineRouterTtsCatalog({
      baseUrl: "https://router.example/v1",
      apiKey: "test-key",
      provider: "edge-tts",
      language: "vi"
    });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://router.example/v1/models/tts");
    expect(fetchImpl.mock.calls[1]?.[0]).toBe("https://router.example/v1/audio/voices?provider=edge-tts&lang=vi");
    expect(catalog.voices).toEqual([{ id: "edge-tts/vi-VN-HoaiMyNeural", label: "HoaiMy (edge-tts/vi-VN-HoaiMyNeural)" }]);
  });

  it("sends the exact discovered model and NFC-normalized input to speech", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(new Uint8Array(101), { headers: { "Content-Type": "audio/mpeg" } }));
    vi.stubGlobal("fetch", fetchImpl);
    const directory = await mkdtemp(join(tmpdir(), "lsf-tts-"));
    const outputPath = join(directory, "preview.mp3");
    try {
      await generateNineRouterTts({
        baseUrl: "https://router.example/v1",
        apiKey: "test-key",
        model: "edge-tts/vi-VN-HoaiMyNeural",
        text: "Xin cha\u0300o",
        outputPath
      });
      const request = JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body as string) as { model: string; input: string };
      expect(request).toEqual({ model: "edge-tts/vi-VN-HoaiMyNeural", input: "Xin chào" });
      expect((await readFile(outputPath)).byteLength).toBe(101);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
