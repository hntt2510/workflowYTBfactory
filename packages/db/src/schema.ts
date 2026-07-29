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

export const migrations = [
  {
    id: "001_batch1_persistence",
    statements: [
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS channel_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        format TEXT NOT NULL,
        target_language TEXT NOT NULL,
        profile_id TEXT NOT NULL,
        route_decision_json TEXT NOT NULL,
        approved_idea_id TEXT,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (profile_id) REFERENCES channel_profiles(id)
      );`,
      `CREATE TABLE IF NOT EXISTS project_settings (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );`,
      `CREATE TABLE IF NOT EXISTS ideas (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );`,
      `CREATE TABLE IF NOT EXISTS claims (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );`,
      `CREATE TABLE IF NOT EXISTS script_versions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );`,
      `CREATE TABLE IF NOT EXISTS script_sections (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        script_version_id TEXT NOT NULL,
        section_order INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (script_version_id) REFERENCES script_versions(id) ON DELETE CASCADE
      );`,
      `CREATE TABLE IF NOT EXISTS scenes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        script_section_id TEXT NOT NULL,
        start_frame INTEGER NOT NULL,
        duration_frames INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (script_section_id) REFERENCES script_sections(id) ON DELETE CASCADE
      );`,
      `CREATE TABLE IF NOT EXISTS shots (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        scene_id TEXT NOT NULL,
        shot_order INTEGER NOT NULL,
        start_frame INTEGER NOT NULL,
        duration_frames INTEGER NOT NULL,
        fps INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE
      );`,
      `CREATE TABLE IF NOT EXISTS timeline_tracks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        track_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );`,
      `CREATE TABLE IF NOT EXISTS timeline_items (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        track_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        start_frame INTEGER NOT NULL,
        duration_frames INTEGER NOT NULL,
        fps INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (track_id) REFERENCES timeline_tracks(id) ON DELETE CASCADE
      );`,
      `CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );`,
      `CREATE TABLE IF NOT EXISTS generation_jobs (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        shot_id TEXT,
        state TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );`,
      `CREATE TABLE IF NOT EXISTS job_attempts (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES generation_jobs(id) ON DELETE CASCADE
      );`,
      `CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        local_path TEXT,
        hash TEXT,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );`,
      `CREATE TABLE IF NOT EXISTS app_settings (
        id TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`,
      `CREATE TABLE IF NOT EXISTS provider_credentials (
        provider_id TEXT PRIMARY KEY,
        credential_ref TEXT NOT NULL,
        base_url TEXT NOT NULL,
        text_model TEXT,
        image_model TEXT,
        video_model TEXT,
        tts_model TEXT,
        stt_model TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`
    ]
  }
] as const;
