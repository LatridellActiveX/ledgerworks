import { currentBases, rebaseFactors, rebaseRef } from './rebase'
// Browser saves: the whole GameState is JSON in localStorage, plus a
// copy/paste save code (base64 of the JSON) for moving between browsers.
import { CLOCK_VERSION, LEGACY_SPEED } from './engine-constants'
import { newGame, type GameState } from './engine'
import { seedHistory } from './market'

import { realm, seasonAt, type Realm } from './seasons'

export const SAVE_KEY = 'ledgerworks-save-v1'
/** Each realm keeps its own save; the classic key is unchanged so old saves load. */
export const saveKey = (r: Realm = realm()) => (r === 'seasons' ? SAVE_KEY + '-seasons' : SAVE_KEY)
/** A fresh company for a realm (seasons companies remember their season number). */
export function freshGame(company = 'My Company', r: Realm = realm(), now = Date.now()) {
  const s = newGame(company, now)
  if (r === 'seasons') { const se = seasonAt(now); s.realm = 'seasons'; s.season = se.no; s.seasonPhase = se.phase; s.log = [`Welcome to Season ${se.no}!`] }
  return s
}

/** Minimal storage interface so tests can pass a fake. */
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export function saveGame(s: GameState, store: KV = localStorage) { store.setItem(saveKey(s.realm ?? 'classic'), JSON.stringify(s)) }

export function loadGame(store: KV = localStorage): GameState {
  const r = realm()
  const raw = store.getItem(saveKey(r))
  if (!raw) return freshGame('My Company', r)
  try { return migrate(JSON.parse(raw)) } catch { return freshGame('My Company', r) }
}

/** Fill in fields added after a save was written, so old saves keep loading. */
/**
 * Convert a save from the old 4x clock to real time (1x).
 *
 * Choice: keep each timer's REAL end time. A job that was due in 2 real hours
 * stays due in 2 real hours (so nothing suddenly finishes or jumps), and it
 * keeps its progress fraction. Every game-hour timestamp t (any numeric field
 * whose name ends in "H": startH, endH, lastH, soldH, boughtH, deadlineH,
 * offerUntilH, ...; plus value-history points) is moved to
 *     t' = hour + (t - hour) / 4
 * i.e. its distance from "now" shrinks 4x in game hours, which at 1x is the
 * same real time as before. The game clock (hour) itself doesn't change.
 */
export function toRealTime(s: any) {
  if (!s || s.clock === CLOCK_VERSION) return s
  const now = Number(s.hour ?? 0), f = 1 / LEGACY_SPEED
  const fix = (o: any, depth = 0) => {
    if (!o || typeof o !== 'object' || depth > 6) return
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'number' && /^[a-z][A-Za-z]*H$/.test(k) && v !== 0) o[k] = now + (v - now) * f
      else if (v && typeof v === 'object') fix(v, depth + 1)
    }
  }
  for (const key of ['plots', 'bonds', 'holdings', 'gov', 'govOrders', 'contracts']) fix(s[key])
  for (const p of s.valueHist ?? []) p.h = now + (p.h - now) * f
  s.clock = CLOCK_VERSION
  return s
}

export function migrate(s: any): GameState {
  toRealTime(s)
  const fresh = newGame(s.company ?? 'My Company')
  const out = { ...fresh, ...s, version: 1 } as GameState
  // Re-base anything priced off an old basePrice (see rebase.ts): reference
  // prices, the chart history (so the line doesn't cliff-jump) and the
  // computer traders' asks. The player's own orders keep their prices.
  const f = rebaseFactors(s.refBase)
  if (Object.keys(f).length) {
    rebaseRef(out.ref, f)
    for (const [id, k] of Object.entries(f)) {
      const h = out.priceHist?.[id]; if (h) out.priceHist![id] = h.map(p => Math.round(p * k * 100) / 100)
    }
    for (const o of out.asks ?? []) if (o.owner !== 'me' && f[o.res]) o.price = Math.round(o.price * f[o.res] * 100) / 100
  }
  out.refBase = currentBases() // remember the bases these prices now sit on
  seedHistory(out) // older saves get a chart history too
  return out
}

export const exportCode = (s: GameState) => 'LW1:' + btoa(unescape(encodeURIComponent(JSON.stringify(s))))
export function importCode(code: string): GameState {
  if (!code.startsWith('LW1:')) throw new Error('Not a Ledgerworks save code')
  return migrate(JSON.parse(decodeURIComponent(escape(atob(code.slice(4))))))
}
