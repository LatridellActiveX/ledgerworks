// ============================================================================
// Root UI. Holds the GameState in React state, ticks the simulation once a
// second, autosaves every few seconds, and renders:
//   top bar (cash, level, clock) | plot grid | side panel (selected plot)
//   warehouse + exchange | event log | change log
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import * as E from './game/engine'
import { BLD, BUILDINGS, REC, RES, RESOURCES } from './game/data'
import { loadGame, saveGame, exportCode, importCode } from './game/save'
import { BuildingArt, EmptyPlot, Logo, ResIcon } from './ui/art'
import { clock, dur, money, num } from './ui/fmt'
import { CHANGELOG } from './changelog'
import { RetailPanel } from './ui/RetailPanel'
import { Exchange } from './ui/Exchange'
import { cloudKey, cloudLoad, cloudSave, syncWorld, useCloudKey } from './game/cloud'
import './app.css'

export default function App() {
  const [s, setS] = useState<E.GameState>(() => E.advanceReal(loadGame()))
  const [sel, setSel] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const [tab, setTab] = useState<'warehouse' | 'exchange' | 'market' | 'log' | 'changes'>('warehouse')

  /** Run a mutating engine action on a copy, show its error if any. */
  const act = (f: (st: E.GameState) => string | null | void) => {
    const next = structuredClone(s)
    const err = f(next)
    setMsg(err || '')
    if (!err) { setS(next); saveGame(next) }
  }

  // Tick: advance by real time once a second; autosave every 5 s.
  useEffect(() => {
    const t = setInterval(() => setS(p => E.advanceReal(structuredClone(p))), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => { const t = setInterval(() => saveGame(s), 5000); return () => clearInterval(t) })

  // Every minute: pull shared prices from the server; every 2 minutes: cloud save.
  useEffect(() => {
    const pull = () => setS(p => { const n = structuredClone(p); syncWorld(n).then(() => setS(q => ({ ...q, ref: n.ref, online: n.online, phase: n.phase ?? q.phase }))); return p })
    pull()
    const a = setInterval(pull, 60000)
    const b = setInterval(() => setS(p => { cloudSave(p); return p }), 120000)
    return () => { clearInterval(a); clearInterval(b) }
  }, [])

  const lvl = E.companyLevel(s.xp)
  const slots = E.plotCount(lvl)
  const xpLo = E.xpForLevel(lvl), xpHi = E.xpForLevel(lvl + 1)

  return (
    <div className="app">
      <header>
        <Logo /><b className="brand">Ledgerworks</b>
        <span className="pill">{s.company}</span>
        <span className="pill cash">{money(s.cash)}</span>
        <span className="pill" title="Company level">Lv {lvl}
          <span className="bar"><i style={{ width: `${(100 * (s.xp - xpLo)) / (xpHi - xpLo)}%` }} /></span>
        </span>
        <span className="pill">Best quality Q{E.qualityCap(lvl)}</span>
        <span className="pill">{clock(s.hour)}</span>
        <span className="grow" />
        <button onClick={() => { navigator.clipboard?.writeText(exportCode(s)); setMsg('Save code copied to clipboard') }}>Copy save</button>
        <button onClick={() => { const c = prompt('Paste a save code'); if (c) try { const n = importCode(c.trim()); setS(n); saveGame(n) } catch (e: any) { setMsg(e.message) } }}>Load save</button>
        <span className="pill" title="Prices come from the shared server market when online">{s.online ? '● online' : '○ offline'}</span>
        <button onClick={async () => setMsg((await cloudSave(s)) || 'Saved to the cloud')}>Cloud save</button>
        <button onClick={async () => { const k = prompt('Cloud key (copy it from another device). Leave as-is to load this browser\'s cloud save.', cloudKey()); if (!k) return; try { useCloudKey(k); const n = await cloudLoad(); setS(n); saveGame(n); setMsg('Loaded from the cloud') } catch (e: any) { setMsg(e.message) } }}>Cloud load</button>
        <button onClick={() => { if (confirm('Start over? Your current company is lost.')) { const n = E.newGame(prompt('Company name', 'My Company') || 'My Company'); setS(n); saveGame(n); setSel(null) } }}>New</button>
      </header>
      {msg && <div className="toast" onClick={() => setMsg('')}>{msg}</div>}

      <main>
        <section className="plots">
          {/* Show unlocked plots plus one row of locked ones as a teaser. */}
          {Array.from({ length: Math.min(24, slots + 6) }, (_, i) => {
            const bd = s.plots[i], locked = i >= slots
            const j = bd?.job
            const pct = j && 'startH' in j ? (100 * (s.hour - j.startH)) / (j.endH - j.startH) : 0
            return (
              <div key={i} className={`plot ${sel === i ? 'sel' : ''} ${locked ? 'locked' : ''}`} onClick={() => !locked && setSel(i)}>
                {bd ? <BuildingArt type={bd.type} level={bd.level} busy={!!j} /> : <EmptyPlot locked={locked} />}
                {bd && <div className="plabel">{BLD[bd.type].name} <small>L{bd.level}</small></div>}
                {j && <div className="prog"><i style={{ width: `${j.kind === 'build' ? 50 : pct}%` }} /></div>}
              </div>
            )
          })}
        </section>

        <aside className="panel">
          {sel === null ? <p className="muted">Pick a plot to build or manage it.</p>
            : s.plots[sel] ? <BuildingPanel s={s} plot={sel} act={act} /> : <BuildMenu s={s} plot={sel} act={act} />}
        </aside>
      </main>

      <nav className="tabs">
        {(['warehouse', 'exchange', 'market', 'log', 'changes'] as const).map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'warehouse' ? 'Warehouse' : t === 'exchange' ? 'Exchange' : t === 'market' ? 'Public demand' : t === 'log' ? 'Events' : 'Change log'}</button>)}
      </nav>
      <section className="bottom">
        {tab === 'warehouse' && <Warehouse s={s} />}
        {tab === 'exchange' && <Exchange s={s} act={act} />}
        {tab === 'market' && <Demand s={s} />}
        {tab === 'log' && <ul className="log">{s.log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
        {tab === 'changes' && <ul className="log">{CHANGELOG.map(c => <li key={c.id}><b>{c.date} · {c.title}</b> — {c.notes.join(' ')}</li>)}</ul>}
      </section>
    </div>
  )
}

type Act = (f: (st: E.GameState) => string | null | void) => void

/** List of buildings you can construct on an empty plot. */
function BuildMenu({ s, plot, act }: { s: E.GameState; plot: number; act: Act }) {
  const lvl = E.companyLevel(s.xp)
  return (
    <div>
      <h3>Build on plot {plot + 1}</h3>
      <div className="buildlist">
        {BUILDINGS.map(b => {
          const ok = lvl >= b.unlockLevel
          return (
            <button key={b.id} disabled={!ok || s.cash < b.cost} className="buildopt" onClick={() => act(st => E.construct(st, plot, b.id))}>
              <span className="mini"><BuildingArt type={b.id} /></span>
              <span><b>{b.name}</b><br /><small>{ok ? money(b.cost) : `Unlocks at Lv ${b.unlockLevel}`} · {b.kind === 'retail' ? 'shop' : (b.recipes ?? []).map(r => RES[r].name).join(', ')}</small></span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Manage one building: production form or shop form, upgrade, scrap, rush. */
function BuildingPanel({ s, plot, act }: { s: E.GameState; plot: number; act: Act }) {
  const bd = s.plots[plot]!, bt = BLD[bd.type]
  return (
    <div>
      <h3>{bt.name} · level {bd.level}</h3>
      <div className="hero"><BuildingArt type={bd.type} level={bd.level} busy={!!bd.job} /></div>
      {bd.job ? (
        <div className="card">
          <span>{bd.job.kind === 'build' ? 'Under construction' : bd.job.kind === 'make'
            ? <>Making {num(bd.job.qty)} <ResIcon id={bd.job.res} /> {RES[bd.job.res].name} Q{bd.job.q}</>
            : <>Selling {num(bd.job.qty)} <ResIcon id={bd.job.res} /> {RES[bd.job.res].name} at {money(bd.job.price)}</>}</span>
          <div>Done in {dur(bd.job.endH - s.hour)} (game time)</div>
          <button onClick={() => act(st => E.rush(st, plot))}>Rush for {money(E.rushCost(s, bd))}</button>
        </div>
      ) : bt.kind === 'production' ? <MakeForm s={s} plot={plot} act={act} /> : <RetailPanel s={s} plot={plot} act={act} />}
      <div className="row">
        <button disabled={!!bd.job} onClick={() => act(st => E.upgrade(st, plot))}>Upgrade to L{bd.level + 1} ({money(E.upgradeCost(bd.type, bd.level + 1))})</button>
        <button className="danger" onClick={() => confirm(`Scrap for ${money(E.scrapRefund(bd))} back?`) && act(st => E.scrap(st, plot))}>Scrap</button>
      </div>
      <p className="muted">Wages {money(bt.wage * bd.level)}/game hour while working.</p>
    </div>
  )
}

/** Choose a recipe and amount; shows time, wages and needed inputs. */
function MakeForm({ s, plot, act }: { s: E.GameState; plot: number; act: Act }) {
  const bd = s.plots[plot]!, bt = BLD[bd.type]
  const [res, setRes] = useState(bt.recipes![0])
  const [hours, setHours] = useState(2)
  const rc = REC[res]
  const qty = Math.floor(rc.perHour * bd.level * hours)
  const wages = E.makeWages(bd.type, bd.level, hours)
  const missing = useMemo(() => Object.entries(rc.inputs).filter(([k, v]) => E.haveQty(s, k) < v * qty), [s, rc, qty])
  return (
    <div className="card">
      <label>Make <select value={res} onChange={e => setRes(e.target.value)}>{bt.recipes!.map(r => <option key={r} value={r}>{RES[r].name}</option>)}</select></label>
      <label>For <select value={hours} onChange={e => setHours(Number(e.target.value))}>{[0.5, 1, 2, 4, 8, 12, 24].map(h => <option key={h} value={h}>{dur(h)}</option>)}</select></label>
      <div><ResIcon id={res} /> {num(qty)} units · wages {money(wages)}</div>
      <div className="inputs">{Object.entries(rc.inputs).map(([k, v]) => (
        <span key={k} className={E.haveQty(s, k) < v * qty ? 'short' : ''}><ResIcon id={k} size={16} /> {num(v * qty)} {RES[k].name} (have {num(E.haveQty(s, k))})</span>
      ))}{Object.keys(rc.inputs).length === 0 && <span className="muted">No inputs needed</span>}</div>
      <button className="primary" disabled={missing.length > 0 || qty < 1} onClick={() => act(st => E.startMake(st, plot, res, qty))}>Start production</button>
    </div>
  )
}

/** Warehouse contents. Buying and selling with traders is on the Exchange tab. */
function Warehouse({ s }: { s: E.GameState }) {
  const lots = Object.entries(s.stock).map(([k, v]) => ({ ...E.parseKey(k), v })).sort((a, b) => a.res.localeCompare(b.res) || a.q - b.q)
  return (
    <div className="stock">
      {lots.length === 0 && <span className="muted">Your warehouse is empty. Buy starter goods on the Exchange tab.</span>}
      {lots.map(l => <span key={l.res + l.q} className="lot"><ResIcon id={l.res} /> {RES[l.res].name} <small>Q{l.q}</small> <b>{num(l.v)}</b></span>)}
    </div>
  )
}

/** Public demand table: every retail good, its fair price and saturation. */
function Demand({ s }: { s: E.GameState }) {
  return (
    <table className="demand"><thead><tr><th>Good</th><th>Shop</th><th>Fair price Q0</th><th>Daily demand</th><th>Saturation</th></tr></thead>
      <tbody>{RESOURCES.filter(r => r.store).map(r => {
        const sat = s.saturation[r.id] ?? 1
        return <tr key={r.id}><td><ResIcon id={r.id} size={16} /> {r.name}</td><td>{BUILDINGS.find(b => b.store === r.store)!.name}</td>
          <td>{money(E.fairPrice(r.id, 0))}</td><td>{num(r.dailyDemand!)}</td>
          <td style={{ color: sat > 1.15 ? '#b0413e' : sat < 0.9 ? '#3c7a4a' : undefined }}>{num(sat)}×</td></tr>
      })}</tbody></table>
  )
}
