// Privacy policy page renders and names every localStorage key the code uses.
import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { privacyHtml, PRIVACY } from '../src/legal/privacy'

describe('privacy policy', () => {
  it('renders a standalone page with effective date and contact', () => {
    const h = privacyHtml()
    expect(h).toContain('October 21, 2026')
    expect(h).toContain('github.com/LatridellActiveX/ledgerworks/issues')
    expect(h).not.toContain('<script')
  })
  it('lists every ledgerworks-* localStorage key in the code', () => {
    const text = JSON.stringify(PRIVACY)
    const keys = new Set(execSync("rg -o --no-filename \"'ledgerworks-[a-z0-9-]+'\" src --glob '!legal/**'").toString().match(/ledgerworks-[a-z0-9-]+/g))
    for (const k of keys) expect(text, k).toContain(k)
  })
})
