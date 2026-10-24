// ============================================================================
// Admin dashboard (internal tools). Only shown in the menu when /api/auth/me
// says admin: true, but that is cosmetic: every request below is checked for
// is_admin on the server (worker/admin.ts) and returns 403 otherwise.
// Sections: Players, Economy, Health, Tools (+ the audit log).
// ============================================================================
import { useEffect, useState } from 'react'
import { RES } from '../game/data'
import { money, num } from './fmt'

const ago = (t: number | null) => {
  if (!t) return 'never'
  const m = Math.round((Date.now() - t) / 60000)
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`
}
const when = (t: number | string) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

async function api(path: string, body?: unknown) {
  const r = await fetch('/api/admin/' + path, body === undefined ? { credentials: 'same-origin' } : { method: 'POST', credentials: 'same-origin', body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`)
  return j
}

type Tab = 'players' | 'economy' | 'health' | 'tools'

export function Admin() {
  const [d, setD] = useState<any>(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<Tab>('players')
  const [q, setQ] = useState('')
  const [found, setFound] = useState<any[] | null>(null)
  // Tools form
  const [target, setTarget] = useState('')
  const [amount, setAmount] = useState('')
  const [hours, setHours] = useState('24')
  const [note, setNote] = useState('')

  const load = () => api('dashboard').then(setD).catch(e => setErr(e.message))
  useEffect(() => { load() }, [])

  /** Every tool asks for confirmation first; the server also requires confirm: true and writes the audit log. */
  const run = async (action: string, label: string, extra: Record<string, unknown>) => {
    if (!window.confirm(`${label}\n\nThis is logged in the audit log. Continue?`)) return
    try { const r = await api('tool', { action, confirm: true, ...extra }); setNote('Done: ' + r.detail); load() } catch (e) { setNote((e as Error).message) }
  }

  if (err) return <div className="admin"><p className="muted">{err === 'forbidden' ? 'You do not have access to this screen.' : err}</p></div>
  if (!d) return <div className="admin"><p className="muted">Loading…</p></div>
  const list = found ?? d.players

  return <div className="admin">
    <div className="adm-tabs">{(['players', 'economy', 'health', 'tools'] as Tab[]).map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}</div>

    {tab === 'players' && <section>
      <form className="adm-row" onSubmit={e => { e.preventDefault(); api('players', { q }).then(r => setFound(r.players)).catch(e => setNote(e.message)) }}>
        <input placeholder="Search username or company" value={q} onChange={e => setQ(e.target.value)} /><button>Search</button>
      </form>
      {!found && <p className="muted">Top players by cash</p>}
      <table className="adm-t"><thead><tr><th>Player</th><th>Cash</th><th>Value</th><th>Seen</th></tr></thead>
        <tbody>{list.map((p: any) => <tr key={p.name} onClick={() => { setTarget(p.name); setTab('tools') }}>
          <td><b>{p.name}</b><small>{p.company}</small></td><td>{money(p.cash)}</td><td>{p.value == null ? '—' : money(p.value)}</td><td>{ago(p.seen)}</td></tr>)}</tbody></table>
      {!list.length && <p className="muted">No players found.</p>}
    </section>}

    {tab === 'economy' && <section>
      <div className="adm-cards">
        <div><small>Total cash in game</small><b>{money(d.economy.totalCash)}</b></div>
        <div><small>Saves</small><b>{d.economy.saves}</b></div>
        <div><small>World day · phase</small><b>{d.economy.day} · {d.economy.phase}</b></div>
      </div>
      <table className="adm-t"><thead><tr><th>Good</th><th>Price</th><th>Sold today</th><th>Board</th></tr></thead>
        <tbody>{d.economy.goods.map((g: any) => <tr key={g.id}><td>{RES[g.id]?.name ?? g.id}</td><td>{money(g.price)}</td><td>{num(g.soldToday)}</td><td>{g.orders ? `${num(g.listed)} (${g.orders})` : '—'}</td></tr>)}</tbody></table>
    </section>}

    {tab === 'health' && <section>
      <div className="adm-cards">
        <div><small>Deploy</small><b>{String(d.health.build).slice(0, 16).replace('T', ' ')}</b></div>
        <div><small>Active 1h / 24h / 7d</small><b>{d.health.active.hour} / {d.health.active.day} / {d.health.active.week}</b></div>
      </div>
      <h4>Recent errors</h4>
      {d.health.errors.length ? <ul className="adm-log">{d.health.errors.map((e: any, i: number) => <li key={i}><small>{when(e.ts)} · {e.src}</small>{e.msg}</li>)}</ul> : <p className="muted">No errors logged.</p>}
    </section>}

    {tab === 'tools' && <section>
      <h4>Cash</h4>
      <div className="adm-row"><input placeholder="Username" value={target} onChange={e => setTarget(e.target.value.toLowerCase())} /><input placeholder="Amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></div>
      <div className="adm-row">
        <button onClick={() => run('cash', `Give ${money(+amount || 0)} to ${target}?`, { target, amount: Math.abs(+amount) })}>Give</button>
        <button onClick={() => run('cash', `Take ${money(+amount || 0)} from ${target}?`, { target, amount: -Math.abs(+amount) })}>Take</button>
        <button className="danger" onClick={() => run('reset', `Reset ${target}'s save to a fresh company? This cannot be undone.`, { target })}>Reset save</button>
      </div>
      <p className="muted">Applied the next time the player's game syncs (within a minute while online).</p>
      <h4>Live event</h4>
      <p>Ends {when(d.event.end)}{d.event.overridden ? ' (changed)' : ''}</p>
      <div className="adm-row">
        <input inputMode="numeric" value={hours} onChange={e => setHours(e.target.value)} style={{ maxWidth: 70 }} /><span>hours</span>
        <button onClick={() => run('event-extend', `Extend the event by ${hours} hours?`, { hours: +hours })}>Extend</button>
        <button className="danger" onClick={() => run('event-end', 'End the event now?', {})}>End now</button>
      </div>
      {note && <p className="adm-note">{note}</p>}
      <h4>Audit log</h4>
      {d.audit.length ? <ul className="adm-log">{d.audit.map((a: any, i: number) => <li key={i}><small>{when(a.ts)} · {a.admin}</small>{a.action} · {a.target}: {a.detail}</li>)}</ul> : <p className="muted">Nothing yet.</p>}
    </section>}
  </div>
}
