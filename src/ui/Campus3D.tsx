// Wrapper that lazy-loads the Three.js campus and falls back to the 2D SVG
// campus when WebGL is missing, the bundle fails to load, or the player
// switches to 2D. The 3D bundle is a separate file (/scene3d.js), so the
// game shows instantly and the 3D view fades in when ready.
import { useEffect, useRef, useState } from 'react'
import type { GameState } from '../game/engine'
import { Campus } from './campus'
import * as E from '../game/engine'
import { ResIcon } from './art'
import { money, num } from './fmt'

/** A collect bubble the campus shows above a building. */
export interface Bubble { i: number; kind: 'goods' | 'cash'; res: string; units: number; cents: number }

/**
 * Collect bubbles drawn as HTML over the campus (3D canvas or 2D SVG). The
 * overlay ignores the pointer, so drags still pan the camera; only the
 * bubbles themselves (48px+ targets) take taps. Positions follow the camera
 * every frame.
 */
function Bubbles({ list, posOf, onCollect }: { list: Bubble[]; posOf: (i: number) => { x: number; y: number } | null; onCollect: (i: number, r: DOMRect) => void }) {
  const refs = useRef(new Map<number, HTMLButtonElement>())
  const pos = useRef(posOf); pos.current = posOf
  useEffect(() => {
    let raf = 0
    const loop = () => {
      for (const [i, el] of refs.current) {
        const p = pos.current(i)
        if (!p) { el.style.display = 'none'; continue }
        el.style.display = ''
        el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <div className="bubbles">{list.map(b => (
    <button key={b.i} className={`bubble ${b.kind}`} ref={el => { if (el) refs.current.set(b.i, el); else refs.current.delete(b.i) }}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); onCollect(b.i, e.currentTarget.getBoundingClientRect()) }}
      title={b.kind === 'goods' ? 'Collect goods' : 'Collect money'}>
      {b.kind === 'goods' ? <ResIcon id={b.res} size={22} /> : <span className="coin">$</span>}
      <b>{b.kind === 'goods' ? `+${num(b.units)}` : `+${money(b.cents / 100)}`}</b>
    </button>))}</div>
}

/** Ready bubbles for every busy building. */
export const bubblesFor = (s: GameState): Bubble[] => s.plots.flatMap((bd, i) => { const p = E.bubbleReady(s, bd); return p ? [{ i, ...p }] : [] })

type Handle = { update(s: unknown): void; dispose(): void; rotate?(dir: 1 | -1): void; screenPos?(i: number): { x: number; y: number } | null }
declare const __BUILD_ID__: string

/** Load the 3D module: a separate file in production, a normal import in dev. */
async function loadScene(): Promise<any> {
  if (import.meta.env.DEV) return import('../scene3d/index')
  return import(/* @vite-ignore */ `/scene3d.js?v=${__BUILD_ID__}`)
}

export function Campus3D({ s, slots, sel, onPick, mode, onCollect }: { s: GameState; slots: number; sel: number | null; onPick: (i: number) => void; mode: '3d' | '2d'; onCollect: (i: number, r: DOMRect) => void }) {
  const flat = useRef<HTMLDivElement>(null)
  const bubbles = bubblesFor(s)
  const box = useRef<HTMLDivElement>(null)
  const handle = useRef<Handle | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const pick = useRef(onPick); pick.current = onPick

  useEffect(() => {
    if (mode !== '3d') return
    let dead = false
    loadScene().then(m => {
      if (dead || !box.current) return
      if (!m.webglOK()) { setState('failed'); return }
      handle.current = m.mount(box.current, { onPick: (i: number) => pick.current(i) })
      setState('ready')
    }).catch(() => setState('failed'))
    return () => { dead = true; handle.current?.dispose(); handle.current = null }
  }, [mode])

  // Push a light snapshot of the state into the scene every render.
  useEffect(() => {
    handle.current?.update({
      plots: s.plots.map(b => b ? { type: b.type, level: b.level, busy: !!b.job && b.job.kind !== 'build', building: b.job?.kind === 'build' } : null),
      slots, hour: s.hour, sel,
    })
  })

  if (mode === '2d' || state === 'failed') {
    // 2D: bubbles sit above each tile's diamond pad.
    const pos2d = (i: number) => {
      const root = flat.current, pad = root?.querySelectorAll('.tile .pad')[i] as SVGGraphicsElement | undefined
      if (!root || !pad) return null
      const r = pad.getBoundingClientRect(), o = root.getBoundingClientRect()
      return { x: r.left + r.width / 2 - o.left, y: r.top - o.top + r.height * 0.1 - 24 }
    }
    return <div className="flat-wrap" ref={flat}><Campus s={s} slots={slots} sel={sel} onPick={onPick} /><Bubbles list={bubbles} posOf={pos2d} onCollect={onCollect} /></div>
  }
  return (
    <div className="scene3d" ref={box}>
      {state === 'ready' && <Bubbles list={bubbles} posOf={i => handle.current?.screenPos?.(i) ?? null} onCollect={onCollect} />}
      {state === 'loading' && <div className="scene-loading"><span className="spinner" /> Building your campus…</div>}
      {/* Turn the isometric view in 90-degree steps (also Q / E). */}
      {state === 'ready' && <div className="rot-tools">
        <button title="Turn view left (Q)" onClick={() => handle.current?.rotate?.(-1)}>⟲</button>
        <button title="Turn view right (E)" onClick={() => handle.current?.rotate?.(1)}>⟳</button>
      </div>}
    </div>
  )
}
