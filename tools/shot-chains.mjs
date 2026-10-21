// Phone-size screenshot of the Production chains screen:
// node tools/shot-chains.mjs <out.png> [good]   (URL=... to point at a local preview)
// Gives the save a few buildings and some stock so the ✓ / 📦 marks show.
import { chromium } from 'playwright'
const [out, good = 'Bread loaf'] = process.argv.slice(2)
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: Number(process.env.VW || 390), height: Number(process.env.VH || 1100) }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
await p.addInitScript(() => { globalThis.__lwNoBoot = true; localStorage.setItem('ledgerworks-guest', '1'); localStorage.setItem('ledgerworks-tutorial', JSON.stringify({ step: 0, done: true, off: false })); localStorage.setItem('ledgerworks-view', '2d') })
await p.goto(process.env.URL || 'https://ledgerworks.parkercthomson.workers.dev/'); await p.waitForTimeout(5600)
await p.evaluate(() => {
  const k = 'ledgerworks-save-v1', s = JSON.parse(localStorage.getItem(k))
  const types = ['generator', 'pump', 'orchard', 'barnyard', 'kitchen']
  s.plots = s.plots.map((_, i) => (i < types.length ? { uid: 900 + i, type: types[i], level: 1 } : null))
  s.stock['eggs|0'] = 120; s.stock['wheat|0'] = 300; s.lastReal = Date.now()
  localStorage.setItem(k, JSON.stringify(s))
})
await p.reload(); await p.waitForTimeout(1500)
await p.getByRole('button', { name: 'Menu', exact: true }).click({ force: true }); await p.waitForTimeout(300)
await p.getByRole('button', { name: '🔗 Production chains' }).click(); await p.waitForTimeout(400)
if (process.env.PICKER) { await p.screenshot({ path: out }); await b.close(); process.exit(0) }
await p.getByRole('button', { name: good, exact: true }).click(); await p.waitForTimeout(300)
// Open the Flour step too, so two levels of the tree are visible.
await p.locator('.ch-row', { hasText: 'Flour' }).first().click(); await p.waitForTimeout(400)
await p.screenshot({ path: out })
await b.close()
