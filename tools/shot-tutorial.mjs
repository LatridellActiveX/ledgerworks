// Phone shots (390x844) of the new-player tutorial on the live site:
// the spotlit Orchard step, the Goals screen and the Settings options.
import { chromium } from 'playwright'
const U = 'https://ledgerworks.parkercthomson.workers.dev/'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
await p.addInitScript(() => { localStorage.setItem('ledgerworks-guest', '1'); localStorage.setItem('ledgerworks-view', '2d') })
await p.goto(U); await p.waitForSelector('.tut-card', { timeout: 40000 }); await p.waitForTimeout(1500)
console.log('step1:', await p.textContent('.tut-card h3'))
await p.touchscreen.tap(158, 352); await p.waitForTimeout(1500)
console.log('screen:', await p.textContent('.screen-head h2').catch(() => 'none'), 'hole:', await p.locator('.tut-hole').count())
await p.screenshot({ path: '/workspace/ledgerworks-tutorial-step.png' })
// Spotlight blocks other taps: only Orchard is clickable.
await p.locator('[data-b="orchard"]').click({ force: true }); await p.waitForTimeout(1500)
console.log('after build:', await p.textContent('.tut-card h3'))
await p.waitForTimeout(12000)
console.log('orchard job:', await p.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('ledgerworks-save-v1')).plots[0].job ?? null)))
// Reload: progress resumes.
await p.reload(); await p.waitForSelector('.tut-card', { timeout: 40000 })
console.log('after reload:', await p.textContent('.tut-card h3'))
// Goals: jump to level 4 to show unlocked ones.
await p.evaluate(() => { const k = 'ledgerworks-save-v1', s = JSON.parse(localStorage.getItem(k)); s.xp = 3000; localStorage.setItem(k, JSON.stringify(s)); localStorage.setItem('ledgerworks-tutorial-v2', JSON.stringify({ step: 0, done: true, off: false, tips: [], goals: [] })) })
await p.reload(); await p.waitForTimeout(4000)
await p.click('[aria-label="Menu"]'); await p.click('text=Goals'); await p.waitForTimeout(800)
await p.screenshot({ path: '/workspace/ledgerworks-goals.png' })
await p.click('[aria-label="Back to map"]'); await p.click('[aria-label="Research"]'); await p.waitForTimeout(800)
console.log('tip:', await p.locator('.tip-card').count())
await p.click('text=Got it'); await p.click('[aria-label="Map"]'); await p.click('[aria-label="Research"]'); await p.waitForTimeout(500)
console.log('tip again:', await p.locator('.tip-card').count())
await p.click('[aria-label="Back to map"]'); await p.click('[aria-label="Menu"]'); await p.click('.drawer >> text=Settings'); await p.waitForTimeout(600)
await p.locator('text=Replay tutorial').scrollIntoViewIfNeeded()
await p.screenshot({ path: '/workspace/ledgerworks-tutorial-settings.png' })
await b.close()
