// Shared trading pieces used by the Trade floor, the Market, bonds and player
// profiles: the signed-in trader account, buying a goods order and taking it
// home in one step, and contracts (compose, inbox, outbox).
//
// Contracts: 1 to 5 item lines taken from your trading depot, one total price,
// an optional note, and a 7-day expiry. No service fee and no shipping crates.
import { useCallback, useEffect, useState } from 'react'
import * as E from '../game/engine'
import * as M from '../game/market'
import * as T from '../game/trade'
import { RES, RESOURCES } from '../game/data'
import { money, num } from './fmt'
import { QtyPicker, clampQty } from './QtyPicker'
import { PlayerLink } from './PlayerLink'

type Act = (f: (st: E.GameState) => string | null | void) => void
export const MAX_LINES = 5
export const NOTE_MAX = 140

/** Signed-in trader account: wallet, depot, bond box, your listings and contracts. */
export function useTrader(user?: string | null) {
  const [me, setMe] = useState<any>(null)
  const [msg, setMsg] = useState('')
  const load = useCallback(async () => {
    if (!user) return
    try { const j = await T.p2p('me', {}); setMe(j.me) } catch (e: any) { setMsg(e.message) }
  }, [user])
  useEffect(() => { load() }, [load])
  const run = useCallback(async (op: string, body: any = {}) => {
    try { const j = await T.p2p(op, body); if (j.me) setMe(j.me); setMsg(''); return j } catch (e: any) { setMsg(e.message); return null }
  }, [])
  return { me, msg, setMsg, run, reload: load }
}

/**
 * Buy part of a goods order and take it home in one step: the goods go to the
 * trader depot on the server, then leave it for your company warehouse.
 */
export async function buyAndTakeHome(run: (op: string, body?: any) => Promise<any>, act: Act, o: { id: number; res: string; q: number }, qty: number) {
  const j = await run('buy', { id: o.id, qty })
  if (!j) return false
  const got = j.result.qty
  const w = await run('withdrawGoods', { res: o.res, q: o.q, qty: got })
  if (!w) return false
  act(st => { E.setWhy('bought from a player'); E.addStock(st, o.res, o.q, got) })
  return true
}

export const timeLeft = (ms: number) => {
  if (ms <= 0) return 'expired'
  const h = Math.floor(ms / 3600000)
  return h >= 48 ? `${Math.floor(h / 24)} days left` : h >= 1 ? `${h} h left` : 'under an hour left'
}
export const itemsText = (lines: { res: string; q: number; qty: number }[]) =>
  lines.map(l => `${num(l.qty)} ${RES[l.res]?.name ?? l.res} Q${l.q}`).join(' · ')

/** Compose a contract from your trading depot. `to` is the receiving player. */
export function ContractComposer({ s, act, me, run, to: initialTo = '', onSent }: { s: E.GameState; act: Act; me: any; run: (op: string, body?: any) => Promise<any>; to?: string; onSent?: () => void }) {
  const depot = Object.entries(me?.depot ?? {}).map(([k, v]) => ({ k, v: v as number, ...E.parseKey(k) }))
  const [to, setTo] = useState(initialTo)
  useEffect(() => { if (initialTo) setTo(initialTo) }, [initialTo])
  const [lines, setLines] = useState<{ k: string; qty: number }[]>([])
  const [total, setTotal] = useState<number | ''>('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [sent, setSent] = useState('')
  const pick = (k: string) => depot.find(d => d.k === k)
  const rows = lines.map(l => ({ ...l, item: pick(l.k) })).filter(l => l.item)
  const market = rows.reduce((t, l) => t + l.qty * M.refPrice(s, l.item!.res), 0)
  const price = total === '' ? Math.round(market * 100) / 100 : total
  const addLine = () => { const first = depot.find(d => !lines.some(l => l.k === d.k)); if (first && lines.length < MAX_LINES) setLines([...lines, { k: first.k, qty: first.v }]) }
  const sendIt = async () => {
    setErr(''); setSent('')
    const ok = await run('offer', { to: to.trim().toLowerCase(), lines: rows.map(l => ({ res: l.item!.res, q: l.item!.q, qty: l.qty })), total: price, note })
    if (ok) { setLines([]); setTotal(''); setNote(''); setSent(`Contract sent to @${to.trim()}.`); onSent?.() }
    else setErr('Could not send. Check the items and the player name.')
  }
  const [shipRes, setShipRes] = useState('apples')
  const [shipQ, setShipQ] = useState(0)
  const home = Math.floor(s.stock[E.key(shipRes, shipQ)] ?? 0)
  const [shipQty, setShipQty] = useState(10)
  const ship = async () => {
    const n = clampQty(shipQty, home)
    if (await run('deposit', { goods: [{ res: shipRes, q: shipQ, qty: n }] })) act(st => { st.stock[E.key(shipRes, shipQ)] -= n; if (st.stock[E.key(shipRes, shipQ)] <= 0) delete st.stock[E.key(shipRes, shipQ)] })
  }
  return <div className="ctr">
    <b>New contract</b>
    <small className="muted">Items come from your trading depot. No service fee and no shipping crates. The offer lasts 7 days.</small>
    <label>To player <input value={to} placeholder="username" onChange={e => setTo(e.target.value)} /></label>
    {depot.length === 0 && <span className="muted">Your depot is empty. Ship goods to it below first.</span>}
    {lines.map((l, i) => {
      const item = pick(l.k)
      return <div key={i} className="ctr-line">
        <label>Item <select value={l.k} onChange={e => setLines(lines.map((x, j) => j === i ? { k: e.target.value, qty: 1 } : x))}>
          {depot.map(d => <option key={d.k} value={d.k} disabled={lines.some((x, j) => j !== i && x.k === d.k)}>{RES[d.res]?.name} Q{d.q} ({num(d.v)})</option>)}</select></label>
        {item && <QtyPicker label="Amount" value={clampQty(l.qty, item.v)} max={item.v} why={`${num(item.v)} in your depot`} onChange={v => setLines(lines.map((x, j) => j === i ? { ...x, qty: v } : x))} />}
        <button onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</button>
      </div>
    })}
    {lines.length < MAX_LINES && depot.length > 0 && <button onClick={addLine}>+ Add item</button>}
    <label>Total price $<input type="number" step="0.01" min={0} value={total} placeholder={money(Math.round(market * 100) / 100)} onChange={e => setTotal(e.target.value === '' ? '' : Number(e.target.value))} /></label>
    <small className="muted">Market value of these items about {money(market)}. The receiver pays the total in one go.</small>
    <label>Note <input maxLength={NOTE_MAX} value={note} placeholder="Optional, shown to the receiver" onChange={e => setNote(e.target.value)} /></label>
    <button className="primary" disabled={!to.trim() || rows.length === 0 || price < 0 || rows.length !== lines.length} onClick={sendIt}>Send contract · {money(price)} for {rows.length} item{rows.length === 1 ? '' : 's'}</button>
    {err && <span className="err">{err}</span>}
    {sent && <span className="ok-note">{sent}</span>}
    <details className="ship">
      <summary>Ship goods from your warehouse to your depot</summary>
      <div className="ctr-line">
        <label>Good <select value={shipRes} onChange={e => setShipRes(e.target.value)}>{RESOURCES.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label>Quality <select value={shipQ} onChange={e => setShipQ(Number(e.target.value))}>{[0, 1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}</option>)}</select></label>
        <QtyPicker value={clampQty(shipQty, home)} max={home} why={`${num(home)} at home`} onChange={setShipQty} />
        <button disabled={home < 1} onClick={ship}>Ship {num(clampQty(shipQty, home))} to depot</button>
      </div>
    </details>
  </div>
}

/** Incoming and outgoing contracts with their terms. */
export function ContractList({ me, run }: { me: any; run: (op: string, body?: any) => Promise<any> }) {
  const now = Date.now()
  const inbox: any[] = me?.inbox ?? [], outbox: any[] = me?.outbox ?? []
  if (!inbox.length && !outbox.length) return <span className="muted">No contracts right now.</span>
  return <div className="ctr-list">
    {inbox.map(c => <div key={c.id} className="ctr-card">
      <span>From <PlayerLink name={c.from} /> · {timeLeft(c.expires - now)}</span>
      <b>{itemsText(c.lines)}</b>
      <span>For <b>{money(c.total)}</b> · no fee</span>
      {c.note && <small className="muted">“{c.note}”</small>}
      <span className="row">
        <button className="primary" disabled={(me?.wallet ?? 0) < c.total} title={(me?.wallet ?? 0) < c.total ? `Needs ${money(c.total)} in your trading wallet` : ''} onClick={() => run('answer', { id: c.id, how: 'accept' })}>Accept · {money(c.total)}</button>
        <button onClick={() => run('answer', { id: c.id, how: 'decline' })}>Decline</button>
      </span>
    </div>)}
    {outbox.map(c => <div key={c.id} className="ctr-card out">
      <span>To <PlayerLink name={c.to} /> · {timeLeft(c.expires - now)}</span>
      <b>{itemsText(c.lines)}</b>
      <span>Asking {money(c.total)}</span>
      <button onClick={() => run('answer', { id: c.id, how: 'cancel' })}>Withdraw</button>
    </div>)}
  </div>
}
