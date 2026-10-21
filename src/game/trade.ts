// ============================================================================
// Client side of player-to-player trading (stage 11).
// The account (username + cloud key) is kept in localStorage. Every call goes
// to /api/p2p/<op>, where the shared Durable Object checks the key and
// applies the change. See src/game/p2p.ts for the rules.
// ============================================================================
import type { GameState } from './engine'
import { valueBreakdown } from './value'

const ACC_KEY = 'ledgerworks-account'
export interface Acc { name: string; key: string }
export const account = (): Acc | null => { try { return JSON.parse(localStorage.getItem(ACC_KEY) || 'null') } catch { return null } }
export const setAccount = (a: Acc | null) => (a ? localStorage.setItem(ACC_KEY, JSON.stringify(a)) : localStorage.removeItem(ACC_KEY))
/** "name:key", pasted on another device to sign in. */
export const accountKey = (a: Acc) => `${a.name}:${a.key}`
export function parseAccountKey(t: string): Acc | null {
  const [name, key] = t.trim().split(':'); return name && key ? { name, key } : null
}

/** POST to the trade API. Throws with the server's message on failure. */
export async function p2p(op: string, body: Record<string, unknown> = {}): Promise<any> {
  const a = account()
  const r = await fetch('/api/p2p/' + op, { method: 'POST', body: JSON.stringify({ ...a, ...body }) })
  const j = await r.json().catch(() => ({ error: 'Server error' }))
  if (!r.ok || j.error) throw new Error(j.error || 'Server error')
  return j
}

/** Company value (same formula everywhere; see game/value.ts). */
export const companyValue = (s: GameState) => valueBreakdown(s).total
