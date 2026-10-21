// Price display keeps cents for small amounts.
import { it, expect } from 'vitest'
import { money } from '../src/ui/fmt'
it('shows cents below $10k and whole dollars above', () => {
  expect(money(2.4)).toBe('$2.40')
  expect(money(18905.4)).toBe('$18,905')
  expect(money(-3.5)).toBe('-$3.50')
})
import { dur } from '../src/ui/fmt'
it('durations never show 60 minutes', () => {
  expect(dur(4.9999)).toBe('5h 0m')
  expect(dur(0.5)).toBe('30m')
  expect(dur(49)).toBe('2d 1h')
})
