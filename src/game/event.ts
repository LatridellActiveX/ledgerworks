// --------------------------------------------------------------------------
// Live events: fixed real-time windows that apply to every player.
//
// An event is defined ONCE here (id, name, multiplier, start and end as ISO
// UTC times). Nothing is stored in saves: every client compares the real
// clock with this window, so all players get it at the same moment and old
// saves need no migration.
//
// Turbo Week (decided with Parker): 3x speed for PRODUCTION jobs (factories
// and farm crops growing) and STORE SELLING jobs only. Prices, wages, input
// costs, research and construction are NOT changed. Wages are paid per run
// when a job starts (based on its normal length), so a run costs the same and
// simply finishes 3x sooner; per-unit costs stay the same.
// --------------------------------------------------------------------------
import { GAME_SPEED } from './engine-constants'

export interface LiveEvent { id: string; name: string; icon: string; mult: number; start: string; end: string; blurb: string }

/** The one place the event is configured. */
export const EVENT: LiveEvent = {
  id: 'turbo-week-2026-10',
  name: 'Turbo Week',
  icon: '⚡',
  mult: 3,
  start: '2026-10-24T00:48:00Z', // approval time (Fri Oct 23, 8:48 PM EDT); exactly one week
  end: '2026-10-31T00:48:00Z', // Fri Oct 30, 8:48 PM EDT
  blurb: 'All production and store selling runs 3× faster for everyone. Prices, wages and research are unchanged.',
}

const startMs = (e: LiveEvent) => Date.parse(e.start)
const endMs = (e: LiveEvent) => Date.parse(e.end)

/** Is the event running at real time `t` (ms)? Start inclusive, end exclusive. */
export const isLive = (t: number, e: LiveEvent = EVENT) => t >= startMs(e) && t < endMs(e)
/** Job-speed multiplier at real time `t`: e.mult inside the window, else 1. */
export const speedAt = (t: number, e: LiveEvent = EVENT) => (isLive(t, e) ? e.mult : 1)
/** Real ms left in the event (0 when not live). */
export const msLeft = (t: number, e: LiveEvent = EVENT) => (isLive(t, e) ? endMs(e) - t : 0)

/**
 * Split the real interval [from, to) at the event's start and end, so offline
 * catch-up can run each piece at its own speed. Returns pieces in time order
 * with their multiplier; empty pieces are dropped.
 */
export function splitWindow(from: number, to: number, e: LiveEvent = EVENT): { from: number; to: number; mult: number }[] {
  if (!(to > from)) return []
  const cuts = [from, ...[startMs(e), endMs(e)].filter(c => c > from && c < to), to]
  const out: { from: number; to: number; mult: number }[] = []
  for (let i = 0; i + 1 < cuts.length; i++) out.push({ from: cuts[i], to: cuts[i + 1], mult: speedAt(cuts[i], e) })
  return out
}

/** Did the event start / end during (from, to]? Used for the in-game notices. */
export const crossed = (from: number, to: number, e: LiveEvent = EVENT) => ({
  started: from < startMs(e) && to >= startMs(e),
  ended: from < endMs(e) && to >= endMs(e),
})

/**
 * Game hours a job still needs, given `work` game hours of normal-speed work
 * left, at real time `now`. Inside the window work goes `mult` times faster,
 * but only until the window closes, after which it is back to normal speed.
 */
export function boostedLeft(work: number, now: number, e: LiveEvent = EVENT): number {
  if (work <= 0) return 0
  const m = speedAt(now, e)
  if (m === 1) return work
  const winH = (msLeft(now, e) / 3600000) * GAME_SPEED // game hours left in the window
  return work <= m * winH ? work / m : winH + (work - m * winH)
}

/** Short countdown, e.g. "6d 23h", "4h 12m", "9m". */
export function countdown(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60)
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m % 60}m` : `${m % 60}m`
}
