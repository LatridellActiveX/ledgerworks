// Tutorial logic: steps advance only on real actions, existing players skip,
// goals unlock by level with the executive last, tips show once.
import { describe, expect, it } from 'vitest'
import * as E from '../src/game/engine'
import * as TU from '../src/game/tutorial'

const kv = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } }

describe('tutorial', () => {
  it('new players start it, existing players never see it', () => {
    const s = E.newGame('A', 0)
    expect(TU.loadTut(s, kv()).done).toBe(false)
    s.stats.built = 2
    expect(TU.loadTut(s, kv()).done).toBe(true)
  })
  it('resumes saved progress', () => {
    const store = kv(); const s = E.newGame('A', 0)
    TU.saveTut({ ...TU.blankTut(), step: 4 }, store)
    expect(TU.loadTut(s, store).step).toBe(4)
  })
  it('does not advance until the player acts, then boosts the orchard', () => {
    const s = E.newGame('A', 0)
    let t = TU.blankTut()
    expect(TU.advance(t, s, 'map').t.step).toBe(0)
    expect(E.construct(s, 0, 'orchard')).toBeNull()
    t = TU.advance(t, s, 'building').t
    expect(t.step).toBe(1)
    expect(TU.boost(s)).toBe(true)
    expect(s.plots[0]!.job!.endH - s.hour).toBeLessThan(0.01)
  })
  it('finishing pays $1,000 and the first star', () => {
    const s = E.newGame('A', 0), c = s.cash
    TU.giveFinishReward(s)
    expect(s.cash).toBe(c + 1000)
    expect(E.companyLevel(s.xp)).toBe(2)
  })
  it('goals unlock by level; hire an executive is last', () => {
    expect(TU.GOALS.map(g => g.id).slice(0, 3)).toEqual(['juice', 'report', 'route'])
    expect(TU.GOALS.at(-1)!.id).toBe('exec')
    const lv = TU.GOALS.map(g => g.level); expect([...lv].sort((a, b) => a - b)).toEqual(lv)
    const s = E.newGame('A', 0), t = TU.blankTut()
    expect(TU.goalState(TU.GOALS[1], s, t)).toBe('locked')
    s.xp = E.xpForLevel(4); t.report = true
    expect(TU.claimGoal(s, t, 'report')).toBeNull()
    expect(TU.goalState(TU.GOALS[1], s, t)).toBe('claimed')
  })
  it('tips show once and not when turned off', () => {
    const t = TU.blankTut()
    expect(TU.tipFor(t, 'routes')).toBeTruthy()
    expect(TU.tipFor({ ...t, tips: ['routes'] }, 'routes')).toBeNull()
    expect(TU.tipFor({ ...t, off: true }, 'routes')).toBeNull()
  })
})
