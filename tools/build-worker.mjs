// Bundles worker/index.ts (plus the shared game modules it imports) into
// dist/worker.js with esbuild, injecting dist/index.html as a string.
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'

const html = readFileSync('dist/index.html', 'utf8')
await build({
  entryPoints: ['worker/index.ts'], bundle: true, format: 'esm', target: 'es2022',
  outfile: 'dist/worker.js', minify: false,
  define: { __HTML__: JSON.stringify(html), __BUILD__: JSON.stringify(new Date().toISOString()) },
})
console.log('dist/worker.js', (readFileSync('dist/worker.js').length / 1024).toFixed(1), 'KB')
