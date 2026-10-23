// Shop form: pick a good (and quality lot) this shop can sell, set amount and
// price, and see how long the public takes to buy it all. A live demand curve
// shows how many units an hour the shop moves at each price, and the shop's
// fittings, tills and clerk are managed underneath.
import { useEffect, useState } from 'react'
import * as E from '../game/engine'
import { BLD, RES } from '../game/data'
import { BAY_WAGE_MULT, CLERK_WAGE, FITTINGS, TILL_MAX, maxSellHours, tillShare } from '../game/shop'
import { ResIcon } from './art'
import { dur, money, num } from './fmt'
import { QtyPicker, clampQty } from './QtyPicker'
import * as Q from '../game/qty'

type Act = (f: (st: E.GameState) => string | null | void) => void

/** Units an hour this shop moves at prices from 40% to 250% of fair, plus the best-revenue price. */
function demandCurve(s: E.GameState, res: string, q: number, bd: E.Building) {
  const fair = E.fairPrice(res, q)
  const pts = Array.from({ length: 41 }, (_, i) => {
    const price = fair * (0.4 + (i * 2.1) / 40)
    return { price, u: E.sellRate(s, res, q, price, bd) * E.shopSpeed(bd) }
  })
  const best = pts.reduce((a, b) => (b.price * b.u > a.price * a.u ? b : a))
  return { pts, pmin: pts[0].price, pmax: pts[pts.length - 1].price, umax: Math.max(...pts.map(p => p.u), 1e-9), best }
}

function DemandCurve({ s, res, q, bd, price }: { s: E.GameState; res: string; q: number; bd: E.Building; price: number }) {
  const { pts, pmin, pmax, umax, best } = demandCurve(s, res, q, bd)
  const W = 300, H = 110
  const x = (p: number) => ((p - pmin) / (pmax - pmin)) * W
  const y = (u: number) => H - 6 - (u / umax) * (H - 14)
  const line = pts.map(p => `${x(p.price).toFixed(1)},${y(p.u).toFixed(1)}`).join(' ')
  const here = E.sellRate(s, res, q, price, bd) * E.shopSpeed(bd)
  const cx = Math.min(W, Math.max(0, x(price)))
  return (
    <figure className="demand">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Units an hour at each price">
        <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" />
        <line x1={x(best.price)} x2={x(best.price)} y1={4} y2={H - 4} stroke="#3c7a4a" strokeDasharray="3 3" />
        <line x1={cx} x2={cx} y1={4} y2={H - 4} stroke="#b0413e" />
        <circle cx={cx} cy={Math.min(H - 6, Math.max(6, y(here)))} r={4} fill="#b0413e" />
      </svg>
      <figcaption className="muted">
        Now {num(here)} units/h at {money(price)}. Most takings at about {money(best.price)} (green line). Red line is your price.
      </figcaption>
    </figure>
  )
}

export function RetailPanel({ s, plot, act }: { s: E.GameState; plot: number; act: Act }) {
  const bd = s.plots[plot]!, store = BLD[bd.type].store
  // Lots in the warehouse this shop can sell.
  const lots = Object.entries(s.stock).map(([k, v]) => ({ k, v, ...E.parseKey(k) })).filter(l => RES[l.res].store === store)
  const [pick, setPick] = useState(lots[0]?.k ?? '')
  const lot = lots.find(l => l.k === pick) ?? lots[0]
  const [qty, setQty] = useState(0)
  const [price, setPrice] = useState(0)
  const goods = Object.values(RES).filter(r => r.store === store)
  const fitted = new Set(bd.mods ?? [])
  const cap = maxSellHours(bd.mods)
  const fittings = (
    <div className="fittings">
      <h4>Fittings</h4>
      {FITTINGS.map(f => (
        <div key={f.id} className="fit-row">
          <span><b>{f.name}</b> <small className="muted">{f.desc}</small></span>
          {fitted.has(f.id)
            ? <small>Fitted</small>
            : <button onClick={() => act(st => E.buyFitting(st, plot, f.id))}>Buy {money(Math.round(BLD[bd.type].cost * f.share))}</button>}
        </div>
      ))}
      <div className="fit-row">
        <span><b>Tills</b> <small className="muted">{bd.till ?? 0} of {TILL_MAX}: each +10% sales speed</small></span>
        <button disabled={(bd.till ?? 0) >= TILL_MAX} onClick={() => act(st => E.buyTill(st, plot))}>
          {(bd.till ?? 0) >= TILL_MAX ? 'Full' : `Add till ${money(Math.round(BLD[bd.type].cost * tillShare(bd.till ?? 0)))}`}
        </button>
      </div>
      <div className="fit-row">
        <span><b>Shift clerk</b> <small className="muted">doubles speed 9am to 5pm, paid per shift hour</small></span>
        <button onClick={() => act(st => E.setClerk(st, plot, !bd.clerk))}>{bd.clerk ? 'Let go' : 'Hire'}</button>
      </div>
    </div>
  )
  if (!lot) return <div className="card">Nothing to sell yet. This shop sells: {goods.map(g => <span key={g.id}><ResIcon id={g.id} size={16} /> {g.name} </span>)}{fittings}</div>

  const fair = E.fairPrice(lot.res, lot.q)
  const p = price || Math.round(fair * 100) / 100
  const lim = Q.maxSell(s, plot, lot.res, lot.q, p)
  const q = clampQty(qty || lim.max, lim.max)
  const hours = E.sellHours(s, lot.res, lot.q, p, q, bd.level, bd)
  const sat = s.saturation[lot.res] ?? 1
  return (
    <div className="card">
      <label>Sell <select value={lot.k} onChange={e => { setPick(e.target.value); setQty(0); setPrice(0) }}>
        {lots.map(l => <option key={l.k} value={l.k}>{RES[l.res].name} Q{l.q} ({num(l.v)})</option>)}
      </select></label>
      <label>Price each $<input type="number" step="0.01" min={0.01} value={p} onChange={e => setPrice(Number(e.target.value))} /> <small className="muted">fair ≈ {money(fair)}</small></label>
      <DemandCurve s={s} res={lot.res} q={lot.q} bd={bd} price={p} />
      <QtyPicker value={q} max={lim.max} why={lim.why} onChange={setQty} />
      <div>Market: <b style={{ color: sat > 1.15 ? '#b0413e' : sat < 0.9 ? '#3c7a4a' : undefined }}>{sat > 1.15 ? 'flooded' : sat < 0.9 ? 'hungry' : 'normal'}</b> ({num(sat)}×)</div>
      <div className="preview">
        <div><span>Sells out in</span><b>{dur(hours)}</b></div>
        <div><span>Revenue</span><b>{money(q * p)}</b></div>
        <div><span>Wages</span><b>{money(E.makeWages(bd.type, bd.level, hours, s) * (fitted.has('bay') ? BAY_WAGE_MULT : 1) + (bd.clerk ? E.shiftHoursIn(s.hour, hours) * CLERK_WAGE : 0))}</b></div>
      </div>
      <button className="primary" disabled={hours > cap || lim.max < 1} onClick={() => act(st => E.startSell(st, plot, lot.res, lot.q, q, p))}>{hours > cap ? 'Too slow — lower price' : 'Start selling'}</button>
      {fittings}
    </div>
  )
}

/**
 * While a store is busy selling, keep showing everything else it could sell
 * (price, warehouse stock, earnings an hour) so the player can plan the next
 * sale. Each Sell button looks disabled and carries the note; tapping it still
 * routes through act() a tap only opens a tooltip with the reason; the engine
 * check (E.SELL_BUSY_MSG) independently blocks a second sale.
 */
export function OtherGoods({ s, plot }: { s: E.GameState; plot: number }) {
  const bd = s.plots[plot]!, store = BLD[bd.type].store
  const cur = bd.job?.kind === 'sell' ? E.key(bd.job.res, bd.job.q) : ''
  // Every lot in the warehouse this store can sell, minus the one on sale now.
  const lots = Object.entries(s.stock).map(([k, v]) => ({ k, v, ...E.parseKey(k) }))
    .filter(l => RES[l.res].store === store && l.k !== cur && l.v >= 1)
  // Which row's tooltip is open ('' = none). Auto-hides after 2 s; any tap
  // elsewhere on the page also closes it.
  const [tip, setTip] = useState('')
  useEffect(() => {
    if (!tip) return
    const t = setTimeout(() => setTip(''), 2000)
    const off = () => setTip('')
    document.addEventListener('pointerdown', off)
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', off) }
  }, [tip])
  if (!lots.length) return null
  return (
    <div className="card other-goods">
      <h4>Other goods this store sells</h4>
      {lots.map(l => {
        const price = E.fairPrice(l.res, l.q)
        // Units an hour at the fair price for this shop, times the price.
        const perH = E.sellRate(s, l.res, l.q, price, bd) * E.shopSpeed(bd) * price
        return (
          <div key={l.k} className="fit-row">
            <span><ResIcon id={l.res} /> <b>{RES[l.res].name} Q{l.q}</b> <small className="muted">{money(price)} · {num(l.v)} in warehouse · {money(perH)}/h</small></span>
            {/* Greyed-out Sell. A tap shows the reason in a small tooltip on
                this button only (no toast, no sale); it hides after 2 s or on
                the next tap anywhere. The engine refuses the sale regardless. */}
            <span className="tip-anchor">
              <button className="locked" aria-disabled="true" aria-describedby={tip === l.k ? 'sell-tip' : undefined}
                onClick={e => { e.stopPropagation(); setTip(l.k) }}>Sell</button>
              {tip === l.k && <span id="sell-tip" role="tooltip" className="sell-tip">{E.SELL_BUSY_MSG}</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}
