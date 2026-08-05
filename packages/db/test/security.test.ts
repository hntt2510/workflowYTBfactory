import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { providerIdRequestSchema, saveProviderCredentialRequestSchema, workspacePathRequestSchema } from "@lsf/domain";
import {
  type Keychain,
  MemoryKeychain,
  openFactoryDatabase,
  ProviderCredentialStore,
  redactLogValue,
  redactString,
  TextCertificationStore
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

  it("saves provider model configuration without touching the stored credential", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lsf-model-config-"));
    const databasePath = join(dir, "factory.sqlite");
    const db = openFactoryDatabase(databasePath);
    const calls = { setPassword: 0, getPassword: 0, deletePassword: 0 };
    const keychainValues = new Map<string, string>();
    const keychain: Keychain = {
      async setPassword(service, account, password) {
        calls.setPassword += 1;
        keychainValues.set(`${service}:${account}`, password);
      },
      async getPassword(service, account) {
        calls.getPassword += 1;
        return keychainValues.get(`${service}:${account}`) ?? null;
      },
      async deletePassword() {
        calls.deletePassword += 1;
        return false;
      }
    };
    const store = new ProviderCredentialStore(db, keychain);
    await store.saveProviderCredential({ providerId: "9router", baseUrl: "http://127.0.0.1:20128/v1" }, "sk-secret");
    calls.setPassword = 0;
    calls.getPassword = 0;
    calls.deletePassword = 0;
    store.saveProviderModelConfiguration("9router", {
      textModel: "model-text",
      imageModel: "model-image",
      videoModel: "model-text",
      ttsModel: "model-tts"
    });
    expect(calls).toEqual({ setPassword: 0, getPassword: 0, deletePassword: 0 });
    const row = db.prepare("SELECT * FROM provider_credentials WHERE provider_id = ?").get("9router") as Record<string, string | null>;
    expect(row.credential_ref).toBe("9router:apiKey");
    expect(JSON.stringify(row)).not.toContain("sk-secret");
    expect(row.text_model).toBe("model-text");
    expect(row.image_model).toBe("model-image");
    expect(row.video_model).toBe("model-text");
    expect(row.tts_model).toBe("model-tts");
    expect(row.stt_model).toBeNull();
    await store.saveProviderCredential({ providerId: "9router", baseUrl: "http://127.0.0.1:20128/v1" }, "sk-new-secret");
    const replacedCredentialRow = db.prepare("SELECT * FROM provider_credentials WHERE provider_id = ?").get("9router") as Record<string, string | null>;
    expect(replacedCredentialRow.text_model).toBe("model-text");
    expect(replacedCredentialRow.image_model).toBe("model-image");
    expect(JSON.stringify(replacedCredentialRow)).not.toContain("sk-new-secret");
    db.close();

    const reloadedDb = openFactoryDatabase(databasePath);
    const reloadedStore = new ProviderCredentialStore(reloadedDb, keychain);
    expect(reloadedStore.loadProviderCredentialSettings("9router")).toEqual({
      providerId: "9router",
      baseUrl: "http://127.0.0.1:20128/v1",
      textModel: "model-text",
      imageModel: "model-image",
      videoModel: "model-text",
      ttsModel: "model-tts",
      hasCredential: true
    });
    reloadedDb.close();
  });

  it("does not create provider settings when model configuration save fails", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lsf-model-config-missing-"));
    const db = openFactoryDatabase(join(dir, "factory.sqlite"));
    const store = new ProviderCredentialStore(db, new MemoryKeychain());
    expect(() => store.saveProviderModelConfiguration("9router", { textModel: "model-text" })).toThrow("Provider settings must exist");
    expect(store.loadProviderCredentialSettings("9router")).toBeNull();
    db.close();
  });

  it("preserves existing model configuration fields when saving a partial update", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lsf-model-config-partial-"));
    const db = openFactoryDatabase(join(dir, "factory.sqlite"));
    const store = new ProviderCredentialStore(db, new MemoryKeychain());
    await store.saveProviderCredential(
      {
        providerId: "9router",
        baseUrl: "http://127.0.0.1:20128/v1",
        textModel: "model-text",
        imageModel: "model-image",
        videoModel: "model-video",
        ttsModel: "model-tts",
        sttModel: "model-stt"
      },
      "sk-secret"
    );
    store.saveProviderModelConfiguration("9router", { imageModel: "model-image-next" });
    expect(store.loadProviderCredentialSettings("9router")).toEqual({
      providerId: "9router",
      baseUrl: "http://127.0.0.1:20128/v1",
      textModel: "model-text",
      imageModel: "model-image-next",
      videoModel: "model-video",
      ttsModel: "model-tts",
      sttModel: "model-stt",
      hasCredential: true
    });
    db.close();
  });

  it("persists text certification records and marks stale without storing raw keys", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lsf-text-cert-"));
    const databasePath = join(dir, "factory.sqlite");
    const db = openFactoryDatabase(databasePath);
    const credentialStore = new ProviderCredentialStore(db, new MemoryKeychain());
    const certificationStore = new TextCertificationStore(db);
    await credentialStore.saveProviderCredential(
      { providerId: "9router", baseUrl: "http://127.0.0.1:20128/v1", textModel: "cx/gpt-5.5", imageModel: "image-a" },
      "sk-secret"
    );
    const credentialVersionRef = credentialStore.loadProviderCredentialVersionRef("9router");
    certificationStore.saveTextCertificationRecord({
      id: "text-cert-1",
      providerId: "9router",
      configuredModelId: "cx/gpt-5.5",
      baseUrlFingerprint: "b".repeat(64),
      ...(credentialVersionRef ? { credentialVersionRef } : {}),
      endpointStrategy: "responses",
      implementationVersion: "text-certification-v1",
      exactTextTest: { status: "passed", latencyMs: 10 },
      strictJsonTest: { status: "passed", latencyMs: 12 },
      overallStatus: "verified",
      testedAt: "2026-07-29T00:00:00.000Z"
    });
    expect(certificationStore.loadLatestTextCertification("9router")?.overallStatus).toBe("verified");
    expect(JSON.stringify(db.prepare("SELECT * FROM text_model_certifications").all())).not.toContain("sk-secret");
    credentialStore.saveProviderModelConfiguration("9router", { textModel: "cx/gpt-5.5", imageModel: "image-b" });
    expect(certificationStore.loadLatestTextCertification("9router")?.overallStatus).toBe("verified");
    certificationStore.markTextCertificationsStale("9router");
    expect(certificationStore.loadLatestTextCertification("9router")?.overallStatus).toBe("stale");
    db.close();

    const reloadedDb = openFactoryDatabase(databasePath);
    const reloadedCertificationStore = new TextCertificationStore(reloadedDb);
    expect(reloadedCertificationStore.loadLatestTextCertification("9router")?.overallStatus).toBe("stale");
    reloadedDb.close();
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
