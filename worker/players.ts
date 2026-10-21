// ============================================================================
// Player search and public profiles: GET /api/players/search?q= and
// GET /api/players/profile?name=.
//
// Merges two sources, PUBLIC fields only:
//  - game accounts (D1 `users` + their save row): username, company name,
//    level, and company value (the last point of the save's value history);
//  - trade-floor accounts (Durable Object ledger): trader name, company,
//    published value, grade, rank and active listings.
// Never returns passwords, hashes, keys, cash, stock or anything else private.
//
// Rate limit: RATE_MAX requests per RATE_WINDOW_MS per client, counted in
// this Worker instance's memory only, keyed by a SHA-256 of the IP address
// (never written to storage, gone within a minute).
// ============================================================================
export const RATE_MAX = 30, RATE_WINDOW_MS = 60_000
const hits = new Map<string, { n: number; t: number }>()
/** True if this client may make another request now (and counts it). */
export function allow(key: string, now = Date.now()) {
  const h = hits.get(key)
  if (!h || now - h.t > RATE_WINDOW_MS) { hits.set(key, { n: 1, t: now }); if (hits.size > 5000) for (const [k, v] of hits) if (now - v.t > RATE_WINDOW_MS) hits.delete(k); return true }
  return ++h.n <= RATE_MAX
}

type D1 = D1Database
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
const esc = (q: string) => q.replace(/[\\%_]/g, c => '\\' + c)

/** Latest company value from a save's JSON (value history), if any. */
export function valueFromState(state: string | null | undefined): number | null {
  if (!state) return null
  try { const s = JSON.parse(state); const h = s.valueHist; return Array.isArray(h) && h.length ? Number(h[h.length - 1].v ?? h[h.length - 1].total ?? 0) || null : null } catch { return null }
}

export async function handlePlayers(req: Request, env: { DB: D1 }, url: URL, ledger: (op: string, body: unknown) => Promise<any>, ipKey: string): Promise<Response | null> {
  if (!url.pathname.startsWith('/api/players/')) return null
  if (!allow(ipKey)) return json({ error: 'Too many searches. Wait a minute.' }, 429)
  const op = url.pathname.slice('/api/players/'.length)
  if (op === 'search') {
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 40)
    if (q.length < 2) return json({ players: [] })
    const like = `%${esc(q)}%`
    const rows = await env.DB.prepare(`SELECT u.name, s.company, s.level FROM users u LEFT JOIN saves s ON s.player_id = u.player_id
      WHERE u.name LIKE ? ESCAPE '\\' OR lower(s.company) LIKE ? ESCAPE '\\' ORDER BY (u.name LIKE ?) DESC, s.level DESC LIMIT 10`).bind(like, like, `${esc(q)}%`).all<any>().catch(() => ({ results: [] as any[] }))
    const tf: any[] = (await ledger('search', { q }).catch(() => ({ players: [] }))).players ?? []
    // Merge: one entry per game username (or trader name when not linked).
    const out = new Map<string, any>()
    for (const r of rows.results ?? []) out.set(r.name, { name: r.name, company: r.company ?? '', level: r.level ?? null, trader: null })
    for (const t of tf) { const k = t.owner ?? t.name; const o = out.get(k) ?? { name: k, company: t.company, level: null }; out.set(k, { ...o, company: o.company || t.company, trader: t.name, value: t.value, grade: t.grade }) }
    return json({ players: [...out.values()].slice(0, 12) })
  }
  if (op === 'profile') {
    const name = (url.searchParams.get('name') ?? '').trim().toLowerCase().slice(0, 40)
    if (!/^[a-z0-9_]{3,20}$/.test(name)) return json({ error: 'No such player' }, 404)
    const u = await env.DB.prepare(`SELECT u.name, u.created, s.company, s.level, s.state FROM users u LEFT JOIN saves s ON s.player_id = u.player_id WHERE u.name = ?`).bind(name).first<any>().catch(() => null)
    const tf = (await ledger('profile', { who: name }).catch(() => ({ profile: null }))).profile
    if (!u && !tf) return json({ error: 'No such player' }, 404)
    return json({ profile: {
      name: u?.name ?? tf.owner ?? tf.name, company: u?.company || tf?.company || '', level: u?.level ?? null, since: u?.created ?? tf?.joined ?? null,
      value: valueFromState(u?.state) ?? tf?.value ?? null,
      trader: tf ? { name: tf.name, grade: tf.grade, rank: tf.rank, of: tf.of, trades: tf.trades, value: tf.value, listings: tf.listings } : null,
    } })
  }
  return json({ error: 'not found' }, 404)
}
