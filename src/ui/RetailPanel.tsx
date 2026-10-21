// Shop form: pick a good (and quality lot) this shop can sell, set amount and
// price, and see how long the public takes to buy it all. Shows the current
// saturation so you can tell when a market is flooded.
import { useState } from 'react'
import * as E from '../game/engine'
import { BLD, RES } from '../game/data'
import { ResIcon } from './art'
import { dur, money, num } from './fmt'

export function RetailPanel({ s, plot, act }: { s: E.GameState; plot: number; act: (f: (st: E.GameState) => string | null | void) => void }) {
  const bd = s.plots[plot]!, store = BLD[bd.type].store
  // Lots in the warehouse this shop can sell.
  const lots = Object.entries(s.stock).map(([k, v]) => ({ k, v, ...E.parseKey(k) })).filter(l => RES[l.res].store === store)
  const [pick, setPick] = useState(lots[0]?.k ?? '')
  const lot = lots.find(l => l.k === pick) ?? lots[0]
  const [qty, setQty] = useState(0)
  const [price, setPrice] = useState(0)
  const goods = Object.values(RES).filter(r => r.store === store)
  if (!lot) return <div className="card">Nothing to sell yet. This shop sells: {goods.map(g => <span key={g.id}><ResIcon id={g.id} size={16} /> {g.name} </span>)}</div>

  const fair = E.fairPrice(lot.res, lot.q)
  const q = qty || Math.floor(lot.v), p = price || Math.round(fair * 100) / 100
  const hours = E.sellHours(s, lot.res, lot.q, p, q, bd.level)
  const sat = s.saturation[lot.res] ?? 1
  return (
    <div className="card">
      <label>Sell <select value={lot.k} onChange={e => { setPick(e.target.value); setQty(0); setPrice(0) }}>
        {lots.map(l => <option key={l.k} value={l.k}>{RES[l.res].name} Q{l.q} ({num(l.v)})</option>)}
      </select></label>
      <label>Amount <input type="number" min={1} max={lot.v} value={q} onChange={e => setQty(Math.min(lot.v, Number(e.target.value)))} /></label>
      <label>Price each $<input type="number" step="0.01" min={0.01} value={p} onChange={e => setPrice(Number(e.target.value))} /> <small className="muted">fair ≈ {money(fair)}</small></label>
      <div>Market: <b style={{ color: sat > 1.15 ? '#b0413e' : sat < 0.9 ? '#3c7a4a' : undefined }}>{sat > 1.15 ? 'flooded' : sat < 0.9 ? 'hungry' : 'normal'}</b> ({num(sat)}×)</div>
      <div>Sells out in {dur(hours)} · revenue {money(q * p)} · wages {money(E.makeWages(bd.type, bd.level, hours))}</div>
      <button className="primary" disabled={hours > 72} onClick={() => act(st => E.startSell(st, plot, lot.res, lot.q, q, p))}>{hours > 72 ? 'Too slow — lower price' : 'Start selling'}</button>
    </div>
  )
}
