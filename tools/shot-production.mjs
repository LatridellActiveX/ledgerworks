// Phone shot (390x844) of the production card's stacked label/value rows on
// the live site, at normal and 130% text size (checks nothing overflows).
import { chromium } from 'playwright'
const URL = 'https://ledgerworks.parkercthomson.workers.dev/'
const b = await chromium.launch()
for (const [scale, out] of [[100, 'production-rows'], [130, 'production-rows-130']]) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  await p.addInitScript(() => { localStorage.setItem('ledgerworks-guest', '1'); localStorage.setItem('ledgerworks-view', '2d'); localStorage.setItem('ledgerworks-tutorial', JSON.stringify({ step: 0, done: true, off: false })) })
  await p.goto(URL); await p.waitForFunction(() => localStorage.getItem('ledgerworks-save-v1'), null, { timeout: 30000 })
  // Seed: plot 1 is a Food works mid-run.
  await p.evaluate(`(() => { const k='ledgerworks-save-v1', s=JSON.parse(localStorage.getItem(k)); s.plots=s.plots.map((_,i)=>i===0?{uid:990,type:'kitchen',level:1,job:{kind:'make',res:'${process.env.RES}',qty:297,q:0,startH:s.hour-0.4,endH:s.hour+0.47,got:0,src:465}}:null); localStorage.setItem(k, JSON.stringify(s)) })()`)
  await p.reload(); await p.waitForTimeout(3000)
  await p.evaluate(sc => { document.documentElement.style.fontSize = sc + '%' }, scale)
  await p.touchscreen.tap(158, 352); await p.waitForTimeout(1500)
  const card = p.locator('.jobcard').first()
  await card.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => console.log('no jobcard'))
  // Overflow check: card must not be wider than its panel.
  console.log(scale, await p.evaluate(() => { const c = document.querySelector('.jobcard'); return c ? [c.scrollWidth, c.clientWidth, document.documentElement.scrollWidth] : 'none' }))
  await p.screenshot({ path: `/workspace/ledgerworks-${out}.png` })
  await p.close()
}
await b.close()
