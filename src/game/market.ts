// ============================================================================
// The Exchange: an order book per good, shared by you and NPC traders.
//
// Rules (modelled on how real commodity exchanges in business sims work,
// with our own numbers):
//  - Asks are sorted by price (low first), then quality (high first), then
//    age (older first). Buyers walk the book from the top.
//  - Selling on the exchange needs shipping crates: `ship` crates per unit
//    (default 1). Crates are held with the order and used up as it fills.
//  - A 3% exchange fee is taken from the seller when an order fills.
//  - Cancelling within 48 game hours costs the 3% fee on what is left;
//    after that it is free. Crates and goods always come back.
//  - Orders still unsold after 7 game days expire and return home.
//  - NPC sellers keep basic depth on every good at a markup over the
//    reference price; NPC buyers shop every hour and fill cheap asks.
//  - Reference prices random-walk daily, pulled back toward the base price,
//    and dip when you flood a market.
// ============================================================================
import { RES, RESOURCES } from './data'
import { rand } from './rng'
import { addStock, haveQty, key, takeStock, type GameState } from './engine'

export const FEE = 0.03
export const CANCEL_FREE_AFTER_H = 48
export const EXPIRE_H = 24 * 7

export interface Order { id: number; owner: 'me' | 'npc'; res: string; q: number; qty: number; price: number; placedH: number; crates: number }

/** Crates needed to ship `qty` units of a good. */
export const cratesFor = (res: string, qty: number) => Math.ceil(qty * (RES[res].ship ?? 1) - 1e-9)
/** Current reference ("going") price of a good at Q0. */
export const refPrice = (s: GameState, res: string) => s.ref[res] ?? RES[res].basePrice
/** How deep NPC supply is for a good: cheap goods trade in bigger lots. */
export const depth = (res: string) => Math.round(Math.min(5000, Math.max(40, 1500 / RES[res].basePrice)))
/** Price NPC buyers pay instantly ("quick sell"), per unit. */
export const bidPrice = (s: GameState, res: string, q: number) => refPrice(s, res) * 0.88 * (1 + 0.05 * q)

/** Draw a random number from the save's seeded generator. */
function rnd(s: GameState) { const [r, n] = rand(s.seed); s.seed = n; return r }

/** The visible book for one good: asks with quality >= minQ in priority order. */
export function book(s: GameState, res: string, minQ = 0) {
  return s.asks.filter(o => o.res === res && o.q >= minQ)
    .sort((a, b) => a.price - b.price || b.q - a.q || a.placedH - b.placedH)
}

/** Replace NPC asks with fresh stock at three price levels plus a little Q1/Q2. */
export function restockNpc(s: GameState) {
  s.asks = s.asks.filter(o => o.owner !== 'npc')
  for (const r of RESOURCES) {
    const ref = refPrice(s, r.id), d = depth(r.id)
    const lv: [number, number, number][] = [[0, 1.1, 0.5], [0, 1.18, 0.5], [0, 1.3, 1], [1, 1.3, 0.25], [2, 1.5, 0.1]]
    for (const [q, mk, share] of lv) {
      s.asks.push({ id: s.nextUid++, owner: 'npc', res: r.id, q, qty: Math.round(d * share), price: round2(ref * mk * (1 + 0.04 * (rnd(s) - 0.5))), placedH: s.hour, crates: 0 })
    }
    s.bidLeft[r.id] = Math.round(d * 0.5)
  }
}
const round2 = (n: number) => Math.max(0.01, Math.round(n * 100) / 100)

/** Buy `qty` from the cheapest asks (skipping your own). Goods keep their quality. */
export function buy(s: GameState, res: string, qty: number, minQ = 0): string | null {
  if (!(qty > 0)) return 'Pick an amount'
  const asks = book(s, res, minQ).filter(o => o.owner !== 'me')
  let left = qty, cost = 0
  for (const o of asks) { const t = Math.min(left, o.qty); cost += t * o.price; left -= t; if (left <= 0) break }
  if (left > 0) return 'Not enough for sale at that quality'
  if (s.cash < cost) return 'Not enough cash'
  left = qty
  for (const o of asks) {
    const t = Math.min(left, o.qty)
    o.qty -= t; left -= t; addStock(s, res, o.q, t)
    if (left <= 0) break
  }
  s.asks = s.asks.filter(o => o.qty > 0)
  s.cash -= cost
  return null
}
/** What buying `qty` would cost right now (Infinity if the book is too thin). */
export function quoteBuy(s: GameState, res: string, qty: number, minQ = 0) {
  let left = qty, cost = 0
  for (const o of book(s, res, minQ).filter(o => o.owner !== 'me')) { const t = Math.min(left, o.qty); cost += t * o.price; left -= t; if (left <= 0) return cost }
  return Infinity
}

/** List goods for sale. Goods and crates leave the warehouse into the order. */
export function placeAsk(s: GameState, res: string, q: number, qty: number, price: number): string | null {
  if (!(qty > 0) || !(price > 0)) return 'Set an amount and a price'
  if ((s.stock[key(res, q)] ?? 0) + 1e-9 < qty) return 'Not enough in the warehouse'
  if (price > refPrice(s, res) * 3 * (1 + 0.1 * q)) return 'Price is far above the market; nobody will buy'
  const crates = cratesFor(res, qty)
  if (res !== 'crates' && haveQty(s, 'crates') < crates) return `Need ${crates} shipping crates`
  if (res === 'crates' && (s.stock[key(res, q)] ?? 0) < qty + crates) return 'Not enough crates'
  addStock(s, res, q, -qty)
  if (crates) takeStock(s, 'crates', crates)
  s.asks.push({ id: s.nextUid++, owner: 'me', res, q, qty, price: round2(price), placedH: s.hour, crates })
  return null
}

/** Cancel one of your asks. Fee applies only in the first 48 game hours. */
export function cancelAsk(s: GameState, id: number): string | null {
  const o = s.asks.find(a => a.id === id && a.owner === 'me')
  if (!o) return 'Order not found'
  const fee = s.hour - o.placedH < CANCEL_FREE_AFTER_H ? FEE * o.qty * o.price : 0
  addStock(s, o.res, o.q, o.qty)
  if (o.crates) addStock(s, 'crates', 0, o.crates)
  s.cash -= fee
  s.asks = s.asks.filter(a => a !== o)
  return null
}
export const cancelFee = (s: GameState, o: Order) => (s.hour - o.placedH < CANCEL_FREE_AFTER_H ? FEE * o.qty * o.price : 0)

/** Sell instantly to NPC buyers at the bid price, up to today's limit. */
export function quickSell(s: GameState, res: string, q: number, qty: number): string | null {
  if (!(qty > 0)) return 'Pick an amount'
  if ((s.stock[key(res, q)] ?? 0) + 1e-9 < qty) return 'Not enough in the warehouse'
  if ((s.bidLeft[res] ?? 0) < qty) return `Buyers only want ${Math.floor(s.bidLeft[res] ?? 0)} more today`
  const crates = cratesFor(res, qty)
  if (res !== 'crates' && haveQty(s, 'crates') < crates) return `Need ${crates} shipping crates`
  addStock(s, res, q, -qty)
  if (crates) takeStock(s, 'crates', crates)
  s.bidLeft[res] -= qty
  s.cash += qty * bidPrice(s, res, q) * (1 - FEE)
  s.exSold[res] = (s.exSold[res] ?? 0) + qty
  return null
}

/**
 * One game hour of NPC buying. For each good, buyers bring a budget of
 * units and a willingness price; they buy from the top of the book while the
 * ask is at or below what they will pay. Your fills pay you minus the fee.
 * Also expires your week-old orders.
 */
export function npcHour(s: GameState, say: (m: string) => void) {
  for (const r of RESOURCES) {
    const mine = s.asks.some(o => o.res === r.id && o.owner === 'me')
    if (!mine) continue // only matters when you have something listed
    let want = depth(r.id) * 0.04 * (0.5 + rnd(s))
    for (const o of book(s, r.id)) {
      const will = refPrice(s, r.id) * 1.12 * (1 + 0.06 * o.q) * (0.95 + 0.1 * rnd(s))
      if (o.price > will || want <= 0) break
      const t = Math.min(want, o.qty)
      o.qty -= t; want -= t
      if (o.owner === 'me') {
        const used = Math.min(o.crates, cratesFor(r.id, t)); o.crates -= used
        s.cash += t * o.price * (1 - FEE)
        s.exSold[r.id] = (s.exSold[r.id] ?? 0) + t
        if (o.qty <= 1e-9) say(`Exchange: your ${RES[r.id].name} Q${o.q} order sold out.`)
      }
    }
  }
  // Expire old orders: goods and leftover crates come home.
  for (const o of s.asks.filter(a => a.owner === 'me' && s.hour - a.placedH >= EXPIRE_H)) {
    addStock(s, o.res, o.q, o.qty); if (o.crates) addStock(s, 'crates', 0, o.crates)
    o.qty = 0; say(`Exchange: your ${RES[o.res].name} order expired and came back.`)
  }
  s.asks = s.asks.filter(o => o.qty > 1e-9)
}

/** Daily: reference prices drift, flooded goods dip, NPC stock refreshes. */
export function marketDay(s: GameState) {
  // Online, the shared server market moves prices; we only restock NPCs.
  if (s.online) { s.exSold = {}; restockNpc(s); return }
  for (const r of RESOURCES) {
    const base = r.basePrice, ref = refPrice(s, r.id)
    let next = ref + 0.1 * (base - ref) + ref * 0.06 * (rnd(s) - 0.5)
    next *= 1 - Math.min(0.08, ((s.exSold[r.id] ?? 0) / depth(r.id)) * 0.04)
    s.ref[r.id] = Math.min(base * 1.8, Math.max(base * 0.6, next))
  }
  s.exSold = {}
  restockNpc(s)
}
