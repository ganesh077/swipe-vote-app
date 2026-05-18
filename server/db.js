import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { getSeedItems } from "./items.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const defaultDbPath = path.join(projectRoot, "data", "swipe-vote.sqlite");

export const dbPath = process.env.DB_PATH || defaultDbPath;

export function openDatabase() {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);

  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      image_url TEXT NOT NULL,
      accent TEXT NOT NULL,
      sort_order INTEGER NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      choice TEXT NOT NULL CHECK (choice IN ('yes', 'no')),
      decision_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (session_id, item_id)
    );

    CREATE TABLE IF NOT EXISTS vote_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL,
      choice TEXT NOT NULL CHECK (choice IN ('yes', 'no')),
      decision_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return db;
}

export function seedItems(db, { force = false } = {}) {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM items").get().count;
  if (existing > 0 && !force) {
    return { inserted: 0, total: existing, skipped: true };
  }

  const items = getSeedItems();
  const insert = db.prepare(`
    INSERT INTO items (id, label, description, category, image_url, accent, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      label = excluded.label,
      description = excluded.description,
      category = excluded.category,
      image_url = excluded.image_url,
      accent = excluded.accent,
      sort_order = excluded.sort_order
  `);

  db.exec("BEGIN IMMEDIATE");
  try {
    if (force) {
      db.exec("DELETE FROM vote_events; DELETE FROM votes; DELETE FROM sessions; DELETE FROM items;");
    }

    for (const item of items) {
      insert.run(
        item.id,
        item.label,
        item.description,
        item.category,
        item.imageUrl,
        item.accent,
        item.sortOrder
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { inserted: items.length, total: items.length, skipped: false };
}

export function ensureSeeded(db) {
  return seedItems(db, { force: false });
}
