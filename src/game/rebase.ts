// Price re-basing. When a good's basePrice changes in data.ts (for example the
// Oct 2026 fruit rebalance), any price that was anchored to the OLD base -- a
// save's reference prices and chart history, computer-trader asks, and the
// shared server market -- would otherwise crawl toward the new base at ~10% a
// day (and sit clamped at 0.6x base meanwhile). Instead we remember which base
// each price was anchored to and, when it differs, scale the price by
// new/old once so markets jump straight to the new level while keeping their
// current drift (a good 20% above its old base stays 20% above its new one).
// Player-placed orders are never touched: those prices are the player's own.
import { RES, RESOURCES } from './data'

/**
 * Bases in use before anchors were stored. Saves and server state that have
 * no anchor map were built on these; every other good is assumed unchanged.
 */
export const LEGACY_BASE: Record<string, number> = { apples: 1.6, berries: 2.0, juice: 3.8, jam: 6 }

/** Current base for every good: the anchor map we store after re-basing. */
export const currentBases = () => Object.fromEntries(RESOURCES.map(r => [r.id, r.basePrice]))

/**
 * new/old scale factor per good whose base moved since `anchors` was saved
 * (undefined anchors = a pre-anchor save, so LEGACY_BASE applies). Goods that
 * did not move are left out, so an empty result means "nothing to do".
 */
export function rebaseFactors(anchors: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of RESOURCES) {
    const old = anchors ? anchors[r.id] : LEGACY_BASE[r.id]
    if (old && old > 0 && Math.abs(old - r.basePrice) > 1e-9) out[r.id] = r.basePrice / old
  }
  return out
}

/** Scale a map of reference prices in place by the factors. */
export function rebaseRef(ref: Record<string, number>, f: Record<string, number>) {
  for (const [id, k] of Object.entries(f)) if (ref[id] != null) ref[id] = Math.round(ref[id] * k * 100) / 100
}

/** True if a good still exists (guards against removed ids in old saves). */
export const known = (id: string) => !!RES[id]
