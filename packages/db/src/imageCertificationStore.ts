import type { ImageModelCertificationRecord } from "@lsf/domain";
import { imageModelCertificationRecordSchema } from "@lsf/domain";
import type { FactoryDatabase } from "./connection";

export class ImageCertificationStore {
  constructor(private readonly db: FactoryDatabase) {}
  save(record: ImageModelCertificationRecord): void {
    const parsed = imageModelCertificationRecordSchema.parse(record);
    this.db.prepare(`INSERT INTO image_model_certifications (id, provider_id, configured_model_id, base_url_fingerprint, credential_version_ref, endpoint_strategy, implementation_version, overall_status, tested_at, payload_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(parsed.id, parsed.providerId, parsed.configuredModelId, parsed.baseUrlFingerprint, parsed.credentialVersionRef ?? null, parsed.endpointStrategy, parsed.implementationVersion, parsed.overallStatus, parsed.testedAt, JSON.stringify(parsed));
  }
  loadMatching(input: { configuredModelId: string; baseUrlFingerprint: string; credentialVersionRef?: string }): ImageModelCertificationRecord | null {
    const row = this.db.prepare(`SELECT payload_json FROM image_model_certifications WHERE provider_id = '9router' AND configured_model_id = ? AND base_url_fingerprint = ? AND credential_version_ref IS ? AND endpoint_strategy = 'images-generations' AND implementation_version = 'image-certification-v1' ORDER BY tested_at DESC, created_at DESC LIMIT 1`).get(input.configuredModelId, input.baseUrlFingerprint, input.credentialVersionRef ?? null) as { payload_json: string } | undefined;
    return row ? imageModelCertificationRecordSchema.parse(JSON.parse(row.payload_json)) : null;
  }
  loadLatest(): ImageModelCertificationRecord | null {
    const row = this.db.prepare("SELECT payload_json FROM image_model_certifications WHERE provider_id = '9router' ORDER BY tested_at DESC, created_at DESC LIMIT 1").get() as { payload_json: string } | undefined;
    return row ? imageModelCertificationRecordSchema.parse(JSON.parse(row.payload_json)) : null;
  }
  markStale(): void {
    const rows = this.db.prepare("SELECT payload_json FROM image_model_certifications WHERE provider_id = '9router' AND overall_status != 'stale'").all() as Array<{ payload_json: string }>;
    for (const row of rows) this.save({ ...imageModelCertificationRecordSchema.parse(JSON.parse(row.payload_json)), overallStatus: "stale" });
  }
}
