// Phone-size screenshots of Trade routes: node tools/shot-routes.mjs <screen.png> [map.png]
// Adds stock and three routes to the save (one cart mid-trip, one with a
// finished trip, one paused) so every card state shows.
import { chromium } from 'playwright'
const [screenOut, mapOut] = process.argv.slice(2)
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 390, height: Number(process.env.VH || 1100) }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
await p.addInitScript(() => { globalThis.__lwNoBoot = true; localStorage.setItem('ledgerworks-guest', '1'); localStorage.setItem('ledgerworks-tutorial', JSON.stringify({ step: 0, done: true, off: false })); localStorage.setItem('ledgerworks-view', '2d') })
await p.goto(process.env.URL || 'https://ledgerworks.parkercthomson.workers.dev/'); await p.waitForTimeout(6000)
await p.evaluate(() => {
  const k = 'ledgerworks-save-v1', s = JSON.parse(localStorage.getItem(k))
  s.hour = 3 * 24 + 10; s.lastReal = Date.now()
  s.stock['bread|0'] = 640; s.stock['phone|1'] = 30; s.stock['bricks|0'] = 900
  const H = s.hour
  s.routes = [
    { id: 1, town: 'saltmarsh', res: 'bread', mode: 'reserve', amount: 200, every: 2, nextH: H + 1.6, trip: { departH: H - 0.4, arriveH: H + 0.35, qty: 400, q: 0, cost: 102 }, last: { h: H - 2, qty: 380, revenue: 2213.4, cost: 101.2 }, trips: 5, units: 1900, revenue: 10840, costs: 505 },
    { id: 2, town: 'lanternfall', res: 'phone', mode: 'amount', amount: 10, every: 6, nextH: H + 4.2, last: { h: H - 1.2, qty: 10, revenue: 5120, cost: 154.8 }, trips: 2, units: 20, revenue: 10050, costs: 309.6 },
    { id: 3, town: 'copperridge', res: 'bricks', mode: 'amount', amount: 150, every: 3, nextH: H + 1, paused: true, trips: 0, units: 0, revenue: 0, costs: 0 },
  ]
  s.nextRouteId = 4
  localStorage.setItem(k, JSON.stringify(s))
})
await p.reload(); await p.waitForTimeout(2500)
if (mapOut) await p.screenshot({ path: mapOut })
await p.getByRole('button', { name: 'Trade routes' }).first().click(); await p.waitForTimeout(800)
await p.screenshot({ path: screenOut, fullPage: true })
// Narrow-phone check: nothing inside the screen may stick out past 360 px.
await p.setViewportSize({ width: 360, height: 900 }); await p.waitForTimeout(300)
const over = await p.evaluate(() => [...document.querySelectorAll('.screen *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('select')).map(e => e.className + ' ' + (e.textContent || '').slice(0, 20)).slice(0, 8))
console.log('overflow@360', JSON.stringify(over), 'scrollWidth', await p.evaluate(() => document.documentElement.scrollWidth))
await p.getByRole('button', { name: /New trade route/ }).click(); await p.waitForTimeout(300)
const over2 = await p.evaluate(() => [...document.querySelectorAll('.screen *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => e.className + ' ' + (e.textContent || '').slice(0, 20)).slice(0, 8))
console.log('form overflow@360', JSON.stringify(over2))
if (process.env.FORM) await p.screenshot({ path: process.env.FORM, fullPage: true })
await b.close()
