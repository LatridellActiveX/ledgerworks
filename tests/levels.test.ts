// Company level details (game/levels.ts): the XP curve, unlocks and progress.
import { describe, it, expect } from 'vitest'
import { levelInfo, milestones, nextUnlock, RATING_LEVEL } from '../src/game/levels'
import { xpForLevel } from '../src/game/engine'
import { RESEARCH_LEVEL } from '../src/game/research'
import { BOND_LEVEL, GOV_LEVEL } from '../src/game/finance'
import { EXEC_LEVEL } from '../src/game/execs'

describe('company level details', () => {
  it('progress stays between 0 and 100 and matches the XP curve', () => {
    for (const xp of [0, 1, 50, xpForLevel(3), xpForLevel(3) + 10, 1e9]) {
      const info = levelInfo(xp)
      expect(info.pct).toBeGreaterThanOrEqual(0)
      expect(info.pct).toBeLessThanOrEqual(100)
      expect(info.next).toBeGreaterThanOrEqual(0)
    }
    const start = levelInfo(xpForLevel(3))
    expect(start.level).toBe(3)
    expect(start.pct).toBeCloseTo(0, 6)
  })

  it('lists every level in order with total XP rising', () => {
    const all = milestones()
    expect(all[0].level).toBe(1)
    for (let i = 1; i < all.length; i++) {
      expect(all[i].level).toBe(all[i - 1].level + 1)
      expect(all[i].xpTotal).toBeGreaterThan(all[i - 1].xpTotal)
    }
  })

  it('places the feature unlocks at their levels', () => {
    const at = (l: number) => milestones().find(m => m.level === l)!.unlocks.join(' | ')
    expect(at(RESEARCH_LEVEL)).toContain('Research')
    expect(at(BOND_LEVEL)).toContain('Bonds')
    expect(at(RATING_LEVEL)).toContain('credit rating')
    expect(at(EXEC_LEVEL)).toContain('Executives')
    expect(at(GOV_LEVEL)).toContain('Government')
  })

  it('finds the next level that unlocks something', () => {
    const n = nextUnlock(1)
    expect(n).not.toBeNull()
    expect(n!.level).toBeGreaterThan(1)
    expect(n!.unlocks.length).toBeGreaterThan(0)
  })

  it('plots never shrink as the level rises', () => {
    const all = milestones()
    for (let i = 1; i < all.length; i++) expect(all[i].plots).toBeGreaterThanOrEqual(all[i - 1].plots)
  })
})
