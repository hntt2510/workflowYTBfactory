import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { providerIdRequestSchema, saveProviderCredentialRequestSchema, workspacePathRequestSchema } from "@lsf/domain";
import {
  MemoryKeychain,
  openFactoryDatabase,
  ProviderCredentialStore,
  redactLogValue,
  redactString
} from "../src";

describe("security foundation", () => {
  it("rejects invalid IPC payloads and path traversal", () => {
    expect(() => providerIdRequestSchema.parse({ providerId: "../x" })).toThrow();
    expect(() => workspacePathRequestSchema.parse({ relativePath: "../secret.env" })).toThrow();
    expect(() =>
      saveProviderCredentialRequestSchema.parse({
        providerId: "9router",
        baseUrl: "http://127.0.0.1:20128/v1",
        apiKey: ""
      })
    ).toThrow();
  });

  it("stores only credential references in SQLite while key stays in keychain", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lsf-cred-"));
    const db = openFactoryDatabase(join(dir, "factory.sqlite"));
    const keychain = new MemoryKeychain();
    const store = new ProviderCredentialStore(db, keychain);
    await store.saveProviderCredential(
      { providerId: "9router", baseUrl: "http://127.0.0.1:20128/v1", imageModel: "mock-image" },
      "sk-secret"
    );
    expect(await store.hasProviderCredential("9router")).toBe(true);
    expect(await store.testCredentialPresence("9router")).toEqual({ providerId: "9router", hasCredential: true });
    expect(await store.resolveProviderSecret("9router")).toBe("sk-secret");
    const row = db.prepare("SELECT * FROM provider_credentials WHERE provider_id = ?").get("9router") as Record<string, string>;
    expect(JSON.stringify(row)).not.toContain("sk-secret");
    expect(row.credential_ref).toBe("9router:apiKey");
    expect(await store.deleteProviderCredential("9router")).toBe(true);
    expect(await store.hasProviderCredential("9router")).toBe(false);
    expect(await store.resolveProviderSecret("9router")).toBeNull();
    db.close();
  });

  it("reloads saved provider settings from persistence", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lsf-cred-"));
    const db = openFactoryDatabase(join(dir, "factory.sqlite"));
    const keychain = new MemoryKeychain();
    const store = new ProviderCredentialStore(db, keychain);
    await store.saveProviderCredential(
      {
        providerId: "9router",
        baseUrl: "http://127.0.0.1:20128/v1",
        textModel: "mock-text",
        imageModel: "mock-image",
        videoModel: "mock-video",
        ttsModel: "mock-tts",
        sttModel: "mock-stt"
      },
      "sk-secret"
    );
    expect(store.loadProviderCredentialSettings("9router")).toEqual({
      providerId: "9router",
      baseUrl: "http://127.0.0.1:20128/v1",
      textModel: "mock-text",
      imageModel: "mock-image",
      videoModel: "mock-video",
      ttsModel: "mock-tts",
      sttModel: "mock-stt",
      hasCredential: true
    });
    db.close();
  });

  it("redacts secrets in structured logs", () => {
    expect(redactString("Authorization: Bearer sk-secret")).not.toContain("sk-secret");
    const redacted = redactLogValue({
      apiKey: "sk-secret",
      nested: { accessToken: "abc", url: "https://x.test/a?X-Amz-Signature=secret&ok=1" }
    });
    expect(JSON.stringify(redacted)).not.toContain("sk-secret");
    expect(JSON.stringify(redacted)).not.toContain("secret&ok");
    expect(JSON.stringify(redacted)).toContain("[REDACTED]");
  });
});
