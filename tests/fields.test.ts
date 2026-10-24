// Farm fields (Option B): farms grow by buying extra fields instead of levels.
// Each field is its own production unit addressed by a "field ref"
// (plot + 1000*(f+1)) so all the normal job code (plant, tend, harvest,
// irrigate, graft) works on it unchanged.
import { describe, it, expect } from 'vitest'
import * as E from '../src/game/engine'
import * as FM from '../src/game/farm'

/** A finished orchard on plot 0 with lots of cash, seeds and water. */
function farmGame() {
  const s = E.newGame('Fields', 0)
  E.construct(s, 0, 'orchard')
  E.construct(s, 1, 'market')
  E.advanceTo(s, s.hour + 10)
  E.addStock(s, 'seeds', 0, 5000)
  E.addStock(s, 'water', 0, 5000)
  s.cash = 1e9
  s.plots[0]!.soil = 1
  return s
}

describe('farm fields', () => {
  it('fields cost 9k, 14k, 20k and stop at three', () => {
    const s = farmGame()
    const c0 = s.cash
    for (const cost of FM.FIELD_COSTS) {
      expect(E.nextFieldCost(s.plots[0]!)).toBe(cost)
      expect(E.buyField(s, 0)).toBeNull()
    }
    expect(c0 - s.cash).toBe(9000 + 14000 + 20000)
    expect(s.plots[0]!.fields).toHaveLength(3)
    expect(E.buyField(s, 0)).not.toBeNull()
  })
  it('only farms can buy fields', () => {
    const s = farmGame()
    expect(E.buyField(s, 1)).not.toBeNull()
  })
  it('farms no longer level up', () => {
    const s = farmGame()
    expect(E.upgrade(s, 0)).toMatch(/fields/)
  })
  it('a field runs at 0.6x output and grows its own crop alongside the main field', () => {
    const s = farmGame()
    E.buyField(s, 0)
    const ref = FM.fieldRef(0, 0)
    expect(E.unitAt(s, ref)!.level).toBeCloseTo(FM.FIELD_OUT)
    expect(E.startMake(s, 0, 'apples', 60)).toBeNull()
    expect(E.startMake(s, ref, 'apples', 60)).toBeNull()
    const main = s.plots[0]!.job!, fld = E.unitAt(s, ref)!.job!
    // Same batch takes clearly longer on a 0.6x field (a fixed setup time
    // keeps the ratio a little under the pure 1/0.6).
    const ratio = (fld.endH - fld.startH) / (main.endH - main.startH)
    expect(ratio).toBeGreaterThan(1.3)
    expect(ratio).toBeLessThanOrEqual(1 / 0.6 + 0.01)
    E.advanceTo(s, fld.endH + 0.1) // time passing ripens the field too
    expect(E.harvest(s, ref)).toBeNull()
    expect(E.unitAt(s, ref)!.job).toBeUndefined()
  })
  it('drip line and graft work per field', () => {
    const s = farmGame()
    E.buyField(s, 0)
    const ref = FM.fieldRef(0, 0)
    expect(E.irrigate(s, ref)).toBeNull()
    // Grafting can fail by chance; it must still be accepted for a field.
    const g = E.graft(s, ref)
    expect(g === null || /did not take/.test(g)).toBe(true)
    const f = E.unitAt(s, ref)! as any
    const main = s.plots[0]! as any
    expect(JSON.stringify(f)).not.toBe(JSON.stringify(main))
  })
  it('a legacy level 3 orchard keeps its level (grandfathered) and can still add fields', () => {
    const s = farmGame()
    s.plots[0]!.level = 3
    expect(E.buyField(s, 0)).toBeNull()
    expect(s.plots[0]!.level).toBe(3)
  })
  it('scrap refund counts fields paid for', () => {
    const s = farmGame()
    const before = E.scrapRefund(s.plots[0]!)
    E.buyField(s, 0)
    expect(E.scrapRefund(s.plots[0]!) - before).toBeCloseTo(9000 * 0.6)
    expect(FM.fieldsPaid(2)).toBe(23000)
  })
})
