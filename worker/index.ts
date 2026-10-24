// ============================================================================
// Ledgerworks Cloudflare Worker.
//
//  GET  /                 the game (single HTML file, injected at build time)
//  GET  /version.json     build stamp
//  GET  /api/world        shared world: game day, reference prices (+ phase)
//  POST /api/report       a player reports exchange volume sold today
//  POST /api/save         cloud save   { id, token, state }
//  POST /api/load         cloud load   { id, token }
//  /api/auth/*           accounts: signup, login, logout, me (see auth.ts)
//  POST /api/p2p/<op>     player-to-player trading (see src/game/p2p.ts)
//  cron (every 15 min)    advances the shared market one step
//
// Storage:
//  - D1 `DB`: cloud saves (one row per browser/player).
//  - Durable Object `MARKET` (SQLite-backed, single instance "world"): the
//    shared economy. Being one object means every price update is applied in
//    order, with no races between players or the cron.
// ============================================================================
// Newest change-log entries go into /version.json so an OLD open tab's update
// pop-up can show what the NEW build contains (its own bundle only knows older notes).
import { CHANGELOG } from '../src/changelog'
import { handlePlayers } from './players'
import { cleanupGuestSaves, isCleanupSlot } from './cleanup'
import { privacyHtml } from '../src/legal/privacy'
import { MarketDO } from './market-do'
import { handleAuth, sessionUser, ensureAuthSchema } from './auth'
export { MarketDO }

declare const __HTML__: string
declare const __SCENE__: string
declare const __BUILD__: string
declare const __BUILD_ID__: string
/** Icons + manifest embedded at build time: path -> { content type, base64 bytes }. */
declare const __ASSETS__: Record<string, { type: string; b64: string }> // matches the id baked into the page

export interface Env { DB: D1Database; MARKET: DurableObjectNamespace }

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json' } })
const world = (env: Env) => env.MARKET.get(env.MARKET.idFromName('world'))

/** Hash a token so the database never stores the raw secret. */
async function sha(t: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    // Plain privacy policy page (same text as the in-game Privacy screen).
    if (url.pathname === '/privacy' || url.pathname === '/privacy/') return new Response(privacyHtml(), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } })
    // Guest data deletion: removes the cloud saves for this id, proven by its token.
    if (url.pathname === '/api/cloud-delete' && req.method === 'POST') {
      const b = await req.json<any>().catch(() => ({}))
      if (typeof b.id !== 'string' || typeof b.token !== 'string' || !/^[0-9a-f]{8,64}$/.test(b.id)) return json({ error: 'bad request' }, 400)
      const row = await env.DB.prepare('SELECT token_hash FROM saves WHERE player_id=?').bind(b.id).first<any>()
      if (row && row.token_hash !== (await sha(b.token))) return json({ error: 'wrong token' }, 403)
      // An account owns this id: it must be deleted through the account (password).
      if (await env.DB.prepare('SELECT 1 FROM users WHERE player_id = ?').bind(b.id).first().catch(() => null)) return json({ error: 'This save belongs to an account. Sign in to delete it.' }, 409)
      await env.DB.prepare('DELETE FROM saves WHERE player_id IN (?, ?)').bind(b.id, b.id + '-s').run()
      return json({ ok: true })
    }
    if (url.pathname === '/version.json') return new Response(JSON.stringify({ build: __BUILD__, buildId: __BUILD_ID__, version: __BUILD__.slice(0, 16).replace('T', ' '), latest: CHANGELOG.slice(0, 5) }), {
      // Never cached, so open tabs always see a new deploy (update pop-up).
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store, max-age=0' },
    })
    // Favicon, app icons and the web app manifest (cached for a day).
    const asset = __ASSETS__[url.pathname]
    if (asset) return new Response(Uint8Array.from(atob(asset.b64), c => c.charCodeAt(0)), { headers: { 'content-type': asset.type, 'cache-control': 'public, max-age=86400' } })
    // Lazy 3D campus bundle; the URL carries a build stamp so it can cache for a year.
    if (url.pathname === '/scene3d.js') return new Response(__SCENE__, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=31536000, immutable' } })

    if (url.pathname === '/api/world') return world(env).fetch('https://do/world')
    if (url.pathname === '/api/report' && req.method === 'POST') return world(env).fetch('https://do/report', { method: 'POST', body: await req.text() })

    // Stage 11: player accounts and trading all live in the market object.
    if (url.pathname.startsWith('/api/p2p/') && req.method === 'POST') {
      // Trade floor: a signed-in game session authenticates the trader (no key).
      // `sess` is ONLY ever set here from the cookie; a client-sent one is dropped.
      const b = await req.json<any>().catch(() => ({}))
      delete b.sess
      await ensureAuthSchema(env)
      const me = await sessionUser(req, env)
      if (me) b.sess = me.name
      return world(env).fetch('https://do/p2p/' + url.pathname.slice(9), { method: 'POST', body: JSON.stringify(b) })
    }
    // Player search + public profiles (worker/players.ts). Rate-limited per hashed IP, in memory only.
    if (url.pathname.startsWith('/api/players/')) {
      await ensureAuthSchema(env)
      const ledger = (op: string, body: unknown) => world(env).fetch('https://do/p2p/' + op, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json<any>())
      return (await handlePlayers(req, env, url, ledger, await sha(req.headers.get('cf-connecting-ip') ?? 'local')))!
    }
    const auth = await handleAuth(req, env, url.pathname)
    if (auth) return auth
    if (url.pathname === '/api/save' && req.method === 'POST') {
      // Signed in: the account's own save row (no cloud token needed).
      // Otherwise: the legacy cloud key (id + token), still the recovery path.
      const me = await sessionUser(req, env)
      const raw = await req.json<any>()
      if (me) { raw.id = me.player_id + (raw.seasons ? '-s' : ''); raw.token = 'session:' + me.player_id }
      const { id, token, state } = raw
      if (typeof id !== 'string' || typeof token !== 'string' || id.length > 64 || !state) return json({ error: 'bad request' }, 400)
      const body = JSON.stringify(state)
      if (body.length > 900_000) return json({ error: 'save too large' }, 413)
      const h = await sha(token)
      const row = await env.DB.prepare('SELECT token_hash FROM saves WHERE player_id=?').bind(id).first<any>()
      if (row && row.token_hash !== h && !me) return json({ error: 'wrong token' }, 403)
      await env.DB.prepare(`INSERT INTO saves (player_id, token_hash, company, level, cash, state, updated) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(player_id) DO UPDATE SET company=excluded.company, level=excluded.level, cash=excluded.cash, state=excluded.state, updated=excluded.updated`)
        .bind(id, h, String(state.company ?? '').slice(0, 40), Number(state.level ?? 1), Number(state.cash ?? 0), body, Date.now()).run()
      return json({ ok: true })
    }
    if (url.pathname === '/api/load' && req.method === 'POST') {
      const me = await sessionUser(req, env)
      const b = await req.json<any>()
      const id = me ? me.player_id + (b.seasons ? '-s' : '') : b.id
      const row = await env.DB.prepare('SELECT token_hash, state FROM saves WHERE player_id=?').bind(id).first<any>()
      if (!row) return json({ error: 'no save' }, 404)
      if (!me && row.token_hash !== (await sha(b.token))) return json({ error: 'wrong token' }, 403)
      return new Response(row.state, { headers: { 'content-type': 'application/json' } })
    }

    // Everything else: the game itself.
    return new Response(__HTML__, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } })
  },

  /** Cron trigger: step the shared economy. */
  async scheduled(_e: ScheduledEvent, env: Env) {
    await world(env).fetch('https://do/tick', { method: 'POST' })
    // Once a day: delete guest cloud saves unused for 90+ days (see worker/cleanup.ts).
    if (isCleanupSlot(Date.now())) { await ensureAuthSchema(env); await cleanupGuestSaves(env).catch(() => 0) }
  },
}
