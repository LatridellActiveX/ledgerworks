// Player search + public profiles: only public fields, rate limit.
import { describe, it, expect } from 'vitest'
import * as P from '../src/game/p2p'
import { allow, RATE_MAX, valueFromState } from '../worker/players'
const L = P.emptyLedger()
P.register(L, 'alice', 'h1', 'Apple Works', 1); P.register(L, 'bob', 'h2', 'Bobs Bricks', 2)
L.accounts.alice.value = 5e6; L.accounts.alice.owner = 'alice_game'
describe('player search', () => {
  it('finds by trader name, linked username and company', () => {
    expect(P.searchAccounts(L, 'ali').map(p => p.name)).toEqual(['alice'])
    expect(P.searchAccounts(L, 'game').map(p => p.name)).toEqual(['alice'])
    expect(P.searchAccounts(L, 'bricks').map(p => p.name)).toEqual(['bob'])
    expect(P.searchAccounts(L, 'a')).toEqual([]) // too short
  })
  it('returns public fields only', () => {
    const c = P.searchAccounts(L, 'alice')[0] as any
    expect(Object.keys(c).sort()).toEqual(['company', 'grade', 'name', 'owner', 'value'])
    const pr = P.publicProfile(L, 'alice_game') as any
    expect(pr.rank).toBe(1); expect(pr.hash).toBeUndefined(); expect(pr.wallet).toBeUndefined(); expect(pr.depot).toBeUndefined()
  })
  it('rate limits per client', () => {
    for (let i = 0; i < RATE_MAX; i++) expect(allow('k', 1000)).toBe(true)
    expect(allow('k', 1000)).toBe(false)
    expect(allow('k', 1000 + 61_000)).toBe(true)
  })
  it('reads value from a save', () => { expect(valueFromState(JSON.stringify({ valueHist: [{ h: 1, v: 10 }, { h: 2, v: 42 }] }))).toBe(42) })
})
