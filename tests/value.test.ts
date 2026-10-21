// Company value breakdown, daily history and the update check.
import { describe, it, expect } from 'vitest'
import * as E from '../src/game/engine'
import { valueBreakdown, recordValue, HIST_MAX } from '../src/game/value'
import { companyValue } from '../src/game/trade'
import { isNewer } from '../src/ui/UpdatePrompt'

describe('company value', () => {
  it('total = cash + buildings + inventory + bonds held - liabilities', () => {
    const s = E.newGame('T', 0)
    s.plots[0] = { uid: 1, type: 'generator', level: 3 }
    s.stock['apples|1'] = 10; s.ref.apples = 2
    s.bonds = [{ id: 1, amount: 5000, rate: 0.05, soldH: 0 }]
    s.holdings = [{ id: 2, issuer: 'X', rating: 'A' as any, amount: 1000, rate: 0.04, boughtH: 0 }]
    const b = valueBreakdown(s)
    expect(b.buildings).toBe(9000 * 6) // cost * L(L+1)/2 for L=3
    expect(b.inventory).toBe(20)
    expect(b.total).toBe(Math.round(s.cash + 54000 + 20 + 1000 - 5000))
    expect(companyValue(s)).toBe(b.total)
  })
  it('records one point per day, capped', () => {
    const s = E.newGame('T', 0)
    for (let d = 0; d < HIST_MAX + 10; d++) { s.hour = d * 24; recordValue(s) }
    expect(s.valueHist!.length).toBe(HIST_MAX)
    recordValue(s); expect(s.valueHist!.length).toBe(HIST_MAX) // same hour updates in place
  })
  it('rollDay adds a history point', () => {
    const s = E.newGame('T', 0); const n = s.valueHist?.length ?? 0
    E.advanceTo(s, s.hour + 25)
    expect((s.valueHist?.length ?? 0)).toBeGreaterThan(n)
  })
})
describe('update check', () => {
  it('only a different buildId counts as new', () => {
    expect(isNewer({ buildId: 'b' }, 'a')).toBe(true)
    expect(isNewer({ buildId: 'a' }, 'a')).toBe(false)
    expect(isNewer({ build: '2026' }, 'a')).toBe(false) // old deploys without buildId
    expect(isNewer(null, 'a')).toBe(false)
  })
})
