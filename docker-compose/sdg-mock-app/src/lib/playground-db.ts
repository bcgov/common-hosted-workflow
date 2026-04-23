import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { runMigrations } from './migrations';

// ── Record interfaces (DB row shapes) ──

export interface PlaygroundRecord {
  name: string;
  owner: string;
  n8n_target: string;
  x_n8n_api_key: string;
  x_tenant_id: string;
  chefs_base_url: string;
  created_at: string;
  updated_at: string;
}

export interface FormEntryRecord {
  id: number;
  playground_name: string;
  form_id: string;
  form_name: string;
  api_key: string;
  allowed_actors: string; // JSON array stored as text
  callback_webhook_url: string;
}

// ── Input interfaces ──

export interface CreatePlaygroundInput {
  name: string;
  owner: string;
  n8nTarget?: string;
  xN8nApiKey?: string;
  tenantId?: string;
  chefsBaseUrl?: string;
  forms?: Array<{
    formId: string;
    formName: string;
    apiKey: string;
    allowedActors: string[];
    callbackWebhookUrl: string;
  }>;
}

export interface UpdatePlaygroundInput {
  n8nTarget?: string;
  xN8nApiKey?: string;
  tenantId?: string;
  chefsBaseUrl?: string;
  forms?: Array<{
    formId: string;
    formName: string;
    apiKey: string;
    allowedActors: string[];
    callbackWebhookUrl: string;
  }>;
}

// ── Database singleton (lazy init) ──

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'playgrounds.db');

let db: Database.Database | null = null;

/**
 * Return the database instance, creating and initializing it on first access.
 */
function getDb(): Database.Database {
  if (db) return db;

  const dbPath = process.env.PLAYGROUND_DB_PATH || DEFAULT_DB_PATH;
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

/**
 * Initialize the database explicitly. Useful for tests or eager startup.
 * Calling this multiple times is safe — migrations track what has already run.
 */
export function initDatabase(): void {
  getDb();
}

// ── Query helpers ──

/**
 * List all playgrounds owned by the given owner.
 */
export function listPlaygrounds(owner: string): PlaygroundRecord[] {
  const stmt = getDb().prepare('SELECT * FROM playgrounds WHERE owner = ? ORDER BY created_at DESC');
  return stmt.all(owner) as PlaygroundRecord[];
}

/**
 * List every playground in the database, ordered by owner then creation date.
 */
export function listAllPlaygrounds(): PlaygroundRecord[] {
  const stmt = getDb().prepare('SELECT * FROM playgrounds ORDER BY owner, created_at DESC');
  return stmt.all() as PlaygroundRecord[];
}

/**
 * Get a single playground by name, or null if it doesn't exist.
 */
export function getPlayground(name: string): PlaygroundRecord | null {
  const stmt = getDb().prepare('SELECT * FROM playgrounds WHERE name = ?');
  return (stmt.get(name) as PlaygroundRecord) ?? null;
}

/**
 * Get all form entries for a playground.
 */
export function getPlaygroundForms(name: string): FormEntryRecord[] {
  const stmt = getDb().prepare('SELECT * FROM playground_forms WHERE playground_name = ? ORDER BY id');
  return stmt.all(name) as FormEntryRecord[];
}

/**
 * Check whether a playground with the given name exists.
 */
export function playgroundExists(name: string): boolean {
  const stmt = getDb().prepare('SELECT 1 FROM playgrounds WHERE name = ?');
  return stmt.get(name) !== undefined;
}

// ── Mutation helpers ──

/**
 * Create a new playground with optional form entries.
 * Runs inside a transaction so the playground and its forms are inserted atomically.
 */
export function createPlayground(data: CreatePlaygroundInput): void {
  const database = getDb();

  const insertPlayground = database.prepare(`
    INSERT INTO playgrounds (name, owner, n8n_target, x_n8n_api_key, x_tenant_id, chefs_base_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertForm = database.prepare(`
    INSERT INTO playground_forms (playground_name, form_id, form_name, api_key, allowed_actors, callback_webhook_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const run = database.transaction(() => {
    insertPlayground.run(
      data.name,
      data.owner,
      data.n8nTarget ?? '',
      data.xN8nApiKey ?? '',
      data.tenantId ?? '',
      data.chefsBaseUrl ?? '',
    );

    if (data.forms) {
      for (const form of data.forms) {
        insertForm.run(
          data.name,
          form.formId,
          form.formName,
          form.apiKey,
          JSON.stringify(form.allowedActors),
          form.callbackWebhookUrl,
        );
      }
    }
  });

  run();
}

/**
 * Update an existing playground's configuration.
 * Replaces form entries entirely (delete all, re-insert) inside a transaction.
 */
export function updatePlayground(name: string, data: UpdatePlaygroundInput): void {
  const database = getDb();

  const updateStmt = database.prepare(`
    UPDATE playgrounds
    SET n8n_target     = COALESCE(?, n8n_target),
        x_n8n_api_key  = COALESCE(?, x_n8n_api_key),
        x_tenant_id    = COALESCE(?, x_tenant_id),
        chefs_base_url = COALESCE(?, chefs_base_url),
        updated_at     = datetime('now')
    WHERE name = ?
  `);

  const deleteForms = database.prepare('DELETE FROM playground_forms WHERE playground_name = ?');

  const insertForm = database.prepare(`
    INSERT INTO playground_forms (playground_name, form_id, form_name, api_key, allowed_actors, callback_webhook_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const run = database.transaction(() => {
    updateStmt.run(
      data.n8nTarget ?? null,
      data.xN8nApiKey ?? null,
      data.tenantId ?? null,
      data.chefsBaseUrl ?? null,
      name,
    );

    if (data.forms !== undefined) {
      deleteForms.run(name);
      for (const form of data.forms) {
        insertForm.run(
          name,
          form.formId,
          form.formName,
          form.apiKey,
          JSON.stringify(form.allowedActors),
          form.callbackWebhookUrl,
        );
      }
    }
  });

  run();
}

/**
 * Delete a playground by name. Form entries are removed via ON DELETE CASCADE.
 */
export function deletePlayground(name: string): void {
  const stmt = getDb().prepare('DELETE FROM playgrounds WHERE name = ?');
  stmt.run(name);
}
