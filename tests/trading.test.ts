// Contracts (multi-item, no fee, expiry) and the bond board (list, buy, move in).
import { describe, it, expect } from 'vitest'
import * as P from '../src/game/p2p'

const setup = () => {
  const L = P.emptyLedger()
  P.register(L, 'alice', 'h1', 'A Co', 0); P.register(L, 'bob', 'h2', 'B Co', 0)
  return { L, a: L.accounts.alice, b: L.accounts.bob }
}
const DAY = 24 * 60 * 60 * 1000

describe('contracts', () => {
  it('takes several item lines and one total, with no fee', () => {
    const { L, a, b } = setup()
    P.deposit(a, 0, [{ res: 'seeds', q: 0, qty: 10 }, { res: 'apples', q: 2, qty: 5 }]); P.deposit(b, 500)
    const c = P.offer(L, a, 'bob', [{ res: 'seeds', q: 0, qty: 10 }, { res: 'apples', q: 2, qty: 5 }], 100, 'Bulk order', 0) as P.Contract
    expect(typeof c).toBe('object')
    expect(c.lines.length).toBe(2)
    expect(a.depot['seeds|0']).toBeUndefined()
    expect(P.answer(L, b, c.id, 'accept', 0)).toBe(true)
    expect(a.wallet).toBe(100) // seller gets the whole total
    expect(b.wallet).toBe(400)
    expect(b.depot['apples|2']).toBe(5); expect(b.depot['seeds|0']).toBe(10)
  })
  it('rejects bad items, short depots, too many lines and self offers', () => {
    const { L, a } = setup()
    P.deposit(a, 0, [{ res: 'seeds', q: 0, qty: 3 }])
    expect(P.offer(L, a, 'bob', [{ res: 'seeds', q: 0, qty: 9 }], 5, '', 0)).toMatch(/Not enough/)
    expect(P.offer(L, a, 'bob', [], 5, '', 0)).toMatch(/Add 1 to 5/)
    expect(P.offer(L, a, 'bob', Array.from({ length: 6 }, () => ({ res: 'seeds', q: 0, qty: 1 })), 5, '', 0)).toMatch(/Add 1 to 5/)
    expect(P.offer(L, a, 'alice', [{ res: 'seeds', q: 0, qty: 1 }], 5, '', 0)).toMatch(/Unknown/)
    expect(P.offer(L, a, 'bob', [{ res: 'seeds', q: 0, qty: 1.5 }], 5, '', 0)).toMatch(/whole/)
  })
  it('cleans the note and caps it', () => {
    const { L, a } = setup()
    P.deposit(a, 0, [{ res: 'seeds', q: 0, qty: 5 }])
    const c = P.offer(L, a, 'bob', [{ res: 'seeds', q: 0, qty: 1 }], 0, '  hi\n\tthere  ' + 'x'.repeat(300), 0) as P.Contract
    expect(c.note.startsWith('hi there')).toBe(true)
    expect(c.note.length).toBe(P.MAX_NOTE)
  })
  it('withdrawing or expiring returns every line to the sender', () => {
    const { L, a, b } = setup()
    P.deposit(a, 0, [{ res: 'seeds', q: 0, qty: 10 }, { res: 'apples', q: 1, qty: 4 }])
    const c = P.offer(L, a, 'bob', [{ res: 'seeds', q: 0, qty: 10 }, { res: 'apples', q: 1, qty: 4 }], 9, '', 0) as P.Contract
    expect(P.answer(L, a, c.id, 'cancel', 0)).toBe(true)
    expect(a.depot['seeds|0']).toBe(10); expect(a.depot['apples|1']).toBe(4)
    const d = P.offer(L, a, 'bob', [{ res: 'seeds', q: 0, qty: 2 }], 1, '', 0) as P.Contract
    P.sweepContracts(L, d.expires - 1); expect(L.contracts.length).toBe(1)
    P.sweepContracts(L, d.expires)
    expect(L.contracts.length).toBe(0); expect(a.depot['seeds|0']).toBe(10)
    expect(b.depot['seeds|0']).toBeUndefined()
  })
  it('a contract lasts seven days', () => {
    const { L, a } = setup()
    P.deposit(a, 0, [{ res: 'seeds', q: 0, qty: 1 }])
    const c = P.offer(L, a, 'bob', [{ res: 'seeds', q: 0, qty: 1 }], 1, '', 0) as P.Contract
    expect(c.expires).toBe(7 * DAY)
  })
  it('turns contracts saved in the old one-item shape into the new shape', () => {
    const { L, a } = setup()
    L.contracts.push({ id: 90, from: 'alice', to: 'bob', res: 'seeds', q: 0, qty: 4, price: 2, ts: 1000 } as any)
    P.sweepContracts(L, 2000)
    expect(L.contracts[0].lines).toEqual([{ res: 'seeds', q: 0, qty: 4 }])
    expect(L.contracts[0].total).toBe(8)
    expect(L.contracts[0].expires).toBe(1000 + P.CONTRACT_TTL_MS)
    expect(a).toBeDefined()
  })
})

const bond = { issuer: 'Pebble & Pine', rating: 'BBB', amount: 10000, rate: 0.01 }
describe('bonds', () => {
  it('deposits, lists, cancels and withdraws a bond', () => {
    const { L, a } = setup()
    const c = P.depositBond(L, a, bond) as P.BondCert
    expect(typeof c).toBe('object')
    expect(a.bonds!.length).toBe(1)
    const l = P.listBond(L, a, c.id, 9500, 0) as P.BondListing
    expect(a.bonds!.length).toBe(0)
    expect(P.bondBoard(L)[0].price).toBe(9500)
    expect(P.cancelBond(L, a, l.id)).toBe(true)
    expect(a.bonds!.length).toBe(1)
    expect(P.withdrawBond(a, c.id)).toMatchObject({ amount: 10000, issuer: 'Pebble & Pine' })
    expect(a.bonds!.length).toBe(0)
  })
  it('buy pays the list price less the board fee, and the bond goes to the buyer box', () => {
    const { L, a, b } = setup()
    P.deposit(b, 20000)
    const c = P.depositBond(L, a, bond) as P.BondCert
    P.listBond(L, a, c.id, 9500, 0)
    const got = P.buyBond(L, b, L.bondOrders![0].id) as P.BondCert
    expect(got).toMatchObject({ rate: 0.01 })
    expect(b.wallet).toBe(10500)
    expect(a.wallet).toBeCloseTo(9500 * 0.97)
    expect(b.bonds!.length).toBe(1)
    expect(L.bondOrders!.length).toBe(0)
  })
  it('refuses own listings, overspend and gone bonds', () => {
    const { L, a, b } = setup()
    const c = P.depositBond(L, a, bond) as P.BondCert
    const l = P.listBond(L, a, c.id, 9500, 0) as P.BondListing
    expect(P.buyBond(L, a, l.id)).toMatch(/own/)
    expect(P.buyBond(L, b, l.id)).toMatch(/wallet/)
    expect(P.buyBond(L, b, 999)).toMatch(/gone/)
  })
  it('validates bond terms', () => {
    const { L, a } = setup()
    expect(P.depositBond(L, a, { ...bond, rate: 0.5 })).toMatch(/rate/)
    expect(P.depositBond(L, a, { ...bond, amount: 1.5 })).toMatch(/amount/)
    expect(P.depositBond(L, a, { ...bond, issuer: '' })).toMatch(/issuer/)
  })
  it('deleting an account drops its bond box and listings', () => {
    const { L, a } = setup()
    P.depositBond(L, a, bond); const c = P.depositBond(L, a, bond) as P.BondCert
    P.listBond(L, a, c.id, 9000, 0)
    P.deleteAccount(L, a)
    expect(L.bondOrders!.length).toBe(0)
  })
})
