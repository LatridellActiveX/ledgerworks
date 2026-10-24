// Company value: one consistent number used by the Company Value screen,
// the trade-floor leaderboard and the daily value history.
//
//   value = cash
//         + buildings  (construction cost + every upgrade paid, i.e. what it
//                       cost to reach the current level: cost * L(L+1)/2)
//         + inventory  (each stock lot at today's market reference price)
//         + bonds held (bonds you bought from others, at face value)
//         - liabilities (bonds you issued and still owe)
//
// Patents are listed (count) but valued at $0: they raise product quality
// and can't be sold, so counting them as money would overstate the company.
import type { GameState } from './engine'
import { unitValue, upgradesValue } from './engine'
import { BLD, RES } from './data'
import * as F from './finance'
import { escrowTotal } from './bids'

export interface ValueBreakdown {
  cash: number; buildings: number; inventory: number; bondsHeld: number; liabilities: number
  patents: number // patent count (not money)
  total: number
}

/** Market value of a stock lot key ('res|q') times units, at today's ref price. */
const lotValue = (s: GameState, k: string, n: number) => {
  const res = k.split('|')[0]
  return n * (s.ref?.[res] ?? RES[res]?.basePrice ?? 0)
}

/** Full breakdown of what the company is worth right now. */
export function valueBreakdown(s: GameState): ValueBreakdown {
  const cash = s.cash + escrowTotal(s) // cash locked in buy orders is still yours
  const buildings = F.buildingValue(s)
  const inventory = Object.entries(s.stock).reduce((t, [k, n]) => t + lotValue(s, k, n), 0)
  const bondsHeld = F.heldValue(s)
  const liabilities = F.debt(s)
  const patents = Object.values(s.patents ?? {}).reduce((t, n) => t + n, 0)
  const total = Math.round(cash + buildings + inventory + bondsHeld - liabilities)
  return { cash, buildings, inventory, bondsHeld, liabilities, patents, total }
}

/** One point of value history: game hour and total value. */
export interface ValuePoint { h: number; v: number }
/**
 * Whole-timeline history (founding -> now). Snapshots are taken every
 * SNAP_H game hours; thinHist() then downsamples older points so the save
 * stays small and the chart smooth:
 *   - last 3 days: every snapshot (4h apart)
 *   - 3..60 days old: one point per day
 *   - older than 60 days: one point per week
 * HIST_MAX is a hard safety cap (oldest go first) on top of that.
 */
export const SNAP_H = 4
export const HIST_MAX = 600

/** Downsample old points in place (keeps the first point = earliest history). */
export function thinHist(hist: ValuePoint[], nowH: number) {
  const out: ValuePoint[] = []
  for (let i = 0; i < hist.length; i++) {
    const p = hist[i], age = nowH - p.h
    // Bucket size for this point's age: 0 = keep every point.
    const bucket = age <= 72 ? 0 : age <= 60 * 24 ? 24 : 24 * 7
    const prev = out[out.length - 1]
    // Same bucket as the point before it: keep only the later one (latest value of that day/week),
    // but never drop the very first point (the start of the timeline).
    if (bucket && prev && out.length > 1 && Math.floor(prev.h / bucket) === Math.floor(p.h / bucket)) out[out.length - 1] = p
    else out.push(p)
  }
  if (out.length > HIST_MAX) out.splice(1, out.length - HIST_MAX) // keep point 0
  hist.length = 0; hist.push(...out)
}

/** Record a value snapshot (called every SNAP_H game hours from advanceTo). */
export function recordValue(s: GameState) {
  const hist = (s.valueHist ??= [])
  const v = valueBreakdown(s).total
  if (hist.length && hist[hist.length - 1].h === s.hour) hist[hist.length - 1].v = v
  else hist.push({ h: s.hour, v })
  thinHist(hist, s.hour)
}

// ---- Detail for the Company Value breakdown --------------------------------
// The same numbers as valueBreakdown, split into the things each category is
// made of, so the screen can show what is behind every slice. The category
// totals always match valueBreakdown exactly (see tests/value.test.ts).
export interface ValueDetail {
  cash: { cash: number; locked: number }                    // locked = cash held in open buy orders
  buildings: { name: string; level: number; value: number; upgrades: number }[] // value includes upgrades
  inventory: { res: string; name: string; units: number; value: number }[]
  bonds: { issuer: string; rating: string; amount: number }[]
  patents: { res: string; name: string; count: number }[]
  liabilities: { amount: number }[]
}

export function valueDetail(s: GameState): ValueDetail {
  const buildings = s.plots.flatMap(b => (b ? [{ name: BLD[b.type].name, level: b.level, value: unitValue(b) /* build + levels + modular upgrades */, upgrades: upgradesValue(b) }] : []))
  const byRes: Record<string, number> = {}
  for (const [k, n] of Object.entries(s.stock)) { const r = k.split('|')[0]; byRes[r] = (byRes[r] ?? 0) + n }
  const inventory = Object.entries(byRes).map(([res, units]) => ({ res, name: RES[res]?.name ?? res, units, value: units * (s.ref?.[res] ?? RES[res]?.basePrice ?? 0) }))
    .sort((a, b) => b.value - a.value)
  const bonds = (s.holdings ?? []).map(h => ({ issuer: h.issuer, rating: h.rating, amount: h.amount }))
  const patents = Object.entries(s.patents ?? {}).filter(([, n]) => n > 0).map(([res, count]) => ({ res, name: RES[res]?.name ?? res, count }))
  const liabilities = (s.bonds ?? []).map(b => ({ amount: b.amount }))
  return { cash: { cash: s.cash, locked: escrowTotal(s) }, buildings, inventory, bonds, patents, liabilities }
}
