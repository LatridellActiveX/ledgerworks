// Phone-size screenshots of Market news: node tools/shot-news.mjs <map.png> <paper.png>
// Moves the save to game day 10 (a day with two running stories) and adds stock.
import { chromium } from 'playwright'
const [mapOut, paperOut] = process.argv.slice(2)
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 390, height: Number(process.env.VH || 1000) }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
await p.addInitScript(() => { globalThis.__lwNoBoot = true; localStorage.setItem('ledgerworks-guest', '1'); localStorage.setItem('ledgerworks-tutorial', JSON.stringify({ step: 0, done: true, off: false })); localStorage.setItem('ledgerworks-view', '2d') })
await p.goto(process.env.URL || 'https://ledgerworks.parkercthomson.workers.dev/'); await p.waitForTimeout(5600)
await p.evaluate(() => {
  const k = 'ledgerworks-save-v1', s = JSON.parse(localStorage.getItem(k))
  s.hour = 10 * 24 + 9; s.lastReal = Date.now()
  s.stock['pie|0'] = 40; s.stock['icecream|0'] = 25; s.stock['cheese|0'] = 12
  localStorage.setItem(k, JSON.stringify(s))
})
await p.reload(); await p.waitForTimeout(2000)
await p.screenshot({ path: mapOut })
await p.getByRole('button', { name: 'Market news' }).click(); await p.waitForTimeout(600)
await p.screenshot({ path: paperOut })
await b.close()
