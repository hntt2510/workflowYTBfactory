import { randomUUID } from "node:crypto";
import type { FactoryDatabase } from "./connection";

export interface ProviderCredentialSettings {
  providerId: string;
  baseUrl: string;
  textModel?: string;
  imageModel?: string;
  videoModel?: string;
  ttsModel?: string;
  sttModel?: string;
}

export interface LoadedProviderCredentialSettings extends ProviderCredentialSettings {
  hasCredential: boolean;
}

export interface ProviderModelConfiguration {
  textModel?: string;
  imageModel?: string;
  videoModel?: string;
  ttsModel?: string;
  sttModel?: string;
}

export type SavedProviderCredentialSettings = LoadedProviderCredentialSettings;

export interface Keychain {
  setPassword(service: string, account: string, password: string): Promise<void>;
  getPassword(service: string, account: string): Promise<string | null>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

const SERVICE = "LongShortFactory";

export class ProviderCredentialStore {
  constructor(
    private readonly db: FactoryDatabase,
    private readonly keychain: Keychain
  ) {}

  async saveProviderCredential(settings: ProviderCredentialSettings, apiKey: string): Promise<string> {
    const credentialRef = `${settings.providerId}:apiKey`;
    const credentialVersionRef = `credential:${randomUUID()}`;
    await this.keychain.setPassword(SERVICE, credentialRef, apiKey);
    this.db
      .prepare(
        `INSERT INTO provider_credentials
          (provider_id, credential_ref, credential_version_ref, base_url, text_model, image_model, video_model, tts_model, stt_model, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(provider_id) DO UPDATE SET
          credential_ref = excluded.credential_ref,
          credential_version_ref = excluded.credential_version_ref,
          base_url = excluded.base_url,
          text_model = COALESCE(excluded.text_model, provider_credentials.text_model),
          image_model = COALESCE(excluded.image_model, provider_credentials.image_model),
          video_model = COALESCE(excluded.video_model, provider_credentials.video_model),
          tts_model = COALESCE(excluded.tts_model, provider_credentials.tts_model),
          stt_model = COALESCE(excluded.stt_model, provider_credentials.stt_model),
          updated_at = CURRENT_TIMESTAMP`
      )
      .run(
        settings.providerId,
        credentialRef,
        credentialVersionRef,
        settings.baseUrl,
        settings.textModel ?? null,
        settings.imageModel ?? null,
        settings.videoModel ?? null,
        settings.ttsModel ?? null,
        settings.sttModel ?? null
      );
    return credentialRef;
  }

  loadProviderCredentialSettings(providerId: string): LoadedProviderCredentialSettings | null {
    const row = this.db
      .prepare(
        `SELECT provider_id, credential_ref, base_url, text_model, image_model, video_model, tts_model, stt_model
         FROM provider_credentials WHERE provider_id = ?`
      )
      .get(providerId) as
      | {
          provider_id: string;
          credential_ref: string;
          base_url: string;
          text_model: string | null;
          image_model: string | null;
          video_model: string | null;
          tts_model: string | null;
          stt_model: string | null;
        }
      | undefined;
    if (!row) return null;
    return {
      providerId: row.provider_id,
      baseUrl: row.base_url,
      ...(row.text_model ? { textModel: row.text_model } : {}),
      ...(row.image_model ? { imageModel: row.image_model } : {}),
      ...(row.video_model ? { videoModel: row.video_model } : {}),
      ...(row.tts_model ? { ttsModel: row.tts_model } : {}),
      ...(row.stt_model ? { sttModel: row.stt_model } : {}),
      hasCredential: Boolean(row.credential_ref)
    };
  }

  saveProviderModelConfiguration(providerId: string, models: ProviderModelConfiguration): void {
    const result = this.db
      .prepare(
        `UPDATE provider_credentials SET
          text_model = ?,
          image_model = ?,
          video_model = ?,
          tts_model = ?,
          stt_model = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE provider_id = ?`
      )
      .run(
        models.textModel ?? null,
        models.imageModel ?? null,
        models.videoModel ?? null,
        models.ttsModel ?? null,
        models.sttModel ?? null,
        providerId
      );
    if (result.changes === 0) {
      throw new Error("Provider settings must exist before saving model configuration.");
    }
  }

  async hasProviderCredential(providerId: string): Promise<boolean> {
    const row = this.db
      .prepare("SELECT credential_ref FROM provider_credentials WHERE provider_id = ?")
      .get(providerId) as Record<string, string> | undefined;
    return Boolean(row?.credential_ref && (await this.keychain.getPassword(SERVICE, row.credential_ref)));
  }

  async resolveProviderSecret(providerId: string): Promise<string | null> {
    const row = this.db
      .prepare("SELECT credential_ref FROM provider_credentials WHERE provider_id = ?")
      .get(providerId) as Record<string, string> | undefined;
    return row?.credential_ref ? this.keychain.getPassword(SERVICE, row.credential_ref) : null;
  }

  loadProviderCredentialVersionRef(providerId: string): string | undefined {
    const row = this.db
      .prepare("SELECT credential_version_ref FROM provider_credentials WHERE provider_id = ?")
      .get(providerId) as Record<string, string | null> | undefined;
    return row?.credential_version_ref ?? undefined;
  }

  async testCredentialPresence(providerId: string): Promise<{ providerId: string; hasCredential: boolean }> {
    return { providerId, hasCredential: await this.hasProviderCredential(providerId) };
  }

  async deleteProviderCredential(providerId: string): Promise<boolean> {
    const row = this.db
      .prepare("SELECT credential_ref FROM provider_credentials WHERE provider_id = ?")
      .get(providerId) as Record<string, string> | undefined;
    const deleted = row?.credential_ref ? await this.keychain.deletePassword(SERVICE, row.credential_ref) : false;
    this.db.prepare("DELETE FROM provider_credentials WHERE provider_id = ?").run(providerId);
    return deleted;
  }
}

export class MemoryKeychain implements Keychain {
  private readonly values = new Map<string, string>();

  async setPassword(service: string, account: string, password: string): Promise<void> {
    this.values.set(`${service}:${account}`, password);
  }

  async getPassword(service: string, account: string): Promise<string | null> {
    return this.values.get(`${service}:${account}`) ?? null;
  }

  async deletePassword(service: string, account: string): Promise<boolean> {
    return this.values.delete(`${service}:${account}`);
  }
}

export async function createKeytarKeychain(): Promise<Keychain> {
  const module = (await import("keytar")) as unknown as Partial<Keychain> & { default?: Partial<Keychain> };
  const keytar = module.default ?? module;
  if (
    typeof keytar.setPassword !== "function" ||
    typeof keytar.getPassword !== "function" ||
    typeof keytar.deletePassword !== "function"
  ) {
    throw new Error("keytar module did not expose the expected credential API.");
  }
  return keytar as Keychain;
}
