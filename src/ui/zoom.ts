// ============================================================================
// 2D map pan + zoom (pure maths, unit-tested in tests/zoom.test.ts).
//
// The zoom is a CSS transform on the MAP LAYER ONLY (the <svg> inside
// .flat-wrap): translate(x, y) scale(k), origin top-left. The HUD lives
// outside that layer, so it never scales or moves. Activity badges and
// collect bubbles use the SVG's screen matrix, which already includes the
// transform, so they stay pinned to their buildings.
// ============================================================================
export interface View { k: number; x: number; y: number }
export const MIN_ZOOM = 1   // the whole campus fits the screen
export const MAX_ZOOM = 3.5 // close enough to read a single building
export const IDENTITY: View = { k: 1, x: 0, y: 0 }

export const clampK = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k))

/**
 * Keep the map covering the box: at zoom k the layer is k*w by k*h, so its
 * left edge may go from (w - k*w) to 0, same for the top. At k = 1 that
 * forces x = y = 0 (no panning the map off the screen).
 */
export function clampPan(v: View, w: number, h: number): View {
  const cx = (n: number, size: number) => Math.min(0, Math.max(size - v.k * size, n))
  return { k: v.k, x: cx(v.x, w), y: cx(v.y, h) }
}

/**
 * Zoom by `factor` around the screen point (px, py) in box coordinates, so
 * the spot under the fingers / cursor stays put. Result is clamped.
 */
export function zoomAt(v: View, factor: number, px: number, py: number, w: number, h: number): View {
  const k = clampK(v.k * factor)
  const f = k / v.k
  return clampPan({ k, x: px - (px - v.x) * f, y: py - (py - v.y) * f }, w, h)
}

/** Wheel delta -> zoom factor. Trackpad pinch (ctrlKey) sends small deltas, so it is scaled up. */
export const wheelFactor = (deltaY: number, ctrlKey: boolean) => Math.exp(-deltaY * (ctrlKey ? 0.01 : 0.0015))
