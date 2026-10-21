// Warehouse v2: art coverage, rows/badges/24h change, average cost, history.
import { describe, it, expect } from 'vitest'
import * as E from '../src/game/engine'
import * as M from '../src/game/market'
import { RESOURCES } from '../src/game/data'
import { ART_IDS } from '../src/ui/goodart'
import { goodRows, catOf, compact } from '../src/ui/Warehouse'

describe('warehouse v2', () => {
  it('has original art for all 111 goods', () => {
    expect(RESOURCES.length).toBe(111)
    for (const r of RESOURCES) expect(ART_IDS, r.id).toContain(r.id)
  })
  it('categorises every good', () => { for (const r of RESOURCES) expect(catOf(r.id)).toBeTruthy() })
  it('compacts like the reference', () => { expect(compact(396)).toBe('396'); expect(compact(16300)).toBe('16.3k'); expect(compact(1.7e6)).toBe('1.7M') })
  it('tracks average cost, history and 24h change', () => {
    const s = E.newGame('T', 0)
    s.stock = {}; s.avgCost = {}; s.whLog = []
    E.setWhy('bought'); E.addStock(s, 'apples', 0, 100, 2); E.addStock(s, 'apples', 0, 100, 4)
    expect(s.avgCost!.apples).toBeCloseTo(3)
    E.setWhy('sold on exchange'); E.addStock(s, 'apples', 0, -50)
    const r = goodRows(s).find(x => x.res === 'apples')!
    expect(r.qty).toBe(150); expect(r.change24).toBe(150)
    expect(s.whLog!.map(m => m.why)).toEqual(['bought', 'sold on exchange'])
    s.hour += 30
    expect(goodRows(s).find(x => x.res === 'apples')!.change24).toBe(0)
  })
  it('buying on the exchange records cost', () => {
    const s = E.newGame('T', 0); M.restockNpc(s); s.cash = 1e6
    expect(M.buy(s, 'water', 10)).toBeNull()
    expect(s.avgCost!.water).toBeGreaterThan(0)
  })
})
