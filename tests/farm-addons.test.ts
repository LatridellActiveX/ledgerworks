// Farm add-ons: soil stars, compost/fertilizer, crop rotation, greenhouse,
// tractor and sprinkler (src/game/farm.ts + engine.ts), their value on the
// books, and the save migration that gives old fields 3 stars.
import { describe, expect, it } from 'vitest'
import * as E from '../src/game/engine'
import * as FM from '../src/game/farm'
import { buildingValue } from '../src/game/finance'
import { balanceNow } from '../src/game/ledger'
import { migrate } from '../src/game/save'

/** A rich test game with one orchard on plot 0 and plenty of stock. */
function game() {
  const s = E.newGame('A', 0)
  s.cash = 1e6
  s.plots[0] = { uid: 1, type: 'orchard', level: 1, soil: 1, fields: [{ uid: 2, type: 'orchard', level: 0.6, soil: 1 }] }
  return s
}

describe('farm add-ons', () => {
  it('output scales ~10% per star vs 3 stars, sprinkler +15%', () => {
    expect(FM.outMult({})).toBeCloseTo(1)
    expect(FM.outMult({ stars: 5 })).toBeCloseTo(1.2)
    expect(FM.outMult({ stars: 1 })).toBeCloseTo(0.8)
    expect(FM.outMult({ stars: 3, sprinkler: true })).toBeCloseTo(1.15)
  })
  it('compost +1, fertilizer +2, capped at 5, and cost cash', () => {
    const s = game(), bd = s.plots[0]!
    expect(E.feedSoil(s, 0, 'compost')).toBeNull()
    expect(bd.stars).toBe(4)
    expect(s.cash).toBe(1e6 - 2000)
    expect(E.feedSoil(s, 0, 'fertilizer')).toBeNull()
    expect(bd.stars).toBe(5)
    expect(E.feedSoil(s, 0, 'compost')).toMatch(/already/)
  })
  it('greenhouse, sprinkler (needs drip) and tractor count at cost; soil care does not', () => {
    const s = game(), bd = s.plots[0]!, field = FM.fieldRef(0, 0)
    const before = E.upgradesValue(bd)
    expect(E.addSprinkler(s, 0)).toMatch(/drip/)
    bd.irrigated = true
    expect(E.addSprinkler(s, 0)).toBeNull()
    expect(E.buildGreenhouse(s, field)).toBeNull()
    expect(E.buyTractor(s, field)).toBeNull() // bought from a field, lands on the farm
    expect(bd.tractor).toBe(true)
    E.feedSoil(s, 0, 'fertilizer')
    expect(E.upgradesValue(bd)).toBe(before + 2500 + 3000 + 12000 + 8000)
    expect(balanceNow(s).buildings).toBe(buildingValue(s))
    expect(FM.farmKit(bd)).toBe('T-g')
  })
  it('tractor and greenhouse shorten grow time', () => {
    expect(FM.timeMult({}, false)).toBe(1)
    expect(FM.timeMult({}, true)).toBeCloseTo(0.8)
    expect(FM.timeMult({ greenhouse: true }, false)).toBeCloseTo(1 / 1.15)
  })
  it('harvests wear stars; rotation after 3 same-crop harvests gives +1 star free', () => {
    const s = game(), bd = s.plots[0]!
    const plant = (res: string) => { bd.job = { kind: 'make', res, qty: 10, q: 1, startH: s.hour, endH: s.hour, ripeH: s.hour }; return E.harvest(s, 0) }
    for (let i = 0; i < 3; i++) expect(plant('apples')).toBeNull()
    expect(bd.stars).toBeCloseTo(3 - 3 * FM.STAR_WEAR)
    expect(bd.streak).toBe(3)
    // Planting a different crop now restores one star for free.
    const before = FM.starsOf(bd)
    for (const k of ['seeds', 'water']) E.addStock(s, k, 1, 1000, 1)
    expect(E.startMake(s, 0, 'berries', 1)).toBeNull()
    expect(bd.stars).toBeCloseTo(before + 1)
    expect(bd.streak).toBe(0)
  })
  it('greenhouse fields skip weather', () => {
    const s = game(), bd = s.plots[0]!
    bd.greenhouse = true
    bd.job = { kind: 'make', res: 'apples', qty: 100, q: 1, startH: 0, endH: 100 }
    FM.farmDay(s, 0.95) // heat
    expect(bd.job.endH).toBe(100)
  })
  it('migration gives old farm fields 3 stars', () => {
    const s: any = JSON.parse(JSON.stringify(game()))
    delete s.plots[0].stars
    const m = migrate(s)
    expect(m.plots[0]!.stars).toBe(3)
    expect(m.plots[0]!.fields![0].stars).toBe(3)
  })
})
