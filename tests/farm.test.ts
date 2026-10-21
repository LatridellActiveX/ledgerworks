// Farms: tending, ripening and harvest, spoilage, irrigation, grafting, weather and soil.
import { describe, it, expect } from 'vitest'
import * as E from '../src/game/engine'
import * as FM from '../src/game/farm'

/** A finished orchard on plot 0 with plenty of seeds and water, and fixed soil. */
function farmGame() {
  const s = E.newGame('Farm', 0)
  E.construct(s, 0, 'orchard')
  E.construct(s, 1, 'market')
  E.advanceTo(s, s.hour + 10)
  E.addStock(s, 'seeds', 0, 500)
  E.addStock(s, 'water', 0, 500)
  s.cash = 1e9
  s.plots[0]!.soil = 1
  return s
}

describe('farm growth', () => {
  it('tending pulls the ripening in and keeps the growth so far', () => {
    const j = { startH: 0, endH: 10 }
    FM.speedUp(j, 4, 0.5)
    expect(FM.growFrac(j, 4)).toBeCloseTo(0.4)
    expect(j.endH).toBeCloseTo(7)
    expect(FM.growFrac(j, 7)).toBeCloseTo(1)
  })
  it('a crop ripens at its end time and waits for harvest instead of paying out', () => {
    const s = farmGame()
    expect(E.startMake(s, 0, 'apples', 80)).toBeNull()
    const j = s.plots[0]!.job as any
    E.advanceTo(s, j.endH + 0.5)
    expect(s.plots[0]!.job).toBeDefined()
    expect(s.plots[0]!.job!.ripeH).toBeCloseTo(j.endH)
    expect(E.haveQty(s, 'apples')).toBe(0)
  })
  it('harvest brings in what is left and frees the plot', () => {
    const s = farmGame()
    E.startMake(s, 0, 'apples', 80)
    E.advanceTo(s, s.plots[0]!.job!.endH) // harvest the moment it ripens: nothing lost yet
    expect(E.harvest(s, 0)).toBeNull()
    expect(E.haveQty(s, 'apples')).toBe(80)
    expect(s.plots[0]!.job).toBeUndefined()
    expect(s.plots[0]!.soil).toBeLessThan(1)
  })
  it('harvest refuses a crop that is still growing', () => {
    const s = farmGame()
    E.startMake(s, 0, 'apples', 80)
    expect(E.harvest(s, 0)).toMatch(/not ripe/i)
  })
  it('a ripe crop loses units each hour and is lost to spoilage', () => {
    const s = farmGame()
    E.startMake(s, 0, 'apples', 80)
    const end = s.plots[0]!.job!.endH
    E.advanceTo(s, end + 10)
    const left = E.pending(s, s.plots[0]!)!.units
    expect(left).toBeLessThan(80)
    expect(left).toBeGreaterThan(0)
    E.advanceTo(s, end + FM.SPOIL_H + 1)
    expect(s.plots[0]!.job).toBeUndefined()
    expect(E.haveQty(s, 'apples')).toBe(0)
  })
  it('three tends lift the quality of the harvest by one', () => {
    const s = farmGame()
    E.startMake(s, 0, 'apples', 80)
    const q0 = (s.plots[0]!.job as any).q
    expect(E.tend(s, 0)).toBeNull()
    expect(E.tend(s, 0)).toMatch(/recently/)
    E.advanceTo(s, s.hour + FM.TEND_GAP_H + 0.001); expect(E.tend(s, 0)).toBeNull()
    E.advanceTo(s, s.hour + FM.TEND_GAP_H + 0.001); expect(E.tend(s, 0)).toBeNull()
    E.advanceTo(s, s.plots[0]!.job!.endH + 0.5)
    expect((s.plots[0]!.job as any).q).toBe(q0 + 1)
  })
  it('tending a ripe crop is refused', () => {
    const s = farmGame()
    E.startMake(s, 0, 'apples', 80)
    E.advanceTo(s, s.plots[0]!.job!.endH + 0.5)
    expect(E.tend(s, 0)).toMatch(/Nothing to tend/)
  })
})

describe('farm inputs', () => {
  it('a drip line uses a third less water', () => {
    const plain = farmGame()
    E.startMake(plain, 0, 'apples', 80)
    const used = 500 - E.haveQty(plain, 'water')
    const wet = farmGame()
    wet.plots[0]!.irrigated = true
    E.startMake(wet, 0, 'apples', 80)
    expect(500 - E.haveQty(wet, 'water')).toBeLessThan(used)
    expect(500 - E.haveQty(wet, 'water')).toBeCloseTo(used * FM.IRRIGATION_WATER)
  })
  it('irrigation costs cash once and only on farms', () => {
    const s = farmGame()
    const cash = s.cash
    expect(E.irrigate(s, 0)).toBeNull()
    expect(cash - s.cash).toBe(2500)
    expect(E.irrigate(s, 0)).toMatch(/Already/)
    expect(E.irrigate(s, 1)).toMatch(/Only farms/)
  })
  it('soil changes how long a crop takes', () => {
    const rich = farmGame(); rich.plots[0]!.soil = 1.2
    const poor = farmGame(); poor.plots[0]!.soil = 0.5
    E.startMake(rich, 0, 'apples', 80); E.startMake(poor, 0, 'apples', 80)
    expect((poor.plots[0]!.job as any).endH).toBeGreaterThan((rich.plots[0]!.job as any).endH)
  })
  it('soil rolls stay within its limits', () => {
    let x = 1
    const rnd = () => { x = (x * 16807) % 2147483647; return x / 2147483647 }
    for (let i = 0; i < 500; i++) { const v = FM.rollSoil(rnd); expect(v).toBeGreaterThanOrEqual(FM.SOIL_MIN); expect(v).toBeLessThanOrEqual(FM.SOIL_MAX) }
  })
})

describe('farm grafts and weather', () => {
  it('a graft lifts the next crop from the plot once', () => {
    const s = farmGame()
    s.plots[0]!.graft = true
    E.startMake(s, 0, 'apples', 80)
    const q = (s.plots[0]!.job as any).q
    expect(s.plots[0]!.graft).toBe(false)
    E.advanceTo(s, s.plots[0]!.job!.endH + 0.5); E.harvest(s, 0)
    E.startMake(s, 0, 'apples', 80)
    expect((s.plots[0]!.job as any).q).toBe(q - 1)
  })
  it('a graft attempt costs seeds and cash', () => {
    const s = farmGame()
    const cash = s.cash
    E.graft(s, 0)
    expect(cash - s.cash).toBe(300)
    expect(E.haveQty(s, 'seeds')).toBe(497)
  })
  it('frost takes part of an untended crop, and a tended one is safe', () => {
    const s = farmGame()
    E.startMake(s, 0, 'apples', 80)
    const before = (s.plots[0]!.job as any).qty
    FM.farmDay(s, 0.85)
    expect((s.plots[0]!.job as any).qty).toBeLessThan(before)
    const t = farmGame()
    E.startMake(t, 0, 'apples', 80)
    t.hour += 0.2; E.tend(t, 0)
    const b2 = (t.plots[0]!.job as any).qty
    FM.farmDay(t, 0.85)
    expect((t.plots[0]!.job as any).qty).toBe(b2)
  })
  it('weather draws map to the four types', () => {
    expect(FM.rollWeather(0.1)).toBe('clear')
    expect(FM.rollWeather(0.6)).toBe('rain')
    expect(FM.rollWeather(0.85)).toBe('frost')
    expect(FM.rollWeather(0.95)).toBe('heat')
  })
})
