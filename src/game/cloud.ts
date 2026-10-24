// ============================================================================
// Talking to the Ledgerworks Worker.
//  - Each browser gets a random player id + secret token (localStorage).
//    Together they form a "cloud key" you can paste on another device.
//  - syncWorld(): pull shared reference prices from the server's market
//    object and push how much we sold on the exchange since last time.
//  - cloudSave()/cloudLoad(): full GameState in D1.
// All calls fail quietly when offline; the game keeps running locally.
// ============================================================================
import type { GameState } from './engine'
import { migrate } from './save'
import { realm } from './seasons'
import { setEventEnd } from './event'
/** Cloud row id: the seasons realm gets its own row so it never overwrites a classic save. */
const rowId = (id: string) => (realm() === 'seasons' ? id + '-s' : id)

const ID_KEY = 'ledgerworks-cloud-id'
const rid = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('')

/** This browser's identity, created on first use. */
export function identity(): { id: string; token: string } {
  const raw = localStorage.getItem(ID_KEY)
  if (raw) return JSON.parse(raw)
  const me = { id: rid(), token: rid() }
  localStorage.setItem(ID_KEY, JSON.stringify(me))
  return me
}
export const cloudKey = () => { const m = identity(); return `${m.id}.${m.token}` }
export function useCloudKey(key: string) {
  const [id, token] = key.trim().split('.')
  if (!id || !token) throw new Error('Not a cloud key')
  localStorage.setItem(ID_KEY, JSON.stringify({ id, token }))
}

/** Units sold on the exchange already reported, so we only send the change. */
let reported: Record<string, number> = {}

/** Pull shared prices into the state (mutates it). Returns true if online. */
export async function syncWorld(s: GameState): Promise<boolean> {
  try {
    const delta: Record<string, number> = {}
    for (const [k, v] of Object.entries(s.exSold)) { const d = v - (reported[k] ?? 0); if (d > 0) delta[k] = d }
    if (Object.keys(delta).length) {
      await fetch('/api/report', { method: 'POST', body: JSON.stringify({ sold: delta }) })
      reported = { ...s.exSold }
    }
    const w = await (await fetch('/api/world')).json()
    s.ref = { ...s.ref, ...w.ref }
    s.online = true
    if (w.phase) s.phase = w.phase // stage 7: shared economy phase
    setEventEnd(w.eventEnd) // event ended/extended on the server
    return true
  } catch { s.online = false; return false }
}
/** Call after a local day roll so the "reported" baseline matches. */
export const resetReported = () => { reported = {} }

export async function cloudSave(s: GameState): Promise<string | null> {
  try {
    const { id, token } = identity()
    const r = await fetch('/api/save', { method: 'POST', body: JSON.stringify({ id: rowId(id), token, seasons: realm() === 'seasons', state: { ...s, level: undefined } }) })
    return r.ok ? null : (await r.json()).error
  } catch { return 'Offline' }
}
export async function cloudLoad(): Promise<GameState> {
  const { id, token } = identity()
  const r = await fetch('/api/load', { method: 'POST', body: JSON.stringify({ id: rowId(id), token, seasons: realm() === 'seasons' }) })
  if (!r.ok) throw new Error((await r.json()).error)
  return migrate(await r.json())
}

/** A change support made to this company (cash given/taken, or a fresh start). */
export type InboxItem = { kind: 'cash' | 'reset'; amount: number }
/**
 * Fetch (and clear) pending support changes for this player. Classic realm
 * only; the server knows the player from the session or the cloud key.
 */
export async function pullInbox(): Promise<InboxItem[]> {
  if (realm() !== 'classic') return []
  try {
    const { id, token } = identity()
    const r = await fetch('/api/inbox', { method: 'POST', credentials: 'same-origin', body: JSON.stringify({ id, token }) })
    return r.ok ? ((await r.json()).items ?? []) : []
  } catch { return [] }
}
/** Report an error to the server log (message only), at most 5 per page load. */
let errSent = 0
export function reportError(msg: string, src = 'client') {
  if (errSent++ >= 5) return
  fetch('/api/error', { method: 'POST', body: JSON.stringify({ msg: String(msg).slice(0, 300), src }) }).catch(() => {})
}
