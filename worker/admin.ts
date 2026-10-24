// ============================================================================
// Internal admin tools (server side). Every /api/admin/* request is checked
// HERE against users.is_admin for the signed-in session; anyone else gets 403.
// The flag is never written by any endpoint: it is set only in the database
// console (see migrations/0003_admin.sql).
//
//  GET  /api/admin/dashboard        players (top by cash), economy, health, audit log
//  POST /api/admin/players {q}      player search by username / company
//  GET  /api/admin/econ             global economy overrides (Trade Spire panel)
//  POST /api/admin/econ {op, ..., confirm: true}   change them (see src/game/overrides.ts applyEcon)
//  POST /api/admin/tool {action, target?, amount?, hours?, confirm: true}
//        action: 'cash' (amount +/-), 'reset', 'event-end', 'event-extend' (hours)
//        Cash and reset are queued in admin_inbox for the player's game to
//        apply (the game owns its save); all tools write admin_audit.
//
// Public helpers used by the game:
//  POST /api/inbox  {id?, token?}   pending admin changes for this player (then cleared)
//  POST /api/error  {msg, src}      record a client error (rate-limited, trimmed)
//  eventEnd(env)                    the live event's end override, if any
// ============================================================================
import { sessionUser, sha256 } from './auth'
import { applyEcon, cleanEcon, describeEcon, isNormal, type Econ, type EconEvent } from '../src/game/overrides'
import { RES } from '../src/game/data'

const GOODS = new Set(Object.keys(RES))

export interface AdminEnv { DB: D1Database }
type Ledger = (op: string) => Promise<any>

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

/** Tool request validation (pure, unit-tested). Returns an error string or the clean request. */
export function parseTool(b: any): string | { action: 'cash' | 'reset' | 'event-end' | 'event-extend'; target: string; amount: number; hours: number } {
  if (!b || b.confirm !== true) return 'Confirmation required'
  const action = b.action
  if (!['cash', 'reset', 'event-end', 'event-extend'].includes(action)) return 'Unknown action'
  const target = String(b.target ?? '').toLowerCase()
  if ((action === 'cash' || action === 'reset') && !/^[a-z0-9_]{3,20}$/.test(target)) return 'Pick a player'
  const amount = Number(b.amount)
  if (action === 'cash' && (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1e9)) return 'Amount must be non-zero, at most 1,000,000,000'
  const hours = Number(b.hours)
  if (action === 'event-extend' && (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 30)) return 'Hours must be 1-720'
  return { action, target, amount: action === 'cash' ? Math.round(amount * 100) / 100 : 0, hours: action === 'event-extend' ? hours : 0 }
}

/** New event end after a tool (pure). end-now clamps to now; extend adds hours to the current end. */
export function newEventEnd(action: 'event-end' | 'event-extend', curEnd: string, hours: number, now: number) {
  return new Date(action === 'event-end' ? Math.min(now, Date.parse(curEnd)) : Date.parse(curEnd) + hours * 3600000).toISOString()
}

/** Is the signed-in user an admin? (server-side truth) */
export async function adminUser(req: Request, env: AdminEnv) {
  const me = await sessionUser(req, env)
  if (!me) return null
  const row = await env.DB.prepare('SELECT is_admin FROM users WHERE name = ?').bind(me.name).first<any>().catch(() => null)
  return row?.is_admin === 1 ? me : null
}

/** Live event end override (cached 60 s per isolate to keep D1 reads low). */
let evCache: { at: number; v: string | null } = { at: 0, v: null }
export async function eventEnd(env: AdminEnv): Promise<string | null> {
  if (Date.now() - evCache.at < 60000) return evCache.v
  const r = await env.DB.prepare("SELECT v FROM admin_settings WHERE k = 'event_end'").first<any>().catch(() => null)
  evCache = { at: Date.now(), v: r?.v ?? null }
  return evCache.v
}

/**
 * Global economy overrides (Trade Spire), cached 60 s per isolate like the
 * event end, so /api/world costs at most one extra D1 read a minute.
 */
let econCache: { at: number; v: Econ } | null = null
export async function econOverrides(env: AdminEnv, fresh = false): Promise<Econ> {
  if (!fresh && econCache && Date.now() - econCache.at < 60000) return econCache.v
  const r = await env.DB.prepare("SELECT v FROM admin_settings WHERE k = 'econ'").first<any>().catch(() => null)
  let v: Econ
  try { v = cleanEcon(r?.v ? JSON.parse(r.v) : null, GOODS) } catch { v = cleanEcon(null) }
  econCache = { at: Date.now(), v }
  return v
}
/** /api/world payload part: only sent when something is overridden. */
export async function econForWorld(env: AdminEnv) {
  const e = await econOverrides(env)
  return isNormal(e) ? undefined : e
}

/** Is this player id an admin? Used to strip admin-only fields from cloud saves. */
export async function isAdminId(env: AdminEnv, playerId: string) {
  const row = await env.DB.prepare('SELECT is_admin FROM users WHERE player_id = ?').bind(playerId).first<any>().catch(() => null)
  return row?.is_admin === 1
}

/**
 * Admin-only save fields (pure, tested). Non-admin saves lose them, so a
 * client hack can't keep a Trade Spire in the cloud. Mutates and returns state.
 */
export function stripAdminOnly(state: any, admin: boolean) {
  if (!admin && state && typeof state === 'object') delete state.adminSpire
  return state
}

// Per-IP error report limit (memory only, hashed IP): 10 a minute.
const errHits = new Map<string, { n: number; t: number }>()

export async function handlePublic(req: Request, env: AdminEnv, path: string, ipHash: string, me: { player_id: string } | null, build: string): Promise<Response | null> {
  if (path === '/api/error' && req.method === 'POST') {
    const h = errHits.get(ipHash), now = Date.now()
    if (h && now - h.t < 60000 && h.n >= 10) return json({ ok: false }, 429)
    errHits.set(ipHash, h && now - h.t < 60000 ? { n: h.n + 1, t: h.t } : { n: 1, t: now })
    const b = await req.json<any>().catch(() => ({}))
    await env.DB.batch([
      env.DB.prepare('INSERT INTO client_errors (ts, msg, src, build) VALUES (?,?,?,?)').bind(now, String(b.msg ?? '').slice(0, 300), String(b.src ?? 'client').slice(0, 60), build),
      env.DB.prepare('DELETE FROM client_errors WHERE id <= (SELECT MAX(id) - 500 FROM client_errors)'),
    ])
    return json({ ok: true })
  }
  if (path === '/api/inbox' && req.method === 'POST') {
    // Signed in: the account's row. Guest: cloud id proven by its token.
    const b = await req.json<any>().catch(() => ({}))
    let pid = me?.player_id
    if (!pid) {
      if (typeof b.id !== 'string' || typeof b.token !== 'string') return json({ items: [] })
      const row = await env.DB.prepare('SELECT token_hash FROM saves WHERE player_id = ?').bind(b.id).first<any>()
      if (!row || row.token_hash !== (await sha256(b.token))) return json({ items: [] })
      pid = b.id
    }
    const { results } = await env.DB.prepare('SELECT id, kind, amount FROM admin_inbox WHERE player_id = ? ORDER BY id').bind(pid).all<any>()
    if (results.length) await env.DB.prepare('DELETE FROM admin_inbox WHERE player_id = ? AND id <= ?').bind(pid, results[results.length - 1].id).run()
    return json({ items: results.map(r => ({ kind: r.kind, amount: r.amount })) })
  }
  return null
}

export async function handleAdmin(req: Request, env: AdminEnv, path: string, ledger: Ledger, world: () => Promise<any>, build: string, defaultEventEnd: string, cfgEvent?: EconEvent): Promise<Response | null> {
  if (!path.startsWith('/api/admin/')) return null
  const admin = await adminUser(req, env)
  if (!admin) return json({ error: 'forbidden' }, 403) // signed out or not an admin
  const op = path.slice('/api/admin/'.length)
  const now = Date.now()

  // Players: username, company, cash (last cloud save), company value (last
  // reported to the trade floor), last seen (last cloud save).
  const players = async (q: string) => {
    const like = '%' + q.replace(/[%_]/g, '') + '%'
    const { results } = await env.DB.prepare(`SELECT u.name, s.company, s.cash, s.updated FROM users u LEFT JOIN saves s ON s.player_id = u.player_id
      WHERE u.name LIKE ? OR s.company LIKE ? ORDER BY ${q ? 'u.name' : 's.cash DESC'} LIMIT 25`).bind(like, like).all<any>()
    const vals = await ledger('/admin/values').catch(() => ({}))
    return results.map(r => ({ name: r.name, company: r.company ?? '', cash: r.cash ?? 0, value: vals[r.name] ?? null, seen: r.updated ?? null }))
  }

  if (op === 'dashboard' && req.method === 'GET') {
    const [tot, act, errs, audit, w, board, ev] = await Promise.all([
      env.DB.prepare('SELECT SUM(cash) c, COUNT(*) n FROM saves').first<any>(),
      env.DB.prepare('SELECT SUM(updated > ?) h, SUM(updated > ?) d, SUM(updated > ?) w FROM saves').bind(now - 3600000, now - 86400000, now - 7 * 86400000).first<any>(),
      env.DB.prepare('SELECT ts, msg, src, build FROM client_errors ORDER BY id DESC LIMIT 20').all<any>(),
      env.DB.prepare('SELECT ts, admin, action, target, detail FROM admin_audit ORDER BY id DESC LIMIT 30').all<any>(),
      world(), ledger('/admin/board').catch(() => ({})), eventEnd(env),
    ])
    return json({
      me: admin.name,
      players: await players(''),
      economy: { totalCash: tot?.c ?? 0, saves: tot?.n ?? 0, goods: Object.keys(w.ref ?? {}).map(id => ({ id, price: w.ref[id], soldToday: w.sold?.[id] ?? 0, listed: board[id]?.qty ?? 0, orders: board[id]?.n ?? 0 })), day: w.day, phase: w.phase },
      health: { build, active: { hour: act?.h ?? 0, day: act?.d ?? 0, week: act?.w ?? 0 }, errors: errs.results },
      event: { end: ev ?? defaultEventEnd, overridden: !!ev },
      overrides: describeEcon(await econOverrides(env, true)),
      audit: audit.results,
    })
  }
  // ---- Trade Spire: global economy overrides (affect ALL players) ----
  if (op === 'econ') {
    const cur = await econOverrides(env, true)
    // The live event as players see it now (configured, plus the end-time tool).
    const base: EconEvent = cfgEvent ? { name: (cfgEvent as any).name, mult: cfgEvent.mult, start: cfgEvent.start, end: (await eventEnd(env)) ?? defaultEventEnd } : { name: 'Event', mult: 1, start: new Date(0).toISOString(), end: defaultEventEnd }
    if (req.method === 'GET') return json({ econ: cur, active: describeEcon(cur, now), event: cur.event ?? base, goods: [...GOODS] })
    if (req.method !== 'POST') return json({ error: 'method' }, 405)
    const r = applyEcon(await req.json<any>().catch(() => null), cur, now, base, GOODS)
    if (typeof r === 'string') return json({ error: r }, 400)
    await env.DB.prepare("INSERT INTO admin_settings (k, v) VALUES ('econ', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(r.econ)).run()
    econCache = null
    await env.DB.prepare('INSERT INTO admin_audit (ts, admin, action, target, detail) VALUES (?,?,?,?,?)').bind(now, admin.name, 'econ', 'all players', r.detail).run()
    return json({ ok: true, detail: r.detail, econ: r.econ, active: describeEcon(r.econ, now), event: r.econ.event ?? base })
  }
  if (op === 'players' && req.method === 'POST') {
    const b = await req.json<any>().catch(() => ({}))
    return json({ players: await players(String(b.q ?? '').slice(0, 40)) })
  }
  if (op === 'tool' && req.method === 'POST') {
    const t = parseTool(await req.json<any>().catch(() => null))
    if (typeof t === 'string') return json({ error: t }, 400)
    let detail = ''
    if (t.action === 'cash' || t.action === 'reset') {
      const u = await env.DB.prepare('SELECT player_id FROM users WHERE name = ?').bind(t.target).first<any>()
      if (!u) return json({ error: 'No such player' }, 404)
      await env.DB.prepare('INSERT INTO admin_inbox (player_id, kind, amount, ts) VALUES (?,?,?,?)').bind(u.player_id, t.action, t.amount, now).run()
      detail = t.action === 'cash' ? (t.amount > 0 ? 'gave $' : 'took $') + Math.abs(t.amount).toLocaleString('en-US') : 'save reset queued'
    } else {
      const end = newEventEnd(t.action, (await eventEnd(env)) ?? defaultEventEnd, t.hours, now)
      await env.DB.prepare("INSERT INTO admin_settings (k, v) VALUES ('event_end', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(end).run()
      evCache = { at: 0, v: null }
      detail = (t.action === 'event-end' ? 'ended event at ' : `extended event ${t.hours}h to `) + end
    }
    await env.DB.prepare('INSERT INTO admin_audit (ts, admin, action, target, detail) VALUES (?,?,?,?,?)').bind(now, admin.name, t.action, t.target || 'event', detail).run()
    return json({ ok: true, detail })
  }
  return json({ error: 'unknown' }, 404)
}
