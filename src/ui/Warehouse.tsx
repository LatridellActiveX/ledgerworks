// ============================================================================
// Warehouse v2
//
// Layout ideas (not art) follow the reference Sim-style warehouse: category
// headers with horizontally scrolling tiles. On top of that we add:
//  - a header card with total warehouse value and a capacity bar,
//  - search, a category filter and sort (value / quantity / name / recent),
//  - collapsible categories with per-category totals and "Show all" (wraps
//    the row into a grid instead of a single scrolling line),
//  - tiles with quality stars, price, amount, 24h change and badges for goods
//    waiting in buildings ("incoming") and goods still being made,
//  - a sub-tab row: Inventory / Incoming / Contracts / History,
//  - a full-screen good detail (stock by quality, average cost, price chart,
//    which buildings make or use it, and quick Sell on market / Sell in store /
//    Use in contract with the shared quantity picker).
// All icons are Ledgerworks' own SVG art (see goodart.tsx).
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import * as E from '../game/engine'
import * as M from '../game/market'
import * as F from '../game/finance'
import * as Q from '../game/qty'
import { RES, RESOURCES, BUILDINGS, RECIPES, BLD } from '../game/data'
import { fieldOf } from '../game/research'
import { GoodArt } from './goodart'
import { QtyPicker, clampQty } from './QtyPicker'
import { money, num, dur } from './fmt'

type Act = (f: (st: E.GameState) => string | null | void) => void

// ---- categories ------------------------------------------------------------
export const CATS = [
  ['utility', 'Utilities'], ['farm', 'Agriculture'], ['food', 'Food'], ['textile', 'Textiles'],
  ['energy', 'Energy'], ['build', 'Construction'], ['tech', 'Electronics'], ['research', 'Research'],
] as const
export type Cat = typeof CATS[number][0]
/** Category of a good: research notes, its research field, or utilities. */
const UTIL = ['power', 'water', 'crates']
export const catOf = (res: string): Cat => (UTIL.includes(res) ? 'utility' : res.startsWith('rn_') ? 'research' : (fieldOf(res) as Cat) ?? 'utility')

// ---- numbers ---------------------------------------------------------------
/** Compact amounts like the reference: 396, 16.3k, 1.7M. */
export const compact = (n: number) => {
  const a = Math.abs(n)
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M'
  if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 1 : 2).replace(/\.?0+$/, '') + 'k'
  return String(Math.floor(n))
}
/** Display-only storage capacity: 5,000 units plus 2,500 per building level. Not enforced. */
export const capacityOf = (s: E.GameState) => 5000 + 2500 * s.plots.reduce((t, b) => t + (b ? b.level : 0), 0)
const unitPrice = (s: E.GameState, res: string) => M.refPrice(s, res)

/** Everything the screen needs about one good, computed once per render. */
export interface GoodRow { res: string; qty: number; topQ: number; lots: { q: number; n: number }[]; value: number; price: number; change24: number; lastH: number; incoming: number; making: number }
export function goodRows(s: E.GameState): GoodRow[] {
  const by: Record<string, GoodRow> = {}
  const row = (res: string) => (by[res] ??= { res, qty: 0, topQ: 0, lots: [], value: 0, price: unitPrice(s, res), change24: 0, lastH: -Infinity, incoming: 0, making: 0 })
  for (const [k, n] of Object.entries(s.stock)) {
    const { res, q } = E.parseKey(k); if (!RES[res]) continue
    const r = row(res); r.qty += n; r.lots.push({ q, n }); r.topQ = Math.max(r.topQ, q)
  }
  // Goods in buildings: made but not collected = incoming; not yet made = in production.
  for (const bd of s.plots) {
    const j = bd?.job; if (!bd || !j || j.kind !== 'make') continue
    const p = E.pending(s, bd)!, r = row(j.res)
    r.incoming += p.units; r.making += j.qty - E.unitsDone(j, s.hour)
  }
  // 24h change and "recently changed" come from the movement log.
  for (const m of s.whLog ?? []) {
    if (!by[m.res] && !RES[m.res]) continue
    const r = row(m.res)
    if (s.hour - m.h <= 24) r.change24 += m.n
    r.lastH = Math.max(r.lastH, m.h)
  }
  for (const r of Object.values(by)) { r.lots.sort((a, b) => b.q - a.q); r.value = r.qty * r.price }
  return Object.values(by).filter(r => r.qty > 1e-9 || r.incoming > 0 || r.making > 0)
}

type Sort = 'value' | 'qty' | 'name' | 'recent'
const SORTS: [Sort, string][] = [['value', 'Value'], ['qty', 'Quantity'], ['name', 'Name'], ['recent', 'Recently changed']]
const sorter = (k: Sort) => (a: GoodRow, b: GoodRow) =>
  k === 'value' ? b.value - a.value : k === 'qty' ? b.qty - a.qty : k === 'recent' ? b.lastH - a.lastH : RES[a.res].name.localeCompare(RES[b.res].name)

/** Quality stars: filled up to q (max 5 shown). */
export const Stars = ({ q }: { q: number }) => <span className="stars" aria-label={`Quality ${q}`}>{[0, 1, 2, 3, 4].map(i => <i key={i} className={i < q ? 'on' : ''}>★</i>)}</span>

// ============================================================================
/**
 * openChain: jump to the Production chains screen for a good (from the detail page).
 * initialOpen: reopen a good's detail page (when coming back from that screen).
 */
export function Warehouse({ s, act, openPlot, openChain, initialOpen }: { s: E.GameState; act: Act; openPlot: (i: number) => void; openChain?: (res: string) => void; initialOpen?: string | null }) {
  const [tab, setTab] = useState<'inv' | 'in' | 'con' | 'hist'>('inv')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<Cat | 'all'>('all')
  const [sort, setSort] = useState<Sort>('value')
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const [all, setAll] = useState<Record<string, boolean>>({})
  const [open, setOpen] = useState<string | null>(initialOpen ?? null)
  const rows = goodRows(s)
  const total = rows.reduce((t, r) => t + r.value, 0), units = rows.reduce((t, r) => t + r.qty, 0), cap = capacityOf(s)
  const shown = rows.filter(r => r.qty > 1e-9 || r.incoming || r.making)
    .filter(r => (cat === 'all' || catOf(r.res) === cat) && (!q || RES[r.res].name.toLowerCase().includes(q.toLowerCase())))
    .sort(sorter(sort))

  if (open) return <GoodDetail s={s} res={open} act={act} onBack={() => setOpen(null)} openChain={openChain} />
  return (
    <div className="wh">
      {/* Header: value + capacity */}
      <div className="wh-head">
        <div><small>Warehouse value</small><b className="big">{money(total)}</b><small>{rows.length} goods · {compact(units)} units</small></div>
        <div className="cap"><small>Capacity {compact(units)} / {compact(cap)}</small>
          <div className={`bar ${units > cap * 0.9 ? 'warn' : ''}`}><i style={{ width: `${Math.min(100, (100 * units) / cap)}%` }} /></div></div>
      </div>
      <div className="wh-tabs">{([['inv', 'Inventory'], ['in', 'Incoming'], ['con', 'Contracts'], ['hist', 'History']] as const).map(([k, l]) =>
        <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>

      {tab === 'inv' && <>
        <div className="wh-tools">
          <input type="search" placeholder="Search goods" value={q} onChange={e => setQ(e.target.value)} />
          <select value={cat} onChange={e => setCat(e.target.value as Cat | 'all')} aria-label="Category"><option value="all">All categories</option>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sort">{SORTS.map(([k, l]) => <option key={k} value={k}>Sort: {l}</option>)}</select>
        </div>
        <CrateCard s={s} act={act} />
        {shown.length === 0 && <p className="muted">{rows.length ? 'No goods match.' : 'Your warehouse is empty. Buy starter goods on the Market tab or start production.'}</p>}
        {CATS.map(([k, label]) => {
          const list = shown.filter(r => catOf(r.res) === k)
          if (!list.length) return null
          const v = list.reduce((t, r) => t + r.value, 0)
          return <section key={k} className={`wh-cat ${closed[k] ? 'closed' : ''}`}>
            <header>
              <button className="wh-cat-t" onClick={() => setClosed(c => ({ ...c, [k]: !c[k] }))} aria-expanded={!closed[k]}><span className="chev">▾</span>{label} <small>{list.length} · {money(v)}</small></button>
              {!closed[k] && list.length > 2 && <button className="link" onClick={() => setAll(a => ({ ...a, [k]: !a[k] }))}>{all[k] ? 'Show less' : 'Show all'}</button>}
            </header>
            {!closed[k] && <div className={`wh-row ${all[k] ? 'grid' : ''}`}>{list.map((r, i) => <Tile key={r.res} r={r} i={i} onOpen={() => setOpen(r.res)} />)}</div>}
          </section>
        })}
      </>}
      {tab === 'in' && <Incoming s={s} openPlot={openPlot} />}
      {tab === 'con' && <Contracts s={s} act={act} />}
      {tab === 'hist' && <History s={s} />}
    </div>
  )
}

/** One tile: icon, stars, price, amount, name; badges for incoming/in production; 24h change. */
function Tile({ r, i, onOpen }: { r: GoodRow; i: number; onOpen: () => void }) {
  return <button className="wh-tile" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }} onClick={onOpen}>
    <span className="art"><GoodArt id={r.res} size={56} /></span>
    <span className="pr">{money(r.price)}</span>
    <span className="amt">{compact(r.qty)}</span>
    {r.topQ > 0 && <Stars q={r.topQ} />}
    <span className="nm">{RES[r.res].name}</span>
    <span className="badges">
      {r.incoming > 0 && <span className="bdg in" title="Made, waiting in buildings">+{compact(r.incoming)}</span>}
      {r.making > 0 && <span className="bdg mk" title="Still in production">⚙ {compact(r.making)}</span>}
    </span>
    {Math.abs(r.change24) >= 1 && <span className={`chg ${r.change24 > 0 ? 'up' : 'down'}`} title="Change in the last 24h">{r.change24 > 0 ? '▲' : '▼'}{compact(Math.abs(r.change24))}</span>}
  </button>
}

// ---- sub tabs --------------------------------------------------------------
function Incoming({ s, openPlot }: { s: E.GameState; openPlot: (i: number) => void }) {
  const jobs = s.plots.map((bd, i) => ({ bd, i })).filter(x => x.bd?.job && x.bd.job.kind === 'make')
  if (!jobs.length) return <p className="muted">Nothing is being made right now.</p>
  // Totals across every building: units in production, what their inputs are worth, and the unit cost.
  const made = jobs.map(x => x.bd!.job as Extract<E.Job, { kind: 'make' }>)
  const units = made.reduce((t, j) => t + j.qty, 0)
  const src = made.reduce((t, j) => t + (j.src ?? 0), 0), wg = made.reduce((t, j) => t + (j.wg ?? 0), 0)
  return <div><div className="wh-sum"><span>{jobs.length} {jobs.length === 1 ? 'building' : 'buildings'}, {num(units)} units in production</span>
    <span>Sourcing value {money(src)} · {units ? `${money(src / units)} per unit in inputs, ${money((src + wg) / units)} with wages` : '—'}</span></div>
  <div className="wh-list">{jobs.map(({ bd, i }) => {
    const j = bd!.job as Extract<E.Job, { kind: 'make' }>, p = E.pending(s, bd!)!, done = E.unitsDone(j, s.hour)
    return <button key={i} className="wh-li" onClick={() => openPlot(i)}>
      <GoodArt id={j.res} size={40} />
      <span><b>{RES[j.res].name}</b> <small>at {BLD[bd!.type].name}</small><br />
        <small>{num(p.units)} ready to collect · {num(j.qty - done)} still to make · done in {dur(Math.max(0, j.endH - s.hour))}</small>
        <span className="bar"><i style={{ width: `${(100 * done) / j.qty}%` }} /></span>
        <small>Sourcing {j.src !== undefined ? `${money(j.src)} · ${money(j.src / j.qty)} per unit` : '—'}{j.wg !== undefined ? ` · wages ${money(j.wg / j.qty)} per unit` : ''}</small></span>
    </button>
  })}</div></div>
}

function Contracts({ s, act }: { s: E.GameState; act: Act }) {
  const g = s.gov
  if (!g || (g.status !== 'active' && g.status !== 'offer')) return <p className="muted">No government contract right now. They appear from company level {F.GOV_LEVEL} on the Finance tab. Player-to-player offers are on Market → Trade floor.</p>
  return <div className="wh-list">
    <p><b>{g.title}</b> · {g.status === 'offer' ? 'offered (accept it on the Finance tab)' : `due in ${dur(Math.max(0, g.deadlineH - s.hour))}`}</p>
    {g.items.map(it => {
      const have = Object.entries(s.stock).filter(([k]) => { const l = E.parseKey(k); return l.res === it.res && l.q >= it.q }).reduce((t, [, n]) => t + n, 0)
      return <div key={it.res} className="wh-li">
        <GoodArt id={it.res} size={40} />
        <span><b>{RES[it.res].name}</b> <small>Q{it.q}+ · {money(it.price)} each</small><br /><small>{num(it.done)} / {num(it.qty)} delivered · you have {num(have)}</small>
          <span className="bar"><i style={{ width: `${(100 * it.done) / it.qty}%` }} /></span></span>
        {g.status === 'active' && it.done < it.qty && <button disabled={have < 1} onClick={() => act(st => F.deliverGov(st, it.res, Math.floor(Math.min(have, it.qty - it.done))))}>Deliver</button>}
      </div>
    })}
  </div>
}

function History({ s }: { s: E.GameState }) {
  const log = (s.whLog ?? []).slice().reverse().slice(0, 150)
  if (!log.length) return <p className="muted">No warehouse movements yet.</p>
  return <div className="wh-list hist">{log.map((m, i) => <div key={i} className="wh-li">
    <GoodArt id={m.res} size={28} />
    <span><b>{RES[m.res]?.name ?? m.res}</b> <small>Q{m.q} · {m.why}</small><br /><small>{dur(Math.max(0, s.hour - m.h))} ago</small></span>
    <b className={m.n > 0 ? 'up' : 'down'}>{m.n > 0 ? '+' : '−'}{num(Math.abs(m.n))}</b>
  </div>)}</div>
}

// ============================================================================
// Good detail (full screen)
// ============================================================================
function GoodDetail({ s, res, act, onBack, openChain }: { s: E.GameState; res: string; act: Act; onBack: () => void; openChain?: (res: string) => void }) {
  const r = RES[res]
  const row = goodRows(s).find(x => x.res === res)
  const lots = row?.lots ?? []
  const [lq, setLq] = useState(lots[0]?.q ?? 0)
  const lot = lots.find(l => l.q === lq) ?? lots[0]
  const have = Math.floor(lot?.n ?? 0)
  const [qty, setQty] = useState(Math.max(1, Math.min(have, 100)))
  const n = clampQty(qty, Math.max(1, have))
  const makers = BUILDINGS.filter(b => b.recipes?.includes(res))
  const users = useMemo(() => RECIPES.filter(rc => rc.inputs[res]).map(rc => rc.output), [res])
  const shop = r.store ? BUILDINGS.find(b => b.store === r.store) : undefined
  const idleShop = s.plots.findIndex(b => b && !b.job && shop && b.type === shop.id)
  const gov = s.gov?.status === 'active' ? s.gov.items.find(i => i.res === res && i.done < i.qty) : undefined
  const hist = [...(s.priceHist?.[res] ?? []), M.refPrice(s, res)]
  const bid = M.bidPrice(s, res, lot?.q ?? 0)
  const avg = s.avgCost?.[res]
  const done = (m: string | null | void) => m
  // Opening the detail starts at the top of the screen (the list may have been scrolled).
  const top = useRef<HTMLDivElement>(null)
  useEffect(() => { top.current?.closest('.screen-body')?.scrollTo({ top: 0 }) }, [res])
  return <div className="wh-detail" ref={top}>
    <div className="whd-head"><button className="hud-btn" onClick={onBack} aria-label="Back to warehouse">‹</button><GoodArt id={res} size={64} /><div><h3>{r.name}</h3><small>{catLabel(res)}</small></div></div>
    <div className="preview">
      <div><span>In stock</span><b>{num(row?.qty ?? 0)}</b></div>
      <div><span>Market price</span><b>{money(M.refPrice(s, res))}</b></div>
      <div><span>Stock value</span><b>{money(row?.value ?? 0)}</b></div>
      <div><span>Average cost</span><b>{avg !== undefined ? money(avg) : '—'}</b></div>
      {row && (row.incoming > 0 || row.making > 0) && <div><span>In buildings</span><b>{num(row.incoming)} ready · {num(row.making)} in production</b></div>}
      <div><span>24h change</span><b className={row && row.change24 > 0 ? 'up' : row && row.change24 < 0 ? 'down' : ''}>{row ? (row.change24 > 0 ? '+' : '') + num(row.change24) : '0'}</b></div>
    </div>
    {lots.length > 0 && <div className="lots">{lots.map(l => <button key={l.q} className={l.q === lot?.q ? 'on' : ''} onClick={() => setLq(l.q)}>Q{l.q} <Stars q={l.q} /> {compact(l.n)}</button>)}</div>}
    <PriceChart pts={hist} avg={avg} />
    <div className="chain">
      <div><small>Made in</small>{makers.length ? makers.map(b => <span key={b.id} className="pill">{b.name}</span>) : <span className="muted">Bought only</span>}</div>
      <div><small>Used to make</small>{users.length ? users.map(u => <span key={u} className="pill"><GoodArt id={u} size={18} /> {RES[u].name}</span>) : <span className="muted">Nothing</span>}</div>
      {shop && <div><small>Sold in</small><span className="pill">{shop.name}</span></div>}
      {/* Full tree of what it takes to make this good (Production chains screen). */}
      {openChain && <button className="ch-open" onClick={() => openChain(res)}>🔗 See production chain</button>}
    </div>
    {have >= 1 ? <div className="card">
      <QtyPicker value={n} max={have} onChange={setQty} />
      <div className="acts3">
        {res === 'power'
          ? <button className="primary" onClick={() => act(st => done(M.sellPower(st, lot!.q, n)))}>Sell to grid<small>{money(n * M.refPrice(s, res) * M.GRID_RATE)} now, no crates</small></button>
          : <button className="primary" onClick={() => act(st => done(M.quickSell(st, res, lot!.q, n)))}>Sell on market<small>{money(n * bid)} now</small></button>}
        <button disabled={idleShop < 0} title={shop ? (idleShop < 0 ? `No idle ${shop.name}` : '') : 'Not sold to the public'}
          onClick={() => act(st => done(E.startSell(st, idleShop, res, lot!.q, n, E.fairPrice(res, lot!.q))))}>Sell in store<small>{shop ? (idleShop < 0 ? `no idle ${shop.name}` : `${money(n * E.fairPrice(res, lot!.q))} at fair price`) : 'not a store good'}</small></button>
        <button disabled={!gov || (lot?.q ?? 0) < gov.q} onClick={() => act(st => done(F.deliverGov(st, res, Math.min(n, gov!.qty - gov!.done))))}>Use in contract<small>{gov ? `${money(Math.min(n, gov.qty - gov.done) * gov.price)}` : 'no open contract'}</small></button>
      </div>
    </div> : <p className="muted">None in stock right now.</p>}
  </div>
}
const catLabel = (res: string) => CATS.find(c => c[0] === catOf(res))![1]

/** Small SVG line chart of the last 30 daily prices (+ today), with average cost as a dashed line. */
function PriceChart({ pts, avg }: { pts: number[]; avg?: number }) {
  if (pts.length < 2) return <p className="muted">Price history builds up day by day.</p>
  const W = 320, H = 110, all = avg !== undefined ? [...pts, avg] : pts
  const lo = Math.min(...all) * 0.97, hi = Math.max(...all) * 1.03 || 1
  const x = (i: number) => (i / (pts.length - 1)) * W, y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * H
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  return <figure className="pchart"><figcaption>Price, last {pts.length} days</figcaption>
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs><linearGradient id="pcg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#4fb477" stopOpacity=".35" /><stop offset="1" stopColor="#4fb477" stopOpacity="0" /></linearGradient></defs>
      <path d={`${d}L${W},${H}L0,${H}Z`} fill="url(#pcg)" /><path d={d} fill="none" stroke="#2f9a5c" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {avg !== undefined && <line x1="0" x2={W} y1={y(avg)} y2={y(avg)} stroke="#c58a1b" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />}
    </svg>
    <small>{money(lo / 0.97)} – {money(hi / 1.03)}{avg !== undefined ? ' · dashed = your average cost' : ''}</small></figure>
}
// Keep RESOURCES referenced for tree-shaking clarity (used by tests).
export const ALL_GOODS = RESOURCES.map(r => r.id)

/** Quick-buy card for shipping crates (needed to sell on the Exchange). */
function CrateCard({ s, act }: { s: E.GameState; act: Act }) {
  const [n, setN] = useState(100)
  const lim = Q.maxBuy(s, 'crates', 0), qty = clampQty(n, Math.max(1, lim.max)), cost = M.quoteBuy(s, 'crates', qty)
  return <div className="card crate-card">
    <div className="cc-head"><GoodArt id="crates" size={40} /><span><b>Shipping crates</b><br /><small>You have {num(E.haveQty(s, 'crates'))}. Selling on the Exchange uses crates.</small></span></div>
    {lim.max >= 1 ? <>
      <QtyPicker value={qty} max={lim.max} why={lim.why} onChange={setN} />
      <button className="primary" onClick={() => act(st => { E.setWhy('bought'); return M.buy(st, 'crates', qty) })}>Buy {num(qty)} crates · {money(cost)}</button>
    </> : <small className="muted">{lim.why || 'No crates for sale right now.'}</small>}
  </div>
}
