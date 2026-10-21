// ============================================================================
// Player search (menu screen + Company Value leaderboard) and public player
// profiles. Talks to GET /api/players/search and /api/players/profile
// (worker/players.ts), which only return public fields: username, company
// name, level, company value, trade-floor grade/rank and active listings.
// Typing is debounced (300 ms) so we don't send a request per keystroke.
// ============================================================================
import { useEffect, useState } from 'react'
import { RES } from '../game/data'
import { GoodArt } from './goodart'
import { money, num } from './fmt'
import * as E from '../game/engine'
import { ContractComposer, ContractList, buyAndTakeHome, useTrader } from './Trading'

export interface Hit { name: string; company: string; level: number | null; trader: string | null; value?: number; grade?: string }

/** Debounced search box; tapping a result calls onOpen(username). */
export function PlayerSearch({ onOpen, compact }: { onOpen: (name: string) => void; compact?: boolean }) {
  const [q, setQ] = useState(''), [hits, setHits] = useState<Hit[] | null>(null), [err, setErr] = useState('')
  useEffect(() => {
    const t = q.trim(); if (t.length < 2) { setHits(null); setErr(''); return }
    const ctl = new AbortController()
    const id = setTimeout(() => {
      fetch('/api/players/search?q=' + encodeURIComponent(t), { signal: ctl.signal }).then(r => r.json()).then(j => { if (j.error) setErr(j.error); else { setErr(''); setHits(j.players) } }).catch(e => { if (e.name !== 'AbortError') setErr('Offline') })
    }, 300)
    return () => { clearTimeout(id); ctl.abort() }
  }, [q])
  return <div className={`psearch ${compact ? 'compact' : ''}`}>
    <input type="search" placeholder="Find a player: username or company" value={q} onChange={e => setQ(e.target.value)} aria-label="Search players" />
    {err && <small className="err">{err}</small>}
    {hits && !hits.length && <small className="muted">No players match “{q.trim()}”.</small>}
    {hits && hits.length > 0 && <div className="phits">{hits.map(h => <button key={h.name} onClick={() => onOpen(h.name)}>
      <span className="pav">{h.name[0]?.toUpperCase()}</span>
      <span><b>{h.company || '—'}</b><br /><small>@{h.name}{h.level ? ` · level ${h.level}` : ''}{h.grade ? ` · ${h.grade}` : ''}</small></span>
      {h.value ? <b className="pv">{money(h.value)}</b> : null}
    </button>)}</div>}
  </div>
}

type Act = (f: (st: E.GameState) => string | null | void) => void

/**
 * Full-screen public profile. Signed-in players can buy this trader's listed
 * goods and bonds, and send them a contract (the composer lives right here).
 */
export function PlayerProfile({ name, s, act, user, onBack }: { name: string; s: E.GameState; act: Act; user?: string | null; onBack: () => void }) {
  const [p, setP] = useState<any>(undefined), [err, setErr] = useState('')
  const t = useTrader(user)
  const [tab, setTab] = useState<'info' | 'contract'>('info')
  const [flash, setFlash] = useState('')
  const load = () => fetch('/api/players/profile?name=' + encodeURIComponent(name)).then(r => r.json()).then(j => j.error ? setErr(j.error) : setP(j.profile)).catch(() => setErr('Offline'))
  useEffect(() => { setP(undefined); setErr(''); setTab('info'); load() }, [name])
  const self = t.me?.name && p?.trader?.name === t.me.name
  return <div className="pprof">
    <div className="pp-head"><button className="hud-btn" onClick={onBack} aria-label="Back">‹</button>
      <span className="pav big">{name[0]?.toUpperCase()}</span>
      <div><h3>{p?.company || name}</h3><small>@{name}{p?.since ? ` · since ${new Date(p.since).toLocaleDateString()}` : ''}</small></div></div>
    {err && <p className="err">{err}</p>}
    {p === undefined && !err && <p className="muted">Loading…</p>}
    {p && <>
      <div className="preview">
        <div><span>Company value</span><b>{p.value != null ? money(p.value) : '—'}</b></div>
        <div><span>Level</span><b>{p.level ?? '—'}</b></div>
        <div><span>Trade floor rank</span><b>{p.trader ? `#${p.trader.rank} of ${p.trader.of} · ${p.trader.grade}` : 'Not trading yet'}</b></div>
        {p.trader && <div><span>Trades made</span><b>{num(p.trader.trades)}</b></div>}
      </div>
      {!p.trader ? <p className="muted">This player is not on the trade floor yet, so they can't receive contracts.</p> : <>
        <div className="seg"><button className={tab === 'info' ? 'on' : ''} onClick={() => setTab('info')}>Listings</button><button className={tab === 'contract' ? 'on' : ''} onClick={() => setTab('contract')}>Send contract</button></div>
        {tab === 'info' && <>
          <h4>Goods for sale</h4>
          {!p.trader.listings?.length ? <p className="muted">No goods for sale right now.</p>
            : <div className="wh-list">{p.trader.listings.map((o: any) => <div key={o.id} className="wh-li"><GoodArt id={o.res} size={32} /><span><b>{RES[o.res]?.name ?? o.res}</b> <small>Q{o.q}</small><br /><small>{num(o.qty)} at {money(o.price)} each</small></span>
              {user && !self && <button disabled={!t.me} onClick={async () => { const n = Math.min(o.qty, Math.floor((t.me?.wallet ?? 0) / o.price)); if (n < 1) return setFlash('Move cash into your trading wallet first.'); if (await buyAndTakeHome(t.run, act, o, n)) { setFlash(`Bought ${num(n)} ${RES[o.res]?.name}. It is in your company.`); load() } }}>Buy</button>}</div>)}</div>}
          <h4>Bonds for sale</h4>
          {!p.trader.bondListings?.length ? <p className="muted">No bonds for sale.</p>
            : <div className="wh-list">{p.trader.bondListings.map((o: any) => <div key={o.id} className="wh-li"><span><b>{o.issuer}</b> <small>{o.rating} · {money(o.amount)} at {(o.rate * 100).toFixed(2)}%/day</small><br /><small>asking {money(o.price)}</small></span>
              {user && !self && <button disabled={!t.me || (t.me?.wallet ?? 0) < o.price} onClick={async () => { if (await t.run('buyBond', { id: o.id })) { setFlash(`Bought ${o.issuer}. It is in your bond box (Finance tab).`); load() } }}>Buy</button>}</div>)}</div>}
        </>}
        {tab === 'contract' && (!user ? <p className="muted">Sign in to send contracts. Your trading account is created the first time you sign in.</p>
          : !t.me ? <p className="muted">{t.msg || 'Opening your trading account…'}</p>
          : <>
            <ContractComposer s={s} act={act} me={t.me} run={t.run} to={p.trader.name} onSent={() => setFlash(`Contract sent to @${p.trader.name}.`)} />
            <h4>Contracts with you</h4>
            <ContractList me={t.me} run={t.run} />
          </>)}
        {flash && <span className="ok-note">{flash}</span>}
        {t.msg && <span className="err">{t.msg}</span>}
      </>}
    </>}
  </div>
}
