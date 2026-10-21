// Selling surplus power straight to the grid.
import { describe, it, expect } from 'vitest'
import * as E from '../src/game/engine'
import * as M from '../src/game/market'

describe('sell power to the grid', () => {
  it('pays the grid rate for the power, with no crates needed', () => {
    const s = E.newGame('Grid', 0)
    E.addStock(s, 'power', 0, 100)
    const before = s.cash
    expect(M.sellPower(s, 0, 40)).toBeNull()
    expect(s.stock['power|0']).toBe(60)
    expect(s.cash - before).toBeCloseTo(40 * M.refPrice(s, 'power') * M.GRID_RATE, 6)
  })
  it('cannot sell more power than is in the warehouse', () => {
    const s = E.newGame('Grid', 0)
    E.addStock(s, 'power', 0, 10)
    expect(M.sellPower(s, 0, 11)).toContain('Not enough')
    expect(M.sellPower(s, 0, 0)).toContain('whole amount')
  })
})
