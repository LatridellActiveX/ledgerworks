// Screenshot one tab of the live game, optionally with a boosted save so
// late-game features are visible: node tools/shot-tab.mjs <file> <tab> [xpLevel]
import { chromium } from 'playwright'
const [file, tab, lvl] = process.argv.slice(2)
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 1000 } })
await p.goto(process.env.URL || 'https://ledgerworks.parkercthomson.workers.dev/'); await p.waitForTimeout(5600) // let the 5 s autosave write a save
if (lvl) {
  await p.evaluate(l => {
    const k = 'ledgerworks-save-v1', s = JSON.parse(localStorage.getItem(k))
    s.xp = Math.round(400 * Math.pow(l - 1, 1.7)) + 5; s.cash = 2_000_000
    for (const r of ['rn_farm', 'rn_tech', 'rn_energy']) s.stock[r + '|0'] = 500
    s.patents = { apples: 30, power: 60, chip: 5 }
    // A sample campus so the art is visible.
    const types = ['generator', 'pump', 'orchard', 'barnyard', 'market', 'kitchen', 'sawmill', 'pit', 'well', 'refinery', 'lab', 'outfitter']
    s.plots = s.plots.map((_, i) => i < types.length ? { uid: 900 + i, type: types[i], level: 1 + (i % 4) * 2, job: i % 3 ? { kind: 'make', res: 'power', qty: 1, q: 0, startH: s.hour - 1, endH: s.hour + 5 } : undefined } : null)
    s.stock['apples|1'] = 300; s.stock['crates|0'] = 400
    localStorage.setItem(k, JSON.stringify(s))
  }, Number(lvl))
  await p.reload(); await p.waitForTimeout(800)
}
if (tab) await p.getByRole('button', { name: tab, exact: true }).click({ force: true })
await p.waitForTimeout(400)
if (process.argv[5]) await p.locator('.plot, .tile').nth(Number(process.argv[5])).click({ force: true })
await p.waitForTimeout(300)
await p.screenshot({ path: `/workspace/${file}`, fullPage: true })
await b.close()
