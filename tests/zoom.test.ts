// 2D map zoom maths (src/ui/zoom.ts).
import { describe, expect, it } from 'vitest'
import { IDENTITY, MAX_ZOOM, MIN_ZOOM, clampPan, zoomAt, wheelFactor } from '../src/ui/zoom'

describe('2D map zoom', () => {
  it('clamps zoom between MIN and MAX', () => {
    expect(zoomAt(IDENTITY, 100, 0, 0, 390, 844).k).toBe(MAX_ZOOM)
    expect(zoomAt(IDENTITY, 0.01, 0, 0, 390, 844).k).toBe(MIN_ZOOM)
  })
  it('keeps the point under the fingers fixed', () => {
    const v = zoomAt(IDENTITY, 2, 100, 200, 390, 844)
    expect((100 - v.x) / v.k).toBeCloseTo(100); expect((200 - v.y) / v.k).toBeCloseTo(200)
  })
  it('never pans the map off the screen', () => {
    expect(clampPan({ k: 1, x: 50, y: -50 }, 390, 844)).toEqual({ k: 1, x: 0, y: 0 })
    expect(clampPan({ k: 2, x: -9999, y: 10 }, 390, 844)).toEqual({ k: 2, x: -390, y: 0 })
  })
  it('wheel up zooms in, down zooms out', () => {
    expect(wheelFactor(-100, false)).toBeGreaterThan(1); expect(wheelFactor(100, true)).toBeLessThan(1)
  })
})
