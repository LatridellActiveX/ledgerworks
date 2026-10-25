// Owning a Crate yard unlocks the Sawmill early (engine EARLY_UNLOCK), so
// the Crate yard's boards can be made before company level 3.
import { describe, expect, it } from 'vitest'
import * as E from '../src/game/engine'

describe('sawmill early unlock', () => {
  it('locked at level 1 without a Crate yard, open with one', () => {
    const s = E.newGame('A', 0)
    s.cash = 1e6
    expect(E.companyLevel(s.xp)).toBeLessThan(3)
    expect(E.buildingUnlocked(s, 'sawmill')).toBe(false)
    expect(E.resUnlocked(s, 'boards')).toBe(false)
    expect(E.construct(s, 0, 'sawmill')).toMatch(/level/)
    s.plots[0] = { uid: 99, type: 'crateyard', level: 1 }
    expect(E.buildingUnlocked(s, 'sawmill')).toBe(true)
    expect(E.resUnlocked(s, 'boards')).toBe(true)
    expect(E.construct(s, 1, 'sawmill')).toBeNull()
    expect(s.plots[1]!.type).toBe('sawmill')
  })
})
