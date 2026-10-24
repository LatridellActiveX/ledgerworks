// Phone shot (390x844) of the Admin screen on the live site using MOCKED
// /api/auth/me + /api/admin/* responses (fake players), so no real account
// or admin tool is touched. Real requests still get 403 from the server.
import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
await p.addInitScript(() => { localStorage.setItem('ledgerworks-guest', '1'); localStorage.setItem('ledgerworks-view', '2d'); localStorage.setItem('ledgerworks-tutorial-v2', JSON.stringify({ step: 0, done: true, off: true, tips: [], goals: [] })) })
const now = Date.now(), tab = process.argv[2] ?? 'Players'
const mock = { me: 'test_admin', players: [
  { name: 'orchard_queen', company: 'Queen Fruits', cash: 182450, value: 640200, seen: now - 4 * 60000 },
  { name: 'demo_trader', company: 'Demo Trading Co', cash: 96310, value: 311800, seen: now - 3 * 3600000 },
  { name: 'test_player', company: 'Test Farms', cash: 12040, value: 48900, seen: now - 2 * 86400000 },
], economy: { totalCash: 1290450, saves: 42, day: 4, phase: 'normal', goods: [['apples', 1.92, 340, 120, 3], ['juice', 6.4, 85, 0, 0], ['crates', 0.38, 1200, 500, 2]].map(([id, price, soldToday, listed, orders]) => ({ id, price, soldToday, listed, orders })) },
  health: { build: '2026-10-24T20:51:38Z', active: { hour: 5, day: 18, week: 37 }, errors: [{ ts: now - 900000, src: 'client', msg: 'TypeError: x is undefined @ index.js:1', build: '' }] },
  event: { end: '2026-10-31T00:48:00Z', overridden: false },
  audit: [{ ts: now - 600000, admin: 'test_admin', action: 'cash', target: 'test_player', detail: 'gave $500' }] }
await p.route('**/api/auth/me', r => r.fulfill({ json: { name: 'test_admin', admin: true } }))
await p.route('**/api/admin/dashboard', r => r.fulfill({ json: mock }))
await p.goto('https://ledgerworks.parkercthomson.workers.dev/'); await p.waitForTimeout(4000)
await p.click('[aria-label="Menu"]'); await p.click('text=🛠 Admin'); await p.waitForTimeout(800)
await p.click(`.adm-tabs >> text=${tab}`); await p.waitForTimeout(700)
await p.screenshot({ path: process.argv[3] ?? '/workspace/ledgerworks-admin.png' })
await b.close()
