import { describe, it, expect } from 'vitest'
import * as P from '../src/game/p2p'

const setup = () => {
  const L = P.emptyLedger()
  P.register(L, 'alice', 'h1', 'A Co', 0); P.register(L, 'bob', 'h2', 'B Co', 0)
  return { L, a: L.accounts.alice, b: L.accounts.bob }
}
describe('p2p ledger', () => {
  it('validates names and auth', () => {
    const { L } = setup()
    expect(P.register(L, 'Alice', 'x', '', 0)).toMatch(/taken/)
    expect(P.register(L, 'a!', 'x', '', 0)).toMatch(/letters/)
    expect(P.auth(L, 'bob', 'nope')).toMatch(/Wrong/)
    expect(typeof P.auth(L, 'BOB', 'h2')).toBe('object')
  })
  it('buy clamps to order size and pays seller minus 3%', () => {
    const { L, a, b } = setup()
    P.deposit(a, 0, [{ res: 'apples', q: 2, qty: 100 }]); P.deposit(b, 1000)
    const o = P.list(L, a, 'apples', 2, 60, 5, 1) as P.Order
    const r = P.buy(L, b, o.id, 1000) as any
    expect(r.qty).toBe(60); expect(b.wallet).toBe(700); expect(a.wallet).toBe(291)
    expect(b.depot['apples|2']).toBe(60); expect(L.orders.length).toBe(0)
  })
  it('refuses overspend, own orders, and returns goods on cancel', () => {
    const { L, a, b } = setup()
    P.deposit(a, 0, [{ res: 'apples', q: 0, qty: 10 }])
    const o = P.list(L, a, 'apples', 0, 10, 50, 1) as P.Order
    expect(P.buy(L, b, o.id, 10)).toMatch(/wallet/)
    expect(P.buy(L, a, o.id, 1)).toMatch(/own/)
    expect(P.cancel(L, b, o.id)).toMatch(/No such/)
    expect(P.cancel(L, a, o.id)).toBe(true); expect(a.depot['apples|0']).toBe(10)
  })
  it('contracts: accept pays, decline returns', () => {
    const { L, a, b } = setup()
    P.deposit(a, 0, [{ res: 'seeds', q: 1, qty: 20 }]); P.deposit(b, 100)
    const c1 = P.offer(L, a, 'bob', 'seeds', 1, 10, 2, 0) as P.Contract
    const c2 = P.offer(L, a, 'bob', 'seeds', 1, 10, 2, 0) as P.Contract
    expect(P.answer(L, a, c1.id, 'accept')).toMatch(/Not your/)
    expect(P.answer(L, b, c1.id, 'accept')).toBe(true)
    expect(b.wallet).toBe(80); expect(a.wallet).toBeCloseTo(19.4)
    expect(P.answer(L, b, c2.id, 'decline')).toBe(true); expect(a.depot['seeds|1']).toBe(10)
  })
  it('grades and ranks', () => {
    const { L, a } = setup()
    a.value = 5e6; a.traded = 1e5; a.trades = 10
    expect(P.leaderboard(L)[0].name).toBe('alice')
    expect(P.grade(P.score(a))).toBe('A')
    expect(P.grade(0)).toBe('C')
  })
})
describe('account deletion', () => {
  it('removes the account, its orders, and returns offers sent to it', () => {
    const L = P.emptyLedger()
    P.register(L, 'alice', 'h1', 'A', 0); P.register(L, 'bob', 'h2', 'B', 0)
    const a = L.accounts.alice, b = L.accounts.bob
    P.deposit(a, 0, [{ res: 'seeds', q: 0, qty: 10 }]); P.deposit(b, 0, [{ res: 'seeds', q: 0, qty: 5 }])
    P.list(L, a, 'seeds', 0, 4, 1, 0); P.offer(L, b, 'alice', 'seeds', 0, 5, 1, 0)
    expect(P.deleteAccount(L, a)).toBe(true)
    expect(L.accounts.alice).toBeUndefined(); expect(L.orders.length).toBe(0); expect(L.contracts.length).toBe(0)
    expect(b.depot['seeds|0']).toBe(5)
  })
})
