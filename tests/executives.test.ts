// Executives: bonuses, fees, hourly salaries and the daily candidate pool.
import { describe, it, expect } from 'vitest'
import * as E from '../src/game/engine'
import * as X from '../src/game/execs'
import * as M from '../src/game/market'

const exec = (id: number, skills: Partial<Record<X.Skill, number>>): X.Exec =>
  ({ id, name: 'Test Person', skills: { ops: 0, fin: 0, mkt: 0, tech: 0, ...skills } })

describe('executives', () => {
  it('has no bonus and no salary with an empty board', () => {
    const s = E.newGame('T', 0)
    expect(X.feeMult(s)).toBe(1)
    expect(X.overheadCut(s)).toBe(0)
    expect(X.retailBoost(s)).toBe(1)
    expect(X.techBoost(s)).toBe(1)
    expect(X.hourlySalaries(s)).toBe(0)
    expect(M.feeRate(s)).toBeCloseTo(M.FEE)
  })

  it('CFO cuts Exchange fees by 2% per point, at most half', () => {
    const s = E.newGame('T', 0)
    s.execs = { cfo: exec(1, { fin: 10 }) }
    expect(X.feeMult(s)).toBeCloseTo(0.8)
    expect(M.feeRate(s)).toBeCloseTo(0.024)
    s.execs = { cfo: exec(1, { fin: 40 }) }
    expect(X.feeMult(s)).toBeCloseTo(0.5)
  })

  it('COO, CMO and CTO scale with their skill; other seats lend a quarter', () => {
    const s = E.newGame('T', 0)
    s.execs = { coo: exec(1, { ops: 12 }), cmo: exec(2, { mkt: 20, ops: 4 }), cto: exec(3, { tech: 8 }) }
    expect(X.overheadCut(s)).toBeCloseTo(0.13) // 12 + 4/4
    expect(X.retailBoost(s)).toBeCloseTo(1.2)
    expect(X.techBoost(s)).toBeCloseTo(1.08)
  })

  it('charges salary every game hour, including offline catch-up', () => {
    const s = E.newGame('T', 0)
    const e = exec(1, { ops: 10 })
    s.execs = { coo: e }
    s.ach = { ...s.ach, board: 9 } // skip the one-off Boardroom achievement payout
    s.cash = 1_000_000
    const start = s.hour
    // Compare against an identical game without an executive, so all other
    // running costs cancel out.
    const ref = E.newGame('T', 0); ref.cash = 1_000_000
    E.advanceTo(s, start + 10); E.advanceTo(ref, start + 10)
    expect(ref.cash - s.cash).toBeCloseTo((X.salary(e) / 24) * 10, 0)
  })

  it('daily candidate pool is deterministic and changes by day', () => {
    const a = X.candidatesFor(5), b = X.candidatesFor(5), c = X.candidatesFor(6)
    expect(a).toEqual(b)
    expect(a).toHaveLength(4)
    expect(a.map(x => x.name).join()).not.toEqual(c.map(x => x.name).join())
    for (const x of a) expect(X.skillLevel(x, X.bestSeat(x))).toBeGreaterThanOrEqual(1)
  })

  it('hire takes the signing bonus, fills the seat and removes the candidate', () => {
    const s = E.newGame('T', 0)
    s.cash = 1_000_000
    const c = s.candidates[0]
    expect(X.hire(s, c.id, 'cfo', X.EXEC_LEVEL)).toBeNull()
    expect(s.execs.cfo?.id).toBe(c.id)
    expect(s.cash).toBe(1_000_000 - X.hireCost(c))
    expect(s.candidates.find(x => x.id === c.id)).toBeUndefined()
    expect(X.hire(s, s.candidates[0].id, 'cfo', X.EXEC_LEVEL)).toMatch(/taken/)
    expect(X.fire(s, 'cfo')).toBeNull()
    expect(s.execs.cfo).toBeUndefined()
  })

  it('old saves without execs still work', () => {
    const s = E.newGame('T', 0) as any
    delete s.execs
    expect(X.feeMult(s)).toBe(1)
    expect(X.hourlySalaries(s)).toBe(0)
  })
})
