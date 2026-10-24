// ============================================================================
// Money ledger and daily financial statements.
//
// 1. Ledger: every place in the game that changes cash also calls book() with
//    a category and the signed amount (+ money in, - money out). The amounts
//    add up per in-game day in s.ledgerDay. A refund books into the same
//    category it came from (e.g. a cancelled buy order is a positive amount in
//    "exBuy"), so each line shows the true net for the day.
//
// 2. Daily close: closeDay() runs at every game midnight from rollDay (so it
//    also runs during offline catch-up, one close per day that passed). It
//    turns the day's ledger into one DayStatement holding:
//      - the cash flow statement (operating / investing / financing),
//      - the balance sheet at the close, and the one from the day before,
//      - the inputs the ratios need (employees, rank).
//    Ratios are worked out from a statement when shown (ratios()), so the
//    formulas can improve later without touching old saves.
//    History is capped at HIST_DAYS (oldest dropped first).
//
// 3. Reconciling: any cash change no call site booked (e.g. moving cash to the
//    trade floor) is put into "Other" at the close, so the statement's total
//    change in cash always equals the real change in cash.
//
// Old saves have no s.ledgerDay. book() ignores them until the first close,
// which just opens the books; the first full statement comes a day later.
// ============================================================================
import type { GameState } from './engine'
import { companyLevel } from './engine'
import { valueBreakdown } from './value'
import { boardSize } from './execs'

/** Every cash category. Comments say which statement section shows it. */
export type Cat =
  // Operating receipts
  | 'retail' | 'exSales' | 'contracts' | 'routes' | 'interestIn' | 'otherIn'
  // Operating payments
  | 'exBuy' | 'crates' | 'wages' | 'execs' | 'fees' | 'routeCost' | 'research' | 'interestOut' | 'otherOut'
  // Investing
  | 'buildings' | 'bondsBought'
  // Financing
  | 'bondsIssued' | 'bondsRepaid'

/** Labels and help text for each line, in statement order. */
export const LINES: Record<Cat, { label: string; help: string }> = {
  retail: { label: 'Store sales', help: 'Money from your shops selling to the public.' },
  exSales: { label: 'Exchange sales', help: 'Goods sold on the exchange and power sold to the grid, before the broker fee.' },
  contracts: { label: 'Contracts', help: 'Government order payments, less any deposit put down (deposits come back when the order is done).' },
  routes: { label: 'Trade routes', help: 'Money from trucks selling goods in towns.' },
  interestIn: { label: 'Bond interest received', help: 'Daily interest on bonds you hold.' },
  otherIn: { label: 'Other income', help: 'Achievement prizes and any cash not covered by another line.' },
  exBuy: { label: 'Exchange purchases', help: 'Goods bought on the exchange (buy-order cash net of refunds).' },
  crates: { label: 'Shipping crates', help: 'Crates bought to ship goods.' },
  wages: { label: 'Wages', help: 'Worker wages paid when a building starts a job.' },
  execs: { label: 'Executives', help: 'Executive salaries, signing bonuses and training.' },
  fees: { label: 'Fees', help: 'Broker fees, cancel fees, the accounting fee and rush fees.' },
  routeCost: { label: 'Transport', help: 'Truck fees for trade routes.' },
  research: { label: 'Research', help: 'Cash spent on research.' },
  interestOut: { label: 'Bond interest paid', help: 'Daily interest on bonds you issued.' },
  otherOut: { label: 'Other costs', help: 'Farm care (irrigation, grafts) and any cash not covered by another line.' },
  buildings: { label: 'Buildings & upgrades', help: 'Construction, upgrades, shop fittings and tills, less scrap refunds.' },
  bondsBought: { label: 'Bonds bought', help: 'Bonds you bought, less repayments and default recoveries.' },
  bondsIssued: { label: 'Bonds issued', help: 'Cash raised by selling your own bonds.' },
  bondsRepaid: { label: 'Bonds repaid', help: 'Your bonds you paid back.' },
}
export const OPER_IN: Cat[] = ['retail', 'exSales', 'contracts', 'routes', 'interestIn', 'otherIn']
export const OPER_OUT: Cat[] = ['exBuy', 'crates', 'wages', 'execs', 'fees', 'routeCost', 'research', 'interestOut', 'otherOut']
export const INVEST: Cat[] = ['buildings', 'bondsBought']
export const FINANCE: Cat[] = ['bondsIssued', 'bondsRepaid']

/** How many daily statements to keep. */
export const HIST_DAYS = 90

/** Balance sheet at one moment. All money; "rank" is the company level. */
export interface Balance {
  cash: number        // cash + cash locked in buy orders
  inventory: number   // stock at today's market price
  bondsHeld: number   // bonds bought from others, at face value (current asset)
  buildings: number   // build + upgrade cost
  liabilities: number // bonds you issued
  rank: number        // company level
}
export interface DayStatement {
  day: number          // game day number (1 = founding day)
  fromH: number; toH: number // game hours covered
  openCash: number; closeCash: number
  flows: Partial<Record<Cat, number>>
  open: Balance; close: Balance
  employees: number    // one crew per building + each executive
}

/** Record a cash movement. amt > 0 money in, < 0 money out. */
export function book(s: GameState, cat: Cat, amt: number) {
  if (!s.ledgerDay || !amt || !Number.isFinite(amt)) return // old save before its first close
  s.ledgerDay[cat] = (s.ledgerDay[cat] ?? 0) + amt
}

/** Balance sheet right now (same numbers as the Company Value screen). */
export function balanceNow(s: GameState): Balance {
  const v = valueBreakdown(s)
  return { cash: v.cash, inventory: v.inventory, bondsHeld: v.bondsHeld, buildings: v.buildings, liabilities: v.liabilities, rank: companyLevel(s.xp) }
}
export const currentAssets = (b: Balance) => b.cash + b.inventory + b.bondsHeld
export const totalAssets = (b: Balance) => currentAssets(b) + b.buildings
export const equity = (b: Balance) => totalAssets(b) - b.liabilities

/** Start a fresh day's books (new games and the first close of an old save). */
export function openBooks(s: GameState) {
  s.ledgerDay = {}
  s.ledgerOpen = { h: s.hour, cash: s.cash, bal: balanceNow(s) }
}

/** Midnight close: turn today's ledger into a statement and start a new day. */
export function closeDay(s: GameState) {
  if (!s.ledgerDay || !s.ledgerOpen) return openBooks(s) // old save: start recording now
  const flows = { ...s.ledgerDay }
  // Put anything nobody booked into Other, so the totals match real cash.
  const booked = Object.values(flows).reduce((t, n) => t + (n ?? 0), 0)
  const gap = s.cash - s.ledgerOpen.cash - booked
  if (Math.abs(gap) > 0.005) { const c: Cat = gap > 0 ? 'otherIn' : 'otherOut'; flows[c] = (flows[c] ?? 0) + gap }
  const st: DayStatement = {
    day: Math.floor((s.hour - 1e-9) / 24) + 1, fromH: s.ledgerOpen.h, toH: s.hour,
    openCash: s.ledgerOpen.cash, closeCash: s.cash, flows,
    open: s.ledgerOpen.bal, close: balanceNow(s),
    employees: s.plots.filter(Boolean).length + boardSize(s),
  }
  const h = (s.statements ??= [])
  h.push(st)
  if (h.length > HIST_DAYS) h.splice(0, h.length - HIST_DAYS)
  openBooks(s)
}

// ---------------------------------------------------------------- summaries
const sum = (f: DayStatement['flows'], cats: Cat[]) => cats.reduce((t, c) => t + (f[c] ?? 0), 0)
/** Section subtotals of a cash flow statement. */
export function cashFlow(st: DayStatement) {
  const receipts = sum(st.flows, OPER_IN), payments = sum(st.flows, OPER_OUT)
  const operating = receipts + payments, investing = sum(st.flows, INVEST), financing = sum(st.flows, FINANCE)
  return { receipts, payments, operating, investing, financing, total: operating + investing + financing }
}

/** a ÷ b, or null when b is 0 (or anything is not a number) so the UI shows a dash. */
export const ratio = (a: number, b: number): number | null => (b === 0 || !Number.isFinite(a) || !Number.isFinite(b) ? null : a / b)

/** Plain-words formulas for the ? tooltips. */
export const RATIO_HELP: Record<string, string> = {
  gross: 'Gross margin = (sales − cost of goods) ÷ sales. Sales are store, exchange, contract and route income; cost of goods is exchange purchases, crates and wages.',
  operating: 'Operating margin = operating income ÷ sales. Operating income is all operating receipts minus operating payments, leaving out bond interest.',
  net: 'Net margin = net income ÷ sales. Net income is operating income plus interest received minus interest paid.',
  roa: 'Return on assets = net income ÷ total assets at the close.',
  roe: 'Return on equity = net income ÷ equity (total assets minus liabilities) at the close.',
  salesPerEmp: 'Sales per employee = sales ÷ employees (one crew per building plus each executive).',
  incomePerEmp: 'Income per employee = net income ÷ employees.',
  invTurn: 'Inventory turnover = cost of goods ÷ inventory value at the close. Higher means stock moves faster.',
  assetTurn: 'Asset turnover = sales ÷ total assets at the close.',
  defensive: 'Defensive interval = current assets ÷ the day\'s operating payments: how many days you could keep paying with what you have.',
  coverage: 'Interest coverage = operating income ÷ interest paid. Dash when you pay no interest.',
  debtBld: 'Debt to building ratio = liabilities ÷ building value.',
}

/** Every ratio for one day. null = not defined (divide by zero). */
export function ratios(st: DayStatement) {
  const f = st.flows, g = (c: Cat) => f[c] ?? 0
  const sales = g('retail') + g('exSales') + g('contracts') + g('routes')
  const cogs = -(g('exBuy') + g('crates') + g('wages'))
  const opIncome = sum(f, OPER_IN) + sum(f, OPER_OUT) - g('interestIn') - g('interestOut')
  const interestPaid = -g('interestOut')
  const net = opIncome + g('interestIn') - interestPaid
  const assets = totalAssets(st.close), eq = equity(st.close)
  const opPay = -sum(f, OPER_OUT)
  return {
    gross: ratio(sales - cogs, sales), operating: ratio(opIncome, sales), net: ratio(net, sales),
    roa: ratio(net, assets), roe: ratio(net, eq),
    salesPerEmp: ratio(sales, st.employees), incomePerEmp: ratio(net, st.employees),
    invTurn: ratio(cogs, st.close.inventory), assetTurn: ratio(sales, assets),
    defensive: ratio(currentAssets(st.close), opPay), coverage: ratio(opIncome, interestPaid), debtBld: ratio(st.close.liabilities, st.close.buildings),
  }
}
