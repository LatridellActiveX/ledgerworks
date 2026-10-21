// Buying missing crates in the same step as a sale (market.withCrates).
import { describe, it, expect } from 'vitest'
import * as E from '../src/game/engine'
import * as M from '../src/game/market'
import * as Q from '../src/game/qty'
const fresh = () => { const s = E.newGame('T', 0); M.restockNpc(s); s.cash = 1e6; s.stock = { 'apples|0': 500 }; return s }
describe('crates in one step', () => {
  it('reports the shortfall', () => { const s = fresh(); expect(M.crateShort(s, 'apples', 50)).toBe(M.cratesFor('apples', 50)) })
  it('buys the shortfall then lists', () => {
    const s = fresh(), need = M.cratesFor('apples', 50)
    expect(M.withCrates(s, 'apples', 50, () => M.placeAsk(s, 'apples', 0, 50, M.refPrice(s, 'apples')))).toBeNull()
    expect(s.asks.some(o => o.owner === 'me' && o.qty === 50 && o.crates === need)).toBe(true)
    expect(E.haveQty(s, 'crates')).toBe(0)
  })
  it('limit counts affordable crates when buying is allowed', () => {
    const s = fresh()
    expect(Q.maxList(s, 'apples', 0).max).toBe(0)
    expect(Q.maxList(s, 'apples', 0, true).max).toBeGreaterThan(0)
  })
  it('no shortfall when you have enough', () => { const s = fresh(); s.stock['crates|0'] = 1000; expect(M.crateShort(s, 'apples', 50)).toBe(0) })
})
