import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

// Opens (and creates if needed) the database. Pass ':memory:' in tests.
export function openDb(dataDir: string): DatabaseSync {
  let path = ':memory:'
  if (dataDir !== ':memory:') {
    mkdirSync(dataDir, { recursive: true })
    path = join(dataDir, 'drawings.db')
  }
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS drawing (
      id         INTEGER PRIMARY KEY,
      title      TEXT NOT NULL,
      drawn_on   TEXT NOT NULL, -- YYYY-MM-DD in TZ
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
    );
    CREATE TABLE IF NOT EXISTS file (
      id         INTEGER PRIMARY KEY,
      drawing_id INTEGER NOT NULL REFERENCES drawing(id) ON DELETE CASCADE,
      format     TEXT NOT NULL,
      filename   TEXT NOT NULL,
      size       INTEGER NOT NULL,
      sha256     TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
    );
    CREATE INDEX IF NOT EXISTS file_drawing ON file(drawing_id);
  `)
  return db
}
