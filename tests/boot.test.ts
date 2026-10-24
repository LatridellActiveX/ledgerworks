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

import { newEntries } from '../src/ui/UpdatePrompt'
describe('update pop-up notes', () => {
  const e = (id: string) => ({ id, date: '', title: id, notes: [id + ' note'] })
  it('shows only entries newer than this tab, from the new build', () => {
    expect(newEntries({ buildId: 'x', latest: [e('c'), e('b'), e('a')] }, 'a').map(x => x.id)).toEqual(['c', 'b'])
  })
  it('falls back safely when version.json has no notes', () => {
    expect(newEntries({ buildId: 'x' }, 'a')).toEqual([])
    expect(newEntries({ buildId: 'x', latest: 'junk' as any }, 'a')).toEqual([])
  })
})
