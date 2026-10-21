// Trade floor sign-in with the game session (p2p.sessionAccount).
import { describe, it, expect } from 'vitest'
import * as P from '../src/game/p2p'
describe('trade floor session auth', () => {
  it('creates a trading account named after the user on first open', () => {
    const L = P.emptyLedger()
    const r = P.sessionAccount(L, 'parker', null, 'Thomson Co', 1, 'rnd')
    expect(r.created).toBe(true); expect(r.a.name).toBe('parker'); expect(r.a.owner).toBe('parker')
    expect(P.sessionAccount(L, 'parker', null, 'x', 2, 'rnd2').a).toBe(r.a) // same account next time
  })
  it('auto-links a legacy key account the browser holds', () => {
    const L = P.emptyLedger(); P.register(L, 'oldtrader', 'keyhash', 'Old Co', 1)
    const r = P.sessionAccount(L, 'parker', { name: 'oldtrader', hash: 'keyhash' }, 'Thomson Co', 2, 'rnd')
    expect(r.linked).toBe(true); expect(r.a.name).toBe('oldtrader'); expect(L.accounts.oldtrader.owner).toBe('parker')
  })
  it('refuses to link with a wrong key, or one already linked to someone else', () => {
    const L = P.emptyLedger(); P.register(L, 'oldtrader', 'keyhash', 'Old Co', 1)
    expect(P.sessionAccount(L, 'eve', { name: 'oldtrader', hash: 'bad' }, 'E', 2, 'r').a.name).toBe('eve')
    P.sessionAccount(L, 'parker', { name: 'oldtrader', hash: 'keyhash' }, 'T', 3, 'r')
    expect(P.sessionAccount(L, 'mallory', { name: 'oldtrader', hash: 'keyhash' }, 'M', 4, 'r').a.name).toBe('mallory')
  })
  it('never takes over a legacy trader that shares the username', () => {
    const L = P.emptyLedger(); P.register(L, 'parker', 'someone-elses', 'Other', 1)
    const r = P.sessionAccount(L, 'parker', null, 'Thomson Co', 2, 'rnd')
    expect(r.a.name).toBe('parker_2'); expect(L.accounts.parker.owner).toBeUndefined()
  })
})
