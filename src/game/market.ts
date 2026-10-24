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
import { book as ledgerBook } from './ledger'
import { RES, RESOURCES } from './data'
import { rand } from './rng'
import { priceTrend } from './economy'
import { newsPrice } from './news'
import { feeMult } from './execs'
import { addStock, setWhy, haveQty, key, takeStock, type GameState } from './engine'

export const FEE = 0.03
/** The seller fee you actually pay: the base 3%, cut by a hired CFO (see execs.ts). */
export const feeRate = (s: GameState) => FEE * feeMult(s)
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
  if (!Number.isInteger(qty) || qty < 1) return 'Pick a whole amount of at least 1'
  const asks = book(s, res, minQ).filter(o => o.owner !== 'me')
  let left = qty, cost = 0
  for (const o of asks) { const t = Math.min(left, o.qty); cost += t * o.price; left -= t; if (left <= 0) break }
  if (left > 0) return 'Not enough for sale at that quality'
  if (s.cash < cost) return 'Not enough cash'
  left = qty
  setWhy('bought')
  for (const o of asks) {
    const t = Math.min(left, o.qty)
    o.qty -= t; left -= t; addStock(s, res, o.q, t, o.price)
    if (left <= 0) break
  }
  s.asks = s.asks.filter(o => o.qty > 0)
  s.cash -= cost; ledgerBook(s, res === 'crates' ? 'crates' : 'exBuy', -cost) // crates get their own line
  s.stats.exSpend += cost
  return null
}
/** What buying `qty` would cost right now (Infinity if the book is too thin). */
export function quoteBuy(s: GameState, res: string, qty: number, minQ = 0) {
  let left = qty, cost = 0
  for (const o of book(s, res, minQ).filter(o => o.owner !== 'me')) { const t = Math.min(left, o.qty); cost += t * o.price; left -= t; if (left <= 0) return cost }
  return Infinity
}

// ---- Shipping crates in the same step ------------------------------------
/** Crates still missing to ship `qty` of `res` (0 when you have enough). */
export const crateShort = (s: GameState, res: string, qty: number) =>
  res === 'crates' ? 0 : Math.max(0, cratesFor(res, qty) - Math.floor(haveQty(s, 'crates') + 1e-9))
/** What buying the missing crates costs now (Infinity if traders don't have enough). */
export const crateShortCost = (s: GameState, res: string, qty: number) => { const n = crateShort(s, res, qty); return n ? quoteBuy(s, 'crates', n) : 0 }
/**
 * Buy the missing crates, then run `then` (list or quick-sell). The UI runs
 * this on a cloned state and drops the clone on any error, so it's all or
 * nothing: you never end up with crates bought but the sale not made.
 */
export function withCrates(s: GameState, res: string, qty: number, then: () => string | null): string | null {
  const n = crateShort(s, res, qty)
  if (n) { setWhy('bought'); const e = buy(s, 'crates', n); if (e) return `Couldn't buy ${n} crates: ${e}` }
  return then()
}

/** List goods for sale. Goods and crates leave the warehouse into the order. */
export function placeAsk(s: GameState, res: string, q: number, qty: number, price: number): string | null {
  if (!Number.isInteger(qty) || qty < 1) return 'Pick a whole amount of at least 1'
  if (!(price > 0)) return 'Set a price'
  if ((s.stock[key(res, q)] ?? 0) + 1e-9 < qty) return 'Not enough in the warehouse'
  if (price > refPrice(s, res) * 3 * (1 + 0.1 * q)) return 'Price is far above the market; nobody will buy'
  const crates = cratesFor(res, qty)
  if (res !== 'crates' && haveQty(s, 'crates') < crates) return `Need ${crates} shipping crates`
  if (res === 'crates' && (s.stock[key(res, q)] ?? 0) < qty + crates) return 'Not enough crates'
  setWhy('listed on exchange')
  addStock(s, res, q, -qty)
  if (crates) takeStock(s, 'crates', crates)
  s.asks.push({ id: s.nextUid++, owner: 'me', res, q, qty, price: round2(price), placedH: s.hour, crates })
  return null
}

/** Cancel one of your asks. Fee applies only in the first 48 game hours. */
export function cancelAsk(s: GameState, id: number): string | null {
  const o = s.asks.find(a => a.id === id && a.owner === 'me')
  if (!o) return 'Order not found'
  const fee = s.hour - o.placedH < CANCEL_FREE_AFTER_H ? feeRate(s) * o.qty * o.price : 0
  setWhy('order cancelled')
  addStock(s, o.res, o.q, o.qty)
  if (o.crates) addStock(s, 'crates', 0, o.crates)
  s.cash -= fee; ledgerBook(s, 'fees', -fee)
  s.asks = s.asks.filter(a => a !== o)
  return null
}
export const cancelFee = (s: GameState, o: Order) => (s.hour - o.placedH < CANCEL_FREE_AFTER_H ? feeRate(s) * o.qty * o.price : 0)

/** Sell instantly to NPC buyers at the bid price, up to today's limit. */
export function quickSell(s: GameState, res: string, q: number, qty: number): string | null {
  if (!Number.isInteger(qty) || qty < 1) return 'Pick a whole amount of at least 1'
  if ((s.stock[key(res, q)] ?? 0) + 1e-9 < qty) return 'Not enough in the warehouse'
  if ((s.bidLeft[res] ?? 0) < qty) return `Buyers only want ${Math.floor(s.bidLeft[res] ?? 0)} more today`
  const crates = cratesFor(res, qty)
  if (res !== 'crates' && haveQty(s, 'crates') < crates) return `Need ${crates} shipping crates`
  setWhy('sold on exchange')
  addStock(s, res, q, -qty)
  if (crates) takeStock(s, 'crates', crates)
  s.bidLeft[res] -= qty
  s.cash += qty * bidPrice(s, res, q) * (1 - feeRate(s))
  // Ledger: gross sale in, broker fee out, so both show on the statement.
  ledgerBook(s, 'exSales', qty * bidPrice(s, res, q)); ledgerBook(s, 'fees', -qty * bidPrice(s, res, q) * feeRate(s))
  s.stats.exRev += qty * bidPrice(s, res, q)
  s.exSold[res] = (s.exSold[res] ?? 0) + qty
  return null
}

/** The grid pays this share of the market reference price for power. */
export const GRID_RATE = 0.85

/**
 * Sell surplus power straight to the grid: no crates, no broker fee, no daily
 * buyer cap. The grid pays a set share of the reference price.
 */
export function sellPower(s: GameState, q: number, qty: number): string | null {
  if (!Number.isInteger(qty) || qty < 1) return 'Pick a whole amount of at least 1'
  if ((s.stock[key('power', q)] ?? 0) + 1e-9 < qty) return 'Not enough power in the warehouse'
  const pay = qty * refPrice(s, 'power') * GRID_RATE
  setWhy('sold to the grid')
  addStock(s, 'power', q, -qty)
  s.cash += pay; ledgerBook(s, 'exSales', pay) // grid sales count as exchange sales
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
        s.cash += t * o.price * (1 - feeRate(s))
        ledgerBook(s, 'exSales', t * o.price); ledgerBook(s, 'fees', -t * o.price * feeRate(s))
        s.stats.exRev += t * o.price
        s.exSold[r.id] = (s.exSold[r.id] ?? 0) + t
        if (o.qty <= 1e-9) say(`Exchange: your ${RES[r.id].name} Q${o.q} order sold out.`)
      }
    }
  }
  // Expire old orders: goods and leftover crates come home.
  for (const o of s.asks.filter(a => a.owner === 'me' && s.hour - a.placedH >= EXPIRE_H)) {
    setWhy('order expired'); addStock(s, o.res, o.q, o.qty); if (o.crates) addStock(s, 'crates', 0, o.crates)
    o.qty = 0; say(`Exchange: your ${RES[o.res].name} order expired and came back.`)
  }
  s.asks = s.asks.filter(o => o.qty > 1e-9)
}

/** Daily: reference prices drift, flooded goods dip, NPC stock refreshes. */
export function marketDay(s: GameState) {
  // Online, the shared server market moves prices; we only restock NPCs.
  if (s.online) { s.exSold = {}; restockNpc(s); return }
  for (const r of RESOURCES) {
    // Market news pulls the target price toward the story (e.g. heatwave: ice cream up).
    const base = r.basePrice * priceTrend(s.phase) * newsPrice(r.id, s.hour), ref = refPrice(s, r.id)
    let next = ref + 0.1 * (base - ref) + ref * 0.06 * (rnd(s) - 0.5)
    next *= 1 - Math.min(0.08, ((s.exSold[r.id] ?? 0) / depth(r.id)) * 0.04)
    s.ref[r.id] = Math.min(base * 1.8, Math.max(base * 0.6, next))
  }
  s.exSold = {}
  restockNpc(s)
}

/**
 * Give every good 14 days of believable past prices (a gentle random walk
 * ending at today's price) so the Exchange chart is never empty.
 */
export function seedHistory(s: GameState) {
  s.priceHist = s.priceHist ?? {}
  for (const r of RESOURCES) {
    if ((s.priceHist[r.id]?.length ?? 0) >= 2) continue
    const out: number[] = []
    let p = refPrice(s, r.id)
    for (let i = 0; i < 14; i++) { out.unshift(p); p = Math.max(r.basePrice * 0.6, p * (1 + 0.05 * (rnd(s) - 0.5))) }
    s.priceHist[r.id] = out
  }
}
