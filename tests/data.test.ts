// Sanity checks on static data: every reference points at something real.
import { describe, it, expect } from 'vitest'
import { RESOURCES, RECIPES, BUILDINGS, RES, REC } from '../src/game/data'

describe('game data', () => {
  it('has 47 resources, each with a recipe', () => {
    expect(RESOURCES.length).toBe(47)
    for (const r of RESOURCES) expect(REC[r.id], r.id).toBeTruthy()
  })
  it('recipe inputs and building recipes exist', () => {
    for (const rc of RECIPES) for (const k of Object.keys(rc.inputs)) expect(RES[k], k).toBeTruthy()
    for (const b of BUILDINGS) for (const id of b.recipes ?? []) expect(REC[id], id).toBeTruthy()
  })
})
