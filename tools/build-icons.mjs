// Renders icons/icon.svg to the PNG sizes the site and Android/iOS need,
// using headless Chromium (already used for screenshots). Output: public/.
//   favicon.svg (copy), favicon-32.png, favicon.ico (PNG-in-ICO, 32px),
//   apple-touch-icon.png (180), icon-192.png, icon-512.png,
//   icon-maskable-512.png (art scaled to 80% inside the 40% safe zone, full bleed bg).
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
const svg = readFileSync('icons/icon.svg', 'utf8')
copyFileSync('icons/icon.svg', 'public/favicon.svg')
// Maskable: square full-bleed background (no rounded corners), art shrunk to the safe zone.
const mask = svg.replace('<rect width="512" height="512" rx="112"', '<rect width="512" height="512"')
  .replace('<g id="art"', '<g id="art" transform="translate(51 51) scale(.8)"')
const b = await chromium.launch(); const p = await b.newPage()
async function png(src, size, out) {
  await p.setViewportSize({ width: size, height: size })
  await p.setContent(`<html><body style="margin:0;background:transparent">${src.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`)
  const buf = await p.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
  writeFileSync(out, buf); return buf
}
const p32 = await png(svg, 32, 'public/favicon-32.png')
await png(svg, 180, 'public/apple-touch-icon.png')
await png(svg, 192, 'public/icon-192.png')
await png(svg, 512, 'public/icon-512.png')
await png(mask, 512, 'public/icon-maskable-512.png')
await png(svg, 512, '/workspace/ledgerworks-icon.png')
// ICO container holding one 32x32 PNG image (supported by all modern browsers).
const head = Buffer.alloc(22); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4)
head.writeUInt8(32, 6); head.writeUInt8(32, 7); head.writeUInt8(0, 8); head.writeUInt8(0, 9); head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12)
head.writeUInt32LE(p32.length, 14); head.writeUInt32LE(22, 18)
writeFileSync('public/favicon.ico', Buffer.concat([head, p32]))
await b.close(); console.log('icons ok')
