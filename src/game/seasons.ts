// ============================================================================
// Seasons realm (stage 12).
//
// A second, separate world, picked on the start screen. It runs in timed
// seasons on the shared world clock, so every player is in the same season:
//  - One season = 4 phases of 7 game days = 28 game days (7 real days at 4x).
//  - Spring: farms grow 25% faster.   Summer: shops sell 20% faster.
//    Autumn: food sells 15% faster, farms 10% slower.
//    Winter: farms 30% slower; energy goods sell 30% faster.
//  - When a season ends, the company's final value is recorded and the player
//    starts fresh in the next season. Classic realm saves are never touched.
// ============================================================================
import { GAME_SPEED } from './engine-constants'

export type Realm = 'classic' | 'seasons'
export type SeasonPhase = 'spring' | 'summer' | 'autumn' | 'winter'
export const PHASES: SeasonPhase[] = ['spring', 'summer', 'autumn', 'winter']
export const PHASE_DAYS = 7
export const SEASON_DAYS = PHASE_DAYS * PHASES.length

/** Real moment that counts as world hour 0 (shared with the server's market object). */
export const EPOCH = Date.UTC(2026, 9, 21)
export const worldHour = (now = Date.now()) => ((now - EPOCH) / 3600000) * GAME_SPEED

export function seasonAt(now = Date.now()) {
  const day = Math.max(0, Math.floor(worldHour(now) / 24))
  const no = Math.floor(day / SEASON_DAYS) + 1
  const inSeason = day % SEASON_DAYS
  return { no, phase: PHASES[Math.floor(inSeason / PHASE_DAYS)], day: inSeason + 1, daysLeft: SEASON_DAYS - inSeason }
}

const FARM = new Set(['orchard', 'barnyard', 'plantation', 'ranch'])
const ENERGY = new Set(['power', 'fuel', 'skyfuel', 'gas', 'heavy', 'solar'])

/** Production speed multiplier for a building type in a season phase. */
export function seasonProd(type: string, phase?: SeasonPhase) {
  if (!phase || !FARM.has(type)) return 1
  return phase === 'spring' ? 1.25 : phase === 'autumn' ? 0.9 : phase === 'winter' ? 0.7 : 1
}
/** Retail speed multiplier for a good in a season phase. */
export function seasonRetail(res: string, store: string | undefined, phase?: SeasonPhase) {
  if (!phase) return 1
  if (phase === 'summer') return 1.2
  if (phase === 'autumn' && store === 'market') return 1.15
  if (phase === 'winter' && ENERGY.has(res)) return 1.3
  return 1
}
export const PHASE_NOTE: Record<SeasonPhase, string> = {
  spring: 'Spring: farms grow 25% faster',
  summer: 'Summer: every shop sells 20% faster',
  autumn: 'Autumn: food sells 15% faster, farms 10% slower',
  winter: 'Winter: farms 30% slower, energy sells 30% faster',
}

// ---- which realm this browser plays; each realm has its own save ----
const REALM_KEY = 'ledgerworks-realm'
export const realm = (): Realm => (typeof localStorage !== 'undefined' && localStorage.getItem(REALM_KEY) === 'seasons' ? 'seasons' : 'classic')
export const setRealm = (r: Realm) => localStorage.setItem(REALM_KEY, r)
