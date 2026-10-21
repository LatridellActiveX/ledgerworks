// Phone-size screenshot of Exchange buy orders: node tools/shot-bids.mjs <out.png>
// Adds two open bids (one part-filled) to the save so the list, the book
// rows and the depth chart's gold markers all show. Also checks 360 px fit.
import { chromium } from 'playwright'
const [out] = process.argv.slice(2)
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 390, height: Number(process.env.VH || 1000) }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
await p.addInitScript(() => { globalThis.__lwNoBoot = true; localStorage.setItem('ledgerworks-guest', '1'); localStorage.setItem('ledgerworks-tutorial', JSON.stringify({ step: 0, done: true, off: false })); localStorage.setItem('ledgerworks-view', '2d') })
await p.goto(process.env.URL || 'https://ledgerworks.parkercthomson.workers.dev/'); await p.waitForTimeout(6000)
await p.evaluate(() => {
  const k = 'ledgerworks-save-v1', s = JSON.parse(localStorage.getItem(k))
  const ref = s.ref?.seeds ?? 0.2, H = s.hour; s.lastReal = Date.now(); s.cash = Math.max(s.cash, 50000)
  const r2 = n => Math.round(n * 100) / 100
  s.bids = [
    { id: 90001, res: 'seeds', minQ: 0, qty: 1200, total: 2000, price: r2(ref * 0.95), escrow: 1200 * r2(ref * 0.95), placedH: H - 20, spent: 800 * r2(ref * 0.95) },
    { id: 90002, res: 'seeds', minQ: 0, qty: 1500, total: 1500, price: r2(ref * 0.88), escrow: 1500 * r2(ref * 0.88), placedH: H - 3, spent: 0 },
  ]
  localStorage.setItem(k, JSON.stringify(s))
})
await p.reload(); await p.waitForTimeout(2500)
await p.getByRole('button', { name: 'Market' }).first().click(); await p.waitForTimeout(800)
const card = p.locator('.bidcard')
await card.scrollIntoViewIfNeeded()
await p.screenshot({ path: out, fullPage: true })
await p.setViewportSize({ width: 360, height: 900 }); await p.waitForTimeout(300)
const over = await p.evaluate(() => [...document.querySelectorAll('.screen *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('select') && !e.closest('table')).map(e => e.className + ' ' + (e.textContent || '').slice(0, 20)).slice(0, 8))
console.log('overflow@360', JSON.stringify(over), 'scrollWidth', await p.evaluate(() => document.documentElement.scrollWidth))
await b.close()
