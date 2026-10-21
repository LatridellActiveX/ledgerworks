// Overflow audit: for each width and screen, report page scrollWidth vs innerWidth
// and any element whose right edge passes the viewport (ignoring contents of
// intentional horizontal scrollers like .wh-row). Usage: URL=... node tools/fit-audit.mjs
import { chromium } from 'playwright'
const U = process.env.URL || 'http://localhost:4173'
const screens = (process.env.SCREENS || 'Warehouse,Market,Research,Finance,Menu').split(',')
const b = await chromium.launch(); let bad = 0
for (const w of (process.env.WIDTHS || '360,390,412').split(',').map(Number)) {
  for (const sc of screens) {
    const p = await b.newPage({ viewport: { width: w, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    await p.addInitScript(() => { globalThis.__lwNoBoot = true; localStorage.setItem('ledgerworks-guest', '1'); localStorage.setItem('ledgerworks-tutorial', JSON.stringify({ step: 0, done: true, off: false })) })
    await p.goto(U); await p.waitForTimeout(1500)
    await p.getByRole('button', { name: sc, exact: true }).first().click({ force: true }); await p.waitForTimeout(700)
    if (sc === 'Warehouse' && process.env.DETAIL) { await p.locator('.wh-tile').first().click({ force: true }).catch(() => {}); await p.waitForTimeout(500) }
    for (const sub of sc === 'Warehouse' ? ['Inventory', 'Incoming', 'Contracts', 'History'] : ['']) {
      if (sub) { await p.getByRole('button', { name: sub, exact: true }).first().click({ force: true }).catch(() => {}); await p.waitForTimeout(300) }
      // TEXTSCALE=1.3 emulates Android's font-size accessibility setting (Chrome scales px text too).
      if (process.env.TEXTSCALE) await p.evaluate(f => { if (globalThis.__ts) return; globalThis.__ts = 1; const els = [...document.querySelectorAll('body *')]; const fs = els.map(e => parseFloat(getComputedStyle(e).fontSize)); els.forEach((e, i) => { e.style.fontSize = fs[i] * f + 'px' }) }, Number(process.env.TEXTSCALE))
      const r = await p.evaluate(() => {
        const W = innerWidth, out = []
        for (const el of document.querySelectorAll('body *')) {
          if (el.closest('.wh-row, .campus, canvas, .acts, .drawer-bg:not(.drawer-bg)')) continue
          // An element must fit the viewport AND its nearest clipping ancestor
          // (otherwise it is cut off, like the History tab was).
          const rc = el.getBoundingClientRect(); if (!rc.width) continue
          let lim = W, a = el.parentElement
          while (a) { if (/(hidden|auto|scroll|clip)/.test(getComputedStyle(a).overflowX)) { lim = Math.min(W, a.getBoundingClientRect().right); break } a = a.parentElement }
          if (rc.right > lim + 1) out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${(el.textContent || '').trim().slice(0, 14)}" r=${rc.right.toFixed(0)}>${lim.toFixed(0)}`)
        }
        return { sw: document.documentElement.scrollWidth, W, out: out.slice(0, 6) }
      })
      const ok = r.sw <= r.W && !r.out.length; if (!ok) bad++
      console.log(`${w} ${sc}${sub ? '/' + sub : ''}: scrollWidth ${r.sw} / ${r.W} ${ok ? 'OK' : 'OVER ' + r.out.join(' | ')}`)
    }
    await p.close()
  }
}
await b.close(); console.log(bad ? `FAIL ${bad}` : 'ALL FIT')
