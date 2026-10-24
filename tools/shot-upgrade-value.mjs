// Phone shot (390x844): an orchard with 1 extra field + drip line, showing
// "Book value ... incl. upgrades" in its panel, on the live site.
import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
await p.addInitScript(() => { localStorage.setItem('ledgerworks-guest', '1'); localStorage.setItem('ledgerworks-view', '2d'); localStorage.setItem('ledgerworks-tutorial-v2', JSON.stringify({ step: 0, done: true, off: true, tips: [], goals: [] })) })
await p.goto('https://ledgerworks.parkercthomson.workers.dev/'); await p.waitForFunction(() => localStorage.getItem('ledgerworks-save-v1'), null, { timeout: 30000 })
await p.evaluate(`(() => { const k='ledgerworks-save-v1', s=JSON.parse(localStorage.getItem(k)); s.plots=s.plots.map((_,i)=>i===0?{uid:990,type:'orchard',level:1,irrigated:true,fields:[{uid:991,type:'orchard',level:0.6}]}:null); localStorage.setItem(k, JSON.stringify(s)) })()`)
await p.reload(); await p.waitForTimeout(3000)
await p.touchscreen.tap(158, 352); await p.waitForTimeout(1500)
console.log(await p.textContent('.book-val'))
await p.locator('.book-val').scrollIntoViewIfNeeded()
await p.screenshot({ path: '/workspace/ledgerworks-upgrade-value.png' })
await p.click('[aria-label="Back to map"]'); await p.click('.pill.cash'); await p.waitForTimeout(1000)
console.log(await p.evaluate(() => [...document.querySelectorAll('.vline')].map(e => e.textContent).slice(0, 3).join(' | ')))
await b.close()
