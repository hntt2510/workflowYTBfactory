const tableNames = [
  "channel_profiles",
  "channel_profile_versions",
  "channel_memory_rules",
  "projects",
  "project_settings",
  "references",
  "reference_metadata",
  "transcripts",
  "transcript_segments",
  "competitor_dna_cards",
  "opportunity_maps",
  "ideas",
  "idea_scores",
  "research_sources",
  "claims",
  "claim_source_links",
  "script_versions",
  "script_sections",
  "scenes",
  "shots",
  "characters",
  "locations",
  "objects",
  "continuity_states",
  "prompt_templates",
  "prompt_versions",
  "assets",
  "asset_sources",
  "generation_jobs",
  "job_attempts",
  "voice_segments",
  "timeline_tracks",
  "timeline_items",
  "capcut_exports",
  "usage_events",
  "approvals",
  "feedback_rules",
  "app_settings"
] as const;

export type FactoryTableName = (typeof tableNames)[number];

export const sqliteBootstrapSql = [
  "PRAGMA journal_mode=WAL;",
  "PRAGMA foreign_keys=ON;",
  ...tableNames.map(
    (name) => `CREATE TABLE IF NOT EXISTS ${name} (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  profile_id TEXT,
  status TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`
  )
];

export const requiredTableNames = tableNames;

