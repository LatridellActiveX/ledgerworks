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
import { useEffect, useState, type ReactNode } from 'react'
import type { GameState } from '../game/engine'
import { valueBreakdown, valueDetail, type ValueDetail } from '../game/value'
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

/** Donut of what the company's assets are made of, with the total in the middle. */
function AssetDonut({ parts }: { parts: { label: string; v: number; c: string }[] }) {
  const total = parts.reduce((t, p) => t + Math.max(0, p.v), 0)
  const R = 62, C = 2 * Math.PI * R
  let acc = 0
  return (
    <svg className="donut" viewBox="0 0 160 160" role="img" aria-label={`Assets ${money(total)}: ${parts.map(p => `${p.label} ${Math.round(100 * p.v / (total || 1))}%`).join(', ')}`}>
      <circle cx="80" cy="80" r={R} fill="none" stroke="#efe8da" strokeWidth="22" />
      {parts.filter(p => p.v > 0).map(p => {
        const len = (p.v / (total || 1)) * C
        const seg = <circle key={p.label} cx="80" cy="80" r={R} fill="none" stroke={p.c} strokeWidth="22" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 80 80)" />
        acc += len
        return seg
      })}
      <text x="80" y="76" textAnchor="middle" fontSize="11" fill="#6b6378">Assets</text>
      <text x="80" y="95" textAnchor="middle" fontSize="15" fontWeight="800" fill="#2c2540">{money(total)}</text>
    </svg>
  )
}

/** Expandable category with its own total and the items behind it. */
function Category({ title, value, color, children, open }: { title: string; value: string; color: string; children: ReactNode; open?: boolean }) {
  return <details className="vcat" open={open}>
    <summary><i style={{ background: color }} /><span>{title}</span><b>{value}</b></summary>
    <div className="vcat-body">{children}</div>
  </details>
}

/** The breakdown: the donut, then every category with the things inside it. */
function AssetBreakdown({ s, b }: { s: GameState; b: ReturnType<typeof valueBreakdown> }) {
  const d: ValueDetail = valueDetail(s)
  const parts = [
    { label: 'Cash', v: b.cash, c: '#4fa52c' }, { label: 'Buildings', v: b.buildings, c: '#5d6bd4' },
    { label: 'Inventory', v: b.inventory, c: '#e3b23c' }, { label: 'Bonds held', v: b.bondsHeld, c: '#7b61ff' },
  ]
  const assets = parts.reduce((t, p) => t + p.v, 0)
  const pct = (v: number) => `${Math.round(100 * v / (assets || 1))}%`
  return <div className="card">
    <b>What the company is worth</b>
    <div className="vbreak">
      <AssetDonut parts={parts} />
      <ul className="vlegend">{parts.map(p => <li key={p.label}><i style={{ background: p.c }} />{p.label} <b>{pct(p.v)}</b></li>)}
        <li><i style={{ background: '#d64545' }} />Liabilities <b>−{money(b.liabilities)}</b></li></ul>
    </div>
    <Category title="Cash" value={money(b.cash)} color="#4fa52c" open>
      <p className="muted">{money(d.cash.cash)} in your company{d.cash.locked > 0 ? `, plus ${money(d.cash.locked)} held in open buy orders` : ''}.</p>
    </Category>
    <Category title="Buildings" value={money(b.buildings)} color="#5d6bd4">
      {d.buildings.length === 0 ? <p className="muted">No buildings yet.</p> : d.buildings.map((x, i) => <div key={i} className="vline"><span>{x.name} · level {x.level}</span><b>{money(x.value)}</b></div>)}
      <p className="muted">Value is what it cost to reach each level: build cost plus every upgrade.</p>
    </Category>
    <Category title="Inventory" value={money(b.inventory)} color="#e3b23c">
      {d.inventory.length === 0 ? <p className="muted">Nothing in the warehouse.</p> : d.inventory.map(x => <div key={x.res} className="vline"><span>{x.name} <small className="muted">· {num(Math.round(x.units))} units</small></span><b>{money(x.value)}</b></div>)}
      <p className="muted">Valued at today's market price.</p>
    </Category>
    <Category title="Bonds held" value={money(b.bondsHeld)} color="#7b61ff">
      {d.bonds.length === 0 ? <p className="muted">No bonds held.</p> : d.bonds.map((x, i) => <div key={i} className="vline"><span>{x.issuer} · {x.rating}</span><b>{money(x.amount)}</b></div>)}
    </Category>
    <Category title="Patents" value={`${num(b.patents)} patent${b.patents === 1 ? '' : 's'}`} color="#2fa3a3">
      {d.patents.length === 0 ? <p className="muted">No patents yet.</p> : d.patents.map(x => <div key={x.res} className="vline"><span>{x.name}</span><b>{num(x.count)}</b></div>)}
      <p className="muted">Patents raise product quality. They are counted, not valued as money.</p>
    </Category>
    <Category title="Liabilities" value={`−${money(b.liabilities)}`} color="#d64545">
      {d.liabilities.length === 0 ? <p className="muted">No bonds owed.</p> : d.liabilities.map((x, i) => <div key={i} className="vline"><span>Bond {i + 1}</span><b>−{money(x.amount)}</b></div>)}
    </Category>
  </div>
}

export function CompanyValue({ s, onPlayer, onRename }: { s: GameState; onPlayer?: (name: string) => void; onRename?: () => void }) {
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
        <div className="cv-crest"><Crest name={s.company} size={96} /><div><b>{s.company}</b>{onRename && <div><button onClick={onRename}>✎ Rename company</button></div>}</div></div>
        <small>Total company value</small>
        <b>{money(b.total)}</b>
        {pts.length > 1 && <span className={change >= 0 ? 'up' : 'down'}>{change >= 0 ? '▲' : '▼'} {money(Math.abs(change))} over {num(Math.round((s.hour - pts[0].h) / 24))} days</span>}
      </div>
      <AssetBreakdown s={s} b={b} />
      <div className="card">
        <b>Total</b>
        {rows.map(([k, v, c]) => <div key={k} className="cv-row"><span>{k}</span><i style={{ width: `${(100 * Math.abs(v)) / gross}%`, background: c }} /><b className={v < 0 ? 'neg' : ''}>{v < 0 ? '−' : ''}{money(Math.abs(v))}</b></div>)}
        <div className="cv-row total"><span>Total</span><i /><b>{money(b.total)}</b></div>
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
