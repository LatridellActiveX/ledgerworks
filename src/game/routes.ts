// ============================================================================
// Trade routes: standing orders that ship goods to other cities by truck.
// (Modernised Oct 2026: carts -> box trucks, towns -> cities. Only names,
// icons and text changed; ids, prices, capacities and timings are the same,
// so saves and balance are untouched. Code identifiers still say town/cart.)
//
// Ideas borrowed (mechanics only) from:
//  - Patrician / The Patrician series: Hanseatic trade routes. You tell a
//    ship which town to visit and what to sell, and it repeats the trip on
//    its own; every town pays a different price that drifts over time.
//  - Factorio's logistics: a standing rule ("keep at least N in stock, send
//    the rest") instead of clicking every shipment by hand.
// The towns, names, numbers and text below are all our own.
//
// How it works (everything in GAME HOURS; the game runs at real time, 1x):
//  - A Route says: every `every` hours, load a cart at the warehouse with a
//    good and send it to a town. How much to load is either a fixed amount
//    ('amount') or "everything above a reserve" ('reserve'), never more than
//    the town's cart capacity.
//  - Departure: the goods leave the warehouse (best quality first) and the
//    transport fee is paid. The cart travels for the town's `travelH`.
//  - Arrival: the town buys the load at ITS price at that moment. The price
//    is the good's going price on the Exchange times a town bias (each town
//    likes some categories) times a slow deterministic drift. A town only
//    takes `townDemand()` units at full price per trip; the rest fetch 60%.
//  - Each route has at most one cart on the road. If the cart is still out
//    when the next departure is due, the departure waits for it to return.
//  - Offline catch-up: when you come back after a long time, at most
//    MAX_CATCHUP departures per route are made up; older missed trips are
//    skipped (and the log says so), so a week away can't empty the warehouse.
//  - Routes live in the save (GameState.routes), so local saves, save codes
//    and cloud saves all carry them. Old saves simply have no routes.
// ============================================================================
import { RES } from './data'
import { refPrice, depth, bidPrice } from './market'
import { fieldOf } from './research'
import type { GameState } from './engine'
import { addStock, haveQty, logMsg, setWhy, takeStock } from './engine'

// ---------------------------------------------------------------------------
// Towns
// ---------------------------------------------------------------------------
/** A destination town. `likes` / `dislikes` are research fields (categories). */
export interface Town {
  id: string
  name: string
  /** Emoji badge shown on the town card and the map lane. */
  icon: string
  blurb: string
  /** One-way travel time, in game hours. */
  travelH: number
  /** Most units one cart can carry to this town. */
  cap: number
  /** Fixed fee per trip ($) plus a fee per unit carried ($). */
  fee: number
  perUnit: number
  /** Size of the town: scales how many units it buys at full price per trip. */
  size: number
  likes: string[]
  dislikes: string[]
}

export const TOWNS: Town[] = [
  { id: 'millbrook', name: 'Millbrook Park', icon: '🏘️', blurb: 'A suburban business park just off the ring road. Close and cheap, but small.', travelH: 0.25, cap: 120, fee: 25, perUnit: 0.05, size: 0.25, likes: ['tech', 'textile'], dislikes: ['farm'] },
  { id: 'saltmarsh', name: 'Saltmarsh Port City', icon: '🚢', blurb: 'A container port with a busy waterfront district. Semis haul big loads; dock crews pay well for food.', travelH: 0.75, cap: 400, fee: 90, perUnit: 0.04, size: 0.6, likes: ['food', 'farm'], dislikes: ['build'] },
  { id: 'copperridge', name: 'Copperridge', icon: '🏗️', blurb: 'A fast-growing city in the hills with cranes on every block. Always building something.', travelH: 0.5, cap: 200, fee: 60, perUnit: 0.08, size: 0.4, likes: ['build', 'energy', 'food'], dislikes: ['tech'] },
  { id: 'lanternfall', name: 'Lanternfall', icon: '🏙️', blurb: 'A downtown of glass towers with deep pockets for gadgets and fashion. Far and pricey to reach.', travelH: 1, cap: 250, fee: 150, perUnit: 0.12, size: 0.8, likes: ['tech', 'textile'], dislikes: ['farm', 'energy'] },
]
export const TOWN: Record<string, Town> = Object.fromEntries(TOWNS.map(t => [t.id, t]))

/** How often a route can run, in game hours (shown as "every 1h" ... "every 1d"). */
export const EVERY_OPTIONS = [1, 2, 3, 6, 12, 24]
export const MAX_ROUTES = 6
/** Most missed departures per route made up after a long time away. */
export const MAX_CATCHUP = 12
/** Units beyond what a town wants per trip still sell, at this fraction of its price. */
export const SURPLUS_PRICE = 0.6

// ---------------------------------------------------------------------------
// Routes (saved in GameState.routes)
// ---------------------------------------------------------------------------
export interface Trip { departH: number; arriveH: number; qty: number; q: number; cost: number }
export interface TripResult { h: number; qty: number; revenue: number; cost: number; note?: string }
export interface Route {
  id: number
  town: string
  res: string
  /** 'amount': ship `amount` each trip. 'reserve': ship everything above `amount`. */
  mode: 'amount' | 'reserve'
  amount: number
  every: number
  paused?: boolean
  /** Game hour of the next departure. */
  nextH: number
  /** The cart currently on the road, if any. */
  trip?: Trip
  /** The last trip (or skipped departure, with a note). */
  last?: TripResult
  /** Lifetime totals: trips, units, revenue and transport costs. */
  trips: number
  units: number
  revenue: number
  costs: number
}
export type RouteSpec = Pick<Route, 'town' | 'res' | 'mode' | 'amount' | 'every'>

// ---------------------------------------------------------------------------
// Prices (pure functions of the state's going price, the town and the hour)
// ---------------------------------------------------------------------------
/** Small integer hash of a string (FNV-1a), for per-town/per-good variety. */
function hashStr(str: string) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
/** A number in [0, 1) from a string. */
const unit = (str: string) => (hashStr(str) % 10007) / 10007

/** How much a town likes a good: x1.2 for its favourite categories, x0.85 for disliked ones, ±6% personal taste. */
export function townBias(town: Town, res: string) {
  const f = fieldOf(res) ?? 'utility'
  const cat = town.likes.includes(f) ? 1.2 : town.dislikes.includes(f) ? 0.85 : 1
  return cat * (0.94 + 0.12 * unit(town.id + '|' + res))
}
/**
 * Slow price drift: two sine waves with a per-town/per-good period (2-5 days
 * and ~9 hours) and phase, so prices wander ±12% but are the same for the
 * same hour every time (no saving needed, tests are exact).
 */
export function townDrift(town: Town, res: string, hour: number) {
  const a = unit('p' + town.id + res), b = unit('q' + res + town.id)
  const slow = Math.sin((2 * Math.PI * hour) / (48 + 72 * a) + 6.28 * b)
  const fast = Math.sin((2 * Math.PI * hour) / (7 + 4 * b) + 6.28 * a)
  return 1 + 0.09 * slow + 0.03 * fast
}
/** What one quality-0 unit of `res` sells for in `town` at `hour` (before quality bonus). */
export const townPrice = (s: GameState, town: Town, res: string, hour = s.hour) =>
  refPrice(s, res) * townBias(town, res) * townDrift(town, res, hour)
/** Units a town buys at full price per trip; bigger for cheap goods and big towns. */
export const townDemand = (town: Town, res: string) => Math.max(5, Math.round(depth(res) * town.size))
/** Transport fee for one trip of `qty` units. */
export const tripCost = (town: Town, qty: number) => Math.round((town.fee + town.perUnit * qty * town.travelH * 4) * 100) / 100

/**
 * Revenue for selling `qty` units of quality `q` in a town at `hour`:
 * full price up to the town's demand, SURPLUS_PRICE of it beyond. Quality
 * adds 5% per star (like the Exchange's bid).
 */
export function saleValue(s: GameState, town: Town, res: string, qty: number, q: number, hour = s.hour) {
  const p = townPrice(s, town, res, hour) * (1 + 0.05 * q)
  const full = Math.min(qty, townDemand(town, res))
  return Math.round((full * p + (qty - full) * p * SURPLUS_PRICE) * 100) / 100
}
/** What the same load would fetch with a quick sell on the Exchange (for "vs Exchange"). */
export const exchangeValue = (s: GameState, res: string, qty: number, q = 0) => bidPrice(s, res, q) * qty

/** Units the next departure would load right now (0 = nothing to send). */
export function loadFor(s: GameState, r: Pick<Route, 'town' | 'res' | 'mode' | 'amount'>) {
  const have = Math.floor(haveQty(s, r.res) + 1e-9), cap = TOWN[r.town]?.cap ?? 0
  const want = r.mode === 'amount' ? r.amount : have - r.amount
  return Math.max(0, Math.min(cap, have, Math.floor(want)))
}

// ---------------------------------------------------------------------------
// Editing routes (player actions; return an error message or null)
// ---------------------------------------------------------------------------
function checkSpec(sp: RouteSpec): string | null {
  if (!TOWN[sp.town]) return 'Pick a town'
  if (!RES[sp.res]) return 'Pick a good'
  if (sp.mode !== 'amount' && sp.mode !== 'reserve') return 'Pick how much to send'
  if (!Number.isInteger(sp.amount) || sp.amount < (sp.mode === 'amount' ? 1 : 0)) return sp.mode === 'amount' ? 'Send at least 1 unit per trip' : 'Keep a whole number in reserve'
  if (sp.mode === 'amount' && sp.amount > TOWN[sp.town].cap) return `A truck to ${TOWN[sp.town].name} carries at most ${TOWN[sp.town].cap}`
  if (!EVERY_OPTIONS.includes(sp.every)) return 'Pick how often to send it'
  return null
}

/** Create a route. Its first cart leaves right away (on the next tick). */
export function addRoute(s: GameState, sp: RouteSpec): string | null {
  const routes = (s.routes ??= [])
  if (routes.length >= MAX_ROUTES) return `You can run at most ${MAX_ROUTES} routes`
  const bad = checkSpec(sp); if (bad) return bad
  const id = (s.nextRouteId = (s.nextRouteId ?? 1) + 1) - 1
  routes.push({ id, ...sp, nextH: s.hour, trips: 0, units: 0, revenue: 0, costs: 0 })
  logMsg(s, `🛒 New trade route: ${RES[sp.res].name} to ${TOWN[sp.town].name}, every ${sp.every}h.`)
  return null
}

/** Change a route's rule. A cart already on the road finishes its trip as planned. */
export function editRoute(s: GameState, id: number, sp: RouteSpec): string | null {
  const r = s.routes?.find(x => x.id === id); if (!r) return 'No such route'
  const bad = checkSpec(sp); if (bad) return bad
  // A shorter interval shouldn't wait out the old, longer one.
  if (sp.every < r.every) r.nextH = Math.min(r.nextH, s.hour + sp.every)
  Object.assign(r, sp)
  return null
}

/** Pause or resume. Resuming schedules the next cart right away. */
export function togglePause(s: GameState, id: number): string | null {
  const r = s.routes?.find(x => x.id === id); if (!r) return 'No such route'
  r.paused = !r.paused
  // Resuming keeps the rhythm, but a long-missed departure leaves right now.
  if (!r.paused) r.nextH = Math.max(r.nextH, s.hour)
  logMsg(s, `🚚 Route to ${TOWN[r.town]?.name ?? r.town} ${r.paused ? 'paused' : 'resumed'}.`)
  return null
}

/** Delete a route. A cart on the road turns back: its goods return to the warehouse (the fee is not refunded). */
export function deleteRoute(s: GameState, id: number): string | null {
  const i = s.routes?.findIndex(x => x.id === id) ?? -1; if (i < 0) return 'No such route'
  const r = s.routes![i]
  if (r.trip) { setWhy('returned from route'); addStock(s, r.res, r.trip.q, r.trip.qty) }
  s.routes!.splice(i, 1)
  logMsg(s, `🛒 Closed the route to ${TOWN[r.town]?.name ?? r.town}.`)
  return null
}

// ---------------------------------------------------------------------------
// Simulation (called from engine.advanceTo in time order)
// ---------------------------------------------------------------------------
/** When does this route next need attention? (cart arrival, or next departure). */
export const routeDue = (r: Route) => (r.trip ? r.trip.arriveH : r.paused ? Infinity : r.nextH)

/** Earliest due route, or null. */
export function nextRouteEvent(s: GameState): { h: number; r: Route } | null {
  let best: { h: number; r: Route } | null = null
  for (const r of s.routes ?? []) { const h = routeDue(r); if (h < (best?.h ?? Infinity)) best = { h, r } }
  return best
}

/**
 * Before a long catch-up to `toHour`: skip departures older than
 * MAX_CATCHUP trips, keeping the schedule on the same rhythm.
 */
export function capCatchUp(s: GameState, toHour: number) {
  for (const r of s.routes ?? []) {
    if (r.paused || r.trip) continue
    const due = Math.floor((toHour - r.nextH) / r.every) + 1 // departures that would happen
    if (due > MAX_CATCHUP) {
      const skip = due - MAX_CATCHUP
      r.nextH += skip * r.every
      logMsg(s, `🛒 While you were away, ${skip} trips to ${TOWN[r.town]?.name ?? r.town} were skipped (at most ${MAX_CATCHUP} are made up).`)
    }
  }
}

/** Handle the route's due event at the current hour: deliver a cart, or send one. */
export function runRoute(s: GameState, r: Route) {
  const town = TOWN[r.town]
  if (!town || !RES[r.res]) { r.paused = true; r.trip = undefined; return } // unknown data: park it safely
  if (r.trip) {
    // ---- Arrival: sell the load at the town's price right now. ----
    const t = r.trip
    const revenue = saleValue(s, town, r.res, t.qty, t.q)
    s.cash += revenue
    s.xp += revenue / 100
    r.trips++; r.units += t.qty; r.revenue += revenue; r.costs += t.cost
    r.last = { h: s.hour, qty: t.qty, revenue, cost: t.cost }
    r.trip = undefined
    logMsg(s, `🚚 Truck sold ${t.qty} ${RES[r.res].name} in ${town.name} for $${Math.round(revenue).toLocaleString()} (profit after transport $${Math.round(revenue - t.cost).toLocaleString()}).`)
    return
  }
  // ---- Departure ----
  const depart = r.nextH
  r.nextH = depart + r.every
  const qty = loadFor(s, r)
  const skip = (note: string) => { r.last = { h: s.hour, qty: 0, revenue: 0, cost: 0, note } }
  if (qty < 1) return skip(r.mode === 'amount' ? `Not enough ${RES[r.res].name} in the warehouse` : `Nothing above the reserve of ${r.amount}`)
  const cost = tripCost(town, qty)
  if (s.cash < cost) return skip('Not enough cash for the transport fee')
  setWhy(`shipped to ${town.name}`)
  const q = takeStock(s, r.res, qty) // best quality first; returns the lowest taken
  if (q < 0) return skip('Not enough in the warehouse')
  s.cash -= cost
  r.trip = { departH: s.hour, arriveH: s.hour + town.travelH, qty, q, cost }
}

/** Carts on the road right now, with their progress 0..1 (for the map lane). */
export function onTheRoad(s: GameState) {
  return (s.routes ?? []).filter(r => r.trip).map(r => {
    const t = r.trip!
    return { r, town: TOWN[r.town], p: Math.min(1, Math.max(0, (s.hour - t.departH) / Math.max(1e-6, t.arriveH - t.departH))), left: Math.max(0, t.arriveH - s.hour) }
  })
}

/** Profit of a route so far (revenue minus transport fees). */
export const routeProfit = (r: Route) => r.revenue - r.costs
