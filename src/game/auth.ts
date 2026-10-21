// Client side of accounts (see worker/auth.ts). The session lives in an
// HttpOnly cookie the page can't read, so we ask /api/auth/me who we are.
// "Guest" mode is remembered in localStorage; a guest can create an account
// later and keep their company (the signup sends this browser's cloud id).
import { identity } from './cloud'

export const GUEST_KEY = 'ledgerworks-guest'
export type Me = { name: string } | null

async function call(op: string, body?: unknown) {
  const r = await fetch('/api/auth/' + op, body === undefined ? { credentials: 'same-origin' } : { method: 'POST', credentials: 'same-origin', body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({ error: 'Server error' }))
  if (!r.ok) throw new Error(j.error || 'Request failed')
  return j
}
/** Who is signed in (null if nobody / offline). */
export const me = async (): Promise<Me> => { try { const j = await call('me'); return typeof j?.name === 'string' ? j : null } catch { return null } }
export const login = (name: string, password: string) => call('login', { name, password })
/** Create an account that takes over this browser's cloud save (guest upgrade / legacy cloud key). */
export const signup = (name: string, password: string) => { const { id, token } = identity(); return call('signup', { name, password, cloudId: id, cloudToken: token }) }
export const logout = () => call('logout', {})
export const isGuest = () => localStorage.getItem(GUEST_KEY) === '1'
export const setGuest = (on: boolean) => (on ? localStorage.setItem(GUEST_KEY, '1') : localStorage.removeItem(GUEST_KEY))

/** Permanently delete the signed-in account (server checks session + password). */
export const deleteAccount = (name: string, password: string) => call('delete', { name, password })
/** Guest: delete this browser's cloud saves (proved by its cloud token). */
export async function deleteGuestCloud() {
  const { id, token } = identity()
  const r = await fetch('/api/cloud-delete', { method: 'POST', body: JSON.stringify({ id, token }) })
  if (!r.ok && r.status !== 404) throw new Error((await r.json().catch(() => ({}))).error || 'Delete failed')
}
/** Remove every Ledgerworks key from this browser's localStorage. */
export function clearLocalData() {
  for (const k of Object.keys(localStorage)) if (k.startsWith('ledgerworks-')) localStorage.removeItem(k)
}
