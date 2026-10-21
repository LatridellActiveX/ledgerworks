// Live check of the update pop-up: answer /version.json with a different
// buildId (as if a newer deploy were live), wait for the first check, shoot.
import { chromium } from 'playwright'
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })
await p.addInitScript(() => { localStorage.setItem('ledgerworks-guest', '1'); localStorage.setItem('ledgerworks-tutorial', '{"done":true}') })
await p.route('**/version.json*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ buildId: 'next', version: '2026-10-21 07:00' }) }))
await p.goto(process.env.URL || 'https://ledgerworks.parkercthomson.workers.dev/'); await p.waitForTimeout(12000) // first check fires at 10 s
console.log('popup visible:', await p.locator('.update-prompt').isVisible())
await p.screenshot({ path: '/workspace/ledgerworks-update-popup.png' })
await p.getByRole('button', { name: 'Later' }).click(); console.log('after Later:', await p.locator('.update-prompt').count())
await b.close()
