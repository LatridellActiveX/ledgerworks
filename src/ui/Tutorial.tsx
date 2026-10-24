// ============================================================================
// Tutorial UI (logic lives in game/tutorial.ts):
//  - <Guide>: the guided start. An advisor card at the bottom says what to do
//    next; if the step names a button, that button gets a spotlight (a hole
//    cut in a dark layer) and four invisible blockers cover everything else,
//    so only the spotlit button can be tapped. Steps with no target leave the
//    map usable (e.g. "tap a free plot") with no dimming.
//  - <Tip>: a one-time note with "Got it" the first time a screen opens.
//  - <Goals>: the level-based goals list (menu → Goals).
// ============================================================================
import { useEffect, useState } from 'react'
import type { GameState } from '../game/engine'
import { companyLevel } from '../game/engine'
import * as TU from '../game/tutorial'
import { money } from './fmt'

/** Rect of the first visible element matching a selector list. */
function rectOf(sel?: string): DOMRect | null {
  if (!sel) return null
  for (const x of sel.split(',')) {
    const el = document.querySelector(x.trim()) as HTMLElement | null
    const r = el?.getBoundingClientRect()
    if (r && r.width > 0 && r.height > 0) return r
  }
  return null
}

export function Guide({ t, s, screen, onSkip }: { t: TU.TutState; s: GameState; screen: string; onSkip: () => void }) {
  const step = TU.STEPS[Math.min(t.step, TU.STEPS.length - 1)]
  const sel = step.sel?.({ s, screen, t })
  const [r, setR] = useState<DOMRect | null>(null)
  // Re-measure every frame so the spotlight follows scrolling and layout.
  useEffect(() => { let raf = 0; const f = () => { setR(rectOf(sel)); raf = requestAnimationFrame(f) }; f(); return () => cancelAnimationFrame(raf) }, [sel])
  const pad = 6
  const hole = r ? { left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 } : null
  // Card sits at the bottom (above the tab bar) unless the hole is down there.
  const atTop = !!hole && hole.top + hole.height > innerHeight - 260
  return (
    <div className="tut guide" role="dialog" aria-label="Tutorial">
      {hole && <>
        <div className="tut-hole" style={hole} />
        {/* Blockers: top, bottom, left, right of the hole. */}
        <div className="tut-block" style={{ left: 0, top: 0, right: 0, height: hole.top }} />
        <div className="tut-block" style={{ left: 0, top: hole.top + hole.height, right: 0, bottom: 0 }} />
        <div className="tut-block" style={{ left: 0, top: hole.top, width: hole.left, height: hole.height }} />
        <div className="tut-block" style={{ left: hole.left + hole.width, top: hole.top, right: 0, height: hole.height }} />
      </>}
      <div className={`tut-card advisor ${atTop ? 'top' : 'bottom'}`}>
        <span className="advisor-face" aria-hidden>🧑‍💼</span>
        <div>
          <small className="muted">Step {t.step + 1} of {TU.STEPS.length} · reward $1,000 + ★</small>
          <h3>{step.title}</h3>
          <p>{step.text}</p>
          <div className="tut-dots">{TU.STEPS.map((_, i) => <i key={i} className={i === t.step ? 'on' : i < t.step ? 'past' : ''} />)}</div>
          <div className="row"><button className="link" onClick={onSkip}>Skip tutorial</button></div>
        </div>
      </div>
    </div>
  )
}

/** One-time tip card. */
export function Tip({ text, onOk }: { text: string; onOk: () => void }) {
  return (
    <div className="tip-card" role="status">
      <span aria-hidden>💡</span><p>{text}</p>
      <button className="primary" onClick={onOk}>Got it</button>
    </div>
  )
}

/** Goals screen: unlocked by company level, claim for cash. */
export function Goals({ s, t, onClaim }: { s: GameState; t: TU.TutState; onClaim: (id: string) => void }) {
  const lvl = companyLevel(s.xp)
  return (
    <div className="goals">
      <p className="muted">New goals unlock as your company levels up. Finish one, then claim its reward.</p>
      {TU.GOALS.map(g => {
        const st = TU.goalState(g, s, t)
        return (
          <div key={g.id} className={`goal ${st}`}>
            <span className="goal-ic" aria-hidden>{st === 'claimed' ? '✅' : st === 'locked' ? '🔒' : st === 'ready' ? '🎁' : '◻'}</span>
            <div className="grow">
              <b>{st === 'locked' ? `Unlocks at level ${g.level}` : g.title}</b>
              <small className="muted">{st === 'locked' ? `You are level ${lvl}` : `Reward ${money(g.reward)}`}</small>
            </div>
            {st === 'ready' && <button className="primary" onClick={() => onClaim(g.id)}>Claim</button>}
            {st === 'claimed' && <small className="muted">Claimed</small>}
          </div>
        )
      })}
    </div>
  )
}
