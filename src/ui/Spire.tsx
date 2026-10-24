// ============================================================================
// Trade Spire panel (admin only): GLOBAL economy controls for ALL players.
//
// Shown only when the server said admin (App gates the screen), but that is
// cosmetic: every call goes to /api/admin/econ, which checks is_admin on the
// server (403 otherwise), requires confirm: true, clamps every number and
// writes the admin audit log. Clients pick changes up with /api/world within
// a few minutes (60 s server cache + the normal world sync).
//
// Sections: active overrides (top) · prices · speeds · event · news · reset.
// ============================================================================
import { useEffect, useState } from 'react'
import { RES, RESOURCES } from '../game/data'
import * as OV from '../game/overrides'
import * as E from '../game/engine'
import { SpireIcon } from './campus2d'

async function api(body?: unknown) {
  const r = await fetch('/api/admin/econ', body === undefined ? { credentials: 'same-origin' } : { method: 'POST', credentials: 'same-origin', body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`)
  return j
}
const when = (t: string) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

type Act = (f: (st: E.GameState) => string | null | void) => void

export function Spire({ act, onAdmin, onRemoved }: { s: E.GameState; act: Act; onAdmin: () => void; onRemoved: () => void }) {
  const [d, setD] = useState<any>(null)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  // Form state
  const [res, setRes] = useState(RESOURCES[0].id)
  const [pm, setPm] = useState('1')
  const [prod, setProd] = useState('1'), [sell, setSell] = useState('1')
  const [evName, setEvName] = useState('Boost event'), [evMult, setEvMult] = useState('2'), [evHours, setEvHours] = useState('24')
  const [nw, setNw] = useState({ icon: '📰', headline: '', blurb: '', goods: '', mult: '1.3', hours: '24' })

  const show = (j: any) => {
    setD(j)
    setProd(String(j.econ.prod)); setSell(String(j.econ.sell))
    OV.setEcon(j.econ) // this device sees it at once; everyone else on their next sync
  }
  useEffect(() => { api().then(show).catch(e => setErr(e.message)) }, [])

  /** Every change: confirm first, then the server validates, applies and logs it. */
  const run = async (label: string, body: Record<string, unknown>) => {
    if (!window.confirm(`${label}\n\nThis changes the game for ALL players and is written to the audit log. Continue?`)) return
    try { const r = await api({ ...body, confirm: true }); show(r); setNote('Done: ' + r.detail) } catch (e) { setNote((e as Error).message) }
  }

  if (err) return <div className="admin"><p className="muted">{err === 'forbidden' ? 'You do not have access to this screen.' : err}</p></div>
  if (!d) return <div className="admin"><p className="muted">Loading…</p></div>
  const ev = d.event, live = Date.parse(ev.start) <= Date.now() && Date.now() < Date.parse(ev.end)

  return <div className="admin spire-panel">
    <div className="spire-head"><SpireIcon size={64} /><div><b>Global economy controls</b><br /><small className="muted">Affects every player. Changes reach games within a few minutes.</small></div></div>

    {/* Active overrides, always at the top. */}
    <section className="spire-active">
      <h4>Active overrides</h4>
      {d.active.length ? <ul>{d.active.map((a: string) => <li key={a}>{a.replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, m => when(m))}</li>)}</ul> : <p className="muted">None. Everything is normal (1x).</p>}
      <p className="muted">Live event: {ev.name} {ev.mult}x · {live ? `until ${when(ev.end)}` : Date.parse(ev.end) <= Date.now() ? `ended ${when(ev.end)}` : `starts ${when(ev.start)}`}</p>
    </section>
    {note && <p className="adm-note">{note}</p>}

    <section>
      <h4>(a) Price multiplier per good</h4>
      <p className="muted">Exchange and trade-route prices. 0.25x to 4x; 1x removes the override.</p>
      <div className="adm-row">
        <select value={res} onChange={e => { setRes(e.target.value); setPm(String(d.econ.price[e.target.value] ?? 1)) }}>{RESOURCES.map(r => <option key={r.id} value={r.id}>{r.name}{d.econ.price[r.id] ? ` (${d.econ.price[r.id]}x)` : ''}</option>)}</select>
        <input type="number" min={OV.LIM.price[0]} max={OV.LIM.price[1]} step="0.05" value={pm} onChange={e => setPm(e.target.value)} aria-label="Price multiplier" />
        <button onClick={() => run(`Set ${RES[res].name} price to ${pm}x?`, { op: 'price', res, mult: Number(pm) })}>Set</button>
      </div>
    </section>

    <section>
      <h4>(b) Speeds (stack with events)</h4>
      <p className="muted">0.5x to 5x.</p>
      <div className="adm-row">
        <label>Production <input type="number" min={OV.LIM.speed[0]} max={OV.LIM.speed[1]} step="0.1" value={prod} onChange={e => setProd(e.target.value)} /></label>
        <label>Store selling <input type="number" min={OV.LIM.speed[0]} max={OV.LIM.speed[1]} step="0.1" value={sell} onChange={e => setSell(e.target.value)} /></label>
        <button onClick={() => run(`Set production ${prod}x and store selling ${sell}x?`, { op: 'speed', prod: Number(prod), sell: Number(sell) })}>Set</button>
      </div>
    </section>

    <section>
      <h4>(c) Event</h4>
      <div className="adm-row">
        <input value={evName} onChange={e => setEvName(e.target.value)} aria-label="Event name" maxLength={30} />
        <label>× <input type="number" min={OV.LIM.eventMult[0]} max={OV.LIM.eventMult[1]} step="0.5" value={evMult} onChange={e => setEvMult(e.target.value)} /></label>
        <label>hours <input type="number" min={1} max={720} value={evHours} onChange={e => setEvHours(e.target.value)} /></label>
      </div>
      <div className="adm-row">
        <button onClick={() => run(`Start "${evName}" at ${evMult}x for ${evHours} hours (replaces the current event)?`, { op: 'event', action: 'start', name: evName, mult: Number(evMult), hours: Number(evHours) })}>Start</button>
        <button onClick={() => run(`Extend "${ev.name}" by ${evHours} hours?`, { op: 'event', action: 'extend', hours: Number(evHours) })}>Extend {evHours}h</button>
        <button onClick={() => run(`End "${ev.name}" now?`, { op: 'event', action: 'end' })}>End now</button>
      </div>
    </section>

    <section>
      <h4>(d) Today's news story</h4>
      <p className="muted">Shown first in the Ledger Gazette and Business Live. Goods are ids, comma-separated (e.g. bread, milk). Demand 0.5x to 2x.</p>
      <div className="adm-row"><input style={{ width: 52 }} value={nw.icon} onChange={e => setNw({ ...nw, icon: e.target.value })} aria-label="Icon" /><input placeholder="Headline" value={nw.headline} maxLength={80} onChange={e => setNw({ ...nw, headline: e.target.value })} /></div>
      <div className="adm-row"><input placeholder="Blurb" value={nw.blurb} maxLength={200} onChange={e => setNw({ ...nw, blurb: e.target.value })} /></div>
      <div className="adm-row"><input placeholder="Goods" value={nw.goods} onChange={e => setNw({ ...nw, goods: e.target.value })} />
        <label>× <input type="number" min={0.5} max={2} step="0.05" value={nw.mult} onChange={e => setNw({ ...nw, mult: e.target.value })} /></label>
        <label>hours <input type="number" min={1} max={72} value={nw.hours} onChange={e => setNw({ ...nw, hours: e.target.value })} /></label></div>
      <div className="adm-row">
        <button onClick={() => run(`Publish "${nw.headline}" to every player?`, { op: 'news', ...nw, mult: Number(nw.mult), hours: Number(nw.hours) })}>Publish</button>
        {d.econ.news && <button onClick={() => run('Remove the custom news story?', { op: 'news', clear: true })}>Remove story</button>}
      </div>
    </section>

    <section>
      <h4>(e) Reset</h4>
      <button className="danger" onClick={() => run('Reset ALL overrides to normal (1x prices and speeds, configured event, normal news)?', { op: 'reset' })}>Reset all to normal</button>
    </section>

    <section className="adm-row">
      <button onClick={onAdmin}>🛠 Open Admin dashboard</button>
      <button onClick={() => { if (window.confirm('Remove the Trade Spire from your map? (The overrides stay as they are.)')) { act(st => E.removeSpire(st)); onRemoved() } }}>Remove Spire from map</button>
    </section>
  </div>
}
