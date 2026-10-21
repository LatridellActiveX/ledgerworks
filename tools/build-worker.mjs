// Bundles worker/index.ts (plus the shared game modules it imports) into
// dist/worker.js with esbuild, injecting dist/index.html as a string.
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'

const html = readFileSync('dist/index.html', 'utf8')
// The lazily loaded 3D campus bundle (built by tools/build-scene.mjs).
const scene = readFileSync('dist/scene3d.js', 'utf8')
// Same build id the page was built with (vite.config.ts writes it).
const buildId = readFileSync('dist/build-id.txt', 'utf8').trim()
// Static icons + manifest from public/, embedded as base64 with their content types.
const TYPES = { svg: 'image/svg+xml', png: 'image/png', ico: 'image/x-icon', webmanifest: 'application/manifest+json' }
const assets = {}
for (const f of ['favicon.svg', 'favicon-32.png', 'favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'manifest.webmanifest'])
  assets['/' + f] = { type: TYPES[f.split('.').pop()], b64: readFileSync('public/' + f).toString('base64') }
await build({
  entryPoints: ['worker/index.ts'], bundle: true, format: 'esm', target: 'es2022',
  outfile: 'dist/worker.js', minify: false,
  define: { __HTML__: JSON.stringify(html), __SCENE__: JSON.stringify(scene), __BUILD__: JSON.stringify(new Date().toISOString()), __BUILD_ID__: JSON.stringify(buildId), __ASSETS__: JSON.stringify(assets) },
})
console.log('dist/worker.js', (readFileSync('dist/worker.js').length / 1024).toFixed(1), 'KB')
