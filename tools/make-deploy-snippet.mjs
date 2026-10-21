// Builds dist/deploy-snippet.js: an async arrow function for the Cloudflare
// API "execute" helper. It uploads dist/worker.js as the `ledgerworks` Worker
// with its bindings (D1 saves DB + SQLite-backed MarketDO), applies the
// Durable Object migration once, sets the 15-minute cron, and makes sure the
// workers.dev URL is on. Used when no wrangler API token is on the box.
import { readFileSync, writeFileSync } from 'node:fs'
const D1_ID = 'f908ad9d-1a54-4718-999e-c9d4fc1ac769' // database "ledgerworks"
const src = readFileSync('dist/worker.js', 'utf8')
const snippet = `async () => {
  const code = ${JSON.stringify(src)};
  const base = '/accounts/' + accountId + '/workers/scripts/ledgerworks';
  // Has the DO class been created already? (migration tag on the live script)
  let tag = null;
  try { const s = await cloudflare.request({ method: 'GET', path: base + '/settings' }); tag = s.result && s.result.migration_tag; } catch (e) {}
  const meta = {
    main_module: 'worker.js', compatibility_date: '2026-01-01',
    bindings: [
      { type: 'd1', name: 'DB', id: '${D1_ID}' },
      { type: 'durable_object_namespace', name: 'MARKET', class_name: 'MarketDO' },
    ],
  };
  if (tag !== 'v1') meta.migrations = { new_tag: 'v1', steps: [{ new_sqlite_classes: ['MarketDO'] }] };
  // Upload; if the DO migration was already applied (tag mismatch), retry without it.
  const send = async () => {
  const b = 'LW' + Date.now();
  const body = ['--'+b,'Content-Disposition: form-data; name="metadata"','Content-Type: application/json','',JSON.stringify(meta),
    '--'+b,'Content-Disposition: form-data; name="worker.js"; filename="worker.js"','Content-Type: application/javascript+module','',code,'--'+b+'--'].join('\\r\\n');
  return cloudflare.request({ method:'PUT', path: base, body, contentType:'multipart/form-data; boundary='+b, rawBody:true });
  };
  let up;
  try { up = await send(); } catch (e) {
    if (!String(e).includes('migration tag')) throw e;
    delete meta.migrations; up = await send();
  }
  await cloudflare.request({ method:'PUT', path: base + '/schedules', body: [{ cron: '*/15 * * * *' }] });
  await cloudflare.request({ method:'POST', path: base + '/subdomain', body:{ enabled:true } });
  return { ok: up.success, hadTag: tag };
}`
writeFileSync('dist/deploy-snippet.js', snippet)
