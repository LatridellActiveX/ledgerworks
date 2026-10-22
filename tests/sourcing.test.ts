// Sourcing value: what a run's inputs cost, and the unit cost with wages.
import { describe, it, expect } from 'vitest'
import * as E from '../src/game/engine'

describe('sourcing value on production runs', () => {
  it('records the input cost and wages, and their per-unit split', () => {
    const s = E.newGame('Src', 0)
    E.construct(s, 0, 'orchard')
    E.advanceTo(s, s.hour + 10)
    E.addStock(s, 'seeds', 0, 500)
    E.addStock(s, 'water', 0, 500)
    s.cash = 1e9
    s.plots[0]!.soil = 1
    expect(E.startMake(s, 0, 'apples', 80)).toBeNull()
    const j = s.plots[0]!.job as Extract<E.Job, { kind: 'make' }>
    expect(j.src).toBeGreaterThan(0)
    expect(j.wg).toBeGreaterThan(0)
    // Unit cost = (sourcing value + wages) / units, as the average-cost maths uses it.
    expect(j.uc!).toBeCloseTo((j.src! + j.wg!) / 80, 6)
  })
})
