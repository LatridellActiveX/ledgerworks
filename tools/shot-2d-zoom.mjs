// Check: zooming the 2D map leaves the HUD untouched. Usage: node tools/shot-2d-zoom.mjs <url> <out.png>
import { chromium } from 'playwright'
const [url = 'http://localhost:8799', out = '/workspace/ledgerworks-2d-zoom.png'] = process.argv.slice(2)
const b = await chromium.launch()
const hud = p => p.evaluate(() => ['.hud-btn.burger', '.tabbar'].map(s => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? [s, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(' ') : s + ' missing' }).join(' | '))
const layer = p => p.evaluate(() => document.querySelector('.map-layer')?.style.transform ?? 'none')
for (const [w, h, touch] of [[390, 844, true], [1280, 800, false]]) {
  const c = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch })
  await c.addInitScript(() => { window.__lwNoBoot = true; localStorage.setItem('ledgerworks-guest', '1'); localStorage.setItem('ledgerworks-view', '2d'); localStorage.setItem('ledgerworks-tutorial-v2', JSON.stringify({ step: 0, done: true, off: true, tips: [], goals: [] })) })
  const p = await c.newPage(); await p.goto(url); await p.waitForSelector('.map-layer svg.campus', { timeout: 20000 })
  const before = await hud(p)
  await p.mouse.move(w / 2, h / 2)
  for (let i = 0; i < 6; i++) await p.mouse.wheel(0, -200)
  await p.keyboard.down('Control'); await p.mouse.wheel(0, -40); await p.keyboard.up('Control')
  await p.waitForTimeout(300)
  const zin = await hud(p), tin = await layer(p), dpr = await p.evaluate(() => visualViewport.scale)
  if (touch) await p.screenshot({ path: out })
  for (let i = 0; i < 20; i++) await p.mouse.wheel(0, 300)
  await p.waitForTimeout(200)
  console.log(`${w}x${h}\n before ${before}\n zoomIn ${zin} layer=${tin} pageScale=${dpr}\n zoomOut ${await hud(p)} layer=${await layer(p)}`)
  await c.close()
}
await b.close()
