// Guest save cleanup timing (worker/cleanup.ts).
import { describe, it, expect } from 'vitest'
import { guestCutoff, isCleanupSlot, GUEST_CLEANUP_SQL } from '../worker/cleanup'
describe('guest save cleanup', () => {
  it('keeps 90 days', () => { const now = Date.UTC(2026, 9, 21); expect(now - guestCutoff(now)).toBe(90 * 86400000) })
  it('runs once a day', () => {
    const slots = Array.from({ length: 96 }, (_, i) => Date.UTC(2026, 9, 21, 0, i * 15)).filter(isCleanupSlot)
    expect(slots.length).toBe(1)
  })
  it('never deletes account saves', () => { expect(GUEST_CLEANUP_SQL).toContain('NOT IN (SELECT player_id FROM users)'); expect(GUEST_CLEANUP_SQL).toContain("'-s'") })
})
