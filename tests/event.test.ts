// Turbo Week: window maths, offline split, and speeding up running jobs.
import { describe, it, expect } from 'vitest'
import * as EV from '../src/game/event'
import * as E from '../src/game/engine'

const H = 3600000
const S = Date.parse(EV.EVENT.start), END = Date.parse(EV.EVENT.end)

describe('event window', () => {
  it('is one fixed window, start inclusive and end exclusive', () => {
    expect(EV.EVENT.mult).toBe(3)
    expect(EV.speedAt(S - 1)).toBe(1); expect(EV.speedAt(S)).toBe(3)
    expect(EV.speedAt(END - 1)).toBe(3); expect(EV.speedAt(END)).toBe(1)
    expect(EV.msLeft(END - H)).toBe(H)
  })
  it('splits offline time at both boundaries', () => {
    expect(EV.splitWindow(S - 2 * H, END + H)).toEqual([
      { from: S - 2 * H, to: S, mult: 1 }, { from: S, to: END, mult: 3 }, { from: END, to: END + H, mult: 1 }])
    expect(EV.splitWindow(S + H, S + 2 * H)).toEqual([{ from: S + H, to: S + 2 * H, mult: 3 }])
    expect(EV.splitWindow(5, 5)).toEqual([])
  })
  it('countdown time left respects the window end', () => {
    expect(EV.boostedLeft(3, S)).toBeCloseTo(1)
    expect(EV.boostedLeft(9, END - H)).toBeCloseTo(1 + 6) // 1h at 3x covers 3h, then 6h at normal speed
    expect(EV.boostedLeft(4, END)).toBe(4)
    expect(EV.countdown(6 * 86400e3 + 23 * H + 5)).toBe('6d 23h')
  })
})

describe('jobs during the event', () => {
  const withJob = (t0: number, kind: 'make' | 'build') => {
    const s = E.newGame('T', t0)
    s.plots[0] = { uid: 1, type: 'generator', level: 1, job: kind === 'make' ? { kind: 'make', res: 'power', qty: 60, q: 0, startH: s.hour, endH: s.hour + 6 } : { kind: 'build', endH: s.hour + 6 } }
    return s
  }
  it('a running job speeds up 3x from now on and finishes early', () => {
    const s = withJob(S, 'make')
    E.advanceReal(s, S + H) // 1 real hour = 3 hours of work
    const j = s.plots[0]!.job!
    expect(j.kind).toBe('make')
    expect(E.unitsDone(j as any, s.hour)).toBe(30)
    expect(E.jobLeft(s, j, S + H)).toBeCloseTo(1) // 3h of work left at 3x
    E.advanceReal(s, S + 2 * H + 1)
    expect(s.plots[0]!.job).toBeUndefined()
  })
  it('offline time before the start runs at normal speed', () => {
    const s = withJob(S - 3 * H, 'make')
    E.advanceReal(s, S + H) // 3h normal + 1h boosted = all 6h of work
    expect(s.plots[0]!.job).toBeUndefined()
    expect(s.log.some(l => l.includes('Turbo Week has started'))).toBe(true)
  })
  it('construction is not boosted', () => {
    const s = withJob(S, 'build')
    E.advanceReal(s, S + 3 * H)
    expect(s.plots[0]!.job?.kind).toBe('build')
  })
  it('the end notice fires once the window closes', () => {
    const s = E.newGame('T', END - H); E.advanceReal(s, END + H)
    expect(s.log.some(l => l.includes('Turbo Week has ended'))).toBe(true)
  })
})
