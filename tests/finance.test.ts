// Abundance, bonds and government orders.
import { describe, it, expect } from 'vitest'
import * as E from '../src/game/engine'
import * as F from '../src/game/finance'

const lvl = (n: number) => { const s = E.newGame('T', 0); s.xp = E.xpForLevel(n); s.cash = 2e6; return s }

describe('abundance', () => {
  it('extraction sites roll 15-100% abundance that slows output and depletes', () => {
    const s = lvl(6)
    E.construct(s, 0, 'pit')
    const a = s.plots[0]!.abund!
    for (const v of Object.values(a)) { expect(v).toBeGreaterThanOrEqual(0.15); expect(v).toBeLessThanOrEqual(1) }
    expect(E.makeHours('sand', 300, 1, undefined, undefined, 0.5)).toBeCloseTo(2)
    const before = a.sand; E.advanceTo(s, s.hour + 24 * 10)
    expect(s.plots[0]!.abund!.sand).toBeLessThan(before)
  })
  it('scrapping a site counts for Prospector', () => {
    const s = lvl(6); E.construct(s, 0, 'well'); E.scrap(s, 0)
    expect(s.stats.scrappedMines).toBe(1)
  })
})

describe('bonds', () => {
  it('needs the rating minimum, pays daily interest, repay after 14 days', () => {
    const s = lvl(12)
    for (let i = 0; i < 4; i++) E.construct(s, i, 'lab')
    expect(F.issueBond(s, 2, 0.001)).toMatch(/0.4% to 2.5%/)
    const need = F.MIN_RATE[F.myRating(s)]
    expect(F.issueBond(s, 2, need)).toBeNull()
    expect(F.debt(s)).toBe(10000)
    const cash = s.cash; F.bondDay(s, () => {})
    expect(cash - s.cash).toBeCloseTo(10000 * need)
    expect(F.callBond(s, s.bonds![0].id)).toMatch(/14 days/)
    s.hour += F.CALL_AFTER_H
    expect(F.callBond(s, s.bonds![0].id)).toBeNull()
  })
  it('more debt lowers the rating', () => {
    const s = lvl(12); E.construct(s, 0, 'lab')
    const r0 = F.RATINGS.indexOf(F.myRating(s))
    s.bonds = [{ id: 1, amount: 900_000, rate: 0.01, soldH: 0 }]
    expect(F.RATINGS.indexOf(F.myRating(s))).toBeGreaterThan(r0)
  })
})

describe('government orders', () => {
  it('deposit, paid deliveries, deposit back on completion', () => {
    const s = lvl(14); E.construct(s, 0, 'market')
    F.newGovOrder(s)
    const g = s.gov!, cash = s.cash
    expect(F.acceptGov(s)).toBeNull()
    expect(cash - s.cash).toBe(g.deposit)
    for (const i of g.items) { E.addStock(s, i.res, i.q, i.qty); expect(F.deliverGov(s, i.res)).toBeNull() }
    expect(g.status).toBe('done')
    expect(s.cash - cash).toBeCloseTo(F.govValue(g), 0)
    expect(s.stats.govDone).toBe(1)
  })
  it('lower quality than asked is refused; missing the deadline loses the deposit', () => {
    const s = lvl(21); F.newGovOrder(s); F.acceptGov(s)
    const it = s.gov!.items[0]
    E.addStock(s, it.res, 0, it.qty)
    if (it.q > 0) expect(F.deliverGov(s, it.res)).toMatch(/or better/)
    s.hour = s.gov!.deadlineH + 1; F.govDay(s, () => {})
    expect(s.gov!.status).toBe('failed')
  })
})
