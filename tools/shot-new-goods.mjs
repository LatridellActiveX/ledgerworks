// Phone shot (390x844) of an idle Corner market's sell list with the eight
// grocery-line goods in stock, on the live site.
import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
await p.addInitScript(() => { localStorage.setItem('ledgerworks-guest', '1'); localStorage.setItem('ledgerworks-view', '2d'); localStorage.setItem('ledgerworks-tutorial', JSON.stringify({ step: 0, done: true, off: false })) })
await p.goto('https://ledgerworks.parkercthomson.workers.dev/'); await p.waitForFunction(() => localStorage.getItem('ledgerworks-save-v1'), null, { timeout: 30000 })
await p.evaluate(`(() => { const k='ledgerworks-save-v1', s=JSON.parse(localStorage.getItem(k)); s.plots=s.plots.map((_,i)=>i===0?{uid:990,type:'market',level:1}:null);
  s.stock={}; for (const g of ['oranges','ginger','steak','sausages','orangej','applej','cider','gingerbeer']) s.stock[g+'|0']=200; localStorage.setItem(k, JSON.stringify(s)) })()`)
await p.reload(); await p.waitForTimeout(3000)
await p.touchscreen.tap(158, 352); await p.waitForTimeout(1500)
const n = await p.evaluate(() => [...document.querySelectorAll('.panel, .bottom')].map(e => e.textContent).join(' '))
console.log(['Oranges', 'Ginger root', 'Steak', 'Sausages', 'Orange juice', 'Apple juice', 'Apple cider', 'Ginger beer'].map(x => x + ':' + n.includes(x)).join(' '))
await p.locator('.lot, .shoplist, select').first().scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {})
// Native dropdowns don't render in screenshots, so show the Sell select as an open list box.
await p.evaluate(() => { const s = document.querySelector('select'); if (s) { s.size = 9; s.style.height = 'auto' } })
await p.screenshot({ path: '/workspace/ledgerworks-new-goods.png' })
await b.close()
