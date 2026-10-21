// Trade routes: town prices, departures/arrivals, reserve rule, offline cap, save round trip.
import { describe, it, expect } from 'vitest'
import * as R from '../src/game/routes'
import * as E from '../src/game/engine'
import { RES } from '../src/game/data'
import { exportCode, importCode } from '../src/game/save'

const fresh = () => { const s = E.newGame('T', 0); s.stock['bread|0'] = 500; return s }
const spec = (o: Partial<R.RouteSpec> = {}): R.RouteSpec => ({ town: 'millbrook', res: 'bread', mode: 'amount', amount: 50, every: 2, ...o })

describe('trade routes', () => {
  it('towns are valid and prices are deterministic and differ by town', () => {
    expect(RES.bread).toBeTruthy()
    for (const t of R.TOWNS) { expect(t.cap).toBeGreaterThan(0); expect(t.travelH).toBeLessThanOrEqual(Math.min(...R.EVERY_OPTIONS)) }
    const s = fresh()
    const prices = R.TOWNS.map(t => R.townPrice(s, t, 'bread', 30))
    expect(new Set(prices.map(p => p.toFixed(4))).size).toBeGreaterThan(1)
    expect(R.townPrice(s, R.TOWN.millbrook, 'bread', 30)).toBe(R.townPrice(s, R.TOWN.millbrook, 'bread', 30))
    // Drift stays within ±12% and actually moves over a few days.
    const d = Array.from({ length: 200 }, (_, h) => R.townDrift(R.TOWN.saltmarsh, 'bread', h))
    expect(Math.min(...d)).toBeGreaterThanOrEqual(0.88); expect(Math.max(...d)).toBeLessThanOrEqual(1.12)
    expect(Math.max(...d) - Math.min(...d)).toBeGreaterThan(0.05)
  })
  it('units beyond the town demand sell at the surplus price', () => {
    const s = fresh(), t = R.TOWN.millbrook, dem = R.townDemand(t, 'bread')
    const one = R.townPrice(s, t, 'bread', 10)
    expect(R.saleValue(s, t, 'bread', dem + 10, 0, 10)).toBeCloseTo(one * dem + one * 10 * R.SURPLUS_PRICE, 0)
  })
  it('validates new routes and the route limit', () => {
    const s = fresh()
    expect(R.addRoute(s, spec({ town: 'nowhere' }))).toBeTruthy()
    expect(R.addRoute(s, spec({ amount: 0 }))).toBeTruthy()
    expect(R.addRoute(s, spec({ amount: 9999 }))).toMatch(/at most/)
    expect(R.addRoute(s, spec({ every: 5 }))).toBeTruthy()
    for (let i = 0; i < R.MAX_ROUTES; i++) expect(R.addRoute(s, spec())).toBeNull()
    expect(R.addRoute(s, spec())).toMatch(/at most/)
  })
  it('a cart leaves, pays the fee, arrives and sells at the town price', () => {
    const s = fresh(); s.hour = 10
    expect(R.addRoute(s, spec())).toBeNull()
    const cash0 = s.cash
    E.advanceTo(s, 10.01) // departure
    const r = s.routes![0]
    expect(r.trip?.qty).toBe(50)
    expect(E.haveQty(s, 'bread')).toBe(450)
    expect(s.cash).toBeCloseTo(cash0 - R.tripCost(R.TOWN.millbrook, 50), 2)
    const arrive = r.trip!.arriveH, expected = R.saleValue(s, R.TOWN.millbrook, 'bread', 50, 0, arrive)
    E.advanceTo(s, arrive + 0.01)
    expect(r.trip).toBeUndefined()
    expect(r.trips).toBe(1); expect(r.last!.revenue).toBeCloseTo(expected, 2)
    expect(R.routeProfit(r)).toBeCloseTo(expected - r.costs, 2)
    expect(s.log.some(l => l.includes('Millbrook'))).toBe(true)
    // The next one leaves on schedule, `every` hours after the first.
    E.advanceTo(s, 12.05)
    expect(r.trip?.departH).toBeCloseTo(12, 5)
  })
  it('reserve mode keeps a minimum stock and skips when there is nothing above it', () => {
    const s = fresh()
    R.addRoute(s, spec({ mode: 'reserve', amount: 460 }))
    E.advanceTo(s, s.hour + 0.01)
    expect(s.routes![0].trip?.qty).toBe(40)
    E.advanceTo(s, s.hour + 2.1) // arrives, then next departure finds 460 = reserve
    expect(s.routes![0].last?.note).toMatch(/reserve/)
    expect(E.haveQty(s, 'bread')).toBe(460)
  })
  it('never loads more than the cart capacity', () => {
    const s = fresh(); s.stock['bread|0'] = 5000
    R.addRoute(s, spec({ mode: 'reserve', amount: 0 }))
    E.advanceTo(s, s.hour + 0.01)
    expect(s.routes![0].trip?.qty).toBe(R.TOWN.millbrook.cap)
  })
  it('paused routes do nothing; deleting returns goods on the road', () => {
    const s = fresh()
    R.addRoute(s, spec())
    E.advanceTo(s, s.hour + 0.01)
    expect(E.haveQty(s, 'bread')).toBe(450)
    expect(R.deleteRoute(s, s.routes![0].id)).toBeNull()
    expect(E.haveQty(s, 'bread')).toBe(500)
    R.addRoute(s, spec()); R.togglePause(s, s.routes![0].id)
    E.advanceTo(s, s.hour + 10)
    expect(s.routes![0].trips).toBe(0); expect(E.haveQty(s, 'bread')).toBe(500)
  })
  it('offline catch-up makes up at most MAX_CATCHUP trips', () => {
    const s = fresh(); s.stock['bread|0'] = 100000
    R.addRoute(s, spec({ every: 1 }))
    E.advanceTo(s, s.hour + 24 * 7) // a week away
    const r = s.routes![0]
    expect(r.trips).toBeLessThanOrEqual(R.MAX_CATCHUP)
    expect(r.trips).toBeGreaterThanOrEqual(R.MAX_CATCHUP - 1)
    expect(s.log.some(l => l.includes('skipped'))).toBe(true)
  })
  it('routes survive a save code round trip (same as cloud saves: the whole state)', () => {
    const s = fresh(); R.addRoute(s, spec())
    const back = importCode(exportCode(s))
    expect(back.routes?.[0].town).toBe('millbrook')
    // Old saves without routes still load and advance.
    const old: any = fresh(); delete old.routes
    expect(() => E.advanceTo(importCode(exportCode(old)), 50)).not.toThrow()
  })
})
