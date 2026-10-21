// Phone-size screenshot of the Executives screen: node tools/shot-execs.mjs <out.png>
// Lifts the save to company level 12+ with cash, and seats a CFO and a CMO
// so the bonus summary, filled seats, empty seats and candidates all show.
import { chromium } from 'playwright'
const [out] = process.argv.slice(2)
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 390, height: Number(process.env.VH || 1000) }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
await p.addInitScript(() => { globalThis.__lwNoBoot = true; localStorage.setItem('ledgerworks-guest', '1'); localStorage.setItem('ledgerworks-tutorial', JSON.stringify({ step: 0, done: true, off: false })); localStorage.setItem('ledgerworks-view', '2d') })
await p.goto(process.env.URL || 'https://ledgerworks.parkercthomson.workers.dev/'); await p.waitForTimeout(6000)
await p.evaluate(() => {
  const k = 'ledgerworks-save-v1', s = JSON.parse(localStorage.getItem(k))
  s.lastReal = Date.now(); s.cash = Math.max(s.cash, 400000); s.xp = Math.max(s.xp, 2e7)
  s.ach = { ...(s.ach || {}), board: 9 }
  s.execs = {
    cfo: { id: 990001, name: 'Esme Copperfield', skills: { ops: 2, fin: 14, mkt: 1, tech: 3 } },
    cmo: { id: 990002, name: 'Kai Orchard', skills: { ops: 1, fin: 2, mkt: 11, tech: 0 } },
  }
  localStorage.setItem(k, JSON.stringify(s))
})
await p.reload(); await p.waitForTimeout(2500)
await p.getByRole('button', { name: /menu/i }).first().click(); await p.waitForTimeout(400)
await p.getByRole('button', { name: /Executives/ }).first().click(); await p.waitForTimeout(800)
await p.screenshot({ path: out, fullPage: true })
await p.setViewportSize({ width: 360, height: 900 }); await p.waitForTimeout(300)
const over = await p.evaluate(() => [...document.querySelectorAll('.screen *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => e.className + ' ' + (e.textContent || '').slice(0, 20)).slice(0, 8))
console.log('overflow@360', JSON.stringify(over))
await b.close()
