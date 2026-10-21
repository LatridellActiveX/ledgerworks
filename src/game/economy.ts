// ============================================================================
// Company-wide costs and the economy cycle (shared by the game and the
// server's market object).
//
// Admin overhead: the bigger your company (total building levels), the more
// managers you need. Every wage bill is raised by this percentage.
//   overhead% = 0.55 × (total building levels − 1)
//
// Accounting fee: holding lots of cash costs bookkeeping, charged daily on
// the cash above $2.5M. Rate grows 0.4% per extra $2.5M, capped at 2.4%.
//
// Economy phases: recession ↔ normal ↔ boom. Once a game week (day 5 of
// each week) the phase may move one step. Booms sell faster in shops but
// slow factories; recessions the reverse. Fancier industries swing more.
// ============================================================================
import { BLD, RES } from './data'

export type Phase = 'recession' | 'normal' | 'boom'

/** Admin overhead as a fraction (0.11 = 11%) for a list of building levels. */
export function adminOverhead(levels: number[]) {
  const total = levels.reduce((a, b) => a + b, 0)
  return Math.max(0, total - 1) * 0.0055
}

export const ACCOUNTING_FREE = 2_500_000
/** Daily accounting rate for a cash balance. */
export function accountingRate(cash: number) {
  if (cash <= ACCOUNTING_FREE) return 0
  const steps = Math.ceil((cash - ACCOUNTING_FREE) / ACCOUNTING_FREE)
  return Math.min(0.024, steps * 0.004)
}
export const accountingFee = (cash: number) => Math.round(accountingRate(cash) * Math.max(0, cash - ACCOUNTING_FREE))

/** Production speed multiplier for a building type in a phase. */
export function productionMult(type: string, phase: Phase = 'normal') {
  if (phase === 'normal') return 1
  const swing = 0.01 + 0.006 * BLD[type].unlockLevel // 1.6% for starter buildings, ~5.8% for gadgets
  return phase === 'boom' ? 1 - swing : 1 + swing
}
/** Shop selling speed multiplier in a phase. */
export const retailMult = (phase: Phase = 'normal') => (phase === 'boom' ? 1.12 : phase === 'recession' ? 0.88 : 1)
/** Where NPC reference prices drift to, relative to the base price. */
export const priceTrend = (phase: Phase = 'normal') => (phase === 'boom' ? 1.05 : phase === 'recession' ? 0.95 : 1)

/** Weekly phase roll: one step at most. `r` is a random number in [0,1). */
export function nextPhase(p: Phase, r: number): Phase {
  if (p === 'normal') return r < 0.25 ? 'boom' : r < 0.5 ? 'recession' : 'normal'
  return r < 0.35 ? 'normal' : p
}
/** True on the game day when the weekly roll happens (day 5, 12, 19, ...). */
export const isPhaseDay = (day: number) => day % 7 === 4

export const PHASE_LABEL: Record<Phase, string> = { recession: 'Recession', normal: 'Steady', boom: 'Boom' }
void RES
