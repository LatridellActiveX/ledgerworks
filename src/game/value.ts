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
import { RES } from './data'
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
/** Keep about four months of daily points. */
export const HIST_MAX = 120

/** Record today's value (called once per game day by rollDay). */
export function recordValue(s: GameState) {
  const hist = (s.valueHist ??= [])
  const v = valueBreakdown(s).total
  if (hist.length && hist[hist.length - 1].h === s.hour) hist[hist.length - 1].v = v
  else hist.push({ h: s.hour, v })
  if (hist.length > HIST_MAX) hist.splice(0, hist.length - HIST_MAX)
}
