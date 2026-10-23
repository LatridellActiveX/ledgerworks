// Re-basing old prices onto new basePrices (rebase.ts + save migrate).
import { describe, expect, it } from 'vitest'
import { migrate } from '../src/game/save'
import { newGame } from '../src/game/engine'
import { RES } from '../src/game/data'

describe('price rebase', () => {
  it('scales an old save\'s ref, history and NPC asks, not player orders', () => {
    const s: any = JSON.parse(JSON.stringify(newGame('T')))
    delete s.refBase // pre-anchor save
    s.ref = { apples: 1.6 * 1.2, berries: 2.0 }
    s.priceHist = { apples: [1.6, 1.92] }
    s.asks = [{ id: 1, owner: 'npc', res: 'apples', q: 0, qty: 5, price: 1.6, placedH: 0, crates: 0 },
      { id: 2, owner: 'me', res: 'apples', q: 0, qty: 5, price: 1.6, placedH: 0, crates: 0 }]
    const out = migrate(s)
    expect(out.ref.apples).toBeCloseTo(RES.apples.basePrice * 1.2, 1)
    expect(out.ref.berries).toBeCloseTo(RES.berries.basePrice, 1)
    expect(out.priceHist!.apples[0]).toBeCloseTo(RES.apples.basePrice, 1)
    expect(out.asks.find(o => o.id === 1)!.price).toBeCloseTo(RES.apples.basePrice, 1)
    expect(out.asks.find(o => o.id === 2)!.price).toBe(1.6)
    // Second load: already anchored, nothing moves again.
    expect(migrate(JSON.parse(JSON.stringify(out))).ref.apples).toBe(out.ref.apples)
  })
  it('leaves a fresh game alone', () => {
    const g = newGame('T'); const h = JSON.stringify(g.priceHist)
    expect(JSON.stringify(migrate(JSON.parse(JSON.stringify(g))).priceHist)).toBe(h)
  })
})
