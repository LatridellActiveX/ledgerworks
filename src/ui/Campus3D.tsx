// Wrapper that lazy-loads the Three.js campus and falls back to the 2D SVG
// campus when WebGL is missing, the bundle fails to load, or the player
// switches to 2D. The 3D bundle is a separate file (/scene3d.js), so the
// game shows instantly and the 3D view fades in when ready.
import { useEffect, useRef, useState } from 'react'
import type { GameState } from '../game/engine'
import { Campus } from './campus'

type Handle = { update(s: unknown): void; dispose(): void }
declare const __BUILD_ID__: string

/** Load the 3D module: a separate file in production, a normal import in dev. */
async function loadScene(): Promise<any> {
  if (import.meta.env.DEV) return import('../scene3d/index')
  return import(/* @vite-ignore */ `/scene3d.js?v=${__BUILD_ID__}`)
}

export function Campus3D({ s, slots, sel, onPick, mode }: { s: GameState; slots: number; sel: number | null; onPick: (i: number) => void; mode: '3d' | '2d' }) {
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

  if (mode === '2d' || state === 'failed') return <Campus s={s} slots={slots} sel={sel} onPick={onPick} />
  return (
    <div className="scene3d" ref={box}>
      {state === 'loading' && <div className="scene-loading"><span className="spinner" /> Building your campus…</div>}
    </div>
  )
}
