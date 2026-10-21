import { chromium } from 'playwright'
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 950 } })
await p.addInitScript(() => { globalThis.__lwNoBoot = true }) // skip the boot screen
const URL = 'https://ledgerworks.parkercthomson.workers.dev/'
await p.goto(URL); await p.waitForTimeout(800)
await p.screenshot({ path: '/workspace/ledgerworks-1-new.png' })
// Build windmill on plot 1, orchard plot 2, market plot 3
const build = async (i, name) => { await p.locator('.plot').nth(i).click(); await p.getByRole('button', { name: new RegExp(name) }).first().click() }
await build(0, 'Windmill'); await build(1, 'Pump house'); await build(2, 'Orchard'); await build(3, 'Corner market')
await p.locator('.plot').nth(2).click(); await p.screenshot({ path: '/workspace/ledgerworks-2-building.png' })
// Rush construction, start production on orchard after buying inputs
for (const i of [0,1,2,3]) { await p.locator('.plot').nth(i).click(); const r = p.getByRole('button', { name: /Rush/ }); if (await r.count()) await r.click() }
await p.locator('.wh select').selectOption('seeds'); await p.locator('.wh input').fill('200'); await p.getByRole('button', { name: /Buy for/ }).click()
await p.locator('.wh select').selectOption('water'); await p.locator('.wh input').fill('400'); await p.getByRole('button', { name: /Buy for/ }).click()
await p.locator('.plot').nth(2).click(); await p.locator('.panel select').first().selectOption('apples'); await p.getByRole('button', { name: 'Start production' }).click()
await p.locator('.plot').nth(0).click(); await p.getByRole('button', { name: 'Start production' }).click()
await p.locator('.plot').nth(2).click(); await p.screenshot({ path: '/workspace/ledgerworks-3-production.png' })
await p.getByRole('button', { name: /Rush/ }).click()
await p.locator('.plot').nth(3).click(); await p.waitForTimeout(300)
await p.screenshot({ path: '/workspace/ledgerworks-4-shop.png' })
await p.getByRole('button', { name: 'Start selling' }).click()
await p.getByRole('button', { name: 'Public demand' }).click(); await p.waitForTimeout(300)
await p.screenshot({ path: '/workspace/ledgerworks-5-selling-demand.png', fullPage: true })
console.log(await p.locator('.toast').count() ? await p.locator('.toast').innerText() : 'no toast')
await b.close()
