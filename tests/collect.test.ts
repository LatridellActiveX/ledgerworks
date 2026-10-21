// Partial collection: totals must equal the full job, whatever the timing.
import { describe, it, expect } from 'vitest'
import * as E from '../src/game/engine'
import { exportCode, importCode } from '../src/game/save'

const unit = (s: E.GameState, res: string) => Object.entries(s.stock).filter(([k]) => k.startsWith(res + '|')).reduce((t, [, v]) => t + v, 0)
function makeJob(qty: number) {
  const s = E.newGame('T', 0); s.plots[0] = { uid: 1, type: 'generator', level: 1 }
  expect(E.startMake(s, 0, 'power', qty)).toBeNull()
  return s
}
function sellJob(qty: number, price = 2.37) {
  const s = E.newGame('T', 0); s.plots[0] = { uid: 1, type: 'market', level: 1 }; s.stock['apples|2'] = qty
  expect(E.startSell(s, 0, 'apples', 2, qty, price)).toBeNull()
  return s
}
const job = (s: E.GameState) => s.plots[0]!.job as any

describe('partial collection', () => {
  it('production: random collections + finish = exactly qty units', () => {
    for (const qty of [1, 7, 333, 10_001]) {
      const s = makeJob(qty), j = job(s)
      for (let k = 0; k < 9; k++) { E.advanceTo(s, j.startH + (j.endH - j.startH) * Math.random() * 0.99); E.collect(s, 0) }
      E.advanceTo(s, j.endH + 1)
      expect(unit(s, 'power')).toBe(qty)
      expect(s.plots[0]!.job).toBeUndefined()
    }
  })
  it('sales: collected cents + final payout = full revenue to the cent', () => {
    for (const qty of [1, 13, 999]) {
      const s = sellJob(qty), j = job(s), cash0 = s.cash
      for (let k = 0; k < 7; k++) { E.advanceTo(s, j.startH + (j.endH - j.startH) * (k + Math.random()) / 8); E.collect(s, 0) }
      E.advanceTo(s, j.endH + 1e-6)
      // Cash delta is revenue minus any day-roll costs; compare with no-collection twin.
      const t = sellJob(qty); E.advanceTo(t, j.endH + 1e-6)
      expect(Math.round((s.cash - cash0) * 100)).toBe(Math.round((t.cash - cash0) * 100))
    }
  })
  it('amount = 1: no bubble or collect until the whole unit is done', () => {
    const s = makeJob(1), j = job(s)
    E.advanceTo(s, j.startH + (j.endH - j.startH) * 0.9)
    expect(E.bubbleReady(s, s.plots[0])).toBeNull()
    expect(E.collect(s, 0)).toMatch(/Nothing ready/)
    E.advanceTo(s, j.endH + 1); expect(unit(s, 'power')).toBe(1)
  })
  it('bubbles appear only every 2 real minutes and reset on collect', () => {
    const s = makeJob(100000), j = job(s)
    E.advanceTo(s, j.startH + E.BUBBLE_H * 0.5); expect(E.bubbleReady(s, s.plots[0])).toBeNull()
    E.advanceTo(s, j.startH + E.BUBBLE_H); expect(E.bubbleReady(s, s.plots[0])!.units).toBeGreaterThan(0)
    E.collect(s, 0); expect(E.bubbleReady(s, s.plots[0])).toBeNull()
    E.advanceTo(s, s.hour + E.BUBBLE_H * 1.01); expect(E.bubbleReady(s, s.plots[0])).not.toBeNull()
  })
  it('rush pays only the uncollected rest', () => {
    const s = makeJob(5000), j = job(s)
    E.advanceTo(s, j.startH + (j.endH - j.startH) / 3); E.collect(s, 0)
    s.cash = 1e9; expect(E.rush(s, 0)).toBeNull()
    expect(unit(s, 'power')).toBe(5000)
  })
  it('cancel keeps what is done, returns unsold shop goods, pays sold cents', () => {
    const s = makeJob(1000), j = job(s)
    E.advanceTo(s, j.startH + (j.endH - j.startH) / 2); E.collect(s, 0)
    E.advanceTo(s, j.startH + (j.endH - j.startH) * 0.75)
    expect(E.cancelJob(s, 0)).toBeNull()
    expect(unit(s, 'power')).toBe(750)
    const t = sellJob(100, 3), tj = job(t), c0 = t.cash
    E.advanceTo(t, tj.startH + (tj.endH - tj.startH) * 0.4); E.collect(t, 0)
    E.advanceTo(t, tj.startH + (tj.endH - tj.startH) * 0.6)
    E.cancelJob(t, 0)
    expect(unit(t, 'apples')).toBe(40)
    expect(Math.round((t.cash - c0) * 100)).toBe(60 * 300)
  })
  it('collected-so-far survives save/load', () => {
    const s = makeJob(2000), j = job(s)
    E.advanceTo(s, j.startH + (j.endH - j.startH) / 2); E.collect(s, 0)
    const got = job(s).got
    const r = importCode(exportCode(s))
    expect((r.plots[0]!.job as any).got).toBe(got)
    E.advanceTo(r, j.endH + 1); expect(unit(r, 'power')).toBe(2000)
  })
  it('scrap is still blocked while a job runs', () => {
    const s = makeJob(10)
    expect(E.scrap(s, 0)).toMatch(/Wait/)
  })
})
