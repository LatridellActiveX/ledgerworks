// Daily financial statements (Finance tab): Cash flow, Balance sheet and
// Ratios. Each shows one closed game day, with ‹ › to step between days.
//
// Layout follows the idea of Parker's reference (sections in caps, striped
// label/value rows, ? help on each line) in Ledgerworks' own card style.
// Positive numbers are green, negative red. Everything wraps to fit 390px at
// 130% text: labels shrink and wrap, values never overflow.
import { useState, type ReactNode } from 'react'
import type { GameState } from '../game/engine'
import * as L from '../game/ledger'
import { money } from './fmt'

export type StatementTab = 'cash' | 'balance' | 'ratios'

/** Game hour -> "Day 12, 08:00". */
const when = (h: number) => `Day ${Math.floor(h / 24) + 1}, ${String(Math.floor(h % 24)).padStart(2, '0')}:00`
/** Colour class for a signed number (zero stays neutral). */
const tone = (n: number | null) => (n === null || Math.abs(n) < 0.005 ? '' : n > 0 ? 'pos' : 'neg')
/** Signed money: "+$1,200" / "−$300". */
const sMoney = (n: number) => (Math.abs(n) < 0.005 ? money(0) : `${n > 0 ? '+' : '−'}${money(Math.abs(n))}`)

/** One striped row; an optional ? opens the help text under it. */
function Row({ k, v, cls = '', help, strong }: { k: ReactNode; v: ReactNode; cls?: string; help?: string; strong?: boolean }) {
  const [open, setOpen] = useState(false)
  return <>
    <div className={`fs-row${strong ? ' fs-strong' : ''}`}>
      <span className="fs-k">{k}{help && <button className="fs-q" aria-label="What is this?" aria-expanded={open} onClick={() => setOpen(!open)}>?</button>}</span>
      <span className={`fs-v ${cls}`}>{v}</span>
    </div>
    {open && help && <div className="fs-help" role="note">{help}</div>}
  </>
}

/** Day navigation shared by all three statements. */
function Nav({ i, n, set, st }: { i: number; n: number; set: (i: number) => void; st: L.DayStatement }) {
  return <div className="fs-nav">
    <button aria-label="Previous day" disabled={i <= 0} onClick={() => set(i - 1)}>‹</button>
    <div><b>Day {st.day}</b><small>{when(st.fromH)} – {when(st.toH)}</small></div>
    <button aria-label="Next day" disabled={i >= n - 1} onClick={() => set(i + 1)}>›</button>
  </div>
}

export function Statements({ s, tab }: { s: GameState; tab: StatementTab }) {
  const list = s.statements ?? []
  const [pick, setPick] = useState<number | null>(null) // null = latest
  if (!list.length) return <div className="card fs"><b>No statements yet</b>
    <span className="muted">The books close every game midnight. Your first statement appears after the next close{s.ledgerDay ? '' : ' (this save starts recording then, and the first full day follows)'}.</span></div>
  const i = Math.min(pick ?? list.length - 1, list.length - 1), st = list[i]
  return <div className="card fs">
    <Nav i={i} n={list.length} set={setPick} st={st} />
    {tab === 'cash' ? <CashFlow st={st} /> : tab === 'balance' ? <Balance st={st} /> : <Ratios st={st} />}
  </div>
}

// ---------------------------------------------------------------- cash flow
function CashFlow({ st }: { st: L.DayStatement }) {
  const cf = L.cashFlow(st)
  const line = (c: L.Cat) => { const v = st.flows[c] ?? 0; return <Row key={c} k={L.LINES[c].label} help={L.LINES[c].help} v={sMoney(v)} cls={tone(v)} /> }
  return <div className="fs-body">
    <h4>Operating activities</h4>
    <h5>Receipts</h5>{L.OPER_IN.map(line)}
    <Row strong k="Total receipts" v={sMoney(cf.receipts)} cls={tone(cf.receipts)} />
    <h5>Payments</h5>{L.OPER_OUT.map(line)}
    <Row strong k="Total payments" v={sMoney(cf.payments)} cls={tone(cf.payments)} />
    <Row strong k="Net from operations" v={sMoney(cf.operating)} cls={tone(cf.operating)} />
    <h4>Investing activities</h4>{L.INVEST.map(line)}
    <Row strong k="Net from investing" v={sMoney(cf.investing)} cls={tone(cf.investing)} />
    <h4>Financing activities</h4>{L.FINANCE.map(line)}
    <Row strong k="Net from financing" v={sMoney(cf.financing)} cls={tone(cf.financing)} />
    <div className="fs-total"><Row strong k="Total change in cash" v={sMoney(cf.total)} cls={tone(cf.total)} /></div>
    <Row k="Cash at open" v={money(st.openCash)} /><Row k="Cash at close" v={money(st.closeCash)} />
  </div>
}

// ------------------------------------------------------------ balance sheet
/** Value with its day-over-day change in $ and %. */
function Delta({ now, was }: { now: number; was: number }) {
  const d = now - was, p = L.ratio(d, Math.abs(was))
  return <>{money(now)}<small className={tone(d)}>{sMoney(d)} · {p === null ? '—' : `${p >= 0 ? '+' : ''}${(p * 100).toFixed(1)}%`}</small></>
}
function Balance({ st }: { st: L.DayStatement }) {
  const o = st.open, c = st.close
  const r = (k: string, f: (b: L.Balance) => number, strong = false, help?: string) => <Row strong={strong} k={k} help={help} v={<Delta now={f(c)} was={f(o)} />} />
  const dr = c.rank - o.rank
  return <div className="fs-body">
    <h4>Current assets</h4>
    {r('Cash', b => b.cash, false, 'Cash in hand plus cash locked in open buy orders.')}
    {r('Inventory', b => b.inventory, false, 'Warehouse stock at today\'s market price.')}
    {r('Bonds held', b => b.bondsHeld, false, 'Bonds you bought, at face value.')}
    {r('Total current assets', L.currentAssets, true)}
    <h4>Non-current assets</h4>
    {r('Buildings', b => b.buildings, false, 'What every building cost to build and upgrade.')}
    {r('Total assets', L.totalAssets, true)}
    <h4>Liabilities</h4>
    {r('Bonds and debt', b => b.liabilities, false, 'Bonds you issued and still owe.')}
    <div className="fs-total">{r('Equity (assets − liabilities)', L.equity, true)}</div>
    <Row k="Rank (company level)" v={<>{c.rank}<small className={tone(dr)}>{dr === 0 ? 'no change' : `${dr > 0 ? '+' : ''}${dr}`}</small></>} />
  </div>
}

// ------------------------------------------------------------------- ratios
const pct = (n: number | null) => (n === null ? '—' : `${(n * 100).toFixed(2)}%`)
const x2 = (n: number | null) => (n === null ? '—' : n.toFixed(2))
const days = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)} days`)
const m = (n: number | null) => (n === null ? '—' : money(n))
function Ratios({ st }: { st: L.DayStatement }) {
  const q = L.ratios(st), H = L.RATIO_HELP
  // Debt to building: lower is better, so colour it red only when above 50%.
  const row = (k: string, id: keyof typeof q, f: (n: number | null) => string, cls = tone(q[id])) => <Row k={k} help={H[id]} v={f(q[id])} cls={cls} />
  return <div className="fs-body">
    <h4>Profitability</h4>
    {row('Gross margin', 'gross', pct)}{row('Operating margin', 'operating', pct)}{row('Net margin', 'net', pct)}
    {row('Return on assets', 'roa', pct)}{row('Return on equity', 'roe', pct)}
    {row('Sales per employee', 'salesPerEmp', m)}{row('Income per employee', 'incomePerEmp', m)}
    <h4>Operating efficiency</h4>
    {row('Inventory turnover', 'invTurn', x2)}{row('Asset turnover', 'assetTurn', x2)}
    <h4>Liquidity</h4>
    {row('Defensive interval', 'defensive', days)}{row('Interest coverage', 'coverage', x2)}
    {row('Debt to buildings', 'debtBld', pct, q.debtBld === null || q.debtBld <= 0.5 ? 'pos' : 'neg')}
    <small className="muted">Figures are for this one game day. {st.employees} employees (one crew per building plus executives).</small>
  </div>
}
