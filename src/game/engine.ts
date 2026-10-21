// ============================================================================
// Ledgerworks simulation engine (pure functions, no React, easy to test).
//
// Time model
//  - The game clock counts GAME HOURS as a float (state.hour).
//  - GAME_SPEED game hours pass per real hour (4x, so 1 game day = 6 real h).
//  - All work is "jobs" with a start and end hour. advance() moves the clock
//    and finishes any job whose end hour has passed, in time order, and rolls
//    over game days (which refreshes retail saturation).
//
// Money rules
//  - Wages for a job are paid up front when it starts (simple + predictable).
//  - Shop revenue is paid when the sale job finishes.
// ============================================================================
import { BLD, REC, RES } from './data'
import { marketDay, npcHour, restockNpc, type Order } from './market'
import { ACCOUNTING_FREE, accountingFee, adminOverhead, isPhaseDay, nextPhase, PHASE_LABEL, productionMult, retailMult } from './economy'
import { rand } from './rng'
import * as X from './execs'
import * as F from './finance'
import { qFromPatents } from './research'
import { applyResearch, RESEARCH_LEVEL, researchable, researchedQ } from './research'

export const GAME_SPEED = 4 // game hours per real hour
export const MAX_QUALITY = 12
export const START_CASH = 60000

// --------------------------------------------------------------------------
// State types
// --------------------------------------------------------------------------
export type Job =
  | { kind: 'build'; endH: number } // construction or upgrade in progress
  | { kind: 'make'; res: string; qty: number; q: number; startH: number; endH: number }
  | { kind: 'sell'; res: string; qty: number; q: number; price: number; startH: number; endH: number }

export interface Building { uid: number; type: string; level: number; job?: Job; abund?: Record<string, number> }

export interface GameState {
  version: 1
  company: string
  cash: number
  xp: number
  hour: number // game clock, in game hours since founding
  lastReal: number // real ms timestamp of the last advance()
  nextUid: number
  plots: (Building | null)[]
  /** Warehouse, keyed "resourceId|quality" -> units. */
  stock: Record<string, number>
  /** Retail saturation per resource; 1 = normal, >1 = flooded, <1 = hungry. */
  saturation: Record<string, number>
  /** Units sold to the public today, per resource (feeds saturation). */
  soldToday: Record<string, number>
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
  // --- Executives & achievements (stage 9) ---
  execs: Partial<Record<X.Seat, X.Exec>>
  candidates: X.Exec[]
  stats: X.Stats
  ach: Record<string, number> // tiers reached per achievement
  // --- Finance (stage 10) ---
  bonds?: F.Bond[] // bonds you issued (debt)
  holdings?: F.Holding[] // bonds you bought
  bondOffers?: F.Holding[] // NPC bonds for sale this week
  gov?: F.GovOrder // current government order
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

export function addStock(s: GameState, res: string, q: number, n: number) {
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

export function newGame(company = 'My Company', now = Date.now()): GameState {
  const s: GameState = {
    version: 1, company, cash: START_CASH, xp: 0, hour: 8, lastReal: now, nextUid: 1,
    plots: Array(24).fill(null), stock: {}, saturation: {}, soldToday: {}, log: ['Welcome to Ledgerworks!'],
    seed: 12345, ref: {}, asks: [], bidLeft: {}, exSold: {}, patents: {}, execs: {}, candidates: [], stats: X.emptyStats(), ach: {},
  }
  restockNpc(s)
  X.newCandidates(s)
  F.newBondOffers(s)
  return s
}

// --------------------------------------------------------------------------
// Construction
// --------------------------------------------------------------------------
/** Cost to bring a building from level-1 to `toLevel`. */
export const upgradeCost = (type: string, toLevel: number) => BLD[type].cost * toLevel
/** Construction time in game hours: grows with level. */
export const buildHours = (toLevel: number) => 2 + 2 * (toLevel - 1)

export function construct(s: GameState, plot: number, type: string): string | null {
  const b = BLD[type], lvl = companyLevel(s.xp)
  if (!b) return 'Unknown building'
  if (plot >= plotCount(lvl) || s.plots[plot]) return 'That plot is not free'
  if (lvl < b.unlockLevel) return `Needs company level ${b.unlockLevel}`
  if (s.cash < b.cost) return 'Not enough cash'
  s.cash -= b.cost
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
  const cost = upgradeCost(bd.type, bd.level + 1)
  if (s.cash < cost) return 'Not enough cash'
  s.cash -= cost
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
  return Math.round(bd.level <= 2 ? total : total * 0.6)
}
export function scrap(s: GameState, plot: number): string | null {
  const bd = s.plots[plot]
  if (!bd) return 'Empty plot'
  if (bd.job && bd.job.kind !== 'build') return 'Wait for the current job to finish'
  s.cash += scrapRefund(bd)
  if (F.isExtractor(bd.type)) s.stats.scrappedMines++
  s.plots[plot] = null
  say(s, `Scrapped a ${BLD[bd.type].name}.`)
  return null
}

// --------------------------------------------------------------------------
// Production
// --------------------------------------------------------------------------
/** Hours a production run takes: qty / (rate * level). */
/** Hours a production run takes; economy phase speeds up or slows the building. */
export const makeHours = (res: string, qty: number, level: number, type?: string, s?: GameState, abund = 1) =>
  qty / (REC[res].perHour * level * abund * (type && s ? productionMult(type, s.phase) : 1))
/** Company admin overhead fraction from all building levels. */
export const overhead = (s?: GameState) => (s ? adminOverhead(s.plots.filter(Boolean).map(b => b!.level)) * (1 - X.overheadCut(s)) : 0)
/** Wages for `hours` of work, including admin overhead when a state is given. */
export const makeWages = (type: string, level: number, hours: number, s?: GameState) => BLD[type].wage * level * hours * (1 + overhead(s))

export function startMake(s: GameState, plot: number, res: string, qty: number): string | null {
  const bd = s.plots[plot]
  if (!bd || bd.job) return 'Building is busy'
  const bt = BLD[bd.type], rc = REC[res]
  if (!bt.recipes?.includes(res)) return 'This building cannot make that'
  if (!(qty > 0)) return 'Pick an amount'
  const hours = makeHours(res, qty, bd.level, bd.type, s, bd.abund?.[res] ?? 1), wages = makeWages(bd.type, bd.level, hours, s)
  if (s.cash < wages) return 'Not enough cash for wages'
  for (const [inp, per] of Object.entries(rc.inputs)) if (haveQty(s, inp) + 1e-9 < per * qty) return `Need ${Math.ceil(per * qty)} ${RES[inp].name}`
  // Output quality: the product's researched quality, but at most the
  // lowest input quality + 1 (inputs are taken best-first).
  let q = Math.min(MAX_QUALITY, researchedQ(s, res))
  for (const [inp, per] of Object.entries(rc.inputs)) {
    const low = takeStock(s, inp, per * qty)
    q = Math.min(q, low + 1)
  }
  s.cash -= wages
  bd.job = { kind: 'make', res, qty, q, startH: s.hour, endH: s.hour + hours }
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
 */
export function sellRate(s: GameState, res: string, q: number, price: number) {
  const r = RES[res]
  const base = (r.dailyDemand ?? 0) / 24
  const sat = s.saturation[res] ?? 1
  return base * Math.pow(fairPrice(res, q) / price, 2.2) * (1 + 0.12 * q) / sat * retailMult(s.phase) * X.retailBoost(s)
}
export const sellHours = (s: GameState, res: string, q: number, price: number, qty: number, level: number) =>
  qty / (sellRate(s, res, q, price) * level)

export function startSell(s: GameState, plot: number, res: string, q: number, qty: number, price: number): string | null {
  const bd = s.plots[plot]
  if (!bd || bd.job) return 'Building is busy'
  if (RES[res]?.store !== BLD[bd.type].store) return 'This shop does not sell that'
  if ((s.stock[key(res, q)] ?? 0) + 1e-9 < qty || !(qty > 0)) return 'Not enough in the warehouse'
  if (!(price > 0)) return 'Set a price'
  const hours = sellHours(s, res, q, price, qty, bd.level)
  if (hours > 72) return 'Too slow (over 3 days). Lower the price or the amount.'
  const wages = makeWages(bd.type, bd.level, hours, s)
  if (s.cash < wages) return 'Not enough cash for wages'
  addStock(s, res, q, -qty)
  s.cash -= wages
  bd.job = { kind: 'sell', res, qty, q, price, startH: s.hour, endH: s.hour + hours }
  return null
}


// --------------------------------------------------------------------------
// Daily cycle: saturation drifts toward how much was sold vs normal demand.
// --------------------------------------------------------------------------
export function rollDay(s: GameState) {
  for (const r of Object.values(RES)) {
    if (!r.dailyDemand) continue
    const sold = s.soldToday[r.id] ?? 0
    const target = 0.8 + sold / r.dailyDemand // selling 20% of demand = neutral
    const sat = 0.7 * (s.saturation[r.id] ?? 1) + 0.3 * target
    s.saturation[r.id] = Math.max(0.6, Math.min(3, sat))
  }
  s.soldToday = {}
  // Accounting fee on large cash piles.
  // Executives: pay salaries; refresh candidates weekly.
  const pay = X.dailySalaries(s)
  if (pay > 0) { s.cash -= pay; say(s, `Executive salaries: $${pay.toLocaleString()}.`) }
  if (Math.floor(s.hour / 24) % 7 === 0) { X.newCandidates(s); F.newBondOffers(s) }
  F.bondDay(s, m => say(s, m))
  F.govDay(s, m => say(s, m))
  F.depleteAll(s)
  // Accounting base: cash plus bonds you hold.
  const fee = accountingFee(s.cash + F.heldValue(s), ACCOUNTING_FREE + X.cashLineBonus(s))
  if (fee > 0) { s.cash -= fee; say(s, `Accounting fee: $${fee.toLocaleString()}.`) }
  // Weekly economy roll (offline only; online the server decides).
  const day = Math.floor(s.hour / 24)
  if (!s.online && isPhaseDay(day)) {
    const [r, n] = rand(s.seed); s.seed = n
    const was = s.phase ?? 'normal'; s.phase = nextPhase(was, r)
    if (s.phase !== was) say(s, `The economy is now: ${PHASE_LABEL[s.phase]}.`)
  }
  marketDay(s)
  // Record today's going prices for the Exchange chart.
  s.priceHist = s.priceHist ?? {}
  for (const [k, v] of Object.entries(s.ref)) { const h = (s.priceHist[k] = s.priceHist[k] ?? []); h.push(v); if (h.length > 30) h.shift() }
}

function finishJob(s: GameState, bd: Building) {
  const j = bd.job!
  const name = BLD[bd.type].name
  if (j.kind === 'make') {
    addStock(s, j.res, j.q, j.qty)
    s.xp += (makeWages(bd.type, bd.level, j.endH - j.startH)) / 50
    say(s, `${name} made ${Math.round(j.qty)} ${RES[j.res].name} (Q${j.q}).`)
  } else if (j.kind === 'sell') {
    const rev = j.qty * j.price
    s.cash += rev
    s.stats.retailRev += rev
    s.soldToday[j.res] = (s.soldToday[j.res] ?? 0) + j.qty
    s.xp += rev / 50
    say(s, `${name} sold ${Math.round(j.qty)} ${RES[j.res].name} for $${Math.round(rev).toLocaleString()}.`)
  } else {
    say(s, `${name} is ready (level ${bd.level}).`)
  }
  bd.job = undefined
}

/**
 * Move the clock to `toHour`, finishing jobs and rolling days in time order.
 * Mutates and returns the state.
 */
export function advanceTo(s: GameState, toHour: number): GameState {
  while (true) {
    // Next event: earliest job end, the next whole hour (NPC buyers), or midnight.
    const nextHour = Math.floor(s.hour + 1e-9) + 1
    let next = nextHour, who: Building | null = null
    for (const bd of s.plots) if (bd?.job && bd.job.endH < next) { next = bd.job.endH; who = bd }
    if (next > toHour) break
    s.hour = next
    if (who) finishJob(s, who)
    else {
      npcHour(s, m => say(s, m))
      if (nextHour % 24 === 0) rollDay(s)
    }
  }
  s.hour = Math.max(s.hour, toHour)
  for (const m of X.checkAchievements(s)) say(s, m)
  return s
}

/** Advance by real wall-clock time since the last call (offline progress too). */
export function advanceReal(s: GameState, now = Date.now()): GameState {
  const dh = ((now - s.lastReal) / 3600000) * GAME_SPEED
  s.lastReal = now
  return dh > 0 ? advanceTo(s, s.hour + dh) : s
}

/** Pay 2,000 cash to finish a running job instantly ("rush"); handy in a
 *  single-player game where waiting real hours is the main cost. */
export function rush(s: GameState, plot: number): string | null {
  const bd = s.plots[plot]
  if (!bd?.job) return 'Nothing to rush'
  const left = bd.job.endH - s.hour
  const cost = Math.ceil(left) * 250
  if (s.cash < cost) return 'Not enough cash'
  s.cash -= cost
  bd.job.endH = s.hour
  finishJob(s, bd)
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
