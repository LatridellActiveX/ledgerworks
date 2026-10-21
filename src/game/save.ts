// Browser saves: the whole GameState is JSON in localStorage, plus a
// copy/paste save code (base64 of the JSON) for moving between browsers.
import { newGame, type GameState } from './engine'

export const SAVE_KEY = 'ledgerworks-save-v1'

/** Minimal storage interface so tests can pass a fake. */
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export function saveGame(s: GameState, store: KV = localStorage) { store.setItem(SAVE_KEY, JSON.stringify(s)) }

export function loadGame(store: KV = localStorage): GameState {
  const raw = store.getItem(SAVE_KEY)
  if (!raw) return newGame()
  try { return migrate(JSON.parse(raw)) } catch { return newGame() }
}

/** Fill in fields added after a save was written, so old saves keep loading. */
export function migrate(s: any): GameState {
  const fresh = newGame(s.company ?? 'My Company')
  return { ...fresh, ...s, version: 1 }
}

export const exportCode = (s: GameState) => 'LW1:' + btoa(unescape(encodeURIComponent(JSON.stringify(s))))
export function importCode(code: string): GameState {
  if (!code.startsWith('LW1:')) throw new Error('Not a Ledgerworks save code')
  return migrate(JSON.parse(decodeURIComponent(escape(atob(code.slice(4))))))
}
