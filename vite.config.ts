// Vite config for Ledgerworks.
// We bundle everything (JS, CSS, SVG art) into ONE index.html with
// vite-plugin-singlefile. That single file is then embedded in a tiny
// Cloudflare Worker (see tools/build-worker.mjs), so a deploy is one upload.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  // Build id baked into the page so /scene3d.js?v=... busts the cache per deploy.
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  test: { environment: 'node' },
} as any)
