// ============================================================================
// Boot / loading screen (shown once per page load, before login and the map).
//
// It lists the real libraries and the game's own modules, each with its own
// animated bar and a console-style log line, plus an overall bar and the
// Ledgerworks logo. It's partly for show:
//  - it always lasts at least MIN_MS (~5 s), with bars staggered and running
//    at slightly different speeds;
//  - but some rows are tied to REAL work and wait for it: Three.js waits for
//    the 3D bundle to download, Auth waits for the "who am I" request, Fonts
//    wait for document.fonts. If real loading is slower than the show, the
//    screen waits (each real task gives up after TASK_TIMEOUT_MS so an
//    offline player still gets in).
// Version numbers come from the installed packages' package.json files at
// build time (__LIBS__, see vite.config.ts), never typed by hand. The game's
// own modules show the app's package.json version plus the build id.
// When everything is done the screen fades out into the map.
// ============================================================================
import { useEffect, useRef, useState } from 'react'
import { loadScene } from './Campus3D'
import * as A from '../game/auth'

declare const __LIBS__: { react: string; 'react-dom': string; three: string; app: string }
declare const __BUILD_ID__: string

export const MIN_MS = 5000
const TASK_TIMEOUT_MS = 15000

/** One row: name, module path shown in the log, version, timing, optional real task. */
interface Row { id: string; name: string; mod: string; ver: string; start: number; ms: number; task?: () => Promise<unknown> }

/** Rows in load order. start/ms (when the bar begins and its show duration) are staggered and varied. */
export function bootRows(view: string): Row[] {
  const app = `${__LIBS__.app}+${__BUILD_ID__}`
  return [
    { id: 'react', name: 'React', mod: 'react', ver: __LIBS__.react, start: 0, ms: 900 },
    { id: 'reactdom', name: 'ReactDOM', mod: 'react-dom/client', ver: __LIBS__['react-dom'], start: 250, ms: 1100 },
    { id: 'fonts', name: 'Fonts', mod: 'fonts/fredoka.css', ver: app, start: 400, ms: 800, task: () => document.fonts?.ready ?? Promise.resolve() },
    // In 2D view the 3D bundle is still fetched now, so switching later is instant.
    { id: 'three', name: 'Three.js', mod: `three${view === '2d' ? ' (for 3D view)' : ''}`, ver: __LIBS__.three, start: 600, ms: 2200, task: () => loadScene() },
    { id: 'engine', name: 'Economy engine', mod: 'game/engine', ver: app, start: 900, ms: 1500 },
    { id: 'market', name: 'Market client', mod: 'game/market', ver: app, start: 1300, ms: 1300 },
    { id: 'iso', name: 'Iso renderer', mod: 'scene3d', ver: app, start: 1700, ms: 1900 },
    { id: 'flat', name: '2D renderer', mod: 'ui/campus2d', ver: app, start: 2000, ms: 1200 },
    { id: 'audio', name: 'Audio', mod: 'ui/sound', ver: app, start: 2400, ms: 900 },
    { id: 'save', name: 'Save system', mod: 'game/save', ver: app, start: 2700, ms: 1100 },
    { id: 'auth', name: 'Auth', mod: 'game/auth', ver: app, start: 3000, ms: 1300, task: () => A.me() },
    { id: 'ui', name: 'Interface', mod: 'App', ver: app, start: 3400, ms: 1400 },
  ]
}

/** Show progress for a row at time t (0..1): eased, holds at 92% until its real task is done. */
export function showProg(r: Row, t: number, real: boolean) {
  const x = Math.max(0, Math.min(1, (t - r.start) / r.ms))
  // A small "stall" wobble around 60% makes each bar feel like real loading.
  const eased = 1 - Math.pow(1 - x, 2.2) - Math.sin(x * Math.PI) * 0.04
  return real ? Math.max(0, eased) : Math.min(0.92, Math.max(0, eased))
}

export function Boot({ view, onDone }: { view: string; onDone: () => void }) {
  const rows = useRef(bootRows(view)).current
  const [t, setT] = useState(0)
  const [done, setDone] = useState<Record<string, 'ok' | 'slow'>>({})
  const [fade, setFade] = useState(false)
  const t0 = useRef(performance.now())

  // Start the real tasks right away (each with a timeout so nobody gets stuck).
  useEffect(() => {
    for (const r of rows) {
      if (!r.task) { setDone(d => ({ ...d, [r.id]: 'ok' })); continue }
      const timeout = new Promise(res => setTimeout(() => res('slow'), TASK_TIMEOUT_MS))
      Promise.race([r.task().then(() => 'ok', () => 'ok'), timeout]).then(v => setDone(d => ({ ...d, [r.id]: v as 'ok' | 'slow' })))
    }
  }, [rows])

  // Animation clock.
  useEffect(() => {
    let raf = 0
    const tick = () => { setT(performance.now() - t0.current); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const prog = rows.map(r => showProg(r, t, !!done[r.id]))
  const rowDone = rows.map((r, i) => prog[i] >= 0.999 && !!done[r.id] && t >= r.start + r.ms)
  const overall = prog.reduce((a, b) => a + b, 0) / rows.length
  const all = rowDone.every(Boolean) && t >= MIN_MS

  // Everything loaded: fade out, then hand over to the game.
  // (The timer is not cleared on re-render: setFade itself re-renders, and
  // clearing it there would cancel the hand-over.)
  const doneRef = useRef(onDone); doneRef.current = onDone
  useEffect(() => {
    if (!all || fade) return
    setFade(true)
    setTimeout(() => doneRef.current(), 600)
  }, [all, fade])

  return (
    <section className={`boot ${fade ? 'out' : ''}`} aria-label="Loading Ledgerworks">
      <div className="boot-card">
        <img className="boot-logo" src="/icon-192.png" alt="" width="88" height="88" />
        <h1>Ledgerworks</h1>
        <div className="boot-all"><i style={{ width: `${overall * 100}%` }} /><span>{Math.round(overall * 100)}%</span></div>
        <ul className="boot-rows">
          {rows.map((r, i) => <li key={r.id} className={rowDone[i] ? 'ok' : prog[i] > 0 ? 'go' : ''}>
            <span className="nm">{r.name}</span>
            <span className="bb"><i style={{ width: `${prog[i] * 100}%` }} /></span>
            <span className="st">{rowDone[i] ? '✓' : prog[i] > 0 ? `${Math.round(prog[i] * 100)}%` : ''}</span>
          </li>)}
        </ul>
        {/* Console-style log: one line per row once it starts / finishes. */}
        <pre className="boot-log">{rows.flatMap((r, i) => [
          prog[i] > 0 ? `> import ${r.mod}@${r.ver}` : null,
          rowDone[i] ? `  ✓ ${r.name} ${r.ver} ready${done[r.id] === 'slow' ? ' (still loading in the background)' : ''}` : null,
        ]).filter(Boolean).slice(-6).join('\n')}</pre>
      </div>
    </section>
  )
}
