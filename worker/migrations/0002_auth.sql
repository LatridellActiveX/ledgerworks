-- Migration 0002: username + password accounts, sessions, login rate limits.
-- Applied automatically by the Worker on first use (ensureAuthSchema), and
-- kept here as the reference copy. Idempotent (IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS users (
  name TEXT PRIMARY KEY,        -- lowercase username, 3-20 [a-z0-9_]
  salt TEXT NOT NULL,           -- per-user random salt (hex, 16 bytes)
  hash TEXT NOT NULL,           -- PBKDF2-SHA256(password, salt) (hex, 32 bytes)
  iters INTEGER NOT NULL,       -- PBKDF2 iteration count used for this hash
  player_id TEXT NOT NULL,      -- cloud save row this account owns (legacy cloud id or new)
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,  -- SHA-256 of the session cookie value (raw never stored)
  name TEXT NOT NULL,
  expires INTEGER NOT NULL      -- ms timestamp
);
CREATE INDEX IF NOT EXISTS sessions_name ON sessions(name);
CREATE TABLE IF NOT EXISTS login_fails (
  k TEXT PRIMARY KEY,           -- username (older rows were "name|ip"; the Worker deletes those)
  fails INTEGER NOT NULL,
  until INTEGER NOT NULL        -- locked until this ms timestamp (0 = not locked)
);
