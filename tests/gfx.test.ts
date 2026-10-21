// Graphics quality tiers (game/gfx.ts).
import { describe, it, expect } from 'vitest'
import { detectTier, pixelRatioFor, PRESETS, lower } from '../src/game/gfx'
describe('graphics quality', () => {
  it('Galaxy A-series class phones start at medium', () => {
    expect(detectTier({ memory: 4, cores: 8, dpr: 2.8, mobile: true })).toBe('medium') // A15/A25
    expect(detectTier({ memory: 8, cores: 8, dpr: 2.625, mobile: true })).toBe('medium') // A54/A55 (8 cores, dense screen)
  })
  it('weak devices start low, desktops high', () => {
    expect(detectTier({ memory: 2, cores: 4, dpr: 2, mobile: true })).toBe('low')
    expect(detectTier({ memory: 16, cores: 12, dpr: 1, mobile: false })).toBe('high')
  })
  it('caps pixel ratio on phones', () => {
    expect(pixelRatioFor(PRESETS.high, { dpr: 2.8, mobile: true })).toBe(1.5)
    expect(pixelRatioFor(PRESETS.low, { dpr: 2.8, mobile: true })).toBe(1)
  })
  it('steps down', () => { expect(lower('high')).toBe('medium'); expect(lower('medium')).toBe('low'); expect(PRESETS.low.shadows).toBe(false) })
})
