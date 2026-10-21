// Real-time clock (1x) and conversion of old 4x saves.
import { describe, it, expect } from 'vitest'
import * as E from '../src/game/engine'
import { migrate, toRealTime } from '../src/game/save'
import { GAME_SPEED, SPEED_SWITCH_AT } from '../src/game/engine-constants'
import { worldHour } from '../src/game/seasons'

describe('real time', () => {
  it('runs at 1x and bubbles stay 2 real minutes', () => {
    expect(GAME_SPEED).toBe(1)
    expect(E.BUBBLE_H).toBeCloseTo(2 / 60)
  })
  it('old 4x saves keep real end times and progress', () => {
    const old: any = E.newGame('T', 0); delete old.clock
    old.hour = 100
    old.plots[0] = { uid: 1, type: 'generator', level: 1, job: { kind: 'make', res: 'power', qty: 10, q: 0, startH: 92, endH: 108 } }
    old.bonds = [{ id: 1, amount: 5000, rate: 0.01, soldH: 60 }]
    const s = migrate(JSON.parse(JSON.stringify(old)))
    const j = s.plots[0]!.job as any
    // 8 game hours left at 4x = 2 real hours = 2 game hours at 1x.
    expect(j.endH).toBe(102); expect(j.startH).toBe(98)
    // Progress fraction unchanged (50%).
    expect((s.hour - j.startH) / (j.endH - j.startH)).toBeCloseTo(0.5)
    expect(s.bonds![0].soldH).toBe(90)
    expect(s.clock).toBe(1)
    // Idempotent: converting again changes nothing.
    expect((toRealTime(s) as any).plots[0].job.endH).toBe(102)
  })
  it('world clock is continuous across the switch', () => {
    const a = worldHour(SPEED_SWITCH_AT - 1000), b = worldHour(SPEED_SWITCH_AT + 1000)
    expect(b - a).toBeLessThan(0.01)
    expect(worldHour(SPEED_SWITCH_AT + 3600000) - worldHour(SPEED_SWITCH_AT)).toBeCloseTo(1)
  })
})
