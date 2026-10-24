// Measures the real loading screen on the live site: cold load (empty cache) then a warm reload.
import { chromium } from 'playwright'
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await p.addInitScript(() => { localStorage.setItem('ledgerworks-guest', '1'); localStorage.setItem('ledgerworks-tutorial', JSON.stringify({ step: 0, done: true, off: false })) })
for (const run of ['cold', 'warm']) {
  const t0 = Date.now(); await p.goto('https://ledgerworks.parkercthomson.workers.dev/', { waitUntil: 'commit' }); await p.waitForTimeout(600)
  let shot = false
  await p.waitForTimeout(150); shot = await p.locator('.boot').count() > 0; if (shot && run === 'cold') await p.screenshot({ path: '/workspace/ledgerworks-loading-real.png' })
  await p.waitForFunction(() => globalThis.__lwBootMs !== undefined, null, { timeout: 20000 })
  await p.locator('.boot').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
  console.log(run, 'steps ms', await p.evaluate(() => globalThis.__lwBootMs), 'screen gone after', Date.now() - t0, 'ms', shot ? '(screenshot)' : '(never shown)')
}
await b.close()
