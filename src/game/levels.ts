// ============================================================================
// Company levels: progress, the XP curve, what each level unlocks, and how XP
// is earned. Everything here reads the same constants the engine uses, so the
// level screen cannot drift from the real rules.
// ============================================================================
import * as E from './engine'
import { BUILDINGS } from './data'
import { RESEARCH_LEVEL } from './research'
import { BOND_LEVEL, GOV_LEVEL } from './finance'
import { EXEC_LEVEL } from './execs'

/** Level at which the credit-rating bonus starts (see finance.ts myRating). */
export const RATING_LEVEL = 12

export interface LevelInfo {
  level: number
  xp: number
  into: number     // XP earned toward the next level
  span: number     // XP between this level and the next
  pct: number      // 0 to 100
  next: number     // XP still needed for the next level
  plots: number    // building plots at this level
  nextPlots: number
}

export function levelInfo(xp: number): LevelInfo {
  const level = E.companyLevel(xp)
  const lo = E.xpForLevel(level), hi = E.xpForLevel(level + 1)
  const span = hi - lo, into = xp - lo
  return {
    level, xp, into, span,
    pct: Math.max(0, Math.min(100, (100 * into) / span)),
    next: Math.max(0, hi - xp),
    plots: E.plotCount(level),
    nextPlots: E.plotCount(level + 1),
  }
}

export interface Milestone {
  level: number
  xpTotal: number          // total XP needed to reach this level
  xpStep: number           // XP from the previous level
  plots: number
  unlocks: string[]
}

/** Every level from 1 up to maxLevel, with the unlocks that arrive at it. */
export function milestones(maxLevel = GOV_LEVEL + 1): Milestone[] {
  const out: Milestone[] = []
  for (let l = 1; l <= maxLevel; l++) {
    const unlocks: string[] = []
    for (const b of BUILDINGS) {
      if (b.unlockLevel === l) unlocks.push(`${b.kind === 'retail' ? 'Shop' : 'Building'}: ${b.name}`)
    }
    if (l === RESEARCH_LEVEL) unlocks.push('Research and the tech tree')
    if (l === BOND_LEVEL) unlocks.push('Bonds')
    if (l === RATING_LEVEL) unlocks.push('Better credit rating')
    if (l === EXEC_LEVEL) unlocks.push('Executives')
    if (l === GOV_LEVEL) unlocks.push('Government orders')
    out.push({
      level: l,
      xpTotal: E.xpForLevel(l),
      xpStep: l > 1 ? E.xpForLevel(l) - E.xpForLevel(l - 1) : 0,
      plots: E.plotCount(l),
      unlocks,
    })
  }
  return out
}

/** The next level above `level` that unlocks something, or null. */
export function nextUnlock(level: number, all = milestones()): Milestone | null {
  return all.find(m => m.level > level && m.unlocks.length > 0) ?? null
}

/** How XP is earned. Rates are the divisors used in engine.ts and routes.ts. */
export const XP_SOURCES: { title: string; rate: string; detail: string }[] = [
  { title: 'Building', rate: '1 XP per $200', detail: 'Every new building adds its cost ÷ 200.' },
  { title: 'Upgrading', rate: '1 XP per $200', detail: 'Each upgrade adds its cost ÷ 200.' },
  { title: 'Production', rate: '1 XP per $50 of wages', detail: 'Each finished run adds the wages it paid ÷ 50, so busy factories level you fastest.' },
  { title: 'Retail sales', rate: '1 XP per $50 sold', detail: 'Every sale in a shop adds its revenue ÷ 50.' },
  { title: 'Trade routes', rate: '1 XP per $100 earned', detail: 'Each completed route trip adds its revenue ÷ 100.' },
]
