// Engine tests: production timing, wages, retail saturation, saves.
import { describe, it, expect } from 'vitest'
import * as E from '../src/game/engine'
import { saveGame, loadGame, exportCode, importCode, type KV } from '../src/game/save'

function readyGame() {
  const s = E.newGame('Test', 0)
  E.construct(s, 0, 'generator')
  E.construct(s, 1, 'market')
  E.advanceTo(s, s.hour + 10) // finish construction
  return s
}

describe('production timing', () => {
  it('takes qty / (rate * level) hours and pays wages up front', () => {
    const s = readyGame(), cash = s.cash
    expect(E.startMake(s, 0, 'power', 1200)).toBeNull() // 600/h at level 1 -> 2 h
    const job = s.plots[0]!.job as any
    expect(job.endH - job.startH).toBeCloseTo(2)
    expect(cash - s.cash).toBeCloseTo(40 * 2) // windmill wage 40/h
    E.advanceTo(s, s.hour + 1.9)
    expect(E.haveQty(s, 'power')).toBe(0)
    E.advanceTo(s, s.hour + 0.2)
    expect(E.haveQty(s, 'power')).toBe(1200)
  })
  it('a level 2 building is twice as fast', () => {
    expect(E.makeHours('power', 1200, 2)).toBeCloseTo(1)
  })
  it('refuses when inputs are missing', () => {
    const s = readyGame()
    E.construct(s, 2, 'orchard'); E.advanceTo(s, s.hour + 5)
    expect(E.startMake(s, 2, 'apples', 10)).toMatch(/Need/)
  })
})

describe('retail saturation', () => {
  it('selling a lot raises saturation and slows the next sale', () => {
    const s = readyGame()
    const before = E.sellRate(s, 'apples', 0, E.fairPrice('apples', 0))
    s.soldToday.apples = 2000; E.rollDay(s)
    expect(s.saturation.apples).toBeGreaterThan(1)
    expect(E.sellRate(s, 'apples', 0, E.fairPrice('apples', 0))).toBeLessThan(before)
  })
  it('higher quality and lower price sell faster', () => {
    const s = readyGame(), p = E.fairPrice('apples', 0)
    expect(E.sellRate(s, 'apples', 3, p)).toBeGreaterThan(E.sellRate(s, 'apples', 0, p))
    expect(E.sellRate(s, 'apples', 0, p * 0.8)).toBeGreaterThan(E.sellRate(s, 'apples', 0, p))
  })
  it('a finished sale pays revenue and counts toward saturation', () => {
    const s = readyGame()
    E.buyWholesale(s, 'apples', 100)
    const cash = s.cash
    expect(E.startSell(s, 1, 'apples', 0, 100, 3)).toBeNull()
    E.advanceTo(s, s.hour + 72)
    expect(s.cash).toBeGreaterThan(cash)
  })
})

describe('saves', () => {
  const mem = (): KV => { const m = new Map<string, string>(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: k => void m.delete(k) } }
  it('round-trips through storage and save codes', () => {
    const s = readyGame(), kv = mem()
    saveGame(s, kv)
    expect(loadGame(kv)).toEqual(s)
    expect(importCode(exportCode(s))).toEqual(s)
  })
  it('a missing save starts a new game', () => {
    expect(loadGame(mem()).cash).toBe(E.START_CASH)
  })
})
