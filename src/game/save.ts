// Browser saves: the whole GameState is JSON in localStorage, plus a
// copy/paste save code (base64 of the JSON) for moving between browsers.
import { newGame, type GameState } from './engine'
import { seedHistory } from './market'

import { realm, seasonAt, type Realm } from './seasons'

export const SAVE_KEY = 'ledgerworks-save-v1'
/** Each realm keeps its own save; the classic key is unchanged so old saves load. */
export const saveKey = (r: Realm = realm()) => (r === 'seasons' ? SAVE_KEY + '-seasons' : SAVE_KEY)
/** A fresh company for a realm (seasons companies remember their season number). */
export function freshGame(company = 'My Company', r: Realm = realm(), now = Date.now()) {
  const s = newGame(company, now)
  if (r === 'seasons') { const se = seasonAt(now); s.realm = 'seasons'; s.season = se.no; s.seasonPhase = se.phase; s.log = [`Welcome to Season ${se.no}!`] }
  return s
}

/** Minimal storage interface so tests can pass a fake. */
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export function saveGame(s: GameState, store: KV = localStorage) { store.setItem(saveKey(s.realm ?? 'classic'), JSON.stringify(s)) }

export function loadGame(store: KV = localStorage): GameState {
  const r = realm()
  const raw = store.getItem(saveKey(r))
  if (!raw) return freshGame('My Company', r)
  try { return migrate(JSON.parse(raw)) } catch { return freshGame('My Company', r) }
}

/** Fill in fields added after a save was written, so old saves keep loading. */
export function migrate(s: any): GameState {
  const fresh = newGame(s.company ?? 'My Company')
  const out = { ...fresh, ...s, version: 1 } as GameState
  seedHistory(out) // older saves get a chart history too
  return out
}

export const exportCode = (s: GameState) => 'LW1:' + btoa(unescape(encodeURIComponent(JSON.stringify(s))))
export function importCode(code: string): GameState {
  if (!code.startsWith('LW1:')) throw new Error('Not a Ledgerworks save code')
  return migrate(JSON.parse(decodeURIComponent(escape(atob(code.slice(4))))))
}
