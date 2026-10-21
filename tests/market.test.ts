// Exchange tests: priority, fee, crates, cancel fee window, expiry, NPC fills.
import { describe, it, expect } from 'vitest'
import * as E from '../src/game/engine'
import * as M from '../src/game/market'

const fresh = () => { const s = E.newGame('T', 0); s.cash = 1e6; return s }

describe('exchange', () => {
  it('book order: price low first, then quality high, then oldest', () => {
    const s = fresh(); s.asks = []
    const mk = (id: number, price: number, q: number, h: number) => s.asks.push({ id, owner: 'npc', res: 'apples', q, qty: 1, price, placedH: h, crates: 0 })
    mk(1, 2, 0, 0); mk(2, 1.5, 0, 5); mk(3, 1.5, 1, 9); mk(4, 1.5, 1, 1)
    expect(M.book(s, 'apples').map(o => o.id)).toEqual([4, 3, 2, 1])
  })
  it('buying takes cheapest first and keeps quality', () => {
    const s = fresh(), cash = s.cash
    const quote = M.quoteBuy(s, 'seeds', 10)
    expect(M.buy(s, 'seeds', 10)).toBeNull()
    expect(cash - s.cash).toBeCloseTo(quote)
    expect(E.haveQty(s, 'seeds')).toBe(10)
  })
  it('listing needs crates; fills pay minus 3% fee and use crates', () => {
    const s = fresh(); s.asks = []
    E.addStock(s, 'apples', 0, 100)
    expect(M.placeAsk(s, 'apples', 0, 100, 1)).toMatch(/crates/)
    E.addStock(s, 'crates', 0, 100)
    const cash = s.cash
    expect(M.placeAsk(s, 'apples', 0, 100, 0.5)).toBeNull() // cheap -> NPCs buy
    expect(E.haveQty(s, 'crates')).toBe(0)
    E.advanceTo(s, s.hour + 23.5)
    const sold = 100 - (s.asks.find(o => o.owner === 'me')?.qty ?? 0)
    expect(sold).toBeGreaterThan(0)
    expect(s.cash - cash).toBeCloseTo(sold * 0.5 * 0.97, 5)
  })
  it('cancel costs the fee inside 48h, free after, and returns goods + crates', () => {
    const s = fresh(); s.asks = []
    E.addStock(s, 'apples', 0, 10); E.addStock(s, 'crates', 0, 20)
    M.placeAsk(s, 'apples', 0, 10, 4.5) // too pricey to fill
    const id = s.asks[0].id, cash = s.cash
    M.cancelAsk(s, id)
    expect(cash - s.cash).toBeCloseTo(10 * 4.5 * 0.03)
    expect(E.haveQty(s, 'apples')).toBe(10); expect(E.haveQty(s, 'crates')).toBe(20)
    M.placeAsk(s, 'apples', 0, 10, 4.5); s.hour += 49
    const c2 = s.cash; M.cancelAsk(s, s.asks.find(o => o.owner === 'me')!.id)
    expect(s.cash).toBe(c2)
  })
  it('orders expire after 7 days', () => {
    const s = fresh()
    E.addStock(s, 'apples', 0, 10); E.addStock(s, 'crates', 0, 10)
    M.placeAsk(s, 'apples', 0, 10, 4.5)
    E.advanceTo(s, s.hour + 24 * 7 + 1)
    expect(s.asks.some(o => o.owner === 'me')).toBe(false)
    expect(E.haveQty(s, 'apples')).toBe(10)
  })
})

describe('online mode', () => {
  it('does not random-walk prices locally when the server owns them', () => {
    const s = fresh(); s.online = true; s.ref = { apples: 2 }
    M.marketDay(s)
    expect(s.ref.apples).toBe(2)
  })
})
