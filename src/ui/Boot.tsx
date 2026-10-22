// ============================================================================
// Loading screen (shown once per page load, before login and the map).
//
// Honest loading only (Oct 2026 rewrite; the old one had a 5 s minimum and
// staged per-library bars "for show"). Now:
//  - ONE progress bar = the share of REAL loading steps that have finished:
//      * fonts        document.fonts.ready
//      * 3D renderer  the Three.js scene bundle download (loadScene); only
//                     waited for in 3D view. In 2D view it still prefetches
//                     in the background but doesn't hold the screen.
//      * account      the "who am I" request (A.me)
//    The save itself loads synchronously from localStorage before this
//    component mounts, so it is already done and isn't a step.
//  - Nothing is drawn for the first SKIP_MS. If everything is ready by then
//    (cached repeat visit, fast connection), the screen is skipped entirely.
//  - As soon as the last step finishes it fades out over FADE_MS.
//  - Each step gives up after TASK_TIMEOUT_MS, so an offline player still
//    gets in (the work continues in the background).
// ============================================================================
import { useEffect, useRef, useState } from 'react'
import { loadScene } from './Campus3D'
import * as A from '../game/auth'

/** Don't show anything if loading finishes within this time. */
export const SKIP_MS = 300
/** Fade-out length once loading is done. */
export const FADE_MS = 250
const TASK_TIMEOUT_MS = 15000

/** The real loading steps for a view ('3d' | '2d'). */
export function bootSteps(view: string): { id: string; run: () => Promise<unknown> }[] {
  const steps = [
    { id: 'fonts', run: () => document.fonts?.ready ?? Promise.resolve() },
    { id: 'account', run: () => A.me() },
  ]
  if (view === '2d') loadScene().catch(() => {}) // prefetch for a later switch, don't wait
  else steps.push({ id: 'scene', run: () => loadScene() })
  return steps
}

/** Overall progress 0..1 = finished steps / all steps. */
export const progress = (done: number, total: number) => (total ? done / total : 1)

export function Boot({ view, onDone }: { view: string; onDone: () => void }) {
  const [done, setDone] = useState(0), [total, setTotal] = useState(1)
  const [visible, setVisible] = useState(false) // false during the SKIP_MS grace period
  const [fade, setFade] = useState(false)
  const doneRef = useRef(onDone); doneRef.current = onDone

  useEffect(() => {
    let alive = true
    const steps = bootSteps(view); setTotal(steps.length)
    // Grace period: only appear if loading is still going after SKIP_MS.
    const show = setTimeout(() => alive && setVisible(true), SKIP_MS)
    const t0 = performance.now()
    // Run every step at once; each counts as done on success, failure or timeout.
    Promise.all(steps.map(s =>
      Promise.race([s.run().catch(() => {}), new Promise(r => setTimeout(r, TASK_TIMEOUT_MS))])
        .then(() => alive && setDone(d => d + 1))
    )).then(() => {
      if (!alive) return
      clearTimeout(show)
      ;(globalThis as any).__lwBootMs = Math.round(performance.now() - t0) // read by tools/check-boot
      // Finished inside the grace period: never shown, hand over now.
      if (performance.now() - t0 < SKIP_MS) { doneRef.current(); return }
      setFade(true); setTimeout(() => doneRef.current(), FADE_MS)
    })
    return () => { alive = false; clearTimeout(show) }
  }, [view])

  if (!visible) return null
  const p = progress(done, total)
  return (
    <section className={`boot ${fade ? 'out' : ''}`} style={{ transitionDuration: `${FADE_MS}ms` }} aria-label="Loading Ledgerworks">
      <div className="boot-card">
        <img className="boot-logo" src="/icon-192.png" alt="" width="88" height="88" />
        <h1>Ledgerworks</h1>
        {/* Single real progress bar (finished loading steps). */}
        <div className="boot-all" role="progressbar" aria-valuenow={Math.round(p * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${p * 100}%` }} /><span>{Math.round(p * 100)}%</span></div>
      </div>
    </section>
  )
}
