// ============================================================================
// Company Value screen: what the company is worth, how that number is built,
// how it changed over time, and where it ranks.
//  - Breakdown: cash, buildings (build + upgrades paid), inventory at market
//    value, bonds held, minus liabilities (bonds issued). Patents are counted
//    but not valued (see game/value.ts).
//  - History: one point per game day (state.valueHist) plus "now", drawn as a
//    small SVG area chart.
//  - Rank: the trade-floor leaderboard from the server (other companies that
//    publish their value). Offline or with no data, the rank card says so.
// ============================================================================
import { PlayerSearch } from './Players'
import { Crest } from './Crest'
import { useEffect, useState } from 'react'
import type { GameState } from '../game/engine'
import { valueBreakdown } from '../game/value'
import * as T from '../game/trade'
import { money, num } from './fmt'

/** Simple area chart of value over game days. */
function ValueChart({ pts }: { pts: { h: number; v: number }[] }) {
  if (pts.length < 2) return <p className="muted">The chart fills in as game days pass (one point per day).</p>
  const W = 600, H = 180, P = 8
  const lo = Math.min(...pts.map(p => p.v)), hi = Math.max(...pts.map(p => p.v)), span = hi - lo || 1
  const h0 = pts[0].h, hs = pts[pts.length - 1].h - h0 || 1
  const xy = pts.map(p => [P + ((p.h - h0) / hs) * (W - 2 * P), H - P - ((p.v - lo) / span) * (H - 2 * P)])
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const up = pts[pts.length - 1].v >= pts[0].v
  return (
    <svg className="vchart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Company value over time">
      <defs><linearGradient id="vfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={up ? '#4fa52c' : '#d64545'} stopOpacity=".35" /><stop offset="1" stopColor={up ? '#4fa52c' : '#d64545'} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L${xy[xy.length - 1][0]},${H - P} L${xy[0][0]},${H - P} Z`} fill="url(#vfill)" />
      <path d={line} fill="none" stroke={up ? '#3c9a5f' : '#c8553d'} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r="4" fill={up ? '#3c9a5f' : '#c8553d'} />
    </svg>
  )
}

export function CompanyValue({ s, onPlayer }: { s: GameState; onPlayer?: (name: string) => void }) {
  const b = valueBreakdown(s)
  const [leaders, setLeaders] = useState<{ name: string; company: string; value: number }[] | null>(null)
  useEffect(() => { T.p2p('board', { res: 'apples' }).then(j => setLeaders(j.leaders ?? [])).catch(() => setLeaders(null)) }, [])
  const rows: [string, number, string][] = [
    ['Cash', b.cash, '#4fa52c'], ['Buildings (build + upgrades)', b.buildings, '#5d6bd4'],
    ['Inventory (market value)', b.inventory, '#e3b23c'], ['Bonds held', b.bondsHeld, '#7b61ff'], ['Liabilities (bonds owed)', -b.liabilities, '#d64545'],
  ]
  const gross = rows.reduce((t, [, v]) => t + Math.abs(v), 0) || 1
  const pts = [...(s.valueHist ?? []), { h: s.hour, v: b.total }]
  const first = pts[0].v, change = b.total - first
  // Rank: our value among published values (server leaderboard), us included.
  const others = (leaders ?? []).filter(l => l.company !== s.company)
  const rank = 1 + others.filter(l => (l.value ?? 0) > b.total).length
  return (
    <div className="cvalue">
      <div className="card cv-total">
        <div className="cv-crest"><Crest name={s.company} size={96} /><div><small>{s.company}</small></div></div>
        <small>Total company value</small>
        <b>{money(b.total)}</b>
        {pts.length > 1 && <span className={change >= 0 ? 'up' : 'down'}>{change >= 0 ? '▲' : '▼'} {money(Math.abs(change))} over {num(Math.round((s.hour - pts[0].h) / 24))} days</span>}
      </div>
      <div className="card">
        <b>Breakdown</b>
        {rows.map(([k, v, c]) => <div key={k} className="cv-row"><span>{k}</span><i style={{ width: `${(100 * Math.abs(v)) / gross}%`, background: c }} /><b className={v < 0 ? 'neg' : ''}>{v < 0 ? '−' : ''}{money(Math.abs(v))}</b></div>)}
        <div className="cv-row total"><span>Total</span><i /><b>{money(b.total)}</b></div>
        <small className="muted">Patents: {num(b.patents)} (they raise product quality; not counted as money).</small>
      </div>
      <div className="card"><b>Value history</b><ValueChart pts={pts} /></div>
      <div className="card">
        <b>Rank</b>
        {/* Find any player; tapping a leaderboard row opens their profile too. */}
        {onPlayer && <PlayerSearch onOpen={onPlayer} compact />}
        {leaders === null ? <p className="muted">Rank needs the online leaderboard (offline right now).</p>
          : others.length === 0 ? <p className="muted">No other companies have published a value yet.</p>
          : <><p>You'd be <b>#{rank}</b> of {others.length + 1} companies on the trade-floor leaderboard.</p>
            <ol className="cv-rank">{[...others, { name: 'you', company: s.company, value: b.total }].sort((x, y) => y.value - x.value).slice(0, 10).map(l => <li key={l.name} className={l.name === 'you' ? 'me' : ''} onClick={() => l.name !== 'you' && onPlayer?.(l.name)}><span>{l.company}</span><b>{money(l.value ?? 0)}</b></li>)}</ol></>}
      </div>
    </div>
  )
}
