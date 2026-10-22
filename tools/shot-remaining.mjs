// Phone shot of the store pill before/after a collect (ready / left to collect).
import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
await p.addInitScript(() => { globalThis.__lwNoBoot = true; localStorage.setItem('ledgerworks-guest', '1'); localStorage.setItem('ledgerworks-view', '2d'); localStorage.setItem('ledgerworks-tutorial', JSON.stringify({ step: 0, done: true, off: false })) })
await p.goto('https://ledgerworks.parkercthomson.workers.dev/'); await p.waitForTimeout(5600)
await p.evaluate(() => {
  const k = 'ledgerworks-save-v1', s = JSON.parse(localStorage.getItem(k))
  // One store selling 300 apples at $0.89, 40% through the sale, nothing collected yet.
  s.plots = s.plots.map((_, i) => i === 0 ? { uid: 990, type: 'market', level: 1, job: { kind: 'sell', res: 'apples', qty: 300, q: 1, price: 0.89, startH: s.hour - 4, endH: s.hour + 6 } } : null)
  localStorage.setItem(k, JSON.stringify(s))
})
await p.reload(); await p.waitForTimeout(3000)
const pill = async () => (await p.locator('.spill').count()) ? await p.locator('.spill').first().innerText() : '(no pill)'
console.log('before', await pill()); await p.screenshot({ path: '/workspace/ledgerworks-remaining-before.png' })
await p.locator('.bubbles > *').first().click({ force: true, timeout: 5000 }).catch(e => console.log('click fail', e.message.split('\n')[0])); await p.waitForTimeout(1500)
console.log('after', await pill()); await p.screenshot({ path: '/workspace/ledgerworks-remaining-after.png' })
// Cash pill -> Company Value; screenshot the timeline chart.
await p.locator('.pill.cash').click({ timeout: 5000 }); await p.waitForTimeout(1200)
await p.locator('.vchart').scrollIntoViewIfNeeded().catch(() => {})
await p.screenshot({ path: '/workspace/ledgerworks-value-timeline.png' })
console.log('axis', await p.locator('.vchart text').allInnerTexts())
await b.close()
