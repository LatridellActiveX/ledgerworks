// Activity state for a building: what the campus and panels show while a
// building is producing, selling, idle or just finished. Pure and side-effect
// free so it can be unit-tested and shared by the 3D view, 2D view and panels.
import type { Building, GameState } from './engine'
import * as E from './engine'

/** Visual state of one building. */
export type ActState = 'make' | 'sell' | 'idle' | 'build' | 'done'

export interface Activity {
  state: ActState
  /** Job progress 0..1 (0 when idle). */
  prog: number
  /** Product being made or sold ('' when idle). */
  res: string
  /** Whole units made/sold so far, and the job total. */
  done: number
  total: number
  /** Revenue earned so far in cents (selling only), for the live counter. */
  cents: number
}

/** Work out the activity state of a building at the current game hour. */
export function activityOf(s: GameState, bd: Building | null): Activity | null {
  if (!bd) return null
  const j = bd.job
  if (!j) return { state: 'idle', prog: 0, res: '', done: 0, total: 0, cents: 0 }
  if (j.kind === 'build') return { state: 'build', prog: 0, res: '', done: 0, total: 0, cents: 0 }
  // Progress by time, clamped; units by the same integer rule collection uses.
  const prog = Math.max(0, Math.min(1, (s.hour - j.startH) / Math.max(1e-9, j.endH - j.startH)))
  const done = E.unitsDone(j, s.hour)
  const cents = j.kind === 'sell' ? Math.floor((E.saleCents(j) * done) / j.qty) : 0
  return { state: prog >= 1 ? 'done' : j.kind, prog, res: j.res, done, total: j.qty, cents }
}

/** Short label for the status chip. */
export const chipLabel: Record<ActState, string> = { make: 'Producing', sell: 'Selling', idle: 'Idle', build: 'Building', done: 'Done' }
