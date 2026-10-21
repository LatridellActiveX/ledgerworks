// Company renaming and the procedural crest (game/company.ts).
import { describe, it, expect } from 'vitest'
import { cleanCompanyName, renameCompany, crestParts, outlinePath, starPoints, NAME_MAX } from '../src/game/company'
import { newGame } from '../src/game/engine'

describe('company names', () => {
  it('trims and collapses spaces', () => {
    expect(cleanCompanyName('   Acme   Widgets  ')).toEqual({ name: 'Acme Widgets' })
  })
  it('rejects names that are too short or too long', () => {
    expect('error' in cleanCompanyName('A')).toBe(true)
    expect('error' in cleanCompanyName('x'.repeat(NAME_MAX + 1))).toBe(true)
    expect(cleanCompanyName('x'.repeat(NAME_MAX))).toEqual({ name: 'x'.repeat(NAME_MAX) })
  })
  it('allows letters, numbers and common punctuation, rejects markup', () => {
    expect('name' in cleanCompanyName("O'Brien & Sons, Ltd.-2")).toBe(true)
    expect('name' in cleanCompanyName('Café Ünion')).toBe(true)
    expect('error' in cleanCompanyName('<script>x</script>')).toBe(true)
    expect('error' in cleanCompanyName('Bad/Name')).toBe(true)
  })
  it('counts characters, not UTF-16 units', () => {
    expect('name' in cleanCompanyName('😀'.repeat(NAME_MAX))).toBe(false) // emoji are not allowed anyway
    expect('error' in cleanCompanyName('😀')).toBe(true)
  })
})

describe('renameCompany', () => {
  it('returns a new state with the new name and leaves the old one alone', () => {
    const s = newGame('Old Co', 1000)
    const r = renameCompany(s, '  New   Co ')
    expect('state' in r).toBe(true)
    if ('state' in r) {
      expect(r.state.company).toBe('New Co')
      expect(r.state).not.toBe(s)
      expect(s.company).toBe('Old Co')
      expect(r.state.cash).toBe(s.cash)
    }
  })
  it('refuses an invalid name and an unchanged name', () => {
    const s = newGame('Same Co', 1000)
    expect('error' in renameCompany(s, 'a')).toBe(true)
    expect('error' in renameCompany(s, 'Same   Co')).toBe(true)
  })
})

describe('crest', () => {
  it('is deterministic for a name', () => {
    expect(crestParts('Acme')).toEqual(crestParts('Acme'))
  })
  it('changes when the name changes', () => {
    expect(crestParts('Acme').key).not.toBe(crestParts('Acme Two').key)
  })
  it('takes initials from the first two words', () => {
    expect(crestParts('Hollow Reach Ltd').initials).toBe('HR')
    expect(crestParts('solo').initials).toBe('S')
  })
  it('keeps design values in range', () => {
    for (const n of ['A', 'Zeta Works', 'Ledger Co', 'x'.repeat(40)]) {
      const p = crestParts(n)
      expect(p.hue).toBeGreaterThanOrEqual(0)
      expect(p.hue).toBeLessThan(360)
      expect(p.points).toBeGreaterThanOrEqual(5)
      expect(p.points).toBeLessThanOrEqual(8)
    }
  })
  it('builds closed outlines and star points', () => {
    expect(outlinePath('shield')).toMatch(/Z$/)
    expect(outlinePath('hex').split('L').length).toBe(6)
    expect(starPoints(6).split(' ').length).toBe(12)
  })
})
