// ============================================================================
// Housekeeping run from the cron trigger (worker/index.ts `scheduled`).
//
// Guest cloud saves (no account owns them) that haven't been saved for
// GUEST_SAVE_DAYS days are deleted. Account saves are never touched: a row is
// kept if its player id (or its "-s" seasons twin) belongs to a user.
// The cron fires every 15 minutes; this only runs in the first slot after
// 04:00 UTC so it happens once a day.
// ============================================================================
export const GUEST_SAVE_DAYS = 90
const DAY = 86400000

/** Oldest `updated` time a guest save may have and still be kept. */
export const guestCutoff = (now: number) => now - GUEST_SAVE_DAYS * DAY
/** True for the one cron slot per day that runs the cleanup. */
export const isCleanupSlot = (now: number) => { const d = new Date(now); return d.getUTCHours() === 4 && d.getUTCMinutes() < 15 }

/** Deletes old guest saves; rows owned by an account are excluded in SQL. */
export const GUEST_CLEANUP_SQL = `DELETE FROM saves WHERE updated < ?
  AND player_id NOT IN (SELECT player_id FROM users)
  AND player_id NOT IN (SELECT player_id || '-s' FROM users)`

export async function cleanupGuestSaves(env: { DB: D1Database }, now = Date.now()) {
  const r = await env.DB.prepare(GUEST_CLEANUP_SQL).bind(guestCutoff(now)).run()
  return r.meta?.changes ?? 0
}
