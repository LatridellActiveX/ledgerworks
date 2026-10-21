// Screenshot the live Exchange tab after buying seeds and listing some.
import { chromium } from 'playwright'
const N = process.argv[2] || '5'
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 1000 } })
await p.goto('https://ledgerworks.parkercthomson.workers.dev/'); await p.waitForTimeout(800)
await p.getByRole('button', { name: 'Exchange' }).click({ force: true })
await p.locator('.ex select').first().selectOption('crates'); await p.locator('.ex input').first().fill('200')
await p.getByRole('button', { name: /^Buy for/ }).click({ force: true })
await p.locator('.ex select').first().selectOption('seeds'); await p.locator('.ex input').first().fill('300')
await p.getByRole('button', { name: /^Buy for/ }).click({ force: true })
await p.locator('.ex .card').nth(1).locator('input').first().fill('100')
await p.getByRole('button', { name: 'List on exchange' }).click({ force: true }); await p.waitForTimeout(400)
await p.screenshot({ path: `/workspace/ledgerworks-s${N}-exchange.png`, fullPage: true })
console.log(await p.locator('.toast').count() ? await p.locator('.toast').innerText() : 'ok', await p.locator('header').innerText())
await b.close()
