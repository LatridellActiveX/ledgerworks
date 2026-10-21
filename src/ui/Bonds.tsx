// Bond market (Finance tab): list the bonds you hold on the player board, buy
// bonds other players list, and move bonds from your bond box into your company.
// Bonds you buy pay interest like any holding once they are in your company.
// The 3% board fee applies, as on the goods board.
import { useEffect, useState } from 'react'
import * as E from '../game/engine'
import * as F from '../game/finance'
import * as T from '../game/trade'
import { money } from './fmt'
import { PlayerLink } from './PlayerLink'
import { useTrader } from './Trading'

type Act = (f: (st: E.GameState) => string | null | void) => void
const pct = (r: number) => `${(r * 100).toFixed(2)}%`

export function BondMarket({ s, act, user }: { s: E.GameState; act: Act; user?: string | null }) {
  const lvl = E.companyLevel(s.xp)
  const t = useTrader(user)
  const [board, setBoard] = useState<any[]>([])
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [note, setNote] = useState('')
  const refresh = () => T.p2p('board', {}).then(j => setBoard(j.bonds ?? [])).catch(() => setNote('Offline'))
  useEffect(() => { refresh() }, [])
  const flash = (m: string) => { setNote(m); setTimeout(() => setNote(''), 4000) }
  const after = async (p: Promise<any>, ok: string) => { const j = await p; if (j) { flash(ok); refresh() } return j }

  // Company holding -> bond box -> board. The holding leaves the company only once the box has it.
  const listHolding = async (h: F.Holding, price: number) => {
    const j = await t.run('depositBond', { bond: { issuer: h.issuer, rating: h.rating, amount: h.amount, rate: h.rate } })
    if (!j) return
    act(st => { st.holdings = (st.holdings ?? []).filter(x => x.id !== h.id) })
    const l = await t.run('listBond', { id: j.result.id, price })
    if (l) flash(`Listed ${h.issuer} for ${money(price)}.`); else flash('Saved to your bond box. List it from there.')
    refresh()
  }
  const listFromBox = async (c: any, price: number) => { if (await t.run('listBond', { id: c.id, price })) { flash(`Listed ${c.issuer} for ${money(price)}.`); refresh() } }
  const moveIn = async (c: any) => {
    const j = await t.run('withdrawBond', { id: c.id })
    if (!j) return
    const cert = j.result
    act(st => { st.holdings = [...(st.holdings ?? []), { id: st.nextUid++, issuer: cert.issuer, rating: cert.rating as F.Rating, amount: cert.amount, rate: cert.rate, boughtH: st.hour }] })
    flash(`${cert.issuer} is now in your company and pays interest.`)
  }

  if (lvl < F.BOND_LEVEL) return <span className="muted">The bond market opens at level {F.BOND_LEVEL}.</span>
  if (!user) return <div className="bond-cta"><small className="muted">Sign in to list and buy bonds with other players. Your account keeps the bonds safe on every device.</small></div>
  const box: any[] = t.me?.bonds ?? [], mine: any[] = t.me?.bondListings ?? []
  const wallet = t.me?.wallet ?? 0
  return <div className="bonds">
    {note && <span className="ok-note">{note}</span>}
    {t.msg && <span className="err">{t.msg}</span>}
    <small className="muted">Trading wallet {money(wallet)}. Move cash in and out on the Trade floor.</small>

    <b>List from your company</b>
    {(s.holdings ?? []).length === 0 && <span className="muted">You hold no bonds. Buy some above, or from the board below.</span>}
    {(s.holdings ?? []).map(h => {
      const p = prices[`h${h.id}`] ?? h.amount
      return <div key={h.id} className="bond-row">
        <span><b>{h.issuer}</b> <span className={`rating r${F.RATINGS.indexOf(h.rating as F.Rating)}`}>{h.rating}</span> {money(h.amount)} at {pct(h.rate)}/day</span>
        <span className="chips">{[1, 0.98, 0.95].map(f => <button key={f} onClick={() => setPrices({ ...prices, [`h${h.id}`]: Math.round(h.amount * f) })}>{f === 1 ? 'Face' : `−${Math.round((1 - f) * 100)}%`}</button>)}</span>
        <label>Price $<input type="number" value={p} onChange={e => setPrices({ ...prices, [`h${h.id}`]: Number(e.target.value) })} /></label>
        <button disabled={!(p > 0)} onClick={() => listHolding(h, p)}>List for {money(p)}</button>
      </div>
    })}

    <b>Your bond box</b>
    {box.length === 0 && <span className="muted">Empty. Bonds you buy or deposit wait here until you move them in.</span>}
    {box.map(c => <div key={c.id} className="bond-row">
      <span><b>{c.issuer}</b> <span className={`rating r${F.RATINGS.indexOf(c.rating as F.Rating)}`}>{c.rating}</span> {money(c.amount)} at {pct(c.rate)}/day</span>
      <button onClick={() => moveIn(c)}>Move into company</button>
      <button onClick={() => listFromBox(c, c.amount)}>List at face</button>
    </div>)}

    <b>Bonds for sale</b>
    {board.length === 0 && <span className="muted">No bonds listed right now.</span>}
    {board.map((o: any) => <div key={o.id} className="bond-row">
      <span><b>{o.issuer}</b> <span className={`rating r${F.RATINGS.indexOf(o.rating as F.Rating)}`}>{o.rating}</span> {money(o.amount)} at {pct(o.rate)}/day · {money(o.price)} <small className="muted">({Math.round(100 * o.price / o.amount)}% of face)</small></span>
      <PlayerLink name={o.seller} />
      {o.seller === t.me?.name ? <span className="muted">yours</span>
        : <button disabled={wallet < o.price} onClick={() => after(t.run('buyBond', { id: o.id }), `Bought ${o.issuer}. It is in your bond box.`)}>Buy for {money(o.price)}</button>}
    </div>)}

    <b>Your listings</b>
    {mine.length === 0 && <span className="muted">None.</span>}
    {mine.map((o: any) => <div key={o.id} className="bond-row">
      <span>{o.issuer} · {money(o.amount)} at {pct(o.rate)}/day · asking {money(o.price)}</span>
      <button onClick={() => after(t.run('cancelBond', { id: o.id }), 'Listing taken back to your bond box.')}>Take back</button>
    </div>)}
    <small className="muted">Sales pay the list price less the 3% board fee. Interest is paid by the issuing firm to whoever holds the bond.</small>
  </div>
}
