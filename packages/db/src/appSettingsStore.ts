import type { FactoryDatabase } from "./connection";

export class AppSettingsStore {
  constructor(private readonly db: FactoryDatabase) {}

  load<T extends Record<string, unknown>>(id: string, fallback: T): T {
    const row = this.db.prepare("SELECT payload_json FROM app_settings WHERE id = ?").get(id) as { payload_json: string } | undefined;
    if (!row) return fallback;
    return { ...fallback, ...(JSON.parse(row.payload_json) as Partial<T>) };
  }

  save<T extends Record<string, unknown>>(id: string, payload: T): T {
    this.db
      .prepare(
        `INSERT INTO app_settings (id, payload_json, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
          payload_json = excluded.payload_json,
          updated_at = CURRENT_TIMESTAMP`
      )
      .run(id, JSON.stringify(payload));
    return payload;
  }
}
