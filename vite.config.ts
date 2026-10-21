// Vite config for Ledgerworks.
// We bundle everything (JS, CSS, SVG art) into ONE index.html with
// vite-plugin-singlefile. That single file is then embedded in a tiny
// Cloudflare Worker (see tools/build-worker.mjs), so a deploy is one upload.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'

// Real library versions for the boot screen: read from each installed
// package's own package.json (what actually ships), never typed by hand.
const ver = (pkg: string) => JSON.parse(readFileSync(`node_modules/${pkg}/package.json`, 'utf8')).version as string
const LIBS = { react: ver('react'), 'react-dom': ver('react-dom'), three: ver('three'), app: JSON.parse(readFileSync('package.json', 'utf8')).version as string }

// One id per build. Baked into the page (cache-busting + update check) and
// written to dist/build-id.txt so the Worker serves the SAME id from
// /version.json; the page compares the two to spot a new deploy.
const BUILD_ID = Date.now().toString(36)

export default defineConfig({
  plugins: [react(), viteSingleFile(), { name: 'build-id', closeBundle() { mkdirSync('dist', { recursive: true }); writeFileSync('dist/build-id.txt', BUILD_ID) } }],
  // Build id baked into the page so /scene3d.js?v=... busts the cache per deploy.
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID), __LIBS__: JSON.stringify(LIBS) },
  test: { environment: 'node' },
} as any)
