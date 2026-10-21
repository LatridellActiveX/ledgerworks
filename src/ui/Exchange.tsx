// Exchange tab: order book for one good, buy from the cheapest asks, list
// your own goods for sale (needs shipping crates), quick-sell to NPC buyers,
// and manage your open orders.
import { useState } from 'react'
import * as E from '../game/engine'
import * as M from '../game/market'
import { RES, RESOURCES } from '../game/data'
import { ResIcon } from './art'
import { dur, money, num } from './fmt'

type Act = (f: (st: E.GameState) => string | null | void) => void

export function Exchange({ s, act }: { s: E.GameState; act: Act }) {
  const [res, setRes] = useState('seeds')
  const [minQ, setMinQ] = useState(0)
  const [bq, setBq] = useState(100)
  const lots = Object.entries(s.stock).map(([k, v]) => ({ k, v, ...E.parseKey(k) })).filter(l => l.res === res)
  const [sellQ, setSellQ] = useState(0)
  const lot = lots.find(l => l.q === sellQ) ?? lots[0]
  const [sq, setSq] = useState(0)
  const [price, setPrice] = useState(0)
  const ref = M.refPrice(s, res)
  const qty = sq || Math.floor(lot?.v ?? 0)
  const p = price || Math.round(ref * 1.05 * 100) / 100
  const quote = M.quoteBuy(s, res, bq, minQ)
  const mine = s.asks.filter(o => o.owner === 'me')

  return (
    <div className="ex">
      <div>
        <label>Good <select value={res} onChange={e => { setRes(e.target.value); setSq(0); setPrice(0) }}>
          {RESOURCES.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>{' '}
        <ResIcon id={res} /> going price <b>{money(ref)}</b> · min quality <select value={minQ} onChange={e => setMinQ(Number(e.target.value))}>{[0, 1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}+</option>)}</select>
        <PriceChart data={[...(s.priceHist?.[res] ?? []), ref]} />
        <table className="demand"><thead><tr><th>Seller</th><th>Q</th><th>Qty</th><th>Price</th></tr></thead>
          <tbody>{M.book(s, res, minQ).slice(0, 8).map(o => <tr key={o.id} className={o.owner === 'me' ? 'mine' : ''}><td>{o.owner === 'me' ? 'You' : 'Trader'}</td><td>Q{o.q}</td><td>{num(o.qty)}</td><td>{money(o.price)}</td></tr>)}</tbody></table>
      </div>
      <div className="card">
        <b>Buy</b>
        <label>Amount <input type="number" min={1} value={bq} onChange={e => setBq(Number(e.target.value))} /></label>
        <button className="primary" disabled={!isFinite(quote) || quote > s.cash} onClick={() => act(st => M.buy(st, res, bq, minQ))}>{isFinite(quote) ? `Buy for ${money(quote)}` : 'Not enough listed'}</button>
      </div>
      <div className="card">
        <b>Sell</b>
        {!lot ? <span className="muted">You have no {RES[res].name}.</span> : <>
          <label>Lot <select value={lot.q} onChange={e => { setSellQ(Number(e.target.value)); setSq(0) }}>{lots.map(l => <option key={l.q} value={l.q}>Q{l.q} ({num(l.v)})</option>)}</select></label>
          <label>Amount <input type="number" min={1} value={qty} onChange={e => setSq(Number(e.target.value))} /></label>
          <label>Price $<input type="number" step="0.01" value={p} onChange={e => setPrice(Number(e.target.value))} /></label>
          <small>Needs {M.cratesFor(res, qty)} crates (have {num(E.haveQty(s, 'crates'))}) · 3% fee → you get {money(qty * p * (1 - M.FEE))}</small>
          <button className="primary" onClick={() => act(st => M.placeAsk(st, res, lot.q, qty, p))}>List on exchange</button>
          <button onClick={() => act(st => M.quickSell(st, res, lot.q, qty))}>Quick sell to traders at {money(M.bidPrice(s, res, lot.q))} ({num(s.bidLeft[res] ?? 0)} left today)</button>
        </>}
      </div>
      <div className="card">
        <b>Your orders</b>
        {mine.length === 0 && <span className="muted">None.</span>}
        {mine.map(o => <span key={o.id}><ResIcon id={o.res} size={16} /> {num(o.qty)} {RES[o.res].name} Q{o.q} at {money(o.price)} · expires in {dur(M.EXPIRE_H - (s.hour - o.placedH))}{' '}
          <button onClick={() => act(st => M.cancelAsk(st, o.id))}>Cancel{M.cancelFee(s, o) ? ` (fee ${money(M.cancelFee(s, o))})` : ''}</button></span>)}
      </div>
    </div>
  )
}

/** Area chart of the going price over the last days (plus today). */
function PriceChart({ data }: { data: number[] }) {
  const W = 300, H = 70
  if (data.length < 2) return <div className="chart muted">Price history builds up day by day.</div>
  const lo = Math.min(...data) * 0.97, hi = Math.max(...data) * 1.03
  const pts = data.map((v, i) => [(i / (data.length - 1)) * W, H - ((v - lo) / (hi - lo || 1)) * H])
  const line = pts.map(p => p.join(',')).join(' ')
  const up = data[data.length - 1] >= data[0]
  const c = up ? '#3c9a5f' : '#d0584a'
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H + 14}`}>
      <defs><linearGradient id="pc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c} stopOpacity=".35" /><stop offset="1" stopColor={c} stopOpacity="0" /></linearGradient></defs>
      <polygon points={`0,${H} ${line} ${W},${H}`} fill="url(#pc)" />
      <polyline points={line} fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3.5" fill={c} />
      <text x="0" y={H + 12} fontSize="10" fill="#8a8296">{data.length - 1} days ago</text>
      <text x={W} y={H + 12} fontSize="10" fill="#8a8296" textAnchor="end">today {money(data[data.length - 1])}</text>
    </svg>
  )
}
