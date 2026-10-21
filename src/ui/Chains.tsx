// ============================================================================
// Production chains explorer (full screen).
//
// Pick any good (search + the original good icons) and see the tree of what
// makes it: the building, its inputs, and their buildings/inputs all the way
// down. Every step shows units per hour, input cost at today's market prices,
// output value and profit per hour for one level-1 building, plus:
//  - "×0.3" = how many of that building keep ONE parent building busy,
//  - ✓ marks buildings you already own, 📦 marks inputs in your warehouse.
// Below the tree, "Used in" lists everything this good feeds into (tap one
// to jump to its chain).
//
// UX idea borrowed from Anno 1800's production chain overview and Factorio's
// recipe browser; all layout, art and words are Ledgerworks' own.
// The maths lives in src/game/chains.ts (unit-tested).
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import * as E from '../game/engine'
import * as M from '../game/market'
import { RES, RESOURCES } from '../game/data'
import { buildChain, usedIn, nodeKey, type ChainNode } from '../game/chains'
import { GoodArt } from './goodart'
import { money, num } from './fmt'
import { sfx } from './sound'

/** Short number for rates and ratios: 0.3, 12, 1.2k. */
const rate = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n >= 10 ? String(Math.round(n)) : n.toFixed(n >= 1 ? 1 : 2).replace(/\.?0+$/, '') || '0')

export function Chains({ s, res, onPick }: { s: E.GameState; res: string | null; onPick: (res: string | null) => void }) {
  // Owned building counts by type, computed once per render.
  const ownedBy = useMemo(() => {
    const m: Record<string, number> = {}
    for (const b of s.plots) if (b) m[b.type] = (m[b.type] ?? 0) + 1
    return m
  }, [s.plots])
  // The tree uses live market reference prices (same as the Market screen).
  const tree = useMemo(() => res && RES[res] ? buildChain(res, {
    price: r => M.refPrice(s, r),
    owned: b => ownedBy[b] ?? 0,
    inStock: r => E.haveQty(s, r),
  }) : null, [res, s, ownedBy])
  // Which nodes are open, keyed by their path ("bread>flour"). Keys start with
  // the root good, so each good keeps its own open/closed memory. The root
  // starts open (so its direct inputs show); deeper steps start collapsed.
  const [openK, setOpenK] = useState<Record<string, boolean>>({})
  // Jumping to a new good scrolls back to the top of the screen.
  const top = useRef<HTMLDivElement>(null)
  useEffect(() => { top.current?.closest('.screen-body')?.scrollTo({ top: 0 }) }, [res])
  // Root key defaults to open, every other key to closed; tapping flips it (with the tap sound).
  const toggle = (k: string, was: boolean) => { sfx('tap'); setOpenK(o => ({ ...o, [k]: !was })) }

  if (!res || !tree) return <div ref={top}><Picker onPick={r => { sfx('tap'); onPick(r) }} /></div>
  const used = usedIn(res)
  return <div className="chains" ref={top}>
    <div className="ch-head">
      <GoodArt id={res} size={56} />
      <div><h3>{RES[res].name}</h3><small>{money(M.refPrice(s, res))} each · {num(E.haveQty(s, res))} in stock</small></div>
      <button className="ch-change" onClick={() => { sfx('tap'); onPick(null) }}>Change good</button>
    </div>
    <p className="muted ch-legend">Per level‑1 building at today’s prices. ×n = buildings needed to keep the step above busy. ✓ = you own one · 📦 = in your warehouse.</p>
    <ul className="ch-tree"><Node n={tree} path={[]} openK={openK} toggle={toggle} root /></ul>
    <h4 className="ch-sub">Used in</h4>
    {used.length ? <div className="ch-used">{used.map(u => <button key={u.res} onClick={() => { sfx('tap'); onPick(u.res) }}>
      <GoodArt id={u.res} size={28} /><span>{RES[u.res].name}<small>{rate(u.amount)} per unit</small></span></button>)}</div>
      : <p className="muted">Nothing else is made from {RES[res].name.toLowerCase()} — it’s an end product.</p>}
  </div>
}

/** One step of the tree, then (if open) its inputs. Recursive. */
function Node({ n, path, openK, toggle, root }: { n: ChainNode; path: string[]; openK: Record<string, boolean>; toggle: (k: string, was: boolean) => void; root?: boolean }) {
  const k = nodeKey(path, n.res)
  const hasKids = n.inputs.length > 0
  const isOpen = hasKids && (root ? openK[k] !== false : !!openK[k])
  const m = n.math
  return <li className={'ch-node' + (root ? ' root' : '')}>
    <button className="ch-row" onClick={() => hasKids && toggle(k, isOpen)} aria-expanded={hasKids ? isOpen : undefined} disabled={!hasKids && !n.cut}>
      <span className="ch-tw">{hasKids ? (isOpen ? '▾' : '▸') : '•'}</span>
      <GoodArt id={n.res} size={36} />
      <span className="ch-main">
        <b>{RES[n.res].name}{!root && <em className="ch-ratio">×{rate(n.ratio)}</em>}</b>
        <small>
          {n.building ? n.building.name : 'Not made in any building'}
          {n.owned > 0 && <i className="ch-own"> ✓{n.owned}</i>}
          {n.stock >= 1 && <i className="ch-stock"> 📦{num(Math.floor(n.stock))}</i>}
          {!root && <> · needs {rate(n.needPerHour)}/h</>}
        </small>
        <span className="ch-nums">
          <span>{rate(m.perHour)}/h</span>
          <span>in {money(m.inputCost)}</span>
          <span>out {money(m.outputValue)}</span>
          <span className={m.profit >= 0 ? 'up' : 'down'}>{m.profit >= 0 ? '+' : ''}{money(m.profit)}/h</span>
        </span>
        {n.cut && <small className="muted">{n.cut === 'cycle' ? '↺ loops back to a step above' : '… chain continues (too deep to show)'}</small>}
      </span>
    </button>
    {isOpen && <ul>{n.inputs.map(c => <Node key={c.res} n={c} path={[...path, n.res]} openK={openK} toggle={toggle} />)}</ul>}
  </li>
}

/** Search box + icon grid of all 111 goods. */
function Picker({ onPick }: { onPick: (res: string) => void }) {
  const [q, setQ] = useState('')
  const list = RESOURCES.filter(r => !q || r.name.toLowerCase().includes(q.toLowerCase()))
  return <div className="ch-pick">
    <p className="muted">Pick a good to see everything it takes to make it, and what it’s used for.</p>
    <input className="ch-search" type="search" placeholder="Search 111 goods…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search goods" />
    <div className="ch-grid">{list.map(r => <button key={r.id} onClick={() => onPick(r.id)} aria-label={r.name}><GoodArt id={r.id} size={40} /><span>{r.name}</span></button>)}</div>
    {!list.length && <p className="muted">No good matches “{q}”.</p>}
  </div>
}
