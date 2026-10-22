// Phone shot of the 3D map with the save clock at 23:00 (would have been night).
import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
await p.addInitScript(() => { globalThis.__lwNoBoot = true; localStorage.setItem('ledgerworks-guest', '1'); localStorage.setItem('ledgerworks-tutorial', JSON.stringify({ step: 0, done: true, off: false })) })
await p.goto('https://ledgerworks.parkercthomson.workers.dev/'); await p.waitForTimeout(5600)
await p.evaluate(() => { const k = 'ledgerworks-save-v1', s = JSON.parse(localStorage.getItem(k)); s.hour = Math.floor(s.hour / 24) * 24 + 47; s.lastReal = Date.now(); localStorage.setItem(k, JSON.stringify(s)) })
await p.reload(); await p.waitForTimeout(6000)
console.log(await p.locator('.hud-info').innerText())
await p.screenshot({ path: '/workspace/ledgerworks-no-night.png' }); await b.close()
