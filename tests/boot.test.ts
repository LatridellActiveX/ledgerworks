// Boot screen: real versions, staggered rows, holds until real tasks finish.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { bootRows, showProg, MIN_MS } from '../src/ui/Boot'

describe('boot screen', () => {
  it('shows installed versions from package.json', () => {
    const rows = bootRows('3d'), v = (p: string) => JSON.parse(readFileSync(`node_modules/${p}/package.json`, 'utf8')).version
    expect(rows.find(r => r.id === 'react')!.ver).toBe(v('react'))
    expect(rows.find(r => r.id === 'three')!.ver).toBe(v('three'))
  })
  it('is staggered and fits in the minimum time', () => {
    const rows = bootRows('3d')
    expect(new Set(rows.map(r => r.start)).size).toBe(rows.length)
    expect(Math.max(...rows.map(r => r.start + r.ms))).toBeLessThanOrEqual(MIN_MS)
  })
  it('a bar holds below 100% until its real task is done', () => {
    const r = bootRows('3d').find(r => r.id === 'three')!
    expect(showProg(r, 99999, false)).toBeLessThan(0.93)
    expect(showProg(r, 99999, true)).toBeCloseTo(1)
  })
})
