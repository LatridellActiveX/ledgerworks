// Phone shots (390x844) of the modern restyle on the live site: 2D + 3D map
// close-ups, trade routes with a truck on the road, Business Live news, and
// the store selling panel (merged "Left to collect" row + bar spacing).
import { chromium } from 'playwright'
const URL = 'https://ledgerworks.parkercthomson.workers.dev/'
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
async function page(view) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  await p.addInitScript(v => { localStorage.setItem('ledgerworks-guest', '1'); localStorage.setItem('ledgerworks-view', v); localStorage.setItem('ledgerworks-tutorial', JSON.stringify({ step: 0, done: true, off: false })) }, view)
  await p.goto(URL); await p.waitForFunction(() => localStorage.getItem('ledgerworks-save-v1'), null, { timeout: 30000 })
  // Seed: several buildings, a store mid-sale, and a trade route with a truck on the road.
  await p.evaluate(() => {
    const k = 'ledgerworks-save-v1', s = JSON.parse(localStorage.getItem(k))
    const types = ['market', 'bakery', 'farm', 'factory', 'gadget', 'warehouse']
    s.plots = s.plots.map((_, i) => i === 0 ? { uid: 990, type: 'market', level: 1, job: { kind: 'sell', res: 'berries', qty: 89, q: 1, price: 3, startH: s.hour - 0.6, endH: s.hour + 0.62, got: 54, gotC: 16200 } }
      : i < 6 ? { uid: 991 + i, type: types[i], level: 3 } : null)
    s.stock = { ...s.stock, 'apples|1': 240, 'berries|2': 120 }
    s.cash = Math.max(s.cash ?? 0, 50000)
    localStorage.setItem(k, JSON.stringify(s))
  })
  await p.reload(); await p.waitForTimeout(view === '3d' ? 7000 : 3000)
  return p
}
const shot = (p, n) => p.screenshot({ path: `/workspace/ledgerworks-modern-${n}.png` })
const p2 = await page('2d')
// Close-up: zoom the 2D map in on the built corner before the shot.
await p2.mouse.move(200, 420); await p2.keyboard.down('Control'); for (let i = 0; i < 8; i++) { await p2.mouse.wheel(0, -240); await p2.waitForTimeout(150) }; await p2.keyboard.up('Control')
await p2.waitForTimeout(800); await shot(p2, 'map')
// Menu screens: news and routes, via the burger menu.
for (const [scr, n] of [[/Business Live/, 'news'], [/routes/i, 'routes']]) {
  await p2.locator('.burger').click({ timeout: 4000, force: true }).catch(e => console.log('burger', e.message.split('\n')[0]))
  await p2.locator('button', { hasText: scr }).first().click({ timeout: 4000 }).catch(e => console.log(n, e.message.split('\n')[0]))
  await p2.waitForTimeout(1200); await shot(p2, n)
  await p2.reload(); await p2.waitForTimeout(3000)
}
// Store panel: reload to the default view and tap the selling store.
await p2.reload(); await p2.waitForTimeout(3000)
await p2.mouse.click(160, 337); await p2.waitForTimeout(1500)
await p2.locator('.jobprog').first().scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => console.log('no jobprog'))
await p2.screenshot({ path: '/workspace/ledgerworks-sell-panel.png' })
// Busy store's other-goods list, with the tooltip from tapping a greyed-out Sell.
await p2.locator('.other-goods').scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => console.log('no other-goods'))
await p2.locator('.other-goods button.locked').first().click({ timeout: 3000 }).catch(() => {})
await p2.waitForTimeout(300)
await p2.screenshot({ path: '/workspace/ledgerworks-store-list.png' })
await b.close()
