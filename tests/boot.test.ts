// Loading screen: real steps only, no minimum time.
import { describe, it, expect } from 'vitest'
import { progress, SKIP_MS, FADE_MS } from '../src/ui/Boot'

describe('boot screen', () => {
  it('progress is the share of finished real steps', () => {
    expect(progress(0, 3)).toBe(0); expect(progress(3, 3)).toBe(1); expect(progress(0, 0)).toBe(1)
  })
  it('has no show-only minimum: short grace period and fade', () => {
    expect(SKIP_MS).toBeLessThanOrEqual(500); expect(FADE_MS).toBeLessThanOrEqual(400)
  })
})
