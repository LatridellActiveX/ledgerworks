// Bundles the lazy 3D campus (src/scene3d + three.js) into dist/scene3d.js.
import { build } from 'esbuild'
import { statSync } from 'node:fs'
await build({ entryPoints: ['src/scene3d/index.ts'], bundle: true, format: 'esm', target: 'es2020', minify: true, outfile: 'dist/scene3d.js', legalComments: 'none' })
console.log('dist/scene3d.js', (statSync('dist/scene3d.js').size / 1024).toFixed(0), 'KB')
