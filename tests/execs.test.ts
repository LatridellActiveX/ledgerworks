// Executives' effects and achievement payouts.
import { describe, it, expect } from 'vitest'
import * as E from '../src/game/engine'
import * as X from '../src/game/execs'

const big = () => { const s = E.newGame('T', 0); s.xp = E.xpForLevel(12); s.cash = 1e7; return s }
const exec = (sk: Partial<Record<X.Skill, number>>): X.Exec => ({ id: 1, name: 'A', skills: { ops: 0, fin: 0, mkt: 0, tech: 0, ...sk } })

describe('executives', () => {
  it('hiring needs level 12 and charges a week of salary', () => {
    const s = big(), c = s.candidates[0], cash = s.cash
    expect(X.hire(s, c.id, 'coo', 5)).toMatch(/level 12/)
    expect(X.hire(s, c.id, 'coo', 12)).toBeNull()
    expect(cash - s.cash).toBe(X.salary(c) * 7)
  })
  it('seat effects, with a quarter from other board members', () => {
    const s = big()
    s.execs = { coo: exec({ ops: 20 }), cmo: exec({ ops: 8, mkt: 10 }), cto: exec({ tech: 15 }), cfo: exec({ fin: 5 }) }
    expect(X.overheadCut(s)).toBeCloseTo(0.22)
    expect(X.retailBoost(s)).toBeCloseTo(1.1)
    expect(E.patentBonus(s)).toBeCloseTo(1.15)
    expect(X.cashLineBonus(s)).toBe(1_000_000)
  })
  it('salaries are paid daily', () => {
    const s = big(); s.execs = { coo: exec({ ops: 10 }) }
    const cash = s.cash; E.advanceTo(s, 24)
    expect(cash - s.cash).toBeGreaterThanOrEqual(X.salary(s.execs.coo!))
  })
})

describe('achievements', () => {
  it('pays each tier once', () => {
    const s = E.newGame('T', 0)
    for (let i = 0; i < 3; i++) E.construct(s, i, 'pump')
    const cash = s.cash
    const msgs = X.checkAchievements(s)
    expect(msgs.some(m => m.includes('Founder'))).toBe(true)
    expect(s.cash - cash).toBe(3000)
    expect(X.checkAchievements(s).length).toBe(0)
  })
})
