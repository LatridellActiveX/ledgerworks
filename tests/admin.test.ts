// Internal tools: request validation and event-end maths (worker/admin.ts).
import { describe, expect, it } from 'vitest'
import { newEventEnd, parseTool } from '../worker/admin'

describe('admin tool validation', () => {
  it('requires explicit confirmation', () => {
    expect(parseTool({ action: 'cash', target: 'bob', amount: 5 })).toBe('Confirmation required')
    expect(parseTool(null)).toBe('Confirmation required')
  })
  it('rejects unknown actions and bad targets/amounts', () => {
    expect(parseTool({ confirm: true, action: 'make-admin', target: 'bob' })).toBe('Unknown action')
    expect(parseTool({ confirm: true, action: 'cash', target: 'x', amount: 5 })).toBe('Pick a player')
    expect(typeof parseTool({ confirm: true, action: 'cash', target: 'bob', amount: 0 })).toBe('string')
    expect(typeof parseTool({ confirm: true, action: 'cash', target: 'bob', amount: 2e9 })).toBe('string')
    expect(typeof parseTool({ confirm: true, action: 'event-extend', hours: -1 })).toBe('string')
  })
  it('accepts valid requests and normalises them', () => {
    expect(parseTool({ confirm: true, action: 'cash', target: 'Bob', amount: -12.3456 })).toEqual({ action: 'cash', target: 'bob', amount: -12.35, hours: 0 })
    expect(parseTool({ confirm: true, action: 'reset', target: 'bob' })).toMatchObject({ action: 'reset', target: 'bob' })
  })
})

describe('event end', () => {
  const end = '2026-10-31T00:48:00Z', now = Date.parse('2026-10-25T00:00:00Z')
  it('end-now uses the current time', () => expect(newEventEnd('event-end', end, 0, now)).toBe(new Date(now).toISOString()))
  it('end-now never moves an already-ended event later', () => expect(newEventEnd('event-end', '2026-10-20T00:00:00.000Z', 0, now)).toBe('2026-10-20T00:00:00.000Z'))
  it('extend adds hours to the current end', () => expect(newEventEnd('event-extend', end, 24, now)).toBe('2026-11-01T00:48:00.000Z'))
})
