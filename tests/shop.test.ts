// Shop fittings, tills, shift clerks and the sales they change.
import { describe, it, expect } from 'vitest'
import * as E from '../src/game/engine'
import { maxSellHours, TILL_MAX } from '../src/game/shop'

/** A finished corner market on plot 1, with apples in the warehouse and cash to spare. */
function shop(cash = 200000) {
  const s = E.newGame('Shop', 0)
  E.construct(s, 1, 'market')
  E.advanceTo(s, s.hour + 10)
  s.cash = cash
  E.addStock(s, 'apples', 0, 500)
  return s
}
const price = () => E.fairPrice('apples', 0)

describe('shop fittings', () => {
  it('charges the fitting share of the shop cost, once', () => {
    const s = shop()
    const before = s.cash
    expect(E.buyFitting(s, 1, 'display')).toBeNull()
    expect(s.cash).toBe(before - 2000)
    expect(s.plots[1]!.mods).toEqual(['display'])
    expect(E.buyFitting(s, 1, 'display')).toContain('already fitted')
  })
  it('refuses fittings on a building that is not a shop', () => {
    const s = shop()
    E.construct(s, 2, 'orchard')
    expect(E.buyFitting(s, 2, 'display')).toContain('Only shops')
  })
  it('display case raises demand; price board eases the price penalty', () => {
    const s = shop()
    const bd = s.plots[1]!
    const high = price() * 2
    const base = E.sellRate(s, 'apples', 0, price(), bd)
    bd.mods = ['display']
    expect(E.sellRate(s, 'apples', 0, price(), bd) / base).toBeCloseTo(1.1, 6)
    bd.mods = []
    const dear = E.sellRate(s, 'apples', 0, high, bd)
    bd.mods = ['pricebd']
    expect(E.sellRate(s, 'apples', 0, high, bd)).toBeGreaterThan(dear)
  })
  it('extra register lane and tills speed the sale', () => {
    const s = shop()
    const bd = s.plots[1]!
    const slow = E.sellHours(s, 'apples', 0, price(), 40, bd.level, bd)
    bd.mods = ['register']
    expect(E.sellHours(s, 'apples', 0, price(), 40, bd.level, bd)).toBeLessThan(slow)
    bd.mods = []
    bd.till = 2
    expect(E.shopSpeed(bd) / bd.level).toBeCloseTo(1.2, 6)
  })
  it('tills stack up to the maximum and cost more each time', () => {
    const s = shop()
    let last = 0
    for (let i = 0; i < TILL_MAX; i++) {
      const before = s.cash
      expect(E.buyTill(s, 1)).toBeNull()
      const paid = before - s.cash
      expect(paid).toBeGreaterThan(last)
      last = paid
    }
    expect(s.plots[1]!.till).toBe(TILL_MAX)
    expect(E.buyTill(s, 1)).toContain('full')
  })
  it('cold storage allows longer sales', () => {
    expect(maxSellHours(undefined)).toBe(72)
    expect(maxSellHours(['cold'])).toBe(120)
  })
  it('loyalty counter counts regulars extra toward market recovery', () => {
    const s = shop()
    E.buyFitting(s, 1, 'loyalty')
    expect(E.startSell(s, 1, 'apples', 0, 2, price())).toBeNull()
    const end = s.plots[1]!.job!.endH
    E.advanceTo(s, end + 0.01) // finish inside the same day, before the day rolls over
    expect(s.soldToday.apples).toBeCloseTo(2.5, 3)
  })
})

describe('shift clerks', () => {
  it('doubles sales speed inside the shift and changes nothing outside it', () => {
    const s = shop()
    const bd = s.plots[1]!
    const rate = E.sellRate(s, 'apples', 0, price(), bd) * E.shopSpeed(bd)
    const qty = rate * 2 // about two hours without a clerk
    s.hour = 2 * 24 + 20 // 8pm: off shift
    bd.clerk = true
    expect(E.sellHours(s, 'apples', 0, price(), qty, bd.level, bd)).toBeCloseTo(2, 1)
    s.hour = 2 * 24 + 10 // 10am: on shift
    expect(E.sellHours(s, 'apples', 0, price(), qty, bd.level, bd)).toBeLessThan(1.2)
  })
  it('is paid only for hours on shift', () => {
    expect(E.shiftHoursIn(9, 4)).toBeCloseTo(4, 2)
    expect(E.shiftHoursIn(18, 4)).toBeLessThan(0.01)
    expect(E.shiftHoursIn(15, 4)).toBeCloseTo(2, 2)
  })
  it('can be hired and let go, and the wage comes out at sale time', () => {
    const s = shop()
    expect(E.setClerk(s, 1, true)).toBeNull()
    expect(s.plots[1]!.clerk).toBe(true)
    expect(E.setClerk(s, 1, false)).toBeNull()
    expect(s.plots[1]!.clerk).toBeUndefined()
  })
})

describe('daily digest', () => {
  it('sales do not each write a line; the day ends with one digest line', () => {
    const s = shop()
    expect(E.startSell(s, 1, 'apples', 0, 5, price())).toBeNull()
    E.advanceTo(s, s.plots[1]!.job!.endH + 0.01)
    expect(s.log.some(l => l.includes('sold'))).toBe(false)
    E.advanceTo(s, Math.ceil(s.hour / 24) * 24 + 0.01) // into the next day
    expect(s.log.find(l => l.includes('Yesterday:'))).toContain('sold 5')
    expect(s.madeToday).toEqual({})
  })
})
