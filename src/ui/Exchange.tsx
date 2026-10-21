// Exchange tab: order book for one good, buy from the cheapest asks, list
// your own goods for sale (needs shipping crates), quick-sell to NPC buyers,
// and manage your open orders.
import { useState } from 'react'
import * as E from '../game/engine'
import * as M from '../game/market'
import { RES, RESOURCES } from '../game/data'
import { ResIcon } from './art'
import { dur, money, num } from './fmt'
import { QtyPicker, clampQty } from './QtyPicker'
import * as Q from '../game/qty'
import * as B from '../game/bids'

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
  const lim = lot ? Q.maxList(s, res, lot.q, true) : { max: 0, why: '' }
  const qty = clampQty(sq || lim.max, lim.max)
  const qlim = lot ? Q.maxQuick(s, res, lot.q, true) : { max: 0, why: '' }
  const blim = Q.maxBuy(s, res, minQ)
  const bqty = clampQty(bq, blim.max)
  const p = price || Math.round(ref * 1.05 * 100) / 100
  const quote = M.quoteBuy(s, res, Math.max(1, Math.min(bq, Q.maxBuy(s, res, minQ).max || 1)), minQ)
  const mine = s.asks.filter(o => o.owner === 'me')
  // Standing buy order form (EVE-style bid with escrow, see game/bids.ts).
  const [bidQty, setBidQty] = useState(100)
  const [bidP, setBidP] = useState(0)
  const bp = bidP || Math.round(ref * 0.95 * 100) / 100 // default: 5% under the going price
  const bids = s.bids ?? []

  return (
    <div className="ex">
      <div>
        <label>Good <select value={res} onChange={e => { setRes(e.target.value); setSq(0); setPrice(0) }}>
          {RESOURCES.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>{' '}
        <ResIcon id={res} /> going price <b>{money(ref)}</b> · min quality <select value={minQ} onChange={e => setMinQ(Number(e.target.value))}>{[0, 1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}+</option>)}</select>
        <PriceChart data={[...(s.priceHist?.[res] ?? []), ref]} />
        <table className="demand"><thead><tr><th>Seller</th><th>Q</th><th>Qty</th><th>Price</th></tr></thead>
          <tbody>{bids.filter(b => b.res === res).map(b => <tr key={'b' + b.id} className="mine bidrow"><td>Your bid</td><td>Q{b.minQ}+</td><td>{num(b.qty)}</td><td>{money(b.price)}</td></tr>)}
          {M.book(s, res, minQ).slice(0, 8).map(o => <tr key={o.id} className={o.owner === 'me' ? 'mine' : ''}><td>{o.owner === 'me' ? 'You' : 'Trader'}</td><td>Q{o.q}</td><td>{num(o.qty)}</td><td>{money(o.price)}</td></tr>)}</tbody></table>
      </div>
      <div className="card">
        <b>Buy</b>
        <QtyPicker value={bqty} max={blim.max} why={blim.why} onChange={setBq} />
        {blim.max >= 1 && <small>{num(bqty)} for {money(quote)} · avg {money(quote / bqty)} each</small>}
        <button className="primary" disabled={blim.max < 1 || !isFinite(quote) || quote > s.cash} onClick={() => act(st => M.buy(st, res, bqty, minQ))}>{blim.max >= 1 ? `Buy ${num(bqty)} for ${money(quote)}` : 'Nothing you can buy'}</button>
      </div>
      <div className="card bidcard">
        <b>Buy order</b>
        <small className="muted">Name your price and wait. The cash is held until the order fills; it buys from any seller at or below your price, cheapest first. 1% broker fee on the waiting part{M.feeRate(s) < M.FEE ? ', cut by your CFO' : ''}.</small>
        <DepthChart s={s} res={res} />
        <label>Amount <input type="number" min={1} step={1} value={bidQty} onChange={e => setBidQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))} /></label>
        <label>Your price $<input type="number" step="0.01" value={bp} onChange={e => setBidP(Number(e.target.value))} /></label>
        <span className="chips">{[0.85, 0.9, 0.95, 1].map(f => <button key={f} onClick={() => setBidP(Math.round(ref * f * 100) / 100)}>{f === 1 ? 'Going' : `−${Math.round((1 - f) * 100)}%`}</button>)}</span>
        <small>Holds up to {money(B.bidCost(bidQty, bp))} · Q{minQ}+ only · {bids.length}/{B.MAX_BIDS} orders</small>
        <button className="primary" disabled={bids.length >= B.MAX_BIDS || s.cash < B.bidCost(bidQty, bp)} onClick={() => act(st => B.placeBid(st, res, minQ, bidQty, bp))}>Place buy order: {num(bidQty)} at {money(bp)}</button>
      </div>
      <div className="card">
        <b>Your buy orders</b>
        {bids.length === 0 && <span className="muted">None.</span>}
        {bids.map(b => <span key={b.id} className="bidline"><ResIcon id={b.res} size={16} /> {num(b.total - b.qty)}/{num(b.total)} {RES[b.res].name} Q{b.minQ}+ at {money(b.price)} · {money(b.escrow)} held · expires in {dur(M.EXPIRE_H - (s.hour - b.placedH))}
          <span className="bar"><i style={{ width: `${Math.round(100 * (b.total - b.qty) / b.total)}%` }} /></span>{' '}
          <button onClick={() => act(st => B.cancelBid(st, b.id))}>Cancel</button></span>)}
      </div>
      <div className="card">
        <b>Sell</b>
        {!lot ? <span className="muted">You have no {RES[res].name}.</span> : <>
          <label>Lot <select value={lot.q} onChange={e => { setSellQ(Number(e.target.value)); setSq(0) }}>{lots.map(l => <option key={l.q} value={l.q}>Q{l.q} ({num(l.v)})</option>)}</select></label>
          <QtyPicker value={qty} max={lim.max} why={lim.why} onChange={setSq} />
          <label>Price $<input type="number" step="0.01" value={p} onChange={e => setPrice(Number(e.target.value))} /></label>
          {/* Crates: needed vs owned; if short, the buttons buy the shortfall in the same step. */}
          <CrateLine s={s} res={res} qty={qty} />
          <small>{(M.feeRate(s) * 100).toFixed(2).replace(/\.?0+$/, '')}% fee{M.feeRate(s) < M.FEE ? ' (CFO discount)' : ''} → you get {money(qty * p * (1 - M.feeRate(s)))}</small>
          <button className="primary" disabled={lim.max < 1} onClick={() => withCrateConfirm(s, res, qty) && act(st => M.withCrates(st, res, qty, () => M.placeAsk(st, res, lot.q, qty, p)))}>{M.crateShort(s, res, qty) ? `Add ${num(M.crateShort(s, res, qty))} crates + list ${num(qty)}` : `List ${num(qty)} on exchange`}</button>
          <button disabled={qlim.max < 1} title={qlim.why} onClick={() => { const n = Math.min(qty, qlim.max); if (withCrateConfirm(s, res, n)) act(st => M.withCrates(st, res, n, () => M.quickSell(st, res, lot.q, n))) }}>{M.crateShort(s, res, Math.min(qty, qlim.max)) ? `+${num(M.crateShort(s, res, Math.min(qty, qlim.max)))} crates · ` : ''}Quick sell {num(Math.min(qty, qlim.max))} to traders at {money(M.bidPrice(s, res, lot.q))} → {money(Math.min(qty, qlim.max) * M.bidPrice(s, res, lot.q) * (1 - M.feeRate(s)))} ({num(s.bidLeft[res] ?? 0)} wanted today)</button>
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

/**
 * Market depth chart (EVE-style): green steps on the left are units wanted
 * at or above each bid price (your bids + traders' quick-sell bid), red steps
 * on the right are units for sale at or below each ask price. The gap in the
 * middle is the spread. Your own bids are marked with a gold dot.
 */
function DepthChart({ s, res }: { s: E.GameState; res: string }) {
  const W = 300, H = 80
  const { asks, bids } = B.depthCurve(s, res, M.bidPrice(s, res, 0))
  if (!asks.length && !bids.length) return null
  const prices = [...asks, ...bids].map(p => p.price)
  const lo = Math.min(...prices) * 0.97, hi = Math.max(...prices) * 1.03
  const maxCum = Math.max(1, ...asks.map(a => a.cum), ...bids.map(b => b.cum))
  const x = (p: number) => ((p - lo) / (hi - lo || 1)) * W
  const y = (c: number) => H - (c / maxCum) * (H - 6)
  // Step lines: asks rise to the right, bids rise to the left.
  const stepA = asks.reduce((acc, a, i) => acc + ` ${x(a.price)},${y(i ? asks[i - 1].cum : 0)} ${x(a.price)},${y(a.cum)}`, '')
  const stepB = bids.reduce((acc, b, i) => acc + ` ${x(b.price)},${y(i ? bids[i - 1].cum : 0)} ${x(b.price)},${y(b.cum)}`, '')
  const aEnd = asks.length ? `${W},${y(asks[asks.length - 1].cum)} ${W},${H}` : ''
  const bEnd = bids.length ? `0,${y(bids[bids.length - 1].cum)} 0,${H}` : ''
  return (
    <svg className="chart depth" viewBox={`0 0 ${W} ${H + 14}`} aria-label="Market depth">
      {asks.length > 0 && <polygon points={`${x(asks[0].price)},${H}${stepA} ${aEnd}`} fill="#d0584a" fillOpacity=".22" stroke="#d0584a" strokeWidth="1.5" />}
      {bids.length > 0 && <polygon points={`${x(bids[0].price)},${H}${stepB} ${bEnd}`} fill="#3c9a5f" fillOpacity=".22" stroke="#3c9a5f" strokeWidth="1.5" />}
      {bids.filter(b => b.mine).map((b, i) => <circle key={i} cx={x(b.price)} cy={y(b.cum)} r="3.5" fill="#e0a526" stroke="#fff" />)}
      <line x1={x(M.refPrice(s, res))} x2={x(M.refPrice(s, res))} y1="0" y2={H} stroke="#8a8296" strokeDasharray="2 3" />
      <text x="2" y={H + 12} fontSize="10" fill="#3c9a5f">wanted ← {money(lo)}</text>
      <text x={W - 2} y={H + 12} fontSize="10" fill="#d0584a" textAnchor="end">{money(hi)} → for sale</text>
    </svg>
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
      {[0.25, 0.5, 0.75].map(f => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="#e6dac4" strokeDasharray="3 4" />)}
      <polygon points={`0,${H} ${line} ${W},${H}`} fill="url(#pc)" />
      <text x={W - 2} y="10" fontSize="10" fill="#8a8296" textAnchor="end">high {money(Math.max(...data))}</text>
      <text x={W - 2} y={H - 3} fontSize="10" fill="#8a8296" textAnchor="end">low {money(Math.min(...data))}</text>
      <polyline points={line} fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3.5" fill={c} />
      <text x="0" y={H + 12} fontSize="10" fill="#8a8296">{data.length - 1} days ago</text>
      <text x={W} y={H + 12} fontSize="10" fill="#8a8296" textAnchor="end">today {money(data[data.length - 1])}</text>
    </svg>
  )
}

/** "Crates: 12 needed · 5 owned · short 7 ($3.10)" line under the sell form. */
function CrateLine({ s, res, qty }: { s: E.GameState; res: string; qty: number }) {
  const need = res === 'crates' ? 0 : M.cratesFor(res, qty), have = Math.floor(E.haveQty(s, 'crates')), short = M.crateShort(s, res, qty)
  return <div className={`crate-line ${short ? 'short' : ''}`}><ResIcon id="crates" size={18} />
    <span>Crates: <b>{num(need)}</b> needed · <b>{num(have)}</b> owned{short ? <> · short <b>{num(short)}</b> ({money(M.crateShortCost(s, res, qty))}, bought automatically)</> : need ? ' ✓' : ''}</span></div>
}
/** One confirm when crates will be bought as part of the step. */
export function withCrateConfirm(s: E.GameState, res: string, qty: number) {
  const n = M.crateShort(s, res, qty)
  return !n || confirm(`You're ${n} shipping crates short. Buy ${n} crates for ${money(M.crateShortCost(s, res, qty))} and continue?`)
}
