// ============================================================================
// Stage 10: bonds, government orders, and extraction abundance.
//
// Extraction (oil well, gravel pit): each new site rolls an "abundance" per
// good it can dig, from a bell curve (mean 65%, spread 14%, clamped 15-100%).
// Output speed is multiplied by it and it slowly runs out (0.04% a day).
// Scrap and rebuild to roll again.
//
// Bonds (level 8): you can borrow from NPC investors and lend to NPC firms.
//  - Your credit rating comes from assets vs debt. Investors only buy your
//    bonds if the daily rate you offer meets your rating's minimum. Bonds
//    sell in $5,000 lots, total debt is capped at half your assets, and you
//    can repay ("call") a bond after 14 days.
//  - Bonds you buy pay daily interest, cannot be resold, may be repaid by
//    the issuer after 14 days, and can default (riskier ratings more often),
//    returning only a recovery share.
//  - Interest is settled at each midnight.
//
// Government orders (level 14): a big order arrives every game week. Accept
// it by putting down a 10% deposit, deliver goods of at least the asked
// quality before the deadline (each delivery is paid at once), and get the
// deposit back when everything is in. Miss the deadline: lose the deposit.
// ============================================================================
import { BLD, RES, RESOURCES } from './data'
import { rand } from './rng'
import { addStock, companyLevel, parseKey, key, type GameState, type Building } from './engine'

function rnd(s: GameState) { const [r, n] = rand(s.seed); s.seed = n; return r }

// ---------------------------------------------------------------- abundance
export const EXTRACTORS = ['well', 'pit']
export const isExtractor = (type: string) => EXTRACTORS.includes(type)
/** Roll abundance for every good a new extraction site can dig. */
export function rollAbundance(s: GameState, bd: Building) {
  if (!isExtractor(bd.type)) return
  bd.abund = {}
  for (const r of BLD[bd.type].recipes ?? []) {
    // Box-Muller normal draw from two seeded uniforms.
    const u = Math.max(1e-9, rnd(s)), v = rnd(s)
    const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    bd.abund[r] = Math.min(1, Math.max(0.15, 0.65 + 0.14 * g))
  }
}
/** Daily depletion of every extraction site. */
export function depleteAll(s: GameState) {
  for (const bd of s.plots) if (bd?.abund) for (const k of Object.keys(bd.abund)) bd.abund[k] = Math.max(0.15, bd.abund[k] * (1 - 0.0004))
}

// -------------------------------------------------------------------- bonds
export const BOND_LEVEL = 8
export const BOND_LOT = 5000
export const CALL_AFTER_H = 24 * 14
export const RATINGS = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'C'] as const
export type Rating = (typeof RATINGS)[number]
/** Minimum daily rate investors want, per rating. */
export const MIN_RATE: Record<Rating, number> = { AAA: 0.004, AA: 0.006, A: 0.008, BBB: 0.01, BB: 0.014, B: 0.018, C: 0.024 }
/** Daily default chance and recovery share for bonds you hold. */
export const DEFAULT_RISK: Record<Rating, [number, number]> = { AAA: [0.0003, 0.55], AA: [0.0006, 0.5], A: [0.001, 0.42], BBB: [0.002, 0.3], BB: [0.004, 0.18], B: [0.008, 0.08], C: [0.015, 0.05] }

export interface Bond { id: number; amount: number; rate: number; soldH: number }
export interface Holding { id: number; issuer: string; rating: Rating; amount: number; rate: number; boughtH: number }

/** Value of all buildings at construction cost. */
export const buildingValue = (s: GameState) => s.plots.reduce((t, b) => t + (b ? BLD[b.type].cost * (b.level * (b.level + 1)) / 2 : 0), 0)
export const debt = (s: GameState) => (s.bonds ?? []).reduce((t, b) => t + b.amount, 0)
export const heldValue = (s: GameState) => (s.holdings ?? []).reduce((t, b) => t + b.amount, 0)

/** Your rating from assets ÷ debt, held back a notch for young companies. */
export function myRating(s: GameState): Rating {
  const assets = buildingValue(s) + Math.max(0, s.cash) + heldValue(s), d = debt(s)
  const cover = d ? assets / d : 99
  let i = cover > 12 ? 0 : cover > 8 ? 1 : cover > 5 ? 2 : cover > 3.5 ? 3 : cover > 2.5 ? 4 : cover > 2 ? 5 : 6
  if (companyLevel(s.xp) < 12) i = Math.min(6, i + 1)
  return RATINGS[i]
}
export const debtLimit = (s: GameState) => Math.floor((buildingValue(s) + Math.max(0, s.cash)) / 2 / BOND_LOT) * BOND_LOT

export function issueBond(s: GameState, lots: number, rate: number): string | null {
  if (companyLevel(s.xp) < BOND_LEVEL) return `Bonds unlock at company level ${BOND_LEVEL}`
  const amount = Math.floor(lots) * BOND_LOT
  if (amount <= 0) return 'Pick how many $5,000 lots'
  if (rate < 0.004 || rate > 0.025) return 'Rate must be 0.4% to 2.5% a day'
  if (debt(s) + amount > debtLimit(s)) return `Investors cap your debt at ${debtLimit(s).toLocaleString()}`
  const need = MIN_RATE[myRating(s)]
  if (rate < need) return `At rating ${myRating(s)} investors want at least ${(need * 100).toFixed(1)}% a day`
  s.bonds = [...(s.bonds ?? []), { id: s.nextUid++, amount, rate, soldH: s.hour }]
  s.cash += amount
  s.stats.bondsRaised += amount
  return null
}
export function callBond(s: GameState, id: number): string | null {
  const b = s.bonds?.find(x => x.id === id)
  if (!b) return 'Bond not found'
  if (s.hour - b.soldH < CALL_AFTER_H) return 'Bonds can be repaid 14 days after sale'
  if (s.cash < b.amount) return 'Not enough cash to repay'
  s.cash -= b.amount
  s.bonds = s.bonds!.filter(x => x !== b)
  return null
}

const FIRMS = ['Pebble & Pine', 'Northgate Mills', 'Saltmarsh Foods', 'Copperleaf Ltd', 'Bluefin Freight', 'Harbor Kiln Co', 'Quillstone', 'Larkspur Textiles', 'Ironbark Works', 'Meadowlight']
/** Weekly list of NPC bonds you can buy. */
export function newBondOffers(s: GameState) {
  s.bondOffers = Array.from({ length: 4 }, () => {
    const rating = RATINGS[Math.min(6, Math.floor(rnd(s) * rnd(s) * 7 + rnd(s) * 1.5))]
    return { id: s.nextUid++, issuer: FIRMS[Math.floor(rnd(s) * FIRMS.length)], rating, amount: BOND_LOT * (2 + Math.floor(rnd(s) * 10)), rate: Math.round((MIN_RATE[rating] + rnd(s) * 0.002) * 10000) / 10000, boughtH: 0 }
  })
}
export function buyBond(s: GameState, id: number): string | null {
  if (companyLevel(s.xp) < BOND_LEVEL) return `Bonds unlock at company level ${BOND_LEVEL}`
  const o = s.bondOffers?.find(x => x.id === id)
  if (!o) return 'Offer gone'
  if (s.cash < o.amount) return 'Not enough cash'
  s.cash -= o.amount
  s.holdings = [...(s.holdings ?? []), { ...o, boughtH: s.hour }]
  s.bondOffers = s.bondOffers!.filter(x => x !== o)
  return null
}

/** Midnight: pay/receive interest, defaults and early repayments. */
export function bondDay(s: GameState, say: (m: string) => void) {
  const owe = (s.bonds ?? []).reduce((t, b) => t + b.amount * b.rate, 0)
  if (owe) { s.cash -= owe; say(`Bond interest paid: $${Math.round(owe).toLocaleString()}.`) }
  let got = 0
  for (const h of [...(s.holdings ?? [])]) {
    const [risk, rec] = DEFAULT_RISK[h.rating]
    if (rnd(s) < risk) {
      s.cash += h.amount * rec; say(`${h.issuer} defaulted; you recovered ${Math.round(rec * 100)}%.`)
      s.holdings = s.holdings!.filter(x => x !== h); continue
    }
    got += h.amount * h.rate
    if (s.hour - h.boughtH >= CALL_AFTER_H && rnd(s) < 0.03) {
      s.cash += h.amount; say(`${h.issuer} repaid its bond.`)
      s.holdings = s.holdings!.filter(x => x !== h)
    }
  }
  if (got) s.cash += got
}

// --------------------------------------------------------- government orders
export const GOV_LEVEL = 14
export interface GovItem { res: string; q: number; qty: number; done: number; price: number }
export interface GovOrder { id: number; title: string; items: GovItem[]; deposit: number; status: 'offer' | 'active' | 'done' | 'failed'; offerUntilH: number; deadlineH: number }

const AGENCIES = ['City Schools', 'Harbor Authority', 'Parks Department', 'Relief Office', 'Rail Board', 'Public Library']
export const govValue = (g: GovOrder) => g.items.reduce((t, i) => t + i.qty * i.price, 0)

/** A new order sized to your company (sum of building levels). */
export function newGovOrder(s: GameState) {
  const size = Math.max(5, s.plots.reduce((t, b) => t + (b?.level ?? 0), 0))
  const goods = RESOURCES.filter(r => r.store)
  const n = 1 + Math.floor(rnd(s) * 2)
  const q = Math.min(3, Math.floor(companyLevel(s.xp) / 7))
  const items: GovItem[] = []
  for (let i = 0; i < n; i++) {
    const r = goods[Math.floor(rnd(s) * goods.length)]
    if (items.some(x => x.res === r.id)) continue
    const qty = Math.max(10, Math.round(((size * 400) / r.basePrice) * (0.6 + rnd(s) * 0.6)))
    items.push({ res: r.id, q, qty, done: 0, price: Math.round(r.basePrice * 1.6 * (1 + 0.1 * q) * 100) / 100 })
  }
  const g: GovOrder = { id: s.nextUid++, title: `${AGENCIES[Math.floor(rnd(s) * AGENCIES.length)]} supply order`, items, deposit: 0, status: 'offer', offerUntilH: s.hour + 48, deadlineH: 0 }
  g.deposit = Math.round(govValue(g) * 0.1)
  s.gov = g
}
export function acceptGov(s: GameState): string | null {
  const g = s.gov
  if (companyLevel(s.xp) < GOV_LEVEL) return `Government orders unlock at company level ${GOV_LEVEL}`
  if (!g || g.status !== 'offer') return 'No open offer'
  if (s.cash < g.deposit) return 'Not enough cash for the deposit'
  s.cash -= g.deposit
  g.status = 'active'; g.deadlineH = s.hour + 24 * 6
  return null
}
/** Deliver as much of one item as you have at the needed quality or better. */
/** Deliver up to `amount` units (default: as many as fit). Amount must be a whole number >= 1. */
export function deliverGov(s: GameState, res: string, amount?: number): string | null {
  if (amount !== undefined && (!Number.isInteger(amount) || amount < 1)) return 'Pick a whole amount of at least 1'
  const g = s.gov
  if (!g || g.status !== 'active') return 'No active order'
  const it = g.items.find(i => i.res === res)
  if (!it) return 'Not part of this order'
  let need = Math.min(it.qty - it.done, amount ?? Infinity)
  const lots = Object.keys(s.stock).map(parseKey).filter(l => l.res === res && l.q >= it.q).sort((a, b) => a.q - b.q)
  let sent = 0
  for (const l of lots) { const t = Math.min(need, s.stock[key(l.res, l.q)]); addStock(s, l.res, l.q, -t); need -= t; sent += t; if (need <= 0) break }
  if (!sent) return `You have no ${RES[res].name} at Q${it.q} or better`
  it.done += sent
  s.cash += sent * it.price
  if (g.items.every(i => i.done >= i.qty)) { g.status = 'done'; s.cash += g.deposit; s.stats.govDone++ }
  return null
}
/** Midnight housekeeping for government orders. */
export function govDay(s: GameState, say: (m: string) => void) {
  const g = s.gov
  if (g?.status === 'offer' && s.hour > g.offerUntilH) s.gov = undefined
  if (g?.status === 'active' && s.hour > g.deadlineH) { g.status = 'failed'; say(`Government order missed: deposit of $${g.deposit.toLocaleString()} lost.`) }
  const day = Math.floor(s.hour / 24)
  if (companyLevel(s.xp) >= GOV_LEVEL && day % 7 === 2 && (!s.gov || s.gov.status === 'done' || s.gov.status === 'failed')) {
    newGovOrder(s); say(`New government order: ${s.gov!.title}.`)
  }
}
