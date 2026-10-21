// Wrapper that lazy-loads the Three.js campus and falls back to the 2D SVG
// campus when WebGL is missing, the bundle fails to load, or the player
// switches to 2D. The 3D bundle is a separate file (/scene3d.js), so the
// game shows instantly and the 3D view fades in when ready.
import { useEffect, useRef, useState } from 'react'
import type { GameState } from '../game/engine'
import { Campus, tilePos } from './campus'
import * as E from '../game/engine'
import { ResIcon } from './art'
import { dur, money, num } from './fmt'
import { activityOf, chipLabel } from '../game/activity'

/** A collect bubble the campus shows above a building. */
export interface Bubble { i: number; kind: 'goods' | 'cash'; res: string; units: number; cents: number }

/**
 * Follow plots on screen: every animation frame, move each registered element
 * to its plot's screen position (rounded to whole pixels so hit targets stay
 * still while the camera is still). Elements whose plot is off-screen hide.
 */
function useFollow<T extends HTMLElement>(posOf: (i: number) => { x: number; y: number } | null, dy = 0) {
  const refs = useRef(new Map<number, T>())
  const pos = useRef(posOf); pos.current = posOf
  useEffect(() => {
    let raf = 0
    const loop = () => {
      for (const [i, el] of refs.current) {
        const p = pos.current(i % 1000)
        if (!p) { el.style.display = 'none'; continue }
        el.style.display = ''
        const t = `translate(${Math.round(p.x)}px, ${Math.round(p.y + dy)}px) translate(-50%, -100%)`
        el.style.transform = t; el.style.setProperty('--t', t)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [dy])
  return (i: number) => (el: T | null) => { if (el) refs.current.set(i, el); else refs.current.delete(i) }
}

/**
 * Collect bubbles drawn as HTML over the campus (3D canvas or 2D SVG). The
 * overlay ignores the pointer, so drags still pan the camera; only the
 * bubbles take taps. Tap reliability: the <button> is a large fixed-size hit
 * box (76x64) that never animates; only the inner .face bobs, so the target
 * under the finger does not move.
 */
function Bubbles({ list, posOf, onCollect }: { list: Bubble[]; posOf: (i: number) => { x: number; y: number } | null; onCollect: (i: number, r: DOMRect) => void }) {
  const reg = useFollow<HTMLButtonElement>(posOf, -58)
  return <div className="bubbles">{list.map(b => (
    <button key={b.i} data-plot={b.i} className={`bubble ${b.kind}`} ref={reg(b.i)}
      onPointerDown={e => { e.stopPropagation(); e.preventDefault() /* no focus scroll */ }}
      onClick={e => { e.stopPropagation(); onCollect(b.i, e.currentTarget.getBoundingClientRect()) }}
      title={b.kind === 'goods' ? 'Collect goods' : 'Collect money'}>
      <span className="face">
        {b.kind === 'goods' ? <ResIcon id={b.res} size={22} /> : <span className="coin">$</span>}
        <b>{b.kind === 'goods' ? `+${num(b.units)}` : `+${money(b.cents / 100)}`}</b>
      </span>
    </button>))}</div>
}

/**
 * Activity badges over each building (both views): a circular progress ring
 * with the product icon (producing) or a coin (selling) plus a status chip,
 * a sleepy "zZ" for idle buildings, and a burst when a job finishes. HTML,
 * so it stays crisp and readable at every zoom level (the LOD never hides it).
 */
function ActivityBadges({ s, posOf }: { s: GameState; posOf: (i: number) => { x: number; y: number } | null }) {
  const reg = useFollow<HTMLDivElement>(posOf, 0)
  // Remember which plots were busy so a finished job can show a burst.
  const prev = useRef<(string | null)[]>([])
  const [bursts, setBursts] = useState<{ i: number; k: number }[]>([])
  const now = s.plots.map(bd => (bd?.job && bd.job.kind !== 'build' ? bd.job.kind : null))
  useEffect(() => {
    const fin = now.flatMap((k, i) => (prev.current[i] && !k ? [i] : []))
    prev.current = now
    if (fin.length) {
      const k = Date.now()
      setBursts(b => [...b, ...fin.map(i => ({ i, k }))])
      setTimeout(() => setBursts(b => b.filter(x => x.k !== k)), 1400)
    }
  })
  return <div className="acts">
    {s.plots.map((bd, i) => {
      const a = activityOf(s, bd)
      if (!a) return null
      // Dark time pill (time left on the job), like a status label over each building.
      const left = bd?.job ? Math.max(0, bd.job.endH - s.hour) : 0
      if (a.state === 'build') return <div key={i} className="act build" ref={reg(i)}><span className="tpill">🏗 {dur(left)}</span></div>
      const busy = a.state === 'make' || a.state === 'sell' || a.state === 'done'
      const R = 15, C = 2 * Math.PI * R
      return <div key={i} className={`act ${a.state}`} ref={reg(i)}>
        {busy ? <>
          <svg className="ring" viewBox="0 0 40 40" width="40" height="40">
            <circle cx="20" cy="20" r="18" className="bg" />
            <circle cx="20" cy="20" r={R} className="track" />
            <circle cx="20" cy="20" r={R} className="fill" strokeDasharray={C} strokeDashoffset={C * (1 - a.prog)} transform="rotate(-90 20 20)" />
          </svg>
          <span className="ic">{a.state === 'sell' ? <span className="coin sm">$</span> : <ResIcon id={a.res} size={18} />}</span>
          {a.state === 'sell' && <span className="kaching">ka-ching!</span>}
          <span className="tpill" title={chipLabel[a.state]}><i className={`dot ${a.state}`} />{a.state === 'done' ? 'Done' : dur(left)}</span>
        </> : <span className="zz" title="Idle: tap the building to start a job">z<small>Z</small></span>}
      </div>
    })}
    {bursts.map(b => <div key={`${b.i}-${b.k}`} className="burst" ref={reg(1000 + b.i)} />)}
  </div>
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
    }).catch(() => { setState('failed'); dispatchEvent(new Event('lw:chunk-error')) /* maybe a newer deploy replaced the 3D bundle */ })
    return () => { dead = true; handle.current?.dispose(); handle.current = null }
  }, [mode])

  // Push a light snapshot of the state into the scene every render.
  useEffect(() => {
    handle.current?.update({
      plots: s.plots.map(b => b ? { type: b.type, level: b.level, busy: !!b.job && b.job.kind !== 'build', building: b.job?.kind === 'build', act: activityOf(s, b)?.state ?? 'idle' } : null),
      slots, hour: s.hour, sel,
    })
  })

  if (mode === '2d' || state === 'failed') {
    // 2D: bubbles sit above each tile's diamond pad.
    // Positions come from the fixed tile coordinates mapped through the SVG's
    // screen matrix, not from a pad's live rect (pads lift on hover, which
    // used to move the bubble away mid-tap so the click never landed).
    const pos2d = (i: number) => {
      const root = flat.current, svg = root?.querySelector('svg.campus') as SVGSVGElement | null
      const m = svg?.getScreenCTM()
      if (!root || !svg || !m) return null
      const { x, y } = tilePos(i), o = root.getBoundingClientRect()
      return { x: m.a * x + m.c * (y - 26) + m.e - o.left, y: m.b * x + m.d * (y - 26) + m.f - o.top }
    }
    return <div className="flat-wrap" ref={flat}><Campus s={s} slots={slots} sel={sel} onPick={onPick} /><ActivityBadges s={s} posOf={pos2d} /><Bubbles list={bubbles} posOf={pos2d} onCollect={onCollect} /></div>
  }
  return (
    <div className="scene3d" ref={box}>
      {state === 'ready' && <ActivityBadges s={s} posOf={i => handle.current?.screenPos?.(i) ?? null} />}
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
