import type { TextModelCertificationRecord } from "@lsf/domain";
import { textModelCertificationRecordSchema } from "@lsf/domain";
import type { FactoryDatabase } from "./connection";

export class TextCertificationStore {
  constructor(private readonly db: FactoryDatabase) {}

  saveTextCertificationRecord(record: TextModelCertificationRecord): void {
    const parsed = textModelCertificationRecordSchema.parse(record);
    this.db
      .prepare(
        `INSERT INTO text_model_certifications
          (id, provider_id, configured_model_id, base_url_fingerprint, credential_version_ref, endpoint_strategy, implementation_version, overall_status, tested_at, payload_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
          overall_status = excluded.overall_status,
          payload_json = excluded.payload_json,
          updated_at = CURRENT_TIMESTAMP`
      )
      .run(
        parsed.id,
        parsed.providerId,
        parsed.configuredModelId,
        parsed.baseUrlFingerprint,
        parsed.credentialVersionRef ?? null,
        parsed.endpointStrategy,
        parsed.implementationVersion,
        parsed.overallStatus,
        parsed.testedAt,
        JSON.stringify(parsed)
      );
  }

  loadLatestTextCertification(providerId: "9router"): TextModelCertificationRecord | null {
    const row = this.db
      .prepare(
        `SELECT payload_json FROM text_model_certifications
         WHERE provider_id = ?
         ORDER BY tested_at DESC, created_at DESC
         LIMIT 1`
      )
      .get(providerId) as { payload_json: string } | undefined;
    return row ? textModelCertificationRecordSchema.parse(JSON.parse(row.payload_json)) : null;
  }

  loadLatestMatchingTextCertification(input: {
    providerId: "9router";
    configuredModelId: string;
    baseUrlFingerprint: string;
    credentialVersionRef?: string;
    endpointStrategy: "responses";
    implementationVersion: "text-certification-v1";
  }): TextModelCertificationRecord | null {
    const row = this.db
      .prepare(
        `SELECT payload_json FROM text_model_certifications
         WHERE provider_id = ?
          AND configured_model_id = ?
          AND base_url_fingerprint = ?
          AND credential_version_ref IS ?
          AND endpoint_strategy = ?
          AND implementation_version = ?
         ORDER BY tested_at DESC, created_at DESC
         LIMIT 1`
      )
      .get(
        input.providerId,
        input.configuredModelId,
        input.baseUrlFingerprint,
        input.credentialVersionRef ?? null,
        input.endpointStrategy,
        input.implementationVersion
      ) as { payload_json: string } | undefined;
    return row ? textModelCertificationRecordSchema.parse(JSON.parse(row.payload_json)) : null;
  }

  markTextCertificationsStale(providerId: "9router"): number {
    const rows = this.db
      .prepare(
        `SELECT id, payload_json FROM text_model_certifications
         WHERE provider_id = ? AND overall_status != 'stale'`
      )
      .all(providerId) as Array<{ id: string; payload_json: string }>;

    for (const row of rows) {
      const record = textModelCertificationRecordSchema.parse(JSON.parse(row.payload_json));
      this.saveTextCertificationRecord({ ...record, overallStatus: "stale" });
    }
    return rows.length;
  }
}
