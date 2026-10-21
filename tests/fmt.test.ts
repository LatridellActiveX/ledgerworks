// Price display keeps cents for small amounts.
import { it, expect } from 'vitest'
import { money } from '../src/ui/fmt'
it('shows cents below $10k and whole dollars above', () => {
  expect(money(2.4)).toBe('$2.40')
  expect(money(18905.4)).toBe('$18,905')
  expect(money(-3.5)).toBe('-$3.50')
})
