// Phone shot of the Company Value timeline, with a save aged 10 days and some old daily history.
import { chromium } from 'playwright'
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
await p.addInitScript(() => { globalThis.__lwNoBoot = true; localStorage.setItem('ledgerworks-guest', '1'); localStorage.setItem('ledgerworks-view', '2d'); localStorage.setItem('ledgerworks-tutorial', JSON.stringify({ step: 0, done: true, off: false })) })
await p.goto('https://ledgerworks.parkercthomson.workers.dev/'); await p.waitForTimeout(5600)
await p.evaluate(() => {
  const k = 'ledgerworks-save-v1', s = JSON.parse(localStorage.getItem(k))
  s.hour += 240; s.lastReal = Date.now() // founded ~10 days ago
  s.valueHist = Array.from({ length: 7 }, (_, i) => ({ h: 8 + 72 + i * 24, v: 60000 + i * 9000 + (i % 2) * 4000 })) // history starts day 3
  localStorage.setItem(k, JSON.stringify(s))
})
await p.reload(); await p.waitForTimeout(2500)
await p.locator('.pill.cash').click({ timeout: 5000 }); await p.waitForTimeout(1200)
await p.locator('.vchart').scrollIntoViewIfNeeded()
await p.screenshot({ path: '/workspace/ledgerworks-value-timeline.png' })
console.log('axis', await p.locator('.vchart text').allTextContents())
await b.close()
