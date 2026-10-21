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

/** Full-screen public profile with a Trade button (opens the trade floor offer form). */
export function PlayerProfile({ name, onBack, onTrade }: { name: string; onBack: () => void; onTrade: (trader: string) => void }) {
  const [p, setP] = useState<any>(undefined), [err, setErr] = useState('')
  useEffect(() => { setP(undefined); fetch('/api/players/profile?name=' + encodeURIComponent(name)).then(r => r.json()).then(j => j.error ? setErr(j.error) : setP(j.profile)).catch(() => setErr('Offline')) }, [name])
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
      <h4>Active listings</h4>
      {!p.trader?.listings?.length ? <p className="muted">No goods for sale right now.</p>
        : <div className="wh-list">{p.trader.listings.map((o: any) => <div key={o.id} className="wh-li"><GoodArt id={o.res} size={32} /><span><b>{RES[o.res]?.name ?? o.res}</b> <small>Q{o.q}</small><br /><small>{num(o.qty)} at {money(o.price)} each</small></span></div>)}</div>}
      <button className="primary big" disabled={!p.trader} onClick={() => onTrade(p.trader.name)}>{p.trader ? `Trade with @${p.trader.name}` : 'Not on the trade floor yet'}</button>
    </>}
  </div>
}
