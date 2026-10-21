// Research tab: notes on hand per field, and each product's patents,
// researched quality and progress to the next quality.
import { useState } from 'react'
import * as E from '../game/engine'
import * as R from '../game/research'
import { RES } from '../game/data'
import { ResIcon } from './art'
import { num } from './fmt'

type Act = (f: (st: E.GameState) => string | null | void) => void

export function Research({ s, act }: { s: E.GameState; act: Act }) {
  const [n, setN] = useState(10)
  const lvl = E.companyLevel(s.xp)
  if (lvl < R.RESEARCH_LEVEL) return <p className="muted">Research unlocks at company level {R.RESEARCH_LEVEL}. Labs turn power and raw goods into notes; notes become patents; patents raise the quality you can make.</p>
  const bonus = E.patentBonus?.(s) ?? 1
  return (
    <div>
      <p className="muted">Each note has a {Math.round(R.PATENT_CHANCE * bonus * 100)}% chance to become a patent. You always make the best quality you've researched, but never more than your lowest-quality input + 1.
        {' '}Notes per click: <input type="number" min={1} step={1} value={n} onChange={e => setN(Math.max(1, Math.floor(Number(e.target.value) || 1)))} /></p>
      <div className="fields">
        {R.FIELDS.map(f => (
          <div key={f} className="card">
            <b><ResIcon id={R.notesFor(f)} /> {RES[R.notesFor(f)].name}: {num(E.haveQty(s, R.notesFor(f)))}</b>
            {R.FIELD_GOODS[f].map(res => {
              const q = R.researchedQ(s, res), p = s.patents[res] ?? 0
              const lo = R.PATENTS_FOR_Q[q], hi = R.PATENTS_FOR_Q[Math.min(12, q + 1)]
              return (
                <div key={res} className="rrow">
                  <ResIcon id={res} size={16} /> {RES[res].name} <b>Q{q}</b>
                  <span className="bar"><i style={{ width: `${q >= 12 ? 100 : (100 * (p - lo)) / (hi - lo)}%` }} /></span>
                  <small>{num(p)}/{num(hi)}</small>
                  <button onClick={() => act(st => E.research(st, res, n, E.patentBonus?.(st) ?? 1))}>Research</button>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
