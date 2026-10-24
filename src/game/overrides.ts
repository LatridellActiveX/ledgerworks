// ============================================================================
// Global economy overrides ("Trade Spire" admin controls).
//
// ONE small JSON object, stored server-side in D1 (admin_settings k='econ'),
// written ONLY by POST /api/admin/econ (admin-checked in worker/admin.ts) and
// sent to every client with GET /api/world (cached 60 s per worker isolate,
// clients sync every few minutes). Shape:
//
//   price  { goodId: multiplier }  0.25x..4x, applied in market.refPrice, which
//                                  every Exchange and trade-route price goes through
//   prod   number                  0.5x..5x production job speed (stacks with events)
//   sell   number                  0.5x..5x store selling speed (stacks with events)
//   event  {name, mult, start, end} replaces the configured live event (Turbo
//                                  Week) window and multiplier while present
//   news   {icon, headline, blurb, goods, mult, until} a custom Gazette / Business
//                                  Live story shown on top until `until`
//
// Everything is clamped twice: when the admin request is parsed (server) and
// again when a client receives it (cleanEcon), so a bad row can't break games.
// This file has no imports from the engine so the Worker can use it too.
// ============================================================================

export interface EconEvent { name: string; mult: number; start: string; end: string }
export interface EconNews { icon: string; headline: string; blurb: string; goods: string[]; mult: number; until: string }
export interface Econ { price: Record<string, number>; prod: number; sell: number; event?: EconEvent; news?: EconNews }

/** Limits (shared by server validation, client cleaning and the panel sliders). */
export const LIM = {
  price: [0.25, 4] as const,
  speed: [0.5, 5] as const,
  eventMult: [1, 10] as const,
  eventHours: [1, 24 * 30] as const,
  newsMult: [0.5, 2] as const,
  newsHours: [1, 72] as const,
}

export const normalEcon = (): Econ => ({ price: {}, prod: 1, sell: 1 })

const clamp = (x: unknown, [lo, hi]: readonly [number, number], dflt = 1) => {
  const n = Number(x)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt
}
/** Round to 2 decimals so 1.0000001 isn't shown as an override. */
const r2 = (n: number) => Math.round(n * 100) / 100
const okDate = (s: unknown) => typeof s === 'string' && !Number.isNaN(Date.parse(s))
const txt = (s: unknown, n: number) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n)

/** Sanitise any stored / received value into a valid Econ (unknown keys dropped, all numbers clamped). */
export function cleanEcon(raw: any, goodIds?: Set<string>): Econ {
  const e = normalEcon()
  if (!raw || typeof raw !== 'object') return e
  if (raw.price && typeof raw.price === 'object') {
    for (const [k, v] of Object.entries(raw.price)) {
      if (goodIds && !goodIds.has(k)) continue
      const m = r2(clamp(v, LIM.price))
      if (m !== 1) e.price[k] = m // 1x is "no override": not stored
    }
  }
  e.prod = r2(clamp(raw.prod, LIM.speed))
  e.sell = r2(clamp(raw.sell, LIM.speed))
  const ev = raw.event
  if (ev && okDate(ev.start) && okDate(ev.end)) e.event = { name: txt(ev.name, 30) || 'Boost event', mult: r2(clamp(ev.mult, LIM.eventMult)), start: ev.start, end: ev.end }
  const nw = raw.news
  if (nw && okDate(nw.until) && txt(nw.headline, 80)) {
    e.news = {
      icon: txt(nw.icon, 4) || '📰', headline: txt(nw.headline, 80), blurb: txt(nw.blurb, 200),
      goods: (Array.isArray(nw.goods) ? nw.goods : []).map(String).filter((g: string) => !goodIds || goodIds.has(g)).slice(0, 12),
      mult: r2(clamp(nw.mult, LIM.newsMult)), until: nw.until,
    }
  }
  return e
}

/** True when nothing is overridden (all 1x, no event or news override). */
export const isNormal = (e: Econ) => !Object.keys(e.price).length && e.prod === 1 && e.sell === 1 && !e.event && !e.news

/**
 * Apply one admin request to the current overrides (pure, unit-tested).
 * Returns an error string, or the new overrides plus a short audit-log line.
 * `curEvent` is the live event as players see it now (used by extend / end
 * when no event override exists yet).
 */
export function applyEcon(b: any, cur: Econ, now: number, curEvent: EconEvent, goodIds: Set<string>): string | { econ: Econ; detail: string } {
  if (!b || b.confirm !== true) return 'Confirmation required'
  const e: Econ = JSON.parse(JSON.stringify(cur))
  const fmt = (n: number) => `${r2(n)}x`
  switch (b.op) {
    case 'price': {
      const res = String(b.res ?? '')
      if (!goodIds.has(res)) return 'Unknown good'
      const m = r2(clamp(b.mult, LIM.price, NaN))
      if (Number.isNaN(m)) return 'Multiplier must be a number'
      if (m === 1) delete e.price[res]; else e.price[res] = m
      return { econ: e, detail: `price ${res} ${fmt(m)}` }
    }
    case 'speed': {
      const p = clamp(b.prod, LIM.speed, NaN), s = clamp(b.sell, LIM.speed, NaN)
      if (Number.isNaN(p) || Number.isNaN(s)) return 'Speeds must be numbers'
      e.prod = r2(p); e.sell = r2(s)
      return { econ: e, detail: `production ${fmt(p)}, selling ${fmt(s)}` }
    }
    case 'event': {
      const base = e.event ?? curEvent
      if (b.action === 'start') {
        const h = clamp(b.hours, LIM.eventHours, NaN), m = clamp(b.mult, LIM.eventMult, NaN)
        if (Number.isNaN(h) || Number.isNaN(m)) return 'Hours and multiplier must be numbers'
        e.event = { name: txt(b.name, 30) || 'Boost event', mult: r2(m), start: new Date(now).toISOString(), end: new Date(now + h * 3600000).toISOString() }
        return { econ: e, detail: `started "${e.event.name}" ${fmt(m)} for ${h}h` }
      }
      if (b.action === 'extend') {
        const h = clamp(b.hours, LIM.eventHours, NaN)
        if (Number.isNaN(h)) return 'Hours must be a number'
        e.event = { ...base, end: new Date(Math.max(Date.parse(base.end), now) + h * 3600000).toISOString() }
        return { econ: e, detail: `extended "${base.name}" ${h}h to ${e.event.end}` }
      }
      if (b.action === 'end') {
        e.event = { ...base, end: new Date(Math.min(now, Date.parse(base.end))).toISOString() }
        return { econ: e, detail: `ended "${base.name}"` }
      }
      if (b.action === 'clear') { delete e.event; return { econ: e, detail: 'event override cleared (back to the configured event)' } }
      return 'Unknown event action'
    }
    case 'news': {
      if (b.clear) { delete e.news; return { econ: e, detail: 'news override cleared' } }
      const headline = txt(b.headline, 80)
      if (!headline) return 'Headline required'
      const goods = (Array.isArray(b.goods) ? b.goods : String(b.goods ?? '').split(',')).map((g: any) => String(g).trim()).filter(Boolean)
      const bad = goods.filter((g: string) => !goodIds.has(g))
      if (bad.length) return 'Unknown goods: ' + bad.join(', ')
      const h = clamp(b.hours, LIM.newsHours, 24)
      e.news = { icon: txt(b.icon, 4) || '📰', headline, blurb: txt(b.blurb, 200), goods: goods.slice(0, 12), mult: r2(clamp(b.mult, LIM.newsMult)), until: new Date(now + h * 3600000).toISOString() }
      return { econ: e, detail: `news "${headline}" ${fmt(e.news.mult)} for ${h}h` }
    }
    case 'reset': return { econ: normalEcon(), detail: 'reset all overrides to normal' }
  }
  return 'Unknown action'
}

/** Short human list of active overrides (panel header + admin dashboard). */
export function describeEcon(e: Econ, now = Date.now()): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(e.price)) out.push(`Price ${k}: ${v}x`)
  if (e.prod !== 1) out.push(`Production speed: ${e.prod}x`)
  if (e.sell !== 1) out.push(`Store selling speed: ${e.sell}x`)
  if (e.event) out.push(`Event "${e.event.name}" ${e.event.mult}x, ${Date.parse(e.event.end) > now ? 'until ' + e.event.end : 'ended ' + e.event.end}`)
  if (e.news && Date.parse(e.news.until) > now) out.push(`News: ${e.news.headline} (until ${e.news.until})`)
  return out
}

// ---- Client runtime copy (set from /api/world; read by engine, market, news) ----
let ECON: Econ = normalEcon()
export const econ = () => ECON
export function setEcon(raw: any, goodIds?: Set<string>) { ECON = cleanEcon(raw, goodIds) }
/** Exchange / trade-route price multiplier for a good. */
export const priceMult = (res: string) => ECON.price[res] ?? 1
/** Global job-speed multiplier for a job kind (stacks with the live event). */
export const jobMult = (kind: 'make' | 'sell') => (kind === 'sell' ? ECON.sell : ECON.prod)
