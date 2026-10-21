// ============================================================================
// Ledgerworks Cloudflare Worker.
//
//  GET  /                 the game (single HTML file, injected at build time)
//  GET  /version.json     build stamp
//  GET  /api/world        shared world: game day, reference prices (+ phase)
//  POST /api/report       a player reports exchange volume sold today
//  POST /api/save         cloud save   { id, token, state }
//  POST /api/load         cloud load   { id, token }
//  cron (every 15 min)    advances the shared market one step
//
// Storage:
//  - D1 `DB`: cloud saves (one row per browser/player).
//  - Durable Object `MARKET` (SQLite-backed, single instance "world"): the
//    shared economy. Being one object means every price update is applied in
//    order, with no races between players or the cron.
// ============================================================================
import { MarketDO } from './market-do'
export { MarketDO }

declare const __HTML__: string
declare const __BUILD__: string

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
    if (url.pathname === '/version.json') return json({ build: __BUILD__ })

    if (url.pathname === '/api/world') return world(env).fetch('https://do/world')
    if (url.pathname === '/api/report' && req.method === 'POST') return world(env).fetch('https://do/report', { method: 'POST', body: await req.text() })

    if (url.pathname === '/api/save' && req.method === 'POST') {
      const { id, token, state } = await req.json<any>()
      if (typeof id !== 'string' || typeof token !== 'string' || id.length > 64 || !state) return json({ error: 'bad request' }, 400)
      const body = JSON.stringify(state)
      if (body.length > 900_000) return json({ error: 'save too large' }, 413)
      const h = await sha(token)
      const row = await env.DB.prepare('SELECT token_hash FROM saves WHERE player_id=?').bind(id).first<any>()
      if (row && row.token_hash !== h) return json({ error: 'wrong token' }, 403)
      await env.DB.prepare(`INSERT INTO saves (player_id, token_hash, company, level, cash, state, updated) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(player_id) DO UPDATE SET company=excluded.company, level=excluded.level, cash=excluded.cash, state=excluded.state, updated=excluded.updated`)
        .bind(id, h, String(state.company ?? '').slice(0, 40), Number(state.level ?? 1), Number(state.cash ?? 0), body, Date.now()).run()
      return json({ ok: true })
    }
    if (url.pathname === '/api/load' && req.method === 'POST') {
      const { id, token } = await req.json<any>()
      const row = await env.DB.prepare('SELECT token_hash, state FROM saves WHERE player_id=?').bind(id).first<any>()
      if (!row) return json({ error: 'no save' }, 404)
      if (row.token_hash !== (await sha(token))) return json({ error: 'wrong token' }, 403)
      return new Response(row.state, { headers: { 'content-type': 'application/json' } })
    }

    // Everything else: the game itself.
    return new Response(__HTML__, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } })
  },

  /** Cron trigger: step the shared economy. */
  async scheduled(_e: ScheduledEvent, env: Env) {
    await world(env).fetch('https://do/tick', { method: 'POST' })
  },
}
