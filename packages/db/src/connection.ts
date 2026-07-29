import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { migrations } from "./schema";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

export type FactoryDatabase = import("node:sqlite").DatabaseSync;

export function openFactoryDatabase(databasePath: string): FactoryDatabase {
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA journal_mode=WAL;");
  db.exec("PRAGMA foreign_keys=ON;");
  runMigrations(db);
  return db;
}

export function runMigrations(db: FactoryDatabase): void {
  db.exec("PRAGMA foreign_keys=ON;");
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`);
  const hasMigration = db.prepare("SELECT id FROM schema_migrations WHERE id = ?");
  for (const migration of migrations) {
    if (hasMigration.get(migration.id)) {
      continue;
    }
    db.exec("BEGIN IMMEDIATE;");
    try {
      for (const statement of migration.statements) {
        db.exec(statement);
      }
      db.prepare("INSERT INTO schema_migrations (id) VALUES (?)").run(migration.id);
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  }
}

export function assertForeignKeysEnabled(db: FactoryDatabase): boolean {
  const row = db.prepare("PRAGMA foreign_keys;").get() as Record<string, number>;
  return Object.values(row)[0] === 1;
}
