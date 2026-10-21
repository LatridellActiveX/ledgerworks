// Sound settings (mute + volume) persistence, throttling, and choosing sounds.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as S from '../src/ui/sound'
import { actionSfx, tickSfx } from '../src/ui/sfxFor'
import * as E from '../src/game/engine'

function fakeStorage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0, _m: m }
}

describe('sound settings', () => {
  let ls: ReturnType<typeof fakeStorage>
  beforeEach(() => { ls = fakeStorage(); vi.stubGlobal('localStorage', ls); S.resetThrottle() })

  it('is muted by default and keeps the old on/off key', () => {
    expect(S.soundOn()).toBe(false)
    S.setSound(true); expect(ls._m.get('ledgerworks-sound')).toBe('on'); expect(S.soundOn()).toBe(true)
    S.setSound(false); expect(ls._m.get('ledgerworks-sound')).toBe('off'); expect(S.soundOn()).toBe(false)
  })
  it('respects an existing "on" setting from the old helper', () => {
    ls.setItem('ledgerworks-sound', 'on'); expect(S.soundOn()).toBe(true)
  })
  it('volume defaults to 70, persists and is clamped to 0-100', () => {
    expect(S.volume()).toBe(S.DEFAULT_VOLUME)
    expect(S.setVolume(35)).toBe(35); expect(ls._m.get('ledgerworks-volume')).toBe('35'); expect(S.volume()).toBe(35)
    expect(S.setVolume(150)).toBe(100); expect(S.setVolume(-5)).toBe(0); expect(S.volume()).toBe(0)
    expect(S.setVolume(42.6)).toBe(43)
    ls.setItem('ledgerworks-volume', 'junk'); expect(S.volume()).toBe(S.DEFAULT_VOLUME)
  })
  it('works without localStorage (defaults, no crash)', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(S.soundOn()).toBe(false); expect(S.volume()).toBe(70)
    expect(() => { S.setSound(true); S.setVolume(10) }).not.toThrow()
  })
  it('gain grows with volume, 0 is silent', () => {
    expect(S.gainFor(0)).toBe(0); expect(S.gainFor(50)).toBeLessThan(S.gainFor(100))
  })
  it('sfx never throws without Web Audio', () => {
    S.setSound(true)
    for (const x of S.SFX_LIST) expect(() => S.sfx(x.id)).not.toThrow()
    expect(() => S.sfx('pop')).not.toThrow()
  })
})

describe('throttle', () => {
  beforeEach(() => S.resetThrottle())
  it('blocks rapid repeats of the same sound', () => {
    expect(S.shouldPlay('coin', 0)).toBe(true)
    expect(S.shouldPlay('coin', 20)).toBe(false)
    expect(S.shouldPlay('coin', 200)).toBe(true)
  })
  it('caps overlapping voices', () => {
    const kinds = ['tap', 'collect', 'coin', 'produce', 'done', 'build', 'upgrade', 'buy'] as const
    const ok = kinds.map(k => S.shouldPlay(k, 0)).filter(Boolean).length
    expect(ok).toBe(S.MAX_VOICES)
    expect(S.shouldPlay('error', 1)).toBe(true) // errors always get through
  })
  it('pitch ladder climbs on quick repeats and resets after a pause', () => {
    expect(S.ladderStep(0)).toBe(0); expect(S.ladderStep(300)).toBe(1); expect(S.ladderStep(600)).toBe(2)
    expect(S.ladderStep(5000)).toBe(0)
  })
})

describe('choosing sounds', () => {
  const g = () => { const s = E.newGame('Test', 0); s.cash = 1e6; return s }
  const run = (s: E.GameState, f: (x: E.GameState) => string | null | void) => { const n = structuredClone(s); const err = f(n); return actionSfx(s, n, err) }
  it('build, upgrade, error, level up', () => {
    const s = g()
    const t = Object.keys((E as any).BLD ?? {})[0]
    expect(run(s, x => { x.plots[0] = { uid: 99, type: 'x', level: 1, job: { kind: 'build', endH: 5 } } })).toBe('build')
    s.plots[0] = { uid: 99, type: t ?? 'x', level: 1 }
    expect(run(s, x => { x.plots[0]!.level = 2; x.plots[0]!.job = { kind: 'build', endH: 9 } })).toBe('upgrade')
    expect(run(s, () => 'Not enough cash')).toBe('error')
    expect(run(s, x => { x.xp = E.xpForLevel(E.companyLevel(s.xp) + 1) })).toBe('levelup')
  })
  it('market buy and sell', () => {
    const s = g(); s.stock = { 'a@0': 10 } as any
    expect(run(s, x => { x.cash -= 5; (x.stock as any)['a@0'] = 20 })).toBe('buy')
    expect(run(s, x => { x.cash += 5; (x.stock as any)['a@0'] = 2 })).toBe('sell')
  })
  it('job finishing on the clock', () => {
    const a = g(); a.hour = 0; a.plots[0] = { uid: 1, type: 'x', level: 1, job: { kind: 'make', res: 'a', qty: 5, q: 0, startH: 0, endH: 2 } }
    const b = structuredClone(a); b.hour = 3; b.plots[0]!.job = undefined
    expect(tickSfx(a, b)).toBe('done')
    a.plots[0]!.job = { kind: 'build', endH: 2 }
    expect(tickSfx(a, b)).toBe('upgrade')
    expect(tickSfx(a, { ...b, company: 'Other' })).toBe(null)
  })
})
