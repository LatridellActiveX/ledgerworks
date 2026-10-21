// Market news: deterministic stories, their effect on shop sales and prices.
import { describe, it, expect } from 'vitest'
import * as N from '../src/game/news'
import * as E from '../src/game/engine'
import { RES } from '../src/game/data'

describe('market news', () => {
  it('every story only names real goods and has a real effect', () => {
    for (const t of N.NEWS) {
      expect(t.goods.length).toBeGreaterThan(0)
      for (const g of t.goods) expect(RES[g], `${t.id}: ${g}`).toBeTruthy()
      expect(t.mult).not.toBe(1)
    }
  })
  it('day 0 is always quiet and the same day always gives the same story', () => {
    expect(N.storyStarting(0)).toBeNull()
    expect(N.activeStories(0)).toEqual([])
    for (let d = 1; d < 50; d++) expect(N.storyStarting(d)).toEqual(N.storyStarting(d))
  })
  it('stories last 2-3 days and are active exactly on those days', () => {
    let seen = 0
    for (let d = 1; d < 200; d++) {
      const st = N.storyStarting(d)
      if (!st) continue
      seen++
      expect(st.endDay - st.startDay).toBeGreaterThanOrEqual(2)
      expect(st.endDay - st.startDay).toBeLessThanOrEqual(3)
      expect(N.activeStories(d).some(a => a.startDay === d)).toBe(true)
      expect(N.activeStories(st.endDay).some(a => a.startDay === d)).toBe(false)
    }
    expect(seen).toBeGreaterThan(100) // most days have news, some are quiet
  })
  it('shops sell a story\'s goods faster (or slower) while it runs', () => {
    const d = [...Array(100).keys()].find(x => N.storyStarting(x + 1)?.t.mult! > 1)! + 1
    const st = N.storyStarting(d)!
    const g = st.t.goods[0]
    const s = E.newGame('T')
    s.hour = 0
    const before = E.sellRate(s, g, 0, 10)
    s.hour = d * 24 + 1
    expect(N.newsRetail(g, s.hour)).toBeGreaterThanOrEqual(st.t.mult - 1e-9)
    expect(E.sellRate(s, g, 0, 10) / before).toBeCloseTo(N.newsRetail(g, s.hour) / N.newsRetail(g, 0), 6)
    expect(N.newsPrice(g, s.hour)).toBeCloseTo(1 + (N.newsRetail(g, s.hour) - 1) / 2, 9)
  })
  it('rumor shows tomorrow\'s story and past stories have ended', () => {
    expect(N.rumor(5)).toEqual(N.storyStarting(6))
    for (const p of N.pastStories(20)) expect(p.endDay).toBeLessThanOrEqual(20)
  })
})
