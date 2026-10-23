// ============================================================================
// Trade routes screen (menu → 🛒 Trade routes) and the cart lane on the map.
//
// Lists the destination towns, your standing routes (status, next departure
// or cart progress, last trip and lifetime profit, pause/edit/delete) and a
// form to create or edit a route with a live estimate of one trip.
// Game logic lives in src/game/routes.ts; this file only displays it.
//
// Mechanic ideas from Patrician (Hanseatic trade routes) and Factorio
// (standing logistics rules). The towns, the cart drawing and all words are
// original to Ledgerworks.
// ============================================================================
import { useState } from 'react'
import * as E from '../game/engine'
import * as R from '../game/routes'
import { RES, RESOURCES } from '../game/data'
import { GoodArt } from './goodart'
import { clock, dur, money, num } from './fmt'

type Act = (f: (st: E.GameState) => string | null | void) => void

/**
 * Original little cart drawing: a wooden box wagon with a canvas cover, two
 * spoked wheels (they spin via CSS while the cart moves) and a crate on top.
 */
/**
 * Box truck (replaced the old horse-drawn wagon; still exported as Wagon so
 * callers don't change). Modern cab with a windscreen, a white cargo box with
 * a company stripe, and two wheels whose hubs spin while it drives (.moving).
 */
export function Wagon({ size = 40, moving = true }: { size?: number; moving?: boolean }) {
  return (
    <svg className={`wagon${moving ? ' moving' : ''}`} width={size} height={size * 0.7} viewBox="0 0 60 42" aria-hidden>
      {/* cargo box */}
      <rect x="2" y="6" width="38" height="24" rx="2" fill="#f4f6f9" stroke="#8b96a6" strokeWidth="1.4" />
      <rect x="2" y="19" width="38" height="4" fill="#2f80ed" />
      {/* cab: body, windscreen, headlight */}
      <path d="M41 12 H52 L58 21 V30 H41 Z" fill="#2f80ed" stroke="#1d4f99" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M44 14 H51 L55 20 H44 Z" fill="#bfe3ff" stroke="#1d4f99" strokeWidth="1" />
      <rect x="55" y="24" width="3" height="2.5" rx="1" fill="#ffe27a" />
      {/* chassis */}
      <rect x="2" y="29" width="56" height="3" rx="1" fill="#39424e" />
      {/* wheels: tyre + alloy hub; the hub group spins */}
      {[13, 48].map(cx => (
        <g key={cx} transform={`translate(${cx} 33)`}>
          <circle r="6.5" fill="#20252c" />
          <circle r="3.6" fill="#c9d1db" />
          <g className="spokes"><path d="M-3.2 0 H3.2 M0 -3.2 V3.2" stroke="#6b7685" strokeWidth="1.2" /></g>
          <circle r="1.2" fill="#20252c" />
        </g>
      ))}
    </svg>
  )
}

/** "every 2h" / "every 1d". */
const everyLabel = (h: number) => (h >= 24 ? `every ${h / 24}d` : `every ${h}h`)
const ruleText = (r: R.RouteSpec) => (r.mode === 'amount' ? `Ships ${num(r.amount)} ${everyLabel(r.every)}` : `Ships all above ${num(r.amount)} ${everyLabel(r.every)}`)

/** Estimate for one trip of `sp` right now: load, revenue, fee, profit and the Exchange quick-sell comparison. */
function estimate(s: E.GameState, sp: R.RouteSpec) {
  const town = R.TOWN[sp.town], qty = R.loadFor(s, sp) || (sp.mode === 'amount' ? Math.min(sp.amount, town.cap) : 0)
  const revenue = R.saleValue(s, town, sp.res, qty, 0), cost = qty ? R.tripCost(town, qty) : 0
  return { qty, revenue, cost, profit: revenue - cost, vsEx: revenue - cost - R.exchangeValue(s, sp.res, qty) }
}

/** The create / edit form. `init` is the route being edited, if any. */
function RouteForm({ s, act, init, onDone }: { s: E.GameState; act: Act; init?: R.Route; onDone: () => void }) {
  // Goods you hold first (most first), then everything else by name.
  const held = RESOURCES.filter(r => E.haveQty(s, r.id) >= 1).sort((a, b) => E.haveQty(s, b.id) - E.haveQty(s, a.id))
  const rest = RESOURCES.filter(r => E.haveQty(s, r.id) < 1).sort((a, b) => a.name.localeCompare(b.name))
  const [sp, setSp] = useState<R.RouteSpec>(() => init ? { town: init.town, res: init.res, mode: init.mode, amount: init.amount, every: init.every }
    : { town: R.TOWNS[0].id, res: held[0]?.id ?? RESOURCES[0].id, mode: 'amount', amount: 50, every: 2 })
  const set = (p: Partial<R.RouteSpec>) => setSp(o => ({ ...o, ...p }))
  const town = R.TOWN[sp.town], est = estimate(s, sp)
  return (
    <div className="rt-form">
      <h4>{init ? 'Edit route' : 'New route'}</h4>
      <label className="rt-lbl">Destination</label>
      <div className="rt-towns pick">
        {R.TOWNS.map(t => <button key={t.id} className={sp.town === t.id ? 'on' : ''} onClick={() => set({ town: t.id, amount: sp.mode === 'amount' ? Math.min(sp.amount, t.cap) : sp.amount })}>
          <span>{t.icon}</span><b>{t.name}</b><small>{money(R.townPrice(s, t, sp.res))} · {dur(t.travelH)}</small>
        </button>)}
      </div>
      <label className="rt-lbl">Good</label>
      <div className="rt-good">
        <GoodArt id={sp.res} size={40} />
        <select value={sp.res} onChange={e => set({ res: e.target.value })} aria-label="Good to ship">
          <optgroup label="In your warehouse">{held.map(r => <option key={r.id} value={r.id}>{r.name} ({num(E.haveQty(s, r.id))})</option>)}</optgroup>
          <optgroup label="Other goods">{rest.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>
        </select>
      </div>
      <label className="rt-lbl">How much</label>
      <div className="rt-seg">
        <button className={sp.mode === 'amount' ? 'on' : ''} onClick={() => set({ mode: 'amount', amount: Math.max(1, Math.min(sp.amount, town.cap)) })}>Fixed amount</button>
        <button className={sp.mode === 'reserve' ? 'on' : ''} onClick={() => set({ mode: 'reserve' })}>Keep a reserve</button>
      </div>
      <div className="rt-amt">
        <input type="number" inputMode="numeric" min={sp.mode === 'amount' ? 1 : 0} max={sp.mode === 'amount' ? town.cap : undefined} value={sp.amount}
          aria-label={sp.mode === 'amount' ? 'Units per trip' : 'Units to keep'} onChange={e => set({ amount: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
        <small className="muted">{sp.mode === 'amount' ? `units per trip (truck holds ${town.cap})` : `units always kept; the rest ships (up to ${town.cap})`}</small>
      </div>
      <label className="rt-lbl">How often</label>
      <div className="rt-every">{R.EVERY_OPTIONS.map(h => <button key={h} className={sp.every === h ? 'on' : ''} onClick={() => set({ every: h })}>{h >= 24 ? '1d' : `${h}h`}</button>)}</div>
      {/* Live estimate for one trip right now. */}
      <div className="rt-est">
        <span>Next load <b>{num(est.qty)}</b></span>
        <span>Sells for <b>{money(est.revenue)}</b></span>
        <span>Transport <b>−{money(est.cost)}</b></span>
        <span>Profit <b className={est.profit >= 0 ? 'up' : 'down'}>{money(est.profit)}</b></span>
        <small className="muted">{est.qty ? `${est.vsEx >= 0 ? '+' : ''}${money(est.vsEx)} vs a quick sell on the Exchange. ` : ''}Over {num(R.townDemand(town, sp.res))} per trip sell at {Math.round(R.SURPLUS_PRICE * 100)}%.</small>
      </div>
      <div className="rt-actions">
        <button onClick={onDone}>Cancel</button>
        <button className="primary" onClick={() => { let ok = false; act(st => { const e = init ? R.editRoute(st, init.id, sp) : R.addRoute(st, sp); ok = !e; return e }); if (ok) onDone() }}>{init ? 'Save route' : 'Start route'}</button>
      </div>
    </div>
  )
}

/** One route card: rule, status (on the road / next departure / paused), last trip, totals and buttons. */
function RouteCard({ s, r, act, onEdit }: { s: E.GameState; r: R.Route; act: Act; onEdit: () => void }) {
  const town = R.TOWN[r.town]
  const t = r.trip, p = t ? Math.min(1, (s.hour - t.departH) / (t.arriveH - t.departH)) : 0
  return (
    <article className={`rt-card${r.paused ? ' paused' : ''}`}>
      <div className="rt-top">
        <GoodArt id={r.res} size={40} />
        <div>
          <b>{RES[r.res]?.name} → {town?.icon} {town?.name}</b>
          <small className="muted">{ruleText(r)} · now {money(R.townPrice(s, town, r.res))}/unit there</small>
        </div>
      </div>
      {/* Status: the cart's progress, or when the next one leaves. */}
      {t ? <div className="rt-road"><div className="rt-track"><i style={{ width: `${p * 100}%` }} /><span style={{ left: `${p * 100}%` }}><Wagon size={30} /></span></div>
        <small>On the road with {num(t.qty)} · arrives in {dur(Math.max(0, t.arriveH - s.hour))}</small></div>
        : <p className="rt-status">{r.paused ? '⏸ Paused' : `Next truck leaves ${r.nextH <= s.hour + 1e-6 ? 'now' : `in ${dur(r.nextH - s.hour)}`} · ${num(R.loadFor(s, r))} ready`}</p>}
      {r.last && <p className="rt-last">{r.last.note ? `Last departure skipped: ${r.last.note}.`
        : <>Last trip ({clock(r.last.h)}): sold {num(r.last.qty)} for {money(r.last.revenue)}, transport {money(r.last.cost)}, profit <b className={r.last.revenue - r.last.cost >= 0 ? 'up' : 'down'}>{money(r.last.revenue - r.last.cost)}</b></>}</p>}
      <p className="rt-total">{r.trips} trip{r.trips === 1 ? '' : 's'} · {num(r.units)} shipped · total profit <b className={R.routeProfit(r) >= 0 ? 'up' : 'down'}>{money(R.routeProfit(r))}</b></p>
      <div className="rt-btns">
        <button onClick={() => act(st => R.togglePause(st, r.id))}>{r.paused ? '▶ Resume' : '⏸ Pause'}</button>
        <button onClick={onEdit}>✎ Edit</button>
        <button className="danger" onClick={() => { if (confirm(`Close the route to ${town?.name}?${t ? ' The truck on the road turns back and its goods return to the warehouse.' : ''}`)) act(st => R.deleteRoute(st, r.id)) }}>Delete</button>
      </div>
    </article>
  )
}

export function Routes({ s, act }: { s: E.GameState; act: Act }) {
  const [form, setForm] = useState<null | 'new' | number>(null)
  const routes = s.routes ?? []
  const editing = typeof form === 'number' ? routes.find(r => r.id === form) : undefined
  const profit = routes.reduce((t, r) => t + R.routeProfit(r), 0)
  return (
    <div className="rt">
      <p className="muted rt-help">Set up standing routes and trucks will ship goods to other cities on their own, on a timer. Each city pays its own price, which drifts from hour to hour, and likes some kinds of goods more than others.</p>
      <div className="rt-sum"><span><b>{routes.length}</b>/{R.MAX_ROUTES} routes</span><span><b>{R.onTheRoad(s).length}</b> on the road</span><span>Profit <b className={profit >= 0 ? 'up' : 'down'}>{money(profit)}</b></span></div>
      {form !== null ? <RouteForm key={String(form)} s={s} act={act} init={editing} onDone={() => setForm(null)} />
        : <button className="primary rt-new" disabled={routes.length >= R.MAX_ROUTES} onClick={() => setForm('new')}>＋ New trade route</button>}
      {routes.length === 0 && form === null && <p className="rt-empty"><Wagon size={56} moving={false} /><br />No routes yet. Pick a city, a good and how often to send it.</p>}
      {routes.map(r => <RouteCard key={r.id} s={s} r={r} act={act} onEdit={() => setForm(r.id)} />)}
      <h4 className="rt-sec">Cities</h4>
      <div className="rt-towns">
        {R.TOWNS.map(t => <div key={t.id} className="rt-town">
          <b>{t.icon} {t.name}</b>
          <small>{t.blurb}</small>
          <small>🕒 {dur(t.travelH)} · 📦 {t.cap} · {money(t.fee)}+/trip</small>
          <small>Pays more for: {t.likes.map(catName).join(', ')}</small>
        </div>)}
      </div>
    </div>
  )
}
const CAT_NAME: Record<string, string> = { farm: 'Agriculture', food: 'Food', textile: 'Textiles', energy: 'Energy', build: 'Construction', tech: 'Electronics', research: 'Research', utility: 'Utilities' }
const catName = (f: string) => CAT_NAME[f] ?? f

/**
 * Map lane: while any cart is on the road, a dashed road along the top of the
 * map with each cart drawn at its progress, heading for its town. Tap to open
 * the Trade routes screen.
 */
export function RouteLane({ s, onOpen }: { s: E.GameState; onOpen: () => void }) {
  const carts = R.onTheRoad(s)
  if (!carts.length) return null
  const soonest = carts.reduce((a, b) => (b.left < a.left ? b : a))
  return (
    <div className="route-lane" role="button" tabIndex={0} aria-label="Trade routes on the road" onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter') onOpen() }}>
      <span className="rl-road">
        {/* Destination flag: the town of the cart that arrives first. */}
        <span className="rl-dest" aria-hidden>{soonest.town?.icon}</span>
        {carts.map(c => <span key={c.r.id} className="rl-cart" style={{ left: `calc(${c.p * 100}% - ${c.p * 34}px)` }} title={`${RES[c.r.res]?.name} to ${c.town?.name}`}><Wagon size={34} /></span>)}
      </span>
      <small>🚚 {carts.length} on the highway · {soonest.town?.icon} {soonest.town?.name} in {dur(soonest.left)}</small>
    </div>
  )
}
