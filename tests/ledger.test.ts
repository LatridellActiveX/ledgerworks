// Money ledger, daily close and financial ratio math (src/game/ledger.ts).
import { describe, it, expect } from 'vitest'
import * as E from '../src/game/engine'
import * as F from '../src/game/finance'
import * as L from '../src/game/ledger'

const lvl = (n: number) => { const s = E.newGame('T', 0); s.xp = E.xpForLevel(n); s.cash = 2e6; L.openBooks(s); return s }
/** Run to the next midnight (one daily close). */
const toMidnight = (s: E.GameState) => E.advanceTo(s, (Math.floor(s.hour / 24) + 1) * 24)

describe('ledger', () => {
  it('books building spend under investing and totals match real cash', () => {
    const s = lvl(10)
    E.construct(s, 0, 'well')
    expect(s.ledgerDay!.buildings).toBeLessThan(0)
    toMidnight(s)
    const st = s.statements!.at(-1)!
    expect(L.cashFlow(st).total).toBeCloseTo(st.closeCash - st.openCash, 6)
    expect(L.cashFlow(st).investing).toBeLessThan(0)
  })
  it('bonds issued are financing, bonds bought are investing', () => {
    const s = lvl(10)
    expect(F.issueBond(s, 1, 0.025)).toBeNull()
    expect(s.ledgerDay!.bondsIssued).toBe(5000)
    const o = s.bondOffers![0]; F.buyBond(s, o.id)
    expect(s.ledgerDay!.bondsBought).toBe(-o.amount)
  })
  it('unbooked cash changes are reconciled into Other', () => {
    const s = lvl(3)
    s.cash += 123 // e.g. a trade-floor transfer
    toMidnight(s)
    expect(s.statements!.at(-1)!.flows.otherIn).toBeCloseTo(123, 6)
  })
  it('old saves start recording at the next close, and history is capped', () => {
    const s = lvl(3); delete s.ledgerDay; delete s.ledgerOpen
    L.book(s, 'retail', 50) // ignored: books not open yet
    toMidnight(s)
    expect(s.statements ?? []).toHaveLength(0)
    expect(s.ledgerDay).toEqual({})
    E.advanceTo(s, s.hour + 24 * (L.HIST_DAYS + 5)) // offline catch-up closes every day
    expect(s.statements).toHaveLength(L.HIST_DAYS)
  })
})

describe('ratios', () => {
  const bal = (o: Partial<L.Balance> = {}): L.Balance => ({ cash: 1000, inventory: 500, bondsHeld: 0, buildings: 2500, liabilities: 1000, rank: 5, ...o })
  const st = (flows: L.DayStatement['flows'], o: Partial<L.Balance> = {}, employees = 4): L.DayStatement =>
    ({ day: 2, fromH: 24, toH: 48, openCash: 0, closeCash: 0, flows, open: bal(), close: bal(o), employees })
  it('margins, returns and turnover', () => {
    const r = L.ratios(st({ retail: 800, exSales: 200, exBuy: -300, wages: -100, fees: -100, interestOut: -50, interestIn: 10 }))
    // sales 1000, cogs 400, op income = 1010 - 550 - 10 + 50 = 500, net = 500 + 10 - 50 = 460
    expect(r.gross).toBeCloseTo(0.6); expect(r.operating).toBeCloseTo(0.5); expect(r.net).toBeCloseTo(0.46)
    expect(r.roa).toBeCloseTo(460 / 4000); expect(r.roe).toBeCloseTo(460 / 3000)
    expect(r.salesPerEmp).toBe(250); expect(r.incomePerEmp).toBe(115)
    expect(r.invTurn).toBeCloseTo(400 / 500); expect(r.assetTurn).toBeCloseTo(1000 / 4000)
    expect(r.defensive).toBeCloseTo(1500 / 550); expect(r.coverage).toBeCloseTo(10); expect(r.debtBld).toBeCloseTo(0.4)
  })
  it('divide by zero gives null (shown as a dash)', () => {
    const r = L.ratios(st({}, { inventory: 0, buildings: 0, cash: 0, liabilities: 0 }, 0))
    for (const v of Object.values(r)) expect(v).toBeNull()
  })
})
