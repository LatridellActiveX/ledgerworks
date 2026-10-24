-- Migration 0003: internal admin tools.
-- The admin flag can ONLY be set from the database console (or this file);
-- there is no API or in-app path that writes it.
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
-- Every admin tool use: who, what, to whom, when.
CREATE TABLE IF NOT EXISTS admin_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, admin TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, detail TEXT NOT NULL);
-- Changes waiting for a player's game to pick up (cash +/-, save reset).
-- The game is client-authoritative, so edits to a stored save would just be
-- overwritten by the next autosave; the client applies these instead.
CREATE TABLE IF NOT EXISTS admin_inbox (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, kind TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS admin_inbox_player ON admin_inbox(player_id);
-- Server-side overrides, e.g. event_end (ISO time) for the live event.
CREATE TABLE IF NOT EXISTS admin_settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);
-- Recent client/worker errors (message only, no personal data). Trimmed to 500 rows.
CREATE TABLE IF NOT EXISTS client_errors (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, msg TEXT NOT NULL, src TEXT NOT NULL, build TEXT NOT NULL);
