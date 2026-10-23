// Phone shots (390x844) of the modern restyle on the live site: 2D + 3D map
// close-ups, trade routes with a truck on the road, Business Live news, and
// the store selling panel (merged "Left to collect" row + bar spacing).
import { chromium } from 'playwright'
const URL = 'https://ledgerworks.parkercthomson.workers.dev/'
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
async function page(view) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  await p.addInitScript(v => { globalThis.__lwNoBoot = true; localStorage.setItem('ledgerworks-guest', '1'); localStorage.setItem('ledgerworks-view', v); localStorage.setItem('ledgerworks-tutorial', JSON.stringify({ step: 0, done: true, off: false })) }, view)
  await p.goto(URL); await p.waitForTimeout(5000)
  // Seed: several buildings, a store mid-sale, and a trade route with a truck on the road.
  await p.evaluate(() => {
    const k = 'ledgerworks-save-v1', s = JSON.parse(localStorage.getItem(k))
    const types = ['market', 'bakery', 'farm', 'factory', 'gadget', 'warehouse']
    s.plots = s.plots.map((_, i) => i === 0 ? { uid: 990, type: 'market', level: 1, job: { kind: 'sell', res: 'berries', qty: 89, q: 1, price: 3, startH: s.hour - 0.6, endH: s.hour + 0.62, got: 54, gotC: 16200 } }
      : i < 6 ? { uid: 991 + i, type: types[i], level: 3 } : null)
    s.cash = Math.max(s.cash ?? 0, 50000)
    localStorage.setItem(k, JSON.stringify(s))
  })
  await p.reload(); await p.waitForTimeout(view === '3d' ? 7000 : 3000)
  return p
}
const shot = (p, n) => p.screenshot({ path: `/workspace/ledgerworks-modern-${n}.png` })
const p2 = await page('2d'); await shot(p2, 'map-2d')
// Store panel: open the store by tapping its pill.
await p2.locator('.spill').first().click({ force: true, timeout: 5000 }).catch(e => console.log('spill', e.message.split('\n')[0]))
await p2.waitForTimeout(1200)
await p2.locator('.jobprog').first().scrollIntoViewIfNeeded().catch(() => {})
await p2.screenshot({ path: '/workspace/ledgerworks-sell-panel.png' })
console.log('panel', (await p2.locator('.store-break').innerText().catch(() => '(none)')).replace(/\n/g, ' | '))
const p3 = await page('3d'); await shot(p3, 'map-3d')
// Menu screens: news and routes.
for (const [scr, n] of [['Business Live', 'news'], ['Trade routes', 'routes']]) {
  await p3.locator('.menu-btn, [aria-label="Menu"]').first().click({ timeout: 4000 }).catch(() => {})
  await p3.getByRole('button', { name: scr }).first().click({ timeout: 4000 }).catch(e => console.log(n, e.message.split('\n')[0]))
  await p3.waitForTimeout(1200); await shot(p3, n)
  console.log(n, (await p3.locator('h2').allInnerTexts()).join(' / '))
  await p3.goBack().catch(() => {}); await p3.keyboard.press('Escape'); await p3.waitForTimeout(600)
}
await b.close()
