// ============================================================================
// Research & patents.
//
//  - Every good belongs to a research field (farm, food, textile, energy,
//    build, tech). Labs make "notes" for each field.
//  - Spend notes on one product: each note is a dice roll with a 1-in-7
//    chance (boosted by a CTO, stage 9) of becoming a patent for it.
//  - Patents on a product unlock its quality levels (cumulative table below).
//  - Quality rule: you always make the best quality you can, which is the
//    product's researched quality, but never more than the lowest-quality
//    input + 1. So high quality needs high-quality supply chains.
//  - Research unlocks at company level 6.
// ============================================================================
import { RES } from './data'
import { EXTRA_FIELD } from './data-expansion'
import { rand } from './rng'
import type { GameState } from './engine'

export type Field = 'farm' | 'food' | 'textile' | 'energy' | 'build' | 'tech'
export const RESEARCH_LEVEL = 6
export const PATENT_CHANCE = 1 / 7

const GROUPS: Record<Field, string[]> = {
  farm: ['seeds', 'wheat', 'apples', 'berries', 'greens', 'cotton', 'feed', 'hens', 'eggs', 'milk', 'hide', 'timber'],
  food: ['flour', 'bread', 'cheese', 'juice', 'jam'],
  textile: ['cloth', 'tshirt', 'jacket', 'boots'],
  energy: ['power', 'water', 'crude', 'fuel', 'resin', 'crates'],
  build: ['sand', 'clay', 'boards', 'tiles', 'cement', 'glass'],
  tech: ['ore', 'metal', 'silica', 'chip', 'cell', 'phone', 'lamp', 'speaker'],
}
// Stage 12: expansion goods carry their own field.
for (const [id, f] of Object.entries(EXTRA_FIELD)) GROUPS[f].push(id)
/** Which field a good is researched in (undefined for the notes themselves). */
export const fieldOf = (res: string) => (Object.keys(GROUPS) as Field[]).find(f => GROUPS[f].includes(res))
export const notesFor = (f: Field) => `rn_${f}`
export const researchable = (res: string) => !!fieldOf(res)
export const FIELDS = Object.keys(GROUPS) as Field[]
export const FIELD_GOODS = GROUPS

/** Patents needed to REACH each quality (cumulative). Index = quality. */
export const PATENTS_FOR_Q: number[] = (() => {
  const step = [0, 10, 40, 400, 1600, 4000, 8000, 8000, 8000, 8000, 8000, 40000, 40000]
  let t = 0
  return step.map(x => (t += x))
})()

/** Researched quality for a product, from its patent count. */
export function researchedQ(s: GameState, res: string) {
  const p = s.patents?.[res] ?? 0
  let q = 0
  while (q < 12 && p >= PATENTS_FOR_Q[q + 1]) q++
  return q
}

/**
 * Spend `n` notes of the product's field. Returns patents gained, or an
 * error string. `bonus` multiplies the patent chance (CTO).
 */
export function applyResearch(s: GameState, res: string, n: number, takeNotes: (id: string, n: number) => boolean, bonus = 1): number | string {
  const f = fieldOf(res)
  if (!f) return 'This good cannot be researched'
  if (!(n >= 1)) return 'Pick how many notes to use'
  if (!takeNotes(notesFor(f), Math.floor(n))) return `Not enough ${RES[notesFor(f)].name}`
  let got = 0
  for (let i = 0; i < Math.floor(n); i++) {
    const [r, next] = rand(s.seed); s.seed = next
    if (r < PATENT_CHANCE * bonus) got++
  }
  s.patents = s.patents ?? {}
  s.patents[res] = (s.patents[res] ?? 0) + got
  return got
}

/** Quality reached for a raw patent count (used by achievements). */
export function qFromPatents(p: number) { let q = 0; while (q < 12 && p >= PATENTS_FOR_Q[q + 1]) q++; return q }
