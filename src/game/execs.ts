// ============================================================================
// Executives and achievements (stage 9).
//
// Executives (unlock at company level 12)
//  - Four seats: COO, CFO, CMO, CTO. Each person has four skills:
//    ops, fin, mkt, tech (0-40). A seat uses its own skill at full weight,
//    plus a quarter of the matching skill of everyone else on the board.
//  - COO (ops): cuts admin overhead by ops% (relative).
//  - CFO (fin): raises the tax-free cash line by $200k per point, AND cuts
//    Exchange fees (the 3% seller fee and the 1% buy-order broker fee) by
//    2% per point, at most half (see feeMult).
//  - CMO (mkt): shops sell mkt% faster.
//  - CTO (tech): patent chance × (1 + tech%).
//  - They draw a salary that grows with total skill. It is quoted per day
//    but charged every game hour (1/24 at a time, see payHour), so it ticks
//    in real time and offline catch-up charges exactly the hours you missed.
//    Hiring costs a week of salary up front. Training adds +1 to a skill.
//  - A fresh pool of four candidates arrives every game day. The pool is a
//    pure function of the day number (like Market news), so every player
//    sees the same people on the same day and reloading never rerolls it.
//
// Achievements: tiered goals that pay cash once per tier.
// ============================================================================
import type { GameState } from './engine'

export type Seat = 'coo' | 'cfo' | 'cmo' | 'cto'
export type Skill = 'ops' | 'fin' | 'mkt' | 'tech'
export interface Exec { id: number; name: string; skills: Record<Skill, number> }

export const EXEC_LEVEL = 12
export const SEATS: Seat[] = ['coo', 'cfo', 'cmo', 'cto']
export const SEAT_SKILL: Record<Seat, Skill> = { coo: 'ops', cfo: 'fin', cmo: 'mkt', cto: 'tech' }
export const SEAT_LABEL: Record<Seat, string> = { coo: 'Operations chief', cfo: 'Finance chief', cmo: 'Marketing chief', cto: 'Technology chief' }

const FIRST = ['Ada', 'Bo', 'Cleo', 'Dev', 'Esme', 'Finn', 'Gia', 'Hal', 'Ivy', 'Jun', 'Kai', 'Lena', 'Milo', 'Nia', 'Oren', 'Pia', 'Quin', 'Rae', 'Sol', 'Tess']
const LAST = ['Arbor', 'Brook', 'Copperfield', 'Dale', 'Ember', 'Frost', 'Gale', 'Hollis', 'Ingram', 'Juniper', 'Kestrel', 'Lark', 'Marsh', 'North', 'Orchard', 'Pike']


/** Daily salary: $150 base + $40 per total skill point, growing faster at the
 *  top (tuned down so a first hire around level 12 is affordable). */
export const salary = (e: Exec) => { const t = Object.values(e.skills).reduce((a, b) => a + b, 0); return Math.round(150 + 40 * t + 0.8 * t * t) }
export const hireCost = (e: Exec) => salary(e) * 7
export const trainCost = (e: Exec, sk: Skill) => 4000 * (e.skills[sk] + 1)

/** Integer hash (xorshift-multiply mix); same input, same output. */
function hash(n: number) {
  let x = (n | 0) ^ 0x5bd1e995
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d)
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39)
  return (x ^ (x >>> 15)) >>> 0
}
/** Deterministic 0..1 stream for one day's candidate pool. */
function dayRng(day: number) {
  let k = 0
  return () => hash(day * 7919 + 101 * ++k) / 4294967296
}
/** Candidate ids live in their own range so they never clash with nextUid. */
export const candId = (day: number, i: number) => 1_000_000 + day * 8 + i

/**
 * The candidate pool for a given game day: four people, each with one strong
 * skill (that is the seat they suit best) and small side skills. Pure: the
 * same day always gives the same pool.
 */
export function candidatesFor(day: number): Exec[] {
  const r = dayRng(day), out: Exec[] = []
  for (let i = 0; i < 4; i++) {
    // Rotate the strong skill so each day has a good spread of roles.
    const main = (['ops', 'fin', 'mkt', 'tech'] as Skill[])[(i + Math.floor(r() * 4)) % 4]
    const sk = { ops: 0, fin: 0, mkt: 0, tech: 0 } as Record<Skill, number>
    for (const k of Object.keys(sk) as Skill[]) sk[k] = Math.floor(r() * 6)
    sk[main] += 4 + Math.floor(r() * 14)
    out.push({ id: candId(day, i), name: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`, skills: sk })
  }
  return out
}

/** Swap in today's pool (called at every midnight and for a new company).
 *  People already on your board are left out so nobody appears twice. */
export function newCandidates(s: GameState) {
  const hired = new Set(SEATS.map(x => s.execs?.[x]?.id))
  s.candidates = candidatesFor(Math.floor(s.hour / 24)).filter(c => !hired.has(c.id))
}

/** Best-fit seat for a candidate: the seat that uses their strongest skill. */
export function bestSeat(e: Exec): Seat {
  return SEATS.reduce((a, b) => (e.skills[SEAT_SKILL[b]] > e.skills[SEAT_SKILL[a]] ? b : a))
}
/** Skill level 1-5 for a seat (shown as stars): every 4 points of the
 *  seat's skill is one level, so a 17+ specialist is a 5-star hire. */
export const skillLevel = (e: Exec, seat: Seat) => Math.max(1, Math.min(5, Math.ceil(e.skills[SEAT_SKILL[seat]] / 4)))

/** Effective skill for a seat: seat holder full + 25% of the rest of the board. */
export function seatPower(s: GameState, seat: Seat) {
  const sk = SEAT_SKILL[seat]
  let v = 0
  for (const st of SEATS) { const e = s.execs?.[st]; if (e) v += e.skills[sk] * (st === seat ? 1 : 0.25) }
  return v
}
export const overheadCut = (s: GameState) => Math.min(0.6, seatPower(s, 'coo') / 100)
export const cashLineBonus = (s: GameState) => seatPower(s, 'cfo') * 200_000
export const retailBoost = (s: GameState) => 1 + seatPower(s, 'cmo') / 100
export const techBoost = (s: GameState) => 1 + seatPower(s, 'cto') / 100
/** Multiplier on Exchange fees (seller fee and broker fee): 2% off per CFO
 *  point, never below half. 1 = no CFO. */
export const feeMult = (s: GameState) => 1 - Math.min(0.5, seatPower(s, 'cfo') * 0.02)
export const boardSize = (s: GameState) => SEATS.filter(x => s.execs?.[x]).length
export const dailySalaries = (s: GameState) => SEATS.reduce((t, x) => t + (s.execs?.[x] ? salary(s.execs[x]!) : 0), 0)

/** Hourly salary bill of the whole board (daily total / 24). */
export const hourlySalaries = (s: GameState) => dailySalaries(s) / 24
/** Charge one game hour of salaries. Called once per whole hour by
 *  advanceTo, so offline catch-up pays exactly the hours that passed.
 *  Cash may dip below zero like other running costs; you can fire anyone. */
export function payHour(s: GameState) {
  const pay = hourlySalaries(s)
  if (pay > 0) s.cash -= pay
}

export function hire(s: GameState, id: number, seat: Seat, level: number): string | null {
  if (level < EXEC_LEVEL) return `Executives unlock at company level ${EXEC_LEVEL}`
  const e = s.candidates?.find(c => c.id === id)
  if (!e) return 'Candidate not found'
  if (s.execs?.[seat]) return 'Seat is taken; let the current person go first'
  if (s.cash < hireCost(e)) return 'Not enough cash for the signing bonus'
  s.cash -= hireCost(e)
  s.execs = { ...(s.execs ?? {}), [seat]: e }
  s.candidates = s.candidates!.filter(c => c !== e)
  return null
}
export function fire(s: GameState, seat: Seat): string | null {
  if (!s.execs?.[seat]) return 'Seat is empty'
  delete s.execs[seat]
  return null
}
export function train(s: GameState, seat: Seat): string | null {
  const e = s.execs?.[seat]
  if (!e) return 'Seat is empty'
  const sk = SEAT_SKILL[seat], c = trainCost(e, sk)
  if (e.skills[sk] >= 40) return 'Already at the top'
  if (s.cash < c) return 'Not enough cash'
  s.cash -= c; e.skills[sk]++
  return null
}

// ----------------------------------------------------------------------------
// Achievements
// ----------------------------------------------------------------------------
export interface Stats { built: number; retailRev: number; exRev: number; exSpend: number; bondsRaised: number; govDone: number; scrappedMines: number }
export const emptyStats = (): Stats => ({ built: 0, retailRev: 0, exRev: 0, exSpend: 0, bondsRaised: 0, govDone: 0, scrappedMines: 0 })

interface AchDef { id: string; name: string; what: string; tiers: [number, number][]; value: (s: GameState) => number }
const fmt = (n: number) => (n >= 1e6 ? `$${n / 1e6}M` : n >= 1000 ? `$${n / 1000}k` : `$${n}`)

export const ACHIEVEMENTS: AchDef[] = [
  { id: 'founder', name: 'Founder', what: 'Construct buildings', tiers: [[3, 3000], [8, 8000], [16, 20000]], value: s => s.stats.built },
  { id: 'payroll', name: 'Payroll', what: 'Workers employed (100 per building level)', tiers: [[500, 3000], [1000, 8000], [2500, 25000], [5000, 60000]], value: s => s.plots.reduce((t, b) => t + (b ? b.level * 100 : 0), 0) },
  { id: 'shopkeeper', name: 'Shopkeeper', what: 'Shop revenue', tiers: [[1000, 500], [25000, 4000], [250000, 30000], [2_500_000, 150000]], value: s => s.stats.retailRev },
  { id: 'dealer', name: 'Dealer', what: 'Exchange sales', tiers: [[1000, 600], [20000, 4000], [200000, 20000], [1_000_000, 60000]], value: s => s.stats.exRev },
  { id: 'shopper', name: 'Bulk buyer', what: 'Spent on the exchange', tiers: [[2000, 500], [20000, 3000], [150000, 15000]], value: s => s.stats.exSpend },
  { id: 'tower', name: 'Tall order', what: 'Highest building level', tiers: [[4, 40000], [8, 120000], [12, 300000], [18, 700000]], value: s => Math.max(0, ...s.plots.map(b => b?.level ?? 0)) },
  { id: 'inventor', name: 'Inventor', what: 'Best researched quality', tiers: [[1, 6000], [2, 30000], [3, 300000], [4, 1_000_000], [6, 3_000_000]], value: s => Math.max(0, ...Object.values(s.patents).map(p => qFromPatents(p))) },
  { id: 'board', name: 'Boardroom', what: 'Executives hired at once', tiers: [[1, 10000], [2, 25000], [4, 80000]], value: s => boardSize(s) },
  { id: 'borrower', name: 'Leveraged', what: 'Raised from bonds', tiers: [[25000, 4000], [150000, 18000], [500000, 70000]], value: s => s.stats.bondsRaised },
  { id: 'civic', name: 'Civic supplier', what: 'Government orders completed', tiers: [[1, 150000], [3, 400000], [6, 900000]], value: s => s.stats.govDone },
  { id: 'prospector', name: 'Prospector', what: 'Extraction sites scrapped', tiers: [[5, 4000], [25, 20000], [80, 60000]], value: s => s.stats.scrappedMines },
]
export const tierText = (t: [number, number], id: string) => `${['shopkeeper', 'dealer', 'shopper', 'borrower'].includes(id) ? fmt(t[0]) : t[0]} → ${fmt(t[1])}`

/** Late-bound so research.ts doesn't import this file. */
let qFromPatents: (p: number) => number = () => 0
export const setQualityFn = (f: (p: number) => number) => { qFromPatents = f }

/** Pay out every newly reached tier. Returns messages for the event log. */
export function checkAchievements(s: GameState): string[] {
  const out: string[] = []
  s.ach = s.ach ?? {}
  for (const a of ACHIEVEMENTS) {
    const v = a.value(s)
    let got = s.ach[a.id] ?? 0
    while (got < a.tiers.length && v >= a.tiers[got][0]) {
      s.cash += a.tiers[got][1]
      out.push(`Achievement: ${a.name} ${'★'.repeat(got + 1)} (+${fmt(a.tiers[got][1])})`)
      got++
    }
    s.ach[a.id] = got
  }
  return out
}
