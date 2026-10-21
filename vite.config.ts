// Vite config for Ledgerworks.
// We bundle everything (JS, CSS, SVG art) into ONE index.html with
// vite-plugin-singlefile. That single file is then embedded in a tiny
// Cloudflare Worker (see tools/build-worker.mjs), so a deploy is one upload.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  test: { environment: 'node' },
} as any)
