// ============================================================================
// Accounts: username + password sign-up / sign-in for Ledgerworks.
//
//  POST /api/auth/signup  { name, password, cloudId?, cloudToken? }
//        Creates an account. With a cloud id/token (a guest's or a legacy
//        cloud-key player's), the account takes over that cloud save, so a
//        guest keeps their company and old cloud-key players "set a password".
//  POST /api/auth/login   { name, password }   -> session cookie
//  POST /api/auth/logout                        -> clears the session
//  GET  /api/auth/me                            -> { name } or 401
//
// Security:
//  - Passwords: PBKDF2-SHA256 via WebCrypto, 100,000 iterations (the Workers
//    maximum), per-user 16-byte random salt; compared in constant time.
//  - Sessions: 32 random bytes in an HttpOnly; Secure; SameSite=Lax cookie,
//    30-day expiry. Only the SHA-256 of the token is stored in D1.
//  - Rate limit: 5 failed logins for a username lock it for 15 minutes.
//  - The legacy cloud key (id.token) keeps working for /api/save + /api/load
//    as a recovery path.
// ============================================================================

export interface AuthEnv { DB: D1Database }

export const ITERS = 100_000
export const SESSION_MS = 30 * 24 * 3600 * 1000
export const MAX_FAILS = 5
export const LOCK_MS = 15 * 60 * 1000
export const COOKIE = 'lw_session'

const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
const fromHex = (h: string) => new Uint8Array(h.match(/../g)!.map(x => parseInt(x, 16)))
export const randomHex = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)))
export async function sha256(t: string) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))) }

/** PBKDF2-SHA256(password, salt) -> 32-byte hex. */
export async function hashPassword(password: string, saltHex: string, iters = ITERS) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: iters }, key, 256)
  return hex(bits)
}
/** Constant-time compare of two hex strings. */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}
/** Username rule: 3-20 letters, digits or _ (case-insensitive, stored lowercase). */
export const validName = (n: unknown): n is string => typeof n === 'string' && /^[a-zA-Z0-9_]{3,20}$/.test(n)
/** Password rule: 8-128 characters. */
export const validPassword = (p: unknown): p is string => typeof p === 'string' && p.length >= 8 && p.length <= 128

/** Rate-limit bookkeeping after a failed login (pure). */
export function afterFail(prev: { fails: number; until: number } | null, now: number) {
  const fails = (prev && prev.until && prev.until < now ? 0 : prev?.fails ?? 0) + 1
  return { fails, until: fails >= MAX_FAILS ? now + LOCK_MS : 0 }
}
export const isLocked = (row: { until: number } | null, now: number) => !!row && row.until > now

let schemaReady = false
/** Apply migration 0002 once per isolate (idempotent). */
export async function ensureAuthSchema(env: AuthEnv) {
  if (schemaReady) return
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS users (name TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL, iters INTEGER NOT NULL, player_id TEXT NOT NULL, created INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, name TEXT NOT NULL, expires INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS sessions_name ON sessions(name)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS login_fails (k TEXT PRIMARY KEY, fails INTEGER NOT NULL, until INTEGER NOT NULL)'),
    // Old rate-limit rows were keyed "name|ip"; drop them so no IPs are kept.
    env.DB.prepare("DELETE FROM login_fails WHERE k LIKE '%|%'"),
  ])
  schemaReady = true
}

const json = (d: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json', ...headers } })
const cookieOf = (req: Request) => (req.headers.get('cookie') ?? '').split(/;\s*/).find(c => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) ?? ''
const setCookie = (v: string, maxAge: number) => `${COOKIE}=${v}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`

/** The signed-in user for this request, or null. */
export async function sessionUser(req: Request, env: AuthEnv): Promise<{ name: string; player_id: string } | null> {
  const tok = cookieOf(req)
  if (!tok) return null
  await ensureAuthSchema(env)
  const row = await env.DB.prepare('SELECT u.name, u.player_id, s.expires FROM sessions s JOIN users u ON u.name = s.name WHERE s.token_hash = ?').bind(await sha256(tok)).first<any>()
  if (!row || row.expires < Date.now()) return null
  return { name: row.name, player_id: row.player_id }
}

/** Start a session for `name`: returns the Set-Cookie header value. */
async function startSession(env: AuthEnv, name: string) {
  const tok = randomHex(32)
  await env.DB.prepare('INSERT INTO sessions (token_hash, name, expires) VALUES (?,?,?)').bind(await sha256(tok), name, Date.now() + SESSION_MS).run()
  return setCookie(tok, SESSION_MS / 1000)
}

/** Handle /api/auth/*; returns null for other paths. */
export async function handleAuth(req: Request, env: AuthEnv, path: string): Promise<Response | null> {
  if (!path.startsWith('/api/auth/')) return null
  await ensureAuthSchema(env)
  const op = path.slice('/api/auth/'.length)
  if (op === 'me') { const u = await sessionUser(req, env); return u ? json({ name: u.name }) : json({ error: 'signed out' }, 401) }
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  if (op === 'logout') {
    const tok = cookieOf(req)
    if (tok) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(tok)).run()
    return json({ ok: true }, 200, { 'set-cookie': setCookie('', 0) })
  }
  const b = await req.json<any>().catch(() => ({}))
  if (!validName(b.name)) return json({ error: 'Username: 3-20 letters, digits or _' }, 400)
  const name = b.name.toLowerCase()
  if (op === 'signup') {
    if (!validPassword(b.password)) return json({ error: 'Password: at least 8 characters' }, 400)
    if (await env.DB.prepare('SELECT 1 FROM users WHERE name = ?').bind(name).first()) return json({ error: 'That username is taken' }, 409)
    // Take over a cloud save: a guest's own id, or a legacy cloud key (token must match if a save exists).
    let player = 'u_' + randomHex(12)
    if (typeof b.cloudId === 'string' && typeof b.cloudToken === 'string' && /^[0-9a-f]{8,64}$/.test(b.cloudId)) {
      const row = await env.DB.prepare('SELECT token_hash FROM saves WHERE player_id = ?').bind(b.cloudId).first<any>()
      if (row && row.token_hash !== (await sha256(b.cloudToken))) return json({ error: 'That cloud key does not match its save' }, 403)
      if (await env.DB.prepare('SELECT 1 FROM users WHERE player_id = ?').bind(b.cloudId).first()) return json({ error: 'That cloud save already belongs to an account' }, 409)
      player = b.cloudId
    }
    const salt = randomHex(16)
    await env.DB.prepare('INSERT INTO users (name, salt, hash, iters, player_id, created) VALUES (?,?,?,?,?,?)').bind(name, salt, await hashPassword(b.password, salt), ITERS, player, Date.now()).run()
    return json({ ok: true, name }, 200, { 'set-cookie': await startSession(env, name) })
  }
  if (op === 'delete') {
    // Permanently delete the signed-in account. Needs the session AND the
    // password (so a borrowed unlocked device can't do it by accident).
    const me = await sessionUser(req, env)
    if (!me || me.name !== name) return json({ error: 'Sign in as this user first' }, 401)
    const u = await env.DB.prepare('SELECT salt, hash, iters FROM users WHERE name = ?').bind(name).first<any>()
    if (!u || !safeEqual(await hashPassword(String(b.password ?? ''), u.salt, u.iters), u.hash)) return json({ error: 'Wrong password' }, 401)
    await env.DB.batch([
      env.DB.prepare('DELETE FROM saves WHERE player_id IN (?, ?)').bind(me.player_id, me.player_id + '-s'),
      env.DB.prepare('DELETE FROM sessions WHERE name = ?').bind(name),
      env.DB.prepare('DELETE FROM login_fails WHERE k = ?').bind(name),
      env.DB.prepare('DELETE FROM users WHERE name = ?').bind(name),
    ])
    return json({ ok: true }, 200, { 'set-cookie': setCookie('', 0) })
  }
  if (op === 'login') {
    // Keyed by username (not name+IP): attackers and proxies rotate IPs, so a
    // per-IP key alone would never trip. A lock lasts 15 minutes at most.
    const k = name, now = Date.now()
    const lock = await env.DB.prepare('SELECT fails, until FROM login_fails WHERE k = ?').bind(k).first<any>()
    if (isLocked(lock, now)) return json({ error: `Too many tries. Try again in ${Math.ceil((lock.until - now) / 60000)} min.` }, 429)
    const u = await env.DB.prepare('SELECT salt, hash, iters FROM users WHERE name = ?').bind(name).first<any>()
    // Hash even for unknown users so timing doesn't reveal which names exist.
    const h = await hashPassword(String(b.password ?? ''), u?.salt ?? '00'.repeat(16), u?.iters ?? ITERS)
    if (!u || !safeEqual(h, u.hash)) {
      const n = afterFail(lock, now)
      await env.DB.prepare('INSERT INTO login_fails (k, fails, until) VALUES (?,?,?) ON CONFLICT(k) DO UPDATE SET fails = excluded.fails, until = excluded.until').bind(k, n.fails, n.until).run()
      return json({ error: 'Wrong username or password' }, 401)
    }
    await env.DB.prepare('DELETE FROM login_fails WHERE k = ?').bind(k).run()
    await env.DB.prepare('DELETE FROM sessions WHERE name = ? AND expires < ?').bind(name, now).run() // tidy old sessions
    return json({ ok: true, name }, 200, { 'set-cookie': await startSession(env, name) })
  }
  return json({ error: 'unknown' }, 404)
}
