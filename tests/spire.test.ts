// Trade Spire (admin-only economy controls): gating, clamping, and offline
// maths with overrides. See src/game/overrides.ts and worker/admin.ts.
import { afterEach, describe, expect, it } from 'vitest'
import * as OV from '../src/game/overrides'
import * as E from '../src/game/engine'
import { refPrice } from '../src/game/market'
import { activeStories } from '../src/game/news'
import { valueBreakdown } from '../src/game/value'
import { stripAdminOnly } from '../worker/admin'

const goods = new Set(['bread', 'milk'])
const ev: OV.EconEvent = { name: 'Turbo Week', mult: 3, start: '2026-10-24T00:00:00Z', end: '2026-10-31T00:00:00Z' }
const now = Date.parse('2026-10-25T00:00:00Z')
const apply = (b: any, cur = OV.normalEcon()) => OV.applyEcon(b, cur, now, ev, goods)
afterEach(() => OV.setEcon(null)) // never leak an override between tests

describe('applyEcon validation', () => {
  it('every change needs confirm: true', () => {
    expect(apply({ op: 'reset' })).toBe('Confirmation required')
    expect(apply(null)).toBe('Confirmation required')
  })
  it('rejects unknown ops and goods', () => {
    expect(typeof apply({ confirm: true, op: 'make-admin' })).toBe('string')
    expect(apply({ confirm: true, op: 'price', res: 'gold', mult: 2 })).toBe('Unknown good')
  })
  it('clamps prices to 0.25-4x and speeds to 0.5-5x', () => {
    const a = apply({ confirm: true, op: 'price', res: 'bread', mult: 99 }) as any
    expect(a.econ.price.bread).toBe(4)
    const b = apply({ confirm: true, op: 'price', res: 'bread', mult: 0.01 }) as any
    expect(b.econ.price.bread).toBe(0.25)
    const c = apply({ confirm: true, op: 'speed', prod: 50, sell: 0 }) as any
    expect([c.econ.prod, c.econ.sell]).toEqual([5, 0.5])
  })
  it('1x removes a price override; reset goes back to normal', () => {
    const a = apply({ confirm: true, op: 'price', res: 'bread', mult: 2 }) as any
    const b = apply({ confirm: true, op: 'price', res: 'bread', mult: 1 }, a.econ) as any
    expect(b.econ.price).toEqual({})
    const r = apply({ confirm: true, op: 'reset' }, a.econ) as any
    expect(OV.isNormal(r.econ)).toBe(true)
  })
  it('cleanEcon clamps whatever is stored', () => {
    const e = OV.cleanEcon({ price: { bread: 10, gold: 2 }, prod: 9, sell: -1 }, goods)
    expect(e).toMatchObject({ price: { bread: 4 }, prod: 5, sell: 0.5 })
  })
})

describe('admin-only spire', () => {
  it('save sync strips the spire for non-admins only', () => {
    expect(stripAdminOnly({ cash: 1, adminSpire: 3 }, false)).not.toHaveProperty('adminSpire')
    expect(stripAdminOnly({ cash: 1, adminSpire: 3 }, true)).toHaveProperty('adminSpire', 3)
  })
  it('is free, one per company, blocks the plot, and adds no value', () => {
    const s = E.newGame('A', 0), cash = s.cash
    const before = valueBreakdown(s)
    expect(E.buildSpire(s, 0)).toBeNull()
    expect(s.cash).toBe(cash)
    expect(E.buildSpire(s, 1)).toBe('You already have a Trade Spire')
    expect(E.construct(s, 0, 'farm')).not.toBeNull()
    expect(s.plots[0]).toBeFalsy()
    expect(valueBreakdown(s)).toEqual(before)
  })
})

describe('overrides in the game', () => {
  it('price multiplier applies to reference prices', () => {
    const s = E.newGame('A', 0), base = refPrice(s, 'bread')
    OV.setEcon({ price: { bread: 2 } })
    expect(refPrice(s, 'bread')).toBeCloseTo(base * 2)
  })
  const withJob = (kind: 'make' | 'sell') => {
    const s = E.newGame('T', 0)
    s.plots[0] = { uid: 1, type: 'generator', level: 1, job: kind === 'make' ? { kind: 'make', res: 'power', qty: 60, q: 0, startH: s.hour, endH: s.hour + 6 } : { kind: 'sell', res: 'power', qty: 6, q: 0, price: 1, startH: s.hour, endH: s.hour + 6 } }
    return s
  }
  it('offline: 2x production finishes a 6h job in 3h; normal does not', () => {
    const a = withJob('make'); E.advanceTo(a, a.hour + 3.01)
    expect(a.plots[0]!.job).toBeDefined()
    OV.setEcon({ prod: 2 })
    const b = withJob('make'); E.advanceTo(b, b.hour + 3.01)
    expect(b.plots[0]!.job).toBeUndefined()
  })
  it('offline: 0.5x selling takes twice as long and stacks with event boost', () => {
    OV.setEcon({ sell: 0.5 })
    const a = withJob('sell'); E.advanceTo(a, a.hour + 11)
    expect(a.plots[0]!.job).toBeDefined()
    const b = withJob('sell'); E.advanceTo(b, b.hour + 4.01, 3) // 3 x 0.5 = 1.5x -> 4h
    expect(b.plots[0]!.job).toBeUndefined()
  })
  it('custom news story leads while it runs', () => {
    OV.setEcon({ news: { icon: '📰', headline: 'Bread boom', blurb: 'x', goods: ['bread'], mult: 1.5, until: new Date(Date.now() + 3600e3).toISOString() } })
    expect(activeStories(0)[0].t.headline).toBe('Bread boom')
    OV.setEcon({ news: { icon: '📰', headline: 'Old', blurb: 'x', goods: [], mult: 1, until: '2000-01-01T00:00:00Z' } })
    expect(activeStories(0).some(n => n.t.headline === 'Old')).toBe(false)
  })
})
