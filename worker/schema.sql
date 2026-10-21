-- D1 schema for Ledgerworks cloud saves.
CREATE TABLE IF NOT EXISTS saves (
  player_id TEXT PRIMARY KEY,   -- random id kept in the browser
  token_hash TEXT NOT NULL,     -- SHA-256 of the browser's secret token
  company TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  cash REAL NOT NULL DEFAULT 0,
  state TEXT NOT NULL,          -- full GameState JSON
  updated INTEGER NOT NULL      -- ms timestamp
);
