// ============================================================================
// Amount limits for every place the player picks a quantity. Each returns the
// largest whole amount allowed right now and, when that is limited, a short
// reason ("Only 12 Seeds", "Cash for wages"...), so the picker can explain it.
// Every action also re-checks on its own; these limits are for the UI.
// ============================================================================
import { REC, RES } from './data'
import * as E from './engine'
import * as M from './market'
import { productionMult } from './economy'

export interface Limit { max: number; why: string }
const floor = (x: number) => Math.max(0, Math.floor(x + 1e-9))
/** Pick the tightest of several limits. */
function tight(...ls: Limit[]): Limit { return ls.reduce((a, b) => (b.max < a.max ? b : a), { max: 1e9, why: '' }) }

/** Production: limited by each input in stock and by cash for wages. */
export function maxMake(s: E.GameState, plot: number, res: string): Limit {
  const bd = s.plots[plot]
  if (!bd) return { max: 0, why: 'No building' }
  const rc = REC[res], ab = bd.abund?.[res] ?? 1
  const ls: Limit[] = Object.entries(rc.inputs).map(([k, per]) => ({ max: floor(E.haveQty(s, k) / per), why: `Only ${Math.floor(E.haveQty(s, k))} ${RES[k].name}` }))
  // Wages are per hour, so per unit = wage rate / units per hour. The
  // MIN_JOB_H floor makes tiny jobs cost a little more; check it exactly.
  const perH = rc.perHour * bd.level * ab * productionMult(bd.type, s.phase)
  const wagePerUnit = E.makeWages(bd.type, bd.level, 1, s) / perH
  let byCash = floor(s.cash / wagePerUnit)
  if (byCash >= 1 && E.makeWages(bd.type, bd.level, E.makeHours(res, 1, bd.level, bd.type, s, ab), s) > s.cash) byCash = 0
  ls.push({ max: byCash, why: 'Cash for wages' })
  // Keep a single job under a week of game time.
  ls.push({ max: floor(perH * 24 * 7), why: 'One week per job' })
  return tight(...ls)
}

/** Shop sales: stock in the lot, the 3-day limit at this price, and cash for wages. */
export function maxSell(s: E.GameState, plot: number, res: string, q: number, price: number): Limit {
  const bd = s.plots[plot]
  if (!bd || !(price > 0)) return { max: 0, why: 'Set a price' }
  const rate = E.sellRate(s, res, q, price) * bd.level
  const wagePerH = E.makeWages(bd.type, bd.level, 1, s)
  return tight(
    { max: floor(s.stock[E.key(res, q)] ?? 0), why: 'All of this lot' },
    { max: floor(rate * 72), why: '3 days of sales at this price' },
    { max: s.cash >= wagePerH * E.MIN_JOB_H ? floor((s.cash / wagePerH) * rate) : 0, why: 'Cash for wages' },
  )
}

/** Exchange buy: what is listed at this quality, and what you can pay for. */
export function maxBuy(s: E.GameState, res: string, minQ: number): Limit {
  let units = 0, cash = s.cash, afford = 0
  for (const o of M.book(s, res, minQ).filter(o => o.owner !== 'me')) {
    units += o.qty
    const can = Math.min(o.qty, floor(cash / o.price))
    afford += can; cash -= can * o.price
    if (can < o.qty) break
  }
  return tight({ max: floor(units), why: 'All that is listed' }, { max: afford, why: 'Cash' })
}

/** Listing on the exchange: the lot, and shipping crates. */
/**
 * `buyCrates`: the form can buy missing crates in the same step, so crates
 * you could still buy (cash + traders' stock) count toward the limit too.
 */
export function maxList(s: E.GameState, res: string, q: number, buyCrates = false): Limit {
  const have = floor(s.stock[E.key(res, q)] ?? 0)
  if (res === 'crates') return { max: floor(have / 2), why: 'Crates also ship themselves' }
  const ship = RES[res].ship ?? 1
  const crates = E.haveQty(s, 'crates') + (buyCrates ? maxBuy(s, 'crates', 0).max : 0)
  return tight({ max: have, why: 'All of this lot' }, { max: ship > 0 ? floor(crates / ship) : 1e9, why: buyCrates ? `Only ${floor(crates)} crates owned or affordable` : `Only ${floor(E.haveQty(s, 'crates'))} shipping crates` })
}

/** Quick-sell to traders: also limited by what they still want today. */
export function maxQuick(s: E.GameState, res: string, q: number, buyCrates = false): Limit {
  return tight(maxList(s, res, q, buyCrates), { max: floor(s.bidLeft[res] ?? 0), why: 'Traders want no more today' })
}

/** Government order delivery: remaining amount and eligible stock (quality at or above the ask). */
export function maxGov(s: E.GameState, res: string): Limit {
  const it = s.gov?.items.find(i => i.res === res)
  if (!it) return { max: 0, why: 'Not in this order' }
  let have = 0
  for (const [k, v] of Object.entries(s.stock)) { const l = E.parseKey(k); if (l.res === res && l.q >= it.q) have += v }
  return tight({ max: floor(it.qty - it.done), why: 'Rest of the order' }, { max: floor(have), why: `Only ${floor(have)} at Q${it.q}+` })
}
