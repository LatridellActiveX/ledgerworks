// Finance tab: credit rating, issue/repay your bonds, buy NPC bonds,
// and the weekly government order.
import { useState } from 'react'
import * as E from '../game/engine'
import * as F from '../game/finance'
import { RES } from '../game/data'
import { ResIcon } from './art'
import { dur, money, num } from './fmt'
import { QtyPicker, clampQty } from './QtyPicker'
import * as Q from '../game/qty'

type Act = (f: (st: E.GameState) => string | null | void) => void
const pct = (r: number) => `${(r * 100).toFixed(2)}%`

export function Finance({ s, act }: { s: E.GameState; act: Act }) {
  const [lots, setLots] = useState(2)
  const rating = F.myRating(s)
  const [rate, setRate] = useState(F.MIN_RATE[rating] * 100)
  const lvl = E.companyLevel(s.xp)
  const g = s.gov
  return (
    <div className="fin">
      <div className="card">
        <b>Your bonds</b>
        {lvl < F.BOND_LEVEL ? <span className="muted">Bonds unlock at level {F.BOND_LEVEL}.</span> : <>
          <span>Rating <b className={`rating r${F.RATINGS.indexOf(rating)}`}>{rating}</b> · investors want ≥ {pct(F.MIN_RATE[rating])}/day · debt {money(F.debt(s))} of {money(F.debtLimit(s))} limit</span>
          <QtyPicker label="Lots" value={clampQty(lots, Math.max(1, Math.floor((F.debtLimit(s) - F.debt(s)) / 5000)))} max={Math.floor((F.debtLimit(s) - F.debt(s)) / 5000)} why="Debt limit for your rating" onChange={setLots} />
          <label>Daily rate % <input type="number" step="0.1" min={0.4} max={2.5} value={rate} onChange={e => setRate(Number(e.target.value))} /></label>
          <button className="primary" onClick={() => act(st => F.issueBond(st, lots, rate / 100))}>Raise {money(lots * F.BOND_LOT)}</button>
          {(s.bonds ?? []).map(b => <span key={b.id}>{money(b.amount)} at {pct(b.rate)}/day <button disabled={s.hour - b.soldH < F.CALL_AFTER_H} onClick={() => act(st => F.callBond(st, b.id))}>{s.hour - b.soldH < F.CALL_AFTER_H ? `Repay in ${dur(F.CALL_AFTER_H - (s.hour - b.soldH))}` : 'Repay'}</button></span>)}
        </>}
      </div>
      <div className="card">
        <b>Invest in bonds</b>
        {(s.bondOffers ?? []).map(o => <span key={o.id}>{o.issuer} <b className={`rating r${F.RATINGS.indexOf(o.rating)}`}>{o.rating}</b> {money(o.amount)} at {pct(o.rate)}/day <button disabled={lvl < F.BOND_LEVEL} onClick={() => act(st => F.buyBond(st, o.id))}>Buy</button></span>)}
        <small className="muted">Riskier ratings pay more but may default. Holdings: {money(F.heldValue(s))}</small>
        {(s.holdings ?? []).map(h => <span key={h.id}>• {h.issuer} {h.rating} {money(h.amount)} @ {pct(h.rate)}</span>)}
      </div>
      <div className="card">
        <b>Government order</b>
        {lvl < F.GOV_LEVEL ? <span className="muted">Unlocks at level {F.GOV_LEVEL}. A new order arrives each game week.</span>
          : !g ? <span className="muted">No order right now. One arrives on day 3 of each week.</span> : <>
            <span><b>{g.title}</b> · {g.status} · value {money(F.govValue(g))} · deposit {money(g.deposit)}</span>
            {g.items.map(i => <GovItem key={i.res} s={s} act={act} item={i} active={g.status === 'active'} />)}
            {g.status === 'offer' && <button className="primary" onClick={() => act(st => F.acceptGov(st))}>Accept (deposit {money(g.deposit)}) · offer ends in {dur(g.offerUntilH - s.hour)}</button>}
            {g.status === 'active' && <small>Deadline in {dur(g.deadlineH - s.hour)}</small>}
          </>}
      </div>
    </div>
  )
}

/** One line of the government order, with an amount picker for deliveries. */
function GovItem({ s, act, item: i, active }: { s: E.GameState; act: Act; item: F.GovOrder['items'][number]; active: boolean }) {
  const lim = Q.maxGov(s, i.res)
  const [want, setWant] = useState(lim.max)
  const n = clampQty(want, lim.max)
  return <div className="gov-item">
    <span><ResIcon id={i.res} size={16} /> {RES[i.res].name} Q{i.q}+ · {num(i.done)}/{num(i.qty)} at {money(i.price)}</span>
    {active && i.done < i.qty && <>
      <QtyPicker label="Deliver" value={n} max={lim.max} why={lim.why} onChange={setWant} />
      <button disabled={lim.max < 1} onClick={() => act(st => F.deliverGov(st, i.res, n))}>Deliver {num(n)} for {money(n * i.price)}</button>
    </>}
  </div>
}
