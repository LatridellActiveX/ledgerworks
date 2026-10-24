// Sanity checks on static data: every reference points at something real.
import { describe, it, expect } from 'vitest'
import { RESOURCES, RECIPES, BUILDINGS, RES, REC } from '../src/game/data'

describe('game data', () => {
  it('has 100+ resources, each with a recipe', () => {
    expect(RESOURCES.length).toBe(119)
    expect(new Set(RESOURCES.map(r => r.id)).size).toBe(119)
    for (const r of RESOURCES) expect(REC[r.id], r.id).toBeTruthy()
  })
  it('recipe inputs and building recipes exist', () => {
    for (const rc of RECIPES) for (const k of Object.keys(rc.inputs)) expect(RES[k], k).toBeTruthy()
    for (const b of BUILDINGS) for (const id of b.recipes ?? []) expect(REC[id], id).toBeTruthy()
  })
  it('every good is sold by some building and researchable', async () => {
    const { fieldOf } = await import('../src/game/research')
    for (const r of RESOURCES) {
      expect(BUILDINGS.some(b => b.recipes?.includes(r.id)), r.id).toBe(true)
      if (!r.id.startsWith('rn_')) expect(fieldOf(r.id), r.id).toBeTruthy()
      if (r.store) expect(BUILDINGS.some(b => b.store === r.store), r.store).toBe(true)
    }
  })
  it('products are worth more than their inputs', () => {
    for (const rc of RECIPES) {
      const cost = Object.entries(rc.inputs).reduce((t, [k, n]) => t + n * RES[k].basePrice, 0)
      expect(RES[rc.output].basePrice, rc.output).toBeGreaterThan(cost)
    }
  })
})
