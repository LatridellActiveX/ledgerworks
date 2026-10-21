// ============================================================================
// Standing buy orders ("bids") on the Exchange.
//
// Idea borrowed (mechanics only) from EVE Online's market:
//  - A buy order names a good, a top price per unit and an amount. When you
//    place it, the full cost (amount x your price) is locked away in escrow,
//    so the order can always pay for itself.
//  - It first fills right away from any sell orders at or below your price,
//    cheapest first, paying THEIR asking price (you get the better deal and
//    the difference goes back to cash).
//  - Whatever is left waits on the book. A small broker fee is charged on
//    that waiting part only and is never refunded.
//  - Cancelling or expiring returns the unused escrow (not the fee).
// Our own twists and numbers:
//  - Every game hour each open order checks the book again (NPC stock is
//    re-priced every day, so a bid fills when the ask price drops to it)
//    and NPC sellers walk by with a lot to sell. A seller takes your bid
//    when it reaches what they want for it, which drifts near the going
//    price, so bids a little under the market fill slowly, deep bids rarely.
//  - A minimum quality is kept: only lots at that quality or better count.
//  - At most MAX_BIDS open orders; they expire after a week of game time.
// Bids live in the save (GameState.bids); old saves simply have none.
// ============================================================================
import { RES } from './data'
import { rand } from './rng'
import { addStock, logMsg, setWhy, type GameState } from './engine'
import { feeMult } from './execs'
import { book, depth, refPrice, EXPIRE_H } from './market'

/** Broker fee on the part of a bid that waits on the book (1%). */
export const BROKER_FEE = 0.01
/** Most open buy orders at once. */
export const MAX_BIDS = 8
/** Lowest bid allowed, as a share of the going price (stops silly 1-cent bids). */
export const MIN_SHARE = 0.5
/** Highest bid allowed, as a share of the going price. */
export const MAX_SHARE = 2

export interface Bid {
  id: number
  res: string
  minQ: number
  qty: number      // units still wanted
  total: number    // units asked for when placed
  price: number    // top price per unit
  escrow: number   // cash locked for the units still wanted (qty x price)
  placedH: number
  spent: number    // cash actually paid so far
}

const round2 = (n: number) => Math.max(0.01, Math.round(n * 100) / 100)
function rnd(s: GameState) { const [r, n] = rand(s.seed); s.seed = n; return r }

/** Cash locked in all open bids (counts as cash for company value). */
export const escrowTotal = (s: GameState) => (s.bids ?? []).reduce((t, b) => t + b.escrow, 0)

/** Give `t` units to a bid at `unit` price; leftover escrow per unit returns to cash. */
function fillBid(s: GameState, b: Bid, q: number, t: number, unit: number) {
  setWhy('buy order filled')
  addStock(s, b.res, q, t, unit)
  b.qty -= t
  b.escrow = Math.max(0, b.escrow - t * b.price)
  s.cash += t * (b.price - unit) // price improvement goes back to you
  b.spent += t * unit
  s.stats.exSpend += t * unit
  s.bidFills = (s.bidFills ?? 0) + 1 // drives the "order filled" sound
}

/** Fill a bid from NPC asks at or below its price, cheapest first. */
function matchBook(s: GameState, b: Bid) {
  for (const o of book(s, b.res, b.minQ)) {
    if (b.qty <= 0) break
    if (o.owner === 'me' || o.price > b.price) continue
    const t = Math.min(b.qty, o.qty)
    o.qty -= t
    fillBid(s, b, o.q, t, o.price)
  }
  s.asks = s.asks.filter(o => o.qty > 1e-9)
}

/** What placing this bid would cost up front: escrow + an upper bound on the fee. */
export const bidCost = (qty: number, price: number) => qty * price * (1 + BROKER_FEE)

/** Place a standing buy order. Returns an error message or null. */
export function placeBid(s: GameState, res: string, minQ: number, qty: number, price: number): string | null {
  if (!RES[res]) return 'Unknown good'
  if (!Number.isInteger(qty) || qty < 1) return 'Pick a whole amount of at least 1'
  if (!(price > 0)) return 'Set a price'
  const ref = refPrice(s, res)
  if (price < ref * MIN_SHARE) return `Too low: bid at least ${Math.ceil(ref * MIN_SHARE * 100) / 100}`
  if (price > ref * MAX_SHARE * (1 + 0.1 * minQ)) return 'Price is far above the market'
  const bids = (s.bids ??= [])
  if (bids.length >= MAX_BIDS) return `At most ${MAX_BIDS} buy orders`
  price = round2(price)
  if (s.cash + 1e-9 < bidCost(qty, price)) return 'Not enough cash for the escrow'
  const b: Bid = { id: s.nextUid++, res, minQ, qty, total: qty, price, escrow: qty * price, placedH: s.hour, spent: 0 }
  s.cash -= b.escrow
  matchBook(s, b) // instant part, no broker fee
  if (b.qty > 0) {
    s.cash -= b.qty * price * BROKER_FEE * feeMult(s) // fee on the waiting part only (a CFO cuts it)
    bids.push(b)
  } else logMsg(s, `Exchange: your buy order for ${RES[res].name} filled at once.`)
  return null
}

/** Cancel a bid: unused escrow comes back, the broker fee does not. */
export function cancelBid(s: GameState, id: number): string | null {
  const b = (s.bids ?? []).find(x => x.id === id)
  if (!b) return 'Order not found'
  s.cash += b.escrow
  s.bids = s.bids!.filter(x => x !== b)
  return null
}

/**
 * One game hour for buy orders (called after NPC buyers, see engine.advanceTo):
 *  1. match against the book (asks may have been re-priced at midnight),
 *  2. an NPC seller may come by and take the bid if it is high enough,
 *  3. week-old orders expire and refund their escrow.
 */
export function bidHour(s: GameState) {
  if (!s.bids?.length) return
  for (const b of s.bids) {
    matchBook(s, b)
    if (b.qty <= 0) continue
    // A seller's asking price: near the going price, +5% per quality step,
    // drifting -8%..+6% each hour. Your bid fills when it reaches that.
    const want = refPrice(s, b.res) * (1 + 0.05 * b.minQ) * (0.92 + 0.14 * rnd(s))
    if (b.price >= want) {
      const lot = Math.max(1, Math.round(depth(b.res) * 0.05 * (0.5 + rnd(s))))
      fillBid(s, b, b.minQ, Math.min(b.qty, lot), b.price)
    }
    if (b.qty <= 0) logMsg(s, `Exchange: your buy order for ${RES[b.res].name} is complete.`)
  }
  for (const b of s.bids.filter(x => x.qty > 0 && s.hour - x.placedH >= EXPIRE_H)) {
    s.cash += b.escrow; b.escrow = 0; b.qty = 0
    logMsg(s, `Exchange: your buy order for ${RES[b.res].name} expired; unused cash came back.`)
  }
  s.bids = s.bids.filter(x => x.qty > 0)
}

/**
 * Order book depth for the depth chart: cumulative units for sale at or
 * below each ask price (left to right, cheapest first), and cumulative
 * units wanted at or above each bid price (your bids plus the NPC traders'
 * quick-sell bid), highest first.
 */
export function depthCurve(s: GameState, res: string, quickBid: number) {
  let n = 0
  const asks = book(s, res).filter(o => o.owner !== 'me').map(o => ({ price: o.price, cum: (n += o.qty), mine: false }))
  const levels = [...(s.bids ?? []).filter(b => b.res === res).map(b => ({ price: b.price, qty: b.qty, mine: true })),
    { price: quickBid, qty: s.bidLeft?.[res] ?? 0, mine: false }].filter(l => l.qty > 0).sort((a, b) => b.price - a.price)
  n = 0
  const bids = levels.map(l => ({ price: l.price, cum: (n += l.qty), mine: l.mine }))
  return { asks, bids }
}
