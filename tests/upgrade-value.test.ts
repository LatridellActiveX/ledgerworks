// Modular upgrades count toward the building's own value, company value and
// the balance sheet's fixed assets, at cost (same rule as buildings).
import { describe, expect, it } from 'vitest'
import * as E from '../src/game/engine'
import { buildingValue } from '../src/game/finance'
import { valueDetail } from '../src/game/value'
import { balanceNow } from '../src/game/ledger'

describe('upgrade value', () => {
  it('fields, drip lines, fittings and tills add to the building at cost; grafts do not', () => {
    const s = E.newGame('A', 0)
    s.plots[0] = { uid: 1, type: 'orchard', level: 1, irrigated: true, graft: true, fields: [{ uid: 2, type: 'orchard', level: 0.6, irrigated: true }] }
    s.plots[1] = { uid: 3, type: 'market', level: 1, mods: ['display'], till: 2 }
    const orch = s.plots[0]!, mk = s.plots[1]!
    expect(E.upgradesValue(orch)).toBe(9000 + 2500 + 1500)
    expect(E.upgradesValue(mk)).toBe(2000 + 1000 + 2000)
    expect(E.unitValue(orch)).toBe(12000 + 13000)
    expect(buildingValue(s)).toBe(E.unitValue(orch) + E.unitValue(mk))
    expect(valueDetail(s).buildings[0]).toMatchObject({ value: 25000, upgrades: 13000 })
    expect(balanceNow(s).buildings).toBe(buildingValue(s))
  })
})
