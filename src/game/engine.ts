import * as EV from './event'
import { currentBases } from './rebase'
// ============================================================================
// Ledgerworks simulation engine (pure functions, no React, easy to test).
//
// Time model
//  - The game clock counts GAME HOURS as a float (state.hour).
//  - GAME_SPEED game hours pass per real hour: real time (1x), so a game
//    day is a real day. (Saves from the old 4x clock are converted in save.ts.)
//  - All work is "jobs" with a start and end hour. advance() moves the clock
//    and finishes any job whose end hour has passed, in time order, and rolls
//    over game days (which refreshes retail saturation).
//
// Money rules
//  - Wages for a job are paid up front when it starts (simple + predictable).
//  - Shop revenue is paid when the sale job finishes.
// ============================================================================
import * as L from './ledger'
import { BLD, REC, RES } from './data'
import * as V from './value'
import { marketDay, npcHour, restockNpc, seedHistory, type Order } from './market'
import { newsRetail, storyStarting } from './news'
import { ACCOUNTING_FREE, accountingFee, adminOverhead, isPhaseDay, nextPhase, PHASE_LABEL, productionMult, retailMult } from './economy'
import { rand } from './rng'
import * as X from './execs'
import * as F from './finance'
import { qFromPatents } from './research'
import { applyResearch, RESEARCH_LEVEL, researchable, researchedQ } from './research'

export { GAME_SPEED } from './engine-constants'
import { GAME_SPEED } from './engine-constants'
import * as SEA from './seasons'
import * as R from './routes'
import * as B from './bids'
import * as FM from './farm'
import { fittingOf, TILL_MAX, TILL_SPEED, tillShare, CLERK_WAGE, CLERK_SPEED, BAY_WAGE_MULT, LOYAL_SOLD_WEIGHT, PRICE_ELASTICITY, PRICE_BOARD_ELASTICITY, DEMAND_FIT, REGISTER_SPEED, maxSellHours, onShift } from './shop'
export const MAX_QUALITY = 12
export const START_CASH = 60000

// --------------------------------------------------------------------------
// State types
// --------------------------------------------------------------------------
export type Job =
  | { kind: 'build'; endH: number } // construction or upgrade in progress
  | { kind: 'make'; res: string; qty: number; q: number; startH: number; endH: number; got?: number; lastH?: number; uc?: number /* cost per unit (inputs + wages), for average cost */; src?: number /* sourcing value: what the run's inputs cost, $ */; wg?: number /* wages for the run, $ */; ripeH?: number /* farm crops: hour they ripened (waiting for harvest) */; tends?: number; tendH?: number /* farm crops: tending */ }
  | { kind: 'sell'; res: string; qty: number; q: number; price: number; startH: number; endH: number; got?: number; gotC?: number; lastH?: number }
// Partial collection (see collect()): `got` = whole units already handed
// over (made goods, or sold units already paid), `gotC` = cents already paid
// for a sale, `lastH` = game hour of the last collection.

export interface Building { uid: number; type: string; level: number; job?: Job; abund?: Record<string, number>; soil?: number; irrigated?: boolean; graft?: boolean; mods?: string[] /* shop fittings bought (shop.ts) */; till?: number /* registers added */; clerk?: boolean /* shift clerk on */; fields?: Building[] /* farms: extra fields, see farm.ts FIELD_* */ }

export interface GameState {
  version: 1
  clock?: number // 1 = real-time clock (see save.ts toRealTime)
  company: string
  cash: number
  xp: number
  hour: number // game clock, in game hours since founding
  /** Today's weather on the farms (see farm.ts). */
  weather?: 'clear' | 'rain' | 'frost' | 'heat'
  lastReal: number // real ms timestamp of the last advance()
  nextUid: number
  plots: (Building | null)[]
  /** Warehouse, keyed "resourceId|quality" -> units. */
  stock: Record<string, number>
  /** Retail saturation per resource; 1 = normal, >1 = flooded, <1 = hungry. */
  saturation: Record<string, number>
  /** Units sold to the public today, per resource (feeds saturation). */
  soldToday: Record<string, number>
  madeToday?: Record<string, number> // units made today, for the daily digest
  log: string[]
  // --- Exchange (stage 5) ---
  seed: number // seeded RNG state for NPC traders
  ref: Record<string, number> // reference price per good
  asks: Order[] // all sell orders: yours and NPC
  bidLeft: Record<string, number> // NPC instant-buy capacity left today
  exSold: Record<string, number> // units you sold on the exchange today
  // --- Server (stage 6) ---
  online?: boolean // true when prices come from the shared server market
  phase?: 'recession' | 'normal' | 'boom' // economy phase (stage 7)
  // --- Research (stage 8) ---
  patents: Record<string, number> // patents per product
  /** Daily going price per good, last 30 days (for charts). */
  priceHist?: Record<string, number[]>
  refBase?: Record<string, number> // basePrice each ref was anchored to (see rebase.ts)
  // --- Executives & achievements (stage 9) ---
  execs: Partial<Record<X.Seat, X.Exec>>
  candidates: X.Exec[]
  stats: X.Stats
  /** Money ledger: today's cash movements per category (see ledger.ts). Missing in old saves until their first close. */
  ledgerDay?: Partial<Record<L.Cat, number>>
  /** Where today's books opened: hour, cash and balance sheet. */
  ledgerOpen?: { h: number; cash: number; bal: L.Balance }
  /** Daily financial statements, oldest first, capped at L.HIST_DAYS. */
  statements?: L.DayStatement[]
  ach: Record<string, number> // tiers reached per achievement
  // --- Finance (stage 10) ---
  bonds?: F.Bond[] // bonds you issued (debt)
  valueHist?: V.ValuePoint[] // daily company value (Company Value chart)
  holdings?: F.Holding[] // bonds you bought
  bondOffers?: F.Holding[] // NPC bonds for sale this week
  gov?: F.GovOrder // current government order
  // --- Warehouse v2 ---
  /** Recent warehouse movements (newest last, capped): feeds History, 24h change and "recently changed". */
  whLog?: StockMove[]
  /** Average cost per unit for each good (weighted by units bought or made). */
  avgCost?: Record<string, number>
  // --- Seasons realm (stage 12) ---
  realm?: SEA.Realm
  season?: number // season number this company plays in (seasons realm only)
  seasonPhase?: SEA.SeasonPhase // current phase, refreshed from the world clock
  // --- Trade routes (routes.ts) ---
  /** Standing cart routes to other towns. Missing in older saves = none. */
  routes?: R.Route[]
  // --- Standing buy orders (bids.ts) ---
  /** Open buy orders on the Exchange (cash in escrow). Missing in older saves = none. */
  bids?: B.Bid[]
  /** How many times a buy order has filled (drives the 'order filled' sound). */
  bidFills?: number
  nextRouteId?: number
}

// --------------------------------------------------------------------------
// Levels and slots
// --------------------------------------------------------------------------
/** Total XP needed to REACH a level (level 1 needs 0). */
export const xpForLevel = (lvl: number) => Math.round(400 * Math.pow(lvl - 1, 1.7))
export function companyLevel(xp: number) {
  let l = 1
  while (xp >= xpForLevel(l + 1)) l++
  return l
}
/** Building plots grow with company level: 6 at level 1, up to 24. */
export const plotCount = (lvl: number) => Math.min(24, 5 + lvl)

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------
export const key = (res: string, q: number) => `${res}|${q}`
export const parseKey = (k: string) => { const [res, q] = k.split('|'); return { res, q: Number(q) } }
export const haveQty = (s: GameState, res: string) =>
  Object.entries(s.stock).reduce((t, [k, v]) => (parseKey(k).res === res ? t + v : t), 0)

/** One warehouse movement: +n in, -n out, with why it happened. */
export interface StockMove { h: number; res: string; q: number; n: number; why: string }
export const WHLOG_MAX = 400
/**
 * Why the next addStock calls happen ("bought", "made", "sold"...). Callers
 * set it with setWhy() right before moving stock; it's only a label for the
 * History tab, so a stale value can never break the game.
 */
let why = 'other'
export const setWhy = (w: string) => { why = w }

/**
 * Add (n > 0) or remove (n < 0) units of one quality lot.
 * `unitCost` (when known: buying or making) updates the good's average cost,
 * weighted by units. Every movement is also logged for the warehouse screens.
 */
export function addStock(s: GameState, res: string, q: number, n: number, unitCost?: number) {
  if (n > 0 && unitCost !== undefined && isFinite(unitCost)) {
    const have = haveQty(s, res), avg = (s.avgCost ??= {})
    avg[res] = ((avg[res] ?? unitCost) * have + unitCost * n) / (have + n)
  }
  if (Math.abs(n) > 1e-9) {
    const log = (s.whLog ??= []), last = log[log.length - 1]
    // Merge back-to-back moves of the same kind (e.g. many small collections).
    if (last && last.res === res && last.q === q && last.why === why && s.hour - last.h < 0.25 && Math.sign(last.n) === Math.sign(n)) { last.n += n; last.h = s.hour }
    else { log.push({ h: s.hour, res, q, n, why }); if (log.length > WHLOG_MAX) log.splice(0, log.length - WHLOG_MAX) }
  }
  const k = key(res, q)
  s.stock[k] = (s.stock[k] ?? 0) + n
  if (s.stock[k] <= 1e-9) delete s.stock[k]
}

/**
 * Take `n` units of a resource, highest quality first. Returns the lowest
 * quality taken (this decides output quality), or -1 if there is not enough.
 */
export function takeStock(s: GameState, res: string, n: number): number {
  if (haveQty(s, res) + 1e-9 < n) return -1
  const lots = Object.keys(s.stock).map(parseKey).filter(l => l.res === res).sort((a, b) => b.q - a.q)
  let need = n, low = MAX_QUALITY
  for (const l of lots) {
    const k = key(l.res, l.q), take = Math.min(need, s.stock[k])
    addStock(s, l.res, l.q, -take)
    need -= take; low = Math.min(low, l.q)
    if (need <= 1e-9) break
  }
  return low
}

const say = (s: GameState, msg: string) => { s.log.unshift(`Day ${Math.floor(s.hour / 24) + 1}: ${msg}`); s.log.length = Math.min(s.log.length, 40) }
/** Add a line to the event log (used by other game modules, e.g. trade routes). */
export const logMsg = say

export function newGame(company = 'My Company', now = Date.now()): GameState {
  const s: GameState = {
    version: 1, clock: 1, company, cash: START_CASH, xp: 0, hour: 8, lastReal: now, nextUid: 1,
    plots: Array(24).fill(null), stock: {}, saturation: {}, soldToday: {}, log: ['Welcome to Ledgerworks!'],
    seed: 12345, ref: {}, refBase: currentBases() /* new games start on today's bases */, asks: [], bidLeft: {}, exSold: {}, patents: {}, execs: {}, candidates: [], stats: X.emptyStats(), ach: {},
  }
  restockNpc(s)
  X.newCandidates(s)
  F.newBondOffers(s)
  seedHistory(s)
  L.openBooks(s) // new games keep books from day one
  return s
}

// --------------------------------------------------------------------------
// Construction
// --------------------------------------------------------------------------
/** Cost to bring a building from level-1 to `toLevel`. */
/**
 * Cost to build (toLevel 1) or upgrade to `toLevel`: cost x level for every
 * building, with per-type overrides in UPGRADE_OVERRIDE. The Corner market's
 * L2 is $10,000 (Oct 2026, was $20,000); its L3+ keep the formula.
 */
const UPGRADE_OVERRIDE: Record<string, Record<number, number>> = { market: { 2: 10000 } }
export const upgradeCost = (type: string, toLevel: number) => UPGRADE_OVERRIDE[type]?.[toLevel] ?? BLD[type].cost * toLevel
/** Total spent to reach `level` (build + every upgrade); used by valuations. */
export const investedCost = (type: string, level: number) => { let t = 0; for (let l = 1; l <= level; l++) t += upgradeCost(type, l); return t }
/** Construction time in game hours: grows with level. */
export const buildHours = (toLevel: number) => 2 + 2 * (toLevel - 1)

/**
 * The growing/working unit a plot ref points at: a plot's building, or (for
 * refs >= FM.FIELD_REF) one of a farm's extra fields. Every per-job action
 * below looks its target up through this, so fields reuse all the job code.
 */
export function unitAt(s: GameState, ref: number): Building | null | undefined {
  if (ref < FM.FIELD_REF) return s.plots[ref]
  const { plot, field } = FM.splitRef(ref)
  return s.plots[plot]?.fields?.[field]
}
/** Every building plus every farm field: what the clock loop advances. */
const allUnits = (s: GameState): Building[] => s.plots.flatMap(bd => (bd ? [bd, ...(bd.fields ?? [])] : []))
/** What a farm's next extra field costs, or null once it has the maximum. */
export const nextFieldCost = (bd: Building) => FM.FIELD_COSTS[bd.fields?.length ?? 0] ?? null

/**
 * Buy an extra field for a farm (replaces farm level-ups). The field starts
 * empty and idle; plant it like the main field. Booked as building spend, so
 * it counts in company value like an upgrade did.
 */
export function buyField(s: GameState, plot: number): string | null {
  const bd = s.plots[plot]
  if (!bd || !FM.isFarm(bd.type)) return 'Only farms have fields'
  if (bd.job?.kind === 'build') return 'Building is busy'
  const cost = nextFieldCost(bd)
  if (cost === null) return `A farm can have at most ${FM.MAX_FIELDS} extra fields`
  if (s.cash < cost) return 'Not enough cash'
  s.cash -= cost; L.book(s, 'buildings', -cost)
  // level = FIELD_OUT makes the field grow (and pay wages) at 0.6x base.
  ;(bd.fields ??= []).push({ uid: s.nextUid++, type: bd.type, level: FM.FIELD_OUT })
  s.xp += cost / 200 // same XP rule as building and upgrading
  say(s, `${BLD[bd.type].name}: field ${bd.fields.length + 1} is ready to plant.`)
  return null
}

export function construct(s: GameState, plot: number, type: string): string | null {
  const b = BLD[type], lvl = companyLevel(s.xp)
  if (!b) return 'Unknown building'
  if (plot >= plotCount(lvl) || s.plots[plot]) return 'That plot is not free'
  if (lvl < b.unlockLevel) return `Needs company level ${b.unlockLevel}`
  if (s.cash < b.cost) return 'Not enough cash'
  s.cash -= b.cost; L.book(s, 'buildings', -b.cost) // ledger: investing
  s.plots[plot] = { uid: s.nextUid++, type, level: 1, job: { kind: 'build', endH: s.hour + buildHours(1) } }
  F.rollAbundance(s, s.plots[plot]!)
  s.xp += b.cost / 200
  s.stats.built++
  say(s, `Started building a ${b.name}.`)
  return null
}

export function upgrade(s: GameState, plot: number): string | null {
  const bd = s.plots[plot]
  if (!bd) return 'Empty plot'
  if (bd.job) return 'Building is busy'
  // Farms grow by buying extra fields instead (buyField). Old saves keep the
  // levels they already have; only new level-ups are closed.
  if (FM.isFarm(bd.type)) return 'Farms grow by adding fields now'
  const cost = upgradeCost(bd.type, bd.level + 1)
  if (s.cash < cost) return 'Not enough cash'
  s.cash -= cost; L.book(s, 'buildings', -cost)
  bd.level++
  bd.job = { kind: 'build', endH: s.hour + buildHours(bd.level) }
  s.xp += cost / 200
  say(s, `Upgrading ${BLD[bd.type].name} to level ${bd.level}.`)
  return null
}

/** Scrap refund: full cost for levels 1-2, 60% beyond that. */
export function scrapRefund(bd: Building) {
  let total = 0
  for (let l = 1; l <= bd.level; l++) total += upgradeCost(bd.type, l)
  // Extra fields refund at 60%, like upgrades beyond level 2.
  return Math.round((bd.level <= 2 ? total : total * 0.6) + FM.fieldsPaid(bd.fields?.length ?? 0) * 0.6)
}
export function scrap(s: GameState, plot: number): string | null {
  const bd = s.plots[plot]
  if (!bd) return 'Empty plot'
  if (bd.job && bd.job.kind !== 'build') return 'Wait for the current job to finish'
  if (bd.fields?.some(f => f.job)) return 'Harvest or stop every field first'
  s.cash += scrapRefund(bd); L.book(s, 'buildings', scrapRefund(bd)) // refund nets against building spend
  if (F.isExtractor(bd.type)) s.stats.scrappedMines++
  s.plots[plot] = null
  say(s, `Scrapped a ${BLD[bd.type].name}.`)
  return null
}

// --------------------------------------------------------------------------
// Production
// --------------------------------------------------------------------------
/** Hours a production run takes; economy phase speeds up or slows the building. */
/**
 * Shortest job, in game hours (6 game minutes). Tiny jobs (even 1 unit) still
 * take and pay for at least this long, so there's no zero-time or zero-wage
 * job to repeat for free.
 */
export const MIN_JOB_H = 0.1
/** Amounts must be whole numbers of at least 1. Returns an error message, or null. */
export const badQty = (qty: number) => (Number.isInteger(qty) && qty >= 1 ? null : 'Pick a whole amount of at least 1')
export const makeHours = (res: string, qty: number, level: number, type?: string, s?: GameState, abund = 1) =>
  rawMakeHours(res, qty, level, type, s, abund) < MIN_JOB_H ? MIN_JOB_H : rawMakeHours(res, qty, level, type, s, abund)
const rawMakeHours = (res: string, qty: number, level: number, type?: string, s?: GameState, abund = 1) =>
  qty / (REC[res].perHour * level * abund * (type && s ? productionMult(type, s.phase) * SEA.seasonProd(type, s.seasonPhase) : 1))
/** Company admin overhead fraction from all building levels. */
export const overhead = (s?: GameState) => (s ? adminOverhead(s.plots.filter(Boolean).map(b => b!.level)) * (1 - X.overheadCut(s)) : 0)
/** Wages for `hours` of work, including admin overhead when a state is given. */
export const makeWages = (type: string, level: number, hours: number, s?: GameState) => BLD[type].wage * level * hours * (1 + overhead(s))

export function startMake(s: GameState, plot: number, res: string, qty: number): string | null {
  const bd = unitAt(s, plot)
  if (!bd || bd.job) return 'Building is busy'
  const bt = BLD[bd.type], rc = REC[res]
  if (!bt.recipes?.includes(res)) return 'This building cannot make that'
  const bq = badQty(qty); if (bq) return bq
  // Farms: a plot rolls its soil the first time it plants, and soil sets the pace.
  if (FM.isFarm(bd.type) && bd.soil === undefined) bd.soil = FM.rollSoil(() => { const [r, n] = rand(s.seed); s.seed = n; return r })
  const soil = FM.isFarm(bd.type) ? bd.soil ?? 1 : 1
  const hours = makeHours(res, qty, bd.level, bd.type, s, (bd.abund?.[res] ?? 1) * soil), wages = makeWages(bd.type, bd.level, hours, s)
  if (s.cash < wages) return 'Not enough cash for wages'
  // A drip line cuts the water needed; everything else is as the recipe says.
  const inputs = Object.fromEntries(Object.entries(rc.inputs).map(([k, v]) => [k, k === 'water' && FM.isFarm(bd.type) ? v * FM.waterFactor(bd.irrigated) : v]))
  for (const [inp, per] of Object.entries(inputs)) if (haveQty(s, inp) + 1e-9 < per * qty) return `Need ${Math.ceil(per * qty)} ${RES[inp].name}`
  // Output quality: the product's researched quality, but at most the
  // lowest input quality + 1 (inputs are taken best-first).
  let q = Math.min(MAX_QUALITY, researchedQ(s, res))
  // Unit cost for "average cost": inputs at their average cost (or market price) plus wages.
  const inCost = Object.entries(inputs).reduce((t, [inp, per]) => t + per * qty * (s.avgCost?.[inp] ?? s.ref[inp] ?? RES[inp].basePrice), 0)
  setWhy('used in production')
  for (const [inp, per] of Object.entries(inputs)) {
    const low = takeStock(s, inp, per * qty)
    q = Math.min(q, low + 1)
  }
  // A graft lifts the next crop from this plot one quality step, once.
  if (bd.graft && FM.isFarm(bd.type)) { q = Math.min(MAX_QUALITY, q + 1); bd.graft = false }
  s.cash -= wages; L.book(s, 'wages', -wages)
  bd.job = { kind: 'make', res, qty, q, startH: s.hour, endH: s.hour + hours, uc: (inCost + wages) / qty, src: inCost, wg: wages }
  return null
}

// --------------------------------------------------------------------------
// Retail: selling to the simulated public
// --------------------------------------------------------------------------
/** Price where demand is "normal": base markup, plus 8% per quality star. */
export const fairPrice = (res: string, q: number) => RES[res].basePrice * 1.5 * (1 + 0.08 * q)

/**
 * Units per game hour a level-1 shop sells.
 * - Price above fair price slows sales sharply (power 2.2), cheaper speeds up.
 * - Higher quality sells faster (+12% per star).
 * - Saturation divides speed: a flooded market buys slowly.
 * - Market news stories (news.ts) multiply it while they run.
 */
export function sellRate(s: GameState, res: string, q: number, price: number, bd?: Building) {
  const r = RES[res]
  const base = (r.dailyDemand ?? 0) / 24
  const sat = s.saturation[res] ?? 1
  // A shop's fittings change how many customers come in and how price-sensitive they are.
  const elast = bd?.mods?.includes('pricebd') ? PRICE_BOARD_ELASTICITY : PRICE_ELASTICITY
  const draw = bd?.mods ? bd.mods.reduce((m, f) => m * (DEMAND_FIT[f] ?? 1), 1) : 1
  return base * Math.pow(fairPrice(res, q) / price, elast) * (1 + 0.12 * q) / sat * retailMult(s.phase) * X.retailBoost(s) * SEA.seasonRetail(res, r.store, s.seasonPhase)
    // Market news: a running story speeds up (or slows down) sales of its goods.
    * newsRetail(res, s.hour) * draw
}

/** A shop's sales speed: level, tills and the extra register lane. Clerks are added by the hour. */
export function shopSpeed(bd: Building) {
  return bd.level * (1 + TILL_SPEED * (bd.till ?? 0)) * (bd.mods?.includes('register') ? REGISTER_SPEED : 1)
}
/** Clerk doubles speed while on shift. */
const clerkMult = (bd: Building, hour: number) => (bd.clerk && onShift(hour) ? CLERK_SPEED : 1)
const SALE_STEP = 0.05

/** Units a shop sells within `hours` from now, at this price. */
export function unitsIn(s: GameState, bd: Building, res: string, q: number, price: number, hours: number) {
  const rate = sellRate(s, res, q, price, bd) * shopSpeed(bd)
  let u = 0
  for (let t = 0; t < hours; t += SALE_STEP) u += rate * clerkMult(bd, s.hour + t) * Math.min(SALE_STEP, hours - t)
  return u
}
/** Game hours on shift (clerk time) inside a sale that starts now and lasts `hours`. */
export function shiftHoursIn(startH: number, hours: number) {
  let h = 0
  for (let t = 0; t < hours; t += SALE_STEP) if (onShift(startH + t)) h += Math.min(SALE_STEP, hours - t)
  return h
}

export function sellHours(s: GameState, res: string, q: number, price: number, qty: number, level: number, bd?: Building) {
  if (!bd) return Math.max(MIN_JOB_H, qty / (sellRate(s, res, q, price) * level))
  // Step forward until the shop has sold the lot (clerk shifts change the speed as the hours pass).
  const rate = sellRate(s, res, q, price, bd) * shopSpeed(bd)
  if (!(rate > 0)) return Infinity
  let t = 0, u = 0
  while (u < qty && t < 240) { u += rate * clerkMult(bd, s.hour + t) * SALE_STEP; t += SALE_STEP }
  return Math.max(MIN_JOB_H, t)
}

/** Shown (as a toast and a note) when a store already has a sale running. */
export const SELL_BUSY_MSG = 'Finish or stop the current sale first'

export function startSell(s: GameState, plot: number, res: string, q: number, qty: number, price: number): string | null {
  const bd = s.plots[plot]
  if (!bd) return 'Building is busy'
  // One sale at a time per store: while a sale is running, every other good is
  // listed in the panel but locked. This is the rule itself, so a second sale
  // can never start even if the UI (or an old client) asks for one.
  if (bd.job?.kind === 'sell') return SELL_BUSY_MSG
  if (bd.job) return 'Building is busy'
  if (RES[res]?.store !== BLD[bd.type].store) return 'This shop does not sell that'
  const bq = badQty(qty); if (bq) return bq
  if ((s.stock[key(res, q)] ?? 0) + 1e-9 < qty) return 'Not enough in the warehouse'
  if (!(price > 0)) return 'Set a price'
  const hours = sellHours(s, res, q, price, qty, bd.level, bd)
  const cap = maxSellHours(bd.mods)
  if (hours > cap) return `Too slow (over ${cap / 24} days). Lower the price or the amount.`
  // Delivery bay trims sale wages; a clerk is paid per hour they work on shift.
  const wages = makeWages(bd.type, bd.level, hours, s) * (bd.mods?.includes('bay') ? BAY_WAGE_MULT : 1)
    + (bd.clerk ? shiftHoursIn(s.hour, hours) * CLERK_WAGE : 0)
  if (s.cash < wages) return 'Not enough cash for wages'
  setWhy('sent to store')
  addStock(s, res, q, -qty)
  s.cash -= wages; L.book(s, 'wages', -wages) // store staff
  bd.job = { kind: 'sell', res, qty, q, price, startH: s.hour, endH: s.hour + hours }
  return null
}

/** Regulars at a loyalty-counter shop count a little extra toward market recovery. */
const soldWeight = (bd: Building) => (bd.mods?.includes('loyalty') ? LOYAL_SOLD_WEIGHT : 1)

/** Count units made or harvested today (see the daily digest in rollDay). */
const madeNote = (s: GameState, res: string, n: number) => { s.madeToday = s.madeToday ?? {}; s.madeToday[res] = (s.madeToday[res] ?? 0) + n }

/** Quick check that a plot is a shop that can take fittings, tills or staff. */
function shopPlot(s: GameState, plot: number): Building | string {
  const bd = s.plots[plot]
  if (!bd) return 'Empty plot'
  if (BLD[bd.type].kind !== 'retail') return 'Only shops take this'
  return bd
}

/** Buy a fitting for a shop. One of each per shop, bought for cash. */
export function buyFitting(s: GameState, plot: number, id: string): string | null {
  const bd = shopPlot(s, plot); if (typeof bd === 'string') return bd
  const f = fittingOf(id); if (!f) return 'No such fitting'
  if (bd.mods?.includes(id)) return `${f.name} is already fitted`
  const cost = Math.round(BLD[bd.type].cost * f.share)
  if (s.cash < cost) return 'Not enough cash'
  s.cash -= cost; L.book(s, 'buildings', -cost) // fittings count as building spend
  bd.mods = [...(bd.mods ?? []), id]
  s.xp += cost / 200
  say(s, `${BLD[bd.type].name}: fitted ${f.name}.`)
  return null
}

/** Add one more till (register) to a shop: each adds 10% sales speed, up to 5. */
export function buyTill(s: GameState, plot: number): string | null {
  const bd = shopPlot(s, plot); if (typeof bd === 'string') return bd
  const have = bd.till ?? 0
  if (have >= TILL_MAX) return 'Tills are full'
  const cost = Math.round(BLD[bd.type].cost * tillShare(have))
  if (s.cash < cost) return 'Not enough cash'
  s.cash -= cost; L.book(s, 'buildings', -cost)
  bd.till = have + 1
  s.xp += cost / 200
  say(s, `${BLD[bd.type].name}: till ${have + 1} installed.`)
  return null
}

/** Put a clerk on shift at a shop (or take them off). Wages are paid per shift hour on each sale. */
export function setClerk(s: GameState, plot: number, on: boolean): string | null {
  const bd = shopPlot(s, plot); if (typeof bd === 'string') return bd
  if (!!bd.clerk === on) return null
  bd.clerk = on || undefined
  say(s, on ? `${BLD[bd.type].name}: clerk hired for the 9am to 5pm shift.` : `${BLD[bd.type].name}: clerk let go.`)
  return null
}


// --------------------------------------------------------------------------
// Daily cycle: saturation drifts toward how much was sold vs normal demand.
// --------------------------------------------------------------------------
export function rollDay(s: GameState) {
  // One digest line for the day that just ended, instead of a line per sale or harvest.
  const list = (t: Record<string, number>) => Object.entries(t).filter(([, n]) => n >= 0.5).map(([id, n]) => `${Math.round(n)} ${RES[id]?.name ?? id}`).join(', ')
  const sold = list(s.soldToday), made = list(s.madeToday ?? {})
  if (sold || made) say(s, `Yesterday: sold ${sold || 'nothing'}. Made ${made || 'nothing'}.`)
  s.madeToday = {}
  for (const r of Object.values(RES)) {
    if (!r.dailyDemand) continue
    const sold = s.soldToday[r.id] ?? 0
    const target = 0.8 + sold / r.dailyDemand // selling 20% of demand = neutral
    const sat = 0.7 * (s.saturation[r.id] ?? 1) + 0.3 * target
    s.saturation[r.id] = Math.max(0.6, Math.min(3, sat))
  }
  s.soldToday = {}
  // Accounting fee on large cash piles.
  // Executives: salaries are paid every hour (see X.payHour in advanceTo);
  // here we just note the day's total and swap in today's candidate pool.
  const pay = X.dailySalaries(s)
  if (pay > 0) say(s, `Executive salaries paid over the last day: $${pay.toLocaleString()}.`)
  X.newCandidates(s)
  if (Math.floor(s.hour / 24) % 7 === 0) F.newBondOffers(s)
  F.bondDay(s, m => say(s, m))
  F.govDay(s, m => say(s, m))
  F.depleteAll(s)
  // Accounting base: cash plus bonds you hold.
  const fee = accountingFee(s.cash + F.heldValue(s), ACCOUNTING_FREE + X.cashLineBonus(s))
  if (fee > 0) { s.cash -= fee; L.book(s, 'fees', -fee); say(s, `Accounting fee: $${fee.toLocaleString()}.`) }
  // Company value history is now snapshotted every V.SNAP_H hours in advanceTo.
  // Weekly economy roll (offline only; online the server decides).
  const day = Math.floor(s.hour / 24)
  if (!s.online && isPhaseDay(day)) {
    const [r, n] = rand(s.seed); s.seed = n
    const was = s.phase ?? 'normal'; s.phase = nextPhase(was, r)
    if (s.phase !== was) say(s, `The economy is now: ${PHASE_LABEL[s.phase]}.`)
  }
  // Market news: announce today's new story (if any) in the event log.
  const story = storyStarting(day)
  if (story) say(s, `📰 News: ${story.t.headline}. ${story.t.goods.map(g => RES[g].name).join(', ')} sell ${story.t.mult >= 1 ? 'faster' : 'slower'} for ${story.endDay - story.startDay} days.`)
  marketDay(s)
  // Record today's going prices for the Exchange chart.
  s.priceHist = s.priceHist ?? {}
  for (const [k, v] of Object.entries(s.ref)) { const h = (s.priceHist[k] = s.priceHist[k] ?? []); h.push(v); if (h.length > 30) h.shift() }
  // Daily close: last, so the day's interest, fees and prices are all in.
  // Runs inside offline catch-up too (advanceTo calls rollDay each midnight).
  L.closeDay(s)
}

// --------------------------------------------------------------------------
// Partial collection: output and sales accrue linearly over a job. You can
// collect what has accrued at any time; the rest is paid at the end. Units
// are whole numbers and money is counted in cents, so all the partial
// collections plus the final payout add up to exactly the full job.
// --------------------------------------------------------------------------
/** Game hours between collect bubbles: 2 real minutes. */
export const BUBBLE_H = (2 / 60) * GAME_SPEED
const jobFrac = (j: { startH: number; endH: number }, hour: number) => (j.endH <= j.startH ? 1 : Math.min(1, Math.max(0, (hour - j.startH) / (j.endH - j.startH))))
/** Total cents a sale earns (the job's full revenue, rounded to a cent). */
export const saleCents = (j: { qty: number; price: number }) => Math.round(j.qty * j.price * 100)
/** Whole units made / sold so far. */
export const unitsDone = (j: { qty: number; startH: number; endH: number; ripeH?: number }, hour: number) =>
  j.ripeH !== undefined ? FM.ripeUnits(j, j.ripeH, hour) : Math.min(j.qty, Math.floor(j.qty * jobFrac(j, hour) + 1e-9))
/** What can be collected now: units of goods (make) or cents (sell). */
export function pending(s: GameState, bd: Building): { kind: 'goods' | 'cash'; res: string; q: number; units: number; cents: number } | null {
  const j = bd.job
  if (!j || j.kind === 'build') return null
  const u = unitsDone(j, s.hour)
  if (j.kind === 'make') return { kind: 'goods', res: j.res, q: j.ripeH !== undefined ? FM.ripeQuality(j.q, j.ripeH, s.hour) : j.q, units: u - (j.got ?? 0), cents: 0 }
  const cents = Math.floor((saleCents(j) * u) / j.qty)
  return { kind: 'cash', res: j.res, q: j.q, units: u - (j.got ?? 0), cents: cents - (j.gotC ?? 0) }
}
/** A bubble shows once 2 real minutes have passed since the job start or last collection, with at least 1 whole unit waiting. */
export function bubbleReady(s: GameState, bd: Building | null) {
  if (!bd) return null
  const p = pending(s, bd), j = bd.job
  if (!p || !j || j.kind === 'build' || p.units < 1) return null
  return s.hour - (j.lastH ?? j.startH) >= BUBBLE_H - 1e-9 ? p : null
}
/** Collect what has accrued so far. Goods go to the warehouse at the job's quality; money to cash. */
export function collect(s: GameState, plot: number): string | null {
  const bd = unitAt(s, plot), j = bd?.job
  if (!bd || !j || j.kind === 'build') return 'Nothing to collect'
  const p = pending(s, bd)!
  if (p.units < 1) return 'Nothing ready yet'
  if (j.kind === 'make') { setWhy('made'); addStock(s, j.res, p.q, p.units, j.uc); j.got = (j.got ?? 0) + p.units; madeNote(s, j.res, p.units) }
  else { s.cash += p.cents / 100; L.book(s, 'retail', p.cents / 100); j.got = (j.got ?? 0) + p.units; j.gotC = (j.gotC ?? 0) + p.cents }
  j.lastH = s.hour
  return null
}
/** When a crop ripened, if it has (only crop jobs have this). */
export const ripeOf = (j: Job | undefined) => (j && j.kind === 'make' ? j.ripeH : undefined)

/** A farm crop's timer has run out: it ripens and waits on the plot for harvest. */
function ripen(s: GameState, bd: Building) {
  const j = bd.job!
  if (j.kind !== 'make') return
  j.ripeH = j.endH
  // Tended often enough, the crop comes out a quality step higher.
  if ((j.tends ?? 0) >= FM.TEND_QUALITY_AT) j.q = Math.min(MAX_QUALITY, j.q + 1)
  say(s, `${BLD[bd.type].name}: ${RES[j.res].name} is ripe. Harvest it soon, it loses value each hour.`)
}

/** Harvest a ripe crop: everything still on the plot goes to the warehouse and the plot is free. */
export function harvest(s: GameState, plot: number): string | null {
  const bd = unitAt(s, plot), j = bd?.job
  if (!bd || !j || j.kind !== 'make' || j.ripeH === undefined) return 'Not ripe yet'
  const p = pending(s, bd)!
  const units = Math.max(0, p.units)
  if (units > 0) { setWhy('harvested'); addStock(s, j.res, p.q, units, j.uc); madeNote(s, j.res, units) }
  s.xp += makeWages(bd.type, bd.level, j.endH - j.startH) / 50
  bd.soil = FM.soilAfterHarvest(bd.soil ?? 1)
  bd.job = undefined
  return null
}

/** Tend a growing crop: it ripens sooner. Free, but one tend per cooldown. */
export function tend(s: GameState, plot: number): string | null {
  const bd = unitAt(s, plot), j = bd?.job
  if (!bd || !j || j.kind !== 'make' || j.ripeH !== undefined) return 'Nothing to tend'
  if (s.hour - (j.tendH ?? -Infinity) < FM.TEND_GAP_H) return 'Tended recently'
  FM.speedUp(j, s.hour, FM.TEND_SPEED)
  j.tends = (j.tends ?? 0) + 1
  j.tendH = s.hour
  if (j.endH <= s.hour) ripen(s, bd)
  return null
}

/** Put a drip line on a farm plot: less water for every crop. */
export function irrigate(s: GameState, plot: number): string | null {
  const bd = unitAt(s, plot)
  if (!bd || !FM.isFarm(bd.type)) return 'Only farms can be irrigated'
  if (bd.irrigated) return 'Already irrigated'
  if (bd.job) return 'Building is busy'
  const cost = Math.round(2500 * bd.level) // a 0.6x field pays 0.6x
  if (s.cash < cost) return 'Not enough cash'
  s.cash -= cost; L.book(s, 'otherOut', -cost) // farm care
  bd.irrigated = true
  return null
}

/** Graft a better variety onto a plot: a chance that its next crop comes out a quality step higher. */
export function graft(s: GameState, plot: number): string | null {
  const bd = unitAt(s, plot)
  if (!bd || !FM.isFarm(bd.type)) return 'Only farms can be grafted'
  if (bd.job) return 'Building is busy'
  if (bd.graft) return 'Already grafted'
  const cost = Math.round(300 * bd.level)
  if (s.cash < cost) return 'Not enough cash'
  if (haveQty(s, 'seeds') < 3) return 'Need 3 Seeds'
  s.cash -= cost; L.book(s, 'otherOut', -cost)
  takeStock(s, 'seeds', 3)
  const [r, n] = rand(s.seed); s.seed = n
  bd.graft = r < FM.GRAFT_CHANCE
  return bd.graft ? null : 'The graft did not take. Seeds and cash are gone.'
}

/**
 * Stop a running job early. You keep everything made or sold so far (it is
 * collected now). Unsold shop goods go back to the warehouse. Wages and the
 * inputs already used up are not refunded.
 */
export function cancelJob(s: GameState, plot: number): string | null {
  const bd = unitAt(s, plot), j = bd?.job
  if (!bd || !j || j.kind === 'build') return 'Nothing to stop'
  const p = pending(s, bd)!
  const done = unitsDone(j, s.hour)
  if (j.kind === 'make') { setWhy('made'); addStock(s, j.res, p.q, Math.max(0, p.units), j.uc); say(s, `${BLD[bd.type].name} stopped after ${done} of ${j.qty} ${RES[j.res].name}.`) }
  else {
    s.cash += p.cents / 100; L.book(s, 'retail', p.cents / 100)
    setWhy('back from store')
    addStock(s, j.res, j.q, j.qty - done)
    s.soldToday[j.res] = (s.soldToday[j.res] ?? 0) + done * soldWeight(bd)
    s.stats.retailRev += ((j.gotC ?? 0) + p.cents) / 100
    say(s, `${BLD[bd.type].name} stopped after selling ${done} of ${j.qty} ${RES[j.res].name}.`)
  }
  bd.job = undefined
  return null
}

function finishJob(s: GameState, bd: Building) {
  const j = bd.job!
  const name = BLD[bd.type].name
  if (j.kind === 'make') {
    setWhy('made')
    addStock(s, j.res, j.q, j.qty - (j.got ?? 0), j.uc) // the rest not yet collected
    madeNote(s, j.res, j.qty - (j.got ?? 0))
    s.xp += (makeWages(bd.type, bd.level, j.endH - j.startH)) / 50
  } else if (j.kind === 'sell') {
    const rev = saleCents(j) / 100
    s.cash += (saleCents(j) - (j.gotC ?? 0)) / 100; L.book(s, 'retail', (saleCents(j) - (j.gotC ?? 0)) / 100) // the rest not yet collected
    s.stats.retailRev += rev
    s.soldToday[j.res] = (s.soldToday[j.res] ?? 0) + j.qty * soldWeight(bd)
    s.xp += rev / 50
  } else {
    say(s, `${name} is ready (level ${bd.level}).`)
  }
  bd.job = undefined
}

/**
 * Move the clock to `toHour`, finishing jobs and rolling days in time order.
 * Mutates and returns the state.
 */
export function advanceTo(s: GameState, toHour: number, boost = 1): GameState {
  // Trade routes: after a long time away, only the last few missed trips are made up.
  R.capCatchUp(s, toHour)
  while (true) {
    // Next event: earliest job end, a trade-route cart (departure/arrival),
    // the next whole hour (NPC buyers), or midnight.
    const nextHour = Math.floor(s.hour + 1e-9) + 1
    let next = nextHour, who: Building | null = null, route: R.Route | null = null
    // A boosted job (Turbo Week) ends after (endH - hour) / boost game hours.
    for (const bd of allUnits(s)) if (bd.job && ripeOf(bd.job) === undefined) { // incl. farm fields
      const end = boosts(bd.job) ? s.hour + Math.max(0, bd.job.endH - s.hour) / boost : bd.job.endH
      if (end < next) { next = end; who = bd }
    }
    for (const bd of allUnits(s)) { const rh = ripeOf(bd.job); if (rh !== undefined && rh + FM.SPOIL_H < next) { next = Math.max(s.hour, rh + FM.SPOIL_H); who = bd } }
    const re = R.nextRouteEvent(s)
    if (re && re.h < next) { next = Math.max(s.hour, re.h); who = null; route = re.r }
    if (next > toHour) break
    warpJobs(s, next - s.hour, boost)
    s.hour = next
    if (route) R.runRoute(s, route)
    else if (who && ripeOf(who.job) !== undefined) { say(s, `${BLD[who.type].name}: the crop spoiled before it was harvested.`); who.job = undefined }
    else if (who && FM.isFarm(who.type) && who.job?.kind === 'make') ripen(s, who)
    else if (who) finishJob(s, who)
    else {
      npcHour(s, m => say(s, m))
      B.bidHour(s) // standing buy orders check the book and passing sellers
      X.payHour(s) // executives draw 1/24 of their daily salary every game hour
      // Company value timeline: a snapshot every few hours (thinned with age, see value.ts).
      if (nextHour % V.SNAP_H === 0) V.recordValue(s)
      if (nextHour % 24 === 0) { rollDay(s); const [r, n] = rand(s.seed); s.seed = n; for (const line of FM.farmDay(s, r)) say(s, line) }
    }
  }
  warpJobs(s, Math.max(0, toHour - s.hour), boost)
  s.hour = Math.max(s.hour, toHour)
  for (const m of X.checkAchievements(s)) say(s, m)
  return s
}

// --------------------------------------------------------------------------
// Live-event speed-ups (Turbo Week, see event.ts).
//
// A job's progress is (hour - startH) / (endH - startH). To make a job run
// `boost` times faster for `dt` game hours we slide its whole timeline
// (startH, endH and lastH) earlier by (boost - 1) * dt: progress then grows by
// boost * dt while its length (and so its wages, XP and units) is unchanged.
// This also speeds up jobs that were already running, from now on only.
// --------------------------------------------------------------------------
/** Jobs the event speeds up: production (incl. growing crops) and store selling. Not construction, not ripe crops. */
export const boosts = (j: Job | undefined) => !!j && (j.kind === 'make' || j.kind === 'sell') && (j.kind !== 'make' || j.ripeH === undefined)
function warpJobs(s: GameState, dt: number, boost: number) {
  if (boost === 1 || dt <= 0) return
  const shift = (boost - 1) * dt
  for (const bd of allUnits(s)) { // fields grow boosted too
    const j = bd?.job
    if (!boosts(j) || j!.kind === 'build') continue
    const k = j as Extract<Job, { kind: 'make' | 'sell' }>
    // Never slide past the end: a job finishing in this step lands exactly on it.
    const sh = Math.min(shift, Math.max(0, k.endH - s.hour - dt))
    k.startH -= sh; k.endH -= sh
    if (k.lastH !== undefined) k.lastH -= sh
  }
}
/** Game hours a job still takes from now, counting the live event. For timers and countdowns. */
export const jobLeft = (s: GameState, j: Job | undefined, now = Date.now()) =>
  !j ? 0 : boosts(j) ? EV.boostedLeft(Math.max(0, j.endH - s.hour), now) : Math.max(0, j.endH - s.hour)

/**
 * Advance by real wall-clock time since the last call (offline progress too).
 * The real interval is split at the event's start/end so only the part inside
 * the window runs boosted, and players get a notice when it starts or ends.
 */
export function advanceReal(s: GameState, now = Date.now()): GameState {
  const from = s.lastReal
  s.lastReal = now
  if (s.realm === 'seasons') s.seasonPhase = SEA.seasonAt(now).phase // shared season clock
  for (const seg of EV.splitWindow(from, now)) advanceTo(s, s.hour + ((seg.to - seg.from) / 3600000) * GAME_SPEED, seg.mult)
  const x = EV.crossed(from, now)
  if (x.started) say(s, `${EV.EVENT.icon} ${EV.EVENT.name} has started! Production and store selling run ${EV.EVENT.mult}× faster until ${new Date(EV.EVENT.end).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.`)
  if (x.ended) say(s, `${EV.EVENT.name} has ended. Production and selling are back to normal speed.`)
  return s
}

/** Pay 2,000 cash to finish a running job instantly ("rush"); handy in a
 *  single-player game where waiting real hours is the main cost. */
export function rush(s: GameState, plot: number): string | null {
  const bd = unitAt(s, plot)
  if (!bd?.job) return 'Nothing to rush'
  const left = bd.job.endH - s.hour
  const cost = Math.ceil(left) * 250
  if (s.cash < cost) return 'Not enough cash'
  s.cash -= cost; L.book(s, 'fees', -cost) // rush fee
  bd.job.endH = s.hour
  if (bd.job.kind === 'make' && FM.isFarm(bd.type)) ripen(s, bd)
  else finishJob(s, bd)
  return null
}
export const rushCost = (s: GameState, bd: Building) => (bd.job ? Math.ceil(Math.max(0, bd.job.endH - s.hour)) * 250 : 0)

/** Spend research notes on a product (see research.ts). Returns an error or null. */
export function research(s: GameState, res: string, n: number, bonus = 1): string | null {
  if (companyLevel(s.xp) < RESEARCH_LEVEL) return `Research unlocks at company level ${RESEARCH_LEVEL}`
  if (!researchable(res)) return 'This good cannot be researched'
  const before = researchedQ(s, res)
  const r = applyResearch(s, res, n, (id, k) => takeStock(s, id, k) >= 0, bonus)
  if (typeof r === 'string') return r
  const after = researchedQ(s, res)
  say(s, `Research: ${r} new patent${r === 1 ? '' : 's'} for ${RES[res].name}${after > before ? ` — now Q${after}!` : ''}.`)
  return null
}

/** Patent chance multiplier from executives (CTO arrives in stage 9). */
export const patentBonus = (s: GameState) => X.techBoost(s)

X.setQualityFn(qFromPatents)
