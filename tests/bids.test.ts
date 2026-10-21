// Standing buy orders: escrow, instant fill at the better price, broker fee,
// fills when the price crosses, cancel/expiry refunds, limits, value, sound.
import { describe, it, expect } from 'vitest'
import * as E from '../src/game/engine'
import * as M from '../src/game/market'
import * as B from '../src/game/bids'
import { valueBreakdown } from '../src/game/value'
import { tickSfx } from '../src/ui/sfxFor'

const fresh = () => { const s = E.newGame('T', 0); s.cash = 1e6; return s }
const ask = (s: E.GameState, price: number, qty: number, q = 0) => s.asks.push({ id: s.nextUid++, owner: 'npc', res: 'apples', q, qty, price, placedH: s.hour, crates: 0 })

describe('buy orders', () => {
  it('fills at once from cheaper asks and refunds the price difference, no fee', () => {
    const s = fresh(); s.asks = []; s.ref.apples = 1
    ask(s, 0.8, 50)
    const cash = s.cash
    expect(B.placeBid(s, 'apples', 0, 50, 0.9)).toBeNull()
    expect(E.haveQty(s, 'apples')).toBe(50)
    expect(cash - s.cash).toBeCloseTo(40) // paid 0.80, not 0.90
    expect(s.bids ?? []).toHaveLength(0)
  })
  it('the waiting part locks escrow and pays a 1% broker fee', () => {
    const s = fresh(); s.asks = []; s.ref.apples = 1
    ask(s, 0.8, 10)
    const cash = s.cash
    expect(B.placeBid(s, 'apples', 0, 100, 0.9)).toBeNull()
    const b = s.bids![0]
    expect(b.qty).toBe(90)
    expect(b.escrow).toBeCloseTo(81)
    expect(cash - s.cash).toBeCloseTo(8 + 81 + 0.81)
    expect(B.escrowTotal(s)).toBeCloseTo(81)
  })
  it('cancelling returns the escrow but not the fee', () => {
    const s = fresh(); s.asks = []; s.ref.apples = 1
    const cash = s.cash
    B.placeBid(s, 'apples', 0, 100, 0.9)
    expect(B.cancelBid(s, s.bids![0].id)).toBeNull()
    expect(cash - s.cash).toBeCloseTo(0.9)
    expect(s.bids).toHaveLength(0)
  })
  it('fills when an ask drops to the bid (price crosses)', () => {
    const s = fresh(); s.asks = []; s.ref.apples = 1
    B.placeBid(s, 'apples', 0, 20, 0.6)
    s.ref.apples = 0.9 // passing sellers want 0.83+, so only the cheap ask below can fill it
    ask(s, 0.5, 5)
    B.bidHour(s)
    expect(E.haveQty(s, 'apples')).toBe(5)
  })
  it('a bid far under the market never fills from passing sellers', () => {
    const s = fresh(); s.asks = []; s.ref.apples = 1
    B.placeBid(s, 'apples', 0, 20, 0.6)
    for (let i = 0; i < 48; i++) { s.asks = []; B.bidHour(s) }
    expect(E.haveQty(s, 'apples')).toBe(0)
  })
  it('a bid at the going price fills over a day of game time', () => {
    const s = fresh()
    const ref = M.refPrice(s, 'apples')
    s.asks = s.asks.filter(o => o.res !== 'apples')
    B.placeBid(s, 'apples', 0, 10, Math.round(ref * 100) / 100)
    for (let i = 0; i < 24 && s.bids!.length; i++) B.bidHour(s)
    expect(E.haveQty(s, 'apples')).toBe(10)
    expect(s.bids).toHaveLength(0)
  })
  it('expires after a week and refunds the escrow', () => {
    const s = fresh(); s.asks = []; s.ref.apples = 1
    B.placeBid(s, 'apples', 0, 10, 0.6)
    const cash = s.cash
    s.hour += M.EXPIRE_H; s.asks = []
    B.bidHour(s)
    expect(s.bids).toHaveLength(0)
    expect(s.cash - cash).toBeCloseTo(6)
  })
  it('rejects bad input and too many orders', () => {
    const s = fresh(); s.ref.apples = 1
    expect(B.placeBid(s, 'apples', 0, 0, 1)).toMatch(/whole/)
    expect(B.placeBid(s, 'apples', 0, 10, 0.1)).toMatch(/Too low/)
    expect(B.placeBid(s, 'apples', 0, 10, 50)).toMatch(/far above/)
    s.cash = 1; expect(B.placeBid(s, 'apples', 0, 10, 0.9)).toMatch(/cash/)
    s.cash = 1e6; s.asks = []
    for (let i = 0; i < B.MAX_BIDS; i++) expect(B.placeBid(s, 'apples', 0, 1, 0.6)).toBeNull()
    expect(B.placeBid(s, 'apples', 0, 1, 0.6)).toMatch(/At most/)
  })
  it('min quality: lower-quality asks are skipped', () => {
    const s = fresh(); s.asks = []; s.ref.apples = 1
    ask(s, 0.5, 10, 0); ask(s, 0.7, 10, 2)
    B.placeBid(s, 'apples', 2, 10, 0.9)
    expect(s.stock['apples|2']).toBe(10)
    expect(s.stock['apples|0'] ?? 0).toBe(0)
  })
  it('escrow still counts toward company value', () => {
    const s = fresh(); s.asks = []; s.ref.apples = 1
    const v = valueBreakdown(s).total
    B.placeBid(s, 'apples', 0, 1000, 0.6)
    expect(v - valueBreakdown(s).total).toBeLessThanOrEqual(7) // only the 1% fee is gone
  })
  it('depth curve accumulates asks upward and bids downward', () => {
    const s = fresh(); s.asks = []; s.ref.apples = 1
    ask(s, 1.1, 10); ask(s, 1.2, 5)
    B.placeBid(s, 'apples', 0, 7, 0.7)
    const d = B.depthCurve(s, 'apples', 0.9)
    expect(d.asks.map(a => a.cum)).toEqual([10, 15])
    expect(d.bids[0].price).toBe(0.9)
    expect(d.bids[d.bids.length - 1].cum).toBe((s.bidLeft.apples ?? 0) + 7)
    expect(d.bids.some(b => b.mine)).toBe(true)
  })
  it('a fill while the clock runs plays the order sound and survives a save round-trip', () => {
    const s = fresh(); s.asks = []; s.ref.apples = 1
    B.placeBid(s, 'apples', 0, 5, 0.9)
    const before = structuredClone(s)
    s.asks = s.asks.filter(o => o.res !== 'apples'); ask(s, 0.85, 5)
    B.bidHour(s)
    expect(tickSfx(before, s)).toBe('order')
    const back = JSON.parse(JSON.stringify(before))
    expect(back.bids[0].qty).toBe(5)
  })
})
