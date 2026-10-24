// Phone shots (390x844) of the admin-only Trade Spire against a LOCAL
// `wrangler dev` with a LOCAL test admin (never a real player):
//   node tools/shot-spire.mjs http://localhost:8799 <user> <pass>
// Builds the spire on the first free plot, shoots the map and the panel.
import { chromium } from 'playwright'
const [base = 'http://localhost:8799', user, pass] = process.argv.slice(2)
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
const p = await ctx.newPage()
await p.addInitScript(() => { localStorage.setItem('ledgerworks-view', '2d'); localStorage.setItem('ledgerworks-tutorial-v2', JSON.stringify({ step: 0, done: true, off: true, tips: [], goals: [] })); window.__lwNoBoot = true })
await p.goto(base + '/'); await ctx.request.post(base + '/api/auth/login', { data: { name: user, password: pass } })
await p.reload(); await p.waitForTimeout(4000)
const back = () => p.click('[aria-label="Back to map"]')
if (!(await p.$('.spire'))) {
  await p.locator('.tile:not(.locked)').first().click(); await p.waitForTimeout(600)
  await p.click('[data-b="spire"]'); await p.waitForTimeout(800)
  await back(); await p.waitForTimeout(600)
}
await p.screenshot({ path: '/workspace/ledgerworks-spire-map.png' })
await p.locator('.tile', { has: p.locator('.spire') }).dispatchEvent('click'); await p.waitForTimeout(1500)
await p.screenshot({ path: '/workspace/ledgerworks-spire-panel.png' })
await b.close()
