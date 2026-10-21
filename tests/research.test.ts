// Research: patents roll at ~1/7, unlock quality, and the input+1 rule.
import { describe, it, expect } from 'vitest'
import * as E from '../src/game/engine'
import * as R from '../src/game/research'

const lvl6 = () => { const s = E.newGame('T', 0); s.xp = E.xpForLevel(6); s.cash = 1e7; return s }

describe('research', () => {
  it('locked below level 6', () => {
    const s = E.newGame('T', 0); E.addStock(s, 'rn_farm', 0, 10)
    expect(E.research(s, 'apples', 10)).toMatch(/level 6/)
  })
  it('about 1 patent per 7 notes and quality from the table', () => {
    const s = lvl6(); E.addStock(s, 'rn_farm', 0, 7000)
    expect(E.research(s, 'apples', 7000)).toBeNull()
    expect(s.patents.apples).toBeGreaterThan(850); expect(s.patents.apples).toBeLessThan(1150)
    expect(R.researchedQ(s, 'apples')).toBe(3) // 450 needed for Q3, 2050 for Q4
    expect(E.haveQty(s, 'rn_farm')).toBe(0)
  })
  it('output quality is at most lowest input + 1', () => {
    const s = lvl6(); s.patents.apples = 500 // Q3 researched
    E.construct(s, 0, 'orchard'); E.advanceTo(s, s.hour + 5)
    E.addStock(s, 'seeds', 0, 10); E.addStock(s, 'water', 2, 20)
    expect(E.startMake(s, 0, 'apples', 10)).toBeNull()
    expect((s.plots[0]!.job as any).q).toBe(1) // seeds Q0 -> max Q1
  })
  it('raw goods with no inputs reach their researched quality', () => {
    const s = lvl6(); s.patents.power = 60 // Q2
    E.construct(s, 0, 'generator'); E.advanceTo(s, s.hour + 5)
    E.startMake(s, 0, 'power', 100)
    expect((s.plots[0]!.job as any).q).toBe(2)
  })
})
