// ============================================================================
// Root UI. Holds the GameState in React state, ticks the simulation once a
// second, autosaves every few seconds, and renders:
//   top bar (cash, level, clock) | plot grid | side panel (selected plot)
//   warehouse + exchange | event log | change log
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import * as E from './game/engine'
import { BLD, BUILDINGS, REC, RES, RESOURCES } from './game/data'
import { loadGame, saveGame, exportCode, importCode, freshGame } from './game/save'
import * as SEA from './game/seasons'
import { companyValue } from './game/trade'
import { BuildingArt, Logo, ResIcon } from './ui/art'
import { Campus3D } from './ui/Campus3D'
import { Ticker } from './ui/Ticker'
import { setSound, sfx, soundOn } from './ui/sound'
import { clock, dur, money, num } from './ui/fmt'
import { CHANGELOG } from './changelog'
import { RetailPanel } from './ui/RetailPanel'
import { Exchange } from './ui/Exchange'
import { Research } from './ui/Research'
import { Board } from './ui/Board'
import { Finance } from './ui/Finance'
import { TradeFloor } from './ui/TradeFloor'
import { QtyPicker, clampQty } from './ui/QtyPicker'
import * as Q from './game/qty'
import { cashLineBonus, checkAchievements } from './game/execs'
import { PHASE_LABEL, accountingFee } from './game/economy'
import { cloudKey, cloudLoad, cloudSave, syncWorld, useCloudKey } from './game/cloud'
import './app.css'

export default function App() {
  const [s, setS] = useState<E.GameState>(() => E.advanceReal(loadGame()))
  const [sel, setSel] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const [view, setView] = useState<'3d' | '2d'>(() => (localStorage.getItem('ledgerworks-view') as '3d' | '2d') || '3d')
  const [sound, setSnd] = useState(soundOn())
  const [tab, setTab] = useState<'warehouse' | 'exchange' | 'trade' | 'research' | 'board' | 'finance' | 'market' | 'log' | 'changes'>('warehouse')

  /** Run a mutating engine action on a copy, show its error if any. */
  const act = (f: (st: E.GameState) => string | null | void) => {
    const next = structuredClone(s)
    const err = f(next)
    if (!err) for (const m of checkAchievements(next)) next.log.unshift(m)
    sfx(err ? 'buzz' : next.cash > s.cash ? 'coin' : 'pop')
    setMsg(err || '')
    if (!err) { setS(next); saveGame(next) }
  }

  // Tick: advance by real time once a second; autosave every 5 s.
  useEffect(() => {
    const t = setInterval(() => setS(p => E.advanceReal(structuredClone(p))), 1000)
    return () => clearInterval(t)
  }, [])
  // Autosave: keep the latest state in a ref so ONE interval (created once)
  // always saves the current company. (Before, the interval was recreated on
  // every 1 s tick and never got to fire.)
  const latest = useRef(s); latest.current = s
  useEffect(() => { const t = setInterval(() => saveGame(latest.current), 5000); return () => clearInterval(t) }, [])

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
        <span className="pill cash"><Ticker value={s.cash} /></span>
        <span className="pill" title="Company level">Lv {lvl}
          <span className="bar"><i style={{ width: `${(100 * (s.xp - xpLo)) / (xpHi - xpLo)}%` }} /></span>
        </span>
        <span className="pill">{clock(s.hour)}</span>
        <span className={`pill phase-${s.phase ?? 'normal'}`} title="Boom: shops sell faster, factories slower. Recession: the reverse.">Economy: {PHASE_LABEL[s.phase ?? 'normal']}</span>
        <span className="pill" title={`Admin overhead raises every wage bill. Accounting fee today: ${money(accountingFee(s.cash, 2_500_000 + cashLineBonus(s)))}`}>Overhead {(E.overhead(s) * 100).toFixed(1)}%</span>
        {s.realm === 'seasons' && (() => { const se = SEA.seasonAt(); return <span className={`pill season-${se.phase}`} title={SEA.PHASE_NOTE[se.phase]}>Season {s.season} · {se.phase} · {se.daysLeft}d left</span> })()}
        <span className="grow" />
        {/* Stage 12: pick a realm. Each realm has its own save, so switching never loses a company. */}
        <select className="realm" value={SEA.realm()} title="Classic: play forever. Seasons: a timed season with weather phases, then a fresh start." onChange={e => { saveGame(s); SEA.setRealm(e.target.value as SEA.Realm); location.reload() }}>
          <option value="classic">Classic realm</option><option value="seasons">Seasons realm</option></select>
        <button onClick={() => { navigator.clipboard?.writeText(exportCode(s)); setMsg('Save code copied to clipboard') }}>Copy save</button>
        <button onClick={() => { const c = prompt('Paste a save code'); if (c) try { const n = importCode(c.trim()); setS(n); saveGame(n) } catch (e: any) { setMsg(e.message) } }}>Load save</button>
        <span className="pill" title="Prices come from the shared server market when online">{s.online ? '● online' : '○ offline'}</span>
        <button onClick={async () => setMsg((await cloudSave(s)) || 'Saved to the cloud')}>Cloud save</button>
        <button onClick={async () => { const k = prompt('Cloud key (copy it from another device). Leave as-is to load this browser\'s cloud save.', cloudKey()); if (!k) return; try { useCloudKey(k); const n = await cloudLoad(); setS(n); saveGame(n); setMsg('Loaded from the cloud') } catch (e: any) { setMsg(e.message) } }}>Cloud load</button>
        <button onClick={() => { if (confirm('Start over? Your current company is lost.')) { const n = freshGame(prompt('Company name', 'My Company') || 'My Company'); setS(n); saveGame(n); setSel(null) } }}>New</button>
      </header>
      {s.realm === 'seasons' && (s.season ?? 0) < SEA.seasonAt().no && <div className="season-over">
        <b>Season {s.season} is over!</b> Your company finished at {money(companyValue(s))}.
        <button className="primary" onClick={() => {
          // Keep a record of past seasons, then start fresh in the new one.
          const past = JSON.parse(localStorage.getItem('ledgerworks-season-results') || '[]')
          past.unshift({ season: s.season, company: s.company, value: companyValue(s) })
          localStorage.setItem('ledgerworks-season-results', JSON.stringify(past.slice(0, 20)))
          const n = freshGame(s.company, 'seasons'); setS(n); saveGame(n); setSel(null)
        }}>Start Season {SEA.seasonAt().no}</button></div>}
      {msg && <div key={msg} className="toast" onClick={() => setMsg('')}>{msg}</div>}

      <main>
        <section className="campus-wrap">
          <Campus3D s={s} slots={slots} sel={sel} onPick={setSel} mode={view} />
          <div className="view-tools">
            <button title="Switch between the 3D and 2D campus" onClick={() => { const v = view === '3d' ? '2d' : '3d'; setView(v); localStorage.setItem('ledgerworks-view', v) }}>{view === '3d' ? '2D view' : '3D view'}</button>
            <button title="Sound effects" onClick={() => { setSound(!sound); setSnd(!sound); if (!sound) setTimeout(() => sfx('pop'), 50) }}>{sound ? '🔊' : '🔇'}</button>
          </div>
          {view === '3d' && <div className="hint">Drag to pan · scroll or pinch to zoom · Q / E or ⟲ ⟳ to turn · click a plot</div>}
          {sel !== null && s.plots[sel] && <div className="campus-label">{BLD[s.plots[sel]!.type].name} · level {s.plots[sel]!.level}</div>}
        </section>

        <aside className="panel">
          {sel === null ? <p className="muted">Pick a plot to build or manage it.</p>
            : s.plots[sel] ? <BuildingPanel s={s} plot={sel} act={act} /> : <BuildMenu s={s} plot={sel} act={act} />}
        </aside>
      </main>

      <nav className="tabs">
        {(['warehouse', 'exchange', 'trade', 'research', 'board', 'finance', 'market', 'log', 'changes'] as const).map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'warehouse' ? 'Warehouse' : t === 'exchange' ? 'Exchange' : t === 'trade' ? 'Trade floor' : t === 'research' ? 'Research' : t === 'board' ? 'Board & goals' : t === 'finance' ? 'Finance' : t === 'market' ? 'Public demand' : t === 'log' ? 'Events' : 'Change log'}</button>)}
      </nav>
      <section className="bottom">
        {tab === 'warehouse' && <Warehouse s={s} />}
        {tab === 'exchange' && <Exchange s={s} act={act} />}
        {tab === 'trade' && <TradeFloor s={s} act={act} />}
        {tab === 'research' && <Research s={s} act={act} />}
        {tab === 'board' && <Board s={s} act={act} />}
        {tab === 'finance' && <Finance s={s} act={act} />}
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
      <p className="muted">Wages {money(bt.wage * bd.level * (1 + E.overhead(s)))}/game hour while working (incl. {(E.overhead(s) * 100).toFixed(1)}% admin overhead).</p>
    </div>
  )
}

/** Choose a recipe and an exact amount (1..max); live preview of time, wages and inputs. */
function MakeForm({ s, plot, act }: { s: E.GameState; plot: number; act: Act }) {
  const bd = s.plots[plot]!, bt = BLD[bd.type]
  const [res, setRes] = useState(bt.recipes![0])
  const [want, setWant] = useState(100)
  const rc = REC[res]
  const ab = bd.abund?.[res] ?? 1
  const lim = Q.maxMake(s, plot, res)
  const qty = clampQty(want, lim.max)
  const hours = E.makeHours(res, qty, bd.level, bd.type, s, ab)
  const wages = E.makeWages(bd.type, bd.level, hours, s)
  const missing = useMemo(() => Object.entries(rc.inputs).filter(([k, v]) => E.haveQty(s, k) + 1e-9 < v * qty), [s, rc, qty])
  return (
    <div className="card">
      <label>Make <select value={res} onChange={e => setRes(e.target.value)}>{bt.recipes!.map(r => <option key={r} value={r}>{RES[r].name}</option>)}</select></label>
      <QtyPicker value={qty} max={lim.max} why={lim.why} onChange={setWant} />
      <div className="preview">
        <div><span>Output</span><b><ResIcon id={res} size={16} /> {num(qty)} {RES[res].name}</b></div>
        <div><span>Time</span><b>{dur(hours)}{hours <= E.MIN_JOB_H + 1e-9 ? ' (shortest job)' : ''}</b></div>
        <div><span>Wages</span><b>{money(wages)} · {money(wages / qty)} each</b></div>
      </div>
      {bd.abund && <div className="abund">Abundance: {Object.entries(bd.abund).map(([k, v]) => <span key={k}><ResIcon id={k} size={14} /> {(v * 100).toFixed(1)}% </span>)}</div>}
      <div className="inputs">{Object.entries(rc.inputs).map(([k, v]) => (
        <span key={k} className={E.haveQty(s, k) + 1e-9 < v * qty ? 'short' : ''}><ResIcon id={k} size={16} /> {num(v * qty)} {RES[k].name} (have {num(E.haveQty(s, k))})</span>
      ))}{Object.keys(rc.inputs).length === 0 && <span className="muted">No inputs needed</span>}</div>
      <button className="primary" disabled={missing.length > 0 || lim.max < 1} onClick={() => act(st => E.startMake(st, plot, res, qty))}>Start production</button>
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
