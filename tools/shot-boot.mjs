// Screenshot the boot screen mid-load: node tools/shot-boot.mjs <file> [ms]
// Also checks it fades out into the map (prints BOOTGONE true/false).
import { chromium } from 'playwright'
const [file, ms] = process.argv.slice(2)
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
await p.addInitScript(() => { localStorage.setItem('ledgerworks-guest', '1'); localStorage.setItem('ledgerworks-tutorial', JSON.stringify({ step: 0, done: true, off: false })) })
const t0 = Date.now()
await p.goto(process.env.URL || 'http://localhost:4173', { waitUntil: 'domcontentloaded' })
await p.waitForSelector('.boot')
await p.waitForTimeout(Number(ms || 2200))
await p.screenshot({ path: `/workspace/${file}` })
await p.waitForSelector('.boot', { state: 'detached', timeout: 30000 })
console.log('BOOTGONE true after', Date.now() - t0, 'ms')
await b.close()
