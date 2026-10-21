// Trade floor tab (stage 11): your player account, server-held trading
// wallet and depot, the shared player order board, private contracts, and the
// leaderboard. Moving money and goods in or out of the depot is what links
// the server to your local company.
import { useEffect, useState } from 'react'
import * as E from '../game/engine'
import * as T from '../game/trade'
import { RES, RESOURCES } from '../game/data'
import { ResIcon } from './art'
import { money, num } from './fmt'
import { QtyPicker, clampQty } from './QtyPicker'

type Act = (f: (st: E.GameState) => string | null | void) => void

export function TradeFloor({ s, act }: { s: E.GameState; act: Act }) {
  const [acc, setAcc] = useState(T.account())
  const [me, setMe] = useState<any>(null)
  const [boardData, setBoard] = useState<any>({ orders: [], leaders: [] })
  const [msg, setMsg] = useState('')
  const [res, setRes] = useState('apples')
  const [f, setF] = useState({ name: '', paste: '', cash: 1000, q: 0, qty: 10, price: 1, to: '' })
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p })
  const run = async (op: string, body: any = {}) => {
    try { const j = await T.p2p(op, body); if (j.me) setMe(j.me); setMsg(''); refresh(); return j } catch (e: any) { setMsg(e.message); return null }
  }
  const refresh = () => T.p2p('board', { res }).then(setBoard).catch(() => setMsg('Offline'))
  useEffect(() => { refresh() }, [res])
  useEffect(() => { if (acc) run('value', { value: T.companyValue(s), company: s.company }) }, [acc])

  if (!acc) return (
    <div className="ex trade">
      <div className="card">
        <b>Make a trading account</b>
        <small>Trade with other players. Pick a username; the server gives you a secret key. Keep it, since it is the only way to sign in on another device.</small>
        <label>Username <input value={f.name} placeholder="3-20 letters, digits or _" onChange={e => set({ name: e.target.value })} /></label>
        <button className="primary" onClick={async () => { const j = await run('register', { name: f.name, company: s.company }); if (j) { const a = { name: j.name, key: j.key }; T.setAccount(a); setAcc(a) } }}>Create account</button>
        <b>Or sign in</b>
        <label>Account key <input value={f.paste} placeholder="name:key" onChange={e => set({ paste: e.target.value })} /></label>
        <button onClick={async () => { const a = T.parseAccountKey(f.paste); if (!a) return setMsg('Paste the name:key you saved'); T.setAccount(a); const j = await run('me'); if (j) setAcc(a); else T.setAccount(null) }}>Sign in</button>
        {msg && <span className="err">{msg}</span>}
      </div>
      <Leaders rows={boardData.leaders} />
    </div>
  )

  const lots = Object.entries(s.stock).map(([k, v]) => ({ k, v, ...E.parseKey(k) })).filter(l => l.res === res)
  const depot = Object.entries(me?.depot ?? {}).map(([k, v]) => ({ k, v: v as number, ...E.parseKey(k) }))
  return (
    <div className="ex trade">
      <div className="card">
        <b>{me?.company ?? s.company} · @{acc.name} {me && <span className="grade">{me.grade}</span>}</b>
        <span>Trading wallet <b>{money(me?.wallet ?? 0)}</b></span>
        <label>Cash $<input type="number" value={f.cash} onChange={e => set({ cash: Number(e.target.value) })} /></label>
        <div className="row">
          <button disabled={f.cash > s.cash} onClick={async () => { if (await run('deposit', { cash: f.cash })) act(st => { st.cash -= f.cash }) }}>Move in</button>
          <button onClick={async () => { if (await run('withdrawCash', { cash: f.cash })) act(st => { st.cash += f.cash }) }}>Move out</button>
        </div>
        <b>Depot</b>
        {depot.length === 0 && <span className="muted">Empty.</span>}
        {depot.map(d => <span key={d.k}><ResIcon id={d.res} size={16} /> {num(d.v)} {RES[d.res]?.name} Q{d.q}{' '}
          {(() => { const n = clampQty(f.qty, d.v); return <>
            <button onClick={async () => { if (await run('withdrawGoods', { res: d.res, q: d.q, qty: n })) act(st => { E.addStock(st, d.res, d.q, n) }) }}>Take {num(n)} home</button>
            <button onClick={async () => { if (await run('withdrawGoods', { res: d.res, q: d.q, qty: d.v })) act(st => { E.addStock(st, d.res, d.q, d.v) }) }}>All</button></> })()}</span>)}
        <small>Key for other devices: <code>{T.accountKey(acc)}</code></small>
        <button onClick={() => { T.setAccount(null); setAcc(null); setMe(null) }}>Sign out</button>
        <button className="danger" onClick={async () => {
          // Owner-only delete: the key proves it is yours. Wallet and depot are lost.
          if (!confirm('Delete this account for good? Your open orders are removed, and anything still in your wallet or depot is lost.')) return
          if (await run('delete')) { T.setAccount(null); setAcc(null); setMe(null) }
        }}>Delete account</button>
        {msg && <span className="err">{msg}</span>}
      </div>
      <div className="card">
        <b>Player board</b>
        <label>Good <select value={res} onChange={e => setRes(e.target.value)}>{RESOURCES.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <table className="demand"><thead><tr><th>Seller</th><th>Q</th><th>Qty</th><th>Price</th><th /></tr></thead>
          <tbody>{boardData.orders.map((o: any) => <tr key={o.id} className={o.seller === acc.name ? 'mine' : ''}><td>@{o.seller}</td><td>Q{o.q}</td><td>{num(o.qty)}</td><td>{money(o.price)}</td>
            <td>{o.seller === acc.name ? <button onClick={() => run('cancel', { id: o.id })}>Cancel</button> : <button disabled={Math.min(f.qty, o.qty, Math.floor((me?.wallet ?? 0) / o.price)) < 1} onClick={() => run('buy', { id: o.id, qty: Math.min(f.qty, o.qty, Math.floor((me?.wallet ?? 0) / o.price)) })}>Buy {num(Math.max(1, Math.min(f.qty, o.qty, Math.floor((me?.wallet ?? 0) / o.price))))}</button>}</td></tr>)}
            {boardData.orders.length === 0 && <tr><td colSpan={5} className="muted">No player listings for this good yet.</td></tr>}</tbody></table>
        <small>Bought goods go to your depot. Sellers pay a 3% fee.</small>
      </div>
      <div className="card">
        <b>Ship &amp; sell</b>
        <label>Quality <select value={f.q} onChange={e => set({ q: Number(e.target.value) })}>{[...new Set([...lots.map(l => l.q), ...depot.filter(d => d.res === res).map(d => d.q), 0])].map(q => <option key={q} value={q}>Q{q}</option>)}</select></label>
        {(() => {
          // One amount for shipping, listing and offering: up to what you have at home or in the depot.
          const home = Math.floor(s.stock[E.key(res, f.q)] ?? 0), dep = Math.floor(me?.depot?.[E.key(res, f.q)] ?? 0)
          return <QtyPicker value={clampQty(f.qty, Math.max(home, dep))} max={Math.max(home, dep)} why={`Home ${num(home)} · depot ${num(dep)}`} onChange={v => set({ qty: v })} />
        })()}
        <label>Price $<input type="number" step="0.01" value={f.price} onChange={e => set({ price: Number(e.target.value) })} /></label>
        <button disabled={!(f.qty >= 1) || (s.stock[E.key(res, f.q)] ?? 0) < f.qty} onClick={async () => {
          // Debit locally only after the server has the goods.
          if (await run('deposit', { goods: [{ res, q: f.q, qty: f.qty }] })) act(st => { st.stock[E.key(res, f.q)] -= f.qty; if (st.stock[E.key(res, f.q)] <= 0) delete st.stock[E.key(res, f.q)] })
        }}>Ship {num(f.qty)} {RES[res].name} to depot (have {num(s.stock[E.key(res, f.q)] ?? 0)})</button>
        <button className="primary" onClick={() => run('list', { res, q: f.q, qty: f.qty, price: f.price })}>List from depot</button>
        <b>Contract</b>
        <label>To player <input value={f.to} placeholder="username" onChange={e => set({ to: e.target.value })} /></label>
        <button onClick={() => run('offer', { to: f.to, res, q: f.q, qty: f.qty, price: f.price })}>Offer {num(f.qty)} at {money(f.price)} each</button>
        {(me?.inbox ?? []).map((c: any) => <span key={c.id}>@{c.from} offers {num(c.qty)} {RES[c.res]?.name} Q{c.q} at {money(c.price)}{' '}
          <button className="primary" onClick={() => run('answer', { id: c.id, how: 'accept' })}>Accept</button><button onClick={() => run('answer', { id: c.id, how: 'decline' })}>Decline</button></span>)}
        {(me?.outbox ?? []).map((c: any) => <span key={c.id} className="muted">To @{c.to}: {num(c.qty)} {RES[c.res]?.name} at {money(c.price)} <button onClick={() => run('answer', { id: c.id, how: 'cancel' })}>Withdraw</button></span>)}
      </div>
      <Leaders rows={boardData.leaders} me={acc.name} />
    </div>
  )
}

function Leaders({ rows, me }: { rows: any[]; me?: string }) {
  return <div className="card"><b>Leaderboard</b>
    <table className="demand"><thead><tr><th>#</th><th>Company</th><th>Rating</th><th>Value</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={r.name} className={r.name === me ? 'mine' : ''}><td>{i + 1}</td><td>{r.company} <small>@{r.name}</small></td><td><span className="grade">{r.grade}</span></td><td>{money(r.value)}</td></tr>)}
        {rows.length === 0 && <tr><td colSpan={4} className="muted">No players yet.</td></tr>}</tbody></table></div>
}
