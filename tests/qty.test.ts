// Fine-grained amounts: whole numbers from 1 up, sensible minimum job time,
// and the limits the amount picker shows.
import { describe, it, expect } from 'vitest'
import * as E from '../src/game/engine'
import * as M from '../src/game/market'
import * as Q from '../src/game/qty'
import * as F from '../src/game/finance'
import * as P from '../src/game/p2p'
import { REC } from '../src/game/data'
import { clampQty } from '../src/ui/QtyPicker'

const withPump = () => { const s = E.newGame('T', 0); s.plots[0] = { uid: 1, type: 'pump', level: 1 }; s.stock['power|0'] = 1000; return s }

describe('amount = 1', () => {
  it('makes exactly one unit with the minimum duration and wages for it', () => {
    const s = withPump(), cash = s.cash
    expect(E.startMake(s, 0, 'water', 1)).toBeNull()
    const j = s.plots[0]!.job!
    expect(j.qty).toBe(1)
    expect(j.endH - j.startH).toBeCloseTo(E.MIN_JOB_H)
    expect(cash - s.cash).toBeCloseTo(E.makeWages('pump', 1, E.MIN_JOB_H, s), 6)
    expect(s.stock['power|0']).toBeCloseTo(1000 - REC.water.inputs.power, 6)
  })
  it('rejects zero, negative and fractional amounts everywhere', () => {
    const s = withPump()
    for (const q of [0, -1, 0.5, NaN]) {
      expect(E.startMake(s, 0, 'water', q)).toMatch(/whole amount/)
      expect(M.buy(s, 'seeds', q)).toMatch(/whole amount/)
      expect(M.quickSell(s, 'power', 0, q)).toMatch(/whole amount/)
      expect(M.placeAsk(s, 'power', 0, q, 1)).toMatch(/whole amount/)
    }
  })
  it('one unit can be bought, listed and quick-sold', () => {
    const s = withPump(); s.stock['crates|0'] = 10
    expect(M.buy(s, 'seeds', 1)).toBeNull()
    expect(M.placeAsk(s, 'power', 0, 1, M.refPrice(s, 'power'))).toBeNull()
    expect(M.quickSell(s, 'power', 0, 1)).toBeNull()
  })
  it('selling 1 unit in a shop takes at least the minimum time', () => {
    const s = E.newGame('T', 0); s.plots[0] = { uid: 1, type: 'market', level: 1 }; s.stock['apples|0'] = 5
    expect(E.startSell(s, 0, 'apples', 0, 1, E.fairPrice('apples', 0))).toBeNull()
    const j = s.plots[0]!.job!; expect(j.endH - j.startH).toBeGreaterThanOrEqual(E.MIN_JOB_H - 1e-9)
    expect(E.startSell(E.newGame(), 0, 'apples', 0, 1.5, 1)).not.toBeNull()
  })
  it('p2p rejects fractional amounts', () => {
    const L = P.emptyLedger(); P.register(L, 'abc', 'h', '', 0)
    expect(P.deposit(L.accounts.abc, 0, [{ res: 'seeds', q: 0, qty: 0.5 }])).toMatch(/whole/)
    expect(P.deposit(L.accounts.abc, 0, [{ res: 'seeds', q: 0, qty: 1 }])).toBe(true)
    expect(P.withdrawGoods(L.accounts.abc, 'seeds', 0, 0.5)).toMatch(/whole/)
    expect(P.withdrawGoods(L.accounts.abc, 'seeds', 0, 1)).toBe(true)
  })
})

describe('clamping and limits', () => {
  it('clampQty keeps whole numbers in 1..max', () => {
    expect(clampQty(0, 10)).toBe(1); expect(clampQty(-5, 10)).toBe(1); expect(clampQty(3.7, 10)).toBe(3)
    expect(clampQty(50, 10)).toBe(10); expect(clampQty(NaN, 10)).toBe(1); expect(clampQty(5, 0)).toBe(1)
  })
  it('maxMake is limited by inputs, and that amount is accepted while one more is not', () => {
    const s = withPump(); s.stock['power|0'] = 10 // water needs 0.2 power each -> 50
    const lim = Q.maxMake(s, 0, 'water')
    expect(lim.max).toBe(50); expect(lim.why).toMatch(/Power/)
    expect(E.startMake(structuredClone(s), 0, 'water', 51)).toMatch(/Need/)
    expect(E.startMake(s, 0, 'water', 50)).toBeNull()
  })
  it('maxMake is limited by cash for wages', () => {
    const s = withPump(); s.stock['power|0'] = 1e9; s.cash = 100
    const lim = Q.maxMake(s, 0, 'water')
    expect(lim.why).toMatch(/Cash/)
    expect(E.startMake(structuredClone(s), 0, 'water', lim.max)).toBeNull()
  })
  it('maxBuy never exceeds cash; maxQuick respects trader demand', () => {
    const s = E.newGame('T', 0); s.cash = 10
    const b = Q.maxBuy(s, 'seeds', 0)
    expect(M.quoteBuy(s, 'seeds', b.max, 0)).toBeLessThanOrEqual(10 + 1e-9)
    s.stock['power|0'] = 1e6; s.stock['crates|0'] = 1e6; s.bidLeft.power = 7
    expect(Q.maxQuick(s, 'power', 0)).toMatchObject({ max: 7 })
  })
  it('government delivery of a chosen amount', () => {
    const s = E.newGame('T', 0)
    s.gov = { title: 't', status: 'active', items: [{ res: 'apples', q: 0, qty: 10, done: 0, price: 2 }], deposit: 0, offerUntilH: 0, deadlineH: 999 } as any
    s.stock['apples|1'] = 20
    expect(Q.maxGov(s, 'apples').max).toBe(10)
    expect(F.deliverGov(s, 'apples', 1)).toBeNull(); expect(s.gov!.items[0].done).toBe(1)
    expect(F.deliverGov(s, 'apples', 0.5)).toMatch(/whole/)
  })
})
