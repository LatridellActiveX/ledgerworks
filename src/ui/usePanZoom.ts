// ============================================================================
// usePanZoom: gestures for the 2D map (see ./zoom.ts for the maths).
//
//  - Wheel / trackpad pinch (ctrl+wheel) / Safari gesture events: zoom around
//    the cursor. preventDefault stops the BROWSER from page-zooming, which is
//    what used to scale and push the HUD off-screen.
//  - Two fingers: pinch-zoom + pan. One finger / mouse drag when zoomed: pan.
//  - Listeners are native with { passive: false } (React's wheel/touch
//    handlers are passive, so they can't preventDefault).
//  - A drag of more than 6 px swallows the following click, so panning never
//    opens a plot by accident; a plain tap still works.
//  - The element gets `touch-action: none` in CSS (.flat-wrap.zoomable).
// ============================================================================
import { useEffect, useRef, useState, type RefObject } from 'react'
import { IDENTITY, clampPan, wheelFactor, zoomAt, type View } from './zoom'

export function usePanZoom(ref: RefObject<HTMLElement | null>, on: boolean) {
  const [view, setView] = useState<View>(IDENTITY)
  const cur = useRef(view); cur.current = view
  useEffect(() => {
    const el = ref.current
    if (!el || !on) return
    const box = () => el.getBoundingClientRect()
    const apply = (v: View) => { cur.current = v; setView(v) }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault() // no page zoom / page scroll over the map
      const b = box()
      apply(zoomAt(cur.current, wheelFactor(e.deltaY, e.ctrlKey), e.clientX - b.left, e.clientY - b.top, b.width, b.height))
    }
    // Safari desktop trackpad pinch fires gesture* events instead of ctrl+wheel.
    let gk = 1
    const onGStart = (e: any) => { e.preventDefault(); gk = 1 }
    const onGChange = (e: any) => {
      e.preventDefault(); const b = box()
      apply(zoomAt(cur.current, e.scale / gk, e.clientX - b.left, e.clientY - b.top, b.width, b.height)); gk = e.scale
    }

    // Pointers: 1 = pan (when zoomed in), 2 = pinch.
    const pts = new Map<number, { x: number; y: number }>()
    let moved = 0, last: { x: number; y: number; d: number } | null = null
    const mid = () => { const [a, b] = [...pts.values()]; return b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) } : { x: a.x, y: a.y, d: 0 } }
    const down = (e: PointerEvent) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 1) moved = 0; last = mid() }
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const m = mid(), b = box()
      if (!last) { last = m; return }
      moved += Math.abs(m.x - last.x) + Math.abs(m.y - last.y)
      let v = cur.current
      if (pts.size >= 2 && last.d > 0) v = zoomAt(v, m.d / last.d, m.x - b.left, m.y - b.top, b.width, b.height)
      if (pts.size >= 2 || v.k > 1) v = clampPan({ k: v.k, x: v.x + m.x - last.x, y: v.y + m.y - last.y }, b.width, b.height)
      if (v !== cur.current) apply(v)
      last = m
    }
    const up = (e: PointerEvent) => { pts.delete(e.pointerId); last = pts.size ? mid() : null }
    // After a real drag/pinch, eat the click so no plot opens.
    const click = (e: MouseEvent) => { if (moved > 6) { e.stopPropagation(); e.preventDefault(); moved = 0 } }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('gesturestart', onGStart as any, { passive: false } as any)
    el.addEventListener('gesturechange', onGChange as any, { passive: false } as any)
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move)
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(t, up as any)
    el.addEventListener('click', click, true)
    return () => {
      el.removeEventListener('wheel', onWheel); el.removeEventListener('gesturestart', onGStart as any); el.removeEventListener('gesturechange', onGChange as any)
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move)
      for (const t of ['pointerup', 'pointercancel', 'pointerleave']) el.removeEventListener(t, up as any)
      el.removeEventListener('click', click, true)
    }
  }, [ref, on])
  return view
}
