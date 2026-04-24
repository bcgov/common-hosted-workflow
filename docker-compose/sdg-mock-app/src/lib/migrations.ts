import type Database from 'better-sqlite3';

/**
 * A migration is a named, ordered schema change.
 *
 * - `version`: monotonically increasing integer (1, 2, 3, …).
 * - `name`: short human-readable label (used in logs and the migrations table).
 * - `up`: function that receives the database and applies the change.
 *
 * Rules for writing migrations:
 *   1. NEVER modify or delete an existing migration — only append new ones.
 *   2. Each migration runs inside a transaction (automatic).
 *   3. Use `IF NOT EXISTS` / `IF EXISTS` guards where SQLite supports them
 *      so that migrations are safe to reason about even if the DB is in an
 *      unexpected state.
 *   4. Keep each migration focused on a single logical change.
 */
export interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

// ────────────────────────────────────────────────────────────────────
// Migration registry — append new migrations at the end of this array
// ────────────────────────────────────────────────────────────────────

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS playgrounds (
          name           TEXT PRIMARY KEY,
          owner          TEXT NOT NULL,
          n8n_target     TEXT NOT NULL DEFAULT '',
          x_n8n_api_key  TEXT NOT NULL DEFAULT '',
          x_tenant_id    TEXT NOT NULL DEFAULT '',
          chefs_base_url TEXT NOT NULL DEFAULT '',
          created_at     TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_playgrounds_owner ON playgrounds(owner);

        CREATE TABLE IF NOT EXISTS playground_forms (
          id                   INTEGER PRIMARY KEY AUTOINCREMENT,
          playground_name      TEXT    NOT NULL REFERENCES playgrounds(name) ON DELETE CASCADE,
          form_id              TEXT    NOT NULL,
          form_name            TEXT    NOT NULL DEFAULT '',
          api_key              TEXT    NOT NULL DEFAULT '',
          allowed_actors       TEXT    NOT NULL DEFAULT '["*"]',
          callback_webhook_url TEXT    NOT NULL DEFAULT '',
          UNIQUE(playground_name, form_id)
        );
      `);
    },
  },

  // ── Future migrations go here ──
  // {
  //   version: 2,
  //   name: 'add_playground_description',
  //   up(db) {
  //     db.exec(`ALTER TABLE playgrounds ADD COLUMN description TEXT NOT NULL DEFAULT ''`);
  //   },
  // },
];

// ────────────────────────────────────────────────────────────────────
// Migration runner
// ────────────────────────────────────────────────────────────────────

/**
 * Ensure the `schema_migrations` bookkeeping table exists.
 */
function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

/**
 * Return the highest migration version that has already been applied,
 * or 0 if no migrations have run yet.
 */
function getCurrentVersion(db: Database.Database): number {
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null } | undefined;
  return row?.v ?? 0;
}

/**
 * Run all pending migrations in order.
 *
 * Each migration executes inside its own transaction so that a failure
 * leaves the database in the last known-good state. The bookkeeping
 * row is inserted in the same transaction as the schema change, so the
 * two are always consistent.
 *
 * Call this once during application startup (from `getDb()`).
 */
export function runMigrations(db: Database.Database): void {
  ensureMigrationsTable(db);

  const currentVersion = getCurrentVersion(db);

  const pending = migrations.filter((m) => m.version > currentVersion);
  if (pending.length === 0) return;

  const recordMigration = db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)');

  for (const migration of pending) {
    const apply = db.transaction(() => {
      migration.up(db);
      recordMigration.run(migration.version, migration.name);
    });

    apply();
    console.log(`[migrations] applied v${migration.version}: ${migration.name}`);
  }
}
