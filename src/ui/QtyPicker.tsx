// ============================================================================
// QtyPicker: the one amount control used everywhere a quantity is chosen.
//  - number field (whole numbers only, clamped to 1..max)
//  - slider across 1..max
//  - -/+ steppers: hold to repeat (speeds up), Shift-click for x10
//  - quick buttons: 1, 10, 100, 25%, 50%, Max
//  - shows why the max is what it is ("Only 12 Seeds", "Cash for wages")
// The parent shows the live preview (time, cost, revenue, inputs) for `value`.
// ============================================================================
import { useEffect, useRef, useState } from 'react'
import { num } from './fmt'

export const clampQty = (v: number, max: number) => Math.max(1, Math.min(Math.max(1, Math.floor(max)), Math.floor(Number.isFinite(v) ? v : 1)))

export function QtyPicker({ value, max, why, onChange, label = 'Amount' }: { value: number; max: number; why?: string; onChange: (v: number) => void; label?: string }) {
  const cap = Math.max(0, Math.floor(max))
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  // If the max drops below the chosen value (stock was used), pull it back.
  useEffect(() => { if (cap >= 1 && value > cap) onChange(cap) }, [cap])
  const set = (v: number) => onChange(clampQty(v, cap))

  // Hold-to-repeat for the steppers.
  const timer = useRef<number | null>(null), cur = useRef(value); cur.current = value
  const stop = () => { if (timer.current !== null) { clearTimeout(timer.current); timer.current = null } }
  const hold = (dir: number, big: boolean) => {
    let step = big ? 10 : 1, n = 0
    const tick = () => { set(cur.current + dir * step); n++; if (n % 8 === 0) step *= 2; timer.current = window.setTimeout(tick, n === 1 ? 380 : 70) }
    tick()
  }
  useEffect(() => stop, [])

  if (cap < 1) return <div className="qty qty-none"><span className="muted">{label}: none possible{why ? ` · ${why}` : ''}</span></div>
  const quick: [string, number][] = [['1', 1], ['10', 10], ['100', 100], ['25%', Math.max(1, Math.floor(cap * 0.25))], ['50%', Math.max(1, Math.floor(cap * 0.5))], ['Max', cap]]
  return (
    <div className="qty">
      <div className="qty-row">
        <span className="qty-label">{label}</span>
        <button className="step" aria-label="Less (Shift for 10)" onPointerDown={e => hold(-1, e.shiftKey)} onPointerUp={stop} onPointerLeave={stop} disabled={value <= 1}>−</button>
        <input type="number" inputMode="numeric" min={1} max={cap} step={1} value={text}
          onChange={e => { setText(e.target.value); const v = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(v)) set(v) }}
          onBlur={() => setText(String(value))} />
        <button className="step" aria-label="More (Shift for 10)" onPointerDown={e => hold(1, e.shiftKey)} onPointerUp={stop} onPointerLeave={stop} disabled={value >= cap}>+</button>
        <span className="muted qty-max">of {num(cap)}</span>
      </div>
      <input className="qty-slider" type="range" min={1} max={cap} step={1} value={Math.min(value, cap)} onChange={e => set(Number(e.target.value))} />
      <div className="qty-quick">{quick.map(([t, v]) => <button key={t} className={value === Math.min(v, cap) ? 'on' : ''} disabled={v > cap && t !== 'Max'} onClick={() => set(v)}>{t}</button>)}</div>
      {why && value >= cap && <small className="qty-why">Max: {why}</small>}
    </div>
  )
}
