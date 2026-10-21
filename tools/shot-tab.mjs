// Screenshot one tab of the live game, optionally with a boosted save so
// late-game features are visible: node tools/shot-tab.mjs <file> <tab> [xpLevel]
import { chromium } from 'playwright'
const [file, tab, lvl] = process.argv.slice(2)
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); const p = await b.newPage({ viewport: { width: 1400, height: 1000 } })
// ACCOUNT=name:key signs the page in to a trade account (stage 11 shots).
if (process.env.ACCOUNT) { const [name, key] = process.env.ACCOUNT.split(':'); await p.addInitScript(([n, k]) => localStorage.setItem('ledgerworks-account', JSON.stringify({ name: n, key: k })), [name, key]) }
// REALM=seasons plays the seasons realm; TYPES=a,b,c overrides the sample campus; SEASON=n forces the save's season number.
// VIEW=2d forces the flat campus (DOM plots can then be clicked).
if (process.env.VIEW) await p.addInitScript(v => localStorage.setItem('ledgerworks-view', v), process.env.VIEW)
if (process.env.REALM) await p.addInitScript(r => localStorage.setItem('ledgerworks-realm', r), process.env.REALM)
await p.goto(process.env.URL || 'https://ledgerworks.parkercthomson.workers.dev/'); await p.waitForTimeout(5600) // let the 5 s autosave write a save
if (lvl) {
  await p.evaluate(([l, H, R, T, SN, JQ]) => {
    globalThis.__R = { generator: 'power', pump: 'water', orchard: 'apples', barnyard: 'eggs', kitchen: 'bread', sawmill: 'boards', pit: 'sand', well: 'crude', refinery: 'fuel', lab: 'rn_farm' }
    const k = R === 'seasons' ? 'ledgerworks-save-v1-seasons' : 'ledgerworks-save-v1', s = JSON.parse(localStorage.getItem(k))
    s.xp = Math.round(400 * Math.pow(l - 1, 1.7)) + 5; s.cash = 2_000_000
    for (const r of ['rn_farm', 'rn_tech', 'rn_energy']) s.stock[r + '|0'] = 500
    s.patents = { apples: 30, power: 60, chip: 5 }
    // A sample campus so the art is visible.
    const types = T ? T.split(',') : ['generator', 'pump', 'orchard', 'barnyard', 'market', 'kitchen', 'sawmill', 'pit', 'well', 'refinery', 'lab', 'outfitter']
    s.plots = s.plots.map((_, i) => i < types.length ? { uid: 900 + i, type: types[i], level: 1 + (i % 4) * 2, job: i % 3 ? { kind: 'make', res: 'power', qty: 1, q: 0, startH: s.hour - 1, endH: s.hour + 5 } : undefined } : null)
    s.stock['apples|1'] = 300; s.stock['crates|0'] = 400
    if (SN) s.season = Number(SN)
    // JOBQTY: bigger running jobs (so collect bubbles appear); shops get a sale running.
    if (H !== null) s.hour = H
    if (JQ) s.plots.forEach((b, i) => { if (!b) return
      if (b.type === 'market' || b.type === 'outfitter') b.job = { kind: 'sell', res: b.type === 'market' ? 'apples' : 'tshirt', qty: JQ, q: 1, price: 2.4, startH: s.hour - 1.5, endH: s.hour + 4 }
      else if (b.job) b.job = { kind: 'make', res: (globalThis.__R || {})[b.type] || 'power', qty: JQ, q: 1, startH: s.hour - 1 - (i % 3) * 0.3, endH: s.hour + 5 } })
    if (H !== null) s.hour = H; s.lastReal = Date.now()
    localStorage.setItem(k, JSON.stringify(s))
  }, [Number(lvl), process.env.HOUR ? Number(process.env.HOUR) : null, process.env.REALM || '', process.env.TYPES || '', process.env.SEASON || '', Number(process.env.JOBQTY || 0)])
  await p.reload(); await p.waitForTimeout(800)
}
if (tab) await p.getByRole('button', { name: tab, exact: true }).click({ force: true })
await p.waitForTimeout(400)
if (process.argv[5]) await p.locator('.plot, .tile').nth(Number(process.argv[5])).click({ force: true })
// FOCUS=plot,zoom[,turn]: centre the iso camera on one plot.
if (process.env.FOCUS) { await p.waitForTimeout(3500); const [i, z, t] = process.env.FOCUS.split(',').map(Number); await p.evaluate(([i, z, t]) => globalThis.__lwFocus?.(i, z, t || 0), [i, z, t]); await p.waitForTimeout(1500) }
// ZOOM=n: scroll-zoom the 3D camera in for a close-up; CLICK=x,y clicks the canvas.
if (process.env.ZOOM) { await p.waitForTimeout(4000); const c = await p.locator('.scene3d canvas').boundingBox(); await p.mouse.move(c.x + c.width * 0.55, c.y + c.height * 0.5); for (let i = 0; i < Number(process.env.ZOOM); i++) { await p.mouse.wheel(0, -200); await p.waitForTimeout(60) } }
if (process.env.CLICK) { const c = await p.locator('.scene3d canvas').boundingBox(); const [fx, fy] = process.env.CLICK.split(',').map(Number); await p.mouse.click(c.x + c.width * fx, c.y + c.height * fy) }
await p.waitForTimeout(Number(process.env.WAIT || 300))
// TAP=selector: tap it, then shoot mid-animation (fly-to-HUD).
if (process.env.TAP) { await p.locator(process.env.TAP).first().click(); await p.waitForTimeout(Number(process.env.TAPWAIT || 350)) }
await p.screenshot({ path: `/workspace/${file}`, fullPage: true })
await b.close()
