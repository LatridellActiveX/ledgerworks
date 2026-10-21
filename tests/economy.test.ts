// Admin overhead, accounting fee and economy phase rules.
import { describe, it, expect } from 'vitest'
import * as X from '../src/game/economy'
import * as E from '../src/game/engine'

describe('economy', () => {
  it('overhead grows 0.55% per building level after the first', () => {
    expect(X.adminOverhead([1])).toBe(0)
    expect(X.adminOverhead([5, 5, 1])).toBeCloseTo(0.055)
  })
  it('overhead raises wages', () => {
    const s = E.newGame('T', 0)
    E.construct(s, 0, 'generator'); E.construct(s, 1, 'pump'); E.construct(s, 2, 'orchard')
    expect(E.makeWages('generator', 1, 10, s)).toBeCloseTo(400 * 1.011)
  })
  it('accounting fee only above $2.5M, capped', () => {
    expect(X.accountingFee(2_000_000)).toBe(0)
    expect(X.accountingFee(3_000_000)).toBe(Math.round(0.004 * 500_000))
    expect(X.accountingRate(1e9)).toBe(0.024)
  })
  it('phases move at most one step', () => {
    for (let r = 0; r < 1; r += 0.05) {
      expect(X.nextPhase('boom', r)).not.toBe('recession')
      expect(X.nextPhase('recession', r)).not.toBe('boom')
    }
  })
  it('boom: shops faster, factories slower; complex buildings swing more', () => {
    expect(X.retailMult('boom')).toBeGreaterThan(1)
    expect(X.productionMult('orchard', 'boom')).toBeLessThan(1)
    expect(1 - X.productionMult('assembly', 'boom')).toBeGreaterThan(1 - X.productionMult('orchard', 'boom'))
    expect(X.productionMult('orchard', 'recession')).toBeGreaterThan(1)
  })
  it('offline game rolls the phase on its own over time', () => {
    const s = E.newGame('T', 0)
    const seen = new Set<string>()
    for (let w = 0; w < 30; w++) { E.advanceTo(s, s.hour + 24 * 7); seen.add(s.phase ?? 'normal') }
    expect(seen.size).toBeGreaterThan(1)
  })
})
