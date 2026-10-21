// ============================================================================
// First-time tutorial: a step-by-step overlay that spotlights parts of the
// HUD. The spotlight is a hole made with a huge box-shadow around the target
// element's rect (re-measured every frame, so it follows layout changes).
// A step whose target isn't on screen (e.g. no bubble yet) centres its card.
// Progress { step, done, off } lives in localStorage, so it resumes after a
// reload; Settings can turn it off/on or restart it.
// ============================================================================
import { useEffect, useState } from 'react'

export const TUT_KEY = 'ledgerworks-tutorial'
export interface TutState { step: number; done: boolean; off: boolean }
export const loadTut = (): TutState => { try { return { step: 0, done: false, off: false, ...JSON.parse(localStorage.getItem(TUT_KEY) || '{}') } } catch { return { step: 0, done: false, off: false } } }
export const saveTut = (t: TutState) => localStorage.setItem(TUT_KEY, JSON.stringify(t))

/** The steps: what to spotlight (CSS selector) and what to say. */
export const STEPS: { sel?: string; title: string; text: string }[] = [
  { title: 'Welcome to Ledgerworks!', text: 'Build factories and shops, make goods, sell them and grow your company. This quick tour shows you around.' },
  { sel: '.campus-wrap', title: 'Build your first building', text: 'Tap an empty plot (marked +) to open the build menu. A Windmill or Pump house is a good, cheap start.' },
  { sel: '.campus-wrap', title: 'Start production', text: 'Tap a building, pick a product and an amount, then press Start production. Wages are paid while it works.' },
  { sel: '.bubble, .act, .campus-wrap', title: 'Tap to collect', text: 'Every couple of minutes a bubble pops up over busy buildings. Tap it to collect goods or money early. Anything left is collected when the job ends.' },
  { sel: '.campus-wrap', title: 'Sell in a store', text: 'Build a shop (like a Corner market), tap it, pick goods from your warehouse, set a price and press Start selling.' },
  { sel: '[aria-label="Market"]', title: 'Market', text: 'Buy inputs and sell goods on the Exchange, or trade with other players on the Trade floor.' },
  { sel: '[aria-label="Warehouse"]', title: 'Warehouse', text: 'Everything you make or buy is stored here, sorted by quality.' },
  { sel: '[aria-label="Research"]', title: 'Research', text: 'Research earns patents that raise the quality of your products. The Board & goals screen is here too.' },
  { sel: '[aria-label="Finance"]', title: 'Finance', text: 'Bonds, government contracts and your accounts.' },
  { sel: '[aria-label="Company"]', title: 'Company value', text: 'Tap your badge to see what your company is worth, how that adds up, and how it has changed.' },
  { sel: '[aria-label="Menu"]', title: "You're all set!", text: 'The menu has Events, Settings (2D/3D map, sound, this tour) and your account. Have fun!' },
]

/** Rect of the first visible element matching a selector list. */
function rectOf(sel?: string): DOMRect | null {
  if (!sel) return null
  for (const s of sel.split(',')) { const el = document.querySelector(s.trim()) as HTMLElement | null; const r = el?.getBoundingClientRect(); if (r && r.width > 0 && r.height > 0) return r }
  return null
}

export function Tutorial({ t, set }: { t: TutState; set: (t: TutState) => void }) {
  const step = STEPS[Math.min(t.step, STEPS.length - 1)]
  const [r, setR] = useState<DOMRect | null>(null)
  useEffect(() => { let raf = 0; const f = () => { setR(rectOf(step.sel)); raf = requestAnimationFrame(f) }; f(); return () => cancelAnimationFrame(raf) }, [step.sel])
  const last = t.step >= STEPS.length - 1
  const go = (n: number) => set({ ...t, step: Math.max(0, n) })
  const finish = () => set({ ...t, step: 0, done: true })
  // Card sits below the spotlight if there's room, otherwise above it; centred when no target.
  const pad = 8, big = r && r.height > innerHeight * 0.5
  const hole = r && !big ? { left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 } : null
  const below = hole ? hole.top + hole.height + 220 < innerHeight : true
  const card: React.CSSProperties = hole ? (below ? { top: hole.top + hole.height + 12 } : { bottom: innerHeight - hole.top + 12 }) : { top: '50%', transform: 'translate(-50%, -50%)' }
  return (
    <div className="tut" role="dialog" aria-label="Tutorial">
      {hole ? <div className="tut-hole" style={hole} /> : <div className="tut-dim" />}
      <div className="tut-card" style={card}>
        <small className="muted">Step {t.step + 1} of {STEPS.length}</small>
        <h3>{step.title}</h3>
        <p>{step.text}</p>
        <div className="tut-dots">{STEPS.map((_, i) => <i key={i} className={i === t.step ? 'on' : ''} />)}</div>
        <div className="row">
          <button className="link" onClick={finish}>Skip</button>
          <span className="grow" />
          {t.step > 0 && <button onClick={() => go(t.step - 1)}>Back</button>}
          <button className="primary" onClick={() => (last ? finish() : go(t.step + 1))}>{last ? 'Done' : 'Next'}</button>
        </div>
      </div>
    </div>
  )
}
