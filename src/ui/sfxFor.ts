// Which sound effect fits a change in the game? Pure functions (no audio),
// so the choice is unit-tested. App.tsx plays the result with sfx().
import * as E from '../game/engine'
import type { Sfx } from './sound'
import { boardSize } from '../game/execs'
import { dayOf, storyStarting } from '../game/news'

/** Departures + arrivals so far: carts on the road count once, finished trips twice. */
const cartMoves = (s: E.GameState) => (s.routes ?? []).reduce((n, r) => n + 2 * r.trips + (r.trip ? 1 : 0), 0)
const stockTotal = (s: E.GameState) => Object.values(s.stock ?? {}).reduce((a, n) => a + (Number(n) || 0), 0)
const leveledUp = (a: E.GameState, b: E.GameState) => E.companyLevel(b.xp) === E.companyLevel(a.xp) + 1

/** Sound for a player action that turned `a` into `b` (err = its error message). */
export function actionSfx(a: E.GameState, b: E.GameState, err?: string | null | void): Sfx {
  if (err) return 'error'
  if (leveledUp(a, b)) return 'levelup'
  if (boardSize(b) > boardSize(a)) return 'hire' // a new executive joined
  for (let i = 0; i < Math.max(a.plots.length, b.plots.length); i++) {
    const p = a.plots[i], n = b.plots[i]
    if (!p && n) return 'build' // new construction
    if (p && !n) return 'tap' // scrapped
    if (!p || !n || p.uid !== n.uid) continue
    if (n.level > p.level) return 'upgrade' // upgrade started
    if (!p.job && n.job) return n.job.kind === 'make' ? 'produce' : n.job.kind === 'sell' ? 'sell' : 'build'
    if (p.job && !n.job) return p.job.kind === 'build' ? 'upgrade' : 'done' // rushed / stopped
    if (p.job && n.job && p.job.kind !== 'build' && n.job.kind === p.job.kind && ((n.job as any).got ?? 0) > ((p.job as any).got ?? 0))
      return n.job.kind === 'make' ? 'collect' : 'coin' // collected goods / store earnings
  }
  const dc = b.cash - a.cash, ds = stockTotal(b) - stockTotal(a)
  if (dc < 0 && ds > 0) return 'buy'
  if (ds < 0 && dc >= 0) return 'sell' // quick sell, listing, contract delivery
  if (dc > 0) return 'coin'
  return 'tap'
}

/** Sound for the clock moving on by itself (jobs finishing, level ups), or null. */
export function tickSfx(a: E.GameState, b: E.GameState): Sfx | null {
  if (a.company !== b.company || b.hour < a.hour) return null // a different save was loaded
  if (leveledUp(a, b)) return 'levelup'
  let out: Sfx | null = null
  a.plots.forEach((p, i) => {
    const n = b.plots[i]
    if (!p?.job || !n || n.uid !== p.uid || n.job) return
    if (b.hour + 1e-9 < p.job.endH) return // stopped, not finished
    if (p.job.kind === 'build') out = 'upgrade'
    else if (out !== 'upgrade') out = 'done'
  })
  // A standing buy order filled on the Exchange (see game/bids.ts).
  if (!out && (b.bidFills ?? 0) > (a.bidFills ?? 0)) return 'order'
  // A trade-route cart left or arrived (see game/routes.ts).
  if (!out && cartMoves(b) !== cartMoves(a)) return 'cart'
  // A new market news story broke while the clock ran (only when nothing louder played).
  if (!out && dayOf(b.hour) > dayOf(a.hour) && storyStarting(dayOf(b.hour))) return 'news'
  return out
}
