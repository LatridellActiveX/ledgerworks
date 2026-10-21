import { describe, it, expect } from 'vitest'
import * as S from '../src/game/seasons'

const at = (day: number) => S.EPOCH + (day * 24 / 4) * 3600000 + 1000 // world day -> real ms (4x speed)
describe('seasons realm', () => {
  it('cycles four 7-day phases per 28-day season', () => {
    expect(S.seasonAt(at(0))).toMatchObject({ no: 1, phase: 'spring', day: 1, daysLeft: 28 })
    expect(S.seasonAt(at(7)).phase).toBe('summer')
    expect(S.seasonAt(at(27)).phase).toBe('winter')
    expect(S.seasonAt(at(28))).toMatchObject({ no: 2, phase: 'spring' })
  })
  it('weather changes farms and shops', () => {
    expect(S.seasonProd('orchard', 'spring')).toBe(1.25)
    expect(S.seasonProd('orchard', 'winter')).toBe(0.7)
    expect(S.seasonProd('foundry', 'winter')).toBe(1)
    expect(S.seasonProd('orchard', undefined)).toBe(1) // classic realm
    expect(S.seasonRetail('apples', 'market', 'summer')).toBe(1.2)
    expect(S.seasonRetail('fuel', 'fuelstop', 'winter')).toBe(1.3)
  })
})
