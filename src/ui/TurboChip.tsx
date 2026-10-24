// Compact live-event chip for the HUD (Turbo Week, see game/event.ts).
// One line high, e.g. "⚡ 3× · 6d 23h", sitting under the day/clock line so it
// never pushes the map or HUD down. Tapping it opens a small explainer
// popover that floats over the HUD column (dismiss by tapping again / ✕).
import { useEffect, useState } from 'react'
import * as EV from '../game/event'

/** Re-render every 30 s so the countdown stays live (it shows minutes at most). */
function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t) }, [ms])
  return now
}

export function TurboChip() {
  const now = useNow()
  const [open, setOpen] = useState(false)
  if (!EV.isLive(now)) return null // nothing outside the window
  const e = EV.EVENT, left = EV.countdown(EV.msLeft(now))
  return <div className="turbo-wrap">
    <button className="turbo-chip" aria-expanded={open} aria-label={`${e.name}: ${e.mult} times speed, ${left} left. Tap for details.`} onClick={() => setOpen(o => !o)}>
      {e.icon} {e.mult}× · {left}
    </button>
    {open && <div className="turbo-pop" role="dialog" aria-label={e.name}>
      <button className="turbo-x" aria-label="Close" onClick={() => setOpen(false)}>✕</button>
      <b>{e.icon} {e.name}</b>
      <p>{e.blurb}</p>
      <small>Ends {new Date(e.end).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {left} left</small>
    </div>}
  </div>
}

/** Tiny "3×" tag for job timers; renders nothing when the job is not boosted. */
export const TurboTag = ({ on }: { on: boolean }) => (on && EV.isLive(Date.now()) ? <span className="turbo-tag" title={`${EV.EVENT.name}: ${EV.EVENT.mult}× speed`}>{EV.EVENT.mult}×</span> : null)
