# Ledgerworks

A browser business-sim: build production and retail buildings, make goods in
chains, and sell them to a simulated public. Inspired by the genre of online
company sims; all names, numbers, text and art are original.

## Develop
```
npm install
npm run dev      # local dev server
npm test         # vitest unit tests
```

## Deploy (Cloudflare Workers)
Pushes to `main` deploy automatically through GitHub Actions, which needs the
`CLOUDFLARE_API_TOKEN` repository secret. The manual steps below still work.

The build bundles the whole game into one HTML file and wraps it in a Worker
(`dist/worker.js`).
```
npm run build
CLOUDFLARE_API_TOKEN=... npx wrangler deploy
```
Alternatively upload `dist/worker.js` as an ES-module Worker named
`ledgerworks` via the Cloudflare API and enable its workers.dev route.
