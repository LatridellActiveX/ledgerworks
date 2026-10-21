// Activity states drive the campus animations, badges and panel chips.
import { describe, it, expect } from 'vitest'
import * as E from '../src/game/engine'
import { activityOf } from '../src/game/activity'

describe('activity state', () => {
  it('idle, producing, selling and empty plots', () => {
    const s = E.newGame('T', 0)
    expect(activityOf(s, null)).toBeNull()
    s.plots[0] = { uid: 1, type: 'generator', level: 1 }
    expect(activityOf(s, s.plots[0])!.state).toBe('idle')
    expect(E.startMake(s, 0, 'power', 100)).toBeNull()
    const j = s.plots[0]!.job as any
    s.hour = (j.startH + j.endH) / 2
    const a = activityOf(s, s.plots[0])!
    expect(a.state).toBe('make'); expect(a.prog).toBeCloseTo(0.5); expect(a.done).toBe(50); expect(a.res).toBe('power')
    s.plots[1] = { uid: 2, type: 'market', level: 1 }; s.stock['apples|2'] = 10
    expect(E.startSell(s, 1, 'apples', 2, 10, 3)).toBeNull()
    const k = s.plots[1]!.job as any
    s.hour = k.endH
    const b = activityOf(s, s.plots[1])!
    expect(b.state).toBe('done'); expect(b.prog).toBe(1); expect(b.cents).toBe(3000)
  })
  it('progress never exceeds 1 and units match collection', () => {
    const s = E.newGame('T', 0); s.plots[0] = { uid: 1, type: 'generator', level: 1 }
    E.startMake(s, 0, 'power', 7)
    const j = s.plots[0]!.job as any
    for (const f of [0, 0.3, 0.99, 2]) { s.hour = j.startH + (j.endH - j.startH) * f; const a = activityOf(s, s.plots[0])!; expect(a.prog).toBeLessThanOrEqual(1); expect(a.done).toBe(E.unitsDone(j, s.hour)) }
  })
})
