// Production chains explorer: tree building, ratios, profit math, guards.
import { describe, it, expect } from 'vitest'
import { REC, RECIPES, RESOURCES } from '../src/game/data'
import { buildChain, stepMath, usedIn, countNodes, makerOf, MAX_DEPTH, type ChainNode } from '../src/game/chains'

const flat = (r: string) => (r === 'bread' ? 10 : r === 'flour' ? 2 : r === 'eggs' ? 1 : r === 'power' ? 0.5 : 1)

describe('production chains', () => {
  it('does the profit math for one level-1 building', () => {
    // bread: 50/h, needs flour 0.6, eggs 0.5, power 1 per loaf; Food works wage 90.
    const m = stepMath('bread', flat)
    expect(m.perHour).toBe(50)
    expect(m.outputValue).toBe(500)
    expect(m.inputCost).toBeCloseTo(50 * (0.6 * 2 + 0.5 * 1 + 1 * 0.5)) // 110
    expect(m.wages).toBe(90)
    expect(m.profit).toBeCloseTo(500 - 110 - 90)
  })
  it('builds the tree with the maker, inputs and Anno-style ratios', () => {
    const t = buildChain('bread', { price: flat })
    expect(t.building?.id).toBe('kitchen')
    expect(t.inputs.map(c => c.res).sort()).toEqual(['eggs', 'flour', 'power'])
    const flour = t.inputs.find(c => c.res === 'flour')!
    // One bakery (50/h) eats 30 flour/h; a flour line makes 100/h -> 0.3 of a building.
    expect(flour.needPerHour).toBeCloseTo(30)
    expect(flour.ratio).toBeCloseTo(0.3)
    expect(flour.inputs.map(c => c.res).sort()).toEqual(['power', 'wheat'])
    // Wheat goes all the way down to seeds/water/power.
    expect(countNodes(t)).toBeGreaterThan(6)
  })
  it('marks owned buildings and warehouse stock', () => {
    const t = buildChain('bread', { price: flat, owned: b => (b === 'kitchen' ? 2 : 0), inStock: r => (r === 'eggs' ? 40 : 0) })
    expect(t.owned).toBe(2)
    expect(t.inputs.find(c => c.res === 'eggs')!.stock).toBe(40)
    expect(t.inputs.find(c => c.res === 'eggs')!.owned).toBe(0)
  })
  it('builds a finite tree for every one of the 119 goods', () => {
    expect(RESOURCES.length).toBe(119)
    const depth = (n: ChainNode): number => 1 + Math.max(0, ...n.inputs.map(depth))
    for (const r of RESOURCES) {
      const t = buildChain(r.id, { price: () => 1 })
      expect(depth(t), r.id).toBeLessThanOrEqual(MAX_DEPTH + 1)
      expect(makerOf(r.id), r.id).toBeTruthy()
    }
  })
  it('stops at loops instead of recursing forever', () => {
    // Temporarily make power need bread (a loop: bread -> power -> bread).
    const old = REC.power.inputs
    REC.power.inputs = { bread: 0.01 }
    try {
      const t = buildChain('bread', { price: () => 1 })
      const power = t.inputs.find(c => c.res === 'power')!
      const loop = power.inputs.find(c => c.res === 'bread')!
      expect(loop.cut).toBe('cycle')
      expect(loop.inputs).toEqual([])
    } finally { REC.power.inputs = old }
  })
  it('lists what a good is used in', () => {
    const u = usedIn('flour').map(x => x.res)
    expect(u).toContain('bread')
    expect(u.length).toBe(RECIPES.filter(rc => rc.inputs.flour !== undefined).length)
    expect(usedIn('car')).toEqual([])
  })
})
