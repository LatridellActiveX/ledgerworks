// Shared constants with no imports (safe to use from any module).

/**
 * Game hours per real hour. The game now runs in REAL TIME (1x): a 3-hour job
 * takes 3 real hours. It used to be 4x (LEGACY_SPEED) until SPEED_SWITCH_AT.
 */
export const GAME_SPEED = 1
/** The old acceleration, kept for converting saves and the shared world clock. */
export const LEGACY_SPEED = 4
/** Real moment the world clock switched from 4x to 1x (2026-10-21 07:00 UTC). */
export const SPEED_SWITCH_AT = Date.UTC(2026, 9, 21, 7, 0)
/** Save clock version: 1 = timestamps are on the 1x clock. */
export const CLOCK_VERSION = 1
